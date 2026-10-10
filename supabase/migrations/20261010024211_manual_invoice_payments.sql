-- Additive recording of money already received. No Stripe calls or live collection.
-- Apply only this migration after reviewing company/auth prerequisites.
begin;
create table public.received_invoice_payments (
  request_id uuid primary key,
  company_id uuid not null references public.companies(id),
  invoice_id text not null references public.app_invoices(id),
  payment_id text not null unique references public.app_payments(id),
  method text not null,
  reference text not null,
  amount_cents bigint not null check (amount_cents between 1 and 99999999),
  received_date date not null,
  expected_paid_cents bigint not null,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  unique(company_id,method,reference)
);
create index received_payments_invoice on public.received_invoice_payments(invoice_id);
alter table public.received_invoice_payments enable row level security;
revoke all on public.received_invoice_payments from public,anon,authenticated;
grant all on public.received_invoice_payments to service_role;

create function public.record_received_invoice_payment(
  owner_token text, target_company uuid, request_id uuid, target_invoice text,
  received_method text, amount_cents bigint, received_date date,
  payment_reference text, expected_paid_cents bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid;
  inv public.app_invoices;
  prior public.received_invoice_payments;
  ref text := lower(btrim(payment_reference));
  total_cents bigint;
  paid_cents bigint;
  new_paid numeric;
  due numeric;
  payment_id text := 'manual:' || request_id::text;
  payment jsonb;
begin
  -- Recheck authorization inside the transaction, including on retries.
  select s.auth_user_id into actor from public.staff_sessions ss
    join public.staff s on s.id=ss.staff_id
    join public.memberships m on m.user_id=s.auth_user_id and m.tenant_id=s.tenant_id
    where ss.token=owner_token and ss.expires_at>now() and s.active and s.role='owner'
      and m.role='owner' and s.tenant_id=target_company;
  if actor is null then raise exception using errcode='RJP01',message='Current owner required'; end if;
  if request_id is null or target_invoice is null or received_method is null or
     received_method not in ('Zelle','Cash','Check','Offline Credit Card','ACH') or
     amount_cents is null or amount_cents not between 1 and 99999999 or
     expected_paid_cents is null or expected_paid_cents not between 0 and 99999999 or
     ref is null or length(ref) not between 1 and 200 or
     received_date is null or received_date > (now() at time zone 'America/Phoenix')::date or
     received_date < date '2000-01-01' then
    raise exception using errcode='RJP07',message='Invalid payment details';
  end if;
  -- Serialize owner recording retries/reference checks for this company.
  perform pg_advisory_xact_lock(hashtextextended(target_company::text || ':received-payment',0));
  select * into inv from public.app_invoices where id=target_invoice and tenant_id=target_company for update;
  if not found or not exists(select 1 from public.invoice_payment_ownership
      where invoice_id=target_invoice and company_id=target_company) then
    raise exception using errcode='RJP02',message='Invoice company mismatch';
  end if;
  select * into prior from public.received_invoice_payments r where r.request_id=record_received_invoice_payment.request_id;
  if found then
    if prior.company_id is distinct from target_company or prior.invoice_id is distinct from target_invoice or
       prior.method is distinct from received_method or prior.reference is distinct from ref or
       prior.amount_cents is distinct from amount_cents or prior.received_date is distinct from received_date or
       prior.expected_paid_cents is distinct from expected_paid_cents then
      raise exception using errcode='RJP03',message='Retry details changed';
    end if;
    select data into payment from public.app_payments where id=prior.payment_id and tenant_id=target_company;
    return jsonb_build_object('payment',payment,'invoice',inv.data,'duplicate',true);
  end if;
  if exists(select 1 from public.received_invoice_payments r where r.company_id=target_company and r.method=received_method and r.reference=ref) or
     exists(select 1 from public.app_payments p where p.tenant_id=target_company and
       (lower(p.data->>'stripePaymentIntentId')=ref or
        (p.data->>'method'=received_method and lower(btrim(p.data->>'reference'))=ref))) then
    raise exception using errcode='RJP03',message='Duplicate reference';
  end if;
  if exists(select 1 from public.invoice_checkout_attempts where invoice_id=target_invoice and state in ('creating','open')) then
    raise exception using errcode='RJP05',message='Active payment link';
  end if;
  total_cents := round((inv.data->>'total')::numeric*100);
  -- Preserve legacy aggregate payments. Never assume they are zero.
  paid_cents := round(coalesce((inv.data->>'amountPaid')::numeric,
    case when inv.data->>'status'='paid' then (inv.data->>'total')::numeric else 0 end)*100);
  if total_cents is null or paid_cents is null or paid_cents<0 or total_cents<0 then
    raise exception using errcode='RJP06',message='Invalid invoice balance';
  end if;
  if paid_cents<>expected_paid_cents then
    raise exception using errcode='RJP04',message='Balance changed';
  end if;
  if inv.data->>'status' is null or inv.data->>'status' not in ('draft','sent','partial','overdue') or
     amount_cents>total_cents-paid_cents then
    raise exception using errcode='RJP06',message='Invoice not payable or amount exceeds balance';
  end if;
  new_paid := (paid_cents+amount_cents)::numeric/100;
  due := (total_cents-paid_cents-amount_cents)::numeric/100;
  payment := jsonb_build_object(
    'id',payment_id,'customerName',inv.data->>'clientName','method',received_method,
    'baseAmount',amount_cents::numeric/100,'tip',0,
    'paidAt',received_date::text || 'T12:00:00-07:00',
    'jobId',inv.data->>'jobId','invoiceId',target_invoice,
    'reference',btrim(payment_reference),'source','manual','recordedBy',actor,
    'createdAt',now(),'updatedAt',now());
  insert into public.app_payments(id,tenant_id,data) values(payment_id,target_company,payment);
  insert into public.received_invoice_payments values(
    request_id,target_company,target_invoice,payment_id,received_method,ref,amount_cents,
    received_date,expected_paid_cents,actor,now());
  update public.app_invoices set data=data || jsonb_build_object(
    'paymentRecorded',true,'amountPaid',new_paid,'amountDue',due,'status',case when due=0 then 'paid' else 'partial' end),
    updated_at=now() where id=target_invoice returning * into inv;
  return jsonb_build_object('payment',payment,'invoice',inv.data,'duplicate',false);
end $$;
revoke all on function public.record_received_invoice_payment(text,uuid,uuid,text,text,bigint,date,text,bigint) from public,anon,authenticated;
grant execute on function public.record_received_invoice_payment(text,uuid,uuid,text,text,bigint,date,text,bigint) to service_role;

create function app_private.guard_received_payment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    if (new.id like 'manual:%' or new.data->>'source'='manual') and
       coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then
      raise exception 'Received payments must be recorded by the payment service';
    end if;
    return new;
  end if;
  if old.id like 'manual:%' or old.data->>'source'='manual' or
     (tg_op='UPDATE' and (new.id like 'manual:%' or new.data->>'source'='manual')) then
    raise exception 'Recorded payments are retained; use reconciliation for corrections';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger received_payment_guard before insert or update or delete on public.app_payments
  for each row execute function app_private.guard_received_payment();

create function app_private.guard_received_invoice() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.received_invoice_payments where invoice_id=old.id) then
    if tg_op='DELETE' then raise exception 'Invoices with recorded payments must be retained'; end if;
    if new.tenant_id is distinct from old.tenant_id then raise exception 'Invoice company cannot change'; end if;
    if coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' and
       (new.data - 'notes') is distinct from (old.data - 'notes') then
      raise exception 'Invoice with recorded payments can only be adjusted through reconciliation';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger received_invoice_guard before update or delete on public.app_invoices
  for each row execute function app_private.guard_received_invoice();
revoke all on function app_private.guard_received_payment(),app_private.guard_received_invoice() from public,anon,authenticated;
commit;
