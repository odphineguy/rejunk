-- Run ONLY in an empty disposable database, never rejunk-prod.
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/security/test-invoice-checkout.sql
create role anon;
create role authenticated;
create role service_role;
create schema app_private;
create table public.companies(id uuid primary key,slug text unique);
insert into public.companies values('208a0172-b9f8-49e4-8eab-4021bf627c50','progressive');
create table public.app_invoices(id text primary key,invoice_number int,data jsonb,updated_at timestamptz default now());
create table public.app_payments(id text primary key,data jsonb,updated_at timestamptz default now());
insert into public.app_invoices values('existing',1,'{"id":"existing","total":100,"amountDue":100,"status":"sent","clientName":"Fixture","jobId":""}',now());
\ir ../../supabase/migrations/20261005205524_invoice_checkout.sql

do $$
declare company uuid := '208a0172-b9f8-49e4-8eab-4021bf627c50'; a jsonb; b jsonb; inv jsonb;
begin
  if has_function_privilege('authenticated','public.reserve_invoice_checkout(text,uuid,text,boolean,jsonb,bigint)','execute') then raise exception 'Browser can reserve'; end if;
  if has_table_privilege('authenticated','public.invoice_checkout_attempts','select') then raise exception 'Browser can read checkout ledger'; end if;
  if (select company_id from public.invoice_payment_ownership where invoice_id='existing') <> company then raise exception 'Backfill failed'; end if;
  select data into inv from public.app_invoices where id='existing';
  a := public.reserve_invoice_checkout('existing',company,'acct_fixture',true,inv,10000);
  b := public.reserve_invoice_checkout('existing',company,'acct_fixture',true,inv,10000);
  if a->>'id' <> b->>'id' then raise exception 'Double click created duplicate attempts'; end if;
  begin
    update public.app_invoices set data=data||'{"total":1}' where id='existing';
    raise exception 'Invoice editing was allowed';
  exception when others then
    if sqlerrm='Invoice editing was allowed' then raise; end if;
  end;
  update public.app_invoices set data=data||'{"notes":"still editable"}' where id='existing';
  perform public.attach_invoice_checkout((a->>'id')::uuid,'cs_live_fixture');
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.settle_invoice_checkout((a->>'id')::uuid,'cs_live_fixture','pi_fixture','evt_fixture');
  perform public.settle_invoice_checkout((a->>'id')::uuid,'cs_live_fixture','pi_fixture','evt_fixture_duplicate');
  if (select count(*) from public.app_payments)<>1 then raise exception 'Duplicate payment recorded'; end if;
  if (select data->>'amountPaid' from public.app_invoices where id='existing')::numeric <> 100 then raise exception 'Wrong amount paid'; end if;
  if (select data->>'status' from public.app_invoices where id='existing') <> 'paid' then raise exception 'Invoice not paid'; end if;
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  begin
    update public.app_invoices set data=data||'{"amountPaid":0}' where id='existing';
    raise exception 'Stale browser save was allowed';
  exception when others then
    if sqlerrm='Stale browser save was allowed' then raise; end if;
  end;
  begin
    delete from public.app_payments;
    raise exception 'Verified payment deletion was allowed';
  exception when others then
    if sqlerrm='Verified payment deletion was allowed' then raise; end if;
  end;
  insert into public.app_invoices values('sandbox',2,'{"id":"sandbox","total":75,"amountDue":50,"amountPaid":25,"status":"partial","clientName":"Fixture","jobId":""}',now());
  select data into inv from public.app_invoices where id='sandbox';
  a := public.reserve_invoice_checkout('sandbox',company,'acct_sandbox',false,inv,5000);
  perform public.attach_invoice_checkout((a->>'id')::uuid,'cs_test_fixture');
  perform public.settle_invoice_checkout((a->>'id')::uuid,'cs_test_fixture','pi_test_fixture','evt_test_fixture');
  if (select data from public.app_invoices where id='sandbox') is distinct from inv then raise exception 'Sandbox changed real invoice'; end if;
  if (select count(*) from public.app_payments) <> 1 then raise exception 'Sandbox polluted revenue'; end if;
  insert into public.companies values('00000000-0000-0000-0000-000000000002','other');
  begin
    insert into public.app_invoices values('ambiguous',3,'{}',now());
    raise exception 'Ambiguous company insert was allowed';
  exception when others then
    if sqlerrm='Ambiguous company insert was allowed' then raise; end if;
  end;
  raise notice 'PASS: ownership, locks, duplicate settlement, sandbox isolation, browser guards and ambiguous tenant rejection';
end $$;
