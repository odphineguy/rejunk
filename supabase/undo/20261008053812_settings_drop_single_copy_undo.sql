-- UNDO for 20261008053812_settings_drop_single_copy.sql (settings fix part 4).
-- Only works while no second company has its own setting / pricing defaults row:
-- the old rules allow one copy in total. Remove extra rows first if needed.
begin;

alter table public.pricing_defaults alter column id drop identity if exists;
alter table public.pricing_defaults alter column id set default 1;
alter table public.pricing_defaults add constraint pricing_defaults_id_check check (id = 1);

alter table public.app_settings add constraint app_settings_key_key unique (key);

commit;
