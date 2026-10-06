-- UNDO for 20261006200614_tenant_uuid_switch.sql (ship 3).
-- Puts the 30 tenant_id columns back to the text slug, the links back to
-- businesses(id), the old defaults, the old 'progressive' rules / functions,
-- and the slug-returning pipeline_tenant_keys(). The pipeline follows on its
-- next request (no redeploy). Rows the pipeline wrote after the switch carry a
-- uuid and are mapped back like the rest.
begin;

do $$
declare
  r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and coalesce(qual, '') || coalesce(with_check, '') like '%208a0172-b9f8-49e4-8eab-4021bf627c50%'
      and tablename in (
        'agent_replies','agent_sessions','app_client_meta','app_contact_overrides','app_employees',
        'bookings','capacity_resources','enrichment_events','hcp_appointments','hcp_availability_cache',
        'hcp_events_raw','hcp_links','inbound_sms','negotiation_job_map','pipeline_alerts',
        'pricebook_categories','pricebook_items','proxy_numbers','reminders_sent','review_requests_sent',
        'reviews_received','sms_retries','thumbtack_category_map','thumbtack_leads','thumbtack_messages',
        'thumbtack_outbox','thumbtack_status_posts','thumbtack_tokens','voice_calls')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create temporary table _leads_v_def on commit drop as
  select pg_get_viewdef('public.app_leads_v'::regclass) as def;
drop view public.app_leads_v;

do $$
declare
  t text;
  d text;
  defaults jsonb := '{
    "agent_replies":"wellsentry","agent_sessions":"wellsentry","app_client_meta":"progressive",
    "app_employees":"progressive","bookings":"progressive","customer_notifications":"progressive",
    "enrichment_events":"wellsentry","hcp_appointments":"wellsentry","hcp_links":"wellsentry",
    "inbound_sms":"unknown","pipeline_alerts":"wellsentry","pricebook_categories":"progressive",
    "pricebook_items":"progressive","proxy_numbers":"wellsentry","reminders_sent":"wellsentry",
    "review_requests_sent":"wellsentry","reviews_received":"wellsentry","sms_retries":"wellsentry",
    "thumbtack_category_map":"wellsentry","thumbtack_leads":"wellsentry","thumbtack_messages":"wellsentry",
    "thumbtack_outbox":"wellsentry","thumbtack_tokens":"wellsentry","voice_calls":"progressive"}';
  no_fk text[] := array['app_client_meta','app_contact_overrides','app_employees','customer_notifications'];
begin
  foreach t in array array[
    'agent_replies','agent_sessions','app_client_meta','app_contact_overrides','app_employees',
    'bookings','capacity_resources','customer_notifications','enrichment_events','hcp_appointments',
    'hcp_availability_cache','hcp_events_raw','hcp_links','inbound_sms','negotiation_job_map',
    'pipeline_alerts','pricebook_categories','pricebook_items','proxy_numbers','reminders_sent',
    'review_requests_sent','reviews_received','sms_retries','thumbtack_category_map','thumbtack_leads',
    'thumbtack_messages','thumbtack_outbox','thumbtack_status_posts','thumbtack_tokens','voice_calls'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_tenant_id_fkey');
    execute format('alter table public.%I alter column tenant_id drop default', t);
    execute format($f$
      alter table public.%I alter column tenant_id type text using (case tenant_id::text
        when '208a0172-b9f8-49e4-8eab-4021bf627c50' then 'progressive'
        when '32b23856-c240-41c8-8302-9a11b55e85a9' then 'wellsentry'
        when '10a16932-755f-437d-8afb-c088a480a730' then 'unknown'
      end)$f$, t);
    if not (t = any(no_fk)) then
      execute format('alter table public.%I add constraint %I foreign key (tenant_id) references public.businesses(id)',
        t, t || '_tenant_id_fkey');
    end if;
    d := defaults ->> t;
    if d is not null then
      execute format('alter table public.%I alter column tenant_id set default %L::text', t, d);
    end if;
  end loop;
end $$;

do $$
declare
  t text;
  rule constant text := '(app_private.staff_role() is not null and tenant_id = ''progressive''::text)';
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

do $$
begin
  execute 'create view public.app_leads_v with (security_invoker = true) as '
    || (select def from _leads_v_def);
end $$;
revoke all on public.app_leads_v from anon;
grant all on public.app_leads_v to authenticated, service_role;

do $$
declare
  fn text;
  def text;
begin
  foreach fn in array array['public.business_rows(text)','public.business_conversation(text)',
                            'public.office_save_estimate(jsonb)'] loop
    def := pg_get_functiondef(fn::regprocedure);
    def := replace(def, 'tenant_id=''''208a0172-b9f8-49e4-8eab-4021bf627c50''''::uuid',
                        'tenant_id=''''progressive''''');
    def := replace(def, 'tenant_id=''208a0172-b9f8-49e4-8eab-4021bf627c50''::uuid',
                        'tenant_id=''progressive''');
    execute def;
  end loop;
end $$;

-- Dashboard worker: compare against the slug again.
do $$
declare
  def text := pg_get_functiondef('app_private.dashboard_metrics(text,date)'::regprocedure);
begin
  def := replace(def, 'tenant_id = v_company', 'tenant_id = p_tenant');
  execute def;
end $$;

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
