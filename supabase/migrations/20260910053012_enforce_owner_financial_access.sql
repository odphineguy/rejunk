-- Apply only after the role-aware application is deployed.
begin;
-- Operational tables continue through existing staff/driver policies. All other
-- raw tables are owner-only; the pipeline retains service-role BYPASSRLS.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename not in
 ('clients','customers','app_client_meta','app_contact_overrides','profiles','staff','staff_sessions',
 'driver_activations','driver_sessions','driver_location_history','dispatch_threads',
 'dispatch_thread_participants','dispatch_messages','job_photos','capacity_resources',
 'reviews_received','review_requests_sent') loop
 execute format('create policy owner_financial_data on public.%I as restrictive for all to authenticated using (app_private.staff_role() = ''owner'') with check (app_private.staff_role() = ''owner'')',t.tablename);
 end loop;
end $$;

create or replace function public.dashboard_metrics(p_tenant text,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare result jsonb; role_name text := app_private.staff_role();
begin
 if role_name is null and coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Office login required' using errcode='42501'; end if;
 if p_tenant is distinct from 'progressive' or p_date is null then raise exception 'Invalid report parameters' using errcode='22023'; end if;
 result := app_private.dashboard_metrics(p_tenant,p_date);
 if role_name='office' then
 result := app_private.pick_fields(result,array['date','jobs_completed','new_leads','repeat_customers',
 'leads_booked','booking_rate','close_rate_30d','close_booked_30d','close_received_30d',
 'first_reply_median_sec','reviews_received','voice_calls','voice_calls_booked','capacity']);
 end if;
 return result;
end $$;
create or replace function public.dashboard_metrics_series(p_tenant text,p_date date,p_days integer default 8) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
begin
 if app_private.staff_role() is null and coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Office login required' using errcode='42501'; end if;
 if p_tenant is distinct from 'progressive' or p_date is null or p_days is null or p_days<1 or p_days>90 then raise exception 'Report range must be 1 to 90 days' using errcode='22023'; end if;
 return (select coalesce(jsonb_agg(public.dashboard_metrics(p_tenant,d::date) order by d),'[]')
 from generate_series((p_date-(p_days-1))::timestamp,p_date::timestamp,interval '1 day') g(d));
end $$;
-- Receipts contain disposal costs even when JSON financial fields are hidden.
create policy office_no_receipts on public.job_photos as restrictive for all to authenticated
using(app_private.staff_role() is distinct from 'office' or photo_type<>'receipt')
with check(app_private.staff_role() is distinct from 'office' or photo_type<>'receipt');
create function app_private.office_can_read_photo(path text) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.staff_role() is distinct from 'office'
 or not exists(select 1 from public.job_photos where storage_path=path and photo_type='receipt');
$$;
revoke all on function app_private.office_can_read_photo(text) from public,anon;
grant execute on function app_private.office_can_read_photo(text) to authenticated;
create policy office_no_receipt_files on storage.objects as restrictive for select to authenticated
using(bucket_id<>'job-photos' or app_private.office_can_read_photo(name));
commit;
