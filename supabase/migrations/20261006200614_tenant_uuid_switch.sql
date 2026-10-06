-- MCP connector Phase 1, part 2, step 2 — ship 3: THE SWITCH.
-- Every remaining text tenant_id ('progressive' / 'wellsentry' / 'unknown')
-- becomes the owning company's uuid (companies.id), and the pipeline's lookup
-- pipeline_tenant_keys() starts handing out uuids. One transaction: data, rules,
-- functions and the pipeline key flip together. Nothing is redeployed — the
-- pipeline (rejunk-webhook-services, _shared/tenant.ts) reloads the key map on
-- every request; the app sends no tenant values except the dashboard slug,
-- which the dashboard functions still accept.
--
-- Same meaning as before: every access rule still means "a signed-in office
-- user, Progressive's rows only" (step 3 rewrites them to memberships).
-- Defaults: the Progressive uuid stays as a TEMPORARY default only where the
-- app or a DB function relies on one today (app_client_meta, app_employees,
-- pricebook_items, pricebook_categories, customer_notifications) — Part B
-- replaces those with "the caller's company". Every other company-naming default
-- is dropped: the pipeline stamps those tables explicitly.
--
-- Undo: supabase/undo/20261006200614_tenant_uuid_switch_undo.sql
begin;

-- 1. Drop the 31 access rules that compare tenant_id to the text slug, and the
--    view that depends on the column (recreated below from its own definition).
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and coalesce(qual, '') || coalesce(with_check, '') like '%tenant_id = ''progressive''::text%'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create temporary table _leads_v_def on commit drop as
  select pg_get_viewdef('public.app_leads_v'::regclass) as def;
drop view public.app_leads_v;

-- 2. Convert the 30 columns. An unexpected value maps to null and NOT NULL
--    aborts the whole migration.
do $$
declare
  t text;
  tables text[] := array[
    'agent_replies','agent_sessions','app_client_meta','app_contact_overrides','app_employees',
    'bookings','capacity_resources','customer_notifications','enrichment_events','hcp_appointments',
    'hcp_availability_cache','hcp_events_raw','hcp_links','inbound_sms','negotiation_job_map',
    'pipeline_alerts','pricebook_categories','pricebook_items','proxy_numbers','reminders_sent',
    'review_requests_sent','reviews_received','sms_retries','thumbtack_category_map','thumbtack_leads',
    'thumbtack_messages','thumbtack_outbox','thumbtack_status_posts','thumbtack_tokens','voice_calls'];
begin
  foreach t in array tables loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_tenant_id_fkey');
    execute format('alter table public.%I alter column tenant_id drop default', t);
    execute format($f$
      alter table public.%I alter column tenant_id type uuid using (case tenant_id
        when 'progressive' then '208a0172-b9f8-49e4-8eab-4021bf627c50'
        when 'wellsentry'  then '32b23856-c240-41c8-8302-9a11b55e85a9'
        when 'unknown'     then '10a16932-755f-437d-8afb-c088a480a730'
      end)::uuid$f$, t);
    execute format('alter table public.%I add constraint %I foreign key (tenant_id) references public.companies(id)',
      t, t || '_tenant_id_fkey');
  end loop;
end $$;

-- 3. Temporary Progressive defaults (bridge only — Part B removes them).
alter table public.app_client_meta        alter column tenant_id set default '208a0172-b9f8-49e4-8eab-4021bf627c50'::uuid;
alter table public.app_employees          alter column tenant_id set default '208a0172-b9f8-49e4-8eab-4021bf627c50'::uuid;
alter table public.pricebook_items        alter column tenant_id set default '208a0172-b9f8-49e4-8eab-4021bf627c50'::uuid;
alter table public.pricebook_categories   alter column tenant_id set default '208a0172-b9f8-49e4-8eab-4021bf627c50'::uuid;
alter table public.customer_notifications alter column tenant_id set default '208a0172-b9f8-49e4-8eab-4021bf627c50'::uuid;

-- 4. Recreate the 31 access rules with the same meaning (Progressive's company id).
do $$
declare
  t text;
  rule constant text :=
    '(app_private.staff_role() is not null and tenant_id = ''208a0172-b9f8-49e4-8eab-4021bf627c50''::uuid)';
begin
  foreach t in array array[
    'agent_replies','agent_sessions','app_client_meta','app_contact_overrides','app_employees',
    'bookings','capacity_resources','enrichment_events','hcp_appointments','hcp_availability_cache',
    'hcp_events_raw','hcp_links','inbound_sms','negotiation_job_map','pipeline_alerts',
    'pricebook_categories','pricebook_items','proxy_numbers','reminders_sent','review_requests_sent',
    'reviews_received','sms_retries','thumbtack_category_map','thumbtack_leads','thumbtack_messages',
    'thumbtack_outbox','thumbtack_status_posts','thumbtack_tokens','voice_calls'] loop
    execute format('create policy business_identity_required on public.%I as restrictive for all
      to anon, authenticated using %s with check %s', t, rule, rule);
  end loop;
  execute format('create policy office_employees on public.app_employees as permissive for all
    to authenticated using %s with check %s', rule, rule);
  execute format('create policy staff_read_negotiation_map on public.negotiation_job_map as permissive
    for select to authenticated using %s', rule);
end $$;

-- 5. Recreate app_leads_v exactly as it was (invoker rights, same grants).
do $$
begin
  execute 'create view public.app_leads_v with (security_invoker = true) as '
    || (select def from _leads_v_def);
end $$;
revoke all on public.app_leads_v from anon;
grant all on public.app_leads_v to authenticated, service_role;

-- 6. Functions that compared against the slug. Same behavior, uuid comparison.
--    business_rows / business_conversation / office_save_estimate: swap the
--    literal; fail if a function no longer contains it (definition drifted).
do $$
declare
  fn text;
  def text;
begin
  foreach fn in array array['public.business_rows(text)','public.business_conversation(text)',
                            'public.office_save_estimate(jsonb)'] loop
    def := pg_get_functiondef(fn::regprocedure);
    if def not like '%tenant_id=''progressive''%' and def not like '%tenant_id=''''progressive''''%' then
      raise exception 'switch: % no longer has the expected progressive filter', fn;
    end if;
    def := replace(def, 'tenant_id=''''progressive''''',
                        'tenant_id=''''208a0172-b9f8-49e4-8eab-4021bf627c50''''::uuid');
    def := replace(def, 'tenant_id=''progressive''',
                        'tenant_id=''208a0172-b9f8-49e4-8eab-4021bf627c50''::uuid');
    if def like '%''progressive''%' then
      raise exception 'switch: % still names progressive after the swap', fn;
    end if;
    execute def;
  end loop;
end $$;

-- Dashboard: the browser still sends p_tenant = 'progressive' (public wrappers
-- unchanged); the private worker turns the slug (or a uuid) into the company id.
do $$
declare
  def text := pg_get_functiondef('app_private.dashboard_metrics(text,date)'::regprocedure);
begin
  def := replace(def, '  v_capacity jsonb;
begin', '  v_capacity jsonb;
  v_company uuid;
begin
  select c.id into v_company from public.companies c where c.slug = p_tenant or c.id::text = p_tenant;
  if v_company is null then raise exception ''Unknown company'' using errcode = ''22023''; end if;');
  def := replace(def, 'tenant_id = p_tenant', 'tenant_id = v_company');
  if def like '%p_tenant and%' or def not like '%v_company uuid;%' then
    raise exception 'switch: dashboard_metrics rewrite failed (definition drifted)';
  end if;
  execute def;
end $$;

-- 7. THE FLIP: the pipeline's stored tenant key becomes the company uuid.
create or replace function public.pipeline_tenant_keys()
returns table (business_id text, tenant_key text, company_id uuid)
language sql
stable
set search_path = ''
as $$
  select b.id, c.id::text, c.id
  from public.businesses b
  join public.companies c on c.pipeline_business_id = b.id
$$;

revoke all on function public.pipeline_tenant_keys() from public, anon, authenticated;
grant execute on function public.pipeline_tenant_keys() to service_role;

commit;
