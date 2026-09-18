# Moving Estimator v19 — Spec

**Owner:** Abe · **Date:** Sep 9, 2026 · **Scope:** the **Moving** tab of `/estimate-builder` only.
Junk Removal, Assembly & Handyman, and Vision tabs are **out of scope** — do not touch them.

## Overview

Two deliverables, in order:

1. **Pricing sync.** Bring the app's moving prices up to **pricing v19** — the numbers the Thumbtack
   chat agent (David) quotes today and the HCP pricebook v19.1 carries. The app is currently quoting
   from a **pre-v19 HCP export** (see _Verified current state_).
2. **Custom moving quote builder.** Replace the "pick items from a dropdown" Moving tab with an
   input-driven builder: home size, stories/stairs, distance, date (weekday/weekend), piano, assembly
   add-ons, packing, crew size → a **2 / 3 / 4-mover comparison** plus a **package-vs-hourly
   recommendation**, with a customer-ready quote text that follows the same wording rules as David.
   The UI gets redesigned in the process.

Worked example (this is the real "Ee Ee Eng" lead from Sep 6–7): 4-bedroom, 2-story, 2,400 sqft
house in Gilbert → North Phoenix, ~60 miles, baby grand piano on the first floor, wants help
assembling furniture at the new place, Monday 9/21. The builder must produce that quote in under a
minute with 2-, 3-, and 4-mover totals side by side. See _Worked example_ at the bottom for the
expected numbers.

## Read first

`CLAUDE.md`, `DECISIONS.md` (newest on top). Pricing authority for this spec is **v19**, defined in
the pipeline repo `rejunk-webhook-services`: `docs/fable-spec-pricing-overhaul-v19.md` (decisions
table, §1–2), `docs/managed-agent-prompt.template.txt` (the rules David follows), and the live config
`businesses.responder_config.agent_rates` / `pricing_guards` (tenant `progressive`). The v19 HCP
export is `~/Desktop/pricing/ProgressiveTransportationServicesLLC_pricebook_import_v19.1.csv`.
`rejunk-pricebook-v4.md` in this repo is **superseded for moving** — do not price from it.

Where this spec and the repo disagree, the repo wins — say so, don't guess.

## Verified current state (checked against live code + live DB, Sep 9)

**How the Moving tab works today**

- `EstimateBuilder.tsx` renders `ServiceEstimatePanel` with `mode="moving"` (`key={mode}`), and
  the shared **Job Info** card (customer name, pickup, delivery, notes). Mode type
  `EstimateMode = "junk" | "service" | "moving" | "vision"` (`types/service.ts`).
- `ServiceEstimatePanel.tsx` is an **item picker**: a `<Select>` of pricebook items whose category
  `mode === "moving"`, quantity steppers, a **Stairs & Surcharges** card (per-location stairs
  `none / 2nd / 3rd / above_3rd` → **$100 / $200 / $300 per location**, plus a surcharge picker),
  and a **Vehicle** card (Cargo Van / Box Truck → travel fee $50 / $75, excess mileage $2.00 /
  $2.50 per mile past 15 route miles).
- Math: `utils/serviceCalculator.ts` `calculateServiceEstimate()` — sum lines, 2-hour minimum on
  hourly moving lines, stairs surcharge, flat/percent surcharges, floors $125 / $199, crew size =
  max across items. Snapshot type `ServiceEstimateSnapshot` (`types/service.ts`) saved in
  `SavedEstimate.service` with `mode: "moving"`.
- Distance: `getPointToPointRoute()` (`utils/distanceRouting.ts`) via Google Distance Matrix,
  debounced on pickup+delivery. Per `CLAUDE.md` the Maps key is Maps-JS-only, so this returns
  `REQUEST_DENIED` in practice → `route` stays `null` and mileage never applies.

**What it actually prices from (the real problem)**

- The pricebook is Supabase `pricebook_items` / `pricebook_categories`, `tenant_id = 'progressive'`
  (`lib/pricebookStorage.ts` → `dataStore.ts` `businessRows`). Those rows are the **old HCP export**
  (categories named `Summit — …`, ids `prog-*`, HCP uuid in `external_id`). Moving rows today:

  | id                                                                                                                    | name                                               | price                    |
  | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------ |
  | prog-apartment-move-studio-1-bedroom                                                                                  | Apartment Move - Studio/1 Bedroom                  | $450                     |
  | prog-apartment-move-2-bedroom                                                                                         | Apartment Move - 2 Bedroom                         | $650                     |
  | prog-home-move-small-house                                                                                            | Home Move - Small House                            | $750                     |
  | prog-small-local-move-2-movers-truck                                                                                  | Small Local Move - 2 Movers + Truck                | $400                     |
  | prog-moving-labor-2-movers-2-hours                                                                                    | Moving Labor - 2 Movers, 2 Hours                   | $190                     |
  | prog-moving-labor-additional-hour                                                                                     | Moving Labor - Additional Hour                     | $95                      |
  | prog-moving-labor-3-movers-hour                                                                                       | Moving Labor - 3 Movers, Per Hour (no external_id) | $120                     |
  | prog-piano-moving                                                                                                     | Piano Moving                                       | $300                     |
  | prog-safe-moving-basic                                                                                                | Safe Moving - Basic                                | $300                     |
  | prog-supply-moving-and-delivery                                                                                       | Supply Moving and Delivery                         | $120                     |
  | prog-appliance-moving / prog-furniture-rearranging / prog-load-or-unload-pod-storage-unit / prog-sameday-moving-addon |                                                    | $150 / $149 / $250 / $25 |
  | prog-trip-service-fee (category prog-fees)                                                                            | Trip & Service Fee                                 | $65                      |

  Every one of the moving/labor/piano/trip numbers above is **pre-v19**.

- `data/defaultPricebook.ts` (the v4 catalog: `moving-hourly-2box` $150/hr, `specialty-piano-grand`
  $895, travel fees, etc.) only seeds when the remote pricebook is **empty**, so it is dead for
  progressive. But `ServiceEstimatePanel` still keys its vehicle logic on those v4 ids
  (`moving-travel-van`, `moving-travel-box`, `moving-mileage-*`, `moving-labor-only`,
  `moving-additional-mover`) — none exist in the progressive rows, so the Vehicle card's travel fee
  **silently adds nothing**.
- Stair dollars ($100/$200/$300 per location) contradict v19 (first flight included, +$75 per
  additional flight per address on packages; on hourly jobs stairs add time, not a fee).
- No concept anywhere of: weekday/weekend day type, crew size as an input, hours estimate,
  packages with included hours + overage, piano tiers, trip fee baked into the total, labor-only
  (no trip fee), 4-mover 4-hour minimum, 50-mile service limit, 15-mile van-flat cap.
- The pipeline (`rejunk-webhook-services`) reads the same `pricebook_items` rows through
  `_shared/pricebook.ts`, but progressive's `auto_quote_category_ids` is `[]` — nothing auto-quotes
  from these rows today. Changing progressive's prices is safe as long as ids and `external_id`
  are preserved (its import script upserts by id, keyed to the HCP uuid).

**UI problems (from screenshots)**

- Job Info is a large mostly-empty card that pushes the actual builder below the fold.
- Dropdown-first flow gives no guidance on _what_ to add; quote says "Not ready" until you guess.
- Stairs & Surcharges is a detached card; the vehicle card only appears after an item is added.
- Saved Estimates mixes junk estimates into the moving view, with no mode badge.
- Three-column layout with lots of dead whitespace; nothing sticky, so the total scrolls away.

## Pricing v19 — the numbers (source of truth for this build)

Live values from `businesses.responder_config.agent_rates` (progressive, `pricing_version`
`"v19 2026-09-06"`) and the HCP v19.1 CSV:

| Key                                                                        | Weekday                                                                                                                                                                                                                                             | Weekend                      | Notes                                                                                                                                                      |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hourly, 2 movers + 26-ft liftgate truck                                    | **$109/hr**                                                                                                                                                                                                                                         | **$124/hr**                  | 2-hour minimum                                                                                                                                             |
| Extra mover                                                                | **+$50/hr** each                                                                                                                                                                                                                                    | same                         | 3 movers $159/$174 · 4 movers $209/$224                                                                                                                    |
| Trip fee (truck jobs)                                                      | **$85**                                                                                                                                                                                                                                             | same                         | baked into the total, **never itemized to the customer** ("travel included")                                                                               |
| Small Move — up to 8 items, no full rooms                                  | **$303**                                                                                                                                                                                                                                            | **$333**                     | 2 movers, first 2 hrs + travel included, extra time at hourly                                                                                              |
| Apartment — Studio / 1BR                                                   | **$525**                                                                                                                                                                                                                                            | **$595**                     | 4 on-site hrs included, 2 movers                                                                                                                           |
| Apartment — 2BR                                                            | **$750**                                                                                                                                                                                                                                            | **$850**                     | 6 on-site hrs included, 3 movers                                                                                                                           |
| Home — Small house (up to 3BR, single level or one flight)                 | **$750**                                                                                                                                                                                                                                            | **$850**                     | 6 on-site hrs included, 3 movers                                                                                                                           |
| Package overage                                                            | $109/hr                                                                                                                                                                                                                                             | $124/hr                      | billed in quarter hours                                                                                                                                    |
| Additional flight of stairs (packages)                                     | **+$75** per flight per address                                                                                                                                                                                                                     |                              | first flight per address included                                                                                                                          |
| 3BR+ / large house / 2-story beyond Small House                            | hourly, **4 movers, 4-hr minimum**                                                                                                                                                                                                                  |                              | $209/$224; estimate 6–8 hrs; >8 hrs → escalate                                                                                                             |
| Labor-only (2 movers, no truck)                                            | **$109/hr, 2-hr min = $218**                                                                                                                                                                                                                        | **$124/hr, 2-hr min = $248** | **no trip fee**; full payment at booking                                                                                                                   |
| Van flat — single large item or item + its set                             | **$199**                                                                                                                                                                                                                                            | same                         | ≤15 miles between addresses; excludes appliances, power recliners, exercise equipment, >150 lbs, safes                                                     |
| Cargo van small-item delivery (1 person)                                   | **$120**                                                                                                                                                                                                                                            | same                         | no trip fee                                                                                                                                                |
| Piano — upright / large upright (≥48") / baby grand / grand                | **$299 / $349 / $399 / $499**                                                                                                                                                                                                                       | same                         | flat, added **on top** of the move; **+$75 per location** with stairs/difficult access; escalate if >2 flights, crane, balcony, spiral                     |
| Assembly add-on SKUs                                                       | dining chair $35 · office chair $45 · nightstand/small table $65 · desk $125 · TV stand $125 · dresser $150 · bed frame $175 · bunk bed $350 · shelving/storage $225 · IKEA small $149 · IKEA large $399 · 5-item bundle $199 · play equipment $195 |                              | $125 minimum on a **standalone** assembly visit                                                                                                            |
| Packing labor (packers, no truck)                                          | **$109/hr** per 2 packers                                                                                                                                                                                                                           | **$124/hr**                  | usually a separate day before the move; 8–12 boxes per packer-hour                                                                                         |
| Packing materials                                                          | **$5 per box** all-in default (editable)                                                                                                                                                                                                            |                              | box + paper + tape; dish pack / wardrobe cost more — owner adjusts                                                                                         |
| Large play structure (wooden playset / swing set) disassemble + reassemble | **$499 flat** default, or labor-only hourly                                                                                                                                                                                                         |                              | v19 "play equipment $195" is for small kits only; never fold into move-day hours                                                                           |
| Extended travel (address-to-address miles over 50)                         | **51–75 mi +$150 · 76–100 mi +$300 · >100 mi manual**                                                                                                                                                                                               | same                         | covers fuel (26-ft truck ≈ 8 mpg diesel) + the unpaid empty return; shown to the customer as "extended travel charge" — the only travel line ever itemized |
| Second truck                                                               | manual price per job                                                                                                                                                                                                                                |                              | switch + price input; warn while $0                                                                                                                        |
| TV mounting (installation team)                                            | **$125** ≤65" · **$149** >65"                                                                                                                                                                                                                       |                              | fireplace mounts escalate                                                                                                                                  |
| Safes, hot tubs, >300 lb non-piano items                                   | **escalate**                                                                                                                                                                                                                                        |                              | never auto-price                                                                                                                                           |
| Service area                                                               | ≤50 miles from Phoenix                                                                                                                                                                                                                              |                              | beyond 50 → escalate                                                                                                                                       |

**Weekend** = Friday, Saturday, Sunday, **plus the first two and last two calendar days of any
month** (Phoenix time). Sep 1, 2, 29, 30 are weekend days whatever the weekday.

**Hours rules (hourly jobs only):** stairs add **+30–45 min per flight** (a second story = one
flight); distance inside the metro (up to 50 mi) adds **zero** billable hours; disassembly /
reassembly of furniture being moved is included; we do **not** pack boxes or supply materials
(customer-supplied packing help is priced with the packing model below — decision 3).

**Floors** (`pricing_guards`, never quote below): hourly 109/124, extra mover 50, trip 85, small
move 303, studio 525, 2BR/small house 750, labor-only 218, van flat 199, cargo van 120,
assembly 125, TV mount 125. Floors only ever raise a price.

**Customer wording rules (same as David):** "travel included" on truck jobs, never a trip-fee
line; "no trip charge" on labor-only; every package quote states the included hours **and** the
extra-time rate; every 4-mover quote includes verbatim: _"If our fourth mover is ever unavailable
that day, we run the job with three and bill the three-mover rate instead — you'd never pay more."_;
hourly quotes say "estimate, not fixed"; a piano is "a separate flat rate of $X added on top";
never say "2 movers" on a 2BR or larger.

## Phase 1 — Pricing sync

### 1a. Typed rate config in the app

Create `client/src/data/movingRates.ts` exporting a single frozen `MOVING_RATES` object with every
number in the table above (plus `pricingVersion: "v19 2026-09-06"`, the weekend rule, hours
adjustments, and the floors). The quote engine (Phase 2) reads **only** this object — never
pricebook item names. Comment at the top: _"Mirror of `businesses.responder_config.agent_rates`
in rejunk-prod. A rate change is made there first (pipeline), then here."_ (The app must never
read the `businesses` table — `CLAUDE.md`.)

Also export `dayTypeOf(date: Date | string): "weekday" | "weekend"` implementing the weekend
rule in Phoenix time, with unit tests covering Sep and Oct 2026 edge days.

### 1b. Supabase pricebook rows → v19.1 (tenant `progressive` only)

Migration `supabase/migrations/20260910000001_pricebook_v19_moving.sql`, applied via the Supabase
MCP / SQL editor like `202609040001`. Every statement carries `where tenant_id = 'progressive'`.
Rules: **preserve existing `id` and `external_id`; never delete a row that has an `external_id`;
never touch wellsentry rows; do not touch junk / assembly / handyman rows** (other tabs, later).

Updates (existing ids):

| id                                   | new name                                   | new price | other                                                             |
| ------------------------------------ | ------------------------------------------ | --------- | ----------------------------------------------------------------- |
| prog-small-local-move-2-movers-truck | Small Move - Up to 8 Items (No Full Rooms) | 303       | crew_size 2, price_unit flat                                      |
| prog-apartment-move-studio-1-bedroom | Apartment Move - Studio/1 Bedroom          | 525       | crew_size 2                                                       |
| prog-apartment-move-2-bedroom        | Apartment Move - 2 Bedroom                 | 750       | crew_size 3                                                       |
| prog-home-move-small-house           | Home Move - Small House                    | 750       | crew_size 3                                                       |
| prog-moving-labor-2-movers-2-hours   | Labor Only – 2 Movers, 2 Hours             | 218       | crew_size 2                                                       |
| prog-moving-labor-additional-hour    | Moving Labor - Additional Hour (Weekday)   | 109       | price_unit hourly                                                 |
| prog-supply-moving-and-delivery      | Cargo Van Small Item Delivery              | 120       | crew_size 1                                                       |
| prog-piano-moving                    | Piano Moving - Upright                     | 299       | crew_size 2, notes "flat tier; add $75 per location with stairs"  |
| prog-safe-moving-basic               | Safe Moving - Basic                        | 300       | notes "ESCALATE — final price by weight/access; never auto-quote" |
| prog-trip-service-fee                | Trip Fee (truck jobs, baked in)            | 85        | mode surcharge_fee, notes "never itemized to the customer"        |

Inserts (new ids, `external_id` = the HCP uuid from the v19.1 CSV where one exists, else null;
`mode = 'moving'`, `item_type = 'Service'`, `photo_required = true`, `taxable = true`):

- `prog-small-move-weekend` Small Move - Up to 8 Items (Weekend) 333
- `prog-apartment-move-studio-1-bedroom-weekend` 595 · `prog-apartment-move-2-bedroom-weekend` 850 ·
  `prog-home-move-small-house-weekend` 850
- `prog-moving-labor-additional-hour-weekend` 124 (hourly)
- `prog-moving-hourly-2-movers-truck` 109 (hourly, crew 2) · `prog-moving-hourly-2-movers-truck-weekend` 124
- `prog-moving-extra-mover-hour` Additional Mover (per hour) 50 (hourly)
- `prog-additional-flight-of-stairs` 75 (per_item) — packages only
- `prog-cargo-van-moving-and-delivery` Cargo Van Flat - Single Large Item 199
  (external_id `olit_9442003ddd494312a6df373ed1b8edb3`, crew 1)
- `prog-piano-moving-large-upright` 349 · `prog-piano-moving-baby-grand` 399 · `prog-piano-moving-grand` 499 ·
  `prog-piano-stairs-per-location` 75 (per_item)
- `prog-tv-mounting-up-to-65` 125 and `prog-tv-mounting-65-plus` 149 already exist under
  `prog-mounting` as "TV Mounting Under 55 Inch" $129 / "TV Mounting 65 Inch Plus" $199 — **update**
  those two rows to 125 / 149 and the v19 names (they're the moving add-on prices).

Deprecate: `prog-moving-labor-3-movers-hour` ($120, no external_id) → delete (replaced by the
extra-mover row). Rename the nine `Summit — …` categories to `Progressive — …` (ids unchanged).

Also update the **moving** sections of `data/defaultPricebook.ts` (cat-moving, cat-moving-hourly,
cat-moving-travel, cat-moving-specialty) to the same v19 numbers so a fresh seed is never wrong.
Leave its junk/assembly sections alone.

### 1c. Pricebook page

No layout work. Verify the updated rows render under **Pricebook** with the new names/prices and
that the Moving tab's item list (until Phase 3 replaces it) shows v19 numbers.

## Phase 2 — Moving quote engine (pure, tested)

New `client/src/utils/movingCalculator.ts` + `client/src/types/moving.ts`. Pure functions, no
React, no storage. Add `"test": "vitest run"` to `package.json` and a
`client/src/utils/__tests__/movingCalculator.test.ts` (vitest is already a dependency; there are
no tests today — this is the first).

```ts
export type DayType = "weekday" | "weekend";
export type HomeSize =
  | "few_items"
  | "studio_1br"
  | "2br"
  | "3br"
  | "4br"
  | "5br_plus";
export type PianoType =
  | "none"
  | "upright"
  | "large_upright"
  | "baby_grand"
  | "grand";
export type CrewSize = 2 | 3 | 4;
export type QuoteMode =
  | "auto"
  | "package"
  | "hourly"
  | "labor_only"
  | "van_flat"
  | "cargo_van";

export interface MovingQuoteInput {
  moveDate?: string; // ISO date; drives dayType unless overridden
  dayType?: DayType; // manual override
  homeSize: HomeSize;
  itemCount?: number; // few_items only (≤8 qualifies for Small Move)
  stories: 1 | 2 | 3; // at pickup
  pickupFlights: number; // flights of stairs at pickup (0..n)
  deliveryFlights: number;
  distanceMiles?: number; // manual; may be auto-filled if Distance Matrix ever works
  laborOnly: boolean; // customer provides truck / same building
  crew: CrewSize; // the selected crew (all three are always computed)
  hoursOverride?: { low: number; high: number };
  packing: {
    enabled: boolean;
    separateDay: boolean; // default true — packing day before the move
    packingDate?: string; // drives its own dayType when separateDay
    packers: 2 | 3 | 4; // default 2
    boxes: number; // from the walkthrough (books/toys → small boxes)
    hoursOverride?: number; // default = boxes / (10 × packers / 2), rounded up to the quarter hour
    perBoxMaterials: number; // default 5
  };
  playStructure: {
    enabled: boolean;
    mode: "flat" | "hourly";
    price: number;
    hours?: number;
  }; // default flat $499
  secondTruck: { requested: boolean; price: number }; // manual flat line, default $0 + warning (Abe decides per job)
  walkthroughDone: boolean;
  piano: PianoType;
  pianoStairLocations: 0 | 1 | 2; // +$75 each
  pianoAccessUnusual: boolean; // crane / balcony / spiral / >2 flights → escalate
  assemblyAddOns: { skuId: string; qty: number }[];
  tvMounts: { upTo65: number; over65: number };
  specialtyFlags: { safe: boolean; hotTub: boolean; over300lb: boolean };
  mode: QuoteMode; // "auto" = recommend
}
```

Output `MovingQuoteResult`:

- `dayType` (resolved) and `dateLabel`.
- `crewOptions: Record<CrewSize, CrewOption>` — for **each** of 2, 3, 4 movers: `rate`, `hours
{low, high}` (after stairs/packing adjustments and minimums), `minimumApplied`, `labor {low,
high}`, `tripFee` (85, or 0 on labor-only), `addOnsTotal`, `total {low, high}`, `notes[]`
  (e.g. "4-hour minimum", fallback sentence, "over 8 hours — needs dispatch review"),
  `eligible: boolean` (2-mover is ineligible when the 2-mover estimate exceeds 8 hrs; 4-mover is the
  only option for 3BR+/large house per v19 §2b — still compute all three, mark eligibility).
- `packageOption?: { key, name, flatPrice, includedHours, overageRate, extraFlights,
extraFlightsTotal, crewShown, addOnsTotal, total }` — present only when eligible
  (`few_items` with `itemCount ≤ 8` → Small Move; `studio_1br` → Studio/1BR; `2br` → 2BR; `3br`
  with `stories ≤ 2` and ≤1 flight per address → Small House; never on labor-only, never 4BR+).
- `recommended: { kind: "package" | "hourly" | "labor_only" | "van_flat" | "cargo_van", crew?,
reason }` — packages first when eligible; otherwise hourly with the v19 crew (2 for
  few_items/studio/2BR, 3 as the middle option, 4 mandatory for 3BR+ when no package fits).
- `lines[]` — internal itemized breakdown: labor (rate × hours), trip fee (flag
  `internalOnly: true`), extended travel (customer-visible, tiered by miles), piano tier, piano
  stairs, extra flights, each assembly SKU, TV mounts,
  packing labor (packers × hours × rate), packing materials (boxes × per-box), play structure,
  second truck (flat, manual).
- `floorsApplied[]`, `warnings[]` (`severity: info | warning | escalate`):
  distance > 50 mi, safe / hot tub / >300 lb, 4-mover estimate > 8 hrs, piano access unusual,
  van flat requested but > 15 mi or excluded item, "packages never quote 2 movers on 2BR+",
  second truck requested with price $0 ("second truck — set a price or confirm no charge"),
  packing enabled with `separateDay: false` ("same-day packing — add packer hours to the move-day
  range"), and **"Recommend a walkthrough"** (info) whenever `homeSize` is 3BR+ or packing is on or
  any specialty flag/piano/play structure is set and `walkthroughDone` is false.
- `customerText` — the copy-ready quote following the _Customer wording rules_ above, for the
  recommended option (and a `customerTextFor(crew)` helper so the office can copy any column).
  Trip fee is never a line; totals are rounded to whole dollars in customer text only.

Formulas:

- `rate = (dayType === "weekend" ? 124 : 109) + (crew - 2) * 50`
- hourly `total = rate × hours + 85` (trip fee 0 on labor-only) + add-ons; minimum hours 2
  (4 when crew = 4). Labor-only is 2 movers only.
- package `total = flat + max(0, flights - 1) × 75 per address + add-ons`; overage shown as
  "$rate/hr past N hours", not added (we don't know the overage up front).
- Hours: a `HOURS_TABLE[homeSize][crew] = {low, high}` in `movingRates.ts` (defaults below,
  Abe confirms), then `+0.5..0.75 hr per flight per address` (use 0.5 low / 0.75 high), then
  then the minimum. Distance adds nothing. Packing on a **separate day** never touches move-day
  hours; packing labor = `packers/2 × packerHours × (packingDayType === "weekend" ? 124 : 109)`
  where `packerHours = ceil4(boxes / (10 × packers / 2))` unless overridden. Materials = boxes ×
  perBoxMaterials. Same-day packing (rare) raises the warning above and the owner adds hours.

  | homeSize   | 2 movers | 3 movers | 4 movers        |
  | ---------- | -------- | -------- | --------------- |
  | few_items  | 2–2      | 2–2      | — (not offered) |
  | studio_1br | 3–4      | 2–3      | —               |
  | 2br        | 5–6      | 4–5      | 3–4             |
  | 3br        | 6–8      | 5–6      | 4–5             |
  | 4br        | 8–10     | 6–8      | 5–7             |
  | 5br_plus   | 10–12    | 8–10     | 7–9             |

Tests must cover: the weekend rule; each package eligibility branch; 2-hr and 4-hr minimums;
labor-only has no trip fee; trip fee never appears in `customerText`; floors raise but never
lower; the fallback sentence appears on every 4-mover text; the worked example below.

## Phase 3 — Moving tab UI

Replace `ServiceEstimatePanel mode="moving"` with a new `components/MovingEstimatePanel.tsx`.
`ServiceEstimatePanel` keeps serving the Assembly tab untouched (remove its moving-only code paths
only if that is a pure deletion; otherwise leave them).

**Layout** (xl: two columns `minmax(0,1fr) 420px`; below xl: single column with a sticky bottom
total bar):

Left — the guided form, one card, numbered sections, each a row of segmented controls / steppers
(no dropdown-first):

1. **Job** — customer name, pickup, delivery (compact 3-up row; pre-filled from `?clientId` intake
   exactly as today), **move date** (date input) with the resolved chip _"Mon Sep 21 · weekday"_ and
   a weekday/weekend override toggle; notes collapsed behind a "Notes" disclosure.
2. **Home** — size segmented control (Few items ≤8 · Studio/1BR · 2BR · 3BR · 4BR · 5BR+), item
   count stepper when "Few items", stories (1 · 2 · 3), sqft optional text.
3. **Access** — flights of stairs at pickup and at delivery (steppers, 0–4), elevator checkbox
   per address (sets flights to 0, shows "elevator").
4. **Distance** — miles between addresses (number input). Show a muted "Auto-fill" button that
   calls `getPointToPointRoute` and fills on success; on failure it stays manual with no error
   toast. Inline hints: "≤15 mi: van flat eligible", "over 50 mi: dispatch approval".
5. **Piano & specialty** — piano type segmented control (None · Upright · Large upright · Baby
   grand · Grand), "stairs/difficult access at" (Pickup · Delivery toggles), "unusual access"
   checkbox; Safe / Hot tub / Over 300 lb checkboxes (each shows the escalate banner).
6. **Packing** — switch; when on: separate packing day (default on) + date with its weekday/weekend
   chip, packers (2 · 3 · 4), box count stepper (helper: "books and toys go in small boxes — count
   high"), computed packer hours with override, per-box materials (default $5). Shows packing labor
   and materials as two lines.
7. **Add-ons** — assembly SKU picker (chips with qty, from the SKU table), TV mounts (≤65" / >65"
   steppers), **Large play structure** switch (flat $499 default, or hourly with hours input),
   **Second truck** switch with an editable price (default $0 → warning until set or confirmed).
8. **Walkthrough** — a "Walkthrough done" checkbox and a collapsible checklist the office can tick
   on site: rooms and what's in each · furniture list (beds, sofas, tables, shelving) · box count
   by size (small for books/toys, medium, large, dish pack, wardrobe) · what stays behind ·
   stairs/elevator at each address · truck parking and access at each address · specialty items
   (piano, safe, play structure, appliances) · TVs on walls · garage/shed contents · date
   flexibility. Ticked items are saved on the estimate as `walkthrough: Record<string, boolean>`
   and notes.
9. **Crew & hours** — crew segmented control (2 · 3 · 4 movers) with the auto-recommended one
   marked; labor-only switch ("customer provides truck"); hours range shown as computed with an
   "Override" toggle exposing low/high inputs.

Right — sticky **Quote** panel:

- Header: day-type chip, recommended option name, **big total** (range for hourly, flat for
  package), "estimate, not fixed" tag for hourly.
- **Crew comparison** table: columns 2 / 3 / 4 movers → rate, hours, total range; recommended
  column highlighted; ineligible columns dimmed with the reason on hover/tap. Clicking a column
  selects that crew.
- **Package card** (when eligible): flat price, included hours, overage rate, extra flights,
  add-ons, total, and a "Use package" / "Use hourly" toggle.
- **Breakdown** (internal): every line incl. the trip fee marked "internal — travel included in
  customer text"; cost/margin rows hidden for the `office` role (`useStaffSession().isOwner`,
  same masking rule as the rest of the app).
- **Warnings / escalations** as colored banners (escalate = amber, blocks nothing but is loud).
- Actions: **Save**, **Copy customer quote** (recommended option; a small menu to copy the 2/3/4
  column instead), **PDF** (reuse `utils/quotePdf.ts`; extend it only if it can't render the new
  snapshot), **Reset**.

**Saved estimates**: filter the list to `mode === "moving"` on this tab, add a mode badge, show
"v18 pricing" on legacy moving saves. Loading a legacy `service`-snapshot moving save stays
supported read-only via the old panel path (or a banner + "rebuild with v19" that pre-fills what
it can) — do not crash on old saves.

**Persistence**: add `SavedEstimate.moving?: MovingEstimateSnapshot` (input + result + rates
version). Keep `SavedEstimate.service` for legacy. `mode: "moving"` still routes the tab.
Jobs created from a moving estimate must carry `crewSize` and the total exactly as today's path.

**Style**: shadcn/Radix primitives only, Tailwind v4 tokens from `index.css`, `--moss-deep`
accent for the selected/recommended state. Cut the whitespace: sections separated by a thin rule,
not by separate cards. Dark mode must keep working.

## Worked example (must reproduce in the tests)

Ee Ee Eng: `homeSize: "4br"`, `stories: 2`, `pickupFlights: 1`, `deliveryFlights: 0`,
`distanceMiles: 60`, `moveDate: "2026-09-21"` (→ weekday), `piano: "baby_grand"`,
`pianoStairLocations: 0`, `assemblyAddOns: [bed frame ×1 $175, desk ×1 $125]`,
`packing: { enabled: false }`, `playStructure: { enabled: false }`, `secondTruck: { requested: false }`,
`laborOnly: false`, `mode: "auto"`.

Expected: no package (4BR). Stairs add 0.5–0.75 hr. Piano $399, add-ons $300.

| crew     | rate | hours     | labor + trip        | total incl. piano + add-ons                       |
| -------- | ---- | --------- | ------------------- | ------------------------------------------------- |
| 2 movers | $109 | 8.5–10.75 | $1,011.50–$1,256.75 | $1,710.50–$1,955.75 — **ineligible** (over 8 hrs) |
| 3 movers | $159 | 6.5–8.75  | $1,118.50–$1,476.25 | $1,817.50–$2,175.25                               |
| 4 movers | $209 | 5.5–7.75  | $1,234.50–$1,704.75 | $1,933.50–$2,403.75 — **recommended**             |

Warnings: "60 miles — beyond the 50-mile service area, dispatch approval" (escalate) and the
extended-travel line +$150 is added automatically (51–75 mi tier); 4-mover
text carries the fallback sentence, and the "Recommend a walkthrough" banner shows.

**Same lead after the Sep 8 walkthrough** (light furniture, heavy loose contents: books, toys,
pantry, garage bins; no TVs; large wooden playset; one truck is enough):
`packing: { enabled: true, separateDay: true, packingDate: "2026-09-17", packers: 2, boxes: 100,
perBoxMaterials: 5 }`, `playStructure: { enabled: true, mode: "flat", price: 499 }`, no assembly
SKUs, `hoursOverride: { low: 6, high: 8 }` for 4 movers, `walkthroughDone: true`. Expected lines:

| Line                                    | Math                                            | Amount                  |
| --------------------------------------- | ----------------------------------------------- | ----------------------- |
| Packing labor, Thu 9/17 (weekday)       | 2 packers, ceil4(100 / 10) = 10 hrs → 10 × $109 | $1,090.00               |
| Packing materials                       | 100 × $5                                        | $500.00                 |
| Move day Mon 9/21, 4 movers + truck     | 6–8 hrs × $209 + $85 (internal)                 | $1,339.00–$1,757.00     |
| Extended travel, 58 mi (51–75 tier)     | flat                                            | $150.00                 |
| Baby grand, first floor                 | flat                                            | $399.00                 |
| Play structure disassemble + reassemble | flat                                            | $499.00                 |
| **Total**                               |                                                 | **$3,977.00–$4,395.00** |

(Abe's hand quote on Sep 7 was $2,421: it priced packing as a flat $350, omitted the $85 trip fee,
charged $0 for a second truck the walkthrough showed wasn't needed, and left out the playset.
The builder must not repeat any of that silently.) Customer text for the 4-mover option must
read like Abe's Sep 7 message: crew + truck, "$209/hr", the hour range, "roughly $X–$Y all-in",
"the baby grand is a separate flat rate of $399 added on top", "travel included, no hidden fees",
"estimate, not fixed", the fallback sentence.

## Constraints

- **pnpm only.** `pnpm check`, `pnpm test`, and `pnpm build` must pass before done.
- Do not touch `pricingCalculator.ts` (junk), the Assembly tab behavior, Vision, or
  `serviceCalculator.ts` beyond removing dead moving-only branches.
- Never read `businesses`, `thumbtack_tokens`, `hcp_links`, or `proxy_numbers` from the browser.
- `pricebook_items` is shared with the pipeline: every write is `tenant_id = 'progressive'`,
  ids and `external_id` preserved, no deletes of rows that carry an `external_id`.
- No Geocoding/Distance Matrix dependency for correctness — miles are manual; auto-fill is a
  best-effort nicety.
- Commit locally, do not push (main auto-deploys).
- Add a `DECISIONS.md` entry (moving pricing now v19, engine is input-driven, item picker retired
  for moving) and update the _Two pricing engines_ section of `CLAUDE.md` + `AGENTS.md`.

## Decisions from Abe (Sep 9) — build exactly this

1. **Second truck / two crews** is always a **manual line**: the owner enters the price per job
   (the Ee Ee Eng quote charged $0 extra for the second truck). Builder shows the switch + price
   input + a warning while the price is $0.
2. **Labor-only on weekends is $124/hr** (weekday $109). Weekend labor-only 2-hr min = $248.
3. **Packing is modeled, not a flat guess** (Sep 9, after the Ee Ee Eng walkthrough showed a flat
   $350 was far short): packers × hours × labor-only rate + boxes × per-box materials, default
   separate packing day. Rates/defaults in the table above.
4. **Walkthrough on big jobs.** The builder recommends one for 3BR+, packing, or specialty items,
   and carries the on-site checklist (UI section 8).
5. **Large play structures** are their own line (flat $499 default or hourly), never move-day hours.

## Still open (build with the default; flag in the summary)

6. **Assembly add-ons on a move** — price at SKU with no separate $125 minimum (same visit).
7. **Hours table defaults** and the packing defaults (10 boxes per packer-hour, $5 per box, $15
   per wardrobe box, $499 playset) and the extended-travel tiers — confirm or adjust before the
   first real quote.

## Files

**Create:** `client/src/data/movingRates.ts`, `client/src/types/moving.ts`,
`client/src/utils/movingCalculator.ts`, `client/src/utils/__tests__/movingCalculator.test.ts`,
`client/src/components/MovingEstimatePanel.tsx`,
`supabase/migrations/20260910000001_pricebook_v19_moving.sql`.

**Modify:** `client/src/pages/EstimateBuilder.tsx` (Moving tab → new panel, compact Job section,
filtered saved list), `client/src/types/pricing.ts` (`SavedEstimate.moving`),
`client/src/data/defaultPricebook.ts` (moving sections only), `client/src/utils/quotePdf.ts`
(if needed), `package.json` (`test` script), `CLAUDE.md`, `AGENTS.md`, `DECISIONS.md`.

**Do not modify:** junk/assembly/vision code paths, `pricingCalculator.ts`, `serviceCalculator.ts`
math, pipeline tables other than the progressive pricebook rows named above.

## Acceptance

- [ ] Pricebook page shows v19 moving prices for progressive; wellsentry rows untouched
      (`select count(*) from pricebook_items where tenant_id='wellsentry'` unchanged before/after)
- [ ] `dayTypeOf` marks Sep 1, 2, 29, 30 and Oct 1, 2, 30, 31 2026 as weekend; Wed Sep 16 weekday
- [ ] Worked example reproduces the table above (to the cent) and recommends 4 movers
- [ ] "1BR apartment, Tuesday" → package $525, 4 hrs included, $109/hr past that, 2 movers
- [ ] "2BR, Saturday" → package $850, 6 hrs, $124/hr overage, "3 movers"; 2-mover never shown in text
- [ ] "6 items, weekday, 10 mi" → Small Move $303 recommended, van flat not offered (not a single item)
- [ ] Labor-only 2 hrs weekday → $218, text says "no trip charge", never "travel included"
- [ ] Trip fee never appears in any customer text or PDF; appears in the internal breakdown
- [ ] Every 4-mover customer text contains the fallback sentence verbatim
- [ ] Safe / hot tub / >50 mi / 4-mover >8 hrs / unusual piano access each raise an escalate banner
- [ ] Office role sees totals but no cost/margin rows
- [ ] Legacy moving saves load without crashing; new saves round-trip through Save → Load
- [ ] `?clientId` pre-fill still works (name, pickup, delivery, date → dayType)
- [ ] Junk, Assembly, Vision tabs behave exactly as before
- [ ] `pnpm check`, `pnpm test`, `pnpm build` pass
