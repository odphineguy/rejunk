-- Server-side session tokens for office (staff) logins.
--
-- Mirrors driver_sessions. The browser no longer talks to the staff table
-- directly (202606130001 locked it down); instead it logs in through a server
-- endpoint that verifies the PIN with the service-role key and hands back an
-- opaque token stored here. Privileged actions (grant/revoke office access)
-- require a token that resolves to an ACTIVE OWNER — so the API can't be used
-- to self-provision an account any more than the table could.
--
-- RLS enabled with NO policies: only the service-role server reaches it.
-- Apply to TEST (nglmgglrexxumjndhyzo) first, then PROD (iozmgsopcyezkntnqbgj).

create table if not exists public.staff_sessions (
  token text primary key,
  staff_id uuid not null references public.staff(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists staff_sessions_staff_idx on public.staff_sessions (staff_id);

alter table public.staff_sessions enable row level security;
-- No policies on purpose — server-only via the service-role key.
