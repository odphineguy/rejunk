-- MCP connector Phase 1, part 2, step 2 — ship 1 (app made tag-agnostic).
-- The browser no longer stamps tenant_id; it relies on column defaults plus
-- row-level security. The pricebook tables still defaulted to 'wellsentry'
-- (the pipeline's original tenant), which the business_identity_required
-- policy rejects for office writes — new categories never carried a tenant at
-- all. Default both to Progressive. The pipeline's pricebook importer stamps
-- tenant_id explicitly, so it is unaffected. Ship 3 (the uuid switch) turns
-- these into the Progressive company id.
begin;

alter table public.pricebook_items alter column tenant_id set default 'progressive';
alter table public.pricebook_categories alter column tenant_id set default 'progressive';

commit;
