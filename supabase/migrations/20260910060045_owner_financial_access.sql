-- Additive phase: safe read/write APIs and owner payment storage.
begin;
create table public.app_payments(id text primary key, data jsonb not null, updated_at timestamptz not null default now());
alter table public.app_payments enable row level security;
revoke all on public.app_payments from public,anon,authenticated;
grant select,insert,update,delete on public.app_payments to authenticated;
grant all on public.app_payments to service_role;
create policy owner_payments on public.app_payments for all to authenticated
using(app_private.staff_role()='owner') with check(app_private.staff_role()='owner');

create table app_private.office_quotes(
 id uuid primary key default gen_random_uuid(),
 staff_id uuid not null references public.staff(id) on delete cascade,
 data jsonb not null, expires_at timestamptz not null default now()+interval '2 hours'
);
create index office_quotes_expiry_idx on app_private.office_quotes(expires_at);
alter table app_private.office_quotes enable row level security;
revoke all on app_private.office_quotes from public,anon,authenticated;
grant all on app_private.office_quotes to service_role;
create or replace function app_private.pick_fields(value jsonb, fields text[]) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,val),'{}'::jsonb)
 from jsonb_each(coalesce(value,'{}'::jsonb)) e(key,val) where key=any(fields);
$$;
revoke all on function app_private.pick_fields(jsonb,text[]) from public,anon,authenticated;

create function public.store_office_quote(staff_id uuid,quote_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare quote_id uuid;
begin
 delete from app_private.office_quotes where expires_at<now();
 insert into app_private.office_quotes(staff_id,data) values(staff_id,quote_data) returning id into quote_id;
 return quote_id;
end $$;
revoke all on function public.store_office_quote(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.store_office_quote(uuid,jsonb) to service_role;
-- Explicit projections: new fields stay private until reviewed.
create function app_private.office_job(value jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select app_private.pick_fields(value,array[
 'id','jobNumber','source','sourceEstimateId','createdAt','updatedAt','customerName',
 'jobLabel','leadSource','serviceType','priority','estimatedDurationMinutes','crewSequence',
 'crewSize','phone','email','address','city','state','zip','scheduledStart','scheduledEnd',
 'status','materialType','materialName','cubicYards','estimatedWeightLbs','estimatedTons',
 'facilityId','facilityName','vehicleId','vehicleName','quotedAmount','notes','internalNotes'])
 || case when value ? 'assignment' then jsonb_build_object('assignment',
 app_private.pick_fields(value->'assignment',array['employeeIds','crewLead','crewMembers','vehicleId','vehicleName'])) else '{}'::jsonb end;
$$;
create function app_private.office_estimate(value jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select app_private.pick_fields(value,array[
 'id','createdAt','updatedAt','customerName','jobAddress','deliveryAddress','loadLabel',
 'loadFraction','materialName','materialType','materialRuleId','vehicleName','vehicleId',
 'facilityName','facilityId','cubicYards','manualCubicYards','manualWeightLbs','estimatedWeightLbs',
 'estimatedTons','finalQuote','quoteRangeLower','quoteRangeUpper','workers','estimatedHours',
 'roundTripMiles','notes','mode','serviceType','crewSize'])
 || case when value ? 'service' then jsonb_build_object('service',
 app_private.pick_fields(value->'service',array['stairFloor','stairDirections','pickupStairFloor',
 'deliveryStairFloor','movingVehicle','routeMiles','routeDriveMinutes','itemsSubtotal',
 'discountApplied','discountAmount','itemsAfterDiscount','minimumApplied','stairSurcharge',
 'surchargesTotal','total','crewSize','photoRequired'])
 || jsonb_build_object('lineItems',(select coalesce(jsonb_agg(app_private.pick_fields(v,array[
 'itemId','name','unitPrice','priceUnit','quantity','lineTotal','crewSize','photoRequired','itemType'])),'[]')
 from jsonb_array_elements(coalesce(value->'service'->'lineItems','[]')) v),
 'surcharges',(select coalesce(jsonb_agg(app_private.pick_fields(v,array[
 'itemId','name','unitPrice','priceUnit','quantity','lineTotal','crewSize','photoRequired','itemType'])),'[]')
 from jsonb_array_elements(coalesce(value->'service'->'surcharges','[]')) v))) else '{}'::jsonb end;
$$;
revoke all on function app_private.office_job(jsonb),app_private.office_estimate(jsonb) from public,anon,authenticated;

create function public.business_rows(resource text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare role_name text := app_private.staff_role(); row_value jsonb; result jsonb := '[]'; where_sql text := '';
begin
 if role_name is null then raise exception 'Office login required' using errcode='42501'; end if;
 if resource <> all(array['jobs','saved_estimates','facilities','vehicles','material_pricing_rules',
 'volume_benchmarks','pricing_defaults','pricebook_items','pricebook_categories','app_leads_v']) then
 raise exception 'Invalid resource' using errcode='22023'; end if;
 if resource in ('pricebook_items','pricebook_categories','app_leads_v') then where_sql := ' where tenant_id=''progressive'''; end if;
 for row_value in execute format('select to_jsonb(t) from public.%I t%s',resource,where_sql) loop
 if role_name <> 'owner' then
 case resource
 when 'jobs' then row_value := jsonb_build_object('data',app_private.office_job(row_value->'data'));
 when 'saved_estimates' then row_value := jsonb_build_object('data',app_private.office_estimate(row_value->'data'));
 when 'facilities' then row_value := app_private.pick_fields(row_value,array['id','facility_name','facility_type','address','city','state','zip','phone','website','latitude','longitude','accepted_materials','rejected_materials','hours','last_verified_date','is_default','is_active']);
 when 'vehicles' then row_value := app_private.pick_fields(row_value,array['id','vehicle_name','vehicle_type','usable_cubic_yards','max_payload_lbs','empty_weight_lbs','gvwr_lbs','has_liftgate','has_dump_capability','requires_tow_vehicle','is_default','is_active']);
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
revoke all on function public.business_rows(text) from public,anon;
grant execute on function public.business_rows(text) to authenticated;

-- Office writes merge only editable operational/customer-price fields into the
-- locked original snapshot. Hidden costs and owner-only fields survive unchanged.
create function public.office_save_job(value jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare original jsonb; merged jsonb; estimate_data jsonb; job_id text := value->>'id';
begin
 if app_private.staff_role() is distinct from 'office' then raise exception 'Office role required' using errcode='42501'; end if;
 if job_id is null or length(job_id)>200 or jsonb_typeof(value)<>'object' then raise exception 'Invalid job' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('office-job:'||job_id,0));
 select data into original from public.jobs where id=job_id for update;
 merged := coalesce(original,'{}') || app_private.office_job(value);
 if coalesce((merged->>'quotedAmount')::numeric,0)<0 then raise exception 'Invalid quote' using errcode='22023'; end if;
 if original is null and merged->>'sourceEstimateId' is not null then
 select data into estimate_data from public.saved_estimates where id=merged->>'sourceEstimateId';
 if estimate_data ? 'baseCost' then
 merged := merged || jsonb_build_object('estimatedCost',estimate_data->'baseCost',
 'estimatedProfit',(merged->>'quotedAmount')::numeric-(estimate_data->>'baseCost')::numeric,
 'estimatedMarginDecimal',case when (merged->>'quotedAmount')::numeric>0 then
 1-(estimate_data->>'baseCost')::numeric/(merged->>'quotedAmount')::numeric else 0 end);
 end if;
 end if;
 merged := merged || jsonb_build_object('updatedAt',now());
 insert into public.jobs(id,created_by,job_number,source,estimate_id,customer_name,status,payment_status,scheduled_start,quoted_amount,data)
 values(job_id,auth.uid(),merged->>'jobNumber',coalesce(merged->>'source','manual'),merged->>'sourceEstimateId',
 merged->>'customerName',coalesce(merged->>'status','open'),coalesce(original->>'paymentStatus','unpaid'),
 (merged->>'scheduledStart')::timestamptz,(merged->>'quotedAmount')::numeric,merged)
 on conflict(id) do update set job_number=excluded.job_number,customer_name=excluded.customer_name,
 status=excluded.status,scheduled_start=excluded.scheduled_start,quoted_amount=excluded.quoted_amount,
 data=excluded.data,updated_at=now();
end $$;
revoke all on function public.office_save_job(jsonb) from public,anon;
grant execute on function public.office_save_job(jsonb) to authenticated;

create function public.office_save_estimate(value jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare original jsonb; merged jsonb; trusted_quote jsonb; service_cost numeric; estimate_id text := value->>'id';
begin
 if app_private.staff_role() is distinct from 'office' then raise exception 'Office role required' using errcode='42501'; end if;
 if estimate_id is null or length(estimate_id)>200 or jsonb_typeof(value)<>'object' then raise exception 'Invalid estimate' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('office-estimate:'||estimate_id,0));
 select data into original from public.saved_estimates where id=estimate_id for update;
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
 where not exists(select 1 from public.pricebook_items p where p.id=l->>'itemId' and p.tenant_id='progressive')) then
 raise exception 'Invalid pricebook item' using errcode='22023'; end if;
 select round(coalesce(sum(p.price*greatest(0,(l->>'quantity')::numeric)*(1-coalesce(p.margin_decimal,0))),0),2)
 into service_cost from jsonb_array_elements(coalesce(value->'service'->'lineItems','[]')) l
 join public.pricebook_items p on p.id=l->>'itemId' and p.tenant_id='progressive';
 merged := merged || jsonb_build_object('baseCost',service_cost);
 merged := jsonb_set(merged,'{service}',(merged->'service')||jsonb_build_object('estimatedCost',service_cost));
 end if;
 if merged ? 'baseCost' then
 merged := merged || jsonb_build_object('grossProfitDollars',(merged->>'finalQuote')::numeric-(merged->>'baseCost')::numeric,
 'grossMarginDecimal',case when (merged->>'finalQuote')::numeric>0 then
 1-(merged->>'baseCost')::numeric/(merged->>'finalQuote')::numeric else 0 end);
 end if;
 if coalesce((merged->>'finalQuote')::numeric,0)<0 then raise exception 'Invalid quote' using errcode='22023'; end if;
 insert into public.saved_estimates(id,created_by,customer_name,job_address,material_type,vehicle_id,facility_id,final_quote,data)
 values(estimate_id,auth.uid(),merged->>'customerName',merged->>'jobAddress',merged->>'materialType',
 merged->>'vehicleId',merged->>'facilityId',(merged->>'finalQuote')::numeric,merged)
 on conflict(id) do update set customer_name=excluded.customer_name,job_address=excluded.job_address,
 final_quote=excluded.final_quote,data=excluded.data,updated_at=now();
end $$;
revoke all on function public.office_save_estimate(jsonb) from public,anon;
grant execute on function public.office_save_estimate(jsonb) to authenticated;

-- Office conversation reads need text, never the provider's raw JSON payload.
create function public.business_conversation(negotiation text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if app_private.staff_role() is null then raise exception 'Office login required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'direction',direction,'from_type',from_type,'text',text,'sent_at',sent_at) order by sent_at),'[]')
 from public.thumbtack_messages where tenant_id='progressive' and negotiation_id=negotiation);
end $$;
revoke all on function public.business_conversation(text) from public,anon;
grant execute on function public.business_conversation(text) to authenticated;

create function public.office_delete_record(resource text,record_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if app_private.staff_role() is distinct from 'office' then raise exception 'Office role required' using errcode='42501'; end if;
 if resource <> all(array['jobs','saved_estimates']) then raise exception 'Invalid resource' using errcode='22023'; end if;
 execute format('delete from public.%I where id=$1',resource) using record_id;
end $$;
revoke all on function public.office_delete_record(text,text) from public,anon;
grant execute on function public.office_delete_record(text,text) to authenticated;
commit;
