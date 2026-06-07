-- Separate disposal trips from customer/service stops.

create table if not exists public.job_disposal_events (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs (id) on delete cascade,
  facility_id text,
  facility_name text,
  facility_address text,
  material_type text,
  sequence_number integer not null default 1,
  status text not null default 'planned' check (status in ('planned', 'en_route', 'arrived', 'unloading', 'completed', 'rejected', 'canceled')),
  planned boolean not null default false,
  arrived_at timestamptz,
  unloading_started_at timestamptz,
  unloading_completed_at timestamptz,
  departed_at timestamptz,
  gross_weight_lbs numeric,
  tare_weight_lbs numeric,
  net_weight_lbs numeric,
  net_weight_tons numeric,
  disposal_cost numeric,
  receipt_number text,
  scale_ticket_number text,
  receipt_photo_id uuid references public.job_photos (id) on delete set null,
  notes text,
  created_by uuid references public.employee_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, sequence_number)
);

create index if not exists job_disposal_events_job_idx on public.job_disposal_events (job_id);
create index if not exists job_disposal_events_facility_idx on public.job_disposal_events (facility_id);
create index if not exists job_disposal_events_status_idx on public.job_disposal_events (status);
create index if not exists job_disposal_events_created_idx on public.job_disposal_events (created_at);
create index if not exists job_disposal_events_job_sequence_idx on public.job_disposal_events (job_id, sequence_number);

drop trigger if exists set_updated_at_job_disposal_events on public.job_disposal_events;
create trigger set_updated_at_job_disposal_events before update on public.job_disposal_events
  for each row execute function public.set_updated_at();

alter table public.job_disposal_events enable row level security;

create policy "dispatch manages disposal events"
  on public.job_disposal_events for all to authenticated
  using (public.is_dispatch_user()) with check (public.is_dispatch_user());

create policy "assigned crew reads disposal events"
  on public.job_disposal_events for select to authenticated
  using (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id));

-- Idempotently convert old disposal stops into disposal events.
insert into public.job_disposal_events (
  job_id,
  facility_name,
  facility_address,
  sequence_number,
  status,
  planned,
  arrived_at,
  unloading_completed_at,
  notes,
  created_at,
  updated_at
)
select
  s.job_id,
  s.name,
  concat_ws(', ', nullif(s.address, ''), nullif(s.city, ''), nullif(s.state, ''), nullif(s.zip, '')),
  s.stop_order,
  case
    when s.status = 'completed' then 'completed'
    when s.status = 'arrived' then 'arrived'
    when s.status = 'en_route' then 'en_route'
    else 'planned'
  end,
  true,
  s.arrived_at,
  s.completed_at,
  s.instructions,
  s.created_at,
  s.updated_at
from public.job_stops s
where s.stop_type = 'disposal'
  and not exists (
    select 1
    from public.job_disposal_events e
    where e.job_id = s.job_id
      and e.sequence_number = s.stop_order
      and coalesce(e.facility_name, '') = coalesce(s.name, '')
  );

delete from public.job_stops
where stop_type = 'disposal';

with ranked as (
  select id, row_number() over (partition by job_id order by stop_order, created_at) as next_order
  from public.job_stops
  where stop_type <> 'disposal'
)
update public.job_stops s
set stop_order = ranked.next_order,
    updated_at = now()
from ranked
where s.id = ranked.id;

create or replace function public.driver_update_disposal_event_status(
  target_event_id uuid,
  next_status text,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_job_id text;
  actor uuid;
begin
  if next_status not in ('en_route', 'arrived', 'unloading', 'completed', 'rejected') then
    raise exception 'invalid driver disposal status %', next_status;
  end if;

  select job_id into target_job_id
  from public.job_disposal_events
  where id = target_event_id;

  if target_job_id is null or not public.current_user_is_assigned_to_job(target_job_id) then
    raise exception 'not authorized for disposal event %', target_event_id;
  end if;

  actor := public.current_employee_profile_id();

  update public.job_disposal_events
  set status = next_status,
      arrived_at = case when next_status = 'arrived' then now() else arrived_at end,
      unloading_started_at = case when next_status = 'unloading' then now() else unloading_started_at end,
      unloading_completed_at = case when next_status = 'completed' then now() else unloading_completed_at end,
      departed_at = case when next_status in ('completed', 'rejected') then now() else departed_at end,
      updated_at = now()
  where id = target_event_id;

  insert into public.job_activity (job_id, user_id, event_type, message, metadata)
  values (
    target_job_id,
    actor,
    'status_change',
    coalesce(note, 'Driver updated disposal event status.'),
    jsonb_build_object('disposal_event_id', target_event_id, 'disposal_status', next_status)
  );
end;
$$;

create or replace function public.get_driver_today()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with assigned_jobs as (
    select j.*
    from public.jobs j
    where public.current_user_is_assigned_to_job(j.id)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'job', jsonb_build_object(
        'id', j.id,
        'jobNumber', j.job_number,
        'source', j.source,
        'createdAt', j.created_at,
        'updatedAt', j.updated_at,
        'customerName', j.customer_name,
        'jobLabel', j.data->>'jobLabel',
        'phone', j.data->>'phone',
        'email', j.data->>'email',
        'address', j.data->>'address',
        'city', j.data->>'city',
        'state', j.data->>'state',
        'zip', j.data->>'zip',
        'scheduledStart', j.scheduled_start,
        'scheduledEnd', j.data->>'scheduledEnd',
        'status', j.status,
        'paymentStatus', null,
        'materialType', j.data->>'materialType',
        'materialName', j.data->>'materialName',
        'vehicleId', j.data->>'vehicleId',
        'vehicleName', j.data->>'vehicleName',
        'assignment', coalesce(j.data->'assignment', '{}'::jsonb),
        'notes', j.data->>'notes',
        'internalNotes', j.data->>'internalNotes',
        'serviceType', coalesce(j.service_type, j.data->>'serviceType')
      ),
      'stops', coalesce((select jsonb_agg(to_jsonb(s) order by s.stop_order) from public.job_stops s where s.job_id = j.id and s.stop_type <> 'disposal'), '[]'::jsonb),
      'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at) from public.job_items i where i.job_id = j.id), '[]'::jsonb),
      'activity', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.job_activity a where a.job_id = j.id), '[]'::jsonb),
      'photos', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from public.job_photos p where p.job_id = j.id), '[]'::jsonb),
      'disposalEvents', coalesce((select jsonb_agg(to_jsonb(d) order by d.sequence_number) from public.job_disposal_events d where d.job_id = j.id), '[]'::jsonb),
      'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.job_messages m where m.job_id = j.id), '[]'::jsonb),
      'issues', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc) from public.job_issues i where i.job_id = j.id), '[]'::jsonb)
    )
  ), '[]'::jsonb)
  from assigned_jobs j
$$;
