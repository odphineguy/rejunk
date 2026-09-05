-- APPLIED to rejunk-prod 2026-09-04 via the Supabase Management API.
-- Real customer contact details matched from Housecall Pro exports.
--
-- This table is deliberately server-only. The office app's Supabase session is
-- anonymous, so granting it direct access would expose real phone numbers and
-- emails to anyone who can create an anonymous session. Active staff retrieve
-- only phone/email overrides through the token-validated /api/staff endpoint.
create table if not exists public.app_contact_overrides (
  tenant_id text not null,
  negotiation_id text not null,
  hcp_customer_id text,
  customer_name text not null,
  phone text,
  email text,
  match_method text not null check (match_method in ('hcp_job_link', 'exact_name_city')),
  source text not null default 'housecall_pro_export',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, negotiation_id),
  check (phone is not null or email is not null)
);

alter table public.app_contact_overrides enable row level security;
revoke all on table public.app_contact_overrides from anon, authenticated;

comment on table public.app_contact_overrides is
  'Server-only real contact details matched to Thumbtack negotiations from Housecall Pro.';
