-- Invoices are shared across staff devices. Private costs and payment records
-- remain owner-only elsewhere.
begin;
create table if not exists public.app_invoices (
  id text primary key,
  invoice_number integer not null unique,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_invoices enable row level security;
revoke all on public.app_invoices from public, anon, authenticated;
grant select, insert, update, delete on public.app_invoices to authenticated;
grant all on public.app_invoices to service_role;
create policy app_invoices_staff on public.app_invoices for all to authenticated
  using (app_private.staff_role() is not null)
  with check (app_private.staff_role() is not null);
commit;
