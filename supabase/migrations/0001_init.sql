-- get-junk-quote initial schema
-- Multi-user crew model: auth.users + profiles(role), business-wide shared data, RLS enforced.
-- Apply in the Supabase SQL editor (Dashboard > SQL Editor) or via `supabase db push`.

-- ============================================================================
-- Helpers
-- ============================================================================

-- Auto-update updated_at on row change.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- Profiles + roles
-- ============================================================================

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'crew'
                check (role in ('owner', 'admin', 'estimator', 'crew')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- True when the current user is an owner/admin (i.e. may edit pricing config).
create or replace function public.is_manager()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin') and is_active
  );
$$;

-- Create a profile automatically when a user signs up.
-- First user to sign up becomes 'owner'; everyone after defaults to 'crew'.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    case when (select count(*) from public.profiles) = 0 then 'owner' else 'crew' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Config tables (business-wide pricing inputs; mirror client/src/types/pricing.ts)
-- Text PKs preserve the slug ids used by the seed data (e.g. 'ford-transit-t250').
-- ============================================================================

create table public.facilities (
  id                    text primary key,
  facility_name         text not null,
  facility_type         text not null,
  address               text,
  city                  text,
  state                 text,
  zip                   text,
  phone                 text,
  website               text,
  latitude              double precision,
  longitude             double precision,
  accepted_materials    text[] not null default '{}',
  rejected_materials    text[] not null default '{}',
  price_type            text not null,
  default_rate          numeric not null default 0,
  minimum_charge        numeric not null default 0,
  environmental_fee     numeric not null default 0,
  fuel_surcharge        numeric not null default 0,
  extra_fees            numeric not null default 0,
  hours                 text[] not null default '{}',
  notes                 text,
  best_use_case         text,
  pricing_impact_label  text,
  last_verified_date    date,
  is_default            boolean not null default false,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.vehicles (
  id                    text primary key,
  vehicle_name          text not null,
  vehicle_type          text not null,
  usable_cubic_yards    numeric not null default 0,
  max_payload_lbs       numeric not null default 0,
  empty_weight_lbs      numeric,
  gvwr_lbs              numeric,
  fuel_type             text,
  mpg_unloaded          numeric,
  mpg_loaded            numeric,
  hourly_vehicle_cost   numeric,
  mileage_cost          numeric,
  has_liftgate          boolean not null default false,
  has_dump_capability   boolean not null default false,
  requires_tow_vehicle  boolean not null default false,
  notes                 text,
  is_default            boolean not null default false,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.material_pricing_rules (
  id                              text primary key,
  material_name                   text not null,
  material_category               text not null,
  default_density_lbs_per_yard    numeric not null default 0,
  density_range_min               numeric,
  density_range_max               numeric,
  pricing_mode                    text not null,
  requires_weight_override        boolean not null default false,
  preferred_facility_types        text[] not null default '{}',
  warning_text                    text,
  labor_difficulty_multiplier     numeric not null default 1,
  disposal_difficulty_multiplier  numeric not null default 1,
  notes                           text,
  is_active                       boolean not null default true,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create table public.volume_benchmarks (
  id          text primary key,
  label       text not null,
  fraction    numeric not null,
  price       numeric not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Single-row table for the `defaults` block in PricingSettings.
create table public.pricing_defaults (
  id                            int primary key default 1 check (id = 1),
  fuel_price_per_gallon         numeric not null default 4,
  workers                       numeric not null default 2,
  hourly_labor_cost             numeric not null default 25,
  estimated_hours               numeric not null default 2,
  target_margin_decimal         numeric not null default 0.6,
  minimum_profit_dollars        numeric not null default 150,
  default_facility_rate_per_ton numeric not null default 0,
  updated_at                    timestamptz not null default now()
);

-- ============================================================================
-- Operations tables (the data you want to track over time)
-- ============================================================================

create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  phone       text,
  address     text,
  notes       text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.saved_estimates (
  id            text primary key default gen_random_uuid()::text,
  created_by    uuid references public.profiles (id) on delete set null,
  customer_id   uuid references public.customers (id) on delete set null,
  customer_name text,
  job_address   text,
  material_type text,
  vehicle_id    text,
  facility_id   text,
  final_quote   numeric,
  -- Full SavedEstimate snapshot (warnings, cost breakdown, inputs). Keeps the
  -- evolving estimate shape flexible without a migration per new field.
  data          jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index saved_estimates_created_by_idx on public.saved_estimates (created_by);
create index saved_estimates_customer_id_idx on public.saved_estimates (customer_id);
create index saved_estimates_created_at_idx on public.saved_estimates (created_at desc);

create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  estimate_id   text references public.saved_estimates (id) on delete set null,
  customer_id   uuid references public.customers (id) on delete set null,
  status        text not null default 'scheduled'
                  check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  scheduled_for timestamptz,
  completed_at  timestamptz,
  assigned_to   uuid references public.profiles (id) on delete set null,
  actual_quote  numeric,
  notes         text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index jobs_status_idx on public.jobs (status);
create index jobs_scheduled_for_idx on public.jobs (scheduled_for);

-- ============================================================================
-- updated_at triggers
-- ============================================================================

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.facilities
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.material_pricing_rules
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.volume_benchmarks
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pricing_defaults
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.saved_estimates
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- Single business: any authenticated crew member can read all data.
-- Pricing config is editable only by owner/admin (is_manager()).
-- Operational rows are editable by their creator or a manager.
-- ============================================================================

alter table public.profiles              enable row level security;
alter table public.facilities            enable row level security;
alter table public.vehicles              enable row level security;
alter table public.material_pricing_rules enable row level security;
alter table public.volume_benchmarks     enable row level security;
alter table public.pricing_defaults      enable row level security;
alter table public.customers             enable row level security;
alter table public.saved_estimates       enable row level security;
alter table public.jobs                  enable row level security;

-- Profiles
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);
create policy "users insert own profile"
  on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "users update own profile or manager updates any"
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_manager())
  with check (id = auth.uid() or public.is_manager());

-- Config tables: read for all authenticated, write for managers only.
do $$
declare t text;
begin
  foreach t in array array[
    'facilities', 'vehicles', 'material_pricing_rules', 'volume_benchmarks', 'pricing_defaults'
  ] loop
    execute format(
      'create policy "config readable by authenticated" on public.%I for select to authenticated using (true)', t);
    execute format(
      'create policy "config writable by managers" on public.%I for all to authenticated using (public.is_manager()) with check (public.is_manager())', t);
  end loop;
end $$;

-- Customers: all authenticated read; creator or manager mutate.
create policy "customers readable by authenticated"
  on public.customers for select to authenticated using (true);
create policy "customers insertable by authenticated"
  on public.customers for insert to authenticated with check (created_by = auth.uid());
create policy "customers updatable by creator or manager"
  on public.customers for update to authenticated
  using (created_by = auth.uid() or public.is_manager())
  with check (created_by = auth.uid() or public.is_manager());
create policy "customers deletable by creator or manager"
  on public.customers for delete to authenticated
  using (created_by = auth.uid() or public.is_manager());

-- Saved estimates
create policy "estimates readable by authenticated"
  on public.saved_estimates for select to authenticated using (true);
create policy "estimates insertable by authenticated"
  on public.saved_estimates for insert to authenticated with check (created_by = auth.uid());
create policy "estimates updatable by creator or manager"
  on public.saved_estimates for update to authenticated
  using (created_by = auth.uid() or public.is_manager())
  with check (created_by = auth.uid() or public.is_manager());
create policy "estimates deletable by creator or manager"
  on public.saved_estimates for delete to authenticated
  using (created_by = auth.uid() or public.is_manager());

-- Jobs
create policy "jobs readable by authenticated"
  on public.jobs for select to authenticated using (true);
create policy "jobs insertable by authenticated"
  on public.jobs for insert to authenticated with check (created_by = auth.uid());
create policy "jobs updatable by creator, assignee, or manager"
  on public.jobs for update to authenticated
  using (created_by = auth.uid() or assigned_to = auth.uid() or public.is_manager())
  with check (created_by = auth.uid() or assigned_to = auth.uid() or public.is_manager());
create policy "jobs deletable by creator or manager"
  on public.jobs for delete to authenticated
  using (created_by = auth.uid() or public.is_manager());
