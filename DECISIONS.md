# DECISIONS.md

Decision trail from brainstorm sessions (Claude.ai /ChatGPT web) → handoff to Claude Code/Codex.
Purpose: give Claude Code/Codex the *why* behind decisions, not just the *what* — so when it
hits a wall it knows which alternatives were already rejected and why, and doesn't
relitigate settled questions.

**How to use:** Newest entries on top. Keep entries distilled, not transcripts —
curated decisions in, not everything in. Each entry = Decision / Rejected / Constraints / Open risks.

---

## 2026-06-09 — Messages page repurposed: internal driver ↔ dispatch chat, not customer SMS

**Decision**
The dead customer-SMS Messages page (blocked on A2P 10DLC approval that never came) was fully
rewritten as a live internal messaging system between dispatch (`/messages`) and drivers
(`/driver/messages`), replacing the team's unorganized group text. Three thread types scope who
sees what: **job** (assigned crew + dispatch; auto-created when a driver first messages from a
job), **direct** (1:1 dispatch ↔ one driver), **broadcast** (dispatch → all active field techs).
Tables `dispatch_threads` / `dispatch_thread_participants` / `dispatch_messages` (migration
`202606090002`, applied live) with Supabase Realtime on threads + messages. Dispatch always
displays as "Dispatch" (sender identity = the Owner/Manager employee). Unread = messages newer
than the viewer's `last_read_at`. Job messages intentionally appear in BOTH the Messages thread
and the DriverJobDetail activity log.

**Rejected**
- Customer-facing SMS (the page's original purpose) — still blocked on A2P 10DLC; internal comms
  was the actual pain point. Customer notifications remain deferred.
- Read receipts / typing indicators / attachments / push notifications — V1 keeps it simple;
  photos already flow through the job photo system.
- Building on the unapplied `job_messages` phase-1 tables — the migration had to be standalone, so
  the thread system is its own additive schema; `sendJobMessage` writes both.

**Constraints / Open risks**
- Employees still live only in localStorage, so participant/sender ids are plain-text employee
  record ids (no FK). A driver's phone doesn't have the office employee list — direct threads are
  deduped on the driver-side participant so dispatch- and driver-created threads converge.
- RLS is "any authenticated" like the rest of the app; the anonymous-session trust model applies.

---

## 2026-06-09 — Driver activation: emailed key + 4-digit PIN, no passwords; live GPS map in Dispatch

**Decision**
Drivers get app access through a manager-triggered flow: Employees page → "Activate" → email
with a 12-character key (expires 72h) → driver opens `/driver/activate`, enters key, sets a
4-digit PIN, grants location. Returning drivers re-auth with PIN only at `/driver/login`
(5 misses = 15-minute lockout). New tables: `driver_activations`, `driver_sessions`,
`driver_location_history` (migration `202606090001`, standalone — does NOT depend on the
unapplied driver phase-1/2 migrations). Activated drivers report GPS every 30s while the tab
is open; Dispatch Center's "Show drivers" toggle renders colored live markers via Supabase
Realtime on `driver_sessions`.

Key calls inside that:
- **Key/PIN validation happens in the browser against Supabase directly** (PBKDF2-SHA256 via
  WebCrypto), because the deployed site is a static SPA with no Express. The spec'd Express
  endpoints (`/api/driver/validate-key`, `/api/driver/validate-pin`) exist too, with an
  identical hash format, for the legacy `pnpm start` path.
- **Email sending is the only backend-required step** (Resend). It exists in three places that
  share `server/driverEmail.ts`: Express route, Vite dev middleware, and a Vercel function
  (`api/driver/activate.ts`). If the email fails, the manager gets a dialog with the key +
  link to copy/text instead — activation still works.
- **Driver identity rides on the session rows** (`employee_name` / `display_name` columns,
  beyond the original spec) because employees live only in the office browser's localStorage —
  the driver's phone has no way to look up their own name.
- **Location privacy:** RLS only exposes the last 24h of `driver_location_history`; the
  employee detail page shows coordinates rounded to ~1 decimal ("city-level"); dispatch treats
  >5 min of silence as offline regardless of the `is_online` flag.

**Rejected**
- *Passwords / Supabase email auth* — workforce is not tech-savvy; key-then-PIN is the model.
- *Geocoding driver coords into city names* — Maps key is locked to Maps JavaScript API;
  Geocoding returns REQUEST_DENIED. Rounded coordinates instead.
- *Activation for subcontractors* — they show "SMS only" (future Twilio feature, blocked on
  A2P 10DLC anyway).

**Constraints / Open risks**
- Migration `202606090001_driver_activation_live_map.sql` was applied to the live DB on
  2026-06-09 (it also added `driver_sessions` to the Realtime publication).
- Anonymous-auth trust model: RLS says "authenticated", which today means any visitor. The
  activation key + hashed PIN + session token are the real gate. Revisit when real auth lands.
- Resend on an unverified domain can only send from `onboarding@resend.dev` (override with
  `RESEND_FROM` once the domain is verified). Vercel needs `RESEND_API_KEY` set for prod email.

---

## 2026-06-08 — Pricebook v4: merged Sam's market-tested prices with v3 cost model

**Decision**
Merge Sam's "Phoenix price book" (the markdown file Claude Cowork has been quoting from)
with Pricebook v3 to create v4. v4 is now the sole pricing authority.

Key merges:
- **Assembly minimum raised to $125** (Sam's rate, market-validated) from v3's $99.
  At $60 direct cost, $125 = 52% margin. Better than $99's 39%.
- **Assembly hourly raised to $95/hr** (Sam's rate) from v3's $75/hr. 58% margin.
- **Sam's per-item assembly prices adopted** where higher and customer-accepted: desk $125,
  dresser $150, bed frame $175, bunk bed $350, TV stand $125.
- **Stair pricing adopted from Sam:** 2nd floor +$100, 3rd floor +$200, above 3rd +$300
  per direction. Replaces v3's $75/flight.
- **Mandatory photo rules added** from Sam's ops instructions: always request photos before
  confirming junk removal and move quotes.
- **New service categories from Sam:** deep clean $275, yard cleanup $250, pressure washing $250,
  BBQ grill tune-up $199, smart home device setup $125, IKEA small/large project flat rates,
  blinds/grab bar/baby gate installs, materials run surcharge +$65, weekend flat +$100.
- **Moving and junk removal prices kept from v3** — Sam's were dangerously low. His "Full Truck
  Load: $389" was the source of the box truck pricing disaster.

**Rejected**
- *Using Sam's junk removal volume pricing* — rejected. Sam's chart ($99–$389 for 1/8 to full
  truck) was calibrated to a 15 yd³ junk truck, not our 26-ft box truck (~50 yd³). This is the
  confirmed source of the $389 full-truck loss. v3/v4 junk pricing is vehicle-aware.
- *Using Sam's moving rates* — rejected. His $185 for a small local move (2 movers + truck, 2 hrs)
  is below our direct cost + margin target. v4 keeps v3 moving rates ($130/hr van, $150/hr truck).
- *Discarding Sam's higher assembly prices in favor of v3's lower ones* — rejected. Sam's prices
  have customer acceptance (completed jobs, no complaints). Higher prices = better margins.

**Constraints**
- Operations Rules v1 updated to reference Pricebook v4 (companion doc).
- Photo request is mandatory on all junk removal and moving quotes — not optional.
- Sam's pricing chart should be retired once Pricebook v4 is loaded into Claude Cowork's project
  instructions and the API auto-responder is live.
- Deliverables: `/mnt/user-data/outputs/rejunk-pricebook-v4.md` and
  `/mnt/user-data/outputs/rejunk-operations-rules-v1.md`

**Open risks**
- Sam needs to understand WHY prices changed (especially junk removal going up). If he keeps
  quoting from his old chart instead of v4, the problem continues.
- Group text dispatch (iMessage, 6 people) is causing confusion, wasted time, and missed context.
  Rejunk driver app already has per-job dispatch messaging, status tracking, and issue reporting
  that solves this — but the app isn't finished/tested yet. Driver app completion is the next
  highest-priority build after the Thumbtack API webhook service.

## 2026-06-08 — Thumbtack API integration: queue-based webhook architecture (validated by second opinion)

**Decision**
Adopt a queue-based webhook architecture for the Thumbtack Partner API integration.
Second opinion obtained from GPT-5.5 Pro Extended Thinking — validated and refined the approach.

Final architecture (three components to start, split later if scale demands):

1. **Webhook ingress (Supabase Edge Function)** — receives webhook, verifies auth, stores raw
   payload in `webhook_events`, enqueues processing job, returns 200 immediately. Does NOT
   quote, does NOT call Thumbtack APIs, does NOT look up Pricebook. Only job: receive fast, ACK fast.

2. **Quote/response worker (queue-triggered)** — normalizes lead, runs deterministic Pricebook
   engine (AI parses request → Pricebook decides price, never the reverse), checks schedule
   availability, writes approved response to message outbox, sends via Thumbtack Messages API.
   Target: lead-to-response under 60 seconds total.

3. **Reconciliation poller (cron, every 2-3 min)** — polls Thumbtack GET endpoints for recent
   leads/messages, compares against local records, enqueues anything missing. Safety net for
   missed/delayed/out-of-order webhooks.

Supporting infrastructure:
- **OAuth tokens** in Supabase Vault, encrypted. Database-locked refresh (Thumbtack refresh
  tokens are single-use — concurrent refresh = token invalidation). Proactive refresh when
  access token expires within 5-10 min + reactive retry on 401.
- **Idempotency keys** on all inbound events (dedup webhooks) and outbound messages (prevent
  double-sending to customers).
- **Message outbox pattern** — approved responses queued before sending, with retry/backoff
  and dead-letter for persistent failures.
- **Provider-agnostic data model** — `lead_sources`, `external_conversations`, `external_messages`,
  `quote_decisions`, `message_outbox`. Thumbtack is one adapter. Facebook/Instagram plug in later
  without refactoring core Rejunk.

**Rejected**
- *All-in-one Edge Function (receive + quote + send in one request)* — rejected. Original proposal
  from Claude.ai session. GPT-5.5 correctly identified that if quote calculation, OAuth refresh,
  or Thumbtack API is slow, the webhook times out and Thumbtack marks the endpoint as failed.
  Decoupling receive from process is the fix.
- *Five separate workers (ingress, normalizer, quoter, outbox, reconciler)* — rejected as
  overbuilt for current scale (15-25 customers/month, 4 drivers). Start with three components,
  split when volume demands.
- *Persistent server (Railway/Fly) for webhook receiver* — rejected for now. Edge Functions are
  sufficient for ingress at current scale. Persistent worker may be added later for sub-10-second
  response guarantees or better observability.
- *AI decides price* — rejected. AI extracts structured fields from customer text (service type,
  item count, location). Pricebook engine applies deterministic rules (margins, minimums, safety
  classifications, schedule). AI never sets the number.

**Constraints**
- Business Phone Numbers API is mandatory (per Gab, PINT-3604). Register main business number,
  both ops manager numbers, and Twilio/dispatch numbers. Do NOT register driver personal phones.
  All numbers in E.164 format.
- Thumbtack message webhooks can arrive before lead webhooks (confirmed in Thumbtack troubleshooting
  docs). System must handle out-of-order events — create stub lead or fetch negotiation by ID.
- Staging and production credentials/environments must be completely separated.
- Supabase Edge Function limits: 256 MB memory, 2 sec CPU, 150 sec idle timeout. Ingress must
  stay well under these — just DB insert + enqueue + return 200.
- Privnote link for production Client ID & Secret is single-click, self-destructing. Must be
  opened with secure storage ready. Has NOT been clicked yet as of this decision.

**Open risks**
- Supabase Cron minimum interval is 1 minute. Combined with queue processing time, the 60-second
  response target has thin margin. If SLA tightens, may need immediate worker invocation via
  `EdgeRuntime.waitUntil()` plus cron as fallback, or a persistent worker.
- Thumbtack 429 rate limits and 5xx errors require retry/backoff on outbound messages. Rate
  limits not yet confirmed with Gab.
- Schedule integration not yet built in Rejunk — until it is, auto-booking is blind. Worker
  should flag "schedule check required" rather than confirming appointments.

---

## 2026-06-08 — Rejunk Pricebook: tiered margin strategy, market-calibrated

**Decision**
Adopt a three-mode Pricebook (v3) with differentiated margin targets:
- **Assembly/Service:** 40–50% gross margin, $99 minimum, $75/hr overflow. 1-worker default.
- **Moving/Delivery:** 45–55% gross. Van: $130/hr, Box truck: $150/hr, 2-hr minimums.
- **Specialty (piano, safe, hot tub):** 60–70% gross. Fewer competitors, less price transparency.
- **Junk Removal (existing):** 50–60% gross. Volume-based, vehicle-aware benchmarks.
- Real vehicle costs baked in: van $1,350/mo ($12.27/hr amortized), box truck $3,200/mo ($29.09/hr).
- Labor baseline: $25/hr per worker, door-to-door including drive time.
- Pricebook v3 delivered as `/mnt/user-data/outputs/rejunk-pricebook-v3.md` — Claude Code
  should use this to populate the Rejunk app Pricebook storage.

**Rejected**
- *70% gross margin across all services* — rejected. Phoenix Thumbtack data shows assembly
  competitors start at $45–$60, moving at $95–$165/hr. A $199 assembly minimum prices out
  of the market entirely. 70% may be achievable later with paid-off assets and brand recognition.
- *Single flat margin target* — rejected. Assembly (low cost, high volume) and specialty moves
  (high cost, low competition) have fundamentally different economics.
- *Ignoring vehicle costs on assembly jobs* — rejected. Workers drive company-leased vans.
  A 1.5-hr assembly job has $18+ in van costs alone. Original v1 Pricebook understated this.

**Constraints**
- Tips not factored into pricing — variable, go to driver as bonus.
- Every Pricebook item carries a safety crew classification (1 / ⚠️2 / ⚠️3).
- Volume benchmarks (junk removal) must be vehicle-aware — a "full load" in the 26-ft box truck
  is 3× a standard junk truck. Sam sold a full box truck at junk-truck prices ($389) and lost money.

**Open risks**
- $99 assembly minimum is ~2× the lowest Phoenix competitors ($45–$52). Must compete on service
  quality, reviews, and response time, not price. Review collection is critical.
- Pricing needs real-world calibration over 2–4 weeks of tracked jobs in the Rejunk app.

---

## 2026-06-08 — Thumbtack Partner API: webhook-based lead pipeline replaces browser automation

**Decision**
Replace Claude Desktop/Cowork browser automation with Thumbtack Partner API integration:
- **Negotiations (Leads) API** — real-time webhook receives leads instantly.
- **Messages API** — programmatic two-way messaging (GET messages, receive via webhook, POST replies).
- OAuth 2.0 auth with production credentials (approval received June 8, PINT-3604).
- Target architecture: webhook → pricing engine (Pricebook v3) → auto-response < 60 seconds.
- Tony orchestrates lead handling; pricing logic enforced programmatically, not by Claude freestyle.

**Rejected**
- *Continuing Claude Desktop browser automation* — rejected. Claude Cowork approves everything,
  doesn't enforce pricing, doesn't check schedule, doesn't re-quote scope changes. Also burns
  Sam's $200/mo Claude Max subscription. API replaces all of this.
- *Building a custom Thumbtack scraper* — rejected. API access is superior — real-time webhooks
  vs polling, official two-way messaging vs browser automation, no ToS risk.

**Constraints**
- Must implement OAuth flow, webhook endpoints, and token refresh before going live.
- Thumbtack requires partner endpoints to be validated in staging before production.
- Response time is the #1 competitive factor — first responder wins ~78% of junk/assembly leads.

**Open risks**
- API rate limits unknown — need to confirm with Thumbtack rep (Gab, PINT-3604).
- Webhook endpoint needs reliable hosting (uptime critical — missed webhook = missed lead).
- Two-way messaging means Claude/Tony responses go directly to customers — Pricebook and
  scope-change rules must be enforced programmatically to prevent the "sure, no problem" failure mode.

---

## 2026-06-08 — Safety-first operations: crew requirements override customer pressure

**Decision**
Every Pricebook item has a mandatory crew classification. Hard rules:
- ⚠️2 (two workers): anything over 75 lbs, appliances, overhead assembly, stairs + heavy items.
- ⚠️3 (three workers): grand pianos, 500+ lb safes, hot tub relocation.
- If required crew unavailable → job RESCHEDULES. Worker does NOT attempt solo.
- Scope changes on-site trigger mandatory re-quote before work continues.
- Mileage/hour caps per job — no more 200-mile, 6.5-hour solo marathons.

**Rejected**
- *Letting workers decide crew needs on-site* — rejected. Carolyn Bell job: solo worker moved
  a sectional sofa (2 trips), a family's household (multiple van trips), then piled cinder blocks
  to Buckeye, AZ. 6.5 hours, 200+ miles, finished at 10 PM, for $550. Worker was sore for days.
  Safety decisions must be made at quoting time, not on-site under customer pressure.
- *Rating-driven flexibility ("just do it for the review")* — rejected. A bad review is recoverable.
  A herniated disc is not. The ops manager is the business — injury = business shutdown.

**Constraints**
- Claude/Cowork auto-responses must NEVER confirm scope additions without re-quoting.
- The phrase "sure, no problem" is banned from automated customer responses.
- Vehicle assignment rules: vans for assembly/handyman/light junk, box truck for full moves and
  heavy items. Never assign a van to a job requiring multiple trips.

**Open risks**
- Operations doc not yet written — decisions captured here, full doc is next deliverable.
- Schedule integration missing from current system — Claude books morning slots blind.

---

## 2026-06-08 — Rejunk app: service-based pricing layer needed alongside existing junk removal

**Decision**
The Rejunk app (get-junk-quote) needs a second pricing mode for service/task work:
- Current app is 70% complete with excellent junk removal pricing (volume, weight, facility routing).
- But 90%+ of Thumbtack leads are assembly, handyman, appliance, and moving — NOT junk removal.
- Thumbtack lead distribution (June 7–8): 14 furniture assembly, 8 handyman, 4 appliance repair,
  2 equipment repair, 2 patio, misc. Zero junk removal leads (by design — avoiding heavy loads
  until dump trailer acquired).
- App needs: service/task pricing mode (1 worker, no facility), moving pricing mode (2 workers,
  hourly + travel), and the existing junk/volume mode.

**Rejected**
- *Building a separate app for service pricing* — rejected. Rejunk already has the infrastructure
  (Pricebook, dispatch, scheduling, invoicing). Add modes, don't duplicate.
- *Retrofitting junk removal pricing for assembly* — rejected. Assembly is flat-rate per item,
  not volume-based. Different pricing model entirely.

**Constraints**
- Volume benchmarks in the existing junk removal mode need vehicle-aware adjustment.
- Equipment: 5 cargo vans (Dodge ProMaster, Ford Transit), 1 box truck (26-ft IHC with liftgate),
  2 Camrys (excluded from business), 1 Ford Transit 350 passenger van.
- Dump trailer in the works — when acquired, junk removal mode becomes primary revenue driver.

**Open risks**
- Pricebook v3 is starting point — needs 2–4 weeks of real job data to calibrate.
- Sam's pricing knowledge gap was the #1 margin killer in weeks 1–2. Pricebook + API enforcement
  solves this structurally, but Sam needs to understand the why behind the pricing, not just follow it.

---

## 2026-06-06 — Agent architecture: Tony orchestrates, Codex executes

**Decision**
Maintain two purpose-built harnesses rather than collapsing into one:
- **Tony (GPT-5.5 via Hermes harness)** = standing presence. Always-on, reacts to inbound
  events (leads, texts, calls), carries persistent identity/relationship, reachable on
  personal channels. Exists *between* sessions.
- **Codex (and Claude Code)** = execution surface. Superior environment for building/running
  work. More capable *per session* at the actual doing.
- Target pattern: Tony as standing orchestrator that hands real execution tasks to Codex's
  superior surface when needed.

**Rejected**
- *Collapsing Tony's role into Cursor/Codex* — rejected. Coding harnesses are session-bound
  (open → task → end); turning one into an always-on event-reactive agent means hand-building
  a personal-agent runtime on top, i.e. rebuilding Hermes badly. Use each for its job.
- *Moving Tony to Opus via per-token API* — rejected on cost. Tony runs on GPT-5.5 via Codex
  OAuth (flat ChatGPT Plus subscription, no per-token cost). Opus via API = real metered cost
  + heavier per-token rate, traded for a marginal/unconfirmed capability gain.
- *Treating the model as a neutral swappable part* — rejected as a framing. The model is
  constitutive of Tony's identity (voice, handling of ambiguity, instincts), not just his
  competence. "Just change the model" is never neutral.

**Constraints (standing — apply to future decisions too)**
- Subscription/flat-cost paths first; never recommend pay-per-token when a subscription path exists.
- Tony cost hierarchy: PRIMARY = GPT-5.5 via Codex OAuth → FALLBACK = other OpenAI subscription
  models → EMERGENCY ONLY = Claude API (real money).
- Memory discipline: curated in, not everything in. Raw transcripts recreate the context-bloat
  that drove the move off OpenClaw. Same discipline that made the SOUL.md / USER.md transfer work.

**Open risks**
- Hermes harness is unproven for Tony's specific setup — needs validation on memory recall,
  steerability-through-harness, tool reliability, context management.
- Two-account GPT setup signals brushing against rate limits (throughput, not cost). Know the
  actual ChatGPT Plus / Codex usage ceiling before adding a third account.
- Personal-agent harnesses (Hermes, OpenClaw) iterate fast → breaking changes common. Pin versions.

---

## 2026-06-06 — Bridge brainstorm context from Claude.ai → Claude Code

**Decision**
Adopt a **decision-record handoff** (this file) as the mechanism to carry reasoning across the
seam between idea-formation (Claude.ai) and build (Claude Code). End-of-brainstorm: produce a
distilled decision brief → store where Code can read it.

**Rejected**
- *Manual paste of conclusions only* — rejected. Hands off the *what* but the *why* dies in the
  user's head; Code re-proposes already-rejected options when stuck.
- *Dumping raw transcripts into memory* — rejected. Recreates context bloat. Distill, don't dump.

**Constraints**
- End destination is a shared persistent memory layer (Mem0 already running) that both surfaces
  read/write. But even a perfect shared layer needs a distilled decision record as the write
  payload — so the decision brief is the mechanism regardless.

**Open risks**
- Nothing in the Claude.ai chat can write to Mem0 directly; a manual push step remains until/unless
  that gap is closed. DECISIONS.md in-repo is the zero-friction interim home.
