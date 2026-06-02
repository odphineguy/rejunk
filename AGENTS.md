# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this app is

A junk-removal pricing and disposal-facility app for Arizona (despite the README, which is a generic
"static frontend template" — ignore that framing). It does two things:

1. **Facility map + list** (`/`) — shows Arizona disposal facilities (landfills, transfer stations,
   recycling centers, scrap yards, etc.) on a Google Map with a filterable sidebar.
2. **Estimate builder** (`/estimate-builder`) — computes a junk-removal quote from material type,
   vehicle, facility, load volume/weight, labor, fuel, and target margin. Pricing inputs are editable
   in **Pricing Settings** (`/settings`) and persisted to `localStorage`.

There is **no backend database or API**. The Express server (`server/index.ts`) only serves the static
build and proxies Google Maps. All app state lives in the browser (`localStorage`).

## Commands

```bash
pnpm dev        # Vite dev server on :3000 (--host); includes maps + storage proxies as Vite middleware
pnpm build      # vite build → dist/public, then esbuild bundles server/index.ts → dist/index.js
pnpm start      # NODE_ENV=production node dist/index.js (serves dist/public + maps proxy)
pnpm check      # tsc --noEmit — the only typecheck/lint gate; run this before considering work done
pnpm format     # prettier --write .
```

Use **pnpm** (not npm). There is **no test runner wired up** — `vitest` is a dependency but there are no
test files and no `test` script.

## Architecture

### The pricing engine is the core
`client/src/utils/pricingCalculator.ts` — `calculateEstimate()` is the single source of truth for quote
math. It takes an `EstimateCalculatorInput`, derives weight from volume × material density (or a manual
weight override), computes labor / disposal / fuel / vehicle / extra-fee costs, then sets the final quote
to the **max** of: margin-based quote, minimum-profit quote, volume benchmark, and minimum acceptable
price. It also emits `EstimateWarning[]` (e.g. payload exceeded, heavy material, facility rejects material,
stale facility verification). Heavy materials (concrete, tile, brick, dirt, rock, or density ≥ 700 lb/yd³)
deliberately ignore the volume benchmark so they aren't underpriced.

All domain types live in `client/src/types/pricing.ts` — read this first when touching pricing logic.

### Data flow / persistence
- **Seed data**: `client/src/data/defaultPricing.ts` (vehicles, material rules, volume benchmarks,
  defaults) and `client/src/data/facilities.ts` (the Arizona facility list + `facilityTypeColors` /
  `facilityTypeLabels` maps used by the map markers).
- **Persistence**: `client/src/utils/pricingStorage.ts` reads/writes two `localStorage` keys
  (`junk_estimator_pricing_settings_v1`, `junk_estimator_saved_estimates_v1`). `loadPricingSettings()`
  merges stored values over defaults so newly-added default fields survive. `savePricingSettings()`
  dispatches a `pricing-settings-updated` window event — components listen for it to stay in sync.
- There is a `Facility` type that extends `DisposalFacility` with legacy fields (`name`, `type`, `lat`,
  `lng`, `pricing`, `acceptance`) for backward compatibility — both shapes coexist.

### Routing & shell
`client/src/App.tsx` uses **wouter** (not react-router) for client-side routing. Three real routes:
`/` (Home), `/estimate-builder`, `/settings`; everything else → NotFound. Wrapped in `ErrorBoundary` →
`ThemeProvider` (default light theme) → `TooltipProvider` → `Toaster` (sonner).

### Google Maps
`client/src/components/Map.tsx` loads the Maps JS SDK. Two paths: if `VITE_GOOGLE_MAPS_API_KEY` is set it
loads directly from Google with that key; otherwise it loads via the **`/maps-proxy`** path, which injects
the server-side `GOOGLE_MAPS_API_KEY` so the key never reaches the client. The proxy exists in **two
places** that must stay in sync: as Vite middleware (`vitePluginMapsProxy` in `vite.config.ts`) for dev,
and as an Express route in `server/index.ts` for production. Markers are `AdvancedMarkerElement`s managed
imperatively via refs (Google owns re-rendering, not React) — see `Home.tsx`'s `handleMapReady`. The map
degrades gracefully to a list-only view if it can't load.

### Path aliases
`@/*` → `client/src/*`, `@shared/*` → `shared/*` (configured in both `tsconfig.json` and `vite.config.ts`).

## Conventions

- **UI**: shadcn/ui components live in `client/src/components/ui/*` (Radix-based). Compose Tailwind v4
  utilities; theming tokens are in `client/src/index.css`. Prefer existing primitives over new markup.
- **Forms**: react-hook-form + zod (`@hookform/resolvers`).
- The Estimate builder and Pricing Settings pages are large single-file pages (~800–900 lines each) that
  hold most of their own state — expect to scroll, not to chase many small files.

## Manus tooling (build environment)

This project was scaffolded by Manus. `vite.config.ts` adds dev-only middleware that writes browser logs
to `.manus-logs/` and proxies asset storage via `/manus-storage` (backed by `BUILT_IN_FORGE_API_*` env
vars). Per the README: **do not commit images/media into `client/public/` or `src/assets/`** — large local
media causes deploy timeouts; upload assets and reference them via `/manus-storage/...` paths instead.

## Environment variables

- `GOOGLE_MAPS_API_KEY` (server, preferred) or `VITE_GOOGLE_MAPS_API_KEY` (client) — Google Maps. Server
  key is safer; it's only used through the proxy.
- `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` — Manus asset storage proxy (dev only).
- `VITE_OAUTH_PORTAL_URL` / `VITE_APP_ID` — referenced by `client/src/const.ts` `getLoginUrl()`, but no
  auth flow is currently wired into the app.
