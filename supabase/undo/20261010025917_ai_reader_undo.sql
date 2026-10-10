-- Undo 20261010025917_ai_reader: AI passes lose their read-only way in
-- (back to seeing nothing), and bind_business_identity returns to its
-- 20261009061816 body.
begin;

drop function public.mcp_whoami();
drop function app_private.ai_reader();

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

commit;
