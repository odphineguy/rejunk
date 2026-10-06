# PLAN — Rejunk MCP Connector (Claude + ChatGPT)

Written 2026-10-05. Sources: `docs/KICKOFF-mcp-connector.md`, the research report
(`docs/compass_artifact_wf-…_text_markdown.md`), and the 2026-10-05 entry in `DECISIONS.md`.

**Rule:** stop after each phase, show Abe, and wait for his approval before starting the next.

## Where the report is wrong for this codebase
- **Not Next.js.** Rejunk is Vite + Vercel functions in `api/`. The MCP server is a new Vercel
  function (`api/mcp.ts`), not a Next.js route.
- **No real Supabase users yet.** All 41 Supabase users are anonymous stand-ins tied to the
  email + PIN login. Supabase's OAuth server can only issue passes for real users, which is why
  Phase 1b exists.
- **`mcp-handler` fit is unconfirmed.** It is built mainly for Next.js-style routes. Check it in a
  plain Vercel function first. If it doesn't fit, use the official MCP TypeScript SDK's
  Streamable HTTP transport directly. The tools are the same either way.
- **The access rules aren't company-aware.** RLS is on everywhere, but company access is
  hard-coded to `progressive` (49 places across 7 migrations, plus `client/src/lib/tenant.ts`).

## Already done / not needed
- RLS is switched on for every table. **Done, but it has to be rewritten in Phase 1.**
- Next.js route setup: **not needed.**
- Desktop extension (.mcpb): **not needed.** It's for local servers only.

---

## Phase 1b — Real Supabase accounts for office staff *(runs first)*
**Goal:** office staff sign in with a real Supabase email account (the PIN stays as a quick
unlock), so there is a real user an AI pass can belong to.

**Files it will touch**
- New migration: links each `staff` row to an `auth.users` account.
- `server/staffAccess.ts`, `api/staff.ts`, `vite.config.ts` (the three copies of the office-login
  endpoint; keep them in sync).
- `client/src/lib/supabase.ts`, `lib/staffSession.ts`, `lib/staffApi.ts`,
  `hooks/useStaffSession.ts`, `pages/StaffLogin.tsx`.

**Done when**
- Abe and Sam sign in by email, then the PIN unlocks the app.
- In Supabase → Auth → Users, Abe and Sam show as real (not anonymous) users.
- Every office page still loads with the same data.
- Driver login is untouched.
- Anyone already signed in stays signed in until the planned cutover.

## Phase 1 — Companies, memberships, tenant_id, RLS, isolation test
**Goal:** every row belongs to a company, people belong to companies through memberships, and
the database itself prevents Company A from seeing Company B.

**Agreed schema (Abe + Sol, 2026-10-05 — see `DECISIONS.md`).** Claude builds this foundation;
Sol builds Stripe on top of it.
- `companies`: `id uuid` primary key, plus a unique `slug` (Progressive = `'progressive'`). Owned
  by the app, not the pipeline's `businesses`; keeps an explicit link to the matching pipeline
  `businesses` row.
- Billing columns live on the company row: `plan_tier`, `subscription_status`,
  `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`, `cancel_at_period_end`,
  `stripe_connect_account_id`. They mirror Stripe and are written **only** by verified
  server-side Stripe webhooks — column-protected, so an owner allowed to edit company details
  still can't touch them. Billing stays optional during the rollout so Progressive can't be
  locked out.
- `memberships`: `user_id`, `tenant_id`, `role` (`owner` / `office` / `crew`), unique on
  `(user_id, tenant_id)`. Nobody can promote a membership through a plain table update.
- Every `tenant_id` (including `memberships.tenant_id`) is a `uuid` referencing `companies.id`.
  Today's text `'progressive'` values need an explicit slug → uuid mapping and a coordinated
  backfill with the pipeline repo.
- **Drivers:** they stay on PIN, so membership rules can't simply replace the driver rules. Keep
  the verified driver-session and assigned-job checks, now scoped to the right company, until
  drivers have real accounts.

**Files it will touch**
- New migrations:
  - `companies` and `memberships` as above, with column protection on the billing fields.
  - `tenant_id` on every core table, backfilled to Progressive's company id: jobs, clients,
    customers, saved_estimates, app_invoices, app_payments, app_settings, vehicles, facilities,
    the pricing tables, job_photos, job_time_events, dispatch_*, driver_*, staff.
  - Rewrite every hard-coded `'progressive'` rule, RPC and view to "this user's memberships"
    (drivers: "this driver session's company").
- `client/src/lib/tenant.ts` and the storage modules that insert rows (`lib/dataStore.ts`,
  `lib/jobStorage.ts`, `lib/clientStorage.ts`, …).
- New test: `scripts/security/test-tenant-isolation.mjs`.
- **Pipeline repo `rejunk-webhook-services`:** every function that writes jobs, notifications or
  other shared rows.

**Done when**
- The isolation test creates Company B and a B user, then proves B sees zero Progressive rows
  and can't create, change or delete them.
- An owner can't edit billing columns or promote a membership; office and crew can't do either.
- Drivers still see only their assigned jobs, only in their own company.
- No live access rule still names `'progressive'`.
- **The uuid switch is LIVE (step 2, ship 3, 2026-10-06, migration `20261006200614`; undo in
  `supabase/undo/`).** All 30 text `tenant_id` columns are now company uuids linked to `companies`;
  `pipeline_tenant_keys()` hands out uuids; the 31 rules mean exactly what they did (Progressive's
  id instead of the word). The 'wellsentry' / 'unknown' / voice_calls / bookings defaults are gone
  (the pipeline stamps those).
- **DONE 2026-10-06 — Part B (ship 1 8168eec app deploy, ship 2 migration `20261006210248`, undo in
  `supabase/undo/`): every tenant_id default is now `app_private.require_company()` (signed-in office
  person's or driver's company, else the save fails); job-driven functions copy the job's company;
  website leads use `SITE_COMPANY_SLUG`.** Original requirement, for the record:
  **No column default names a company.** Progressive's uuid is still a temporary
  default on the 22 app tables from `20261005000003` plus `pricebook_items` /
  `pricebook_categories` / `app_employees` / `app_client_meta` / `customer_notifications`.
  Part B replaces every one with "the company of whoever is saving": the signed-in user's
  membership, or the driver session's company. Server and pipeline writes stamp the company
  explicitly — including the 4 DB functions that insert without it (`driver_update_job_status`,
  `driver_create_thread`, `owner_set_job_time`, `send_missed_start_reminders`), the staff/driver
  sign-in endpoints, and the pipeline's conditional `tenant_id` spreads on jobs / job_photos /
  app_settings / dispatch_*. If nobody can be identified, the save fails instead of landing in
  Progressive. (Abe, 2026-10-05; split out of ship 3 by Abe 2026-10-06.)
- **Known blockers for a second company (step 3/4):** `pricing_defaults` is a single row (id=1),
  and settings upsert on `key` alone. Website leads: `SITE_COMPANY_SLUG` is one setting per
  deployment; each tenant's own website will need its own value.
- **Pipeline one-off scripts use tenant keys too.** Done by Fable before the switch (pipeline
  d9e204e), along with `supabase/config.toml` now matching live verify_jwt for all 12 functions.
- **The pipeline repo stamps `tenant_id` on every row it writes, and both repos are deployed
  together.**
- Progressive's app looks and works exactly as before.

## Phase 2 — Supabase OAuth 2.1 Server + Rejunk consent page
**Goal:** Claude and ChatGPT can send a user to a Rejunk login and consent screen and get a
pass for that user.

**Files it will touch**
- Supabase dashboard:
  - Turn on the OAuth Server and DCR.
  - Allow these redirects: `https://claude.ai/api/mcp/auth_callback`,
    `https://chatgpt.com/connector_platform_oauth_redirect`, and localhost (Claude Code).
- New `client/src/pages/OAuthConsent.tsx`, plus its route in `client/src/App.tsx`.

**Done when** opening an authorize link shows the Rejunk login and then a Rejunk consent screen
("Claude wants to read jobs…"), and clicking Approve returns a code.

## Phase 3 — MCP server skeleton
**Goal:** a working MCP endpoint that checks the AI's pass and queries as that user.

**Files it will touch**
- `api/mcp.ts`.
- New `mcp/` folder: pass check, a Supabase client that acts as the logged-in user, and the tool
  list.
- `vercel.json`: serve `/.well-known/oauth-protected-resource`.
- An import guard script, run inside `pnpm check`. It fails if anything in `mcp/` imports
  `server/*` or reads `SUPABASE_SERVICE_ROLE_KEY`.
- `package.json`: the MCP dependencies.

**Done when**
- MCP Inspector connects.
- A call without a pass gets a 401 that points to the login.
- A pass from Phase 2 works and returns only Progressive rows.
- `pnpm check` fails if someone adds the admin key to `mcp/`.

## Phase 4 — Read tools
**Goal:** the AI can look things up safely.

**Tools**
- `rejunk_search_jobs`, `rejunk_get_job`
- `rejunk_search_clients`, `rejunk_get_client`
- `rejunk_list_estimates`, `rejunk_get_schedule`, `rejunk_get_business_settings`

Every tool has a title plus readOnlyHint / destructiveHint / openWorldHint. They return only
the fields needed, and office logins never see money (same rule as the app).

**Files it will touch:** `mcp/tools/read/*`.

**Done when**
- Every tool works in Inspector.
- An office login shows no dollar figures, and an owner login does.

## Phase 5 — Live test in Claude and ChatGPT
**Goal:** prove it works where customers will use it.

**Files it will touch:** none. This is setup in Abe's own Claude account and ChatGPT Developer
Mode. Confirm which ChatGPT plan allows custom MCP servers.

**Done when** Abe asks both AIs "what jobs do we have tomorrow?" and gets the right answer.

## Phase 6 — Write tools (preview → confirm)
**Goal:** the AI can make everyday changes, always showing a preview first.

**Tools**
- Draft estimate. **Needs a design decision first (Sol, 2026-10-05):** calling the pure pricing
  engine doesn't solve access to the private cost inputs it needs. Office estimates need an
  approved calculation step that keeps today's rule (office logins never see costs or margins)
  and never uses the admin key (`server/officeQuote.ts` does). Agree that step with Abe before
  building this tool.
- Create draft job, reschedule job, add job note.

**Files it will touch:** `mcp/tools/write/*`.

**Done when** every write asks for confirmation and the change shows up correctly in the app.

## Phase 7 — Cancel tool + AI audit log
**Goal:** allow `rejunk_cancel_job` (destructive, needs a reason) and record every AI action.
No deleting clients or estimates at launch.

**Files it will touch**
- New migration: an `mcp_audit_log` table.
- `mcp/tools/write/cancelJob.ts`.

**Done when** the audit log shows who did it, which AI, what changed, and when.

## Phase 8 — "Connect to AI" settings page
**Goal:** customers can connect and revoke Claude or ChatGPT themselves.

**Files it will touch:** `client/src/pages/settings/AiConnections.tsx`, plus its route and its
link in Settings.

**Done when** the page shows the server URL, the setup steps and the connected AI apps, and
clicking Revoke makes the AI's next call fail.

## Phase 9 — Legal, docs, demo company
**Goal:** meet both directories' requirements.

**Files it will touch**
- `/terms` and `/privacy` content: add AI access, storage and retention.
- A new public connector docs page.
- A demo company with sample data and no 2FA. This needs Phase 1.

**Done when** a reviewer can follow the docs in about 10 minutes using the demo login.

## Phase 10 — Submit
**Goal:** get listed.

Submit to the Claude Directory (claude.ai/directory/manage), then the ChatGPT Plugin Directory
(platform.openai.com). ChatGPT needs 5 positive and 3 negative test cases plus domain
verification.

**Done when** both submissions are accepted.

## Phase 11 — Later
MCP Apps widgets (schedule, estimate builder) and a Rejunk skills plugin.

---

## Known Issues (found in Step 1; out of scope for this plan)
- **Drivers see too much.** `get_driver_today` sends the customer's phone number and the
  office's internal notes to the driver app.
- **"I called dispatch" likely fails.** `driver_confirm_dispatch_called` still uses the old
  phase-1 permission check, which probably doesn't recognize today's driver logins.
- **Some chat updates are probably blocked.** The driver chat code updates `dispatch_threads`
  directly, and the database no longer lets drivers do that.
- **The issue report form is unused.** `reportJobIssue` isn't wired to any driver screen.
- **Not a bug:** `job_time_events` and `customer_notifications` have no browser access rules on
  purpose. They are server-only.
- **Leftover Discord code in the pipeline (cleanup later, found 2026-10-05).** We don't use
  Discord. `postDiscord()` is still in `thumbtack-webhook`, `thumbtack-responder` and
  `thumbtack-sweeper` (rejunk-webhook-services). No `DISCORD_WEBHOOK_URL` secret is set, so it
  does nothing today. Remove the code; don't touch it before then (Abe).

---

## Agreed with Sol (2026-10-05)

Sol answered the note above (now removed). Summary — full detail in `DECISIONS.md`:
- Table names and shape agreed (see Phase 1). Abe chose `uuid` ids + a `slug` over Sol's
  preferred text id.
- Billing state lives on the company row, written only by Stripe webhooks; billing stays
  optional during the rollout.
- Two different Stripe ids: `stripe_customer_id` (the company paying Rejunk) and
  `stripe_connect_account_id` (the company's own account that receives its customers'
  payments). Test and live data kept separate.
- Only `owner` can manage billing; every billing endpoint re-checks owner membership on the
  server. No billing or money tools in the connector.
- This foundation replaces the older `HCP_EXIT_PLAN.md` order (payments linked to the
  pipeline's `businesses.id`, payments before tenants). Billing now points at `companies.id`.
- Claude owns the company/membership foundation; Sol builds Stripe against it.
