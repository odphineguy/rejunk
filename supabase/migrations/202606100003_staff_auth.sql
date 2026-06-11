-- Staff authentication ("the front door" for the office app).
--
-- APPLIED to the live DB 2026-06-10 (with Abe's go-ahead; seeded emails are real).
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
-- Both PINs start as 0000 (Abe's call, 2026-06-10: fine for now). To change
-- one later, update pin_hash directly — same PBKDF2 format as driver PINs;
-- ask Claude to generate a new hash.
insert into public.staff (full_name, email, pin_hash, role)
values
  (
    'Abe',
    'odphineguy@gmail.com',
    'pbkdf2-sha256$100000$do/b1iqCukxybLrwJEgbYQ==$P40Clr4KUBKZAWkiuDXa7rtPJ9AyObuEJfcy2CG8Dfo=',  -- PIN 0000
    'owner'
  ),
  (
    'Sam',
    'saake28@gmail.com',
    'pbkdf2-sha256$100000$zuoKEDxRvL+oB2fLnk+wjA==$1fAfxiw9WokkmkSFx4RW9x5MC7NJgqHMtwTrF8ZY7pU=',  -- PIN 0000
    'owner'
  )
on conflict (email) do nothing;
