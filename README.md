# reJunk

A junk-removal pricing and disposal-facility app for the Phoenix, Arizona area. Built to help quote
junk-removal and furniture-moving jobs accurately (and stop underpricing them).

## What it does

- **Facility map + list** (`/`) — Arizona disposal facilities (transfer stations, landfills, clean-fill
  recyclers, specialty sites) on a Google Map, with a filterable sidebar. Each facility card shows icons
  for the materials it accepts, so you can spot at a glance who takes concrete, tires, C&D, etc.
- **Estimate Builder** (`/estimate-builder`) — computes a quote from material type, vehicle, facility,
  load volume/weight, labor, fuel, and target margin. Always prices to the highest of several floors so
  jobs don't get underpriced; heavy materials use weight-aware pricing.
- **Pricing Settings** (`/settings`) — manage facilities, vehicles, material rules, and pricing defaults.
- **Dispatch Jobs** (`/jobs`, `/jobs/new`) — create structured jobs with stops, item checklists, crew
  assignment, vehicles, issue resolution, photos, and job-specific crew messaging.
- **Driver App** (`/driver`) — mobile-first assigned-job workflow with driver-safe data masking, status
  actions, photos, issues, messages, and the Haul or Call blocker flow.

## Stack

- **React 19 + Vite + TypeScript**, Tailwind v4, shadcn/ui, wouter (routing)
- **Supabase** (Postgres + Auth + RLS) — facilities, vehicles, material rules, defaults, saved estimates,
  jobs, driver operational tables, storage policies, and masked driver RPCs
- **Google Maps JavaScript API** for the facility map

## Local development

```bash
pnpm install
pnpm dev      # http://localhost:3000  (pinned to 3000 — the Maps key is authorized for that origin)
pnpm build    # production build → dist/public
pnpm check    # TypeScript typecheck
```

Create a `.env` from `.env.example`:

```bash
VITE_GOOGLE_MAPS_API_KEY=...   # browser-safe; restrict by HTTP referrer in Google Cloud
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...     # publishable key; protected by row-level security
```

## Database

Schema lives in [`supabase/migrations`](supabase/migrations); seed data in
[`supabase/seed.sql`](supabase/seed.sql).

Driver-facing job reads use masked RPC payloads so pricing, costs, margins, invoices, and payment details
remain dispatch-only.

## Deployment

Deploys to **Vercel** as a static SPA (see `vercel.json`). Set the three `VITE_*` env vars in the Vercel
project, and add the deployed domain to the Google Maps key's allowed referrers.
