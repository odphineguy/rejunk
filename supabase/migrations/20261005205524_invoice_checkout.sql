-- Additive invoice collections. No changes to Claude's companies/memberships.
-- Interim Abe Media collection is explicitly restricted to Progressive.
-- Ownership links bridge invoices until the shared tenant_id backfill lands.
begin;
create table public.invoice_payment_ownership (
  invoice_id text primary key references public.app_invoices(id) on delete cascade,
  company_id uuid not null references public.companies(id)
);
create table public.invoice_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null references public.app_invoices(id),
  company_id uuid not null references public.companies(id),
  account_id text not null,
  livemode boolean not null,
  amount_cents bigint not null check (amount_cents between 50 and 99999999),
  snapshot jsonb not null,
  state text not null default 'creating' check (state in ('creating','open','paid','expired')),
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  stripe_event_id text,
  expires_at timestamptz not null default (now() + interval '2 hours'),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create unique index invoice_one_active_checkout on public.invoice_checkout_attempts(invoice_id,livemode)
  where state in ('creating','open');
alter table public.invoice_payment_ownership enable row level security;
alter table public.invoice_checkout_attempts enable row level security;
revoke all on public.invoice_payment_ownership,public.invoice_checkout_attempts from public,anon,authenticated;
grant all on public.invoice_payment_ownership,public.invoice_checkout_attempts to service_role;

-- Existing invoices belong to Progressive in today's single-company app.
-- Refuse an ambiguous backfill rather than guessing after another company appears.
do $$ begin
  if (select count(*) from public.companies) <> 1 or not exists(select 1 from public.companies where slug='progressive') then
    raise exception 'Review invoice ownership before applying: expected only Progressive';
  end if;
end $$;
insert into public.invoice_payment_ownership(invoice_id,company_id)
  select i.id,c.id from public.app_invoices i cross join public.companies c where c.slug='progressive';

create function app_private.bind_invoice_payment_company() returns trigger
language plpgsql security definer set search_path='' as $$
declare company uuid;
begin
  -- Once Claude adds tenant_id, respect it; never replace it with Progressive.
  company := nullif(to_jsonb(new)->>'tenant_id','')::uuid;
  if company is null then
    if (select count(*) from public.companies) <> 1 then
      raise exception 'Invoice company is required';
    end if;
    select id into company from public.companies where slug='progressive';
  end if;
  if company is null then raise exception 'Invoice company is required'; end if;
  insert into public.invoice_payment_ownership(invoice_id,company_id) values(new.id,company);
  return new;
end $$;
create trigger invoice_payment_company after insert on public.app_invoices
  for each row execute function app_private.bind_invoice_payment_company();

create function app_private.guard_invoice_collection() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.invoice_checkout_attempts where invoice_id=old.id and state <> 'expired') then
      raise exception 'Invoices with a payment link or payment cannot be deleted';
    end if;
    return old;
  end if;
  if new.id <> old.id then raise exception 'Invoice ID cannot change'; end if;
  if nullif(to_jsonb(new)->>'tenant_id','') is not null and
     not exists(select 1 from public.invoice_payment_ownership where invoice_id=old.id and company_id=(to_jsonb(new)->>'tenant_id')::uuid) then
    raise exception 'Invoice company cannot change after collection ownership is assigned';
  end if;
  -- Freeze the amount/customer/status while a customer has a usable link.
  if exists(select 1 from public.invoice_checkout_attempts where invoice_id=old.id and state in ('creating','open')) and
     (new.data - 'notes') is distinct from (old.data - 'notes') then
    raise exception 'Cancel the payment link before editing this invoice';
  end if;
  -- Webhook updates run as service_role; browsers cannot overwrite verified payments.
  if coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' and
     exists(select 1 from public.invoice_checkout_attempts where invoice_id=old.id and livemode and state='paid') and
     (new.data - 'notes') is distinct from (old.data - 'notes') then
    raise exception 'Paid card invoices can only be adjusted through payment reconciliation';
  end if;
  return new;
end $$;
create trigger invoice_collection_guard before update or delete on public.app_invoices
  for each row execute function app_private.guard_invoice_collection();

create function app_private.guard_stripe_payment_record() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.id like 'stripe:%' and coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'Stripe payment history cannot be changed or deleted from the browser';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger stripe_payment_history_guard before update or delete on public.app_payments
  for each row execute function app_private.guard_stripe_payment_record();

create function public.reserve_invoice_checkout(target_invoice text,target_company uuid,collecting_account text,is_live boolean,expected_data jsonb,amount bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare inv public.app_invoices; attempt public.invoice_checkout_attempts;
begin
  select * into inv from public.app_invoices where id=target_invoice for update;
  if not found or not exists(select 1 from public.invoice_payment_ownership where invoice_id=target_invoice and company_id=target_company) then
    raise exception 'Invoice company mismatch';
  end if;
  select * into attempt from public.invoice_checkout_attempts where invoice_id=target_invoice and livemode=is_live and state in ('creating','open');
  if found then
    if attempt.company_id<>target_company or attempt.account_id<>collecting_account then raise exception 'Collecting account mismatch'; end if;
    return to_jsonb(attempt);
  end if;
  if inv.data is distinct from expected_data then raise exception 'Invoice changed; refresh and retry'; end if;
  if inv.data->>'status' not in ('sent','partial','overdue') then raise exception 'Invoice is not collectible'; end if;
  insert into public.invoice_checkout_attempts(invoice_id,company_id,account_id,livemode,amount_cents,snapshot)
    values(target_invoice,target_company,collecting_account,is_live,amount,expected_data) returning * into attempt;
  return to_jsonb(attempt);
end $$;

create function public.attach_invoice_checkout(attempt_id uuid,session_id text)
returns void language plpgsql security definer set search_path='' as $$
declare attempt public.invoice_checkout_attempts;
begin
  select * into attempt from public.invoice_checkout_attempts where id=attempt_id for update;
  if not found then raise exception 'Attempt missing'; end if;
  if attempt.stripe_session_id is not null and attempt.stripe_session_id<>session_id then raise exception 'Session mismatch'; end if;
  update public.invoice_checkout_attempts set stripe_session_id=session_id,state=case when state='creating' then 'open' else state end where id=attempt_id;
end $$;

create function public.settle_invoice_checkout(attempt_id uuid,session_id text,payment_intent_id text,stripe_event_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt public.invoice_checkout_attempts; inv public.app_invoices; paid numeric; due numeric; total numeric; payment_id text;
begin
  -- Same lock order as reserve/edits: invoice first, attempt second.
  select * into attempt from public.invoice_checkout_attempts where id=attempt_id;
  if not found then raise exception 'Attempt missing'; end if;
  select * into inv from public.app_invoices where id=attempt.invoice_id for update;
  select * into attempt from public.invoice_checkout_attempts where id=attempt_id for update;
  if attempt.stripe_session_id is distinct from session_id then raise exception 'Session mismatch'; end if;
  if attempt.state='paid' then return jsonb_build_object('paid',true,'livemode',attempt.livemode); end if;
  if attempt.state not in ('open','creating') then raise exception 'Checkout state requires review'; end if;
  update public.invoice_checkout_attempts set state='paid',stripe_payment_intent_id=payment_intent_id,
    stripe_event_id=settle_invoice_checkout.stripe_event_id,paid_at=now() where id=attempt_id;
  -- Sandbox transactions never mark real invoices paid or enter real revenue.
  if not attempt.livemode then return jsonb_build_object('paid',true,'livemode',false); end if;
  if (inv.data - 'notes') is distinct from (attempt.snapshot - 'notes') then raise exception 'Invoice changed before settlement'; end if;
  total := (inv.data->>'total')::numeric;
  paid := coalesce((inv.data->>'amountPaid')::numeric,0) + attempt.amount_cents::numeric/100;
  due := greatest(0,round(total-paid,2));
  payment_id := 'stripe:' || attempt.account_id || ':' || payment_intent_id;
  insert into public.app_payments(id,data) values(payment_id,jsonb_build_object(
    'id',payment_id,'customerName',inv.data->>'clientName','method','Credit Card',
    'baseAmount',attempt.amount_cents::numeric/100,'tip',0,'paidAt',now(),
    'jobId',inv.data->>'jobId','invoiceId',attempt.invoice_id,'createdAt',now(),'updatedAt',now(),
    'companyId',attempt.company_id,'stripeAccountId',attempt.account_id,'stripePaymentIntentId',payment_intent_id,'stripeCheckoutSessionId',session_id,'livemode',true));
  update public.app_invoices set data=data || jsonb_build_object('amountPaid',paid,'amountDue',due,'status',case when due=0 then 'paid' else 'partial' end),updated_at=now() where id=attempt.invoice_id;
  return jsonb_build_object('paid',true,'livemode',true);
end $$;
revoke all on function public.reserve_invoice_checkout(text,uuid,text,boolean,jsonb,bigint), public.attach_invoice_checkout(uuid,text), public.settle_invoice_checkout(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_invoice_checkout(text,uuid,text,boolean,jsonb,bigint), public.attach_invoice_checkout(uuid,text), public.settle_invoice_checkout(uuid,text,text,text) to service_role;
revoke all on function app_private.bind_invoice_payment_company(),app_private.guard_invoice_collection() from public,anon,authenticated;
revoke all on function app_private.guard_stripe_payment_record() from public,anon,authenticated;
commit;
