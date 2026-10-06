-- MCP connector Phase 1, part 2, step 1: a company tag on every app-owned table
-- that has none yet. Additive only — no access rule, function or view changes.
--
-- Each table gets tenant_id uuid → companies.id, NOT NULL, defaulting to
-- Progressive's company id. A constant default fills existing rows without
-- rewriting them and without firing row triggers (Sol's invoice triggers
-- included), and lets today's browser + pipeline inserts keep working
-- unchanged. The temporary default is dropped in step 5, once every writer
-- stamps the company itself.
--
-- Not in this step:
--   * tables that already carry a text 'progressive' tag (app_employees,
--     pricebook_*, app_client_meta, pipeline tables) — step 2, shipped together
--     with the rejunk-webhook-services change;
--   * companies / memberships / businesses (they ARE the tenant records);
--   * invoice_payment_ownership / invoice_checkout_attempts (Sol's bridge,
--     already keyed by company_id);
--   * profiles (legacy role table, replaced by memberships).
-- The browser reads driver_sessions / driver_activations through column-level
-- grants; the new column is deliberately NOT granted there (the app selects
-- named columns only).
begin;

do $$
declare
  progressive uuid;
  t text;
begin
  select id into strict progressive from public.companies where slug = 'progressive';

  foreach t in array array[
    'jobs', 'clients', 'customers', 'saved_estimates',
    'app_invoices', 'app_payments', 'app_settings',
    'vehicles', 'facilities',
    'material_pricing_rules', 'pricing_defaults', 'volume_benchmarks',
    'job_photos', 'job_time_events',
    'dispatch_threads', 'dispatch_thread_participants', 'dispatch_messages',
    'driver_activations', 'driver_sessions', 'driver_location_history',
    'staff', 'staff_sessions'
  ] loop
    execute format(
      'alter table public.%I add column tenant_id uuid not null default %L
         references public.companies(id) on delete restrict',
      t, progressive);
    execute format('create index %I on public.%I (tenant_id)', t || '_tenant_id_idx', t);
  end loop;
end $$;

commit;
