-- DASHBOARD_LEADS_SPEC v1 (2026-09-04) — applied to rejunk-prod (iozmgsopcyezkntnqbgj)
-- via the Supabase MCP on 2026-09-04. Additive only: no rejunk-prod table is
-- dropped or altered destructively. The app's own tables were already on
-- rejunk-prod (all 14 app migrations applied there 2026-06-13).
--
--  1. hcp_appointments gains job dollars (total_amount / paid_amount, in
--     DOLLARS — the HCP payload carries cents) + completed_at.
--  2. Read-only RLS for `authenticated` on the webhook-owned tables the app
--     reads. thumbtack_leads / thumbtack_messages previously had an ALL policy
--     for authenticated (browser could write them) — tightened to SELECT.
--  3. app_leads_v — one row per Thumbtack negotiation for Clients & Leads.
--  4. dashboard_metrics(tenant, date) + dashboard_metrics_series(...) — one
--     call feeds every Dashboard tile.
--  5. Fleet seed into `vehicles` (insert-only, never overwrites).

-- ---------------------------------------------------------------- 1. dollars
alter table public.hcp_appointments
  add column if not exists total_amount numeric,
  add column if not exists paid_amount numeric,
  add column if not exists completed_at timestamptz;

comment on column public.hcp_appointments.total_amount is
  'Job total in dollars (HCP job.total_amount / 100). NULL = not captured yet.';
comment on column public.hcp_appointments.paid_amount is
  'Collected in dollars ((total_amount - outstanding_balance) / 100). NULL = not captured yet.';
comment on column public.hcp_appointments.completed_at is
  'HCP work_timestamps.completed_at; falls back to the job.completed event time.';

-- ---------------------------------------------------------------- 2. RLS (read-only)
drop policy if exists thumbtack_leads_rw_auth on public.thumbtack_leads;
drop policy if exists thumbtack_leads_read_auth on public.thumbtack_leads;
create policy thumbtack_leads_read_auth on public.thumbtack_leads
  for select to authenticated using (true);

drop policy if exists thumbtack_messages_rw_auth on public.thumbtack_messages;
drop policy if exists thumbtack_messages_read_auth on public.thumbtack_messages;
create policy thumbtack_messages_read_auth on public.thumbtack_messages
  for select to authenticated using (true);

drop policy if exists bookings_read_auth on public.bookings;
create policy bookings_read_auth on public.bookings
  for select to authenticated using (true);

drop policy if exists hcp_appointments_read_auth on public.hcp_appointments;
create policy hcp_appointments_read_auth on public.hcp_appointments
  for select to authenticated using (true);

drop policy if exists voice_calls_read_auth on public.voice_calls;
create policy voice_calls_read_auth on public.voice_calls
  for select to authenticated using (true);

drop policy if exists reviews_received_read_auth on public.reviews_received;
create policy reviews_received_read_auth on public.reviews_received
  for select to authenticated using (true);

drop policy if exists review_requests_sent_read_auth on public.review_requests_sent;
create policy review_requests_sent_read_auth on public.review_requests_sent
  for select to authenticated using (true);

drop policy if exists capacity_resources_read_auth on public.capacity_resources;
create policy capacity_resources_read_auth on public.capacity_resources
  for select to authenticated using (true);

-- ---------------------------------------------------------------- 3. app_leads_v
-- One row per Thumbtack negotiation. "Booked" truth = thumbtack_leads.booked_at
-- (voice/chat bookings) OR a negotiation_job_map link to an HCP job (HCP's
-- native Thumbtack import — today the only populated source). Relay numbers:
-- the pipeline's RELAY_PREFIXES (669315, 669669) plus the 9787xx block that
-- Thumbtack has been issuing since July. There is no customer email anywhere
-- in the pipeline tables, so customer_email is NULL for now.
create or replace view public.app_leads_v
with (security_invoker = false) as
with last_msg as (
  select tenant_id, negotiation_id,
         max(coalesce(sent_at, created_at)) as last_message_at
  from public.thumbtack_messages
  group by 1, 2
),
last_out as (
  select distinct on (tenant_id, negotiation_id)
         tenant_id, negotiation_id, text
  from public.thumbtack_messages
  where direction = 'outbound'
  order by tenant_id, negotiation_id, coalesce(sent_at, created_at) desc
),
njm as (
  select distinct on (tenant_id, negotiation_id)
         tenant_id, negotiation_id, hcp_job_id, created_at
  from public.negotiation_job_map
  where hcp_job_id is not null
  order by tenant_id, negotiation_id, created_at
),
phone_counts as (
  select tenant_id, customer_phone, count(*)::int as n
  from public.thumbtack_leads
  where customer_phone is not null
  group by 1, 2
)
select
  l.tenant_id,
  l.negotiation_id,
  l.id                                   as lead_id,
  l.customer_name,
  l.customer_phone,
  (l.customer_phone ~ '^(669315|669669|9787)') as phone_is_relay,
  null::text                             as customer_email,
  l.category,
  l.location_city                        as city,
  l.location_state                       as state,
  l.received_at,
  case
    when l.booked_at is not null or njm.hcp_job_id is not null then 'booked'
    when l.outcome = 'lost' or l.disposition = 'declined'        then 'lost'
    when l.escalated_at is not null                              then 'escalated'
    when l.status = 'responded'                                  then 'quoted'
    else 'new'
  end                                    as status,
  case
    when l.booked_at is not null or njm.hcp_job_id is not null then 'client'
    else 'lead'
  end                                    as kind,
  coalesce(l.booked_at, njm.created_at)  as booked_at,
  coalesce(l.booked_via,
           case when njm.hcp_job_id is not null then 'hcp' end) as booked_via,
  coalesce(l.hcp_job_id, njm.hcp_job_id) as hcp_job_id,
  l.escalated_at,
  l.tv_install_referral,
  l.lead_price,
  l.lead_price_num,
  l.quoted_price,
  left(lo.text, 160)                     as last_outbound_text,
  lm.last_message_at,
  coalesce(pc.n, 1)                      as lead_count_for_phone,
  l.first_response_latency_ms
from public.thumbtack_leads l
left join last_msg lm on lm.tenant_id = l.tenant_id and lm.negotiation_id = l.negotiation_id
left join last_out lo on lo.tenant_id = l.tenant_id and lo.negotiation_id = l.negotiation_id
left join njm       on njm.tenant_id = l.tenant_id and njm.negotiation_id = l.negotiation_id
left join phone_counts pc on pc.tenant_id = l.tenant_id and pc.customer_phone = l.customer_phone;

grant select on public.app_leads_v to authenticated;
revoke all on public.app_leads_v from anon;

-- ---------------------------------------------------------------- 4. dashboard_metrics
-- One row of tile values for one Phoenix calendar day. NULL means "no data"
-- (the page renders "—"); 0 is a real zero. Amount tiles are NULL until at
-- least one completed job that day has a captured total_amount.
create or replace function public.dashboard_metrics(p_tenant text, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tz constant text := 'America/Phoenix';
  v_jobs int; v_jobs_with_amount int; v_rev numeric; v_paid numeric;
  v_leads int; v_repeat int; v_booked int;
  v_close_booked int; v_close_recv int;
  v_median numeric;
  v_reviews int; v_calls int; v_calls_booked int;
  v_capacity jsonb;
begin
  select count(*), count(total_amount), sum(total_amount), sum(paid_amount)
    into v_jobs, v_jobs_with_amount, v_rev, v_paid
  from hcp_appointments
  where tenant_id = p_tenant
    and status = 'completed' and canceled = false
    and coalesce((completed_at at time zone tz)::date, scheduled_date) = p_date;

  select count(*) into v_leads
  from thumbtack_leads
  where tenant_id = p_tenant and (received_at at time zone tz)::date = p_date;

  select count(*) into v_repeat
  from thumbtack_leads l
  where l.tenant_id = p_tenant
    and (l.received_at at time zone tz)::date = p_date
    and l.customer_phone is not null
    and exists (
      select 1 from thumbtack_leads e
      where e.tenant_id = l.tenant_id
        and e.customer_phone = l.customer_phone
        and e.received_at < l.received_at
    );

  select count(*) into v_booked
  from app_leads_v
  where tenant_id = p_tenant
    and booked_at is not null
    and (booked_at at time zone tz)::date = p_date;

  -- Rolling 30-day close rate: of the leads received in the window, how many booked.
  select count(*) filter (where booked_at is not null), count(*)
    into v_close_booked, v_close_recv
  from app_leads_v
  where tenant_id = p_tenant
    and (received_at at time zone tz)::date between p_date - 29 and p_date;

  select percentile_cont(0.5) within group (order by first_response_latency_ms)
    into v_median
  from thumbtack_leads
  where tenant_id = p_tenant
    and (received_at at time zone tz)::date = p_date
    and first_response_latency_ms is not null;

  select count(*) into v_reviews
  from reviews_received
  where tenant_id = p_tenant
    and (coalesce(received_at, created_at) at time zone tz)::date = p_date;

  select count(*), count(*) filter (where outcome = 'booked')
    into v_calls, v_calls_booked
  from voice_calls
  where tenant_id = p_tenant and (created_at at time zone tz)::date = p_date;

  -- Per-resource capacity for the day. Voice bookings also create an
  -- hcp_appointments row (source 'voice'), so counting the ledger alone
  -- avoids double-counting `bookings`. Half-day resources have 2 parts/unit.
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', r.slug, 'label', r.label, 'granularity', r.granularity,
           'units', r.units, 'booked', b.booked,
           'open', greatest(0, (case when r.granularity = 'halfday' then 2 else 1 end) * r.units - b.booked)
         ) order by r.sort_order), '[]'::jsonb)
    into v_capacity
  from capacity_resources r
  cross join lateral (
    select count(*)::int as booked
    from hcp_appointments a
    where a.tenant_id = r.tenant_id and a.resource = r.slug
      and a.canceled = false and a.status <> 'canceled'
      and a.scheduled_date = p_date
  ) b
  where r.tenant_id = p_tenant and r.active;

  return jsonb_build_object(
    'date',                   p_date,
    'revenue',                case when v_jobs_with_amount > 0 then v_rev end,
    'collected',              case when v_jobs_with_amount > 0 then v_paid end,
    'jobs_completed',         v_jobs,
    'jobs_with_amount',       v_jobs_with_amount,
    'avg_job_size',           case when v_jobs_with_amount > 0 then round(v_rev / v_jobs_with_amount, 2) end,
    'new_leads',              v_leads,
    'repeat_customers',       v_repeat,
    'leads_booked',           v_booked,
    'booking_rate',           case when v_leads > 0 then round(v_booked::numeric / v_leads, 4) end,
    'close_rate_30d',         case when v_close_recv > 0 then round(v_close_booked::numeric / v_close_recv, 4) end,
    'close_booked_30d',       v_close_booked,
    'close_received_30d',     v_close_recv,
    'first_reply_median_sec', case when v_median is not null then round(v_median / 1000.0, 1) end,
    'reviews_received',       v_reviews,
    'voice_calls',            v_calls,
    'voice_calls_booked',     v_calls_booked,
    'capacity',               v_capacity
  );
end;
$$;

-- Trailing window ending on p_date (oldest first) — one call for the tiles,
-- the "vs prior day" delta, and the sparklines.
create or replace function public.dashboard_metrics_series(p_tenant text, p_date date, p_days int default 8)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(public.dashboard_metrics(p_tenant, d) order by d), '[]'::jsonb)
  from generate_series(p_date - (greatest(p_days, 1) - 1), p_date, interval '1 day') as g(d);
$$;

revoke all on function public.dashboard_metrics(text, date) from public, anon;
revoke all on function public.dashboard_metrics_series(text, date, int) from public, anon;
grant execute on function public.dashboard_metrics(text, date) to authenticated, service_role;
grant execute on function public.dashboard_metrics_series(text, date, int) to authenticated, service_role;

-- ---------------------------------------------------------------- 5. fleet seed
-- From "Fleet - Sheet1.csv" (kept out of the public repo). Insert-only: an
-- existing row with the same id is never touched. Sedans (SED-01/02) are not
-- hauling vehicles and are not seeded. Specs copied from the generic
-- template rows already in the table (mpg / costs) so estimates keep working.
insert into public.vehicles
  (id, vehicle_name, vehicle_type, usable_cubic_yards, max_payload_lbs, gvwr_lbs,
   fuel_type, mpg_unloaded, mpg_loaded, hourly_vehicle_cost, mileage_cost,
   has_liftgate, has_dump_capability, requires_tow_vehicle, notes, is_default, is_active)
select v.id, v.vehicle_name, v.vehicle_type, v.usable_cubic_yards, v.max_payload_lbs, v.gvwr_lbs,
       t.fuel_type, t.mpg_unloaded, t.mpg_loaded, t.hourly_vehicle_cost, t.mileage_cost,
       v.has_liftgate, false, false, v.notes, false, v.is_active
from (values
  ('spr-01', 'SPR-01 · 2025 Ford Transit T-250 Cargo Van', 'cargo_van', 9.1, 3880, 8800, false,
   'VIN 1FTBR1C82SKA62187 · Plate P2A743 · Progressive Ins 862788278 · Location DTC · Status: AVAILABLE', true, 'ford-transit-t250'),
  ('spr-02', 'SPR-02 · 2025 Ford Transit T-250 Cargo Van', 'cargo_van', 9.1, 3880, 8800, false,
   'VIN 1FTBR1C84SKA76169 · Plate P2A943 · Progressive Ins 862788278 · Location DTC · Status: TURO UNTIL MAY 2026', true, 'ford-transit-t250'),
  ('spr-06', 'SPR-06 · 2025 Ford Transit T-250 Cargo Van', 'cargo_van', 9.1, 3880, 8800, false,
   'VIN 1FBAX2C87SKB27353 · Plate 46A6G3 · Status: AVAILABLE', true, 'ford-transit-t250'),
  ('spr-03', 'SPR-03 · 2025 Ram ProMaster 1500 Cargo Van', 'cargo_van', 9.7, 4160, 8550, false,
   'VIN 3C6LRVNG3SE550591 · Plate LPA663 (exp 9/15/2026) · Geico Commercial · Location DTC · Status: AVAILABLE NOW', true, 'promaster-1500'),
  ('spr-04', 'SPR-04 · 2025 Ram ProMaster 1500 Cargo Van', 'cargo_van', 9.7, 4160, 8550, false,
   'VIN 3C6LRVNG5SE550592 · Plate LTA553 (exp 9/15/2026) · Geico Commercial · Location Tucson · Status: AVAILABLE-TUCSON', true, 'promaster-1500'),
  ('spr-05', 'SPR-05 · 2025 Ram ProMaster 1500 Cargo Van', 'cargo_van', 9.7, 4160, 8550, false,
   'VIN 3C6LRVAG2SE528488 · Plate L9A663 (exp 9/15/2026) · Geico Commercial · Location DTC · Status: DAMAGE TO BACK DOOR-NEEDS REPAIR', false, 'promaster-1500'),
  ('box-01', 'BOX-01 · 2022 IHC MV607 26-ft Box Truck', 'box_truck', 50, 10000, 25999, true,
   'VIN 3HAEUMML0NL390383 · Progressive Ins · Location Tucson · Box ~26 ft × 102 in × 102 in · Status: AVAILABLE', true, 'box-truck-liftgate')
) as v(id, vehicle_name, vehicle_type, usable_cubic_yards, max_payload_lbs, gvwr_lbs, has_liftgate, notes, is_active, template_id)
left join public.vehicles t on t.id = v.template_id
on conflict (id) do nothing;
