/**
 * The business this app instance runs for. rejunk-prod is multi-tenant on the
 * webhook side (`businesses` table: progressive / wellsentry / unknown) and a
 * few tables the app shares with that pipeline carry a `tenant_id`
 * (`pricebook_items`, `thumbtack_*`, `hcp_appointments`, `voice_calls`, …).
 * Every app read of a tenant-scoped table filters on this, and every write
 * stamps it — otherwise `pricebook_items.tenant_id` defaults to 'wellsentry'.
 */
export const APP_TENANT_ID = "progressive";
