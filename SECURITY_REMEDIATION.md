# Security remediation status

Updated September 9, 2026 (Phoenix). Live access to rejunk-prod was restored and the profile fix below was applied and
verified. Other entries distinguish repository changes from deployed verification.

| Original audit item | Repository status | Remaining work |
| --- | --- | --- |
| 1. Broad anonymous business-data access | Identity bridge and restrictive policies prepared and tested locally | Ordered production rollout below is pending |
| 2. Driver credentials and GPS | Credential fix already committed; own-session GPS and assigned-job access prepared | Deploy and verify the new identity policies |
| 3. Profile self-promotion | Applied and verified on rejunk-prod | End-to-end office/driver workflow checks remain |
| 4. Pipeline reads and tenant authorization | Staff/tenant checks and invoker view prepared | Ordered production rollout pending |
| 5. Vision abuse | Request authentication and server-owned settings added in `ee6ef3c` | Verify deployed behavior; process-local throttling remains a limitation |
| 6. Activation email relay | Staff gating and server-built links added in `3ae8e02` | Verify deployed behavior |
| 7. Office PIN lockout | Durable counter migration added in `4d5449c` | Verify live schema and deployed behavior |
| 8. Public internal photos | Private storage and signed links prepared | Deploy client before changing bucket visibility |
| 9. Dashboard resource exhaustion | Authorization and range bounds prepared | Deployment, durable request limits and timeout verification remain |
| 10. Fleet data in Git | Still open | Sanitize seed data; assess repository/history exposure separately |

## Item 3: applied fix

Migration: `supabase/migrations/20260910035327_lock_profile_privileges.sql`.

- Removes visitor profile mutation policies and both table/column write grants.
- Keeps signup profile creation in the trusted auth trigger, always as `crew`.
- Removes the first-signup-becomes-owner behavior.
- Rejects anonymous auth records in `is_manager()`, including previously promoted
  anonymous owners. No existing profile rows are edited or deleted.
- Preserves trusted service-role provisioning and active non-anonymous managers.

The current application does not query or mutate `profiles` from its browser code.
Office and driver logins use separate server-side tables and remain unchanged.
This patch does not make the other business-table policies safe.

## Verification and production handoff

Run `python3 scripts/security/test-profile-privileges.py` with local PostgreSQL
binaries on PATH. It creates a temporary cluster with no TCP listener, loads the
original schema, reproduces self-promotion, applies the migration twice, and checks
browser write denial, anonymous-manager denial, safe signup, trusted provisioning,
and inactive-manager denial. It stops and removes the cluster afterward. Passed.
`pnpm check` also passed.

Inspected live profile policies/grants, auth trigger, manager function and dependent
policies before application. All 30 profiles were anonymous (29 crew, one owner);
the first-signup owner rule can explain the latter, so this is not evidence of
compromise. There were two creator-owned saved estimates and no legacy customers.
The owner profile remains stored but no longer passes manager authorization.
Do not blindly apply all pending repository migrations; some historical driver
migrations are intentionally unapplied.

Applied only this migration through MCP, version `20260910035327`. Live checks
confirmed INSERT/UPDATE (including column grants), DELETE and TRUNCATE are false
for both browser roles and remain true for service_role. A transaction-local
authenticated-role check confirmed the existing anonymous owner fails is_manager().
Confirmed the new function definitions, enabled signup trigger, no remaining profile
write policies, and all 30 profile rows retained. Signup was verified locally;
end-to-end office/driver workflows were not exercised against production. Never run the destructive
fixture SQL from the isolated regression test against production.

Production database permissions are updated; no application deployment was needed.
The security advisor still flags broader anonymous access and the leads view; these
are separate open issues, not closed by this migration. See the
[Supabase RLS advisor](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins).
Highest next priority: identity-bound database access
for the remaining business tables and pipeline reads (items 1, 2, and 4).

## Prepared business-data lockdown (not deployed)

The next change implements items 1/4 and the remaining GPS part of item 2;
private job-photo access also addresses item 8. These migrations are **not yet
applied**. The live database still has the broad policies until phase 2 completes.

- `20260910040019_bind_business_identity.sql`: additive bridge. An authenticated
  transport session must present a real staff/driver token. A private binding
  resolves the current active staff session or driver token hash on every query.
  Expiry, logout, and revocation invalidate access without waiting for JWT expiry.
- `20260910040026_restrict_business_data.sql`: restrictive gates on existing
  public tables; shared tenant tables require `progressive`. Anonymous roles lose
  table privileges; browser TRUNCATE is revoked. The pipeline continues using its
  service-role access. Existing server-only tables remain server-only.
- Drivers receive only an explicit job-field whitelist for assigned jobs, never
  full job snapshots or pricing. New dispatch assignments store employee IDs.
  Old name assignments match only an exact, unique active driver name; empty or
  ambiguous assignments grant nothing. GPS writes must target the verified session.
- Messaging enforces membership and driver sender identity. Driver conversation
  creation runs in a narrow RPC; drivers cannot enroll themselves into arbitrary
  conversations. A trigger updates conversation timestamps after messages.
- `app_leads_v` uses invoker permissions. Dashboard wrappers verify office login,
  tenant, and a 1–90-day range. The private implementations are not browser-callable;
  the previously public maintenance RPC is revoked from browser roles.
- Job photos become private. Drivers can access only assigned-job paths; the app
  requests signed URLs with a 15-minute lifetime and refreshes open driver galleries.
- Driver startup no longer hydrates office caches. Driver job/operational caches
  are scoped to employee identity, and configured clients cannot fall back to the
  old unrestricted job cache. Separate office/driver transport storage keys are used.

### Checks completed

`python3 scripts/security/test-business-access.py` passed against a disposable
PostgreSQL 17 cluster using synthetic fixtures and the actual migration files.
It covers unauthenticated/unbound/forged identities, tenant isolation, staff reads
and writes, range limits, private photos, masked assigned jobs, other-driver GPS
and message spoofing, revocation/expiry, and service-role access. PostgreSQL 15+
is required for invoker views; set `PG_BIN` to its bin directory if needed.

`node scripts/security/test-business-session.mjs` passed: no guest auth signup,
verified database binding, concurrent initialization, logout, rejected binding
retries, and office/driver credential separation. `pnpm check` and `pnpm build`
passed. These checks do not claim a deployed browser/Realtime acceptance test.

Live read-only inspection confirmed PostgreSQL 17.6, pgcrypto in `extensions`,
no existing `app_private` schema, two owner logins, no activated drivers, seven
jobs with one legacy name assignment, and no employee-ID assignments yet.

### Required rollout order

1. Apply **only** `bind_business_identity` to rejunk-prod. Keep the existing
   restrictions unchanged at this stage. Verify the bridge functions and grants.
2. Push this application commit (requires explicit push authorization under
   AGENTS.md) and wait for its Vercel deployment. Reload the office app and verify
   its session binds successfully and the dashboard/jobs/clients load.
3. Apply **only** `restrict_business_data`. Do not run a blanket `db push`:
   historical driver migrations remain intentionally unapplied.
4. Verify an unbound anonymous session cannot see or mutate business data; verify
   a legitimate office session can. Check dashboard, clients, estimates, and
   photo links, then test an activated driver’s jobs/messages/GPS with test data.
   Check Realtime delivery for authorized viewers and denial for an unbound viewer.
5. Record both live migration versions and verification results here. Old browser
   tabs must reload: their old transport sessions deliberately have no binding.

If the app deployment fails before step 3, keep the additive bridge and fix the
app; the restrictions have not yet changed. After step 3, fix forward with the
identity-aware client. Do not roll back by reopening anonymous access. Take a
schema snapshot before step 3 if an operational rollback is required.

### Still outside this change

The complete security audit remains open. Office-versus-owner field-level money
visibility still needs server enforcement beyond this anonymous-access work.
Durable rate limits for reporting/AI, proof of query-timeout enforcement, old
sensitive fleet values in Git history, and prior exposure remain separate work.
Signed photo URLs remain usable until their 15-minute expiry. Offline caches on
an already-used device are not encrypted; this change prevents new unauthorized
server reads, not extraction from a previously authorized device. Several older
optional driver operational tables/RPCs still are not deployed; this change does
not pretend those pre-existing features are now fully synchronized.
