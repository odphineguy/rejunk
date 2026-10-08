-- MCP connector Phase 1, part 2 — step 3: access rules follow the caller's company.
-- Before: rules let any verified office login see every row, and 31 of them
-- named Progressive's id. After: every row is visible only to people of the
-- company that owns it, and nothing names a company.
--
-- 1. Memberships are the source of truth for office people. A staff login only
--    counts when its real account holds a matching membership (same company,
--    same role). A trigger keeps memberships in step with the staff table
--    (grant / revoke / role change / account link), so /api/staff needs no change.
-- 2. One RESTRICTIVE rule per company table, "company_scope":
--    tenant_id = the caller's company (office: staff + membership; driver: the
--    driver session). It ANDs with every existing rule.
-- 3. The 31 rules that named Progressive's id drop that clause (company_scope
--    now does the job, for every company).
-- 4. SECURITY DEFINER functions skip the table rules, so each one gets the same
--    company check: business_rows, business_conversation, dashboard reports,
--    office saves/deletes, job time + customer-text lookups, driver helpers.
-- 5. Job photo files: office access only to the caller's company's jobs.
-- 6. profiles (legacy, unused by the app): each person sees only their own row.
--
-- Undo: supabase/undo/20261008025419_company_rules_memberships_undo.sql
begin;

-- 1. Memberships follow the staff table -----------------------------------------
create or replace function app_private.sync_staff_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.auth_user_id is not null then
      delete from public.memberships
       where user_id = old.auth_user_id and tenant_id = old.tenant_id and role in ('owner', 'office');
    end if;
    return null;
  end if;
  if tg_op = 'UPDATE' and old.auth_user_id is not null
     and (new.auth_user_id is distinct from old.auth_user_id
          or new.tenant_id is distinct from old.tenant_id
          or not new.active or new.role not in ('owner', 'office')) then
    delete from public.memberships
     where user_id = old.auth_user_id and tenant_id = old.tenant_id and role in ('owner', 'office');
  end if;
  if new.auth_user_id is not null and new.active and new.role in ('owner', 'office') then
    insert into public.memberships (user_id, tenant_id, role)
    values (new.auth_user_id, new.tenant_id, new.role)
    on conflict (user_id, tenant_id) do update set role = excluded.role;
  end if;
  return null;
end $$;
revoke all on function app_private.sync_staff_membership() from public, anon, authenticated;

create trigger staff_membership_sync
after insert or delete or update of auth_user_id, tenant_id, role, active on public.staff
for each row execute function app_private.sync_staff_membership();

-- Backfill (today: Abe, already an owner member).
insert into public.memberships (user_id, tenant_id, role)
select s.auth_user_id, s.tenant_id, s.role from public.staff s
 where s.auth_user_id is not null and s.active and s.role in ('owner', 'office')
on conflict (user_id, tenant_id) do update set role = excluded.role;

-- Office identity now also needs the membership.
create or replace function app_private.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.role from app_private.identity_bindings b
  join public.staff_sessions ss on ss.token = b.staff_token
  join public.staff s on s.id = ss.staff_id
  where b.auth_user_id = auth.uid() and ss.expires_at > now() and s.active and s.role in ('owner', 'office')
    and (ss.auth_user_id is null or ss.auth_user_id = b.auth_user_id)
    and exists (select 1 from public.memberships m
                 where m.user_id = b.auth_user_id and m.tenant_id = s.tenant_id and m.role = s.role);
$$;

create or replace function app_private.caller_company()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.tenant_id from app_private.identity_bindings b
       join public.staff_sessions ss on ss.token = b.staff_token
       join public.staff s on s.id = ss.staff_id
      where b.auth_user_id = auth.uid() and ss.expires_at > now() and s.active and s.role in ('owner', 'office')
        and (ss.auth_user_id is null or ss.auth_user_id = b.auth_user_id)
        and exists (select 1 from public.memberships m
                     where m.user_id = b.auth_user_id and m.tenant_id = s.tenant_id and m.role = s.role)),
    (select ds.tenant_id from public.driver_sessions ds where ds.id = app_private.driver_session()))
$$;

-- Does this job belong to the caller's company?
create or replace function app_private.company_job(target text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.jobs j where j.id = target and j.tenant_id = app_private.caller_company());
$$;
revoke all on function app_private.company_job(text) from public, anon;
grant execute on function app_private.company_job(text) to authenticated, service_role;

-- Drivers: assigned AND same company.
create or replace function app_private.assigned_job(target text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(select 1 from public.jobs j
    join public.driver_sessions ds on ds.id = app_private.driver_session()
    join public.driver_activations da on da.id = ds.activation_id
    where j.id = target and j.tenant_id = ds.tenant_id
      and app_private.job_has_employee(j.data, ds.employee_id, da.employee_name));
$$;

-- 2. company_scope on every company table ---------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'agent_replies','agent_sessions','app_client_meta','app_contact_overrides','app_employees',
    'app_invoices','app_payments','app_settings','bookings','capacity_resources','clients',
    'customer_notifications','customers','dispatch_messages','dispatch_thread_participants',
    'dispatch_threads','driver_activations','driver_location_history','driver_sessions',
    'enrichment_events','facilities','hcp_appointments','hcp_availability_cache','hcp_events_raw',
    'hcp_links','inbound_sms','job_photos','job_time_events','jobs','material_pricing_rules',
    'negotiation_job_map','pipeline_alerts','pricebook_categories','pricebook_items',
    'pricing_defaults','proxy_numbers','reminders_sent','review_requests_sent','reviews_received',
    'saved_estimates','sms_retries','staff','staff_sessions','thumbtack_category_map',
    'thumbtack_leads','thumbtack_messages','thumbtack_outbox','thumbtack_status_posts',
    'thumbtack_tokens','vehicles','voice_calls','volume_benchmarks']
  loop
    execute format(
      'create policy company_scope on public.%I as restrictive for all to anon, authenticated
         using (tenant_id = (select app_private.caller_company()))
         with check (tenant_id = (select app_private.caller_company()))', t);
  end loop;
end $$;

-- 3. Drop the Progressive id from the 31 rules ----------------------------------
do $$
declare p record; clause constant text := ' AND (tenant_id = ''208a0172-b9f8-49e4-8eab-4021bf627c50''::uuid)';
begin
  for p in select tablename, policyname, qual, with_check from pg_policies
            where schemaname = 'public'
              and coalesce(qual, '') || coalesce(with_check, '') like '%208a0172-b9f8-49e4-8eab-4021bf627c50%'
  loop
    if p.with_check is null then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename,
        replace(p.qual, clause, ''));
    else
      execute format('alter policy %I on public.%I using (%s) with check (%s)', p.policyname, p.tablename,
        replace(p.qual, clause, ''), replace(p.with_check, clause, ''));
    end if;
  end loop;
  if exists (select 1 from pg_policies
              where coalesce(qual, '') || coalesce(with_check, '') like '%208a0172%'
                 or coalesce(qual, '') || coalesce(with_check, '') like '%''progressive''%') then
    raise exception 'A rule still names a company';
  end if;
end $$;

-- 4. SECURITY DEFINER functions -------------------------------------------------
create or replace function public.business_conversation(negotiation text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
 if app_private.staff_role() is null then raise exception 'Office login required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'direction',direction,'from_type',from_type,'text',text,'sent_at',sent_at) order by sent_at),'[]')
 from public.thumbtack_messages where tenant_id=app_private.caller_company() and negotiation_id=negotiation);
end $$;

create or replace function public.business_rows(resource text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare role_name text := app_private.staff_role(); row_value jsonb; result jsonb := '[]'; company uuid := app_private.caller_company();
begin
 if role_name is null or company is null then raise exception 'Office login required' using errcode='42501'; end if;
 if resource <> all(array['jobs','saved_estimates','facilities','vehicles','material_pricing_rules',
 'volume_benchmarks','pricing_defaults','pricebook_items','pricebook_categories','app_leads_v']) then
 raise exception 'Invalid resource' using errcode='22023'; end if;
 for row_value in execute format('select to_jsonb(t) from public.%I t where tenant_id=%L::uuid',resource,company) loop
 if role_name <> 'owner' then
 case resource
 when 'jobs' then row_value := jsonb_build_object('data',app_private.office_job(row_value->'data'));
 when 'saved_estimates' then row_value := jsonb_build_object('data',app_private.office_estimate(row_value->'data'));
 when 'facilities' then row_value := app_private.pick_fields(row_value,array['id','facility_name','facility_type','address','city','state','zip','phone','website','latitude','longitude','accepted_materials','rejected_materials','hours','last_verified_date','is_default','is_active']);
 when 'vehicles' then row_value := app_private.pick_fields(row_value,array['id','vehicle_name','vehicle_type','usable_cubic_yards','max_payload_lbs','empty_weight_lbs','gvwr_lbs','has_liftgate','has_dump_capability','requires_tow_vehicle','is_default','is_active','is_template']);
 when 'material_pricing_rules' then row_value := app_private.pick_fields(row_value,array['id','material_name','material_category','default_density_lbs_per_yard','density_range_min','density_range_max','pricing_mode','requires_weight_override','preferred_facility_types','is_active']);
 when 'volume_benchmarks' then row_value := app_private.pick_fields(row_value,array['id','label','fraction','price']);
 when 'pricing_defaults' then continue;
 when 'pricebook_categories' then row_value := app_private.pick_fields(row_value,array['id','name','description','image_name','mode','sort_order','tenant_id']);
 when 'pricebook_items' then row_value := app_private.pick_fields(row_value,array['id','name','model_number','price','category_id','item_type','description','image_name','crew_size','price_unit','price_note','mode','photo_required','add_to_online_booking','taxable','tenant_id']);
 when 'app_leads_v' then row_value := app_private.pick_fields(row_value,array[
 'tenant_id','negotiation_id','lead_id','customer_name','customer_phone','phone_is_relay','customer_email',
 'category','city','state','received_at','status','kind','booked_at','booked_via','hcp_job_id',
 'escalated_at','tv_install_referral','quoted_price','last_outbound_text','last_message_at',
 'lead_count_for_phone','first_response_latency_ms','source','hcp_job_count','last_job_date']);
 end case;
 end if;
 result := result || jsonb_build_array(row_value);
 end loop;
 return result;
end $$;

-- Reports: the requested company (slug or id) must be the caller's own.
create or replace function public.dashboard_metrics(p_tenant text, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare company uuid := app_private.caller_company();
begin
 if p_date is null or company is null
    or not exists(select 1 from public.companies c where c.id=company and (c.slug=p_tenant or c.id::text=p_tenant)) then
   raise exception 'Invalid report parameters' using errcode='22023'; end if;
 perform app_private.reserve_dashboard(1);
 return app_private.visible_dashboard(company::text,p_date);
end $$;

create or replace function public.dashboard_metrics_series(p_tenant text, p_date date, p_days integer default 8)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare company uuid := app_private.caller_company();
begin
 if p_date is null or p_days is null or p_days<1 or p_days>90 or company is null
    or not exists(select 1 from public.companies c where c.id=company and (c.slug=p_tenant or c.id::text=p_tenant)) then
   raise exception 'Report range must be 1 to 90 days' using errcode='22023'; end if;
 perform app_private.reserve_dashboard(p_days);
 return (select coalesce(jsonb_agg(app_private.visible_dashboard(company::text,d::date) order by d),'[]')
 from generate_series((p_date-(p_days-1))::timestamp,p_date::timestamp,interval '1 day') g(d));
end $$;

create or replace function public.get_driver_facilities()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'facilityName',facility_name,'address',address,'city',city)),'[]'::jsonb)
 from public.facilities where is_active and app_private.driver_session() is not null
   and tenant_id = app_private.caller_company();
$$;

create or replace function public.job_customer_notifications(target_job_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if app_private.staff_role() is null then raise exception 'Office login required' using errcode='42501'; end if;
  if not app_private.company_job(target_job_id) then raise exception 'Job not found' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('kind',n.kind,'status',n.status,'channel',n.channel,
      'reason',n.reason,'body',n.body,'sendAfter',n.send_after,'sentAt',n.sent_at,'createdAt',n.created_at) order by n.created_at)
    from public.customer_notifications n where n.job_id=target_job_id), '[]'::jsonb);
end $$;

create or replace function public.job_time_summary(target_job_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if app_private.staff_role() is distinct from 'owner' then raise exception 'Owner access required' using errcode='42501'; end if;
  if not app_private.company_job(target_job_id) then raise exception 'Job not found' using errcode='22023'; end if;
  return app_private.job_time(target_job_id);
end $$;

create or replace function public.labor_hours_series(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare company uuid := app_private.caller_company();
begin
  if app_private.staff_role() is distinct from 'owner' then raise exception 'Owner access required' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Invalid range' using errcode='22023'; end if;
  return jsonb_build_object(
    'trackingSince', (select min((occurred_at at time zone 'America/Phoenix')::date) from public.job_time_events where kind<>'reminder' and tenant_id=company),
    'days', coalesce((select jsonb_agg(jsonb_build_object('date',d,'hours',h,'jobs',n) order by d) from (
      select ((t->>'completedAt')::timestamptz at time zone 'America/Phoenix')::date d,
        round(sum((t->>'laborHours')::numeric),2) h, count(*) n
      from (select app_private.job_time(id) t from (select distinct job_id id from public.job_time_events where tenant_id=company) j) x
      where t->>'laborHours' is not null
      group by 1) s where d between p_from and p_to), '[]'::jsonb));
end $$;

create or replace function public.office_delete_record(resource text, record_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
 if app_private.staff_role() is distinct from 'office' then raise exception 'Office role required' using errcode='42501'; end if;
 if resource <> all(array['jobs','saved_estimates']) then raise exception 'Invalid resource' using errcode='22023'; end if;
 execute format('delete from public.%I where id=$1 and tenant_id=$2',resource) using record_id, app_private.caller_company();
end $$;

create or replace function public.office_save_estimate(value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare original jsonb; owner_company uuid; company uuid := app_private.caller_company();
  merged jsonb; trusted_quote jsonb; service_cost numeric; estimate_id text := value->>'id';
begin
 if app_private.staff_role() is distinct from 'office' then raise exception 'Office role required' using errcode='42501'; end if;
 if estimate_id is null or length(estimate_id)>200 or jsonb_typeof(value)<>'object' then raise exception 'Invalid estimate' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('office-estimate:'||estimate_id,0));
 select data, tenant_id into original, owner_company from public.saved_estimates where id=estimate_id for update;
 if owner_company is not null and owner_company is distinct from company then raise exception 'Invalid estimate' using errcode='22023'; end if;
 merged := coalesce(original,'{}') || app_private.office_estimate(value);
 -- Preserve the financial portion of a service snapshot too.
 if original ? 'service' and merged ? 'service' then merged := jsonb_set(merged,'{service}',(original->'service')||(merged->'service')); end if;
 if value ? 'quoteId' then
 select q.data into trusted_quote from app_private.office_quotes q
 join public.staff_sessions ss on ss.staff_id=q.staff_id
 join app_private.identity_bindings b on b.staff_token=ss.token
 where b.auth_user_id=auth.uid() and q.id=(value->>'quoteId')::uuid and q.expires_at>now();
 if trusted_quote is null then raise exception 'Invalid or expired quote; calculate again' using errcode='22023'; end if;
 merged := merged || app_private.pick_fields(trusted_quote,array['disposalCost','laborCost','fuelCost',
 'vehicleCost','extraFeesTotal','baseCost','recommendedQuote','minimumQuote','heavyBedload']);
 elsif original is null and coalesce(value->>'mode','junk')='junk' then
 raise exception 'Server quote required' using errcode='42501';
 end if;
 if original is null and value->>'mode' in ('service','moving') then
 if exists(select 1 from jsonb_array_elements(coalesce(value->'service'->'lineItems','[]')) l
 where not exists(select 1 from public.pricebook_items p where p.id=l->>'itemId' and p.tenant_id=company)) then
 raise exception 'Invalid pricebook item' using errcode='22023'; end if;
 select round(coalesce(sum(p.price*greatest(0,(l->>'quantity')::numeric)*(1-coalesce(p.margin_decimal,0))),0),2)
 into service_cost from jsonb_array_elements(coalesce(value->'service'->'lineItems','[]')) l
 join public.pricebook_items p on p.id=l->>'itemId' and p.tenant_id=company;
 merged := merged || jsonb_build_object('baseCost',service_cost);
 merged := jsonb_set(merged,'{service}',(merged->'service')||jsonb_build_object('estimatedCost',service_cost));
 end if;
 if merged ? 'baseCost' then
 merged := merged || jsonb_build_object('grossProfitDollars',(merged->>'finalQuote')::numeric-(merged->>'baseCost')::numeric,
 'grossMarginDecimal',case when (merged->>'finalQuote')::numeric>0 then
 1-(merged->>'baseCost')::numeric/(merged->>'finalQuote')::numeric else 0 end);
 end if;
 if coalesce((merged->>'finalQuote')::numeric,0)<0 then raise exception 'Invalid quote' using errcode='22023'; end if;
 insert into public.saved_estimates(id,created_by,customer_name,job_address,material_type,vehicle_id,facility_id,final_quote,data,tenant_id)
 values(estimate_id,auth.uid(),merged->>'customerName',merged->>'jobAddress',merged->>'materialType',
 merged->>'vehicleId',merged->>'facilityId',(merged->>'finalQuote')::numeric,merged,company)
 on conflict(id) do update set customer_name=excluded.customer_name,job_address=excluded.job_address,
 final_quote=excluded.final_quote,data=excluded.data,updated_at=now();
end $$;

create or replace function public.office_save_job(value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare original jsonb; owner_company uuid; company uuid := app_private.caller_company();
  merged jsonb; estimate_data jsonb; job_id text := value->>'id';
begin
 if app_private.staff_role() is distinct from 'office' then raise exception 'Office role required' using errcode='42501'; end if;
 if job_id is null or length(job_id)>200 or jsonb_typeof(value)<>'object' then raise exception 'Invalid job' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('office-job:'||job_id,0));
 select data, tenant_id into original, owner_company from public.jobs where id=job_id for update;
 if owner_company is not null and owner_company is distinct from company then raise exception 'Invalid job' using errcode='22023'; end if;
 merged := coalesce(original,'{}') || app_private.office_job(value);
 if coalesce((merged->>'quotedAmount')::numeric,0)<0 then raise exception 'Invalid quote' using errcode='22023'; end if;
 if original is null and merged->>'sourceEstimateId' is not null then
 select data into estimate_data from public.saved_estimates where id=merged->>'sourceEstimateId' and tenant_id=company;
 if estimate_data ? 'baseCost' then
 merged := merged || jsonb_build_object('estimatedCost',estimate_data->'baseCost',
 'estimatedProfit',(merged->>'quotedAmount')::numeric-(estimate_data->>'baseCost')::numeric,
 'estimatedMarginDecimal',case when (merged->>'quotedAmount')::numeric>0 then
 1-(estimate_data->>'baseCost')::numeric/(merged->>'quotedAmount')::numeric else 0 end);
 end if;
 end if;
 merged := merged || jsonb_build_object('updatedAt',now());
 insert into public.jobs(id,created_by,job_number,source,estimate_id,customer_name,status,payment_status,scheduled_start,quoted_amount,data,tenant_id)
 values(job_id,auth.uid(),merged->>'jobNumber',coalesce(merged->>'source','manual'),merged->>'sourceEstimateId',
 merged->>'customerName',coalesce(merged->>'status','open'),coalesce(original->>'paymentStatus','unpaid'),
 (merged->>'scheduledStart')::timestamptz,(merged->>'quotedAmount')::numeric,merged,company)
 on conflict(id) do update set job_number=excluded.job_number,customer_name=excluded.customer_name,
 status=excluded.status,scheduled_start=excluded.scheduled_start,quoted_amount=excluded.quoted_amount,
 data=excluded.data,updated_at=now();
end $$;

create or replace function public.owner_set_job_time(target_job_id text, which text, at_time timestamp with time zone, reason text default null::text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare email text; current_value timestamptz; job_company uuid;
begin
  if app_private.staff_role() is distinct from 'owner' then raise exception 'Owner access required' using errcode='42501'; end if;
  if which not in ('start','complete') or at_time is null then raise exception 'Invalid time edit' using errcode='22023'; end if;
  select tenant_id into job_company from public.jobs where id=target_job_id and tenant_id=app_private.caller_company();
  if job_company is null then raise exception 'Job not found' using errcode='22023'; end if;
  select s.email into email from app_private.identity_bindings b
    join public.staff_sessions ss on ss.token=b.staff_token join public.staff s on s.id=ss.staff_id
    where b.auth_user_id=auth.uid();
  current_value := ((app_private.job_time(target_job_id))->>(case which when 'start' then 'startedAt' else 'completedAt' end))::timestamptz;
  insert into public.job_time_events(job_id,kind,source,staff_email,occurred_at,previous_at,note,tenant_id)
    values(target_job_id,which,'owner',email,at_time,current_value,nullif(btrim(coalesce(reason,'')),''),job_company);
  return app_private.job_time(target_job_id);
end $$;

create or replace function public.driver_update_ticket_row(target_job_id text, collection text, row_id text, patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare allowed text[]; current_rows jsonb; next_rows jsonb; matched boolean;
begin
  if not app_private.assigned_job(target_job_id) then raise exception 'Assigned driver required' using errcode='42501'; end if;
  allowed := case collection
    when 'stops' then array['status','arrivedAt','completedAt']
    when 'items' then array['status']
    when 'disposalEvents' then array['status','facilityId','facilityName','facilityAddress','arrivedAt','unloadingStartedAt','unloadingCompletedAt','departedAt']
    else null end;
  if allowed is null or row_id is null or patch is null or jsonb_typeof(patch)<>'object' then
    raise exception 'Invalid ticket update' using errcode='22023';
  end if;
  if collection='stops' and patch ? 'status' and patch->>'status' not in ('pending','en_route','arrived','in_progress','completed') then
    raise exception 'Invalid stop status' using errcode='22023';
  end if;
  if collection='items' and patch ? 'status' and patch->>'status' not in ('pending','loaded','delivered','completed','missing','damaged') then
    raise exception 'Invalid item status' using errcode='22023';
  end if;
  if collection='disposalEvents' and patch ? 'status' and patch->>'status' not in ('planned','en_route','arrived','unloading','completed','rejected') then
    raise exception 'Invalid disposal status' using errcode='22023';
  end if;
  if collection='disposalEvents' and patch ? 'facilityId' and not exists(select 1 from public.facilities
      where id=patch->>'facilityId' and is_active and tenant_id=app_private.caller_company()) then
    raise exception 'Unknown facility' using errcode='22023';
  end if;

  select data->collection into current_rows from public.jobs where id=target_job_id for update;
  if not app_private.assigned_job(target_job_id) then raise exception 'Assigned driver required' using errcode='42501'; end if;
  if current_rows is null or jsonb_typeof(current_rows)<>'array' then raise exception 'Row not found' using errcode='22023'; end if;

  select jsonb_agg(case when r->>'id'=row_id then r || app_private.pick_fields(patch,allowed) || jsonb_build_object('updatedAt',now()) else r end order by ord),
         bool_or(r->>'id'=row_id)
    into next_rows, matched
    from jsonb_array_elements(current_rows) with ordinality t(r,ord);
  if not coalesce(matched,false) then raise exception 'Row not found' using errcode='22023'; end if;

  update public.jobs
    set data=jsonb_set(jsonb_set(data,array[collection],next_rows),'{updatedAt}',to_jsonb(now())), updated_at=now()
    where id=target_job_id;
end $$;

create or replace function public.driver_create_thread(kind text, target_job_id text default null::text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare employee text:=app_private.driver_employee(); result uuid; thread_company uuid;
begin
  if employee is null then raise exception 'Driver login required' using errcode='42501'; end if;
  if kind not in ('direct','job') or kind is null or (kind='job' and not app_private.assigned_job(target_job_id)) then
    raise exception 'Invalid conversation' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('driver-thread:'||employee||':'||kind||':'||coalesce(target_job_id,''),0));
  select t.id into result from public.dispatch_threads t
  join public.dispatch_thread_participants p on p.thread_id=t.id and p.employee_id=employee
  where t.thread_type=kind and not t.archived and (kind='direct' or t.job_id=target_job_id)
    and t.tenant_id=app_private.caller_company() limit 1;
  if result is null then
    thread_company := case when kind='job' then (select j.tenant_id from public.jobs j where j.id=target_job_id) else app_private.require_company() end;
    insert into public.dispatch_threads(thread_type,job_id,title,created_by,tenant_id)
      values(kind,case when kind='job' then target_job_id end,case when kind='job' then 'Job conversation' else 'Dispatch' end,employee,thread_company)
      returning id into result;
    insert into public.dispatch_thread_participants(thread_id,employee_id,tenant_id) values(result,employee,thread_company);
    if kind='job' then
      insert into public.dispatch_thread_participants(thread_id,employee_id,tenant_id)
      select distinct result,a.employee_id,thread_company from public.driver_activations a
      join public.jobs j on j.id=target_job_id
      where a.status='activated' and a.tenant_id=thread_company
        and app_private.job_has_employee(j.data, a.employee_id, a.employee_name)
      on conflict(thread_id,employee_id) do nothing;
    end if;
  end if;
  return result;
end $$;

-- 5. Job photo files ------------------------------------------------------------
alter policy job_photo_identity on storage.objects
  using ((bucket_id <> 'job-photos')
         or (app_private.staff_role() is not null and app_private.company_job(split_part(name, '/', 1)))
         or app_private.assigned_job(split_part(name, '/', 1)))
  with check ((bucket_id <> 'job-photos')
         or (app_private.staff_role() is not null and app_private.company_job(split_part(name, '/', 1)))
         or app_private.assigned_job(split_part(name, '/', 1)));

-- 6. profiles: own row only -----------------------------------------------------
create policy own_profile on public.profiles as restrictive for all to anon, authenticated
  using (id = auth.uid()) with check (id = auth.uid());

commit;
