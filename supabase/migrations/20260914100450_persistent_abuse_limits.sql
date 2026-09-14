begin;
create table app_private.abuse_windows (
 bucket text primary key,
 hits timestamptz[] not null default '{}',
 expires_at timestamptz not null
);
create index abuse_windows_expiry on app_private.abuse_windows(expires_at);
alter table app_private.abuse_windows enable row level security;
revoke all on app_private.abuse_windows from public,anon,authenticated,service_role;

-- A rolling window, serialized across transactions/servers. Zero means admitted;
-- a positive integer is seconds until enough capacity returns. Only trusted
-- wrappers choose bucket, capacity, window and cost.
create function app_private.take_abuse_budget(bucket_key text, capacity integer, window_seconds integer, cost integer default 1)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare recent timestamptz[]; current_time_value timestamptz; wait_seconds integer;
begin
 if bucket_key is null or length(bucket_key)>200 or capacity<1 or capacity>2000
 or window_seconds<1 or window_seconds>86400 or cost<1 or cost>capacity then
 raise exception 'Invalid limit configuration' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('abuse:'||bucket_key,0));
 current_time_value := clock_timestamp();
 select coalesce(array_agg(t order by t),'{}') into recent
 from app_private.abuse_windows w cross join lateral unnest(w.hits) t
 where w.bucket=bucket_key and t>current_time_value-make_interval(secs=>window_seconds);
 if cardinality(recent)+cost>capacity then
 return greatest(1,ceil(extract(epoch from (recent[cardinality(recent)+cost-capacity]+make_interval(secs=>window_seconds)-current_time_value)))::integer);
 end if;
 insert into app_private.abuse_windows(bucket,hits,expires_at)
 values(bucket_key,recent || array_fill(current_time_value,array[cost]),current_time_value+make_interval(secs=>window_seconds))
 on conflict(bucket) do update set hits=excluded.hits,expires_at=excluded.expires_at;
 -- Bounded opportunistic cleanup; SKIP LOCKED avoids interfering with active requests.
 delete from app_private.abuse_windows where bucket in
 (select bucket from app_private.abuse_windows where expires_at<current_time_value order by expires_at limit 50 for update skip locked);
 return 0;
end $$;
revoke all on function app_private.take_abuse_budget(text,integer,integer,integer) from public,anon,authenticated,service_role;

-- Only the server can reserve an AI call. The independent committed RPC happens
-- BEFORE OpenAI; provider failures and server restarts cannot refund the attempt.
create function public.reserve_vision_analysis(client_ip text, staff_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare ip_key text; retry integer;
begin
 if client_ip is null or length(client_ip)>100 then raise exception 'Invalid IP' using errcode='22023'; end if;
 -- inet canonicalization prevents different IPv6 spellings creating new buckets.
 ip_key := encode(extensions.digest(host(client_ip::inet),'sha256'),'hex');
 if staff_id is not null and not exists(select 1 from public.staff s where s.id=staff_id and s.active and s.role in ('owner','office')) then
 raise exception 'Active office account required' using errcode='42501'; end if;
 retry := app_private.take_abuse_budget('vision:ip:'||ip_key,case when staff_id is null then 20 else 120 end,300);
 if retry=0 and staff_id is not null then
 retry := app_private.take_abuse_budget('vision:staff:'||staff_id,60,300);
 end if;
 if retry=0 then
 retry := app_private.take_abuse_budget(case when staff_id is null then 'vision:public:day' else 'vision:staff:day:'||staff_id end,
 case when staff_id is null then 200 else 500 end,86400);
 end if;
 return jsonb_build_object('allowed',retry=0,'retry_after',retry);
end $$;
revoke all on function public.reserve_vision_analysis(text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_vision_analysis(text,uuid) to service_role;

-- Bind dashboard allowances to the verified staff row, not the disposable
-- transport JWT or session token. Service integrations keep trusted access.
create function app_private.reserve_dashboard(days integer) returns void
language plpgsql volatile security definer set search_path='' as $$
declare staff_id uuid; retry integer;
begin
 if coalesce(auth.jwt()->>'role','')='service_role' then return; end if;
 select s.id into staff_id from app_private.identity_bindings b
 join public.staff_sessions ss on ss.token=b.staff_token
 join public.staff s on s.id=ss.staff_id
 where b.auth_user_id=auth.uid() and ss.expires_at>now() and s.active and s.role in ('owner','office');
 if staff_id is null then raise exception 'Office login required' using errcode='42501'; end if;
 retry:=app_private.take_abuse_budget('dashboard:requests:'||staff_id,60,300);
 if retry=0 then retry:=app_private.take_abuse_budget('dashboard:days:'||staff_id,360,300,days); end if;
 if retry>0 then raise sqlstate 'PT429' using message='Too many dashboard requests. Please wait a few minutes.',detail='Retry after '||retry||' seconds'; end if;
end $$;
revoke all on function app_private.reserve_dashboard(integer) from public,anon,authenticated,service_role;

-- Shared role-aware rendering, callable only by wrappers. Series charges once
-- for all report-days, and never calls the public single-day limiter in a loop.
create function app_private.visible_dashboard(p_tenant text,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=app_private.dashboard_metrics(p_tenant,p_date);
 if app_private.staff_role()='office' then
 result:=app_private.pick_fields(result,array['date','jobs_completed','new_leads','repeat_customers',
 'leads_booked','booking_rate','close_rate_30d','close_booked_30d','close_received_30d',
 'first_reply_median_sec','reviews_received','voice_calls','voice_calls_booked','capacity']);
 end if;
 return result;
end $$;
revoke all on function app_private.visible_dashboard(text,date) from public,anon,authenticated,service_role;

create or replace function public.dashboard_metrics(p_tenant text,p_date date) returns jsonb
language plpgsql volatile security definer set search_path='' set statement_timeout='5s' as $$
begin
 if p_tenant is distinct from 'progressive' or p_date is null then raise exception 'Invalid report parameters' using errcode='22023'; end if;
 perform app_private.reserve_dashboard(1);
 return app_private.visible_dashboard(p_tenant,p_date);
end $$;
create or replace function public.dashboard_metrics_series(p_tenant text,p_date date,p_days integer default 8) returns jsonb
language plpgsql volatile security definer set search_path='' set statement_timeout='5s' as $$
begin
 if p_tenant is distinct from 'progressive' or p_date is null or p_days is null or p_days<1 or p_days>90 then raise exception 'Report range must be 1 to 90 days' using errcode='22023'; end if;
 perform app_private.reserve_dashboard(p_days);
 return (select coalesce(jsonb_agg(app_private.visible_dashboard(p_tenant,d::date) order by d),'[]')
 from generate_series((p_date-(p_days-1))::timestamp,p_date::timestamp,interval '1 day') g(d));
end $$;
commit;
