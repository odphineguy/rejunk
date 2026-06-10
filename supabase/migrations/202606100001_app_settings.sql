-- App settings: one row per /settings/* section (key = "company", "invoices",
-- "tips", ...), value = the section's whole settings object as jsonb. Replaces
-- the localStorage-only rejunk-settings-* stores so configuration is shared
-- across devices; localStorage stays as the offline/warm cache (see
-- client/src/lib/settingsStorage.ts).
--
-- Standalone and additive. Single-tenant for now: any authenticated user
-- (everyone, via the anonymous sign-in) can read and write all rows — same
-- posture as the config tables after 0003_relax_config_writes.

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.app_settings enable row level security;

create policy "app_settings_select" on public.app_settings
  for select to authenticated using (true);

create policy "app_settings_insert" on public.app_settings
  for insert to authenticated with check (true);

create policy "app_settings_update" on public.app_settings
  for update to authenticated using (true) with check (true);

create policy "app_settings_delete" on public.app_settings
  for delete to authenticated using (true);
