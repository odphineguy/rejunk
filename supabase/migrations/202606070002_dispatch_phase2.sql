-- Phase 2 dispatch control loop and Haul or Call exception workflow.

alter table public.jobs
  add column if not exists service_type text,
  add column if not exists lead_source text,
  add column if not exists priority text not null default 'normal',
  add column if not exists estimated_duration_minutes integer,
  add column if not exists crew_sequence integer;

alter table public.job_assignments
  add column if not exists crew_sequence integer,
  add column if not exists updated_at timestamptz not null default now();

alter table public.job_issues
  add column if not exists issue_status text not null default 'awaiting_dispatch',
  add column if not exists dispatch_response text,
  add column if not exists dispatch_instructions text,
  add column if not exists resolved_by uuid references public.employee_profiles (id) on delete set null,
  add column if not exists resolved_at timestamptz,
  add column if not exists customer_contact_attempted_at timestamptz,
  add column if not exists customer_contact_result text,
  add column if not exists driver_called_dispatch_at timestamptz,
  add column if not exists driver_released_at timestamptz,
  add column if not exists driver_released_by uuid references public.employee_profiles (id) on delete set null,
  add column if not exists resolution_type text;

create table if not exists public.job_instruction_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs (id) on delete cascade,
  acknowledged_by uuid not null references public.employee_profiles (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  unique (job_id, acknowledged_by)
);

create index if not exists jobs_service_type_idx on public.jobs (service_type);
create index if not exists jobs_lead_source_idx on public.jobs (lead_source);
create index if not exists jobs_priority_idx on public.jobs (priority);
create index if not exists job_assignments_sequence_idx on public.job_assignments (employee_profile_id, crew_sequence);
create index if not exists job_issues_status_idx on public.job_issues (issue_status);
create index if not exists job_issues_requires_response_idx on public.job_issues (requires_dispatch_response, issue_status);
create index if not exists job_instruction_ack_job_idx on public.job_instruction_acknowledgements (job_id);

drop trigger if exists set_updated_at_job_assignments on public.job_assignments;
create trigger set_updated_at_job_assignments before update on public.job_assignments
  for each row execute function public.set_updated_at();

alter table public.job_instruction_acknowledgements enable row level security;

create policy "job participants can read instruction acknowledgements"
  on public.job_instruction_acknowledgements for select to authenticated
  using (public.is_dispatch_user() or public.current_user_is_assigned_to_job(job_id));

create policy "assigned crew can acknowledge instructions"
  on public.job_instruction_acknowledgements for insert to authenticated
  with check (
    acknowledged_by = public.current_employee_profile_id()
    and public.current_user_is_assigned_to_job(job_id)
  );

create or replace function public.driver_update_job_status(target_job_id text, next_status text, note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous text;
  actor uuid;
  blocking_issue_count integer;
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
    'issue'
  ) then
    raise exception 'invalid or dispatch-only driver status %', next_status;
  end if;

  select count(*) into blocking_issue_count
  from public.job_issues
  where job_id = target_job_id
    and requires_dispatch_response = true
    and issue_status <> 'resolved'
    and driver_released_at is null;

  if blocking_issue_count > 0 and next_status not in ('issue', 'delayed') then
    raise exception 'blocking issue requires dispatch resolution';
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

create or replace function public.driver_confirm_dispatch_called(target_issue_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_job_id text;
  actor uuid;
begin
  select job_id into target_job_id from public.job_issues where id = target_issue_id;
  if target_job_id is null or not public.current_user_is_assigned_to_job(target_job_id) then
    raise exception 'not authorized for issue %', target_issue_id;
  end if;

  actor := public.current_employee_profile_id();

  update public.job_issues
  set driver_called_dispatch_at = now(),
      updated_at = now()
  where id = target_issue_id;

  insert into public.job_activity (job_id, user_id, event_type, message, metadata)
  values (target_job_id, actor, 'customer_contact', 'Driver confirmed dispatch was called.', jsonb_build_object('issue_id', target_issue_id));
end;
$$;

create or replace function public.dispatch_resolve_job_issue(
  target_issue_id uuid,
  next_issue_status text,
  resolution text,
  instructions text,
  response text,
  release_driver boolean default false
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
  if not public.is_dispatch_user() then
    raise exception 'dispatch role required';
  end if;

  if next_issue_status not in ('awaiting_dispatch', 'dispatch_reviewing', 'contacting_customer', 'waiting_on_customer', 'instructions_sent', 'resolved') then
    raise exception 'invalid issue status %', next_issue_status;
  end if;

  if resolution is not null and resolution not in ('proceed', 'wait', 'return_later', 'reschedule', 'skip_stop', 'cancel_job', 'unable_to_service', 'other') then
    raise exception 'invalid resolution type %', resolution;
  end if;

  select job_id into target_job_id from public.job_issues where id = target_issue_id;
  if target_job_id is null then
    raise exception 'issue not found %', target_issue_id;
  end if;

  actor := public.current_employee_profile_id();

  update public.job_issues
  set issue_status = next_issue_status,
      resolution_type = resolution,
      dispatch_instructions = nullif(instructions, ''),
      dispatch_response = nullif(response, ''),
      resolved_by = case when next_issue_status = 'resolved' then actor else resolved_by end,
      resolved_at = case when next_issue_status = 'resolved' then now() else resolved_at end,
      driver_released_by = case when release_driver then actor else driver_released_by end,
      driver_released_at = case when release_driver then now() else driver_released_at end,
      updated_at = now()
  where id = target_issue_id;

  if resolution = 'cancel_job' then
    if nullif(response, '') is null then
      raise exception 'cancellation requires a resolution note';
    end if;

    update public.jobs
    set status = 'canceled',
        data = jsonb_set(data, '{status}', to_jsonb('canceled'::text), true),
        updated_at = now()
    where id = target_job_id;
  end if;

  insert into public.job_activity (job_id, user_id, event_type, message, metadata)
  values (
    target_job_id,
    actor,
    case when release_driver then 'driver_release' else 'dispatch_resolution' end,
    coalesce(nullif(instructions, ''), nullif(response, ''), 'Dispatch updated issue resolution.'),
    jsonb_build_object('issue_id', target_issue_id, 'issue_status', next_issue_status, 'resolution_type', resolution, 'release_driver', release_driver)
  );
end;
$$;
