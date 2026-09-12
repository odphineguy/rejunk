# Job Ticket Redesign — Spec

**Owner:** Abe · **Date:** Sep 12, 2026 · **Status:** proposed, not started
**Scope:** how a job ("ticket") is created, stored, assigned, listed, and shown to drivers.
**Out of scope:** pricing math (see `MOVING_ESTIMATOR_V19_SPEC.md`), the public website, payments/invoices,
Thumbtack auto-replies.

## The short version

**Recommendation: yes, do this — and do it before the moving estimator UI.**

Rejunk was built with junk removal as the center of the universe. Every job carries a material type,
cubic yards, a landfill, and a dump-receipt card, while the thing Progressive actually does every day
(move furniture from address A to address B with 2–4 movers in a van or the box truck) is bolted on the
side and half of it never reaches the database. The four-slot calendar shipped on Sep 12 already treats
the business the right way — **by vehicle and half-day** — but the ticket underneath it still doesn't.

The redesign is not a rewrite. The job record is a JSON blob in Postgres (`jobs.data`), so the shape can
grow without a risky schema migration. The work is: make **service type** the first thing a ticket knows,
store **stops and crew on the ticket itself** so they survive across browsers and reach drivers, make
**vehicle and crew** single-source-of-truth, and reshape the New Job form, Jobs list, Job detail, and
driver screens around that. Junk removal stays supported — it just becomes one service type instead of
the default assumption.

This is also the core of replacing Housecall Pro. An HCP job is: customer, address(es), arrival window,
assigned employees, line items, notes, status. Rejunk's ticket needs to be at least that, plus the two
things HCP can't do for us: vehicle-aware slots and the driver flow the crew actually likes.

## Read first

`CLAUDE.md`, `DECISIONS.md` (newest on top), `rejunk-operations-rules-v1.md` §4 (crew safety), §5
(scheduling), §7 (vehicle assignment matrix), §9 (dispatch lifecycle). The calendar slot logic lives in
`client/src/lib/scheduleSlots.ts` and is the model for "one slot = one vehicle × one half-day".
Where this spec and the repo disagree, the repo wins — say so, don't guess.

## Verified current state (Sep 12, checked against live code)

**How a ticket gets created today — three shapes that never converge**

1. `/jobs/new` (`client/src/pages/NewJob.tsx`) → `createDispatchJob()` (`lib/dispatchOperations.ts:167-214`).
   The only real "make a ticket" form. Required fields: customer name and one stop name. **No address,
   date, price, vehicle, or crew is required.** Service type defaults to `junk_removal`. Three buttons
   (Save Draft / Save and Assign / Save and Open) but only two modes — "Open" also assigns
   (`NewJob.tsx:142`). Stops and items are captured in the form, then the job is **flattened to stop[0]'s
   address** (`dispatchOperations.ts:180-183`).
2. Estimate Builder → `createJobFromEstimate()` (`lib/jobStorage.ts:164-217`). Carries material,
   facility, warnings, route comparisons. Creates **no stops, no items, no assignment**, and for
   moving/service estimates it **nulls the vehicle** (`:202-203`). A junk estimate produces a job with
   **no serviceType at all** (`:187`).
3. Demo data `client/src/data/defaultJobs.ts`.

Website leads become `clients` rows, never jobs (`api/lead.ts:282`). Thumbtack/HCP bookings are read-only
views. **Every real ticket is hand-keyed.**

**Where stops, items, and crew actually live**

- `saveDispatchOperationalPlan()` (`dispatchOperations.ts:216-340`) writes stops/items/assignments to a
  **per-browser localStorage blob** `rejunk_driver_operational_cache_v1`, then tries to upsert `job_stops`,
  `job_items`, `job_disposal_events` — tables that exist only in the **unapplied** migration
  `202606070001` (CLAUDE.md confirms). The upserts fail silently. A two-address move keyed on one
  machine has one address on every other machine.
- The live `get_driver_today` RPC (`supabase/migrations/20260910042932_bind_business_identity.sql:94-104`)
  returns an allowlisted job object with **no stops, items, or serviceType**. `driverStorage.ts:193-207`
  then invents one stop from the flat address and one item named after the material, marking it
  "heavy" if `estimatedWeightLbs >= 700` — **junk heuristics applied to every moving job**.
- `driverStorage.ts:246` overwrites `serviceType` with `materialName || jobLabel || "Junk removal"`. A
  moving job with no label shows **"Junk removal"** on the driver's phone.

**Assignment is stored in duplicate and gets corrupted**

- Vehicle lives in three places: `Job.vehicleId/vehicleName`, `Job.assignment.vehicleId/vehicleName`, and
  readers pick with `??` fallbacks. Crew lives twice: `assignment.employeeIds` (ids) and
  `crewLead`/`crewMembers` (display names); every consumer reads the **names** and fabricates fake
  driver ids (`driverStorage.ts:214-220`).
- Job detail's `AssignmentEditor` (`JobDetail.tsx:944-993`) shows Vehicle as **free text**, omits
  `vehicleId` from the save, and resets crew to empty on mount. **Editing an assignment from the job page
  wipes the vehicle id** — which is exactly what the calendar uses to place the job in a slot.
- Employees are **localStorage-only** (`lib/employeeStorage.ts`), so the crew dropdown differs per browser.
- The fleet in the DB is `spr-01…spr-06` + `box-01` (`202609040001_dashboard_leads.sql:290-302`), but the
  pricing templates `ford-transit-t250`, `promaster-1500`, `box-truck-liftgate`, `14k-dump-trailer` sit in
  the same `vehicles` table, so the New Job dropdown offers **real vans and generic templates side by side**.

**Junk baked into the shared screens**

- Jobs list columns: Material, Facility (codes MSW/FRN/SKY…). No Service, Vehicle, or Crew column.
- Job detail always shows "Schedule, Material & Facility" with cubic yards, "Facility Check", "Vehicle
  Comparison" (landfill routing), and the owner-only dump-receipt / scale-ticket card.
- `JobCostActuals` is a disposal ticket (gross/tare/net weight, scale ticket, dump receipt URL).
- `serviceType` is set in a few places but **nothing branches on it** anywhere in the app.

**What's already right**

- The calendar (`Schedule.tsx` + `scheduleSlots.ts`): 4 slots/day = AM/PM × Van/Box Truck, jobs placed by
  start time + vehicle class, drag-and-drop rescheduling that reassigns the vehicle. This is the target
  mental model.
- `JobServiceType` already exists (`types/jobs.ts:28-38`) with `moving`, `furniture_assembly`,
  `appliance_moving`, `labor_only`, `delivery`, `junk_removal`…
- `types/driver.ts` has good `JobStop` / `JobItem` shapes (stop type pickup/delivery/service, per-stop
  address + contact + access notes, item flags heavy/disassembly/reassembly).
- The v19 moving types (`types/moving.ts`, `data/movingRates.ts`) already know home size, stairs per
  location, crew 2/3/4, piano, packing — the estimate-side inputs a moving ticket should inherit.
- The ops rules already say: each vehicle has its own schedule track, max 2 morning starts per driver,
  2-worker jobs need 2 drivers in the same block, box truck for full moves, vans for assembly.

## What the Thumbtack agent ("David", prompt v20) tells us

Abe supplied the agent YAML on Sep 12. It is the customer-facing source of truth for what gets sold and
how it gets scheduled, so the ticket has to be able to hold what David promises. Pricing numbers live in
the pipeline repo (`rejunk-webhook-services`) and `data/movingRates.ts` — not repeated here.

**The service menu David actually quotes (junk is NOT on it)**

| What David sells | Vehicle | Crew | Time shape |
|---|---|---|---|
| Cargo van delivery ($120 flat) — small item one person carries | Van | 1 | short |
| Van flat ($199) — one large item or matching set, ≤15 mi | Van | 1 ("your mover") | short |
| Small Move package (≤8 items) | Box truck | 2 | first 2 h included |
| Studio / 1BR package | Box truck | 2 | 4 on-site hours included |
| 2BR package · Small House package | Box truck | 3 | 6 on-site hours included |
| 3BR+ / large house — hourly | Box truck | 4 (4-h min; falls back to 3) | 6–8 h est.; >8 h escalates |
| Hourly 2- or 3-mover truck job (excluded items, misc.) | Box truck | 2–3 | 2-h min |
| Labor-only (no truck) | none | 2 | 2-h min, **full payment at booking** |
| Piano (flat tiers by type) | Box truck | 2 | add-on to a move or standalone |
| Furniture assembly (per-item flat, $125 min) | Van ("assembly tech") | 1 | **max ONE assembly job per day** |
| TV mount / unmount add-on ($125 / $149 per TV) | "our installation team" (separate crew) | — | tagged `[TV-INSTALL]` for dispatch |

Trash / debris / unwanted-item hauling is explicitly **referred to Lugg**. Junk removal survives only for
direct customers, so it is a real but minor service type (D1).

**How David sees availability — this is the capacity model the ticket must feed**

- Two calendars: **"truck crew"** (morning / afternoon openings per date) and **"assembly tech"** (a date
  with one assembly job reads "fully booked"). Assembly leads only ever see the assembly calendar.
- The truck calendar carries a **VAN line**: `van: AM n/u · PM n/u` (booked / capacity, open or closed).
  Van-flat and cargo-van deliveries book against the van line; packages and hourly book against the truck
  openings. A van opening never makes a truck job possible and vice versa.
- Availability is offered only as **morning** or **afternoon** — never clock windows. The customer picks
  the actual slot on the booking page. So "AM / PM × vehicle" is exactly how the business already thinks.
- Day type: **weekend = Fri, Sat, Sun + first two and last two calendar days of the month** (Phoenix
  time). Every quote depends on it; the ticket should store it.

**Booking mechanics the ticket must carry**

- Today the booking happens on the **Housecall Pro booking page** with a **$50 deposit** (credit toward the
  invoice, date held 24 h). Labor-only and pickups from a seller / third party's home require **full
  payment at booking** and dispatch sends an invoice link by hand.
- Tags David emits for dispatch: `[ESCALATE]` (safe, hot tub, built-in appliances, >300 lb, >8 h with 4
  movers, out of area, scam signals, complaints, assisted booking…) and `[TV-INSTALL]` (TV count, sizes,
  which location).
- Every 4-mover quote carries the fourth-mover fallback sentence; crew size on a package is "dispatch's
  call and never changes the price".

## Design

### D1. Service type is the first question on every ticket

`Job.serviceType` becomes **required** and drives which fields, sections, and columns appear. Collapse the
current ten values into the five the business actually runs, keeping the old ones as aliases on read:

| serviceType | What it is | Default vehicle | Crew |
|---|---|---|---|
| `moving` | Packages, hourly truck moves, labor-only, piano (sub-kind below) | Box truck (none for labor-only) | from tier: 2 / 3 / 4 |
| `delivery` | Cargo-van delivery ($120) and the $199 van flat single large item | Van | 1 |
| `assembly_handyman` | Assembly, mounting, small repairs (the "assembly tech" calendar) | Van | 1 (2 if > 75 lb / overhead) |
| `junk_removal` | Haul-away with a disposal stop (direct customers only; Thumbtack refers to Lugg) | Van for 1–3 items; box truck for cleanouts | 1–2 |
| `other` | Anything else, free-text label | — | 1 |

`moving` carries a required **`movingKind`** that fixes crew and time shape straight from the rate card:
`small_move` (2 movers, 2 h incl.) · `studio_1br` (2, 4 h) · `two_br` (3, 6 h) · `small_house` (3, 6 h) ·
`hourly_2` · `hourly_3` · `hourly_4` (4-h min, 6–8 h est.) · `labor_only` (2, no truck) · `piano` (2).
`delivery` carries `deliveryKind`: `cargo_van` | `van_flat`. TV install is an **add-on** on any ticket
(`tvInstall: { count, sizes, locations }`), not a service type — it goes to the installation crew.

Aliases: `furniture_assembly`→`assembly_handyman`, `appliance_moving`→`delivery`,
`specialty_moving`/`labor_only`→`moving`, `heavy_material_hauling`/`demolition`→`junk_removal`.
Read old values, write new ones. Keep `JobServiceType` as the union of both during the transition.

### D2. Stops, items, crew, and vehicle live ON the ticket

Stop writing to tables that don't exist. Put the operational data inside the job record, which already
persists as JSON in `jobs.data`:

```ts
interface Job {
  // ...existing generic fields (id, jobNumber, customerName, phone, email, scheduledStart/End, status,
  //    paymentStatus, quotedAmount, notes, internalNotes, source, leadSource, priority, ...)
  serviceType: JobServiceType;          // REQUIRED (D1)
  stops: JobStop[];                     // ≥1; moving = pickup + delivery; junk = service (+ disposal)
  items: JobItem[];                     // optional checklist; moving inherits from estimate
  crew: JobCrewMember[];                // { employeeId, role: "lead" | "driver" | "helper" }
  requiredCrew: number;                 // from service rules / estimate (safety floor)
  vehicleId?: string;                   // ONE place. Fleet unit id (spr-01, box-01)
  slot?: SlotKey;                       // optional cache of am_van/pm_box_truck; derived otherwise
  movingKind?: MovingKind;              // required when serviceType === "moving" (D1)
  deliveryKind?: "cargo_van" | "van_flat";
  dayType: "weekday" | "weekend";       // Phoenix rule incl. month-end; stored, never recomputed on read
  quote?: { tier: string; low: number; high: number; includedHours?: number; source: "david" | "estimate" | "manual" };
  paymentTerms: "deposit" | "full_upfront";   // full_upfront = labor-only or third-party pickup
  thirdPartyPickup?: boolean;           // pickup at a seller / marketplace / store — drives paymentTerms
  tvInstall?: { count: number; sizes: string[]; locations: ("pickup" | "delivery")[] };
  escalation?: { reason: string; resolvedAt?: string };   // from [ESCALATE]; blocks "Book it" until resolved
  leadRef?: { source: "thumbtack" | "website" | "hcp" | "direct"; negotiationId?: string; hcpJobId?: string };
  junk?: JunkDetails;                   // materialType, materialName, cubicYards, weight, facility,
                                        //   warnings, route comparisons, actuals (disposal ticket)
  moving?: MovingDetails;               // homeSize, stories, flights per stop, piano, packing,
                                        //   estimate crew comparison snapshot (from types/moving.ts)
}
```

- `address/city/state/zip` on the job become **derived** from `stops[0]` (keep as read-only mirror for the
  Jobs list, search, geocoding, and the `jobs.customer_name`-style scalar columns; write them on save).
- `assignment.vehicleId/vehicleName`, `Job.vehicleName`, `crewLead`/`crewMembers` name strings: **delete
  on write, tolerate on read.** Names are resolved from the employee/vehicle lists at render time.
- `JobCostActuals` moves under `junk.actuals`; a generic `actuals` keeps only `chargedAmount`,
  `laborMinutes`, `fuelCost`.
- Migration is a **read-side adapter** (`normalizeJob()` in `jobStorage.ts`): old blobs → new shape on
  load; new shape written on the next save. No SQL migration for the blob. The 7 sample jobs are the test
  set (Abe confirmed they're fake).
- Update the `get_driver_today` allowlist (new migration) to include `serviceType`, `stops`, `items`,
  `crew`, `requiredCrew`, `moving` (never `junk.actuals`, never money). Delete the client-side stop/item
  synthesis and the junk heuristics in `driverStorage.ts:172-207`.

### D3. Employees on Supabase (prerequisite for cross-browser crew)

Crew assignment is meaningless if the employee list lives in one browser. Add an app-owned
`app_employees` table (tenant-scoped, RLS for bound staff sessions, same pattern as `app_client_meta`),
hydrate in `employeeStorage.ts` with the standard cache + `employees-updated` event. Driver activation
already keys on `employee_id`; this makes those ids real. **Do this first** — every later phase reads it.

### D4. Fleet units only

Mark the four generic template vehicles `is_active = false` (or add `is_template`) so pickers show
`SPR-01…SPR-06`, `BOX-01` only. Pricing keeps reading templates by id for cost math; tickets and the
calendar use fleet units. Add `vehicleClassForType()` usage everywhere a "van vs box truck" decision is
made — never string-match names again once ids are clean.

### D5. New Job = a short guided form, slot-first

Replace the single long form with steps that mirror how dispatch actually books. All on one page,
sections revealed in order, no wizard framework:

1. **What** — service type (5 big buttons). Picking one sets the default vehicle class, required crew,
   and which sections appear.
2. **Who** — customer name, phone, email, lead source. Type-ahead against Clients & Leads so a Thumbtack
   or website lead can be picked instead of re-keyed (link the client id on the job).
3. **Where** — stops. Moving/delivery: **Pickup** and **Delivery** cards (address, contact, floor/flights,
   elevator, parking notes). Assembly/junk: one **Service** card. "Add stop" for multi-stop jobs (ops rule:
   multi-stop = separate schedule blocks — warn when >2 stops).
4. **When** — a **mini slot picker**: day + the slots, showing which are open/taken (reuse
   `buildDayBoard`). Picking a slot sets the arrival window and vehicle. The slot rows must match what
   David is told: **AM Box / PM Box** (truck crew), **AM Van / PM Van** (van line), and an
   **Assembly tech** row capped at one job per day. Time shape comes from `movingKind`: Studio/1BR fits
   one half-day; 2BR, Small House, and any 4-mover job **block both halves of the truck** ("full day");
   Small Move, deliveries, and assembly are one half-day. The picker shows the day-type tag (weekday /
   weekend) so the quote tier is right. Same-day / Sunday / after-6PM show the surcharge reminders.
5. **Crew** — required crew shown as a number the dispatcher can raise but not lower below the safety
   floor (2 for moving; 2 for anything > 75 lb / overhead / appliance; 3 for piano/safe). Pick employees
   from the live list; block save if fewer than required are assigned when status is "scheduled".
6. **Price** — quoted amount (+ owner-only cost/profit). "From estimate" button links a saved estimate and
   copies items/moving details. Not required for a draft.
7. **Notes** — customer-visible notes, internal notes.

Two buttons only: **Save draft** (no slot/crew needed, status `open`) and **Book it** (needs slot +
vehicle + required crew, status `scheduled`, lands on the calendar). "Assigned" as a status goes away —
a booked job with crew is assigned by definition.

### D6. Estimate → ticket carries everything

`createJobFromEstimate()` must set `serviceType` from the estimate mode, `stops` from pickup/delivery
(moving) or job address (junk/assembly), `items` from estimate lines, `requiredCrew` from the estimate's
crew size, `vehicleId` when the estimate picked one, `moving` details from the v19 snapshot once that
lands, and `junk` details for junk mode. Route the office estimator's "Create job" and the Estimate
Builder's convert through the same function.

### D7. Jobs list and Job detail follow the service type

- **Jobs list** columns: Job #, Customer, Service (pill), Scheduled (day + slot label), Vehicle (unit
  code), Crew (count/names), Where (stops[0] → stops[1] for moves), Status, Payment, Quote, Profit (owner).
  Material/Facility become columns only when the Service filter is `junk_removal`.
- **Job detail**: header (customer, service, slot, vehicle, crew), Stops card, Items checklist, Crew &
  Vehicle editor (fixes the `vehicleId` wipe and the reset-on-mount bug), Money (owner), Notes, Driver
  activity/photos/messages. **Junk-only** cards (material, facility check, vehicle comparison, disposal
  actuals) render only for `junk_removal`. **Moving-only** card: home size, stairs per stop, piano,
  packing, the 2/3/4-mover snapshot.
- **Dispatch Center**: crew and vehicle from ids; "unassigned" = `crew.length < requiredCrew`.

### D8. Driver app shows a move like a move

DriverHome card: service pill, window, customer, **pickup → delivery** one-liner, vehicle unit, crew
names, required-crew warning if short. DriverJobDetail: stops in order with tap-to-navigate and per-stop
access notes, items checklist with heavy/disassembly flags, crew list, notes. Disposal section only for
junk. No prices (unchanged rule). Status strip unchanged.

### D9. Calendar ties in

- Add the **Assembly tech** row to `DAILY_SLOTS` (capacity 1/day, van class, whole day) so the calendar
  and David's "assembly tech" calendar agree. Van capacity per half-day = number of active SPR vans (the
  VAN line's `n/u`), not 1 — make `capacity` a property of a slot row, not implied.

- Ticket carries `slot` after booking; the calendar still derives from time + vehicle class so hand-edits
  stay consistent. Full-day bookings show the card spanning AM and PM cells.
- Crew capacity as a second dimension: a day header shows "2 of 4 movers assigned" when crew is short.
- Dropping a job whose `requiredCrew > 1` onto a slot where the assigned crew is already on another job in
  that half-day shows a warning (not a block).

### D10. Rejunk becomes the [CALENDAR] block (the HCP-replacement hinge)

Today David's availability comes from "our scheduling system" (HCP). Once tickets carry slot + vehicle +
day type, a small server-side RPC `availability_block(tenant, from_date, days)` can produce exactly the
text David expects: per date → day-type tag, truck AM/PM open or full, `van: AM n/u · PM n/u`, and the
assembly-tech line. That is the first concrete thing that lets Progressive turn HCP off: the agent quotes
off Rejunk's calendar, and a booking page + $50 deposit (later phase, Stripe) writes the ticket David
already scoped. Keep it read-only and tenant-scoped; the pipeline repo consumes it.

### D11. Booking → ticket, automatically (the differentiator)

**Today (Abe, Sep 12):** a Thumbtack booking creates an HCP job, then Abe opens the Thumbtack thread and
hand-copies addresses, gate codes, key details, and images into the HCP job order. "75% manual."
Everything needed to do that automatically is already in the shared database:

- `negotiation_job_map` links a Thumbtack `negotiation_id` to the HCP `hcp_job_id` (populated by HCP's
  native Thumbtack import). `hcp_appointments` carries the appointment date, totals, and status via the
  HCP webhook. `thumbtack_messages` holds the full thread (`direction`, `text`, `sent_at`) — the same
  thread David wrote, so it contains the quote tier, crew size, addresses, stairs, TV count, and any
  `[TV-INSTALL]` / `[ESCALATE]` decisions.
- **Verified in `rejunk-webhook-services` (Sep 12):** attachments ARE captured. `thumbtack_leads.attachments`
  and `thumbtack_messages.attachments` are jsonb arrays of `{fileName, fileSize, mimeType, url,
  description}` (webhook `supabase/functions/thumbtack-webhook/index.ts:509`; schema in
  `thumbtack-webhook-pipeline-spec.md:97,127`). The app's `ThumbtackMessage` type just doesn't read the
  column yet. The `url` is a `thumbtack.com/attachment/...` link — assume it can expire or need auth, so
  the worker must **copy each file into Supabase storage at ingest** (bucket `thumbtack-media`, keyed by
  message id) and the ticket references our copy.
- **`thumbtack_leads` already holds structured lead facts:** `location_address/city/state/zip`,
  `schedule`, `category`, `description`, `details` (Thumbtack's Q&A array), `crew_required`,
  `quoted_price`, `pricebook_item_ids`. Start from these; the thread fills in the rest.
- **An extractor already exists:** `_shared/enrichment.ts` runs on every inbound customer message —
  regex for real phone/email (relay numbers discarded), then a **Haiku tool-call extractor**
  (`record_access_details`: `gate_code`, `unit`, `access_notes`, `address_correction`, temperature 0,
  keyword-gated) — and today appends the result as **notes on the HCP job** (mode `off | draft | live`
  per tenant, idempotent `enrichment_events` ledger, email alert). D11 is that module grown up: a full
  ticket extractor whose output lands in Rejunk's `jobs` instead of HCP notes. Reuse its relay-number
  rules, the ledger pattern, and the draft/live gate.
- `hcp_appointments` (upserted by `_shared/hcp_automations.ts` `upsertAppointment`) carries the
  appointment window, customer, city, and totals per HCP job.

**Flow**

1. **Trigger:** a new row in `negotiation_job_map` with an `hcp_job_id`, or an `hcp_appointments` insert
   whose customer matches a Thumbtack lead. (Later, when Rejunk owns booking: the booking page itself.)
2. **Gather:** the negotiation's messages, the lead row (name, phone, category), the HCP appointment
   (date/time, total), and any images.
3. **Extract** with one Claude call (server-side, service role, model `claude-sonnet-5`, tool-call
   structured output like `record_access_details` but for the whole ticket) over the lead row + thread: pickup and delivery addresses, gate codes / access notes per address, floors
   and flights, elevator, parking, item list, wall-mounted TVs, piano type, third-party pickup, the quote
   tier and price David stated, day type, crew size, special instructions, and a short "what the customer
   said" summary. Each field carries a confidence and the message it came from. Never invent; leave
   blank with `needs_review`.
4. **Create** a ticket in `jobs.data` with `serviceType`/`movingKind` from the tier, `stops` from the
   addresses, `crew` empty but `requiredCrew` set, `paymentTerms`, `tvInstall`, `leadRef` (negotiation +
   HCP job ids), the photos attached (reuse the `job-photos` bucket), `quote.source = "david"`, status
   `needs_review`, and the appointment's date + half-day pre-selected as the slot.
5. **Review:** a "New from Thumbtack" queue on Jobs (and a Dashboard tile). Dispatch opens the ticket,
   sees each extracted field next to the sentence it came from, fixes anything, assigns crew and vehicle,
   and clicks **Book it**. Nothing goes to a driver before that click.
6. **Idempotent** on `hcp_job_id`; re-running updates `needs_review` fields, never overwrites
   dispatcher edits.

**Where it runs:** the pipeline repo already owns the HCP + Thumbtack webhooks, the service-role key, and
`enrichment.ts`, so the extraction job belongs there — a new `_shared/ticket_extractor.ts` triggered from
the `negotiation_job_map` / `hcp_appointments` path (not per-message), writing the ticket into `jobs` for
tenant `progressive` and copying attachments into storage. The app side is the review UI and the `needs_review` status. Keep the extraction prompt
in the pipeline repo next to David's prompt so the two stay in step.

**Acceptance:** for the last 20 real bookings, the auto-created ticket needs zero edits on addresses and
gate codes in ≥ 16, and never a wrong address. Time from booking to a driver-ready ticket: under 2 minutes
of dispatcher review.

## Phases

**Phase 0 — Employees to Supabase (D3), fleet cleanup (D4).** Migration + hydration. Acceptance: crew
dropdown identical on two machines; vehicle pickers show 7 fleet units, none of the templates.

**Phase 1 — Ticket shape (D1, D2) + read-side adapter.** Types, `normalizeJob()`, `createDispatchJob`
and `createJobFromEstimate` writing the new shape, `saveDispatchOperationalPlan` no longer writing dead
tables or the localStorage operational blob. `get_driver_today` allowlist migration. Acceptance: the 7
sample jobs load, re-save, and reload with stops/crew intact on a second browser; a moving job shows
"Moving" on the driver phone with two stops.

**Phase 2 — Booking → ticket (D11).** The highest-value phase; needs only phase 1's ticket shape and the
`needs_review` status. Pipeline-side worker + app-side review queue. Attachments are already captured; the worker
copies them into storage and links them to the ticket.

**Phase 3 — New Job form (D5) + estimate handoff (D6).** Acceptance: booking a 2BR move takes < 1 minute,
lands in PM Box Truck with 2 movers, blocks "Book it" with 1 mover, and the same job created from an
estimate carries pickup/delivery/items.

**Phase 4 — Jobs list, Job detail, Dispatch Center (D7).** Fix the assignment editor bugs here.

**Phase 5 — Driver app (D8), calendar extras (D9).**

**Phase 6 — Availability feed for David (D10).** Read-only RPC + a test that renders one week exactly in
the `[CALENDAR]` format. Booking page + deposit is a separate spec.

Each phase ships on its own; `pnpm check` clean; commit locally, push on Abe's word.

## Do not modify

- Pricing engines (`pricingCalculator.ts`, `serviceCalculator.ts`) and the pricebook.
- Staff/driver auth, RLS bridge, financial masking (`SECURITY_REMEDIATION.md`, `OWNER_FINANCIAL_ACCESS.md`).
  New RPC allowlists must keep money out of driver payloads.
- Thumbtack/HCP pipeline tables (read-only).
- The unapplied `202606070001–3` migrations: leave them; don't apply, don't depend on them. If phase 1
  needs persistence beyond `jobs.data`, write a **new** additive migration.

## Answered by the agent YAML (confirm, don't re-ask)

1. **Full-day moves** — packages with 6 included hours (2BR, Small House) and every 4-mover job block
   **both halves** of the truck. Studio/1BR (4 h) and Small Move (2 h) are one half-day.
2. **Crew floor** — not always 2. The $199 van flat and the $120 cargo-van delivery are **1-mover** jobs
   ("your mover", never "crew"). Truck moves are 2 / 3 / 4 by tier; labor-only and piano are 2.
3. **Junk removal** — not sold on Thumbtack at all (Lugg referral). Keep the disposal flow but demote it
   to a minor service type; don't spend design effort on it.
4. **Assembly tech = Abe** (99% of the time), separate from the moving crew. The Assembly row is Abe's
   own track: one job per day, and it never consumes a mover or a truck slot. Model it as a
   `capacityKind: "person"` row (employee-bound), not a vehicle row.
5. **Workers are the constraint, not vans.** "We have more vans than workers." Capacity per half-day is
   therefore **available movers**, and the vehicle is chosen per job — van preferred (cheaper to run,
   lower-value jobs), box truck when the job needs it. So the calendar rows stay by vehicle class (that's
   how jobs are *placed*), but the number that limits booking is crew: `booked movers / available movers`
   per half-day, shown in the day header, with the van line's `u` = number of van-capable workers on
   shift that day, not the number of vans. Vehicle rows never go "full" on their own except BOX-01 (one
   truck).

## Open questions for Abe

1. **Per-unit rows later** — when the fleet grows, should the calendar show a row per truck (BOX-01,
   BOX-02) as HCP does, or per class? Spec assumes per class now, per unit later.
2. **Thumbtack attachment links** — do `thumbtack.com/attachment/...` URLs expire? (Spec assumes yes and
   copies files at ingest; if they're permanent, skip the copy.)
3. **Deposit** — when Rejunk owns booking, is the $50 deposit collected through Stripe on a Rejunk page,
   or does HCP's booking page stay for a while with the ticket created from the HCP webhook?
4. **Employees table** — fine to create `app_employees` now (additive), or wait for the driver-phase
   migrations to be reconciled? Spec says now.
5. **Who's on shift** — for crew capacity (answer 5 above) the app needs a simple "who's working today"
   input. A per-day roster on the Schedule page (tap names) or the driver app clock-in? Spec assumes a
   roster on Schedule, editable by dispatch.
