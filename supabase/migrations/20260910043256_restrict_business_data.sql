-- Phase 2: deploy the identity-aware client before applying this migration.
-- Restrictive gates intersect existing policies; service-role integrations keep working.
begin;
do $$
declare t record; predicate text;
begin
  for t in select tablename from pg_tables where schemaname='public' loop
    predicate := 'app_private.staff_role() is not null';
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t.tablename and column_name='tenant_id') then
      predicate := predicate || ' and tenant_id = ''progressive''';
    end if;
    if t.tablename='app_settings' then
      predicate := predicate || ' and key not like ''thumbtack\_%'' escape ''\''';
    end if;
    if t.tablename='driver_sessions' then
      predicate := '(app_private.staff_role() is not null or id=app_private.driver_session())';
    elsif t.tablename='driver_location_history' then
      predicate := '(app_private.staff_role() is not null or (session_id=app_private.driver_session() and employee_id=app_private.driver_employee()))';
    elsif t.tablename='dispatch_threads' then
      predicate := 'app_private.thread_access(id)';
    elsif t.tablename='dispatch_thread_participants' then
      predicate := 'app_private.thread_access(thread_id)';
    elsif t.tablename='dispatch_messages' then
      predicate := 'app_private.thread_access(thread_id)';
    elsif t.tablename='job_photos' then
      predicate := '(app_private.staff_role() is not null or app_private.assigned_job(job_id))';
    end if;
    execute format('alter table public.%I enable row level security',t.tablename);
    execute format('create policy business_identity_required on public.%I as restrictive for all to anon, authenticated using (%s) with check (%s)',t.tablename,predicate,predicate);
    execute format('revoke all on public.%I from anon',t.tablename);
    -- TRUNCATE is not protected by RLS.
    execute format('revoke truncate, references, trigger on public.%I from public, authenticated',t.tablename);
  end loop;
end $$;

-- Office identity replaces legacy anonymous creator/manager checks for shared records.
create policy verified_staff_estimates on public.saved_estimates for all to authenticated
 using(app_private.staff_role() is not null) with check(app_private.staff_role() is not null);
create policy verified_staff_customers on public.customers for all to authenticated
 using(app_private.staff_role() is not null) with check(app_private.staff_role() is not null);

-- Ownership is server-derived even when a driver submits another session/employee id.
create policy driver_only_updates_own_session on public.driver_sessions as restrictive
  for update to authenticated using(id=app_private.driver_session()) with check(id=app_private.driver_session());
create policy driver_only_inserts_own_location on public.driver_location_history as restrictive
  for insert to authenticated with check(session_id=app_private.driver_session() and employee_id=app_private.driver_employee());
create policy staff_creates_threads on public.dispatch_threads as restrictive
  for insert to authenticated with check(app_private.staff_role() is not null);
create policy staff_updates_threads on public.dispatch_threads as restrictive
  for update to authenticated using(app_private.staff_role() is not null) with check(app_private.staff_role() is not null);
create policy staff_deletes_threads on public.dispatch_threads as restrictive
  for delete to authenticated using(app_private.staff_role() is not null);
create policy own_participant_insert on public.dispatch_thread_participants as restrictive for insert to authenticated
  with check(app_private.staff_role() is not null or employee_id=app_private.driver_employee());
create policy own_participant_update on public.dispatch_thread_participants as restrictive for update to authenticated
  using(app_private.staff_role() is not null or employee_id=app_private.driver_employee())
  with check(app_private.staff_role() is not null or employee_id=app_private.driver_employee());
create policy staff_participant_delete on public.dispatch_thread_participants as restrictive for delete to authenticated using(app_private.staff_role() is not null);
create policy own_message_insert on public.dispatch_messages as restrictive for insert to authenticated
  with check(app_private.staff_role() is not null or
    (sender_id=app_private.driver_employee() and sender_name=(select display_name from public.driver_sessions where id=app_private.driver_session())));
create policy staff_message_update on public.dispatch_messages as restrictive for update to authenticated
  using(app_private.staff_role() is not null) with check(app_private.staff_role() is not null);
create policy staff_message_delete on public.dispatch_messages as restrictive for delete to authenticated using(app_private.staff_role() is not null);

-- The view must obey underlying RLS, including tenant filters. This one join
-- table was server-only before; grant only the read needed by the invoker view.
alter view public.app_leads_v set (security_invoker=true);
revoke all on public.app_leads_v from public,anon;
grant select on public.negotiation_job_map to authenticated;
create policy staff_read_negotiation_map on public.negotiation_job_map for select to authenticated
  using(app_private.staff_role() is not null and tenant_id='progressive');

-- Move privileged reporting implementations behind guarded public wrappers.
alter function public.dashboard_metrics(text,date) set schema app_private;
alter function public.dashboard_metrics_series(text,date,integer) set schema app_private;
revoke all on function app_private.dashboard_metrics(text,date), app_private.dashboard_metrics_series(text,date,integer) from public,anon,authenticated;
create function public.dashboard_metrics(p_tenant text,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
begin
  if app_private.staff_role() is null and coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'Office login required' using errcode='42501';
  end if;
  if p_tenant is distinct from 'progressive' or p_date is null then
    raise exception 'Invalid report parameters' using errcode='22023';
  end if;
  return app_private.dashboard_metrics(p_tenant,p_date);
end $$;
create function public.dashboard_metrics_series(p_tenant text,p_date date,p_days integer default 8) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
begin
  if app_private.staff_role() is null and coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'Office login required' using errcode='42501';
  end if;
  if p_tenant is distinct from 'progressive' or p_date is null or p_days is null or p_days<1 or p_days>90 then
    raise exception 'Report range must be 1 to 90 days' using errcode='22023';
  end if;
  return (select coalesce(jsonb_agg(app_private.dashboard_metrics(p_tenant,d::date) order by d),'[]'::jsonb)
    from generate_series((p_date-(p_days-1))::timestamp,p_date::timestamp,interval '1 day') g(d));
end $$;
revoke all on function public.dashboard_metrics(text,date),public.dashboard_metrics_series(text,date,integer) from public,anon;
grant execute on function public.dashboard_metrics(text,date),public.dashboard_metrics_series(text,date,integer) to authenticated,service_role;
revoke all on function public.forward_fill_negotiation_job_map() from public,anon,authenticated;

-- All job photos require authorization, including previously public URLs.
update storage.buckets set public=false where id='job-photos';
create policy job_photo_identity on storage.objects as restrictive for all to authenticated
  using(bucket_id<>'job-photos' or app_private.staff_role() is not null or app_private.assigned_job(split_part(name,'/',1)))
  with check(bucket_id<>'job-photos' or app_private.staff_role() is not null or app_private.assigned_job(split_part(name,'/',1)));
create policy job_photo_no_anon on storage.objects as restrictive for all to anon
  using(bucket_id<>'job-photos') with check(bucket_id<>'job-photos');
commit;
