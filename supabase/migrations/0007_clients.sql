-- Move clients/leads off browser localStorage into a shared, RLS-guarded table
-- so the whole team sees the same records — and the same Contact Log — on any
-- device. Mirrors the jobs snapshot pattern (0004): indexed lookup columns plus
-- the full client snapshot in a jsonb `data` column (which carries contactLog[]).

create table public.clients (
  id          text primary key,
  created_by  uuid references public.profiles (id) on delete set null,
  kind        text,
  first_name  text,
  last_name   text,
  company     text,
  email       text,
  phone       text,
  -- Full client snapshot incl. the contact log. Keeps the evolving client shape
  -- flexible without a migration per new field.
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index clients_created_by_idx on public.clients (created_by);
create index clients_kind_idx on public.clients (kind);

create trigger set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

alter table public.clients enable row level security;

create policy "clients readable by authenticated"
  on public.clients for select to authenticated using (true);
create policy "clients writable by authenticated"
  on public.clients for all to authenticated using (true) with check (true);
