-- Driver activation + live location tracking.
-- Standalone and additive: does NOT depend on the (unapplied) 202606070001-3
-- driver/dispatch migrations. employee_id is the localStorage employee record id
-- (employees are not in the DB yet), so it is plain text with no FK.
--
-- Trust model note: the app uses transparent anonymous sign-in, so "authenticated"
-- means "any visitor". App-level guards (activation key, hashed PIN, session token)
-- carry the real access control until real auth lands; RLS here matches the rest
-- of the app (migration 0003 relaxed config writes the same way).

create table if not exists public.driver_activations (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  employee_name text,
  activation_key text not null unique,
  email_sent_to text,
  status text not null default 'pending' check (status in ('pending', 'activated', 'expired', 'revoked')),
  expires_at timestamptz not null,
  activated_at timestamptz,
  pin_hash text,
  session_token text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.driver_sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  activation_id uuid references public.driver_activations (id) on delete set null,
  session_token text unique,
  display_name text,
  last_seen_at timestamptz,
  last_lat float8,
  last_lng float8,
  last_heading float8,
  is_online boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.driver_location_history (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  session_id uuid references public.driver_sessions (id) on delete cascade,
  lat float8 not null,
  lng float8 not null,
  heading float8,
  speed float8,
  accuracy float8,
  recorded_at timestamptz not null default now()
);

create index if not exists driver_activations_employee_idx on public.driver_activations (employee_id, created_at desc);
create index if not exists driver_sessions_employee_idx on public.driver_sessions (employee_id, created_at desc);
create index if not exists driver_sessions_online_idx on public.driver_sessions (is_online, last_seen_at desc);
create index if not exists driver_location_history_session_idx on public.driver_location_history (session_id, recorded_at desc);
create index if not exists driver_location_history_employee_idx on public.driver_location_history (employee_id, recorded_at desc);

alter table public.driver_activations enable row level security;
alter table public.driver_sessions enable row level security;
alter table public.driver_location_history enable row level security;

create policy "driver activations readable by authenticated"
  on public.driver_activations for select to authenticated using (true);
create policy "driver activations writable by authenticated"
  on public.driver_activations for insert to authenticated with check (true);
create policy "driver activations updatable by authenticated"
  on public.driver_activations for update to authenticated using (true) with check (true);

create policy "driver sessions readable by authenticated"
  on public.driver_sessions for select to authenticated using (true);
create policy "driver sessions writable by authenticated"
  on public.driver_sessions for insert to authenticated with check (true);
create policy "driver sessions updatable by authenticated"
  on public.driver_sessions for update to authenticated using (true) with check (true);

-- Location history: writes allowed, but the frontend can only read the last
-- 24 hours (privacy retention rule enforced at the DB boundary). No update/delete.
create policy "driver locations writable by authenticated"
  on public.driver_location_history for insert to authenticated with check (true);
create policy "driver locations last 24h readable"
  on public.driver_location_history for select to authenticated
  using (recorded_at > now() - interval '24 hours');

-- Live driver markers subscribe to driver_sessions via Supabase Realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'driver_sessions'
  ) then
    alter publication supabase_realtime add table public.driver_sessions;
  end if;
end
$$;
