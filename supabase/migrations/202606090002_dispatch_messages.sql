-- Dispatch <-> driver messaging (threads + participants + messages).
-- Standalone and additive: does NOT depend on the (unapplied) 202606070001-3
-- driver/dispatch migrations. employee_id / sender_id are localStorage employee
-- record ids (employees are not in the DB yet), so they are plain text with no FK.
-- job_id is the app-level job id (text) for the same reason.
--
-- Trust model note: the app uses transparent anonymous sign-in, so "authenticated"
-- means "any visitor". App-level guards (driver session token / PIN) carry the
-- real access control until real auth lands; RLS here matches the rest of the
-- app (small team, no multi-tenant isolation needed).

create table if not exists public.dispatch_threads (
  id uuid primary key default gen_random_uuid(),
  thread_type text not null check (thread_type in ('job', 'direct', 'broadcast')),
  job_id text,
  title text not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived boolean not null default false
);

create table if not exists public.dispatch_thread_participants (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dispatch_threads (id) on delete cascade,
  employee_id text not null,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  unique (thread_id, employee_id)
);

create table if not exists public.dispatch_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dispatch_threads (id) on delete cascade,
  sender_id text not null,
  sender_name text not null,
  body text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dispatch_threads_job_idx on public.dispatch_threads (job_id);
create index if not exists dispatch_threads_updated_idx on public.dispatch_threads (updated_at desc);
create index if not exists dispatch_thread_participants_employee_idx on public.dispatch_thread_participants (employee_id);
create index if not exists dispatch_messages_thread_idx on public.dispatch_messages (thread_id, created_at);

alter table public.dispatch_threads enable row level security;
alter table public.dispatch_thread_participants enable row level security;
alter table public.dispatch_messages enable row level security;

create policy "dispatch threads all ops for authenticated"
  on public.dispatch_threads for all to authenticated using (true) with check (true);
create policy "dispatch thread participants all ops for authenticated"
  on public.dispatch_thread_participants for all to authenticated using (true) with check (true);
create policy "dispatch messages all ops for authenticated"
  on public.dispatch_messages for all to authenticated using (true) with check (true);

-- Both sides of the chat subscribe via Supabase Realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dispatch_messages'
  ) then
    alter publication supabase_realtime add table public.dispatch_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dispatch_threads'
  ) then
    alter publication supabase_realtime add table public.dispatch_threads;
  end if;
end
$$;
