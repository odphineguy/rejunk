# Dispatch Phase 2 Implementation

## Scope

Phase 2 completes the dispatch-to-driver control loop without replacing the Phase 1 driver app or existing estimator, map, pricing settings, Supabase hydration, or local-storage fallback.

## Implemented Areas

- Structured `/jobs/new` dispatch form with job details, pricing fields, stops, items, and assignment.
- Dispatch operational helpers for stops, items, activity, messages, issue resolution, and assignment local fallback.
- Dispatch JobDetail controls for assignments, vehicle, stop/item edits, instruction publishing, issue resolution, and driver messaging.
- Jobs page operations board and exception queue.
- Driver workflow changes: state-aware primary actions, service-blocker reporting, called-dispatch confirmation, and no driver cancellation.
- Additive Phase 2 migration for issue resolution fields, instruction acknowledgements, assignment sequence, and dispatch/driver RPCs.

## Security Notes

- Driver status transitions no longer include `canceled`.
- Drivers cannot skip stops through the driver UI or local fallback.
- Blocking issues require dispatch response/release before progression.
- Dispatch-only decisions create job activity entries.
- Driver-facing data remains masked; pricing fields are only edited and displayed in dispatch screens.

## Local Fallback

When Supabase is not configured, dispatch and driver operational changes are simulated in localStorage. The local driver path keeps the same restrictions: no cancel, no skip, no self-release, and no added-scope approval.
