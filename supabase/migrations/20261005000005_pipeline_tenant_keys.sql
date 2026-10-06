-- MCP connector Phase 1, part 2, step 2 — ship 2 (pipeline "works both ways").
-- Additive only. Must be applied BEFORE the rejunk-webhook-services functions
-- that call pipeline_tenant_keys() are deployed.
--
-- 1. Every pipeline business gets a company (Abe, 2026-10-05): WellSentry keeps
--    its data walled off as its own company; unmatched texts/leads ('unknown')
--    go to a placeholder 'Unmatched' company. No memberships, so no app user
--    can see either.
-- 2. pipeline_tenant_keys(): the single source of the business slug → stored
--    tenant_id mapping the pipeline uses (_shared/tenant.ts). Today the stored
--    key IS the slug. The switch migration (ship 3) redefines it to return the
--    company uuid in the same transaction that converts the tenant_id columns.
--    Server-only: the pipeline calls it with the service-role key.
begin;

insert into public.companies (slug, name, pipeline_business_id) values
  ('wellsentry', 'WellSentry Home Safety', 'wellsentry'),
  ('unmatched', 'Unmatched (unrouted)', 'unknown')
on conflict (slug) do nothing;

create or replace function public.pipeline_tenant_keys()
returns table (business_id text, tenant_key text, company_id uuid)
language sql
stable
set search_path = ''
as $$
  select b.id, b.id, c.id
  from public.businesses b
  left join public.companies c on c.pipeline_business_id = b.id
$$;

revoke all on function public.pipeline_tenant_keys() from public, anon, authenticated;
grant execute on function public.pipeline_tenant_keys() to service_role;

commit;
