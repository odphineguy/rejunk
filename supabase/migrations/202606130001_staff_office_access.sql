-- Office access roles + RLS lockdown for the staff ("office login") table.
--
-- Builds on 202606100003_staff_auth.sql. Adds a restricted non-owner role,
-- links a login back to its Employees-roster record, and CLOSES a security
-- hole: the original policies let ANY anonymous visitor read every pin_hash
-- and insert/modify staff rows (i.e. self-provision an owner login). After
-- this, the browser has NO direct access to the staff table — all staff
-- reads/writes go through server endpoints using the service-role key (which
-- bypasses RLS). See server/staffAccess.ts + api/staff/*.
--
-- Apply to TEST (nglmgglrexxumjndhyzo) first, then PROD (iozmgsopcyezkntnqbgj).

-- 1) Allow the new 'office' role (restricted, non-owner) alongside existing values.
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff
  add constraint staff_role_check check (role in ('owner', 'office', 'dispatcher'));

-- 2) Link a staff login to its Employees-roster record (nullable — Abe/Sam
--    predate this) and flag temp-PIN accounts so the app can nudge a change.
alter table public.staff add column if not exists employee_id text;
alter table public.staff add column if not exists must_change_pin boolean not null default false;

-- 3) Lock down access. RLS stays enabled; dropping every policy leaves no path
--    for the anonymous client to reach this table at all.
drop policy if exists "staff readable by authenticated" on public.staff;
drop policy if exists "staff writable by authenticated" on public.staff;
drop policy if exists "staff updatable by authenticated" on public.staff;
