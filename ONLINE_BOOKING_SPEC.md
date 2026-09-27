# Online Booking + Payments — Plan

**Owner:** Abe · **Date:** Sep 26, 2026 · **Status:** plan — decisions below need Abe before the build
**Goal:** replace the Housecall Pro online-booking page with Rejunk's own, put it on the website, later link
it from Thumbtack (David), and take card payments — so Progressive can turn HCP off.

> Where this plan and the repo disagree, the repo wins. Read `CLAUDE.md`, `DECISIONS.md`,
> `JOB_TICKET_REDESIGN_SPEC.md` (D10 availability, D11 booking → ticket) and `BOOKING_TO_CREW_SPEC.md` first.

## What exists today (checked Sep 26)

- **Settings → Online Booking** (`pages/settings/OnlineBooking.tsx`): on/off, require payment (greyed),
  same-day, lead time, and a services checklist. It saves to `app_settings`, but **nothing reads it**. The
  services list is just pricebook categories, including ones customers shouldn't book ("Service Rates", "Fees").
- **No customer booking page.** Every "Book online" button (`pages/landing/content/site.ts` →
  `bookingUrl()`) goes to HCP's page, with UTM tags.
- **No payments.** No Stripe or other processor. `app_payments` is owner-only records; `invoiceStorage.ts`
  is still demo localStorage.
- **Reusable pieces:** the slot board (`lib/scheduleSlots.ts` `buildDayBoard()`: truck AM/PM, full-day
  moves take both halves, one assembly job a day), the ticket shape (`lib/jobShape.ts`), the moving
  calculator + v19 rate card, the pricebook (Supabase), Resend email, the pipeline's A2P Twilio number, and
  HCP's full booking address now stored in `hcp_appointments.address_*`.

## What HCP's page does (the thing to mirror)

From Cynthia Rodriguez's real booking (HCP job `job_a9f29fa4…`, lead source **"Online Booking"**):
1. Customer picks a **service from the price book with its flat price** ("Apartment Move - Studio/1
   Bedroom", $525, with its description).
2. Picks a **date + arrival window** (hers: Sep 24, 12:00–2:00 pm arrival, job blocked 12–5).
3. Enters the **service address** (street/city/state/zip), name, phone, email, optional description.
4. **No payment** at booking. HCP creates the job; extra hours are added later by the office.

## Phase 1 — Rejunk booking page that mirrors HCP (build first)

**Page:** public `/book` on the Progressive site (same look as the marketing pages, mobile-first, no login).

Steps, one screen each:
1. **Service** — cards for the bookable services only (name, short description, "from $X" or flat price).
   Moving adds a "Kind of move" choice (package sizes / hourly crew / labor-only) from the v19 rate card.
2. **When** — calendar of the next 30 days; each day shows open arrival windows only. Respects settings:
   same-day on/off, lead time, closed days.
3. **Where** — service address; moving asks pickup **and** delivery, plus floor/stairs/elevator and a
   gate code / access box (the things Abe hand-types today).
4. **You** — name, mobile, email, notes, photo upload (optional), SMS consent checkbox (A2P wording from
   `/estimate`).
5. **Review → Book it** — summary with price wording per the all-in rule ("estimate, not fixed" for hourly;
   flat for packages). Then a confirmation screen.

**What a booking creates (server-side, never from the browser):**
- New endpoint `POST /api/book` (Vercel function + Vite dev middleware, same three-place pattern as
  `/api/staff`). Service-role key, validation, per-IP rate limit, honeypot, re-checks the slot is still open
  at submit time (two people can't take the same window).
- Writes a **ticket** straight into `jobs` (`status = scheduled`, `source = website`, `leadSource = "Online
  Booking"`, `serviceType` / `movingKind`, both stops, `slot`, `quote` with `source = "booking"`,
  `requiredCrew` from `jobShape.ts`, BOX-01 on truck moves — same rules as the Thumbtack extractor).
- Creates or matches the **client** (by phone/email) in Clients & Leads.
- Customer photos go to `job-photos` under `<job>/customer/…` (tagged "Customer" in the strip).
- **Alerts:** email to Abe (Resend) + the job appears on Dispatch Center for crew assignment.
- **Customer confirmation:** email always; text when SMS consent is checked and the texting flag is on.

**Availability (the hard part):** while HCP is still the schedule, open windows must account for BOTH
Rejunk tickets and `hcp_appointments`, or the page will double-book. One server RPC
`booking_availability(tenant, from, days)` returns open windows per day, built from `buildDayBoard()`
rules + HCP rows. This is also D10's availability feed for David — build it once, use it twice.

**Settings page gets real:** the existing Online Booking screen becomes the control panel — on/off,
same-day, lead time, arrival windows, closed days, which services are bookable (a "bookable online" flag on
pricebook items, not categories), deposit settings (Phase 2). The page reads these through the endpoint.

**Switch-over:** one setting chooses where the website's "Book online" buttons go (HCP link or `/book`),
so Abe can flip back instantly. UTM tags stay.

## Phase 2 — Taking payments (Stripe)

HCP payments go away with HCP, so Rejunk needs its own. Recommended processor: **Stripe** (already the
plan in D10; works with Apple Pay / Google Pay; card-on-file; payment links; tap-to-pay on a phone later).

1. **Deposit at booking** (optional per settings): Stripe Checkout / Payment Element on the Review step.
   The booking only confirms when the payment succeeds. Labor-only / third-party pickups can be set to
   "full payment at booking" (matches `paymentTerms = full_upfront`).
2. **Invoices move to the database** (the deferred item from deliverable 3): owner-only `app_invoices`,
   the draft invoice on crew **Finish**, line items from the ticket's service + extra hours.
3. **Pay link:** each invoice gets a Stripe payment link; sent by text/email; the customer pays on their
   phone. The Stripe webhook (server-side) records the payment in `app_payments` and marks the ticket paid.
4. **Card on file** (optional): save the deposit card so the balance can be charged after the job with the
   customer's consent.
5. **Refunds / cancellations** follow the Terms (24-hour cancel rule) — done in Stripe, recorded in Rejunk.

Keys: `STRIPE_SECRET_KEY` + webhook secret server-side only; the browser only ever gets the publishable key.
Drivers never see any of it.

## Phase 3 — Link it from Thumbtack (David)

- David sends a **personal booking link**: `/book?ref=<negotiation id>` with the service, crew, price wording
  and customer name pre-filled from the conversation. The booking attaches to the Thumbtack lead, so the
  ticket extractor merges the thread details (gate codes, notes, photos) into the same ticket.
- Replace the HCP link in David's prompt (pipeline repo) once Phase 1 is live and tested.
- David quotes open windows from `booking_availability` (D10) instead of HCP.

## Phase 4 — HCP off

Website + Thumbtack both book into Rejunk, payments in Stripe, invoices in Rejunk, customer texts on
(`customer_notify_enabled`), crew on the driver app. Then HCP can be cancelled.

## Decisions for Abe (build uses the default unless you say otherwise)

1. **During the switch, should a Rejunk booking also create the job in HCP?** (default: **no** — but
   then the crew must work from Rejunk for those jobs; alternative: also push it into HCP through its API so
   nothing is missed while both run.)
2. **Which services are bookable online?** (default: the same ones on your HCP page — moving packages,
   hourly moving, labor-only, junk removal, furniture assembly, TV mounting.)
3. **Show prices on the page?** (default: yes, like HCP — flat prices for packages, "starting at" for hourly.)
4. **Arrival windows?** (default: HCP's 2-hour windows — 8–10 am and 12–2 pm for the truck; assembly
   one job a day.)
5. **Deposit?** (default for Phase 1: **none**, same as HCP today. Phase 2: $50 deposit, refundable up to 24h
   before.) Card fee passed on or absorbed? (default: absorbed.)
6. **Stripe account** — you need to open it (or tell me if you already have one) in the Progressive
   Transportation Services LLC name; I can't create accounts for you.
7. **Page address** — `progressive-junk.xyz/book` (default) or a subdomain.
8. **Who gets booking alerts?** (default: Abe by email; add Sam?)

## Order of work

1. `booking_availability` RPC (Rejunk tickets + HCP appointments) + tests.
2. `/api/book` endpoint + ticket/client creation + alerts + tests.
3. `/book` page (5 steps) + Settings wiring + "bookable online" flag on pricebook items.
4. Abe books a test job end to end on the live site → flip the website buttons to `/book`.
5. Stripe: account → deposit on booking → invoices in the DB → pay links → webhook.
6. Thumbtack link in David's prompt; availability feed for David.

## Constraints

- pnpm; `pnpm check`, `pnpm test`, `pnpm build` green; pipeline tests green.
- The public page never writes tables directly; everything through `/api/book` (service role, validated).
- No wrong addresses, no double-bookings: re-check availability at submit.
- All-in pricing (no itemized add-on fees). No red in the UI. Abe decides design.
- Migrations additive; DECISIONS.md + CLAUDE.md + AGENTS.md updated with each phase.
