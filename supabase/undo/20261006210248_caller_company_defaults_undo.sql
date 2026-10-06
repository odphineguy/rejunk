-- UNDO for 20261006210000_caller_company_defaults.sql (Part B ship 2).
-- Puts the temporary Progressive default back on every table that now uses
-- require_company(), and restores the 5 functions to their pre-Part-B bodies.
-- caller_company()/require_company() are left in place (harmless, unused).
begin;

do $$
declare
  t text;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'tenant_id'
      and column_default like '%require_company()%'
  loop
    execute format('alter table public.%I alter column tenant_id set default %L::uuid',
      t, '208a0172-b9f8-49e4-8eab-4021bf627c50');
  end loop;
end $$;

create or replace function public.driver_update_job_status(target_job_id text, next_status text, note text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

    -- Customer texts: one "on the way" and one "all done" per job, ever (re-taps don't resend).
    if next_status in ('en_route','completed') then
      insert into public.customer_notifications(job_id,kind,driver_employee_id)
        values(target_job_id, case next_status when 'en_route' then 'omw' else 'finish' end, app_private.driver_employee())
        on conflict (job_id,kind) do nothing;
    end if;
  end if;
end $function$;

create or replace function public.driver_create_thread(kind text, target_job_id text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare employee text:=app_private.driver_employee(); result uuid;
begin
  if employee is null then raise exception 'Driver login required' using errcode='42501'; end if;
  if kind not in ('direct','job') or kind is null or (kind='job' and not app_private.assigned_job(target_job_id)) then
    raise exception 'Invalid conversation' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('driver-thread:'||employee||':'||kind||':'||coalesce(target_job_id,''),0));
  select t.id into result from public.dispatch_threads t
  join public.dispatch_thread_participants p on p.thread_id=t.id and p.employee_id=employee
  where t.thread_type=kind and not t.archived and (kind='direct' or t.job_id=target_job_id) limit 1;
  if result is null then
    insert into public.dispatch_threads(thread_type,job_id,title,created_by)
      values(kind,case when kind='job' then target_job_id end,case when kind='job' then 'Job conversation' else 'Dispatch' end,employee)
      returning id into result;
    insert into public.dispatch_thread_participants(thread_id,employee_id) values(result,employee);
    if kind='job' then
      insert into public.dispatch_thread_participants(thread_id,employee_id)
      select distinct result,a.employee_id from public.driver_activations a
      join public.jobs j on j.id=target_job_id
      where a.status='activated' and app_private.job_has_employee(j.data, a.employee_id, a.employee_name)
      on conflict(thread_id,employee_id) do nothing;
    end if;
  end if;
  return result;
end $function$;

create or replace function public.owner_set_job_time(target_job_id text, which text, at_time timestamp with time zone, reason text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
end $function$;

create or replace function app_private.send_missed_start_reminders()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
end $function$;

do $$
declare
  def text := pg_get_functiondef('public.settle_invoice_checkout'::regproc);
begin
  def := replace(def,
    'insert into public.app_payments(id,tenant_id,data) values(payment_id,attempt.company_id,jsonb_build_object(',
    'insert into public.app_payments(id,data) values(payment_id,jsonb_build_object(');
  execute def;
end $$;

commit;
