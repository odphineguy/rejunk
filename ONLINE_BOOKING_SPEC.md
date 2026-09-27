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

From Abe's screenshots of the live HCP page (Sep 26) and Cynthia Rodriguez's real booking (HCP job
`job_a9f29fa4…`, lead source **"Online Booking"**):
0. **ZIP check first** — "Welcome to Progressive Transportation Services LLC · Let us check if we operate in
   your area" → Verify zip code. Logo on top, progress bar on every step after.
1. **"What can we do for you?"** — the service is picked by drilling down the price book, with a Back
   button and a breadcrumb:
   - Category: **Moving** → Local Moving · Labor Only · Heavy Lifting · Containers · Piano Moving
   - Local Moving → **Small Moves · Apartment Moves · Home Moves**
   - Small Moves → services as cards (name + description): "Small Move - Up to 8 Items (No Full Rooms)",
     "Cargo Van Moving and Delivery" (flat price, one large item or matching set, within 15 miles).
   - Cynthia picked Apartment Moves → "Apartment Move - Studio/1 Bedroom" ($525 flat).
2. Picks a **date + arrival window** (hers: Sep 24, 12:00–2:00 pm arrival, job blocked 12–5).
3. Enters the **service address** (street/city/state/zip), name, phone, email, optional description.
4. **No payment** at booking. HCP creates the job; extra hours are added later by the office.

**Gap in Rejunk's pricebook:** it has one level of categories ("Progressive — Moving", 27 items) and an
`add_to_online_booking` flag on every item (all 0 today). HCP's page needs **subcategories** (Local Moving →
Small / Apartment / Home Moves). Add a `parent_id` to `pricebook_categories` (additive) and mirror HCP's
tree — `import_hcp_pricebook.ts` in the pipeline repo is the starting point — then tick the same items
"online" that are on HCP's page today.

## Phase 1 — Rejunk booking page that mirrors HCP (build first)

**Page:** public `/book` on the Progressive site (same look as the marketing pages, mobile-first, no login).

Steps, one screen each (same order as HCP so customers and David's instructions don't change):
0. **ZIP check** — service-area ZIP list in Settings; outside the area → "call us" with the phone number.
1. **Service** — the same drill-down as HCP (category → subcategory → service cards with name +
   description + price), bookable items only, Back + breadcrumb.
2. **When** — calendar of the next 30 days; each day shows open arrival windows only. Respects settings:
   same-day on/off, lead time, closed days.
3. **Where** — service address. **Two addresses when the service needs them (Abe, Sep 26): Loading +
   Unloading** for moves, deliveries and cargo-van jobs (HCP's form only takes one — that's why Abe typed
   "Loading address: …" by hand). Each address gets floor/stairs/elevator and a gate code / access box
   (the things Abe hand-types today). They become the ticket's pickup + delivery stops.
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

1. **$50 deposit at booking (Abe, Sep 26 — decided).** Stripe Payment Element on the Review step; the
   booking only confirms when the payment succeeds. The $50 is a **credit on the final invoice** (shows as
   "Deposit paid −$50", balance due = total − 50), recorded in `app_payments` against the ticket. Labor-only / third-party pickups can be set to
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
5. **Deposit — DECIDED (Abe, Sep 26): $50 at booking, credited toward the final invoice.** Because it's
   required, Stripe (Phase 2 step 1) must be ready before `/book` replaces the HCP link. Still open: refund
   rule on cancellation (default: refundable up to 24h before, per the Terms) and card fee (default: absorbed).
6. **Stripe account** — you need to open it (or tell me if you already have one) in the Progressive
   Transportation Services LLC name; I can't create accounts for you.
7. **Page address** — `progressive-junk.xyz/book` (default) or a subdomain.
8. **Who gets booking alerts?** (default: Abe by email; add Sam?)

## Order of work

1. `booking_availability` RPC (Rejunk tickets + HCP appointments) + tests.
2. `/api/book` endpoint + ticket/client creation + alerts + tests.
3. `/book` page (5 steps) + Settings wiring + "bookable online" flag on pricebook items.
4. Stripe account (Abe) → $50 deposit on the Review step → webhook records it.
5. Abe books a test job end to end on the live site (with a real $50, refunded) → flip the website buttons to `/book`.
6. Invoices in the DB (deposit shows as a credit) → draft invoice on Finish → pay links.
7. Thumbtack link in David's prompt; availability feed for David.

## Constraints

- pnpm; `pnpm check`, `pnpm test`, `pnpm build` green; pipeline tests green.
- The public page never writes tables directly; everything through `/api/book` (service role, validated).
- No wrong addresses, no double-bookings: re-check availability at submit.
- All-in pricing (no itemized add-on fees). No red in the UI. Abe decides design.
- Migrations additive; DECISIONS.md + CLAUDE.md + AGENTS.md updated with each phase.
