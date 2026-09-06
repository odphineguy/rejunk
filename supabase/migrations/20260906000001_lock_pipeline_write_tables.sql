-- Security audit 2026-09-05, item 1 — APPLIED to rejunk-prod (iozmgsopcyezkntnqbgj)
-- 2026-09-06 via the Supabase MCP.
--
-- These four pipeline tables carried an ALL policy for `authenticated` that
-- existed only in the live DB (never in this repo). Because the app signs every
-- visitor in anonymously, "authenticated" meant anyone on the internet could:
--   * insert a status='pending' row into thumbtack_outbox — thumbtack-send then
--     messages a real customer as the business;
--   * rewrite businesses.responder_config (rate cards, quote caps, phone numbers,
--     bot on/off);
--   * flood or delete pipeline_alerts; scramble thumbtack_category_map.
-- The app never reads or writes any of them from the browser, and every pipeline
-- function uses the service-role key (which bypasses RLS), so dropping the
-- policies changes nothing for staff, drivers, or the bot. The *_rw_service
-- policies stay.

drop policy if exists thumbtack_outbox_rw_auth       on public.thumbtack_outbox;
drop policy if exists businesses_rw_auth             on public.businesses;
drop policy if exists pipeline_alerts_rw_auth        on public.pipeline_alerts;
drop policy if exists thumbtack_category_map_rw_auth on public.thumbtack_category_map;
