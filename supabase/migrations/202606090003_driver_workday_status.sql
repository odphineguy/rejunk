-- Driver workday status: meal break + vehicle downtime on the live session row.
-- Standalone and additive — only touches driver_sessions (applied live via
-- 202606090001), no dependency on the unapplied 202606070001-3 migrations.
-- driver_sessions is already in the supabase_realtime publication, so dispatch
-- sees these fields change live with no new subscriptions.
--
-- The new `paused` driver job status needs no DB change: jobs.status is
-- unconstrained text (see 0004_jobs_snapshot).

alter table public.driver_sessions
  add column if not exists meal_break_started_at timestamptz,
  add column if not exists downtime_started_at timestamptz,
  add column if not exists downtime_vehicle_id text,
  add column if not exists downtime_reason text;
