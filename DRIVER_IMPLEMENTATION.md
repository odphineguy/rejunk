# Driver Phase 1 Implementation Plan

## Product Boundary

The driver app is a separate mobile-first experience under `/driver`. It does not render the desktop operations shell and does not show pricing, quotes, costs, profit, margin, payment, invoice, or discount data.

Dispatch remains the financial and administrative experience. Driver work is represented through operational entities attached to existing jobs.

## Phase 1 Scope

- Driver session foundation using employee/driver identity, with Supabase `employee_profiles` prepared for real auth.
- Driver Today screen for assigned jobs.
- Driver job detail screen with stops, items, instructions, status updates, photos, issues, messages, and activity.
- Operational Supabase tables for assignments, stops, items, activity, photos, messages, issues, and future location snapshots.
- Driver-safe data access path through `get_driver_today()` so driver reads are masked at the database boundary.
- Dispatch JobDetail and Jobs board visibility into driver submissions.
- Local storage fallback and last-sync/offline indicators.

## Security Decisions

- Drivers should not query the raw `jobs` table because `jobs.data` contains financial fields.
- New RLS policies limit direct job snapshot access to admin/dispatcher roles.
- Drivers read masked job payloads and operational rows only for assigned jobs.
- Driver writes are limited to operational status, stops/items completion, photos, messages, and issues.
- Supabase Storage policies scope job photo access to dispatch or assigned crew.

## Saguaro Patterns Used

- Mobile task card hierarchy.
- Fast primary actions and large touch targets.
- Job-bound messages instead of company-wide chat.
- Offline-aware Today cache and last sync display.
- Structured issue reporting inspired by Saguaro incident flows, without adopting full incident complexity.

## Validation Plan

- Run `pnpm check`.
- Run `pnpm build`.
- Manually verify `/driver`, `/driver/jobs/:jobId`, `/jobs`, and `/jobs/:jobId`.
- Confirm driver pages do not render financial fields.
- Confirm dispatch pages retain financial visibility.
