# Owner-only financial access

Status: deployed. Additive migration `20260910060045` and enforcement migration
`20260910060647` are applied to rejunk-prod. App commit `2f9a041` is live
on rejunk.vercel.app (Vercel deployment `dpl_5dedhtSs3HfFwfkWyDnERYujZg4f`).

Office staff retain customer quote/invoice totals and operational job/customer data.
Owners alone can retrieve structured costs, profit/margin calculations, payment
records, raw financial settings, lead acquisition costs and financial report fields.
The database resolves the current staff role from the verified session binding;
changing a browser role value cannot grant owner access.

## Implementation

- `business_rows` returns explicit office projections and full owner rows.
  Raw financial tables require the owner role after the enforcement migration.
  Leads and conversation reads use bounded resource choices and tenant filters.
- Office job/estimate writes use dedicated RPCs, row locks and field allowlists.
  They merge operational edits into the original snapshot, retaining protected
  costs and payment fields. Customer prices remain editable.
- Office junk quotes use `/api/quote`, the existing pricing engine and trusted
  database configuration. The browser receives a customer quote, safety warnings
  and a reference to a private financial snapshot. The server keeps the costs for
  the saved estimate and its resulting job. Service estimates calculate private
  costs from the stored pricebook when first saved.
- The office estimator provides junk, service, moving and photo quote modes.
  Cost-based junk quotes use a server calculation form with explicit volume,
  workers, hours and round-trip mileage. Owners retain the full existing estimator.
- `api/quote.js` is generated from `server/officeQuote.ts` and the shared pricing
  engine by `pnpm build:quote-api`. Both local and Vercel builds regenerate it.
  Do not hand-edit the generated handler.
- Dashboard responses omit owner financial fields for office sessions.
  Receipt metadata and receipt storage files are denied to office accounts too.
- Payments now use owner-only `app_payments`. A signed-in owner imports explicitly
  saved legacy browser records once; demo fallback rows are never imported.
  The old copy is removed only after the database import succeeds.
- Server-backed jobs, estimates, pricing, pricebook and leads snapshots now stay
  in memory instead of persistent browser storage. Account changes reset them;
  late responses from a previous login are discarded. Local-only invoices and
  employee records are preserved.

## Verification

Passed:
- `python3 scripts/security/test-owner-financial-access.py`: disposable PostgreSQL
  tests for office versus owner reads, forged/expired roles, raw-table bypasses,
  safe writes, receipt files, private quote snapshots, payment permissions,
  role demotion, and service-role access.
- `node scripts/security/test-office-quote.mjs`: server-owned settings, private
  output fields, invalid inputs and revoked/expired login checks.
- Existing business-access and session regression suites.
- `pnpm check` and `pnpm build`.
- Mocked browser checks at desktop and 390px mobile: office junk quote calculation,
  job price visibility, hidden financial panels and removal of legacy owner job
  caches. Test file: `scripts/security/check-office-browser.js`, run with
  Playwright CLI `run-code --filename`. All external calls are intercepted;
  no production accounts or business records are created by this browser test.

### Live verification

Transaction-local role tests passed after enforcement; all temporary identity and
role changes were rolled back. Owner access returned all 7 jobs and financial
report fields. Office direct reads returned zero raw jobs, pricebook rows and
leads; the safe APIs returned all 7 jobs and 409 lead/client rows, with customer
prices present and protected job fields absent. Office reports and daily series
omitted revenue, collected and average job size while retaining operational KPIs.
Office payment insertion was denied; service-role job access remained intact.
The deployed quote endpoint rejects an unauthenticated POST with HTTP 401.

A real office-account workflow and owner reload remain user acceptance checks.
The advisor still reports broader pre-existing issues; the new private quote
table intentionally has RLS with no browser policies.

## Rollout (completed through step 4)

1. Apply only `owner_financial_access` (additive RPCs/private quote and payment storage).
2. Push the app and confirm the exact Vercel deployment is ready.
3. Apply only `enforce_owner_financial_access`.
4. Verify live transaction-local office/owner permissions and service-role access.
5. Reload app tabs. Confirm normal owner access and the next real office workflow.

Do not blanket-push historical migrations or restore broad anonymous access.

## Boundaries

Customer totals remain visible by design; staff can add those totals themselves.
This protects dedicated financial records and reports, not arithmetic on permitted
customer prices or money a user deliberately types into shared notes/messages.
Previously downloaded/exported data cannot be revoked. Older local-only driver
operational caches and attachments may retain historical receipt/cost information;
this change does not erase those unsynchronized operational records. Already
issued photo links can last until their 15-minute expiry.

The broader audit remains open, including durable rate limits, timeout enforcement,
fleet-data history cleanup and live driver/Realtime acceptance.
