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

**Files it will touch**
- New migrations:
  - `companies`: owned by the app and agreed with Sol, not the pipeline's `businesses`.
  - `memberships`: user ↔ company ↔ role.
  - `tenant_id` on every core table, backfilled to `progressive`: jobs, clients, customers,
    saved_estimates, app_invoices, app_payments, app_settings, vehicles, facilities, the pricing
    tables, job_photos, job_time_events, dispatch_*, driver_*, staff.
  - Rewrite every hard-coded `'progressive'` rule, RPC and view to "this user's memberships".
- `client/src/lib/tenant.ts` and the storage modules that insert rows (`lib/dataStore.ts`,
  `lib/jobStorage.ts`, `lib/clientStorage.ts`, …).
- New test: `scripts/security/test-tenant-isolation.mjs`.
- **Pipeline repo `rejunk-webhook-services`:** every function that writes jobs, notifications or
  other shared rows.

**Done when**
- The isolation test creates Company B and a B user, then proves B sees zero Progressive rows
  and can't create, change or delete them.
- No live access rule still names `'progressive'`.
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
- Draft estimate. It uses the pure pricing engine in `client/src/utils/*`, never
  `server/officeQuote.ts`, which uses the admin key.
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

---

## Note for Sol (forwardable)

Sol: I'm planning the Rejunk AI connector (Claude/ChatGPT), and its first phases build the same
multi-company foundation your Stripe billing needs, so let's build it once together. The plan:

- One app-owned `companies` table, not the pipeline's `businesses`. A company row is also your
  billing customer.
- One `memberships` table (user ↔ company ↔ role).
- A `tenant_id` on every core table: jobs, clients, invoices, payments, settings, vehicles,
  photos, messaging and drivers.
- Database access rules driven by memberships instead of today's hard-coded "progressive".

Before that, office staff move to real Supabase email accounts (the PIN stays as an unlock). That
gives memberships a real user to point at.

Phase 1 touches the same tables you'll need. The `rejunk-webhook-services` pipeline also writes
jobs, so it has to ship its `tenant_id` change at the same time. Please let's agree on table and
column names (companies, memberships, roles, where the subscription status lives) before either
of us writes a migration.

Details: `PLAN-mcp-connector.md` and the 2026-10-05 entry in `DECISIONS.md`.
