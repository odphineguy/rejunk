-- Undo 20261009061816_bind_per_session: back to one binding per auth user.
-- Rows can't be reduced to one per user safely, so all are cleared; each device
-- re-binds on its next page load.

drop view app_private.identity_bindings;

delete from app_private.identity_session_bindings;

alter table app_private.identity_session_bindings drop constraint identity_session_bindings_pkey;
alter table app_private.identity_session_bindings drop column session_id;
alter table app_private.identity_session_bindings
  add constraint identity_bindings_pkey primary key (auth_user_id);

alter table app_private.identity_session_bindings rename to identity_bindings;

create or replace function public.bind_business_identity(staff_token text default null::text, driver_token text default null::text)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare driver_id uuid; token_hash text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if staff_token is not null and driver_token is not null then
    raise exception 'Choose one identity' using errcode='22023';
  end if;
  if staff_token is not null and length(staff_token) between 32 and 256 then
    if exists(select 1 from public.staff_sessions ss join public.staff s on s.id=ss.staff_id
      where ss.token=staff_token and ss.expires_at>now() and s.active and s.role in ('owner','office')
        and (ss.auth_user_id is null or ss.auth_user_id=auth.uid())) then
      insert into app_private.identity_bindings values(auth.uid(),staff_token,null,null)
      on conflict(auth_user_id) do update set staff_token=excluded.staff_token,driver_session_id=null,driver_token_hash=null;
      return true;
    end if;
  elsif driver_token is not null and length(driver_token) between 32 and 256 then
    token_hash := encode(extensions.digest(driver_token,'sha256'),'hex');
    select ds.id into driver_id from public.driver_sessions ds
      join public.driver_activations da on da.id=ds.activation_id
      where ds.session_token_hash=token_hash and da.status='activated' and da.employee_id=ds.employee_id;
    if driver_id is not null then
      insert into app_private.identity_bindings values(auth.uid(),null,driver_id,token_hash)
      on conflict(auth_user_id) do update set staff_token=null,driver_session_id=excluded.driver_session_id,driver_token_hash=excluded.driver_token_hash;
      return true;
    end if;
  end if;
  delete from app_private.identity_bindings where auth_user_id=auth.uid();
  return false;
end;
$function$;

drop function app_private.jwt_session();
