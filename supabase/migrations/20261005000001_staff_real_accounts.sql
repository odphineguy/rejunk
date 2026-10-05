-- MCP connector Phase 1b: office staff get REAL Supabase Auth accounts.
-- New device: email → 6-digit code (proves the inbox) → PIN. The code is minted
-- server-side with auth.admin.generateLink and mailed through Resend; the
-- browser redeems it with verifyOtp, which replaces the anonymous transport
-- session with the staffer's real auth user. The PIN still mints the opaque
-- staff_sessions token that bind_business_identity checks, so database access
-- stays gated by the PIN exactly as before.
--
-- Additive: legacy staff sessions (auth_user_id null, bound to anonymous users)
-- keep working until the planned cutover migration removes them.
begin;

alter table public.staff
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists code_sent_at timestamptz;

-- Which real account a session token belongs to. Null = legacy anonymous login.
alter table public.staff_sessions
  add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;

-- A token minted for a real account can only be bound by that same account.
create or replace function public.bind_business_identity(staff_token text default null, driver_token text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
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
  -- Invalid/revoked credentials also discard any previous binding.
  delete from app_private.identity_bindings where auth_user_id=auth.uid();
  return false;
end;
$$;
revoke all on function public.bind_business_identity(text,text) from public,anon;
grant execute on function public.bind_business_identity(text,text) to authenticated;

create or replace function app_private.staff_role() returns text language sql stable security definer set search_path='' as $$
  select s.role from app_private.identity_bindings b
  join public.staff_sessions ss on ss.token=b.staff_token
  join public.staff s on s.id=ss.staff_id
  where b.auth_user_id=auth.uid() and ss.expires_at>now() and s.active and s.role in ('owner','office')
    and (ss.auth_user_id is null or ss.auth_user_id=b.auth_user_id);
$$;

commit;
