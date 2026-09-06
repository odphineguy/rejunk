-- Security audit 2026-09-05, item 2 — driver credentials move server-side.
-- Apply to rejunk-prod (iozmgsopcyezkntnqbgj) via the Supabase MCP / SQL editor.
--
-- Before: any anonymous session could SELECT activation keys, PIN hashes and
-- live session tokens from driver_activations / driver_sessions, and
-- INSERT/UPDATE both tables — i.e. steal or forge a driver identity. After:
--   * keys and session tokens are stored only as SHA-256 hashes
--     (server/driverAccess.ts is the only writer);
--   * pin_hash / activation_key_hash / session_token_hash are hidden from the
--     browser by column-level grants;
--   * the browser may only READ activation status, READ session status, and
--     UPDATE the live-location / workday columns of a session. No inserts.
--   * failed_attempts / locked_until make the PIN lockout durable.
-- Also wipes the test drivers (Abe, 2026-09-06: "they are not real drivers").
--
-- Residual (needs the identity overhaul, audit item 5): an anonymous session
-- can still UPDATE another driver's location/workday columns and INSERT
-- driver_location_history rows, because RLS cannot yet tell drivers apart.

-- 1) Test data out. Dispatch chat threads/messages are left alone.
delete from public.driver_location_history;
delete from public.driver_sessions;
delete from public.driver_activations;

-- 2) Schema: hashes instead of secrets, durable lockout, has_token flag.
alter table public.driver_activations
  drop column if exists activation_key,
  drop column if exists session_token,
  add column if not exists activation_key_hash text,
  add column if not exists failed_attempts integer not null default 0,
  add column if not exists locked_until timestamptz;
create unique index if not exists driver_activations_key_hash_idx
  on public.driver_activations (activation_key_hash);

alter table public.driver_sessions
  drop column if exists session_token,
  add column if not exists session_token_hash text,
  add column if not exists has_token boolean generated always as (session_token_hash is not null) stored;
create index if not exists driver_sessions_token_hash_idx
  on public.driver_sessions (session_token_hash);

-- 3) Policies: no browser inserts anywhere, no browser updates on activations.
drop policy if exists "driver activations writable by authenticated"  on public.driver_activations;
drop policy if exists "driver activations updatable by authenticated" on public.driver_activations;
drop policy if exists "driver sessions writable by authenticated"     on public.driver_sessions;
-- kept: "driver activations readable by authenticated" (SELECT, narrowed by
-- column grants below), "driver sessions readable by authenticated" (SELECT),
-- "driver sessions updatable by authenticated" (UPDATE, narrowed below).

-- 4) Column-level grants. Table-level grants are replaced by explicit column
-- lists so the secret columns are simply not selectable/updatable.
revoke all on public.driver_activations from anon, authenticated;
grant select (id, employee_id, employee_name, email_sent_to, status, expires_at,
              activated_at, created_by, created_at)
  on public.driver_activations to authenticated;

revoke all on public.driver_sessions from anon, authenticated;
grant select (id, employee_id, activation_id, display_name, last_seen_at, last_lat,
              last_lng, last_heading, is_online, created_at, meal_break_started_at,
              downtime_started_at, downtime_vehicle_id, downtime_reason, has_token)
  on public.driver_sessions to authenticated;
grant update (last_lat, last_lng, last_heading, last_seen_at, is_online,
              meal_break_started_at, downtime_started_at, downtime_vehicle_id,
              downtime_reason)
  on public.driver_sessions to authenticated;
