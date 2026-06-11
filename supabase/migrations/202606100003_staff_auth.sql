-- Staff authentication ("the front door" for the office app).
--
-- NOT APPLIED YET — Abe applies migrations to the live database himself.
--
-- Staff sign in at /login with email + 4-digit PIN. The PIN hash uses the
-- exact same PBKDF2-SHA256 format as driver PINs (client/src/lib/driverAuth.ts
-- and server/driverAuth.ts):  pbkdf2-sha256$<iterations>$<saltB64>$<hashB64>
-- so hashes written by either side verify on the other.
--
-- RLS matches the driver activation/session tables: any `authenticated` user
-- (the app's transparent anonymous session) can read/insert/update. The PIN
-- hash carries the real access control until real auth lands.

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  pin_hash text not null,
  role text not null default 'dispatcher' check (role in ('owner', 'dispatcher')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Logins look up by email.
create index if not exists staff_email_idx on public.staff (email);

alter table public.staff enable row level security;

create policy "staff readable by authenticated"
  on public.staff for select to authenticated using (true);
create policy "staff writable by authenticated"
  on public.staff for insert to authenticated with check (true);
create policy "staff updatable by authenticated"
  on public.staff for update to authenticated using (true) with check (true);

-- ─── Seed users ──────────────────────────────────────────────────────────────
-- ⚠️ EDIT THE EMAILS BELOW BEFORE APPLYING — these are placeholders.
-- ⚠️ Both PINs are the temporary 0000. CHANGE BOTH PINs after the first
--    deploy (there is no PIN-change UI yet; update pin_hash directly, or ask
--    Claude to generate a new hash — same format as driver PINs).
insert into public.staff (full_name, email, pin_hash, role)
values
  (
    'Abe',
    'abe@example.com',  -- ⚠️ placeholder: replace with Abe's real email
    'pbkdf2-sha256$100000$do/b1iqCukxybLrwJEgbYQ==$P40Clr4KUBKZAWkiuDXa7rtPJ9AyObuEJfcy2CG8Dfo=',  -- PIN 0000
    'owner'
  ),
  (
    'Sam',
    'sam@example.com',  -- ⚠️ placeholder: replace with Sam's real email
    'pbkdf2-sha256$100000$zuoKEDxRvL+oB2fLnk+wjA==$1fAfxiw9WokkmkSFx4RW9x5MC7NJgqHMtwTrF8ZY7pU=',  -- PIN 0000
    'owner'
  )
on conflict (email) do nothing;
