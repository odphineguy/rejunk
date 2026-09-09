-- Security audit item 7 (2026-09-08): durable office PIN lockout.
--
-- Office login (POST /api/staff, action "login") previously throttled wrong
-- PINs only in the server process's memory — on Vercel that resets on every
-- cold start and never spans instances, so a 4-digit PIN was brute-forceable.
-- Same fix as drivers got in 20260906000002: count misses on the staff row and
-- lock it for 15 minutes after 5, enforced server-side with the service-role
-- key. The browser never reads these columns (staff has no client policies).
alter table public.staff
  add column if not exists failed_attempts integer not null default 0,
  add column if not exists locked_until timestamptz;
