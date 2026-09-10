create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema storage;
create schema extensions;
create extension pgcrypto with schema extensions;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
grant usage on schema auth,storage to authenticated,anon,service_role;
create table auth.users(id uuid primary key);
create table public.staff(id uuid primary key, role text,active boolean);
create table public.staff_sessions(token text primary key,staff_id uuid,expires_at timestamptz);
create table public.driver_activations(id uuid primary key,employee_id text,employee_name text,status text);
create table public.driver_sessions(id uuid primary key,activation_id uuid,employee_id text,display_name text,session_token_hash text,last_lat float);
create table public.driver_location_history(id uuid default gen_random_uuid(),session_id uuid,employee_id text,lat float);
create table public.jobs(id text primary key,status text,data jsonb,updated_at timestamptz);
create table public.facilities(id text,facility_name text,address text,city text,is_active boolean);
create table public.saved_estimates(id text);
create table public.customers(id text);
create table public.clients(id text primary key,name text);
create table public.pricebook_items(id text primary key,tenant_id text);
create table public.app_settings(key text primary key,value jsonb);
create table public.dispatch_threads(id uuid primary key default gen_random_uuid(),thread_type text,job_id text,title text,created_by text,archived boolean default false,updated_at timestamptz default now());
create table public.dispatch_thread_participants(id uuid primary key default gen_random_uuid(),thread_id uuid references public.dispatch_threads,employee_id text,last_read_at timestamptz,unique(thread_id,employee_id));
create table public.dispatch_messages(id uuid primary key default gen_random_uuid(),thread_id uuid,sender_id text,sender_name text,body text);
create table public.job_photos(id uuid primary key default gen_random_uuid(),job_id text,storage_path text);
create table public.negotiation_job_map(tenant_id text,negotiation_id text);
create table public.thumbtack_leads(tenant_id text,negotiation_id text);
create view public.app_leads_v as select l.* from public.thumbtack_leads l left join public.negotiation_job_map n using(tenant_id,negotiation_id);
create table storage.buckets(id text primary key,public boolean);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create policy legacy_storage on storage.objects for all to authenticated using(true) with check(true);
insert into storage.buckets values('job-photos',true);
create function public.dashboard_metrics(p_tenant text,p_date date) returns jsonb language sql stable security definer as $$ select jsonb_build_object('tenant',p_tenant,'date',p_date) $$;
create function public.dashboard_metrics_series(p_tenant text,p_date date,p_days integer default 8) returns jsonb language sql stable security definer as $$ select '[]'::jsonb $$;
create function public.forward_fill_negotiation_job_map() returns void language sql security definer as $$ select $$;
-- Reproduce broad app access but leave login tables with no policies.
do $$ declare t text; begin
for t in select tablename from pg_tables where schemaname='public' loop
 execute format('alter table public.%I enable row level security',t);
 if t not in ('staff','staff_sessions','negotiation_job_map') then
 execute format('create policy legacy_all on public.%I for all to authenticated using(true) with check(true)',t);
 end if;
end loop; end $$;
grant all on all tables in schema public,storage to authenticated,anon,service_role;
insert into auth.users values
 ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004');
insert into public.staff values('00000000-0000-0000-0000-000000000010','owner',true);
insert into public.staff_sessions values(repeat('s',64),'00000000-0000-0000-0000-000000000010',now()+interval '1 day');
insert into public.driver_activations values
 ('00000000-0000-0000-0000-000000000020','driver-a','Driver A','activated'),
 ('00000000-0000-0000-0000-000000000021','driver-b','Driver B','activated');
insert into public.driver_sessions values
 ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020','driver-a','Driver A',encode(extensions.digest(repeat('d',64),'sha256'),'hex'),0),
 ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000021','driver-b','Driver B',encode(extensions.digest(repeat('e',64),'sha256'),'hex'),0);
insert into public.jobs values
 ('job-a','assigned','{"id":"job-a","assignment":{"crewLead":"Driver A"},"customerName":"Fixture A","quotedAmount":999,"actuals":{"chargedAmount":999},"futureSecret":"hidden"}',now()),
 ('job-b','assigned','{"id":"job-b","assignment":{"crewLead":"Driver B"},"customerName":"Fixture B"}',now()),
 ('unassigned','assigned','{"id":"unassigned","customerName":"Unassigned"}',now());
insert into public.clients values('c','Fixture customer');
insert into public.pricebook_items values('p','progressive'),('w','wellsentry');
insert into public.app_settings values('vision','{}'),('thumbtack_responder','{}');
insert into public.thumbtack_leads values('progressive','p'),('wellsentry','w');
insert into public.negotiation_job_map values('progressive','p'),('wellsentry','w');
insert into storage.objects(bucket_id,name) values('job-photos','job-a/photo.jpg'),('job-photos','job-b/photo.jpg');
