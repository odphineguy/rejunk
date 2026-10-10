-- MCP connector Phase 3: a narrow, read-only way in for approved AI apps.
--
-- Since 20261009061816 an AI app's pass (Claude / ChatGPT, issued by the
-- /oauth/consent approve page) sees nothing: every table rule needs a PIN
-- unlock bound to the caller's own session, and an AI pass never has one.
-- That stays true. No table rule changes here.
--
-- Instead an AI pass may read ONLY through dedicated mcp_* functions, each
-- filtering by app_private.ai_reader(). It answers (company, role) only when:
--   1. the token carries a client_id claim (issued through the approve page),
--   2. its session still exists AND that session was created for that same
--      app (auth.sessions.oauth_client_id = client_id),
--   3. the app's approval is live (consent not revoked, app not deleted),
--   4. the person holds exactly one owner/office membership (memberships follow
--      the staff table via staff_membership_sync, so a deactivated login loses
--      it). Two or more companies -> nothing; a company picker on the approve
--      page is a logged follow-up.
--
-- Audience: Supabase passes carry aud "authenticated" even when the AI sends
-- resource=<our MCP URL>, and the approval row holding `resource` is deleted
-- once the code is exchanged (probe 2026-10-09). Known Issue in
-- PLAN-mcp-connector.md; rule 2 is the binding we can enforce today.
--
-- Also: bind_business_identity refuses AI passes, so an AI pass can never
-- become a full office login, even holding a valid staff token.
--
-- Undo: supabase/undo/20261010030000_ai_reader_undo.sql
begin;

create function app_private.ai_reader()
returns table (company uuid, role text)
language sql
stable
security definer
set search_path = ''
as $$
  with pass as (
    select auth.uid() as uid,
           nullif(auth.jwt() ->> 'client_id', '') as client_id,
           app_private.jwt_session() as session_id
  ),
  approved as (
    select p.uid from pass p
     where p.uid is not null and p.client_id is not null
       and exists (select 1 from auth.sessions s
                    where s.id = p.session_id and s.user_id = p.uid
                      and s.oauth_client_id::text = p.client_id
                      and (s.not_after is null or s.not_after > now()))
       and exists (select 1 from auth.oauth_consents c
                    join auth.oauth_clients oc on oc.id = c.client_id
                   where c.user_id = p.uid and c.client_id::text = p.client_id
                     and c.revoked_at is null and oc.deleted_at is null)
  ),
  member as (
    select m.tenant_id, m.role from public.memberships m
      join approved a on a.uid = m.user_id
     where m.role in ('owner', 'office')
  )
  select tenant_id, role from member where (select count(*) from member) = 1;
$$;
revoke all on function app_private.ai_reader() from public, anon, authenticated;

-- Phase 3's only AI read: who am I, and how many jobs does my company have.
create function public.mcp_whoami()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare reader record;
begin
  select * into reader from app_private.ai_reader();
  if reader.company is null then
    raise exception 'AI access not approved' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'company', jsonb_build_object('name', c.name, 'slug', c.slug),
      'role', reader.role,
      'jobs', (select count(*) from public.jobs j where j.tenant_id = reader.company))
      from public.companies c where c.id = reader.company);
end $$;
revoke all on function public.mcp_whoami() from public, anon;
grant execute on function public.mcp_whoami() to authenticated;

-- AI passes can never unlock full office/driver access.
create or replace function public.bind_business_identity(staff_token text default null::text, driver_token text default null::text)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare driver_id uuid; token_hash text; sess uuid := app_private.jwt_session();
begin
  if auth.uid() is null or sess is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if nullif(auth.jwt() ->> 'client_id', '') is not null then
    raise exception 'AI apps cannot unlock business data' using errcode='42501';
  end if;
  if staff_token is not null and driver_token is not null then
    raise exception 'Choose one identity' using errcode='22023';
  end if;
  if staff_token is not null and length(staff_token) between 32 and 256 then
    if exists(select 1 from public.staff_sessions ss join public.staff s on s.id=ss.staff_id
      where ss.token=staff_token and ss.expires_at>now() and s.active and s.role in ('owner','office')
        and (ss.auth_user_id is null or ss.auth_user_id=auth.uid())) then
      insert into app_private.identity_session_bindings(auth_user_id,session_id,staff_token,driver_session_id,driver_token_hash)
      values(auth.uid(),sess,staff_token,null,null)
      on conflict(auth_user_id,session_id) do update set staff_token=excluded.staff_token,driver_session_id=null,driver_token_hash=null;
      return true;
    end if;
  elsif driver_token is not null and length(driver_token) between 32 and 256 then
    token_hash := encode(extensions.digest(driver_token,'sha256'),'hex');
    select ds.id into driver_id from public.driver_sessions ds
      join public.driver_activations da on da.id=ds.activation_id
      where ds.session_token_hash=token_hash and da.status='activated' and da.employee_id=ds.employee_id;
    if driver_id is not null then
      insert into app_private.identity_session_bindings(auth_user_id,session_id,staff_token,driver_session_id,driver_token_hash)
      values(auth.uid(),sess,null,driver_id,token_hash)
      on conflict(auth_user_id,session_id) do update set staff_token=null,driver_session_id=excluded.driver_session_id,driver_token_hash=excluded.driver_token_hash;
      return true;
    end if;
  end if;
  delete from app_private.identity_session_bindings where auth_user_id=auth.uid() and session_id=sess;
  return false;
end;
$function$;

commit;
