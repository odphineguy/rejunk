# Booking → Crew-Ready Ticket → Customer Updates — Spec

**Owner:** Abe · **Date:** Sep 18, 2026 · **Status:** ready to build next session
**Scope:** the pipeline repo `rejunk-webhook-services` (extraction + SMS) and this app (review queue, driver
actions, ticket media). Pricing engines, Estimate Builder, and the public site are **out of scope**.

> Execute end-to-end. Do not ask for confirmation at intermediate steps. Test and fix failures before
> reporting done. Where this spec and the repo disagree, the repo wins — say so, don't guess.

## The problem (Abe, Sep 18, with screenshots of the Brianna Eno job)

For every booking Abe opens Thumbtack, reads the whole chat between David (the AI agent) and the
customer, and hand-types the second address, the gate code, the "back the truck into the alley" note and
the timing into the Housecall Pro job. If he doesn't, the movers get **one address and nothing else**.
"75% manual" (already noted in `JOB_TICKET_REDESIGN_SPEC.md` D11). Then, on the day, HCP gives the crew
OMW / Start / Finish buttons that text the customer, and dispatch invoices and collects. Rejunk must do
all of that, better, or it can't replace HCP.

Three deliverables, in order:

1. **Booking → ticket, automatically.** An AI reads the Thumbtack thread + lead facts + booking row
   and creates a **crew-ready Rejunk ticket** with both addresses, access notes, items, photos, the
   quote David stated, and the slot — then puts it in a **review queue** for dispatch to confirm.
2. **Crew day-of flow that talks to the customer.** Drivers tap **On my way → Start → Pause → Finish**
   in the driver app; each tap logs time and (for OMW and Finish) texts the customer. Invoice and
   payment stay with dispatch/owner — drivers never see money.
3. **Ticket carries the service and photos.** The service line(s) from the quote and the images from
   the Thumbtack thread (plus crew photos) live on the ticket, visible to dispatch and crew.

## Read first

`CLAUDE.md`, `DECISIONS.md` (newest on top), `JOB_TICKET_REDESIGN_SPEC.md` **D11** (the extraction
design — this spec implements it; don't redesign it), `DRIVER_IMPLEMENTATION.md`, `HAUL_OR_CALL_WORKFLOW.md`,
`MOVING_ESTIMATOR_V19_SPEC.md` (rate card / wording). In the pipeline repo: `_shared/enrichment.ts` (the
existing Haiku access-details extractor — the seed of deliverable 1), `_shared/twilio.ts` (the SMS
sender with quiet hours + relay filter), `hcp-reminder/index.ts` (the day-prior reminder — the pattern
for customer texts), `docs/managed-agent-prompt.template.txt` (David's rules).

## Verified current state (Sep 18, live DB + both repos)

**What the shared DB already holds per booking (all tenant `progressive`):**

| Table | What's in it | Gap |
| --- | --- | --- |
| `thumbtack_leads` | name, phone (relay or real), category, `location_address/city/state/zip`, `schedule`, `description`, `details` (Thumbtack Q&A), `attachments` jsonb, `quoted_price`, `crew_required`, `hcp_job_id`, `booked_at`, `booked_via`, `extraction` jsonb | `extraction` is the per-message access-details output, not a full ticket |
| `thumbtack_messages` | the full thread: `direction`, `from_type`, `text`, `attachments` jsonb (`{fileName, mimeType, url, …}`), `sent_at` | attachment `url` is a thumbtack.com link — may expire; nobody copies the file |
| `bookings` | `scheduled_date`, `day_part` (AM/PM), `pickup_address`, `dropoff_address`, `access_notes`, `quoted_text`, `package`, `day_type`, `payment_terms`, `resource`, `deposit_status`, `hcp_job_id`, `customer_sms_*` | written by the voice agent + sweeper; the Thumbtack chat path fills it inconsistently |
| `hcp_appointments` | `scheduled_start/end`, `arrival_window_minutes`, `status`, `total_amount`, `paid_amount`, `completed_at`, `booking_id` | mirror of HCP — goes away when HCP does |
| `jobs` | Rejunk tickets: `data` jsonb with `stops[]` (each stop has `address`, `contactPhone`, `flights`, `elevator`, `parkingNotes`, `instructions`), `items[]`, `crew[]`, `slot`, `quote`, `leadRef`, `paymentTerms` | nothing writes them from a booking today |

**Brianna Eno, the worked example (Aug 20 → Sep 16):** the thread contains, in the customer's own words,
the pickup `2777 S Arizona Ave Apt 3139 Chandler` (3rd floor, stairs), the delivery `1175 W Pecos Rd Apt
2080 Chandler` (2nd floor), 13 pieces of furniture, a heavy wood/glass coffee table and a glass TV stand,
"morning, between 9–10am", gate code `688097` at the S Arizona Ave entrance, and "the truck will need to
be backed into the alley … they will not be able to turn around". The HCP job ended up with the Studio/1BR
package at $525 and the Summary of Work Abe typed by hand. **Every one of those facts must land on the
Rejunk ticket without Abe typing it.**

**Customer SMS today:** the pipeline owns ONE A2P-verified Twilio number `+1 (480) 351-0291`
(`TWILIO_PHONE_NUMBER`). `_shared/twilio.ts` `sendSms()` never throws, validates 10-digit US numbers,
refuses Thumbtack relay numbers, and enforces 9pm–8am Phoenix quiet hours. `hcp-reminder` already texts
customers the day before from `hcp_appointments`. The old app-side "A2P too complicated" decision
(2026-06-12) is superseded by this — the number and the sender exist; the app just doesn't use them.
**Thumbtack relay numbers can't be texted.** For those customers the real number comes from
`app_contact_overrides` (server-only) when HCP matched one; otherwise the update goes as a Thumbtack
message through `thumbtack-send` (same words), and if neither exists the driver sees "call the customer".

**Driver app today:** status strip `assigned → en_route (On My Way) → in_progress (Start My Time) ⇄ paused
→ completed`, writes through the masked RPC `driver_update_job_status`, activity log, photos to the
`job-photos` bucket, job-thread messaging. No customer contact. No timers surfaced to dispatch. Drivers
never see money (`get_driver_today` allowlist) — keep it that way.

## Deliverable 1 — Booking → crew-ready ticket

Implements D11. Lives in the pipeline repo (service role, webhooks, David's prompt all live there).

### 1a. Trigger

A booking is "confirmed" when any of these happens (idempotent on `hcp_job_id`, falling back to
`negotiation_id + scheduled_date`):

- `bookings.status` becomes `booked` / `scheduled` (voice or chat path), or
- `hcp_appointments` insert/update with `status = 'scheduled'` whose `booking_id` or customer phone/name
  matches a Thumbtack lead (HCP native import — today's main path), or
- `thumbtack_leads.booked_at` set.

Run **once per confirmed booking**, plus a re-run when a **new customer message arrives after booking**
(gate codes usually come last — Brianna's did). Re-runs only touch fields still marked `needs_review`;
dispatcher edits are never overwritten.

### 1b. Gather

Lead row + full thread (both directions — David's messages carry the package/tier/crew he committed to)
+ `bookings` row + `hcp_appointments` row (while HCP exists) + `voice_calls.summary` if the phone matches
+ attachments. **Copy every attachment into Supabase storage** (`job-photos` bucket, path
`thumbtack/<negotiation_id>/<message_id>/<file>`), and reference our copy.

### 1c. Extract — one structured call

`_shared/ticket_extractor.ts`, one Claude call (`claude-sonnet-5`, tool-call structured output,
temperature 0), prompt kept next to David's prompt in `docs/`. Output schema (every field carries
`confidence: high | medium | low` and `source_message_id`; unknown → null + `needs_review`, **never
invented**):

```
customer: { name, phone_real?, email? }
service:  { type: moving|delivery|assembly_handyman|junk_removal|other,
            moving_kind?: small_move|studio_1br|two_br|small_house|hourly_2|hourly_3|hourly_4|labor_only|piano,
            delivery_kind?: cargo_van|van_flat,
            package_or_rate_text, quoted_low, quoted_high, day_type, crew_required }
when:     { date, window_start, window_end, day_part: AM|PM|full, flexible: bool }
stops[]:  { role: pickup|delivery|service, address, unit, city, zip, floor, flights, elevator,
            gate_code, parking_notes, access_instructions, contact_name, contact_phone }
items[]:  { name, qty, heavy, fragile, disassembly, notes }          // "13 pieces", "wood/glass coffee table"
specialty: { piano?, tvs_on_wall?, safe?, third_party_pickup?, play_structure? }
payment_terms: deposit_50 | full_at_booking
customer_said: string   // 3–5 line plain summary for the crew ("Morning 9–10. Gate 688097 at S Arizona Ave. Back the truck into the alley — no turnaround.")
escalations[]: string   // anything David tagged [ESCALATE] or the customer asked that wasn't answered
```

### 1d. Create the ticket

Insert into `jobs` (tenant progressive, `source: "thumbtack"`, `status: "needs_review"`, `quote.source:
"david"`) through `prepareJobForWrite()`-compatible JSON: `serviceType`, `movingKind`/`deliveryKind`,
`requiredCrew` (from `lib/jobShape.ts` floor, never below `crew_required`), `stops[]` with
`instructions` = gate code + access notes, `parkingNotes`, `flights`, `elevator`, `contactPhone`,
`items[]`, `slot` = date + AM/PM pre-selected, `paymentTerms`, `leadRef` = `{negotiation_id, hcp_job_id,
booking_id}`, `notes` = `customer_said`, `photos` = the copied attachments (rows in `job_photos` with
`source: "customer"`), and an `extraction` block keeping each field's confidence + source message id for
the review UI. `needs_review` is a new `Job.status`; it never reaches `get_driver_today`.

### 1e. Review queue (app side)

- Jobs page gets a **"New from Thumbtack"** tab (count badge) and the Dashboard a tile.
- Opening one shows the normal ticket with, per extracted field, a small "from: *<the customer's
  sentence>*" caption and a low-confidence marker; the full thread is one click away (the existing
  read-only conversation sheet from Clients & Leads).
- Dispatcher fixes anything, assigns crew + vehicle, clicks **Book it** → `scheduled`. Nothing reaches a
  driver before that click. **Reject** → `canceled` with a reason (kept for tuning).

### 1f. Acceptance

- Brianna Eno replay (use the real thread): ticket has both addresses with units, 3 flights at pickup
  and 1 at delivery, gate `688097` on the pickup stop, the alley note in `parkingNotes`, 13 items incl.
  the coffee table + glass TV stand flagged fragile, window 9–10 AM Sep 16, Studio/1BR package $525,
  `payment_terms: deposit_50`. Zero edits needed.
- Last 20 real bookings: ≥ 16 need zero edits on addresses and gate codes; **never** a wrong address.
- Draft mode first (`ticket_extractor_mode: off | draft | live` per tenant like `enrichment.ts`); Abe
  flips to `live` after reviewing 10 drafts.

## Deliverable 2 — Crew day-of flow with customer updates

### 2a. Driver buttons (driver app, unchanged shape, new side effects)

| Tap | Job status | Logs | Customer message |
| --- | --- | --- | --- |
| **On my way** | `en_route` | `omwAt`, GPS | "Hi {first}, this is Progressive Transportation. {Driver first name} and the crew are on the way to {pickup street}, arriving about {ETA}. Reply here or call (480) 351-0291." |
| **Start** (arrived + working) | `in_progress` | `startedAt` | none (HCP doesn't either) |
| **Pause / Resume** | `paused` ⇄ `in_progress` | pause intervals → `pausedMinutes` | none |
| **Finish** | `completed` | `finishedAt`, `onJobMinutes`, `travelMinutes` | "All done — thanks for choosing Progressive Transportation! Dispatch will send your invoice shortly. Anything not right? Reply here." |

Rules: one OMW text per job (re-tapping doesn't resend); quiet hours honored (a 7:45 AM OMW queues until
8:00 and the driver sees "will send at 8:00"); the driver sees ✓ sent / ✗ no number ("call the
customer") next to the button; texts go out **only** for tickets in `scheduled`-or-later status, never
`needs_review`. Templates editable in Settings → Notifications (owner). Sender is always the one A2P
number; replies land in `twilio-inbound` and show on the job thread for dispatch.

### 2b. Plumbing

- New RPC `driver_update_job_status` already exists — extend it to stamp the timestamps above on
  `jobs.data.timing` and enqueue a row in a new `customer_notifications` table (tenant, job id, kind
  `omw|finish|reminder|custom`, to phone or negotiation id, body, status `queued|sent|failed|skipped`,
  reason). The pipeline drains it (new edge function `customer-notify`, or fold into `thumbtack-send`'s
  drain loop) using `sendSms()` or `thumbtack-send` for relay-only customers. The browser never holds
  Twilio credentials.
- Dispatch Center shows per-job timing (travel / on-job / paused) live from `jobs.data.timing` — the same
  numbers HCP's "Field tech status" shows — and each notification's status.
- ETA for OMW = Google Directions from the driver's last GPS fix to the stop (server-side, key already
  exists); fall back to "shortly" if unavailable.

### 2c. Invoice & pay = dispatch/owner only

Finish flips the ticket to `completed` and creates a **draft invoice** from the ticket's service lines
(+ any time over the package's included hours at the v19 overage rate, computed from the timing stamps
and shown as a suggestion, never auto-billed). Sending and collecting is the existing Invoices/Payments
work (owner-only `app_payments`); this spec only guarantees the draft exists with the right lines the
moment the crew taps Finish. Drivers never see it.

## Deliverable 3 — Service + photos on the ticket

- Ticket "What" card shows the service line(s) as David quoted them (package name / hourly crew + rate,
  included hours) — from the extraction; editable by dispatch. Drivers see the service name and included
  hours, **not** dollars.
- Photos: customer attachments (from 1b) and crew photos (existing upload) in one strip, tagged
  `customer` / `crew`, both visible in the driver app and Dispatch. Add **upload** on the office ticket
  too (today only drivers can add).

## Constraints

- pnpm only; `pnpm check`, `pnpm test`, `pnpm build` green. Pipeline repo: its existing test suite green.
- Never expose Twilio, OpenAI/Anthropic, or service-role keys to the browser. Drivers never receive
  money fields (extend the `get_driver_today` allowlist deliberately, field by field).
- The extractor **never invents**; blank + `needs_review` beats a guess. No wrong addresses, ever.
- Commit locally, do not push (main auto-deploys). Migrations are additive and applied through the
  Supabase MCP after Abe approves (he must exit auto mode — the classifier blocks DDL).
- Add DECISIONS.md entries (extraction lives in the pipeline; customer SMS reinstated via the one A2P
  number; invoice/pay stays with dispatch) and update CLAUDE.md + AGENTS.md.

## Order of work

1. Pipeline: `ticket_extractor.ts` + prompt + attachment copy + `jobs` insert in **draft** mode; replay
   Brianna Eno and the last 20 bookings from the DB; tune until acceptance passes.
2. App: `needs_review` status, review queue, field-source captions, Book it / Reject.
3. `customer_notifications` table + driver-status side effects + `customer-notify` drain; OMW / Finish
   templates; timing on Dispatch Center.
4. Draft invoice on Finish; service line + photo strip on the ticket; office photo upload.
5. Abe reviews 10 drafts → flip extractor to `live`; run one real job end-to-end with a driver.

## Open questions for Abe (build with the default, flag in the summary)

1. OMW text wording — default above; does he want the driver's name in it? (default: yes)
2. Should Finish also text a review link? (default: no — the existing review-request flow already does
   this from the pipeline after payment)
3. When HCP is finally off, the booking page + $50 deposit is the trigger (D10/D11 "later phase,
   Stripe") — out of scope here but the extractor must not depend on `hcp_appointments` existing.
