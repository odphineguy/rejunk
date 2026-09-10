# Security remediation status

Updated September 9, 2026 (Phoenix). Live access to rejunk-prod was restored and the profile fix below was applied and
verified. Other entries distinguish repository changes from deployed verification.

| Original audit item | Repository status | Remaining work |
| --- | --- | --- |
| 1. Broad anonymous business-data access | Partially addressed by `ab1a423`: four pipeline write policies removed | Bind office/driver identities to database permissions; replace remaining broad policies without breaking operations |
| 2. Driver credentials and GPS | Credential handling moved server-side in `3ae8e02` | GPS/workday writes and operational data still need identity-bound authorization |
| 3. Profile self-promotion | Applied and verified on rejunk-prod | End-to-end office/driver workflow checks remain |
| 4. Pipeline reads and tenant authorization | Still open | Enforce verified staff identity and tenant on reads and dashboard RPCs |
| 5. Vision abuse | Request authentication and server-owned settings added in `ee6ef3c` | Verify deployed behavior; process-local throttling remains a limitation |
| 6. Activation email relay | Staff gating and server-built links added in `3ae8e02` | Verify deployed behavior |
| 7. Office PIN lockout | Durable counter migration added in `4d5449c` | Verify live schema and deployed behavior |
| 8. Public internal photos | Still open | Private storage plus authorized reads/uploads |
| 9. Dashboard resource exhaustion | Still open | Bound date ranges, authorize calls, add request limits and query timeout |
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
