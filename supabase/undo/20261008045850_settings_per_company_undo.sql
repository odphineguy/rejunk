-- UNDO for 20261008050000_settings_per_company.sql (settings fix part 1).
-- Only safe before part 3 ships: the app/pipeline upserts on these rules after that.
begin;

alter table public.app_settings drop constraint if exists app_settings_tenant_key_key;
alter table public.pricing_defaults drop constraint if exists pricing_defaults_tenant_key;

commit;
