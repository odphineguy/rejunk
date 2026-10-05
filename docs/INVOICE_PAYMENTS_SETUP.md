# Invoice payments through Abe Media

Implemented locally on 2026-10-05. Claude applied only the invoice-checkout
migration to rejunk-prod and verified its server-only permissions and guards.
A real $1 sandbox Checkout succeeded after an insufficient-funds test decline.
Stripe's signed completed webhook returned HTTP 200, the private attempt became
paid, and duplicate delivery returned HTTP 200 without changing settlement.
The invoice stayed sent/unpaid and no live payment record was created. Temporary
invoice/settings fixtures were removed. Forged signatures returned HTTP 400.
Deployment and live activation have not been performed.

## What ships

- Owner-only invoice Checkout links for the saved remaining balance, with no surcharge added.
- Card payments only; the invoice must be saved and marked sent/partial/overdue.
- Server checks active staff login AND current company-owner membership.
- Signed raw-body Stripe webhook and an owner "Check payment" recovery action.
- Atomic payment record + invoice balance update, with duplicate-event protection.
- Sandbox payments are recorded only in the private checkout ledger. They never mark a real invoice paid or appear as live revenue.
- Account ID and mode are retained per attempt/payment. Existing collecting accounts must remain accessible for historical refunds and reconciliation.
- Active payment links freeze invoice financial/customer fields. Notes remain editable; cancel the link before changing the invoice.
- Confirmed live card invoices and Stripe payment records cannot be overwritten/deleted by the browser.

## Foundation coordination with Claude

No changes to `companies` or `memberships`. The migration adds server-only
`invoice_payment_ownership` and `invoice_checkout_attempts`, plus service-only RPCs.

The ownership migration explicitly binds existing invoices to Progressive only
while Progressive is the sole company. New invoices use `app_invoices.tenant_id`
when present; without it, they are accepted only while the database still has
one company. Company B therefore cannot create an ambiguously owned invoice.

Before Claude introduces Company B, coordinate `app_invoices.tenant_id` backfill
with `invoice_payment_ownership`. The invoice company cannot change after the
ownership link exists. The API verifies that link before any Stripe request.
Invoice settings currently use the key-only `app_settings` schema. The server
also accepts company UUID settings when that column is introduced. Legacy
key-only or text `progressive` settings are usable only while Progressive is
the sole company; they fail closed once a second company exists.

## Setup

1. Already applied by Claude: `supabase/migrations/20261005205524_invoice_checkout.sql` to
   verified rejunk-prod, using Claude's existing database connection. Do not
   push every pending historical migration. The migration passed isolated
   PostgreSQL tests in `scripts/security/test-invoice-checkout.sql`.
2. Add server-only environment variables to the gitignored local `.env`:
   - `STRIPE_SECRET_KEY`: Abe Media sandbox secret key (`sk_test_...`).
   - `STRIPE_WEBHOOK_SECRET`: signing secret for the corresponding sandbox
     event destination/local Stripe CLI listener (`whsec_...`).
   - `STRIPE_ACCOUNT_ID`: the account associated with that sandbox key. Read
     `/v1/account` using the key to verify it; do not assume the live ID applies
     to a separately created sandbox.
   - `STRIPE_LIVE_ENABLED=false`.
   - `PAYMENT_BASE_URL=http://localhost:3000` locally; the actual HTTPS site
     origin for hosted links.
3. Restart `pnpm dev`. Vite keeps these values on the server.
4. In Invoice Settings, enable Card payments. For the test use a clearly
   identified fixture invoice, save it, mark it sent and save again.
5. Configure sandbox webhook events `checkout.session.completed` and
   `checkout.session.expired`, endpoint `/api/stripe-webhook`. For a local
   listener, use Stripe CLI forwarding to
   `http://localhost:3000/api/stripe-webhook`. Do not send sandbox events to a
   deployment configured with live keys, or vice versa.
6. Create a link, pay with Stripe's success/decline/3DS test cards, confirm the
   sandbox ledger and unchanged real invoice. Test repeated creation, expiry,
   cancel, edited-invoice rejection and duplicate webhook delivery.
7. Deploy a sandbox preview with equivalent server settings. `pnpm build`
   generates standalone `api/pay.js` and `api/stripe-webhook.js` from the same
   shared implementation used by Vite and Express. Verify public return URLs
   and signed webhook delivery there.
8. Only after sandbox acceptance and confirmation of Abe Media's collection
   arrangement, configure production with the live account key, live webhook
   secret, verified `STRIPE_ACCOUNT_ID=acct_1Sb3CUPhokLWRBHm`, public HTTPS
   `PAYMENT_BASE_URL`, and explicitly set `STRIPE_LIVE_ENABLED=true`. Run an
   approved real payment and verify invoice, Payments and payout separately.

## Switching to Progressive

This first implementation uses Abe Media's own account; it does not pretend
Abe Media is Progressive's Connect account, and does not modify
`companies.stripe_connect_account_id` or subscription fields. Connecting
Progressive and selecting connected-account request context is a separate
step. Expire/reconcile old open links before switching. Preserve Abe Media
webhook processing/credentials for historical payments; a simple key swap is
not a complete historical-account migration.

## Boundaries

Customers receive a Stripe-hosted Checkout link, copied from the invoice.
Automatic email delivery, ACH, surcharges, tips, subscription billing and
booking deposits are not included in this first invoice flow. Refund/dispute
reconciliation is not implemented yet: do not advertise it as supported or
enable unattended live use before adding those handlers and testing their
invoice/accounting behavior. No live invoice was altered during development.

## Validation

- `pnpm check`
- `pnpm test` (63 passing tests, including payment safety/authorization tests)
- `pnpm build`
- `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/security/test-invoice-checkout.sql`
  **Only use an empty disposable database**; this script creates fixture
  roles/tables and is not a production migration.
