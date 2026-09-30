# Rejunk: road to turning off Housecall Pro (and tenant-ready)

## Context
Abe wants Rejunk to replace Housecall Pro (HCP) for Progressive, and later sell Rejunk to other companies by
subscription. A scan on 2026-09-29 found:
- **Settings:** only 4 of 18 cards actually drive anything: Company, Invoice, Estimate Settings, and Pricebook.
  The rest save values that nothing reads (Online Booking, Tips, Tax Rates, SMS, Email Templates, Reviews,
  Job, Calendar, Phone) or are mockups (Subscription, Affiliate, Contact Form, Phone Numbers).
- **Money:** invoices are in the database now (GPT-6 Sol, a61415e), but there's no Stripe, no way to record a
  payment, and no way to send an invoice or estimate to a customer. You can only download the PDF.
- **Tenants:** the app is single-company. Logins and about 30 tables (jobs, clients, invoices, settings, fleet)
  have no company tag. The security rules hardcode `'progressive'`. The pipeline's `businesses` table is
  already multi-company and is the natural tenant list.

Abe's answers:
- Build Stripe tenant-keyed from day one, then lay the tenant foundation right after.
- Hide the dead Settings cards.
- Must-haves before HCP is off: send estimate/invoice, appointment reminders, review requests, and online
  booking with the $50 deposit. Booking is the biggest one, because David and every Thumbtack message link
  to HCP's booking page.

## Build order (each numbered build = one cloud session)

### 0. Clean-up (small, can run in parallel with 1)
- Take these cards off the Settings grid (`client/src/pages/Settings.tsx`), keeping their routes: Phone
  Settings, Phone Numbers, Affiliate, Contact Form, Calendar, Tips, and Subscription. Bring each back when its
  feature ships.
- Fix out-of-date docs: AGENTS.md and ONLINE_BOOKING_SPEC.md still say invoices are localStorage.
- Fix the "Estimate saved locally" message, which is wrong because estimates save to the database.
- Make Tax Rates feed the invoice tax picker (`Invoices.tsx`), instead of a typed-in number on each invoice.

### 1. Stripe payments, set up per company — **OWNER: GPT Sol (not Claude)**
> Built by GPT Sol. Other agents must not edit Stripe / payment files while this build is in progress.

- **Recommended: Stripe Connect.** Rejunk gets one "platform" Stripe account, and each company (Progressive
  first) connects its own Stripe account through a sign-up link. We store only Progressive's Stripe account
  ID on its company record, so no company's secret keys live in our database, and money goes straight to
  that company. This is the standard setup for software sold by subscription (Jobber and HCP work the same
  way).
- It adds a server-only table of payment settings for each company: Stripe account ID, deposit amount
  ($50), who pays the card fee. Only the server can read it, and it points at `businesses.id`.
- New `/api/pay` endpoint, built the same three-place way as `/api/staff` (shared file in `server/`, a copy
  for Vercel in `api/`, and a hook in the Vite dev server). It creates a payment for an invoice (a pay link),
  and a deposit payment for booking.
- New Stripe webhook endpoint. When a payment succeeds it writes a row to `app_payments` and updates the
  invoice's amount paid and status. These are the first payments the app itself ever records.
- **"Record payment" button** on the invoice for cash, check, Zelle and Venmo, which also writes to
  `app_payments`. The Payments page stops being empty.
- The "Card payments" switch in Invoice Settings (`InvoiceSettings.tsx`) goes live.
- Abe does: open the Rejunk platform Stripe account, then connect Progressive's.

### 2. Tenant foundation (no signup or billing yet)
- Logins get a company. Add `tenant_id` to `staff`, `staff_sessions`, `driver_activations` and
  `driver_sessions`, and add a database function (`app_private.current_tenant()`) that works out the company
  from the login.
- Add `tenant_id` to every business table and fill it with `'progressive'`. For settings, each company gets
  its own copy of each section, instead of one shared row per section.
- Replace the hardcoded `'progressive'` in the security rules and report functions with `current_tenant()`.
  The worst ones are in `20260910043256_restrict_business_data.sql` and the owner-financial migrations.
- `client/src/lib/tenant.ts` takes the company from the login. Also fix the two hardcoded `'progressive'`
  values in `api/staff.ts:280` and `server/staffAccess.ts:314`.
- Move Company Settings (name, phone, logo, time zone) onto the company record, where the PDFs and emails
  read it.
- **Must pass before going live:** a test that creates a fake second company and proves it can't see any
  Progressive data.

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
> **Depends on Build 1:** can't start until the Stripe build is merged, because the invoice link needs the
> Pay button and payment recording.

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
- `client/src/lib/tenant.ts`, `supabase/migrations/20260910043256_restrict_business_data.sql`
- `server/staffAccess.ts` and `api/staff.ts`: the pattern new endpoints follow
- `lib/scheduleSlots.ts`, `lib/jobShape.ts`, `lib/jobStorage.ts` (`ticketFieldsFromEstimate`)
- `ONLINE_BOOKING_SPEC.md`: gets updated with the Stripe Connect and tenant decisions
