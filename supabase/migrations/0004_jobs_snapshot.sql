-- Reshape `jobs` to the saved_estimates snapshot pattern.
--
-- The original jobs table (uuid PK, 4-value status check, FK-heavy) was designed
-- before the client Job type existed and never held data — all jobs lived in
-- localStorage. The client Job type is far richer (job number, customer, address,
-- payment status, materials, actuals, warnings, assignment) and its status enum
-- differs (open / on_my_way / canceled). Rather than a column per field, store the
-- full Job as a jsonb snapshot + a few indexed columns, exactly like saved_estimates.
--
-- No auth gate yet (anonymous sign-in, no role UI), so jobs are writable by any
-- authenticated session — same pragmatic stance as 0003 for config tables.
-- Re-tighten once a real login + role management exists.

drop table if exists public.jobs cascade;

create table public.jobs (
  id              text primary key,
  created_by      uuid references public.profiles (id) on delete set null,
  job_number      text,
  source          text,
  estimate_id     text,
  customer_name   text,
  status          text,
  payment_status  text,
  scheduled_start timestamptz,
  quoted_amount   numeric,
  -- Full client Job snapshot. Keeps the evolving job shape flexible without a
  -- migration per new field.
  data            jsonb not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index jobs_status_idx on public.jobs (status);
create index jobs_scheduled_start_idx on public.jobs (scheduled_start);
create index jobs_created_by_idx on public.jobs (created_by);

create trigger set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;

create policy "jobs readable by authenticated"
  on public.jobs for select to authenticated using (true);
create policy "jobs writable by authenticated"
  on public.jobs for all to authenticated using (true) with check (true);
