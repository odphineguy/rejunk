-- Pricebook v4 catalog (categories + items).
--
-- The Pricebook is the authoritative service/junk/moving price list (transcribed
-- from rejunk-pricebook-v4.md). It backs the Pricebook page, the service estimator,
-- and — later — the Thumbtack auto-quote engine. Like config tables, it stores
-- canonical columns (no jsonb snapshot) so a server-side quote engine can read it.
--
-- No auth gate yet (anonymous sign-in, no role UI), so it is writable by any
-- authenticated session — same pragmatic stance as 0003/0004. Re-tighten once a
-- real login + role management exists.

create table if not exists public.pricebook_categories (
  id          text primary key,
  name        text not null,
  description text not null default '',
  image_name  text,
  mode        text,
  sort_order  integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.pricebook_items (
  id                    text primary key,
  name                  text not null,
  model_number          text,
  price                 numeric not null default 0,
  cost                  numeric not null default 0,
  category_id           text references public.pricebook_categories (id) on delete cascade,
  item_type             text not null default 'Service',
  description           text not null default '',
  image_name            text,
  crew_size             integer,
  margin_decimal        numeric,
  price_unit            text not null default 'flat',
  price_note            text,
  mode                  text,
  notes                 text,
  photo_required        boolean not null default false,
  add_to_online_booking boolean not null default false,
  taxable               boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists pricebook_items_category_id_idx on public.pricebook_items (category_id);
create index if not exists pricebook_categories_sort_order_idx on public.pricebook_categories (sort_order);

create trigger set_updated_at before update on public.pricebook_categories
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pricebook_items
  for each row execute function public.set_updated_at();

alter table public.pricebook_categories enable row level security;
alter table public.pricebook_items enable row level security;

create policy "pricebook_categories readable by authenticated"
  on public.pricebook_categories for select to authenticated using (true);
create policy "pricebook_categories writable by authenticated"
  on public.pricebook_categories for all to authenticated using (true) with check (true);

create policy "pricebook_items readable by authenticated"
  on public.pricebook_items for select to authenticated using (true);
create policy "pricebook_items writable by authenticated"
  on public.pricebook_items for all to authenticated using (true) with check (true);
