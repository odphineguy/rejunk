# Create Estimate From Lead — Spec

## Overview

Wire the currently-dead **"Create Estimate"** button on the Client-Details view so it navigates
to the Estimate Builder with the lead's info pre-filled; the user finishes the estimate manually.

Four connected changes:

1. **Capture real Moving fields on the landing form** — add "Moving from", "Moving into", and
   "Move date" inputs to the details step (Moving service only).
2. **Persist structured intake on the lead** — store service + addresses + date as fields, not
   free text.
3. **Wire the button** — Client-Details → `/estimate-builder?clientId=<id>`.
4. **Pre-fill the Estimate Builder** from the structured `intake`, with a legacy note-parse
   fallback for leads created before this change (e.g. Alexis Brush).

## Context — verified current state (Reality Principle)

Read before starting: `CLAUDE.md`, `DECISIONS.md`.

Confirmed against live code, not assumed:

- **The button is dead.** `client/src/pages/ClientsLeads.tsx` ~line 833, inside `ClientDetails({ clientId })`
  (defined line 697). The "Create Estimate" `<Button>` has **no `onClick`**. `Create Job` /
  `Create Invoice` beside it are also dead — out of scope, leave them.
- **`navigate` already in scope** in `ClientDetails`: `const [, navigate] = useLocation();`
  (ClientsLeads.tsx:698). Client loads via `getClient(clientId)` (line 700).
- **Client store API** (`client/src/lib/clientStorage.ts`): `getClient(id): ClientRecord | null`
  (line 98), `saveClient(...)` (line 102). Reuse these — don't invent getters.
- **Estimate Builder route** `/estimate-builder` (wouter), `StaffApp.tsx:61`. No param today.
- **Estimate Builder** (`client/src/pages/EstimateBuilder.tsx`) reads no query param / client id.
  State + setters (lines ~307–333): `mode` (`setMode`), `customerName` (`setCustomerName`),
  `jobAddress` = **pickup** (`setJobAddress`), `deliveryAddress` (`setDeliveryAddress`),
  `notes` (`setNotes`).
- **`EstimateMode`** (`client/src/types/service.ts:7`) = `"junk" | "service" | "moving" | "vision"`.
  "Assembly & Handyman" is mode **`service`**.
- **Landing form** (`client/src/pages/landing/EstimatePage.tsx`): the details step is a **single
  free-text box per service** ("What's the move?…") plus structured `zip`, `timing`, name, phone,
  email. Move addresses/date are **not** collected as fields. Payload (lines ~100–108) persists
  only `firstName, lastName, phone, email, zip, leadSource, contactLog[summary]`; `form.services`,
  `form.details`, `form.timing` are flattened into the note.
- **`ClientRecord`** (`client/src/types/clients.ts`): `firstName, lastName, email, phone,
  streetAddress, unit, city, state, zip, leadSource, tags, contactLog[]`. No service/move fields.
- Landing service keys are the strings `"Junk Removal"`, `"Moving"`, `"Assembly & Handyman"`.

## Phase 1 — Add Moving fields to the landing form

### `client/src/pages/landing/EstimatePage.tsx`
Extend the `form` state and the **details step** render:

- Add to `form`: `movingFrom: string`, `movingInto: string`, `moveDate: string` (all default `""`).
- In the details step, **when `form.services` includes `"Moving"`**, render three optional inputs
  below the existing free-text box:
  - "Moving from (pickup address)" → `form.movingFrom`
  - "Moving into (delivery address)" → `form.movingInto`
  - "Move date" → `form.moveDate` (plain text input; no date-picker dependency)
- These are **optional** and only shown for Moving. Junk/Assembly render unchanged (free-text box
  only). Keep the existing "What's the move?" box — it becomes `rawDetails`.

## Phase 2 — Persist structured intake on the lead

### `client/src/types/clients.ts`
Add an optional structured block to `ClientRecord`:

```ts
export interface LeadIntake {
  services?: string[];              // form.services, e.g. ["Moving"]
  primaryService?: string;          // form.services[0] — picks the Estimate Builder tab
  pickupAddress?: string;           // Moving: movingFrom
  deliveryAddress?: string;         // Moving: movingInto
  moveDate?: string;                // Moving: moveDate (free text)
  timing?: string;                  // form.timing ("Flexible" etc.)
  rawDetails?: string;              // the free-text "What's the move?" box
}
```
Add `intake?: LeadIntake;` to `ClientRecord`.

### `client/src/pages/landing/EstimatePage.tsx` (payload, lines ~100–108)
Keep writing the `contactLog` summary note exactly as today. **Also** populate `intake`:
- `services: form.services`
- `primaryService: form.services[0]`
- `pickupAddress: form.movingFrom || undefined`
- `deliveryAddress: form.movingInto || undefined`
- `moveDate: form.moveDate || undefined`
- `timing: form.timing`
- `rawDetails: form.details[primaryService]?.trim() || undefined`

Constraint: `intake` is additive/optional; leads without it must still work.

## Phase 3 — Wire the "Create Estimate" button

### `client/src/pages/ClientsLeads.tsx` (`ClientDetails`, ~line 833)
Add `onClick` to the "Create Estimate" `<Button>`:

```ts
onClick={() => navigate(`/estimate-builder?clientId=${client.id}`)}
```
Use the in-scope `navigate` (line 698) and loaded `client`. No other change here.

## Phase 4 — Pre-fill the Estimate Builder

### `client/src/pages/EstimateBuilder.tsx`
On mount, if `clientId` query param is present, load the client and pre-fill **once**, and only
when no saved-estimate seed is loading (don't clobber the SavedEstimate path).

1. Read the param (wouter): `import { useSearch } from "wouter";`
   `const clientId = new URLSearchParams(useSearch()).get("clientId");`
2. `useEffect` keyed on `clientId`, guarded by a `useRef` "hydrated" flag:
   - `const client = clientId ? getClient(clientId) : null;` (import `getClient` from
     `@/lib/clientStorage`). If null → return.
   - `setCustomerName(`${client.firstName} ${client.lastName}`.trim())`
   - **Mode** from `client.intake?.primaryService`, mapped:
     `"Junk Removal"→"junk"`, `"Moving"→"moving"`, `"Assembly & Handyman"→"service"`,
     none/unknown → leave default. Legacy leads (no `intake`): parse the note (helper below).
   - **Pickup** ← `intake.pickupAddress` → else note-parsed "Moving from:" → else `client.streetAddress`.
     `setJobAddress(...)` if any found.
   - **Delivery** (moving) ← `intake.deliveryAddress` → else note-parsed "Moving into:".
   - **Notes** ← join whatever's available: `intake.rawDetails`, `intake.moveDate` (prefix
     "Move date: "), and the full contact-log text. This guarantees the request details always
     land in Notes even if nothing else maps.

### Legacy note parser (fallback only, leads without `intake`)
Best-effort regex over contact-log note text; non-blocking, never throws:
- service = segment after `Website estimate request — ` up to first `.` → same mode table
- `Moving from:\s*(.+)` → pickup · `Moving into:\s*(.+)` → delivery · `Moving date:\s*(.+)` → Notes

## Constraints

- **No mileage auto-calc.** Even with both addresses, do **not** call Geocoding/Distance Matrix —
  Maps key is Maps-JS-only, returns `REQUEST_DENIED`. Leave `roundTripMiles` to the user.
- **Additive only.** `intake` optional; leads without it and the SavedEstimate load path keep working.
  Pre-fill must not run when loading a saved estimate.
- **Don't touch pricing** — `pricingCalculator.ts`, `serviceCalculator.ts`, pricebook, ops-rules,
  any quoting math. This feature only populates input fields.
- Reuse `getClient` / `saveClient`; no new persistence path. **pnpm only.**
- Run `pnpm check` and `pnpm build` before done.

## Files touched

**Modify:**
- `client/src/pages/landing/EstimatePage.tsx` — Moving fields + `intake` in payload
- `client/src/types/clients.ts` — `LeadIntake` + `intake?` on `ClientRecord`
- `client/src/pages/ClientsLeads.tsx` — `onClick` on Create Estimate (~line 833)
- `client/src/pages/EstimateBuilder.tsx` — query-param read + one-time hydration + legacy parser

**Do not modify:** pricing/quoting files, pricebook, ops-rules, InstantEstimatePage (vision),
Create Job / Create Invoice buttons.

## Acceptance criteria

- [ ] Landing Moving flow shows optional "Moving from / into / date" fields; Junk & Assembly unchanged
- [ ] New Moving lead persists `intake` with pickup, delivery, date, service, rawDetails
- [ ] Clicking "Create Estimate" navigates to `/estimate-builder?clientId=<id>`
- [ ] Estimate Builder pre-fills Customer name from the lead
- [ ] Correct tab auto-selects: Moving→moving, Junk Removal→junk, Assembly & Handyman→service
- [ ] For a new Moving lead, pickup + delivery pre-fill from `intake` with no parsing
- [ ] Notes always shows the request details (rawDetails / move date / contact-log text)
- [ ] Alexis Brush (legacy note-only) pre-fills name + notes, and pickup/delivery via the parser
      (Gilbert → Scottsdale)
- [ ] No Geocoding/Distance Matrix calls added
- [ ] Loading a saved estimate is unaffected (no clobbering)
- [ ] `pnpm check` passes and `pnpm build` succeeds
