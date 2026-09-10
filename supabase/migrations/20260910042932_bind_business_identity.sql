-- Phase 1: additive compatibility bridge. Apply BEFORE deploying the client.
-- No existing business policies change until restrict_business_data is applied.
begin;
create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;
create table app_private.identity_bindings (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  staff_token text references public.staff_sessions(token) on delete cascade,
  driver_session_id uuid references public.driver_sessions(id) on delete cascade,
  driver_token_hash text,
  check ((staff_token is not null)::int + (driver_session_id is not null)::int = 1)
);
alter table app_private.identity_bindings enable row level security;
revoke all on app_private.identity_bindings from public, anon, authenticated;

create function public.bind_business_identity(staff_token text default null, driver_token text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare driver_id uuid; token_hash text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if staff_token is not null and driver_token is not null then
    raise exception 'Choose one identity' using errcode='22023';
  end if;
  if staff_token is not null and length(staff_token) between 32 and 256 then
    if exists(select 1 from public.staff_sessions ss join public.staff s on s.id=ss.staff_id
      where ss.token=staff_token and ss.expires_at>now() and s.active and s.role in ('owner','office')) then
      insert into app_private.identity_bindings values(auth.uid(),staff_token,null,null)
      on conflict(auth_user_id) do update set staff_token=excluded.staff_token,driver_session_id=null,driver_token_hash=null;
      return true;
    end if;
  elsif driver_token is not null and length(driver_token) between 32 and 256 then
    token_hash := encode(extensions.digest(driver_token,'sha256'),'hex');
    select ds.id into driver_id from public.driver_sessions ds
      join public.driver_activations da on da.id=ds.activation_id
      where ds.session_token_hash=token_hash and da.status='activated' and da.employee_id=ds.employee_id;
    if driver_id is not null then
      insert into app_private.identity_bindings values(auth.uid(),null,driver_id,token_hash)
      on conflict(auth_user_id) do update set staff_token=null,driver_session_id=excluded.driver_session_id,driver_token_hash=excluded.driver_token_hash;
      return true;
    end if;
  end if;
  -- Invalid/revoked credentials also discard any previous binding.
  delete from app_private.identity_bindings where auth_user_id=auth.uid();
  return false;
end;
$$;
revoke all on function public.bind_business_identity(text,text) from public,anon;
grant execute on function public.bind_business_identity(text,text) to authenticated;

create function app_private.staff_role() returns text language sql stable security definer set search_path='' as $$
  select s.role from app_private.identity_bindings b
  join public.staff_sessions ss on ss.token=b.staff_token
  join public.staff s on s.id=ss.staff_id
  where b.auth_user_id=auth.uid() and ss.expires_at>now() and s.active and s.role in ('owner','office');
$$;
create function app_private.driver_session() returns uuid language sql stable security definer set search_path='' as $$
  select ds.id from app_private.identity_bindings b join public.driver_sessions ds on ds.id=b.driver_session_id
  join public.driver_activations da on da.id=ds.activation_id
  where b.auth_user_id=auth.uid() and ds.session_token_hash=b.driver_token_hash
    and da.status='activated' and da.employee_id=ds.employee_id;
$$;
create function app_private.driver_employee() returns text language sql stable security definer set search_path='' as $$
  select employee_id from public.driver_sessions where id=app_private.driver_session();
$$;
create function app_private.assigned_job(target text) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.jobs j
    join public.driver_sessions ds on ds.id=app_private.driver_session()
    join public.driver_activations da on da.id=ds.activation_id
    where j.id=target and (
      -- Explicit immutable ids take precedence when supplied by dispatch.
      case when j.data->'assignment' ? 'employeeIds' then
        (j.data->'assignment'->'employeeIds') ? ds.employee_id
      else
        -- Legacy assignments store names: exact match only, reject ambiguity.
        (select count(distinct a.employee_id) from public.driver_activations a
          where a.status='activated' and lower(btrim(a.employee_name))=lower(btrim(da.employee_name)))=1
        and exists(select 1 from jsonb_array_elements_text(
          coalesce(j.data->'assignment'->'crewMembers','[]'::jsonb) ||
          jsonb_build_array(j.data->'assignment'->>'crewLead')) n
          where lower(btrim(n))=lower(btrim(da.employee_name)))
      end));
$$;
create function app_private.thread_access(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select app_private.staff_role() is not null or exists(
    select 1 from public.dispatch_thread_participants p join public.dispatch_threads t on t.id=p.thread_id
    where p.thread_id=target and p.employee_id=app_private.driver_employee()
      and (t.thread_type<>'job' or app_private.assigned_job(t.job_id)));
$$;
revoke all on all functions in schema app_private from public,anon;
grant execute on all functions in schema app_private to authenticated, service_role;

-- A whitelist projection: new financial fields never leak into driver responses.
create function public.get_driver_today() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('job',coalesce(safe.data,'{}'::jsonb) || jsonb_build_object('id',j.id,'status',j.status,
   'assignment',jsonb_build_object('crewLead',j.data#>'{assignment,crewLead}','crewMembers',coalesce(j.data#>'{assignment,crewMembers}','[]'::jsonb),
     'vehicleId',j.data#>'{assignment,vehicleId}','vehicleName',j.data#>'{assignment,vehicleName}')))), '[]'::jsonb)
 from public.jobs j cross join lateral (
   select jsonb_object_agg(key,value) as data from jsonb_each(j.data)
   where key=any(array['jobNumber','customerName','jobLabel','phone','address','city','state','zip',
     'scheduledStart','scheduledEnd','vehicleId','vehicleName','notes','internalNotes','materialName','materialType',
     'createdAt','updatedAt','facilityId','facilityName','cubicYards','estimatedWeightLbs','estimatedTons'])
 ) safe where app_private.assigned_job(j.id);
$$;
create function public.driver_update_job_status(target_job_id text,next_status text,note text default null) returns void
language plpgsql security definer set search_path='' as $$
declare prior text; allowed jsonb := '{"assigned":["en_route","delayed","issue"],"en_route":["arrived","in_progress","delayed","issue"],"arrived":["in_progress","delayed","issue"],"in_progress":["paused","loaded","completed","delayed","issue"],"paused":["in_progress","completed","issue"],"loaded":["en_route_to_next_stop","en_route_to_disposal","paused","completed","delayed","issue"],"en_route_to_next_stop":["arrived","paused","completed","delayed","issue"],"en_route_to_disposal":["dumping","paused","completed","delayed","issue"],"dumping":["completed","paused","delayed","issue"],"delayed":["en_route","arrived","in_progress","loaded","issue"],"issue":["in_progress"],"completed":[],"canceled":[]}';
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
end $$;
create function public.driver_create_thread(kind text,target_job_id text default null) returns uuid
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
      where a.status='activated' and case when j.data->'assignment' ? 'employeeIds' then
        (j.data->'assignment'->'employeeIds') ? a.employee_id
      else
        (select count(distinct b.employee_id) from public.driver_activations b where b.status='activated'
          and lower(btrim(b.employee_name))=lower(btrim(a.employee_name)))=1
        and exists(select 1 from jsonb_array_elements_text(coalesce(j.data->'assignment'->'crewMembers','[]'::jsonb)
          || jsonb_build_array(j.data->'assignment'->>'crewLead')) n where lower(btrim(n))=lower(btrim(a.employee_name)))
      end on conflict(thread_id,employee_id) do nothing;
    end if;
  end if;
  return result;
end $$;
revoke all on function public.get_driver_today(),public.driver_update_job_status(text,text,text),public.driver_create_thread(text,text) from public,anon;
grant execute on function public.get_driver_today(),public.driver_update_job_status(text,text,text),public.driver_create_thread(text,text) to authenticated;

create function public.get_driver_facilities() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'facilityName',facility_name,'address',address,'city',city)),'[]'::jsonb)
 from public.facilities where is_active and app_private.driver_session() is not null;
$$;
revoke all on function public.get_driver_facilities() from public,anon;
grant execute on function public.get_driver_facilities() to authenticated;
-- Drivers cannot update thread metadata; the database bumps activity itself.
create function app_private.bump_thread_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.dispatch_threads set updated_at=now() where id=new.thread_id;
 return new;
end $$;
revoke all on function app_private.bump_thread_activity() from public,anon,authenticated;
create trigger bump_thread_activity after insert on public.dispatch_messages
 for each row execute function app_private.bump_thread_activity();
commit;
