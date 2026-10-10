# Rejunk: road to turning off Housecall Pro (and tenant-ready)

## Current status — October 9, 2026

Abe wants Rejunk to replace Housecall Pro (HCP) for Progressive, then sell it to other
companies by subscription. The September 29 scan and original build order are now
partly superseded by the October 5 shared-foundation decision in `DECISIONS.md`.

- **Deployed:** Supabase invoices, company UUIDs and memberships, company-scoped
  database rules/defaults and settings, sandbox invoice Checkout/webhook handling,
  and owner-only recording of payments already received. Release `a0d4ac1` includes
  received-payment migration `20261010024211`; payment and invoice balance updates
  commit together, and linked invoices drive job balance summaries.
- **Received-payment methods:** Zelle, cash, check, externally collected card and
  cleared bank payments. A saved invoice is required, including for job deposits.
  This records existing funds; it does not collect money. Venmo is not implemented.
- **Still open:** confirm Juan Molano and Jackie/Jacqueline Gilliam's invoice/job
  matches, received amounts and any existing invoice baseline before recording.
  Neither was entered during this release. Complete an authenticated owner check
  of the deployed UI before the first customer entry.
- **Collection is not ready for Progressive live use:** the interim Stripe sandbox
  uses Abe Media. Progressive Connect onboarding, ACH collection with a Processing
  state, and refund/dispute reconciliation remain unfinished.
- **HCP exit still depends on:** customer estimate/invoice delivery, online booking
  with the $50 deposit, appointment reminders, review requests and a verified full
  job lifecycle. Keep HCP until these replacement flows are accepted.

The September 29 settings scan found many unused cards or mockups. That historical
inventory is not a fresh audit; verify each card before treating its cleanup as done.
Abe requested hiding unused settings cards and identified booking as the biggest HCP
hinge because David and the Thumbtack messages link to HCP's booking page.

## Remaining build order

The shared company foundation shipped before payment completion. Build 1 is partial;
Build 2 below records that foundation and its remaining checks. Continue payment
reconciliation and safe collection before online booking.

### 0. Clean-up (small, can run in parallel with 1)
- Take these cards off the Settings grid (`client/src/pages/Settings.tsx`), keeping their routes: Phone
  Settings, Phone Numbers, Affiliate, Contact Form, Calendar, Tips, and Subscription. Bring each back when its
  feature ships.
- Invoice persistence descriptions in AGENTS.md are updated; review ONLINE_BOOKING_SPEC.md
  for any remaining localStorage assumptions before implementing booking.
- Fix the "Estimate saved locally" message, which is wrong because estimates save to the database.
- Make Tax Rates feed the invoice tax picker (`Invoices.tsx`), instead of a typed-in number on each invoice.

### 1. Stripe payments, set up per company — **OWNER: GPT Sol (not Claude)**
> Built by GPT Sol. Other agents must not edit Stripe / payment files while this build is in progress.

**Deployed**

- `/api/pay` and the signed Stripe webhook implement sandbox invoice Checkout and
  settlement. Shared payment source generates the Vercel API files; keep the Vite
  and production handlers aligned.
- The Invoice Settings card-payment switch saves confirmed settings and displays
  setup/test/live status. Sandbox readiness is not permission to collect live funds.
- **Record payment received** on invoices and Payments saves company-stamped history
  and balances atomically. Owner session and membership are verified server-side;
  retries are idempotent. Stale balances, overpayments, duplicate references and
  active Checkout links are rejected. History is retained; invoice notes remain
  editable. See `docs/RECEIVED_PAYMENTS_SETUP.md` for the exact workflow and limits.

**Next steps, in order**

1. Check the deployed workflow with an authenticated owner. Confirm customer,
   invoice/job, amount, received date/reference and previously recorded totals
   before reconciling Juan or Jackie. A payout/transfer is not another payment.
2. Add ACH collection and retain **Processing** until final provider confirmation;
   recording an already-cleared bank payment is a separate feature.
3. Add refund/dispute reconciliation and correction history before unattended live
   collection. The received-payment release does not provide corrections or refunds.
4. Complete owner-only Progressive Stripe Connect onboarding, account/environment
   status, and verified company routing before enabling Progressive live collection.
   Test the full payment/refund lifecycle in sandbox first.

**Shared architecture**

- Rejunk's platform Stripe account and each company's connected merchant account
  have separate purposes. Company subscription customer IDs must never be used as
  that company's invoice customers.
- Payment/billing ownership references app-owned `companies.id` (UUID), with an
  explicit mapping to pipeline-owned `businesses`; do not create a second tenant
  foundation or key new billing tables directly to `businesses.id`.
- Only company owners manage Connect/billing. Keep provider mappings and credentials
  server-controlled; no company secret keys in browser code. Booking deposit
  collection still depends on the remaining payment work.

### 2. Shared company foundation — deployed; retain remaining checks
- UUID company keys, memberships, tenant columns, caller-derived company defaults,
  membership-based access rules and per-company settings are deployed. The pipeline
  stamps company IDs on its writes. See `PLAN-mcp-connector.md` and the applied
  migrations rather than recreating the original September 29 schema proposal.
- Payment endpoints resolve company scope from the verified owner session and
  current membership, not request fields or a fixed Progressive key.
- Company branding currently lives in company-scoped `app_settings`, not directly
  on `companies`. Revisit the branding-record move only as a deliberate change.
- Preserve driver PIN/session and assigned-job boundaries; office/owner financial
  masking must remain intact. Re-run meaningful cross-company checks for future
  changes. Claude's October 9 AI-reader rollout records 403 checks / 0 failures;
  the received-payment rollout also passed rollback-only live company/access checks.
- The AI reader rule is deployed, but the MCP server is still separate pending work;
  it must not gain payment-writing or service-role access.

### 3. Online booking + $50 deposit (ONLINE_BOOKING_SPEC phases 1–2; the biggest HCP hinge)
- Add subcategories to the pricebook (a `parent_id` on categories) and a "bookable online" switch on each
  pricebook item.
- New `booking_availability` database function. It must count both Rejunk jobs and HCP appointments, or the
  page will double-book. It reuses the day-slot rules in `lib/scheduleSlots.ts` (`buildDayBoard()`).
- New `/api/book` endpoint. It creates the job ticket and the client, re-checks that the time slot is still
  open when the customer submits, and takes the $50 deposit through build 1.
- New public `/book` page with five steps: ZIP check → service → date and arrival window → Loading and
  Unloading addresses → contact details → review and pay.
- The Online Booking settings page becomes real.
- **Stairs (Abe, Sep 29):** each address asks for flights of stairs, at $75 per extra flight on flat-price moves.
  - Turn stairs charging back on everywhere (`MOVING_RATES.chargeStairs = true`; pipeline `agent_rates`
    first).
  - Stairs are their own line item on the ticket and the invoice.
- **Card fee:** keep HCP's 3% surcharge on the deposit and on invoice card payments.
- One setting switches the website's "Book online" buttons between HCP and `/book`, so Abe can switch back
  instantly.
- **Still need Abe's answers** (listed in the spec): which services are bookable, whether to show prices,
  arrival windows, refund rule, and who gets booking alerts.

### 4. Send estimate and invoice to the customer
> **Depends on Build 1 for live Pay:** received-payment recording is deployed, but
> customer delivery and the live payment boundary still require implementation and verification.

- A private customer link for each estimate or invoice (a hard-to-guess token in the URL, no login) showing
  a public view of it.
  - An invoice shows a **Pay** button (from build 1).
  - An estimate shows an **Approve** button and a typed-name signature, which replaces the dead "signature"
    option.
- Sending by email uses Resend. Sending by text goes through the pipeline's registered number
  (480) 351-0291: the app queues the text and the pipeline sends it, the same way as the
  `customer_notifications` crew texts.
- The Email Templates and SMS Notifications settings pages supply the wording.
- **Draft invoice when the crew taps Finish**, built from the ticket's service line plus extra hours. This
  was deferred from BOOKING_TO_CREW deliverable 3.
- A "Send" button on the Invoices page and on the Estimate Builder.

### 5. Appointment reminders + review requests
- Day-before reminders for Rejunk tickets: a scheduled job in the pipeline, like the existing
  `missed-start-reminders`, reading `jobs`. Quiet hours and the on/off switch follow the crew-text rules.
- Review request after the job is paid, using the Review Settings link and wording.
- Both only go out once the HCP versions are turned off, so customers don't get duplicate texts.

### 6. HCP switch-off checklist
- Put the Rejunk booking link into David's Thumbtack prompt instead of HCP's, and point the website's
  buttons at `/book`.
- Turn on the crew texts (`customer_notify_enabled`), the reminders and the review requests.
- Run one real job start to finish, then cancel HCP.

### Later (after HCP is off)
- Claims module (CLAIMS_MODULE_SPEC). It needs real payments first.
- "Create Estimate" from a lead (the button exists but does nothing).
- Events moved to the database.
- QuickBooks export.
- Public website pages loaded from company settings (branding as data).
- Self-serve signup, and wiring the Rejunk Subscription page to Stripe billing.

## How each build is checked
- `pnpm check`, `pnpm test` and `pnpm build` all pass, and pipeline tests pass when the pipeline is touched.
- New database changes are only additions. Abe approves each one before it touches the live database.
- Stripe is tested in test mode first. Then Abe books one real job with a real $50 deposit, which gets
  refunded.
- The tenant build must pass the fake-second-company test.
- Commit locally when done and update AGENTS.md + DECISIONS.md. **Push only when Abe explicitly asks**
  (`main` auto-deploys to the live site).

## Critical files
- `client/src/pages/Settings.tsx`, `client/src/pages/settings/*`, `client/src/lib/settingsStorage.ts`
- `client/src/lib/invoiceStorage.ts`, `client/src/pages/Invoices.tsx`, `client/src/lib/paymentStorage.ts`
- `server/payments/*`, generated `api/pay.js` / `api/stripe-webhook.js`,
  `client/src/components/RecordPaymentDialog.tsx`, `docs/RECEIVED_PAYMENTS_SETUP.md`
- `client/src/lib/tenant.ts`, `supabase/migrations/20260910043256_restrict_business_data.sql`
- `server/staffAccess.ts` and `api/staff.ts`: the pattern new endpoints follow
- `lib/scheduleSlots.ts`, `lib/jobShape.ts`, `lib/jobStorage.ts` (`ticketFieldsFromEstimate`)
- `ONLINE_BOOKING_SPEC.md`: gets updated with the Stripe Connect and tenant decisions
