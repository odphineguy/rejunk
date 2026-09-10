-- Synthetic additions to business-access-fixture.sql, for this migration only.
alter table jobs add created_by uuid, add job_number text, add source text, add estimate_id text,
 add customer_name text, add payment_status text, add scheduled_start timestamptz, add quoted_amount numeric;
alter table saved_estimates add primary key(id), add created_by uuid, add customer_name text,
 add job_address text, add material_type text, add vehicle_id text, add facility_id text,
 add final_quote numeric, add data jsonb, add updated_at timestamptz;
create table vehicles(id text, vehicle_name text,hourly_vehicle_cost numeric);
create table material_pricing_rules(id text,material_name text,labor_difficulty_multiplier numeric);
create table volume_benchmarks(id text,price numeric);
create table pricing_defaults(id int,hourly_labor_cost numeric);
create table pricebook_categories(id text,tenant_id text);
create table thumbtack_messages(id text,tenant_id text,negotiation_id text,direction text,from_type text,text text,sent_at timestamptz,raw_payload jsonb);
alter table pricebook_items add price numeric,add cost numeric,add margin_decimal numeric;
alter table thumbtack_leads add lead_price text;
create or replace view app_leads_v as select l.* from thumbtack_leads l left join negotiation_job_map n using(tenant_id,negotiation_id);
insert into vehicles values('van','Van',34);
insert into material_pricing_rules values('junk','Junk',2);
insert into pricing_defaults values(1,99);
update pricebook_items set price=200,cost=60,margin_decimal=.7;
update jobs set quoted_amount=999,data=data||'{"quotedAmount":999,"estimatedCost":123,"estimatedProfit":876,"paymentStatus":"paid","recommendationSnapshot":{"privateCost":123},"actuals":{"disposalCost":99}}'::jsonb;
insert into saved_estimates values('estimate-a',null,'Test','Test address','mixed_junk','van','dump',500,'{"id":"estimate-a","finalQuote":500,"grossProfitDollars":300,"service":{"total":500,"estimatedCost":200,"lineItems":[{"name":"Test","unitPrice":500,"cost":200}]}}',now());
insert into thumbtack_messages values('m','progressive','n','outbound','business','Your quote is $500',now(),'{"privateCost":200}');
insert into auth.users values('00000000-0000-0000-0000-000000000005');
insert into staff values('00000000-0000-0000-0000-000000000011','office',true);
insert into staff_sessions values(repeat('o',64),'00000000-0000-0000-0000-000000000011',now()+interval '1 day');
create or replace function dashboard_metrics(p_tenant text,p_date date) returns jsonb language sql stable security definer as $$ select jsonb_build_object('date',p_date,'revenue',900,'collected',800,'avg_job_size',450,'jobs_completed',2,'future_financial_metric',777) $$;
grant all on all tables in schema public to authenticated,service_role;

alter table job_photos add photo_type text not null default 'other';
