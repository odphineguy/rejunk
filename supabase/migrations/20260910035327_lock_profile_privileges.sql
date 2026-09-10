-- Audit item 3: profile roles are server-managed, never visitor-managed.
-- Applied to rejunk-prod on 2026-09-10 UTC. This does not close the broader permissive
-- business-table policies (audit items 1/4), or change staff/driver login.
begin;

drop policy if exists "users insert own profile" on public.profiles;
drop policy if exists "users update own profile or manager updates any" on public.profiles;

revoke insert, update, delete, truncate, references, trigger
  on public.profiles from public, anon, authenticated;
-- Table revokes do not remove separately granted column privileges.
do $$
declare column_names text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum)
    into column_names from pg_attribute
    where attrelid = 'public.profiles'::regclass
      and attnum > 0 and not attisdropped;
  execute format(
    'revoke insert (%1$s), update (%1$s), references (%1$s) on public.profiles from public, anon, authenticated',
    column_names
  );
end;
$$;

-- Profile creation still runs through the auth trigger, with a safe default.
-- Provision privileged roles explicitly through a trusted server/administrator.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email), 'crew');
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Previously promoted anonymous accounts must not retain manager powers.
-- Read the server-owned auth record, not caller-editable user metadata.
create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid() and p.role in ('owner', 'admin')
      and p.is_active and u.is_anonymous is false
  );
$$;
revoke execute on function public.is_manager() from public, anon;
grant execute on function public.is_manager() to authenticated;

commit;
