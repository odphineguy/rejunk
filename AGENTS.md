# AGENTS.md

This file provides guidance to Codex (and other coding agents) when working with code in this repository.

## What this app is

A junk-removal **pricing + operations** app for a Phoenix, Arizona junk/moving/handyman business
(despite the root `README` history calling it a "static template" — ignore that). It started as a
facility map + quote calculator and has grown into a small operations platform. Today it has two jobs:

1. **Quote accurately** so jobs aren't underpriced. Two pricing engines (junk-by-volume and
   service-by-Pricebook) feed the **Estimate Builder** (`/estimate-builder`).
2. **Run the operations** around those quotes — jobs, dispatch, schedule, clients, invoices, payments,
   messages, employees, and a separate mobile **driver app** (`/driver`).

It is built for **Sam**, a 17-year junk-removal operator who is **not a developer** — when explaining
work, use plain language. The guiding pricing principle is **bias toward the floor**: never underprice.
See `DECISIONS.md` (the *why* behind major choices, newest on top) before relitigating settled questions,
and `rejunk-pricebook-v4.md` + `rejunk-operations-rules-v1.md` for the authoritative pricing/ops rules.

## Commands

```bash
pnpm dev        # Vite dev server on :3000 (strictPort — MUST stay on 3000; Maps key is referrer-locked to it)
pnpm build      # vite build → dist/public, then esbuild bundles server/index.ts → dist/index.js
pnpm start      # NODE_ENV=production node dist/index.js (legacy Express path; see Deployment)
pnpm check      # tsc --noEmit — the ONLY typecheck/lint gate; run before considering work done
pnpm format     # prettier --write .
```

Use **pnpm** (not npm). There is **no test runner wired up** — `vitest` is a dependency but there are no
test files and no `test` script. `pnpm check` is the gate.

> Installing deps on this external volume may need `--store-dir /Users/abemacmini/Library/pnpm/store/v10`
> due to a pnpm store-location mismatch.

## Architecture

### Two pricing engines, one Estimate Builder
The Estimate Builder switches on `EstimateMode = "junk" | "service"` (`client/src/types/service.ts`).

- **Junk mode** → `client/src/utils/pricingCalculator.ts` `calculateEstimate()` is the single source of
  truth for volume/weight quote math. It derives weight from volume × material density (or a manual
  override), computes labor / disposal / fuel / vehicle / extra-fee costs, then sets the quote to the
  **max** of margin-based, minimum-profit, volume-benchmark, and minimum-acceptable price. It emits
  `EstimateWarning[]` (payload exceeded, heavy material, facility rejects material, stale verification).
  Heavy materials (concrete/tile/brick/dirt/rock, density ≥ 700 lb/yd³) deliberately ignore the volume
  benchmark so they aren't underpriced. Domain types: `client/src/types/pricing.ts` — read first.
- **Service mode** → `client/src/utils/serviceCalculator.ts` prices flat-rate assembly/handyman/moving
  work off the **Pricebook** with hard floors ($125 single-worker minimum, $199 two-worker, stair
  surcharges). Types: `client/src/types/service.ts`. Pricebook data: `client/src/types/pricebook.ts`,
  `client/src/data/defaultPricebook.ts`.

`recommendations.ts` and `distanceRouting.ts` (under `utils/`) add facility/vehicle recommendation and
distance logic that feed the builder.

### Persistence: Supabase-backed, localStorage as warm cache  ← the big change
This is **NOT** a localStorage-only app anymore. Backend is **Supabase** (Postgres + Auth + RLS), project
ref `nglmgglrexxumjndhyzo`. There is **no Express/REST API** — the browser talks to the DB directly,
guarded by row-level security. Two distinct persistence patterns coexist:

1. **Supabase-backed modules** (the important data): `utils/pricingStorage.ts`, `lib/jobStorage.ts`,
   `lib/pricebookStorage.ts`, `lib/clientStorage.ts`, `lib/dispatchOperations.ts`, `lib/driverStorage.ts`,
   all going through `lib/dataStore.ts` (row ↔ type mapping) + `lib/supabase.ts`. The pattern:
   - **Hydrate at startup**: `main.tsx` awaits `hydratePricingData()` + `hydrateJobs()` +
     `hydratePricebook()` + `hydrateClients()` in a `Promise.race` against a **2.5s timeout** before first render. A slow/
     unreachable backend can't block the UI — it falls back to the localStorage cache and finishes
     hydrating in the background.
   - **Read synchronously** from an in-memory cache (pages use `useState` initializers).
   - **Writes are fire-and-forget**: update the cache + localStorage immediately, push to Supabase in the
     background, then dispatch a `*-updated` window event so other components re-render.
   - localStorage (keys `junk_estimator_*`) is now only a **warm cache / offline fallback**, plus a
     one-time demo-seed promotion into an empty DB (e.g. `hydrateJobs`).
2. **localStorage-only modules** (newer ops features, not yet on Supabase):
   `employeeStorage.ts`, `eventStorage.ts`, `invoiceStorage.ts`, `paymentStorage.ts`.
   Same `*-updated` window-event convention, but no remote sync.
3. **Supabase-first with offline outbox**: `lib/dispatchMessageStorage.ts` (driver ↔ dispatch messaging,
   keys `rejunk_dispatch_*_v1`) — cache-first writes, an outbox retries sends made while offline, and
   **Supabase Realtime** pushes live inserts. Event: `dispatch-messages-updated`.

**Cross-component sync is via window events**, not a store: `pricing-settings-updated`, `jobs-updated`,
`pricebook-updated`, `clients-updated`, `invoices-updated`, `payments-updated`,
`dispatch-messages-updated`, `employees-updated`, `events-updated`, `driver-data-updated`. A page that
reads cached data must also `addEventListener` for its event to stay in sync after background hydration
lands.

Seed data still lives in `client/src/data/` (`defaultPricing.ts`, `defaultPricebook.ts`, `defaultJobs.ts`,
`facilities.ts`). `facilities.ts` is now only the **seed/offline fallback** — the live facility list (map,
settings, estimator) is the Supabase-backed `loadPricingSettings().disposalFacilities`. The `Facility`
type extends `DisposalFacility` with legacy display fields (`name`, `type`, `lat`, `lng`, …) for
back-compat; both shapes coexist.

### Auth
There is **no login UI**. `lib/supabase.ts` `ensureSession()` does **transparent anonymous sign-in** so
every visitor gets an `authenticated` session for RLS. This **requires the Anonymous provider to be
enabled** in the Supabase dashboard (Auth → Providers); if it's off, the app silently falls back to
local-only mode. `supabase` is `null` when env vars are absent, and callers treat null as "not configured".

### Driver activation & live GPS
Drivers (not managers) have an app-level identity layered on top of the anonymous session. A manager
activates an employee from `/employees` ("Mobile App" column / "App Access" card): `lib/driverActivation.ts`
creates a `driver_activations` row (key `XXXX-XXXX-XXXX`, 72h expiry) and `POST /api/driver/activate`
emails it via Resend (`server/driverEmail.ts`, shared by the Express route `server/routes/driverActivation.ts`,
a Vite dev middleware in `vite.config.ts`, and the Vercel function `api/driver/activate.ts` — three places,
keep in sync like the maps proxy). The driver enters the key at `/driver/activate`, sets a 4-digit PIN, and
gets a `driver_sessions` token stored under `rejunk_driver_session`; returning drivers re-auth PIN-only at
`/driver/login` (5 misses → 15-min lockout). All other `/driver` routes are wrapped in `DriverSessionGate`.
Key/PIN validation runs **in the browser directly against Supabase** (`lib/driverSession.ts`; PBKDF2-SHA256
hashes interchangeable with the Express endpoints). Activated drivers report GPS every 30s
(`lib/driverLocation.ts`) into `driver_sessions` + `driver_location_history`; Dispatch Center's
"Show drivers" toggle fetches sessions and subscribes to **Supabase Realtime** on `driver_sessions`,
rendering profile-colored markers (helpers in `Map.tsx`). Subcontractors never get activation ("SMS only").
RLS exposes only the last 24h of location history; dispatch treats >5 min of silence as offline.

### Driver UX: simplified status flow, workday toggles, profile
The driver job page (`pages/driver/DriverJobDetail.tsx`) is deliberately simple: a status strip with one
linear flow — assigned → en_route ("On My Way") → in_progress ("Start My Time") ⇄ paused → completed.
`paused` is a real `DriverJobStatus`; the richer intermediate statuses (`loaded`, `en_route_to_disposal`,
`dumping`, …) remain in the type for dispatch-side use but the driver UI never offers them. There is no
issue-report form and no activity feed on the driver side — problems go through messaging (the job
thread), and a blocking issue still freezes the strip until dispatch releases the driver. Disposal shows a
facility short-code + waste-stream code with a "Change facility" picker (`updateDisposalEventFacility`).
DriverHome has **Meal Break** / **Vehicle Downtime** toggles (per-driver / per-vehicle, NOT per-job)
stored on `driver_sessions` (workday helpers in `lib/driverStorage.ts`, event `driver-workday-updated`);
the dispatch map overlays 🍔 / 🔧 on driver markers and the Drivers panel shows elapsed time.
`/driver/profile` (`DriverProfile.tsx`) handles PIN change (`updateDriverPin` in `driverSession.ts`) and
sign-out; the bottom nav is the shared `components/DriverBottomNav.tsx`.

### Driver ↔ dispatch messaging
`/messages` (dispatch console) and `/driver/messages` (driver app) are a live internal chat replacing the
team's group text — **not customer SMS** (the old A2P 10DLC customer-messaging page was deleted). Three
thread types in `dispatch_threads` (+ `dispatch_thread_participants`, `dispatch_messages`; migration
`202606090002`, applied live): **job** (auto-created the first time a driver messages from
DriverJobDetail; `sendJobMessage` in `driverStorage.ts` mirrors into the thread AND the activity log —
intentional), **direct** (1:1 dispatch ↔ driver, deduped per driver), **broadcast** (all active field
techs). Dispatch sends as the Owner/Manager employee but always displays as "Dispatch". Unread counts =
messages newer than the viewer's `last_read_at` participant row; badges on the sidebar Messages item and
the driver bottom nav. All of it flows through `lib/dispatchMessageStorage.ts` (Realtime subscriptions,
offline outbox). Employees still live only in localStorage, so participant/sender ids are plain-text
employee record ids.

### Routing & shell
`client/src/App.tsx` uses **wouter** (not react-router). Two route trees keyed on the URL:

- **Main app** — wrapped in `<AppShell>` (`components/OperationsShell.tsx`, a left-sidebar shell grouped
  Workspace / Operations / Admin): `/` = **Dashboard**, `/map` = facility map (`Home.tsx`),
  `/estimate-builder`, `/jobs` (+ `/jobs/new`, `/jobs/:id`), `/dispatch`, `/schedule`, `/messages`,
  `/clients`, `/employees`, `/invoices`, `/payments`, `/pricebook`, `/events`, `/settings`.
- **Driver app** — any `/driver` or `/driver/*` route renders `<DriverRouter>` (no AppShell): a
  mobile-first, assigned-job workflow. Driver job reads go through **masked Supabase RPCs**
  (`get_driver_today`, `driver_update_job_status`, `driver_confirm_dispatch_called`, …) so pricing, cost,
  margin, invoice, and payment data **never reach the driver client**. See `lib/driverStorage.ts`.

Everything is wrapped `ErrorBoundary` → `ThemeProvider` (default light) → `TooltipProvider` → `Toaster`.

### Google Maps
`client/src/components/Map.tsx` loads the Maps JS SDK. If `VITE_GOOGLE_MAPS_API_KEY` is set it loads
directly from Google; otherwise via the **`/maps-proxy`** path (injects the server-side
`GOOGLE_MAPS_API_KEY` so it never reaches the client). The proxy exists in **two places that must stay in
sync**: Vite middleware (`vitePluginMapsProxy` in `vite.config.ts`) for dev, and an Express route in
`server/index.ts` for prod. Markers are `AdvancedMarkerElement`s managed imperatively via refs (Google
owns re-rendering) — `Home.tsx` rebuilds them in a `useEffect([map, facilities])`. The map degrades to a
list-only view if it can't load. **The Maps key is HTTP-referrer-locked** (localhost:3000 + the Vercel
domain) and restricted to *Maps JavaScript API only* — hence `strictPort` on 3000, and why Geocoding/
Distance Matrix calls return `REQUEST_DENIED` until enabled on the key.

### Path aliases
`@/*` → `client/src/*`, `@shared/*` → `shared/*` (in both `tsconfig.json` and `vite.config.ts`).

## Database / migrations

Schema + RLS live in `supabase/migrations/` (run in order); seed in `supabase/seed.sql`. `0001_init` set
up profiles (role: owner/admin/estimator/crew), config tables (facilities, vehicles,
material_pricing_rules, volume_benchmarks, pricing_defaults), and ops tables (customers, saved_estimates,
jobs). `0003` relaxed config writes to any authenticated user; `0004` reworked the jobs snapshot; `0006`
added the pricebook tables; `0007` added the `clients` table (snapshot pattern, carries the contact log).

⚠️ **The `202606070001`–`202606070003` driver/dispatch migrations are on disk but NOT applied to the live
DB.** Driver tables (`job_stops`, `job_items`, `job_messages`, `job_issues`, `job_photos`, disposal
events) and their RPCs exist only as files. **Do not blindly regenerate `client/src/types/database.types.ts`
from the live DB** — it would drop the driver types the code imports. Generated types are hand-maintained
to include them.

`202606090001_driver_activation_live_map.sql` (driver activation + live GPS tables) **IS applied to the
live DB** (2026-06-09). It is standalone/additive — no dependency on the phase-1/2 driver migrations — and
also added `driver_sessions` to the `supabase_realtime` publication.

`202606090002_dispatch_messages.sql` (driver ↔ dispatch messaging: `dispatch_threads`,
`dispatch_thread_participants`, `dispatch_messages`) **IS applied to the live DB** (2026-06-09). Also
standalone/additive; adds `dispatch_threads` + `dispatch_messages` to the `supabase_realtime` publication.

`202606090003_driver_workday_status.sql` (meal break + vehicle downtime columns on `driver_sessions`)
**IS applied to the live DB** (2026-06-09). Additive only; the new `paused` job status needed no DB change
because `jobs.status` is unconstrained text.

`202606100002_job_photos_storage.sql` (driver photo uploads: `job-photos` storage bucket + `job_photos`
table) **IS applied to the live DB** (2026-06-10). Standalone/additive — extracted from the unapplied
phase-1 driver migration with deliberate differences: no FKs to the not-live `job_stops`/
`employee_profiles`, RLS relaxed to any `authenticated` user (matches the anonymous-session model), and
the bucket is **public-read** because `uploadJobPhoto` renders via `getPublicUrl`. No delete policy on the
bucket — photos can't be deleted from the client. Phase 1 uses `if not exists`/`on conflict`, so applying
it later won't conflict.

## Deployment

Production is a **static SPA on Vercel** (`vercel.json`: build `vite build`, output `dist/public`, SPA
rewrite). The browser loads Google directly via `VITE_GOOGLE_MAPS_API_KEY` and talks to Supabase directly.
The Express server (`server/index.ts`, `pnpm start`) is the **legacy/local path** — it still gets built and
serves `dist/public` + the maps proxy, but the live site does not use it. After deploy, the Vercel domain
must be added to the Google key's referrer allowlist. Live URL: **https://rejunk.vercel.app**.

> Working convention: **commit locally, push only on explicit request** — `main` auto-deploys to the live
> site. Live and local currently **share one Supabase DB** (no prod/test split yet).

## Conventions

- **UI**: shadcn/ui (Radix) primitives in `client/src/components/ui/*`; compose Tailwind v4 utilities;
  theme tokens in `client/src/index.css`. Prefer existing primitives over new markup.
- **Forms**: react-hook-form + zod (`@hookform/resolvers`).
- **Large pages**: Estimate Builder, Pricing Settings, and most operations pages are big single-file pages
  that hold their own state — expect to scroll, not to chase many small files.
- **Money formatting**: `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`.

## Manus tooling (build environment)

Scaffolded by Manus. `vite.config.ts` adds dev-only middleware that writes browser logs to `.manus-logs/`
and proxies asset storage via `/manus-storage` (backed by `BUILT_IN_FORGE_API_*`). **Do not commit
images/media into `client/public/` or `src/assets/`** — large local media causes deploy timeouts; upload
assets and reference them via `/manus-storage/...` paths. (Small SVGs/icons in `client/public/icons/` are
the existing exception.)

## Environment variables

- `VITE_GOOGLE_MAPS_API_KEY` (client) or `GOOGLE_MAPS_API_KEY` (server, used only by the maps proxy).
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase client (anon key is publishable; protected by
  RLS). Without these, the app runs local-only.
- `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` — Manus asset storage proxy (dev only).
- `VITE_OAUTH_PORTAL_URL` / `VITE_APP_ID` — referenced by `client/src/const.ts` `getLoginUrl()`, but no
  auth flow uses them.

## Notes for agents

- **This file is a near-identical copy of `CLAUDE.md` (the Claude Code version).** Keep the two in sync
  when you change architecture-level guidance in either.
- Reference docs worth reading before non-trivial work: `DECISIONS.md` (decision trail + rejected
  alternatives), `rejunk-pricebook-v4.md` and `rejunk-operations-rules-v1.md` (pricing/ops source of
  truth), and the `DRIVER_*` / `DISPATCH_*` / `HAUL_OR_CALL_WORKFLOW.md` notes for those features.
