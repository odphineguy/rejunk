-- JOB_TICKET_REDESIGN_SPEC phase 1 (2026-09-12): the ticket shape reaches the database layer.
-- Applied to rejunk-prod through the Supabase MCP as `ticket_shape`. Requires 20260912000001.
--
-- The job record itself stays a JSON blob in jobs.data (no shape migration — the app's
-- normalizeJob() adapts old blobs on read). What changes here is everything that looks INTO
-- that blob:
--   * app_private.job_has_employee — one place that answers "is this employee on this job":
--     the new `crew[].employeeId` list first, then the legacy assignment.employeeIds, then the
--     legacy crewLead/crewMembers names (exact, unambiguous match only). Used by assigned_job()
--     (every driver RPC, job-photo storage policy, thread access) and driver_create_thread().
--   * get_driver_today — allowlist grows to serviceType / movingKind / deliveryKind /
--     requiredCrew / stops / items / disposalEvents (minus disposalCost) / dayType / paymentTerms /
--     tvInstall / thirdPartyPickup / moving, and `crew` comes back with names resolved from
--     app_employees (fallback: the activation's employee_name). Still no money.
--   * app_private.office_job — the office-role projection (reads AND office_save_job merges)
--     carries the same operational fields. disposalEvents stay owner-only (they hold disposal cost).
--   * driver_update_ticket_row — drivers tick stops / items / disposal trips on the ticket
--     through an allowlisted patch instead of the never-applied job_stops / job_items tables.
begin;

create or replace function app_private.job_has_employee(job_data jsonb, employee_id text, employee_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select case
    when jsonb_typeof(job_data->'crew')='array' and jsonb_array_length(job_data->'crew')>0 then
      exists(select 1 from jsonb_array_elements(job_data->'crew') c where c->>'employeeId'=employee_id)
    when job_data->'assignment' ? 'employeeIds' then
      (job_data->'assignment'->'employeeIds') ? employee_id
    else
      -- Legacy assignments store names: exact match only, reject ambiguity.
      (select count(distinct a.employee_id) from public.driver_activations a
        where a.status='activated' and lower(btrim(a.employee_name))=lower(btrim(employee_name)))=1
      and exists(select 1 from jsonb_array_elements_text(
        coalesce(job_data->'assignment'->'crewMembers','[]'::jsonb) ||
        jsonb_build_array(job_data->'assignment'->>'crewLead')) n
        where lower(btrim(n))=lower(btrim(employee_name)))
  end;
$$;
revoke all on function app_private.job_has_employee(jsonb,text,text) from public,anon;
grant execute on function app_private.job_has_employee(jsonb,text,text) to authenticated, service_role;

create or replace function app_private.assigned_job(target text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.jobs j
    join public.driver_sessions ds on ds.id=app_private.driver_session()
    join public.driver_activations da on da.id=ds.activation_id
    where j.id=target and app_private.job_has_employee(j.data, ds.employee_id, da.employee_name));
$$;

create or replace function public.driver_create_thread(kind text,target_job_id text default null) returns uuid
language plpgsql security definer set search_path='' as $$
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
end $$;

-- Whitelist projection for drivers: operational ticket fields, crew with names, never money.
create or replace function public.get_driver_today() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('job',
   coalesce(safe.data,'{}'::jsonb)
   || jsonb_build_object('id',j.id,'status',j.status,
        'assignment',jsonb_build_object('crewLead',j.data#>'{assignment,crewLead}','crewMembers',coalesce(j.data#>'{assignment,crewMembers}','[]'::jsonb),
          'vehicleId',j.data#>'{assignment,vehicleId}','vehicleName',j.data#>'{assignment,vehicleName}'),
        'crew',(select coalesce(jsonb_agg(
                  c || jsonb_build_object('name', coalesce(nullif(btrim(concat_ws(' ',e.first_name,e.last_name)),''), act.employee_name, c->>'employeeId'))
                  order by ord),'[]'::jsonb)
                from jsonb_array_elements(case when jsonb_typeof(j.data->'crew')='array' then j.data->'crew' else '[]'::jsonb end) with ordinality t(c,ord)
                left join public.app_employees e on e.id=c->>'employeeId'
                left join lateral (select employee_name from public.driver_activations
                                   where employee_id=c->>'employeeId' and status='activated' limit 1) act on true),
        'disposalEvents',(select coalesce(jsonb_agg(d - 'disposalCost' order by ord),'[]'::jsonb)
                from jsonb_array_elements(case when jsonb_typeof(j.data->'disposalEvents')='array' then j.data->'disposalEvents' else '[]'::jsonb end) with ordinality t(d,ord)))
   ), '[]'::jsonb)
 from public.jobs j cross join lateral (
   select jsonb_object_agg(key,value) as data from jsonb_each(j.data)
   where key=any(array['jobNumber','customerName','jobLabel','phone','address','city','state','zip',
     'scheduledStart','scheduledEnd','vehicleId','vehicleName','notes','internalNotes','materialName','materialType',
     'createdAt','updatedAt','facilityId','facilityName','cubicYards','estimatedWeightLbs','estimatedTons',
     'serviceType','movingKind','deliveryKind','requiredCrew','stops','items','dayType','paymentTerms',
     'thirdPartyPickup','tvInstall','moving','priority','estimatedDurationMinutes'])
 ) safe where app_private.assigned_job(j.id);
$$;

-- Office projection: operational fields in, money out. disposalEvents carry disposal cost → owner only.
create or replace function app_private.office_job(value jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select app_private.pick_fields(value,array[
 'id','jobNumber','source','sourceEstimateId','createdAt','updatedAt','customerName',
 'jobLabel','leadSource','serviceType','movingKind','deliveryKind','priority','estimatedDurationMinutes','crewSequence',
 'crewSize','requiredCrew','crew','stops','items','dayType','quote','paymentTerms','thirdPartyPickup','tvInstall',
 'escalation','leadRef','clientId','slot','moving',
 'phone','email','address','city','state','zip','scheduledStart','scheduledEnd',
 'status','materialType','materialName','cubicYards','estimatedWeightLbs','estimatedTons',
 'facilityId','facilityName','vehicleId','vehicleName','quotedAmount','notes','internalNotes'])
 || case when value ? 'assignment' then jsonb_build_object('assignment',
 app_private.pick_fields(value->'assignment',array['employeeIds','crewLead','crewMembers','vehicleId','vehicleName'])) else '{}'::jsonb end;
$$;

-- Drivers update one row of stops / items / disposalEvents on an assigned ticket.
create or replace function public.driver_update_ticket_row(target_job_id text, collection text, row_id text, patch jsonb) returns void
language plpgsql security definer set search_path='' as $$
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
  if collection='disposalEvents' and patch ? 'facilityId' and not exists(select 1 from public.facilities where id=patch->>'facilityId' and is_active) then
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
revoke all on function public.driver_update_ticket_row(text,text,text,jsonb) from public,anon;
grant execute on function public.driver_update_ticket_row(text,text,text,jsonb) to authenticated;

commit;
