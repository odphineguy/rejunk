# Junk Removal Pricing Analysis

**Prepared:** September 4, 2026  
**Purpose:** Preserve the reasoning, cost analysis, and open questions needed for the next ReJunk pricing update.  
**Status:** Analysis only. This document does not change the ReJunk Pricebook, estimator settings, or production data.

## Executive summary

The old junk-removal prices of **$149 for a quarter load, $249 for a half load, and $389 for a full load should not be used for the current 26-foot box truck**. Under the assumptions in `pricing-margin-model.xlsx`, every one of those prices loses money.

The confusion comes from using the phrase “truck load” without defining the truck's capacity:

- Sam's **$175 / $299 / $499** Pricebook appears to describe a standard junk truck with approximately **15 cubic yards** of usable capacity.
- Progressive's current 26-foot box truck is modeled in ReJunk with approximately **50 cubic yards** of usable capacity.
- A full 50 yd³ box truck therefore holds about **3.33 standard 15 yd³ junk-truck loads**.

A $499 price may be reasonable for one full 15 yd³ truck. It is not a reasonable price for removing 50 yd³. A smaller truck would need multiple disposal trips to remove what the box truck carries in one trip, repeating crew, fuel, vehicle, and disposal-related costs.

For the current box truck, the ReJunk estimator's existing volume benchmarks of **$495 / $695 / $865 / $1,195** for quarter, half, three-quarter, and full loads are a much safer temporary pricing structure. The estimator must still be allowed to quote higher when labor, weight, distance, disposal, access, or special handling increases the cost.

## Sources reviewed

This analysis is based on:

- `pricing-margin-model.xlsx`
  - `Inputs` sheet for wages, payroll burden, paid-hours multiplier, vehicle allocation, fuel, lead cost, platform cost, and disposal assumptions.
  - `Line Margins` rows 21–23 for the three junk-removal prices and their modeled results.
- `client/src/data/defaultPricebook.ts` and `rejunk-pricebook-v4.md` for the standard approximately 15 yd³ Pricebook tiers.
- `client/src/data/defaultPricing.ts` for the 50 yd³ box-truck capacity and ReJunk volume benchmarks.
- `client/src/utils/pricingCalculator.ts` for the estimator's cost and price-floor logic.
- `rejunk-operations-rules-v1.md` for existing operational safeguards.

The repository configuration was reviewed, but any pricing overrides saved directly in the live Supabase database were not independently confirmed during this analysis. The local service-role credential was not usable for a read-only verification. Before a future pricing update, the live stored settings should be read and compared with the repository defaults.

## The three prices in the margin workbook

The spreadsheet models the three prices with a box truck and two workers:

| Tier         | Customer price | Modeled hours |   Labor |   Fuel | Disposal |   Lead | Platform | Cash profit | Cash margin | Vehicle allocation | Fully loaded profit | Fully loaded margin |
| ------------ | -------------: | ------------: | ------: | -----: | -------: | -----: | -------: | ----------: | ----------: | -----------------: | ------------------: | ------------------: |
| Quarter load |           $149 |           1.0 |  $66.53 | $25.24 |   $37.50 | $41.67 |   $13.30 | **-$35.24** |  **-23.6%** |             $45.71 |         **-$80.95** |          **-54.3%** |
| Half load    |           $249 |           1.5 |  $99.79 | $25.24 |   $75.00 | $41.67 |   $13.30 |  **-$6.00** |   **-2.4%** |             $68.57 |         **-$74.57** |          **-29.9%** |
| Full load    |           $389 |           2.5 | $166.32 | $25.24 |  $150.00 | $41.67 |   $13.30 |  **-$7.53** |   **-1.9%** |            $114.29 |        **-$121.82** |          **-31.3%** |

“Cash profit” subtracts labor, fuel, disposal, lead acquisition, and platform cost. “Fully loaded profit” also subtracts the truck payment and insurance allocation.

### Why the old prices lose money

1. **The price is attached to the wrong truck capacity.** The old full-load figure is much closer to pricing for a small junk truck than a 50 yd³ box truck.
2. **Lead and platform expenses are significant.** The workbook assigns approximately $41.67 of lead expense and $13.30 of platform expense to every completed job. Together, that is about $55 before labor, fuel, disposal, or the truck.
3. **Low truck utilization raises the cost per billed hour.** At the workbook's current utilization of approximately 70 billed truck-hours per month, the box truck payment and insurance allocation is about $45.71 per billed hour.
4. **Disposal is a real variable cost.** Even the workbook's simplified $150-per-full-load disposal assumption consumes a large portion of the old prices.
5. **The modeled labor time may be optimistic.** The current box truck does not dump. Loading and manually unloading 12.5–50 yd³ may require more paid crew time than the workbook's 1.0–2.5 hours.

## The two ReJunk pricing systems

ReJunk currently contains two related but different sets of prices.

### Standard approximately 15 yd³ junk-truck Pricebook

| Load fraction | Cubic yards at 15 yd³ capacity | Price |
| ------------- | -----------------------------: | ----: |
| 1/8           |                          1.875 |  $129 |
| 1/4           |                           3.75 |  $175 |
| 1/2           |                            7.5 |  $299 |
| 3/4           |                          11.25 |  $399 |
| Full          |                             15 |  $499 |

The Pricebook explicitly says these prices describe a standard approximately 15 yd³ junk truck and instructs the operator to use the ReJunk estimator for the 26-foot box truck.

These prices should not be relabeled as fractions of the 50 yd³ box truck. If Progressive later acquires a proper 15 yd³ junk truck, this rate card still needs to be validated against that truck's real payment, insurance, fuel, crew time, dumping time, and disposal costs.

### Current 50 yd³ box-truck estimator benchmarks

| Box-truck fraction | Cubic yards | Existing benchmark | Price per yd³ |
| ------------------ | ----------: | -----------------: | ------------: |
| Minimum            |           — |               $150 |             — |
| 1/8                |        6.25 |               $295 |        $47.20 |
| 1/6                |        8.33 |               $395 |        $47.40 |
| 1/4                |        12.5 |               $495 |        $39.60 |
| 1/3                |       16.67 |               $575 |        $34.49 |
| 3/8                |       18.75 |               $655 |        $34.93 |
| 1/2                |          25 |               $695 |        $27.80 |
| 5/8                |       31.25 |               $745 |        $23.84 |
| 2/3                |       33.33 |               $815 |        $24.45 |
| 3/4                |        37.5 |               $865 |        $23.07 |
| 7/8                |       43.75 |               $995 |        $22.74 |
| Full               |          50 |             $1,195 |        $23.90 |

The decreasing price per cubic yard is a normal volume discount. Larger jobs spread the lead, platform, mobilization, and some vehicle costs over more volume.

## Margin comparison using the workbook's costs

Applying the spreadsheet's fully loaded costs to the closest box-truck benchmarks produces:

| Tier               | Old price | Old loaded margin | ReJunk box benchmark | Loaded profit at benchmark | Loaded margin at benchmark |
| ------------------ | --------: | ----------------: | -------------------: | -------------------------: | -------------------------: |
| Quarter / 12.5 yd³ |      $149 |            -54.3% |                 $495 |                    $265.05 |                      53.5% |
| Half / 25 yd³      |      $249 |            -29.9% |                 $695 |                    $371.43 |                      53.4% |
| Full / 50 yd³      |      $389 |            -31.3% |               $1,195 |                    $684.18 |                      57.3% |

Based on the current model, the box-truck benchmarks create healthy and relatively consistent loaded margins. They are materially better than both the old spreadsheet prices and the standard-truck Pricebook prices when the assigned vehicle is the 50 yd³ box truck.

## Why multiple trips change the comparison

A smaller truck cannot remove a 25–50 yd³ job in one trip.

| Customer volume | 50 yd³ box truck | 15 yd³ truck trips required | Approximate standard-truck rate-card equivalent |
| --------------- | ---------------: | --------------------------: | ----------------------------------------------: |
| 12.5 yd³        |                1 |                           1 |                                      About $499 |
| 25 yd³          |                1 |                           2 |                                      About $898 |
| 50 yd³          |                1 |                           4 |                                    About $1,796 |

The rate-card equivalents round each remaining partial load up to the next listed tier. They illustrate the pricing consequence rather than promise an exact future quote.

Each additional trip can repeat:

- Crew driving time
- Fuel consumption
- Vehicle wear and depreciation
- Travel to and from the disposal facility
- Facility queue and unloading time
- Disposal minimums or per-entry charges
- Opportunity cost from losing time that could have been used for another job

The operational rule should therefore be:

> Measure the customer's total junk in cubic yards first. Then calculate the trips required for the assigned vehicle. Never let a smaller vehicle redefine the customer's total volume as one “full load.”

## Recommended temporary pricing policy

Until enough completed-job data is available for a full pricing update:

1. **Retire $149 / $249 / $389 for the box truck.** Do not use those figures as box-truck volume tiers.
2. **Use the current 50 yd³ benchmarks as floors:**
   - Up to 12.5 yd³: starting at $495
   - Up to 25 yd³: starting at $695
   - Up to 37.5 yd³: starting at $865
   - Up to 50 yd³: starting at $1,195
3. **Quote the greater of:**
   - The volume benchmark
   - The price required to produce the target loaded margin
   - Fully loaded cost plus the minimum required profit
4. **Use 50%–55% as the provisional loaded-margin target.** The current benchmarks meet that range under the spreadsheet's assumptions. A higher target may be appropriate after actual conversion and competitor data are reviewed.
5. **Describe volume in cubic yards.** A fraction can be shown secondarily, such as “up to 12.5 yd³, approximately one-quarter of our current box truck.”
6. **Round volume up to the next tier.** Do not round down or use the nearest tier.
7. **Use “starting at” language.** Stairs, long carries, difficult access, manual disassembly, loose debris, appliances, extra trips, and unusual loading or unloading conditions can raise the final price.
8. **Require photos before confirming a junk-removal price.** Vague or incomplete scope should receive a range, not a fixed quote.
9. **Requote scope changes before loading the extra material.** More volume, weight, stairs, distance, or labor means a new price.
10. **Keep heavy-material pricing separate.** Concrete, dirt, tile, brick, roofing, rock, and other dense materials must be priced by weight, payload, required vehicle, and disposal plan rather than ordinary household-junk volume tiers.

## Recommended pricing formula

For standard household junk, the final quote should follow this policy:

```text
Fully loaded cost =
  loaded crew cost
  + fuel
  + disposal
  + vehicle operating/fixed-cost allocation
  + lead acquisition
  + platform allocation
  + job-specific fees

Margin price = fully loaded cost ÷ (1 − target margin)

Final quote = highest of:
  volume-tier benchmark,
  margin price,
  fully loaded cost + minimum profit,
  required additional-trip price,
  any applicable special-handling floor
```

The ReJunk estimator already uses the core “highest of” approach. Before the next pricing update, its stored operating-cost assumptions must be reconciled with the margin workbook. In particular:

- ReJunk's repository default hourly labor input is $25 per worker, while the workbook calculates approximately $33.26 in loaded labor cost per paid/billed hour.
- The workbook includes approximately $54.97 per completed job for lead and platform expense. Those costs are not automatically present in the estimator's repository defaults unless entered as additional fees or otherwise included in the stored settings.
- The box truck's $45 per-hour vehicle cost in the repository is close to the workbook's current $45.71 allocation, but it will change with utilization.

## Capturing accurate volume with the current truck

The inside of the box truck should be physically marked in fixed cubic-yard increments. Five-yard increments would give the crew a practical field reference without creating too many lines.

For a rectangular usable cargo area:

```text
Cubic yards = interior width in feet × usable height in feet × loaded length in feet ÷ 27
```

Recommended field process:

1. Record interior width and realistic usable height.
2. Calculate the loaded length corresponding to each 5 yd³ increment.
3. Mark and label those positions inside the box.
4. Estimate the job from customer photos before arrival.
5. Confirm the occupied volume before loading whenever practical.
6. Record the final loaded-volume mark after the truck is loaded.
7. Record total paid crew time, route miles, dump weight, disposal charge, and disposal time.
8. Compare estimated versus actual volume and cost after each job.

The measured volume should represent the space the junk occupies in the truck, including normal voids between irregular furniture and household items. It should not assume perfect compaction unless the crew actually compacts the load consistently.

## Data required before the full pricing update

The next pricing decision should use real completed-job records. For at least 10–20 representative junk-removal jobs, capture:

- Estimated cubic yards from customer photos
- Actual occupied cubic yards in the truck
- Material category
- Assigned vehicle
- Number of disposal trips
- Number of workers
- Total paid crew-hours, including driving and disposal
- Customer-site loading time
- Disposal travel, waiting, and unloading time
- Route miles
- Fuel consumption or estimated fuel cost
- Dump-ticket weight
- Disposal charge and extra fees
- Lead source and lead cost
- Customer price
- Discounts or scope-change adjustments
- Whether the lead booked at the quoted price

This data will answer whether the current benchmarks are genuinely profitable, where the tier boundaries should sit, and whether higher prices materially reduce conversion.

## Questions that remain open

1. How many total paid crew-hours does a normal 12.5, 25, 37.5, and 50 yd³ household-junk job require, including disposal?
2. What do recent dump tickets show for weight and disposal cost by cubic-yard range?
3. How much manual unloading time does the non-dumping box truck add?
4. What are the actual route miles and disposal-facility wait times?
5. Which lead sources should carry an acquisition-cost allocation, and what is the completed-job cost for each source?
6. What loaded margin and minimum dollar profit should Progressive require?
7. When a 15 yd³ junk truck is acquired, will it be a dumping vehicle, and what will its payment, insurance, fuel economy, payload, and usable capacity be?

## Decision for now

The current working decision is:

- **Use cubic yards as the primary measurement.**
- **Use vehicle capacity only to determine fractions and trips.**
- **Use the current box-truck volume benchmarks as minimum prices, not guaranteed prices.**
- **Use the estimator to raise the quote when actual job costs demand it.**
- **Do not use the standard 15 yd³ Pricebook chart for the 50 yd³ box truck.**
- **Do not finalize a new long-term price ladder until real volume, labor, dump-ticket, trip, and conversion data have been collected.**
