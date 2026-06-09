# Rejunk Operations Rules v1 — Progressive Transportation Services
**Updated:** June 8, 2026
**Companion to:** Pricebook v4
**Audience:** Claude/Cowork auto-responder, Thumbtack API quote worker, Sam (ops/dispatch), drivers

---

## 1. Response Protocol

### Lead Response
- **Target:** First response to any new lead within 60 seconds (API pipeline) or 5 minutes (manual)
- First responder wins ~78% of bookings in our service categories. Speed is the #1 competitive advantage.
- Every first response must include: greeting, service confirmation, price quote or price range, and availability window.
- Never respond with only "How can we help?" — that wastes the speed advantage. Lead already told Thumbtack what they need. Quote immediately.

### First Response Template
```
Hi [Name]! This is Progressive Transportation Services. For your [service type], 
our rate is [price from Pricebook]. We can get someone out to you [availability window].

Would [specific day/time] work for you?
```

### What the auto-responder NEVER says
- "Sure, no problem"
- "Yeah, we can grab that too"
- "We'll take care of it"
- "No additional charge"
- "I'll have to check with my manager" (we ARE the business — quote or escalate, don't stall)
- Any price not derived from the Pricebook
- Any appointment confirmation without checking the schedule

---

## 2. Quoting Rules

### Price Authority
- **Pricebook v3 is the sole pricing authority.** No freestyle quoting. No rounding down. No "I'll give you a deal."
- If an item is not in the Pricebook, do NOT quote. Escalate to dispatch (Abe or Sam) with the details.
- AI extracts structured fields from the customer request. The Pricebook decides the price. AI never overrides.

### Price Anchoring (from industry best practice)
- When quoting junk removal, mention the full-load price first, then the customer's actual tier.
  Example: "A full truck runs $X, but based on what you've described, you're looking at about $Y for a [fraction] load."
- This makes mid-range quotes feel like a value.
- For assembly/handyman, lead with the per-item price, then mention the multi-item discount if applicable.

### Quoting Unknowns
- If the request is vague ("I need some stuff moved"), respond with a clarifying question, NOT a guess.
- If the customer describes a job but confidence is below threshold, provide a range: "Based on what you've described, this typically runs $X–$Y. Once we confirm the details, I'll lock in your exact price."
- Never quote a fixed price on unclear scope. Ranges protect margins.

### Hard Guards (programmatic — never overridden)
- No full 26-ft box truck junk removal below $695 (minimum full-load price)
- No 2-worker job quoted below $199 (2-hr minimum for labor-only)
- No quote below the Pricebook cost basis (guaranteed loss)
- No assembly job below $125 minimum (Sam's market-validated rate)
- No moving job below 2-hour minimum
- No specialty item (piano, safe, hot tub) without ⚠️2 or ⚠️3 crew confirmed

---

## 3. Scope Change Protocol

**This is the single most important operational rule. It exists because of real losses.**

### The Rule
Any work not in the original quote = STOP → re-quote → customer accepts in writing → then work proceeds.

### How It Works
1. Customer reveals additional items or requests on arrival
2. Worker immediately calls dispatch (Abe or Sam)
3. Dispatch looks up additional items in Pricebook v3
4. Dispatch sends customer an updated quote via text/app message
5. Customer confirms acceptance
6. Worker proceeds with additional work
7. If customer declines, original scope completed as quoted — no guilt, no pressure

### Auto-Responder Version
When a customer adds items during a Thumbtack conversation:
```
Absolutely — happy to help with that too. Let me get you a quick updated quote 
with the additional [items/work]. One moment.
```
Then generate new quote from Pricebook and send updated total.

### Why This Exists
- **Carolyn Bell job:** Customer added sectional delivery, then full family move, then cinder 
  blocks to Buckeye (80-mile round trip), then plants and a table. Original quote: $550. 
  Actual value: $1,345+. Worker finished at 10 PM, 200+ miles, solo, physically wrecked.
- **Michael Rennie (Thumbtack chat):** Claude approved additional services without re-quoting.
- **Pattern:** Customers gradually expand scope. Each addition seems small. The aggregate 
  transforms the job. Without a hard re-quote trigger, margin evaporates and safety degrades.

---

## 4. Safety Rules

### Crew Classification Enforcement
Every Pricebook item has a crew requirement. These are non-negotiable.

| Classification | Rule | Examples |
|---|---|---|
| 1 worker | Items under 75 lbs, no overhead work above 6 ft | Bar stool assembly, picture hanging, nightstand |
| ⚠️ 2 workers | Over 75 lbs, appliances, overhead assembly, stairs + heavy | Fridge move, bunk bed, trampoline, sectional sofa |
| ⚠️ 3 workers | Extreme weight or specialty | Grand piano, 500+ lb safe, hot tub relocation |

### Hard Safety Rules
1. **If required crew is unavailable, the job is RESCHEDULED.** Worker does not attempt solo. No exceptions.
2. **No single worker lifts anything over 75 lbs.** If uncertain, treat as 2-worker job.
3. **No overhead assembly (trampolines, playsets, basketball hoops, canopies) with 1 worker.** Fall risk + weight risk.
4. **No appliance moves with 1 worker.** Fridge, washer, dryer, oven — always 2 workers with proper equipment.
5. **Stairs + heavy items = always 2 workers minimum.** Stair surcharges: 2nd floor +$100, 3rd floor +$200, above 3rd +$300 per direction.

### Why This Exists
- A bad review is recoverable. A back injury is not.
- Abe is the ops brain of the business. If Abe is injured, dispatch stops, pricing breaks, the business is at risk.
- Drivers are assets. Protecting them protects revenue capacity.

### On-Site Safety Escalation
If a worker arrives and discovers:
- Job requires more crew than quoted → call dispatch, reschedule or send additional worker
- Hazardous materials (mold, animal waste, chemicals, structural risk) → call dispatch, do NOT proceed, apply hazardous discovery fee ($50+) or refuse job
- Access issues (locked gate, no elevator reservation, no parking) → call dispatch, apply wait time fee ($40/30 min after 15-min grace) or reschedule
- Customer is aggressive, threatening, or unsafe environment → leave immediately, call dispatch. Safety of worker overrides all other considerations.

---

## 5. Scheduling Rules

### Availability Windows
- **Standard operating hours:** 7:00 AM – 6:00 PM, Monday through Saturday
- **Sunday:** Available for pre-booked jobs only, +15% weekend surcharge
- **After 6 PM:** +15% after-hours surcharge
- **Same-day rush:** +$50 surcharge

### Booking Rules
1. **Never confirm a specific time without checking the schedule.** If schedule access is unavailable, offer a window: "We have availability on [day]. Our team will confirm your exact time window the evening before."
2. **Do not stack all jobs in the morning.** Customers always want "first thing in the morning." Maximum 2 morning starts (7-9 AM) per driver per day.
3. **Buffer 30 minutes between jobs** for drive time and overrun.
4. **Multi-stop jobs count as separate schedule blocks.** The Carolyn Bell job was 3 jobs scheduled as 1.

### Vehicle Scheduling
- Each vehicle has its own schedule track
- Assembly/handyman → assign van
- Full moves → assign box truck
- If box truck is booked, do NOT assign a van to a full move (multiple trips = loss + exhaustion)
- If all vans are booked, do NOT overbook → offer next available slot

### Driver Assignment
- Match job crew requirement to available drivers
- 2-worker jobs require 2 drivers scheduled to the same time block
- Never schedule a 2-worker job with only 1 driver available
- Account for driver location — don't send a driver from Buckeye to Scottsdale for a 1-hour assembly when a closer driver is available

---

## 6. Billing & Invoicing Rules

### Time Tracking
- **Clock starts** when the worker arrives at the job site (not when they leave the shop)
- **Clock stops** when the job is complete and the customer confirms satisfaction
- For hourly jobs: round to the nearest 15-minute increment
- **ALL hours worked must be invoiced.** No free time. No "I'll let that slide."
  - Michelle Tarkowski lesson: Charged for 2 hours, worked 2 hrs 48 min (10:45 AM–1:33 PM). 48 minutes of unbilled labor = ~$80 lost revenue at 2-person rate.

### Invoicing
- Invoice generated at job completion, sent to customer via Rejunk app or HousecallPro (until Rejunk replaces it)
- Payment due on completion unless pre-arranged
- Accepted payment methods: credit card, cash, Zelle, Venmo
- Credit card processing fee: 3% passed through. Cash/Zelle: no fee.

### Minimum Charges
| Service Type | Minimum |
|---|---|
| Assembly / Handyman | $125 |
| Moving Labor Only (2 workers) | $199 (2-hr min) |
| Moving Van (2 workers) | $260 + $50 travel (2-hr min) |
| Moving Box Truck (2 workers) | $300 + $75 travel (2-hr min) |
| Junk Removal | $129 |
| Specialty Move | Per Pricebook — no discounts |

### Overages
- When a job exceeds quoted time by more than 15 minutes, the overage rate applies automatically
- Overage rates: $75/hr (1 worker), $130/hr (2 workers)
- Worker must notify dispatch AND customer when approaching the quoted time limit
- Customer must acknowledge overage before the worker continues past the quoted scope

---

## 7. Vehicle Assignment Rules

### Assignment Matrix
| Job Type | Cargo Van | 26-ft Box Truck |
|---|---|---|
| Assembly (any) | ✅ Preferred | ❌ Overkill — wastes truck availability |
| Handyman | ✅ Preferred | ❌ Overkill |
| Small move (studio, single room) | ✅ If light items | ✅ Better if heavy furniture |
| Full apartment/house move | ❌ Multiple trips = time loss + driver exhaustion | ✅ Required — single trip |
| Appliance delivery/move | ⚠️ Only if item fits and is light | ✅ Preferred — liftgate |
| Piano / safe / heavy specialty | ❌ Cannot safely load | ✅ Required — liftgate |
| Light junk (1-3 items) | ✅ Fine | ❌ Overkill |
| Full cleanout / demo | ⚠️ Multiple trips, inefficient | ✅ Preferred |

### Hard Rules
- **Avoid assigning a van to a job that will require multiple trips when possible.** If the box truck is unavailable, a van can be used — but price the job to account for the extra trips (add per-trip overage) and assign 2 workers. The Carolyn Bell job showed that a van doing a full-house move with a solo worker is a safety and margin disaster. If a van must be used, quote accordingly and crew appropriately.
- **Box truck is reserved for jobs that need it.** Don't waste it on a 1-item assembly when a van will do.
- **Liftgate is a marketing advantage.** Always mention it in quotes for appliance and heavy-item moves: "Our truck comes equipped with a hydraulic liftgate at no extra charge."

---

## 8. Customer Communication Standards

### Tone
- Professional, friendly, confident. Not overly casual, not corporate.
- Use the customer's first name.
- Be specific about pricing — vague answers lose trust and leads.
- End every message with a clear next step or question.

### Review Requests
- **Every completed job ends with a review request.** No exceptions.
- Timing: within 1 hour of job completion, via text.
- Template:
```
Hi [Name], thanks for choosing Progressive Transportation Services! We hope 
everything went great. If you have a minute, a review would really help our 
small business: [Thumbtack review link]

Thank you! – The PTS Team
```
- Drivers can also ask verbally at job completion: "If you were happy with the service, we'd really appreciate a review on Thumbtack."
- Goal: build toward 100+ reviews in year 1. Reviews are the long-game competitive moat — the top Phoenix assembly pro has 542 reviews and 1,257 hires.

### Handling Complaints
1. Listen. Don't argue. Don't get defensive.
2. Apologize for the experience (not necessarily for being wrong).
3. Offer a specific remedy: discount on next service, partial refund, return visit.
4. Escalate to Abe if the customer threatens a negative review or demands full refund.
5. Never offer refunds or credits over $50 without Abe's approval.
6. Document everything — the complaint, what was offered, what was accepted.

### Cancellation & No-Show
- Customer cancels same-day (after crew dispatched): $50 cancellation fee
- Customer cancels with 24+ hours notice: no fee, reschedule offered
- Customer no-show / locked gate / no access: $50 no-show fee, crew waits 15 minutes max
- Progressive cancels: full refund of any deposit, reschedule offered with priority booking

---

## 9. Dispatch Protocol

### Job Lifecycle
1. **Lead received** → auto-quote generated from Pricebook (API) or manual quote (Sam/Abe)
2. **Customer accepts** → job created in Rejunk, driver and vehicle assigned, added to schedule
3. **Day before** → driver notified of next-day schedule with job details, address, customer name, special instructions
4. **Day of** → driver confirms departure, dispatch tracks
5. **On arrival** → worker checks scope against quote. If scope matches: proceed. If scope changed: call dispatch for re-quote.
6. **Job complete** → worker marks complete, photos if applicable, customer confirms satisfaction
7. **Invoice sent** → payment collected on-site or invoiced
8. **Review request** → sent within 1 hour of completion

### Dispatch Decision Tree
```
New lead arrives:
├── Service type identifiable?
│   ├── YES → Look up Pricebook v3 → generate quote
│   │   ├── Crew available for required classification?
│   │   │   ├── YES → Quote with availability
│   │   │   └── NO → Quote with next available date, do NOT book undercrewed
│   │   ├── Vehicle available for job type?
│   │   │   ├── YES → Include in quote
│   │   │   └── NO → Offer next available date with correct vehicle
│   │   └── Send quote to customer
│   └── NO → Ask clarifying question (1 question max, be specific)
└── Unclear or complex request?
    └── Escalate to Abe with details
```

### Escalation Triggers (route to Abe immediately)
- Any job estimated over $500
- Any commercial/business client
- Any job requiring 3+ workers
- Any request involving hazardous materials
- Any customer complaint or threatened negative review
- Any scope change over $200
- Any request outside normal service area (beyond Maricopa County)
- Any request for services we don't offer (electrical, plumbing, HVAC licensed work)
- Any workers' comp or injury incident

---

## 10. What We Do NOT Do

Clear boundaries prevent scope creep into liability territory:

- **No electrical work** beyond swapping a light fixture or outlet cover (requires licensed electrician)
- **No plumbing** beyond replacing a garbage disposal (requires licensed plumber)
- **No gas line connections** for stoves, grills, dryers (requires licensed plumber/gas fitter)
- **No HVAC** of any kind
- **No roofing, structural, or load-bearing work**
- **No tree removal** (requires arborist/insurance)
- **No pest control or remediation** (we charge the bed bug surcharge, we don't treat)
- **No auto towing or vehicle transport** (separate licensing)
- **No storage** (we move to/from storage, we don't provide storage facilities)
- **No long-distance moves over 50 miles** without Abe's approval and custom quote

If a customer asks for any of the above, the response is:
```
That's outside our service area, but I'd be happy to help you find a licensed 
[electrician/plumber/etc.] in the Phoenix area. Want me to send you a recommendation?
```

---

## 11. Summer Heat Protocol (Phoenix-Specific)

Phoenix summers regularly exceed 110°F. This is a real safety and operational concern.

### Rules
- **Heat advisory days (115°F+):** No outdoor assembly or heavy manual work between 11 AM – 3 PM. Schedule before 10 AM or after 4 PM.
- **All outdoor jobs:** Workers must have water, breaks every 30 minutes, shade access.
- **Van/truck staging:** Never leave items that can melt, warp, or be damaged by heat in an unshaded vehicle for extended periods. This includes candles, electronics, vinyl records, certain plastics.
- **Customer communication:** If a job needs to be rescheduled due to extreme heat, be upfront: "For the safety of our crew and the quality of your [assembly/move], we'd like to reschedule to [early morning slot]. Phoenix heat can affect both our team and your belongings."

---

## Appendix: Lessons Learned (Real Jobs)

These are real incidents that shaped these rules. Claude Code and any future operator should understand them.

| Job | What Happened | Rule It Created |
|---|---|---|
| Carolyn Bell — $550 | Solo worker, 6.5 hrs, 200+ mi, sectional + full move + bricks to Buckeye. Finished 10 PM. Sore for days. | Scope change protocol, safety crew enforcement, vehicle assignment rules, mileage caps |
| Michelle Tarkowski — $189 | Quoted 2 hrs, worked 2 hrs 48 min (10:45 AM–1:33 PM). Only billed for 2 hrs. | All hours worked must be invoiced. Overage notification rule. |
| Michael Rennie — Thumbtack chat | Claude approved additional services without pricing them. | Auto-responder never confirms additions without re-quoting. |
| Sam — $389 box truck | Used wrong pricing chart (small junk truck rates for 26-ft box truck). | Pricebook v3 is sole pricing authority. Vehicle-aware volume benchmarks. |
| Jon Magnuson — $150 | Equipment unpack for $150 with 2 workers. 1% margin. | Minimum 2-worker charge is $199. |
| Sean Qu — $185 | Fridge relocation for $185 with 2 workers + truck. 20% margin. | Appliance minimum is $249. |
