-- Run ONLY in an empty disposable database. Never use the production URL.
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/security/test-received-payments.sql
create role anon;
create role authenticated;
create role service_role;
create schema app_private;
create table companies(id uuid primary key,slug text);
insert into companies values('208a0172-b9f8-49e4-8eab-4021bf627c50','progressive');
create table app_invoices(id text primary key,invoice_number int,tenant_id uuid,data jsonb,updated_at timestamptz default now());
create table app_payments(id text primary key,tenant_id uuid,data jsonb);
create table staff(id uuid primary key,auth_user_id uuid,tenant_id uuid,active boolean,role text);
create table staff_sessions(token text,staff_id uuid,expires_at timestamptz);
create table memberships(user_id uuid,tenant_id uuid,role text);
insert into staff values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','208a0172-b9f8-49e4-8eab-4021bf627c50',true,'owner');
insert into staff_sessions values('valid-owner-token','00000000-0000-0000-0000-000000000001',now()+interval '1 hour');
insert into memberships values('00000000-0000-0000-0000-000000000011','208a0172-b9f8-49e4-8eab-4021bf627c50','owner');
\ir ../../supabase/migrations/20261005205524_invoice_checkout.sql
\ir ../../supabase/migrations/20261010024211_manual_invoice_payments.sql
create function pg_temp.record_payment(
  request_id uuid default '00000000-0000-0000-0000-000000000101', invoice_id text default 'fixture',
  ref text default 'zelle-fixture', amount bigint default 5000, expected_paid bigint default 2500,
  company uuid default '208a0172-b9f8-49e4-8eab-4021bf627c50'
) returns jsonb language sql as $$
 select record_received_invoice_payment('valid-owner-token',company,request_id,invoice_id,'Zelle',amount,(now() at time zone 'America/Phoenix')::date,ref,expected_paid);
$$;
create function pg_temp.must_fail(query text, code text) returns void language plpgsql as $$
begin
  execute query;
  raise exception 'Expected failure for %',query;
exception when others then
  if sqlstate <> code then raise exception 'Expected %, got %: %',code,sqlstate,sqlerrm; end if;
end $$;
insert into app_invoices values('fixture',1,'208a0172-b9f8-49e4-8eab-4021bf627c50','{"id":"fixture","total":100,"amountPaid":25,"amountDue":75,"status":"partial","clientName":"Test","jobId":"job-fixture"}');
insert into app_invoices values('other',2,'208a0172-b9f8-49e4-8eab-4021bf627c50','{"id":"other","total":100,"amountPaid":0,"amountDue":100,"status":"sent","clientName":"Other","jobId":""}');
insert into companies values('00000000-0000-0000-0000-000000000002','other-company');
insert into app_invoices values('cross-company',3,'00000000-0000-0000-0000-000000000002','{"id":"cross-company","total":100,"amountPaid":0,"status":"sent"}');
select set_config('request.jwt.claims','{"role":"service_role"}',false);
do $$ declare result jsonb; retry jsonb; company uuid := '208a0172-b9f8-49e4-8eab-4021bf627c50'; attempt jsonb;
begin
  if has_function_privilege('authenticated','record_received_invoice_payment(text,uuid,uuid,text,text,bigint,date,text,bigint)','execute') then raise exception 'Browser RPC access'; end if;
  if has_table_privilege('authenticated','received_invoice_payments','select') then raise exception 'Ledger exposed'; end if;
  if not (select relrowsecurity from pg_class where oid='received_invoice_payments'::regclass) then raise exception 'Missing RLS'; end if;
  result := pg_temp.record_payment();
  retry := pg_temp.record_payment();
  if retry->>'duplicate'<>'true' or (select count(*) from app_payments)<>1 then raise exception 'Retry duplicated payment'; end if;
  if result#>>'{invoice,amountPaid}' <> '75.0000000000000000' and (result#>>'{invoice,amountPaid}')::numeric<>75 then raise exception 'Legacy paid amount lost'; end if;
  if (result#>>'{invoice,amountDue}')::numeric<>25 or result#>>'{invoice,status}'<>'partial' then raise exception 'Wrong balance'; end if;
  if result#>>'{invoice,paymentRecorded}'<>'true' then raise exception 'Missing payment lock'; end if;
  if result#>>'{payment,jobId}'<>'job-fixture' or (select tenant_id from app_payments limit 1)<>company then raise exception 'Wrong company/job'; end if;
  perform pg_temp.must_fail($q$select pg_temp.record_payment('00000000-0000-0000-0000-000000000102',ref=>' ZELLE-FIXTURE ')$q$,'RJP03');
  perform pg_temp.must_fail($q$select pg_temp.record_payment(ref=>'changed')$q$,'RJP03');
  perform pg_temp.must_fail($q$select pg_temp.record_payment('00000000-0000-0000-0000-000000000102',ref=>'new')$q$,'RJP04');
  perform pg_temp.must_fail($q$select pg_temp.record_payment('00000000-0000-0000-0000-000000000102',ref=>'new',expected_paid=>7500)$q$,'RJP06');
  perform pg_temp.must_fail($q$select pg_temp.record_payment('00000000-0000-0000-0000-000000000102',ref=>'new',company=>'00000000-0000-0000-0000-000000000002')$q$,'RJP01');
  perform pg_temp.must_fail($q$select pg_temp.record_payment('00000000-0000-0000-0000-000000000102','missing','new',100,0)$q$,'RJP02');
  perform pg_temp.must_fail($q$select pg_temp.record_payment('00000000-0000-0000-0000-000000000102','cross-company','new',100,0)$q$,'RJP02');
  perform pg_temp.must_fail($q$select record_received_invoice_payment('valid-owner-token','208a0172-b9f8-49e4-8eab-4021bf627c50','00000000-0000-0000-0000-000000000102','other','Zelle',100,current_date+10,'future',0)$q$,'RJP07');
  update memberships set role='office';
  perform pg_temp.must_fail($q$select pg_temp.record_payment()$q$,'RJP01');
  update memberships set role='owner';
  update staff_sessions set expires_at=now()-interval '1 second';
  perform pg_temp.must_fail($q$select pg_temp.record_payment()$q$,'RJP01');
  update staff_sessions set expires_at=now()+interval '1 hour';
  attempt := reserve_invoice_checkout('other',company,'acct_fixture',false,(select data from app_invoices where id='other'),10000);
  perform pg_temp.must_fail($q$select pg_temp.record_payment('00000000-0000-0000-0000-000000000102','other','other-ref',1000,0)$q$,'RJP05');
  update invoice_checkout_attempts set state='expired' where id=(attempt->>'id')::uuid;
  result := pg_temp.record_payment('00000000-0000-0000-0000-000000000102','fixture','remaining',2500,7500);
  if (result#>>'{invoice,amountDue}')::numeric<>0 or result#>>'{invoice,status}'<>'paid' then raise exception 'Final payment not paid'; end if;
  if (select count(*) from app_payments)<>2 then raise exception 'Unexpected payment count'; end if;
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  perform pg_temp.must_fail($q$update app_invoices set data=data||'{"amountPaid":0}' where id='fixture'$q$,'P0001');
  perform pg_temp.must_fail($q$delete from app_invoices where id='fixture'$q$,'P0001');
  perform pg_temp.must_fail($q$delete from app_payments$q$,'P0001');
  perform pg_temp.must_fail($q$update app_payments set data='{}'$q$,'P0001');
  perform pg_temp.must_fail($q$insert into app_payments values('manual:forged',null,'{}')$q$,'P0001');
  update app_invoices set data=data||'{"notes":"editable"}' where id='fixture';
  raise notice 'PASS: atomic records/balances, legacy totals, company/owner/expiry checks, retries, references, link conflicts and browser guards';
end $$;
