-- "Unlocked" belongs to the sign-in that entered the PIN, not the whole account.
--
-- Until now app_private.identity_bindings held ONE row per auth user. Any other
-- token for the same account -- an AI app's OAuth pass, or a second device that
-- only did the email code -- inherited the PIN binding and got full access.
-- Every Supabase access token carries a session_id claim (an OAuth pass gets its
-- own session), so bindings are now keyed by (user, session).
--
-- The six readers (staff_role, caller_company, driver_session, reserve_dashboard,
-- office_save_estimate, owner_set_job_time) are untouched: identity_bindings
-- becomes a view that only shows the caller's current session. Only the writer,
-- bind_business_identity, changes. Existing rows can't be tied to a session, so
-- they are cleared; each device re-binds on its next page load.
-- Undo: supabase/undo/20261009061816_bind_per_session_undo.sql

create function app_private.jwt_session()
returns uuid
language sql
stable
set search_path to ''
as $$ select nullif(auth.jwt() ->> 'session_id', '')::uuid $$;

revoke all on function app_private.jwt_session() from public, anon, authenticated;

alter table app_private.identity_bindings rename to identity_session_bindings;

delete from app_private.identity_session_bindings;

alter table app_private.identity_session_bindings
  add column session_id uuid not null references auth.sessions(id) on delete cascade;

alter table app_private.identity_session_bindings drop constraint identity_bindings_pkey;
alter table app_private.identity_session_bindings
  add constraint identity_session_bindings_pkey primary key (auth_user_id, session_id);

create view app_private.identity_bindings with (security_barrier) as
  select auth_user_id, staff_token, driver_session_id, driver_token_hash
  from app_private.identity_session_bindings
  where session_id = app_private.jwt_session();

revoke all on app_private.identity_bindings from public, anon, authenticated;

create or replace function public.bind_business_identity(staff_token text default null::text, driver_token text default null::text)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare driver_id uuid; token_hash text; sess uuid := app_private.jwt_session();
begin
  if auth.uid() is null or sess is null then raise exception 'Authentication required' using errcode='42501'; end if;
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
