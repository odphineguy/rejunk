# Persistent abuse limits

Database migration `20260914100450_persistent_abuse_limits.sql` is applied to
rejunk-prod. App commit c49ad46 is deployed; Vercel deployment
`dpl_K8ZZKN6U9f4xDUVhGYMQYWrB3w11` is READY with the production aliases.

## Allowances

All windows are rolling, not reset at a fixed clock boundary.

| Operation | Allowance |
| --- | --- |
| Public AI analysis | 20 per IP per 5 minutes |
| Public AI analysis, all IPs combined | 200 per 24 hours |
| Office AI analysis | 60 per verified staff account per 5 minutes |
| Office AI analysis daily | 500 per verified staff account per 24 hours |
| Office AI IP backstop | 120 per IP per 5 minutes (shared IP counter with public traffic) |
| Dashboard | 60 requests and 360 requested report-days per staff account per 5 minutes |

A 90-day dashboard request consumes 90 report-days; a series is charged once.
Single-day and series RPCs share the same allowances. A new transport identity,
new login token, or another server does not reset an account allowance. Trusted
service-role report integrations remain exempt.

Public and staff daily AI allowances are separate so public traffic cannot use
the staff daily budget. These are request caps, not exact dollar spending caps;
model and input sizes still affect cost.

## Enforcement

`app_private.abuse_windows` stores bounded timestamp arrays and expiry times.
RLS is enabled with no browser policies or grants. An advisory transaction lock
serializes each bucket across connections. Expired rows are cleaned up in bounded
batches during admitted requests. IPs are canonicalized and SHA-256 hashed; raw
IPs, login tokens, photos and customer data are not stored in this table.

Only the service role can execute `reserve_vision_analysis`. The AI server first
verifies office credentials (public requests use their separately capped path),
then calls this RPC before OpenAI. The reservation commits independently of the
AI call: provider failure or a restarted function does not refund an attempt.
Limiter failure returns 503 and makes no paid request. Exhaustion returns 429 with
retry timing; Vercel and Vite responses include Retry-After and Cache-Control:
no-store. The browser cannot supply capacities, windows, bucket IDs or trusted
staff IDs.

Vercel's platform-managed X-Forwarded-For is used in production. Vite uses the
socket address and ignores caller-supplied forwarding headers.
Reference: [Vercel request headers](https://vercel.com/docs/headers/request-headers).
Database access follows [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

Dashboard RPCs are now VOLATILE because they write counters. Existing app calls
use POST. An internal rendering function preserves the previous office money
masking; only the public wrappers reserve capacity. Private rendering and limiter
helpers have no browser EXECUTE privileges.

## Verification

- Disposable PostgreSQL: 32 concurrent requests admit exactly 20; the allowance
  survives a real database restart; expired hits release capacity; alternate IPv6
  spellings share a bucket; rotating IPs cannot bypass the public daily ceiling.
- Staff short/daily limits, session-token rotation, combined dashboard request/day
  budgets, tenant/range checks, private grants and service-role compatibility.
- Mocked shared/Vercel AI handlers: newly created server instances still consult
  shared storage; failed/malformed limiter responses never call OpenAI; office
  identity comes from the verified session, and 429 carries retry timing.
- Owner financial-access regressions, typecheck and production build.
- Live transaction-local checks: first public reservation allowed, 21st denied
  with 300-second retry; office reports load with financial fields omitted;
  exhausted report budget is denied; browser roles cannot reserve AI calls or
  read/update counters. Temporary counters and bindings were rolled back.
- Security advisors report no ERROR-level findings. The new private table
  intentionally has RLS with no browser policy, reported as informational.

Live HTTP checks confirmed browser reservation calls are denied (401/42501),
malformed AI requests return 400, and office requests without a token return 401.
A successful paid AI analysis and an end-to-end HTTP 429 were not exercised against
production; those server paths were covered by mocks plus live database reservations.

## Remaining boundaries

This does not close the whole audit. Report timeout enforcement remains a separate
task: an existing function-level statement_timeout setting is not proof that the
whole API request is bounded. Report counters are in the same transaction as the
report; failed/rolled-back report transactions do not permanently charge usage.
AI reservations do persist after provider failures.

Rate limits reduce abuse but do not replace edge traffic filtering or a billing
budget. The public daily ceiling can be exhausted deliberately, temporarily
pausing public AI estimates while staff estimates remain available. No provider
billing configuration was changed. Live verification did not spend OpenAI credits.
