/**
 * The business slug this app instance runs for (`companies.slug`). The browser
 * no longer stamps or filters `tenant_id` itself: the database fills it in
 * (column defaults) and row-level security limits every read and write to this
 * business. That keeps the app working while the shared tables move from the
 * text slug to the company uuid (MCP Phase 1 part 2, step 2).
 *
 * Still passed as `p_tenant` to the dashboard / labor-hours RPCs, which take
 * the slug.
 */
export const APP_TENANT_ID = "progressive";
