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

## Design

### D1. Service type is the first question on every ticket

`Job.serviceType` becomes **required** and drives which fields, sections, and columns appear. Collapse the
current ten values into the five the business actually runs, keeping the old ones as aliases on read:

| serviceType | What it is | Default vehicle | Min crew |
|---|---|---|---|
| `moving` | Furniture / household move, A → B (also labor-only loads, PODs) | Box truck for 2BR+; van for studio/small | 2 |
| `assembly_handyman` | Assembly, mounting, small repairs | Van | 1 (2 if item > 75 lb or overhead) |
| `delivery` | Pick up an item somewhere, deliver it (appliance, store purchase) | Van unless heavy → box truck | 1–2 |
| `junk_removal` | Haul-away with a disposal stop | Van for 1–3 items; box truck for cleanouts | 1–2 |
| `other` | Anything else, free-text label | — | 1 |

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
4. **When** — a **mini slot picker**: day + the four slots, showing which are open/taken (reuse
   `buildDayBoard`). Picking a slot sets the arrival window and vehicle. Big moves can take **both
   half-days** (AM + PM of the same vehicle = "full day"). Same-day / Sunday / after-6PM show the surcharge
   reminders from the ops rules.
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

- Ticket carries `slot` after booking; the calendar still derives from time + vehicle class so hand-edits
  stay consistent. Full-day bookings show the card spanning AM and PM cells.
- Crew capacity as a second dimension: a day header shows "2 of 4 movers assigned" when crew is short.
- Dropping a job whose `requiredCrew > 1` onto a slot where the assigned crew is already on another job in
  that half-day shows a warning (not a block).

## Phases

**Phase 0 — Employees to Supabase (D3), fleet cleanup (D4).** Migration + hydration. Acceptance: crew
dropdown identical on two machines; vehicle pickers show 7 fleet units, none of the templates.

**Phase 1 — Ticket shape (D1, D2) + read-side adapter.** Types, `normalizeJob()`, `createDispatchJob`
and `createJobFromEstimate` writing the new shape, `saveDispatchOperationalPlan` no longer writing dead
tables or the localStorage operational blob. `get_driver_today` allowlist migration. Acceptance: the 7
sample jobs load, re-save, and reload with stops/crew intact on a second browser; a moving job shows
"Moving" on the driver phone with two stops.

**Phase 2 — New Job form (D5) + estimate handoff (D6).** Acceptance: booking a 2BR move takes < 1 minute,
lands in PM Box Truck with 2 movers, blocks "Book it" with 1 mover, and the same job created from an
estimate carries pickup/delivery/items.

**Phase 3 — Jobs list, Job detail, Dispatch Center (D7).** Fix the assignment editor bugs here.

**Phase 4 — Driver app (D8), calendar extras (D9).**

Each phase ships on its own; `pnpm check` clean; commit locally, push on Abe's word.

## Do not modify

- Pricing engines (`pricingCalculator.ts`, `serviceCalculator.ts`) and the pricebook.
- Staff/driver auth, RLS bridge, financial masking (`SECURITY_REMEDIATION.md`, `OWNER_FINANCIAL_ACCESS.md`).
  New RPC allowlists must keep money out of driver payloads.
- Thumbtack/HCP pipeline tables (read-only).
- The unapplied `202606070001–3` migrations: leave them; don't apply, don't depend on them. If phase 1
  needs persistence beyond `jobs.data`, write a **new** additive migration.

## Open questions for Abe

1. **Full-day moves**: should a big move block *both* half-days of the truck (AM + PM), or do you book
   them as one PM slot and accept overrun? The spec assumes both.
2. **Crew floor for moving**: always 2, or is a 1-mover van job (small item delivery) a real thing you
   book? Spec assumes 2 for `moving`, 1 for `delivery` of light items.
3. **Second box truck / more vans** later — is the slot count per vehicle class fixed at 1, or per fleet
   unit (SPR-01, SPR-02… each their own row)? Per-unit rows are the HCP-style answer and what the ops
   rules describe ("each vehicle has its own schedule track"). Spec assumes per-class now, per-unit later.
4. **Junk jobs**: keep the landfill/disposal actuals flow as-is under `junk`, or simplify since it's rare?
5. **Lead → job**: `CREATE_ESTIMATE_FROM_LEAD_SPEC.md` already covers lead → estimate. Is lead → ticket
   (skip the estimate for repeat customers who call direct) wanted in phase 2, or later?
6. **Employees table**: fine to create `app_employees` now, or wait for the driver-phase migrations to be
   reconciled? Spec says create now; it's additive.
