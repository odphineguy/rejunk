-- Phase 1 driver app operational model.
-- Driver reads use masked RPC payloads and operational tables instead of the
-- financial jobs.data snapshot.

create table if not exists public.employee_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users (id) on delete cascade,
  employee_id text,
  display_name text not null,
  email text,
  phone text,
  role text not null default 'driver' check (role in ('admin', 'dispatcher', 'driver')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auth_user_id),
  unique (employee_id)
);

create table if not exists public.job_assignments (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs (id) on delete cascade,
  employee_profile_id uuid not null references public.employee_profiles (id) on delete cascade,
  role text not null default 'driver' check (role in ('driver', 'helper', 'crew_lead')),
  assigned_by uuid references public.employee_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (job_id, employee_profile_id)
);

create table if not exists public.job_stops (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs (id) on delete cascade,
  stop_order integer not null check (stop_order > 0),
  stop_type text not null default 'service' check (stop_type in ('pickup', 'delivery', 'service', 'disposal', 'material_pickup', 'other')),
  name text not null,
  address text,
  city text,
  state text,
  zip text,
  latitude numeric,
  longitude numeric,
  contact_name text,
  contact_phone text,
  arrival_window_start timestamptz,
  arrival_window_end timestamptz,
  instructions text,
  status text not null default 'pending' check (status in ('pending', 'en_route', 'arrived', 'in_progress', 'completed', 'skipped')),
  arrived_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, stop_order)
);

create table if not exists public.job_items (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs (id) on delete cascade,
  stop_id uuid references public.job_stops (id) on delete set null,
  name text not null,
  quantity numeric not null default 1,
  category text,
  estimated_weight_lbs numeric,
  oversized boolean not null default false,
  fragile boolean not null default false,
  heavy boolean not null default false,
  disassembly_required boolean not null default false,
  reassembly_required boolean not null default false,
  destination_stop_id uuid references public.job_stops (id) on delete set null,
  instructions text,
  status text not null default 'pending' check (status in ('pending', 'loaded', 'delivered', 'completed', 'missing', 'damaged', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_activity (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs (id) on delete cascade,
  user_id uuid references public.employee_profiles (id) on delete set null,
  event_type text not null check (event_type in ('status_change', 'stop_completed', 'item_updated', 'photo_uploaded', 'message', 'issue_reported', 'scope_change', 'assignment_changed')),
  previous_status text,
  new_status text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs (id) on delete cascade,
  stop_id uuid references public.job_stops (id) on delete set null,
  uploaded_by uuid references public.employee_profiles (id) on delete set null,
  storage_path text not null,
  photo_type text not null default 'other' check (photo_type in ('before', 'progress', 'after', 'damage', 'issue', 'receipt', 'equipment', 'other')),
  visibility text not null default 'internal' check (visibility in ('internal', 'customer_ready')),
  caption text,
  created_at timestamptz not null default now()
);

create table if not exists public.job_messages (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs (id) on delete cascade,
  sender_id uuid references public.employee_profiles (id) on delete set null,
  recipient_scope text not null default 'dispatch' check (recipient_scope in ('dispatch', 'assigned_crew', 'all_job_participants')),
  message text not null,
  attachment_url text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.job_issues (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs (id) on delete cascade,
  stop_id uuid references public.job_stops (id) on delete set null,
  reported_by uuid references public.employee_profiles (id) on delete set null,
  issue_type text not null check (issue_type in ('customer_not_home', 'access_problem', 'additional_items', 'item_not_listed', 'heavy_item', 'oversized_item', 'damage', 'vehicle_problem', 'running_late', 'disposal_problem', 'unsafe_condition', 'other')),
  description text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'urgent')),
  requires_dispatch_response boolean not null default false,
  added_scope_status text check (added_scope_status in ('awaiting_review', 'approved_continue', 'declined', 'call_dispatch')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_location_snapshots (
  id uuid primary key default gen_random_uuid(),
  job_id text references public.jobs (id) on delete cascade,
  employee_profile_id uuid references public.employee_profiles (id) on delete cascade,
  latitude numeric not null,
  longitude numeric not null,
  accuracy_meters numeric,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists employee_profiles_auth_user_idx on public.employee_profiles (auth_user_id);
create index if not exists employee_profiles_role_idx on public.employee_profiles (role);
create index if not exists job_assignments_employee_idx on public.job_assignments (employee_profile_id);
create index if not exists job_assignments_job_idx on public.job_assignments (job_id);
create index if not exists jobs_status_phase1_idx on public.jobs (status);
create index if not exists jobs_scheduled_date_idx on public.jobs ((date(scheduled_start)));
create index if not exists job_activity_job_created_idx on public.job_activity (job_id, created_at desc);
create index if not exists job_messages_job_created_idx on public.job_messages (job_id, created_at desc);
create index if not exists job_photos_job_created_idx on public.job_photos (job_id, created_at desc);
create index if not exists job_stops_job_order_idx on public.job_stops (job_id, stop_order);
create index if not exists job_items_job_stop_idx on public.job_items (job_id, stop_id);
create index if not exists job_issues_job_created_idx on public.job_issues (job_id, created_at desc);
create index if not exists driver_location_job_employee_idx on public.driver_location_snapshots (job_id, employee_profile_id, captured_at desc);

drop trigger if exists set_updated_at_employee_profiles on public.employee_profiles;
create trigger set_updated_at_employee_profiles before update on public.employee_profiles
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_job_stops on public.job_stops;
create trigger set_updated_at_job_stops before update on public.job_stops
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_job_items on public.job_items;
create trigger set_updated_at_job_items before update on public.job_items
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_job_issues on public.job_issues;
create trigger set_updated_at_job_issues before update on public.job_issues
  for each row execute function public.set_updated_at();

create or replace function public.current_employee_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ep.id
  from public.employee_profiles ep
  where ep.auth_user_id = auth.uid()
    and ep.status = 'active'
  limit 1
$$;

create or replace function public.is_dispatch_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employee_profiles ep
    where ep.auth_user_id = auth.uid()
      and ep.status = 'active'
      and ep.role in ('admin', 'dispatcher')
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('admin', 'dispatcher', 'manager', 'owner')
  )
$$;

create or replace function public.current_user_is_assigned_to_job(target_job_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.job_assignments ja
    where ja.job_id = target_job_id
      and ja.employee_profile_id = public.current_employee_profile_id()
  )
$$;

alter table public.employee_profiles enable row level security;
alter table public.job_assignments enable row level security;
alter table public.job_stops enable row level security;
alter table public.job_items enable row level security;
alter table public.job_activity enable row level security;
alter table public.job_photos enable row level security;
alter table public.job_messages enable row level security;
alter table public.job_issues enable row level security;
alter table public.driver_location_snapshots enable row level security;

drop policy if exists "jobs readable by authenticated" on public.jobs;
drop policy if exists "jobs writable by authenticated" on public.jobs;

create policy "dispatch can read job snapshots"
  on public.jobs for select to authenticated using (public.is_dispatch_user());
create policy "dispatch can write job snapshots"
  on public.jobs for all to authenticated using (public.is_dispatch_user()) with check (public.is_dispatch_user());

create policy "employee profiles read by self or dispatch"
  on public.employee_profiles for select to authenticated
  using (auth_user_id = auth.uid() or public.is_dispatch_user());
create policy "dispatch manages employee profiles"
  on public.employee_profiles for all to authenticated
  using (public.is_dispatch_user()) with check (public.is_dispatch_user());

create policy "assigned crew can read own assignments"
  on public.job_assignments for select to authenticated
  using (employee_profile_id = public.current_employee_profile_id() or public.is_dispatch_user());
create policy "dispatch manages assignments"
  on public.job_assignments for all to authenticated
  using (public.is_dispatch_user()) with check (public.is_dispatch_user());

create policy "assigned crew can read stops"
  on public.job_stops for select to authenticated
  using (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id));
create policy "assigned crew can update stop status"
  on public.job_stops for update to authenticated
  using (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id))
  with check (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id));
create policy "dispatch can create stops"
  on public.job_stops for insert to authenticated with check (public.is_dispatch_user());

create policy "assigned crew can read items"
  on public.job_items for select to authenticated
  using (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id));
create policy "assigned crew can update item status"
  on public.job_items for update to authenticated
  using (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id))
  with check (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id));
create policy "dispatch can create items"
  on public.job_items for insert to authenticated with check (public.is_dispatch_user());

create policy "job participants can read activity"
  on public.job_activity for select to authenticated
  using (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id));
create policy "job participants can create activity"
  on public.job_activity for insert to authenticated
  with check (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id));

create policy "job participants can read photos"
  on public.job_photos for select to authenticated
  using (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id));
create policy "assigned crew can create photos"
  on public.job_photos for insert to authenticated
  with check (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id));
create policy "dispatch can update photo visibility"
  on public.job_photos for update to authenticated
  using (public.is_dispatch_user()) with check (public.is_dispatch_user());

create policy "job participants can read messages"
  on public.job_messages for select to authenticated
  using (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id));
create policy "job participants can create messages"
  on public.job_messages for insert to authenticated
  with check (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id));
create policy "dispatch can mark messages read"
  on public.job_messages for update to authenticated
  using (public.is_dispatch_user()) with check (public.is_dispatch_user());

create policy "job participants can read issues"
  on public.job_issues for select to authenticated
  using (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id));
create policy "assigned crew can create issues"
  on public.job_issues for insert to authenticated
  with check (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id));
create policy "dispatch can update issues"
  on public.job_issues for update to authenticated
  using (public.is_dispatch_user()) with check (public.is_dispatch_user());

create policy "dispatch can read location snapshots"
  on public.driver_location_snapshots for select to authenticated using (public.is_dispatch_user());
create policy "assigned crew can create own location snapshots"
  on public.driver_location_snapshots for insert to authenticated
  with check (employee_profile_id = public.current_employee_profile_id() and public.current_user_is_assigned_to_job(job_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "job participants read assigned job photos" on storage.objects;
drop policy if exists "assigned crew upload job photos" on storage.objects;

create policy "job participants read assigned job photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'job-photos'
    and (
      public.is_dispatch_user()
      or public.current_user_is_assigned_to_job((storage.foldername(name))[1])
    )
  );

create policy "assigned crew upload job photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-photos'
    and (
      public.is_dispatch_user()
      or public.current_user_is_assigned_to_job((storage.foldername(name))[1])
    )
  );

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
        'internalNotes', j.data->>'internalNotes'
      ),
      'stops', coalesce((select jsonb_agg(to_jsonb(s) order by s.stop_order) from public.job_stops s where s.job_id = j.id), '[]'::jsonb),
      'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at) from public.job_items i where i.job_id = j.id), '[]'::jsonb),
      'activity', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.job_activity a where a.job_id = j.id), '[]'::jsonb),
      'photos', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from public.job_photos p where p.job_id = j.id), '[]'::jsonb),
      'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.job_messages m where m.job_id = j.id), '[]'::jsonb),
      'issues', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc) from public.job_issues i where i.job_id = j.id), '[]'::jsonb)
    )
  ), '[]'::jsonb)
  from assigned_jobs j
$$;

create or replace function public.driver_update_job_status(target_job_id text, next_status text, note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous text;
  actor uuid;
begin
  if not public.current_user_is_assigned_to_job(target_job_id) then
    raise exception 'not authorized for job %', target_job_id;
  end if;

  if next_status not in (
    'assigned',
    'en_route',
    'arrived',
    'in_progress',
    'loaded',
    'en_route_to_next_stop',
    'en_route_to_disposal',
    'dumping',
    'completed',
    'delayed',
    'issue',
    'canceled'
  ) then
    raise exception 'invalid driver status %', next_status;
  end if;

  select status into previous
  from public.jobs
  where id = target_job_id;

  update public.jobs
  set status = next_status,
      data = jsonb_set(data, '{status}', to_jsonb(next_status), true),
      updated_at = now()
  where id = target_job_id;

  actor := public.current_employee_profile_id();

  insert into public.job_activity (job_id, user_id, event_type, previous_status, new_status, message, metadata)
  values (
    target_job_id,
    actor,
    'status_change',
    previous,
    next_status,
    coalesce(note, 'Driver status updated.'),
    '{}'::jsonb
  );
end;
$$;
