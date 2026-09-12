-- JOB_TICKET_REDESIGN_SPEC phase 0 (2026-09-12): employees on Supabase (D3) + fleet-only pickers (D4).
-- Additive. Applied to rejunk-prod through the Supabase MCP as `app_employees_fleet`.
--
--   * app_employees — app-owned, tenant-scoped snapshot table (EmployeeRecord in `data`, a few
--     scalar mirrors for SQL readability). Any bound office login (owner or office) reads/writes it;
--     drivers never touch it — their crew names are resolved inside get_driver_today.
--     New tables do not inherit the restrictive `business_identity_required` policy the
--     2026-09-10 loop created, so it is declared here explicitly.
--   * vehicles.is_template — marks the four generic pricing templates (Ford Transit, ProMaster,
--     Box Truck w/ Liftgate, 14K Dump Trailer). Pricing keeps reading them by id; ticket and
--     calendar pickers only show fleet units (SPR-01 … SPR-06, BOX-01).
--   * business_rows — office projection of `vehicles` gains `is_template`.
begin;

create table if not exists public.app_employees (
  id text primary key,
  tenant_id text not null default 'progressive',
  first_name text not null default '',
  last_name text not null default '',
  role text not null default 'Technician',
  status text not null default 'active',
  field_tech boolean not null default true,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_employees_tenant_idx on public.app_employees(tenant_id);

alter table public.app_employees enable row level security;
revoke all on public.app_employees from public, anon, authenticated;
grant select, insert, update, delete on public.app_employees to authenticated;
grant all on public.app_employees to service_role;
revoke truncate, references, trigger on public.app_employees from public, authenticated;

create policy office_employees on public.app_employees for all to authenticated
  using (app_private.staff_role() is not null and tenant_id = 'progressive')
  with check (app_private.staff_role() is not null and tenant_id = 'progressive');
create policy business_identity_required on public.app_employees as restrictive for all to anon, authenticated
  using (app_private.staff_role() is not null and tenant_id = 'progressive')
  with check (app_private.staff_role() is not null and tenant_id = 'progressive');

alter table public.vehicles add column if not exists is_template boolean not null default false;
update public.vehicles set is_template = true
  where id in ('ford-transit-t250', 'promaster-1500', 'box-truck-liftgate', '14k-dump-trailer');

-- Office projection of vehicles now carries is_template (everything else unchanged).
create or replace function public.business_rows(resource text) returns jsonb
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

commit;
