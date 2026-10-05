-- MCP connector Phase 1, part 1: the shared company foundation agreed with Sol
-- (DECISIONS.md 2026-10-05 "Shared company foundation agreed with Sol").
-- Additive only. Nothing reads these tables yet: today's access rules still run
-- through staff_role() / driver sessions. Part 2 adds tenant_id (uuid →
-- companies.id) to the business tables and moves the rules onto memberships.
begin;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (length(btrim(name)) between 1 and 200),
  -- Explicit link to the pipeline's (rejunk-webhook-services) businesses row.
  pipeline_business_id text unique references public.businesses(id) on delete set null,
  -- Local mirror of the company's Rejunk subscription. Written ONLY by verified
  -- server-side Stripe webhooks (service role); plan_tier comes from a
  -- server-controlled Price-ID mapping. Null = billing not set up (allowed:
  -- billing stays optional during the rollout).
  plan_tier text,
  subscription_status text,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  cancel_at_period_end boolean not null default false,
  -- The company's own connected Stripe account (its customers' invoice and
  -- deposit payments) — a different relationship from stripe_customer_id.
  stripe_connect_account_id text,
  -- Test and live Stripe data never share a row's ids.
  stripe_livemode boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index companies_stripe_customer_uq
  on public.companies (stripe_livemode, stripe_customer_id) where stripe_customer_id is not null;
create unique index companies_stripe_subscription_uq
  on public.companies (stripe_livemode, stripe_subscription_id) where stripe_subscription_id is not null;
create unique index companies_stripe_connect_uq
  on public.companies (stripe_livemode, stripe_connect_account_id) where stripe_connect_account_id is not null;

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('owner','office','crew')),
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id)
);
create index memberships_tenant_idx on public.memberships (tenant_id);

-- Membership check that doesn't recurse through memberships' own RLS.
create function app_private.has_membership(company uuid, roles text[] default array['owner','office','crew'])
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships m
    where m.user_id=auth.uid() and m.tenant_id=company and m.role=any(roles));
$$;
revoke all on function app_private.has_membership(uuid,text[]) from public,anon;
grant execute on function app_private.has_membership(uuid,text[]) to authenticated, service_role;

alter table public.companies enable row level security;
alter table public.memberships enable row level security;
revoke all on public.companies, public.memberships from public, anon, authenticated;

-- Column protection: browsers can read only these company columns (Stripe ids
-- stay server-side) and can change only the name. Billing columns and slug
-- have no browser grant at all, so no RLS policy can open them up.
grant select (id, slug, name, plan_tier, subscription_status, cancel_at_period_end, created_at, updated_at)
  on public.companies to authenticated;
grant update (name) on public.companies to authenticated;
create policy companies_member_read on public.companies for select to authenticated
  using (app_private.has_membership(id));
create policy companies_owner_rename on public.companies for update to authenticated
  using (app_private.has_membership(id, array['owner']))
  with check (app_private.has_membership(id, array['owner']));

-- People see their own memberships. No browser insert/update/delete: adding
-- people and changing roles go through owner-checked server endpoints, so a
-- membership can't be promoted by a table update.
grant select on public.memberships to authenticated;
create policy memberships_self_read on public.memberships for select to authenticated
  using (user_id=auth.uid());

create function app_private.touch_company() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at := now(); return new; end $$;
create trigger companies_touch before update on public.companies
  for each row execute function app_private.touch_company();

-- Progressive: the first company, linked to the pipeline row and to every
-- active owner login that has a real account (today: Abe).
insert into public.companies (slug, name, pipeline_business_id)
  values ('progressive', 'Progressive Transportation Services', 'progressive');
insert into public.memberships (user_id, tenant_id, role)
  select s.auth_user_id, c.id, s.role
  from public.staff s cross join public.companies c
  where c.slug='progressive' and s.active and s.auth_user_id is not null and s.role in ('owner','office')
  on conflict (user_id, tenant_id) do nothing;

commit;
