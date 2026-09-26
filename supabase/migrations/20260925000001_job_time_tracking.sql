-- DRIVER_TIME_TRACKING_SPEC (2026-09-25): crew taps become the Labor Hours source.
-- Additive: one new table, new functions, and driver_update_job_status re-created with the
-- same signature and the same transition rules plus one insert into the new table.
--
--   job_time_events   one row per Start / Pause / Resume / Complete tap (who + when), per owner
--                     correction (who + old value + new value) and per missed-start reminder.
--   Time on job       effective start → effective finish, minus paused time.
--                     Effective start/finish = the owner's latest correction, else the taps.
--   Labor hours       time on job × crew size (jobs.data.crew; falls back to the number of
--                     people who tapped, min 1).
--   Reminder          pg_cron every 5 min: scheduled start + 15 min passed, crew assigned,
--                     nobody tapped Start → one "Dispatch" message in the job thread.
-- The browser never touches the table: owner-only RPCs read it, drivers write it only
-- through driver_update_job_status.
begin;

create table public.job_time_events (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs(id) on delete cascade,
  kind text not null check (kind in ('start','pause','resume','complete','reminder')),
  source text not null check (source in ('driver','owner','system')),
  employee_id text,
  staff_email text,
  occurred_at timestamptz not null,
  previous_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index job_time_events_job_idx on public.job_time_events(job_id, occurred_at);
alter table public.job_time_events enable row level security;
revoke all on public.job_time_events from public, anon, authenticated;

-- Same body as 20260910042932 plus the time event. Tap kinds:
--   → in_progress from paused, or after a start already exists = resume, else start
--   → paused / delayed / issue while working                   = pause
--   → completed                                                = complete
create or replace function public.driver_update_job_status(target_job_id text,next_status text,note text default null) returns void
language plpgsql security definer set search_path='' as $$
declare prior text; tap text; allowed jsonb := '{"assigned":["en_route","delayed","issue"],"en_route":["arrived","in_progress","delayed","issue"],"arrived":["in_progress","delayed","issue"],"in_progress":["paused","loaded","completed","delayed","issue"],"paused":["in_progress","completed","issue"],"loaded":["en_route_to_next_stop","en_route_to_disposal","paused","completed","delayed","issue"],"en_route_to_next_stop":["arrived","paused","completed","delayed","issue"],"en_route_to_disposal":["dumping","paused","completed","delayed","issue"],"dumping":["completed","paused","delayed","issue"],"delayed":["en_route","arrived","in_progress","loaded","issue"],"issue":["in_progress"],"completed":[],"canceled":[]}';
begin
  if not app_private.assigned_job(target_job_id) then raise exception 'Assigned driver required' using errcode='42501'; end if;
  select status into prior from public.jobs where id=target_job_id for update;
  if not app_private.assigned_job(target_job_id) then raise exception 'Assigned driver required' using errcode='42501'; end if;
  prior := case prior when 'open' then 'assigned' when 'scheduled' then 'assigned' when 'on_my_way' then 'en_route' else prior end;
  if next_status is null or not (allowed ? next_status) or (next_status<>prior and not ((allowed->prior) ? next_status)) then
    raise exception 'Invalid status transition' using errcode='22023';
  end if;
  update public.jobs set status=next_status,updated_at=now(),
    data=jsonb_set(jsonb_set(data,'{status}',to_jsonb(next_status)),'{updatedAt}',to_jsonb(now())) where id=target_job_id;

  if next_status<>prior then
    tap := case
      when next_status='in_progress' then
        case when prior='paused' or exists(select 1 from public.job_time_events e
          where e.job_id=target_job_id and e.kind='start' and e.source='driver') then 'resume' else 'start' end
      when next_status='completed' then 'complete'
      when next_status in ('paused','delayed','issue')
        and prior in ('in_progress','loaded','en_route_to_next_stop','en_route_to_disposal','dumping') then 'pause'
    end;
    if tap is not null then
      insert into public.job_time_events(job_id,kind,source,employee_id,occurred_at,note)
        values(target_job_id,tap,'driver',app_private.driver_employee(),now(),note);
    end if;
  end if;
end $$;
revoke all on function public.driver_update_job_status(text,text,text) from public,anon;
grant execute on function public.driver_update_job_status(text,text,text) to authenticated;

-- One job's effective times. Pause intervals end at the next resume, else at the finish;
-- they are clipped to [start, finish]. Open jobs report running time up to now().
create function app_private.job_time(target text) returns jsonb
language sql stable security definer set search_path='' as $$
  with ev as (select * from public.job_time_events where job_id=target),
  eff as (
    select
      coalesce((select occurred_at from ev where kind='start' and source='owner' order by created_at desc limit 1),
               (select min(occurred_at) from ev where kind='start' and source='driver')) as started_at,
      coalesce((select occurred_at from ev where kind='complete' and source='owner' order by created_at desc limit 1),
               (select max(occurred_at) from ev where kind='complete' and source='driver')) as completed_at
  ),
  pauses as (
    select greatest(p.occurred_at, eff.started_at) as from_at,
      least(coalesce((select min(r.occurred_at) from ev r where r.source='driver' and r.kind in ('resume','complete')
        and r.occurred_at>=p.occurred_at), eff.completed_at, now()), coalesce(eff.completed_at, now())) as to_at
    from ev p cross join eff where p.kind='pause' and p.source='driver'
  ),
  crew as (
    select greatest(1, case when jsonb_typeof(j.data->'crew')='array' and jsonb_array_length(j.data->'crew')>0
      then jsonb_array_length(j.data->'crew')
      else (select count(distinct employee_id) from ev where source='driver') end)::int as size
    from public.jobs j where j.id=target
  ),
  totals as (
    select eff.*, coalesce((select sum(extract(epoch from (to_at-from_at))) from pauses where to_at>from_at),0) as paused_s
    from eff
  )
  select jsonb_build_object(
    'jobId', target,
    'startedAt', t.started_at,
    'completedAt', t.completed_at,
    'pausedMinutes', round((t.paused_s/60)::numeric,1),
    'onJobMinutes', case when t.started_at is null then null
      else round((greatest(0, extract(epoch from (coalesce(t.completed_at, now())-t.started_at)) - t.paused_s)/60)::numeric,1) end,
    'crewSize', (select size from crew),
    'laborHours', case when t.started_at is null or t.completed_at is null then null
      else round((greatest(0, extract(epoch from (t.completed_at-t.started_at)) - t.paused_s)/3600 * (select size from crew))::numeric,2) end,
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind',e.kind,'source',e.source,'at',e.occurred_at,'previousAt',e.previous_at,
      'employeeId',e.employee_id,'employeeName',nullif(btrim(coalesce(ae.first_name,'')||' '||coalesce(ae.last_name,'')),''),
      'staffEmail',e.staff_email,'note',e.note,'createdAt',e.created_at) order by e.created_at)
      from ev e left join public.app_employees ae on ae.id::text=e.employee_id), '[]'::jsonb)
  ) from totals t;
$$;

create function public.job_time_summary(target_job_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if app_private.staff_role() is distinct from 'owner' then raise exception 'Owner access required' using errcode='42501'; end if;
  return app_private.job_time(target_job_id);
end $$;

-- Owner correction of a missed or wrong tap. Logged with the old value; never deletes taps.
create function public.owner_set_job_time(target_job_id text, which text, at_time timestamptz, reason text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare email text; current_value timestamptz;
begin
  if app_private.staff_role() is distinct from 'owner' then raise exception 'Owner access required' using errcode='42501'; end if;
  if which not in ('start','complete') or at_time is null then raise exception 'Invalid time edit' using errcode='22023'; end if;
  if not exists(select 1 from public.jobs where id=target_job_id) then raise exception 'Job not found' using errcode='22023'; end if;
  select s.email into email from app_private.identity_bindings b
    join public.staff_sessions ss on ss.token=b.staff_token join public.staff s on s.id=ss.staff_id
    where b.auth_user_id=auth.uid();
  current_value := ((app_private.job_time(target_job_id))->>(case which when 'start' then 'startedAt' else 'completedAt' end))::timestamptz;
  insert into public.job_time_events(job_id,kind,source,staff_email,occurred_at,previous_at,note)
    values(target_job_id,which,'owner',email,at_time,current_value,nullif(btrim(coalesce(reason,'')),''));
  return app_private.job_time(target_job_id);
end $$;

-- Labor hours per Phoenix day of the (effective) finish, plus the first day tracking existed
-- so the Performance page can tell "no data yet" from a real zero.
create function public.labor_hours_series(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if app_private.staff_role() is distinct from 'owner' then raise exception 'Owner access required' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Invalid range' using errcode='22023'; end if;
  return jsonb_build_object(
    'trackingSince', (select min((occurred_at at time zone 'America/Phoenix')::date) from public.job_time_events where kind<>'reminder'),
    'days', coalesce((select jsonb_agg(jsonb_build_object('date',d,'hours',h,'jobs',n) order by d) from (
      select ((t->>'completedAt')::timestamptz at time zone 'America/Phoenix')::date d,
        round(sum((t->>'laborHours')::numeric),2) h, count(*) n
      from (select app_private.job_time(id) t from (select distinct job_id id from public.job_time_events) j) x
      where t->>'laborHours' is not null
      group by 1) s where d between p_from and p_to), '[]'::jsonb));
end $$;

revoke all on function app_private.job_time(text) from public,anon,authenticated;
revoke all on function public.job_time_summary(text), public.owner_set_job_time(text,text,timestamptz,text),
  public.labor_hours_series(date,date) from public,anon;
grant execute on function public.job_time_summary(text), public.owner_set_job_time(text,text,timestamptz,text),
  public.labor_hours_series(date,date) to authenticated;

-- Missed-start reminder: once per job, into the job thread (created if missing) with every
-- crew member as a participant, so it shows up in the driver app's Messages with a badge.
create function app_private.send_missed_start_reminders() returns integer
language plpgsql security definer set search_path='' as $$
declare j record; thread uuid; sent integer := 0;
begin
  for j in
    select id, coalesce(data->>'jobNumber', job_number) as num, customer_name, scheduled_start, data->'crew' as crew
    from public.jobs
    where status in ('open','scheduled','assigned','en_route','on_my_way','arrived')
      and scheduled_start between now() - interval '12 hours' and now() - interval '15 minutes'
      and jsonb_typeof(data->'crew')='array' and jsonb_array_length(data->'crew')>0
      and not exists(select 1 from public.job_time_events e where e.job_id=jobs.id and e.kind in ('start','reminder'))
  loop
    select t.id into thread from public.dispatch_threads t
      where t.thread_type='job' and t.job_id=j.id and not t.archived order by t.created_at limit 1;
    if thread is null then
      insert into public.dispatch_threads(thread_type,job_id,title,created_by)
        values('job',j.id,'Job conversation','system') returning id into thread;
    end if;
    insert into public.dispatch_thread_participants(thread_id,employee_id)
      select thread, c->>'employeeId' from jsonb_array_elements(j.crew) c where c->>'employeeId' is not null
      on conflict(thread_id,employee_id) do nothing;
    insert into public.dispatch_messages(thread_id,sender_id,sender_name,body,metadata)
      values(thread,'system','Dispatch',
        'Reminder: ' || coalesce(j.num,'this job') || coalesce(' (' || j.customer_name || ')','') ||
        ' was scheduled to start at ' || to_char(j.scheduled_start at time zone 'America/Phoenix','FMHH12:MI AM') ||
        '. Nobody has tapped Start My Time yet. Tap it when you begin.',
        jsonb_build_object('kind','missed_start_reminder','jobId',j.id));
    insert into public.job_time_events(job_id,kind,source,occurred_at) values(j.id,'reminder','system',now());
    sent := sent + 1;
  end loop;
  return sent;
end $$;
revoke all on function app_private.send_missed_start_reminders() from public,anon,authenticated;

select cron.schedule('missed-start-reminders', '*/5 * * * *', 'select app_private.send_missed_start_reminders()');

commit;
