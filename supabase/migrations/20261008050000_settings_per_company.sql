-- Settings fix, part 1 of 5 (additive only).
-- Lets each company keep its own copy of each setting:
--   app_settings      → one row per (company, key)
--   pricing_defaults  → one row per company
-- The old one-copy-only rules (app_settings_key_key, pricing_defaults id = 1)
-- stay in place until part 4, after the pipeline (part 2) and the app (part 3)
-- save against the new rules. Nothing that works today changes.
begin;

alter table public.app_settings
  add constraint app_settings_tenant_key_key unique (tenant_id, key);

alter table public.pricing_defaults
  add constraint pricing_defaults_tenant_key unique (tenant_id);

commit;
