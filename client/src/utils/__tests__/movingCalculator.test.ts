import { describe, expect, it } from "vitest";

import { FOURTH_MOVER_FALLBACK_SENTENCE, dayTypeOf } from "@/data/movingRates";
import { calculateMovingQuote, ceil4, customerTextFor, defaultMovingInput } from "@/utils/movingCalculator";
import type { MovingQuoteInput } from "@/types/moving";

const input = (overrides: Partial<MovingQuoteInput>) => defaultMovingInput(overrides);

const NEVER_IN_CUSTOMER_TEXT = /trip fee|trip charge of|\$85\b/i;

describe("dayTypeOf — weekend rule (Phoenix)", () => {
  it("marks the first two and last two calendar days of Sep and Oct 2026 as weekend", () => {
    for (const day of ["2026-09-01", "2026-09-02", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-30", "2026-10-31"]) {
      expect(dayTypeOf(day), day).toBe("weekend");
    }
  });
  it("marks Fri / Sat / Sun as weekend", () => {
    expect(dayTypeOf("2026-09-18")).toBe("weekend"); // Fri
    expect(dayTypeOf("2026-09-19")).toBe("weekend"); // Sat
    expect(dayTypeOf("2026-09-20")).toBe("weekend"); // Sun
  });
  it("marks a mid-month Wednesday / Monday as weekday", () => {
    expect(dayTypeOf("2026-09-16")).toBe("weekday");
    expect(dayTypeOf("2026-09-21")).toBe("weekday");
    expect(dayTypeOf("2026-10-14")).toBe("weekday");
  });
  it("converts a timestamp to Phoenix wall-clock before deciding", () => {
    // 2026-09-17T23:30 in Phoenix is 06:30Z on the 18th (Fri) — still Thu in Phoenix.
    expect(dayTypeOf("2026-09-18T06:30:00Z")).toBe("weekday");
  });
});

describe("ceil4", () => {
  it("rounds up to the quarter hour", () => {
    expect(ceil4(10)).toBe(10);
    expect(ceil4(10.1)).toBe(10.25);
    expect(ceil4(6.6)).toBe(6.75);
    expect(ceil4(0)).toBe(0);
  });
});

describe("package eligibility", () => {
  it("1BR apartment on a Tuesday → $525, 4 hrs included, $109/hr after, 2 movers", () => {
    const result = calculateMovingQuote(input({ homeSize: "studio_1br", moveDate: "2026-09-22", crew: 2 }));
    expect(result.dayType).toBe("weekday");
    expect(result.recommended.kind).toBe("package");
    expect(result.packageOption).toMatchObject({ key: "studio_1br", flatPrice: 525, includedHours: 4, overageRate: 109, crewShown: 2 });
    expect(result.total).toEqual({ low: 525, high: 525 });
    expect(result.customerText).toContain("$525 flat, travel included");
    expect(result.customerText).toContain("2 experienced professional movers");
    expect(result.customerText).toContain("4 hours on site");
    expect(result.customerText).toContain("$109/hr");
  });

  it("2BR on a Saturday → $850, 6 hrs, $124/hr overage, says 3 movers and never 2", () => {
    const result = calculateMovingQuote(input({ homeSize: "2br", moveDate: "2026-09-19" }));
    expect(result.dayType).toBe("weekend");
    expect(result.packageOption).toMatchObject({ key: "2br", flatPrice: 850, includedHours: 6, overageRate: 124, crewShown: 3 });
    expect(result.customerText).toContain("3 experienced professional movers");
    expect(result.customerText).not.toMatch(/\b2 (experienced|movers)/);
  });

  it("6 items, weekday, 10 mi → Small Move $303 recommended; van flat not offered", () => {
    const result = calculateMovingQuote(input({ homeSize: "few_items", itemCount: 6, moveDate: "2026-09-16", distanceMiles: 10, crew: 2 }));
    expect(result.recommended.kind).toBe("package");
    expect(result.packageOption).toMatchObject({ key: "small_move", flatPrice: 303, includedHours: 2 });
    expect(result.vanFlat.eligible).toBe(false);
  });

  it("9 items → no Small Move; hourly with 2 movers", () => {
    const result = calculateMovingQuote(input({ homeSize: "few_items", itemCount: 9, crew: 2 }));
    expect(result.packageOption).toBeUndefined();
    expect(result.recommended).toMatchObject({ kind: "hourly", crew: 2 });
  });

  it("3BR single level, one flight per address → Small House package", () => {
    const result = calculateMovingQuote(input({ homeSize: "3br", stories: 1, pickupFlights: 1, deliveryFlights: 1 }));
    expect(result.packageOption?.key).toBe("small_house");
    expect(result.packageOption?.extraFlights).toBe(0);
  });

  it("3BR with two flights at pickup → no package, 4 movers recommended", () => {
    const result = calculateMovingQuote(input({ homeSize: "3br", stories: 2, pickupFlights: 2 }));
    expect(result.packageOption).toBeUndefined();
    expect(result.recommended).toMatchObject({ kind: "hourly", crew: 4 });
  });

  it("stairs are never charged (Abe, Sep 18): 2BR with 3 + 2 flights still totals the flat package", () => {
    const result = calculateMovingQuote(input({ homeSize: "2br", pickupFlights: 3, deliveryFlights: 2, moveDate: "2026-09-16" }));
    expect(result.packageOption).toMatchObject({ extraFlights: 3, extraFlightsTotal: 0, total: 750 });
    expect(result.customerText).not.toMatch(/flights of stairs/i);
    expect(result.lines.some(line => line.key === "extra_flights")).toBe(false);
  });

  it("piano stairs are never charged either — stairs only add time on hourly jobs", () => {
    const result = calculateMovingQuote(input({ homeSize: "4br", piano: "upright", pianoStairLocations: 2, pickupFlights: 2 }));
    expect(result.addOnLines.some(line => line.key === "piano_stairs")).toBe(false);
    expect(result.addOnsTotal).toBe(299);
    expect(result.crewOptions[4].hours.low).toBeGreaterThan(5);
  });

  it("never offers a package on labor-only or 4BR+", () => {
    expect(calculateMovingQuote(input({ homeSize: "2br", laborOnly: true })).packageOption).toBeUndefined();
    expect(calculateMovingQuote(input({ homeSize: "4br" })).packageOption).toBeUndefined();
  });
});

describe("hourly minimums, labor-only, trip fee", () => {
  it("applies the 2-hour minimum to hourly crews and the 4-hour minimum to 4 movers", () => {
    const result = calculateMovingQuote(input({ homeSize: "2br", crew: 4, mode: "hourly", hoursOverride: { low: 1, high: 1 } }));
    expect(result.crewOptions[4].minimumApplied).toBe(true);
    expect(result.crewOptions[4].hours).toEqual({ low: 4, high: 4 });
    expect(result.crewOptions[4].notes).toContain("4-hour minimum");

    const two = calculateMovingQuote(input({ homeSize: "few_items", itemCount: 12, crew: 2, mode: "hourly", hoursOverride: { low: 0.5, high: 1 } }));
    expect(two.crewOptions[2].minimumApplied).toBe(true);
    expect(two.crewOptions[2].hours).toEqual({ low: 2, high: 2 });
  });

  it("labor-only 2 hrs weekday → $218, no trip fee, says 'no trip charge', never 'travel included'", () => {
    const result = calculateMovingQuote(input({ homeSize: "few_items", itemCount: 10, laborOnly: true, crew: 2, moveDate: "2026-09-16" }));
    expect(result.recommended.kind).toBe("labor_only");
    expect(result.crewOptions[2].tripFee).toBe(0);
    expect(result.crewOptions[2].labor.low).toBe(218);
    expect(result.total.low).toBe(218);
    expect(result.lines.some(line => line.key === "trip_fee")).toBe(false);
    expect(result.customerText).toContain("no trip charge");
    expect(result.customerText).not.toMatch(/travel included/i);
  });

  it("labor-only on a weekend is $124/hr with a $248 minimum", () => {
    const result = calculateMovingQuote(input({ homeSize: "few_items", itemCount: 10, laborOnly: true, crew: 2, moveDate: "2026-09-19" }));
    expect(result.crewOptions[2].rate).toBe(124);
    expect(result.crewOptions[2].labor.low).toBe(248);
  });

  it("trip fee sits in the internal breakdown and never in customer text", () => {
    const result = calculateMovingQuote(input({ homeSize: "4br", crew: 4, moveDate: "2026-09-16" }));
    const trip = result.lines.find(line => line.key === "trip_fee");
    expect(trip).toMatchObject({ low: 85, internalOnly: true });
    expect(result.customerText).not.toMatch(NEVER_IN_CUSTOMER_TEXT);
    for (const crew of [2, 3, 4] as const) {
      expect(customerTextFor(result ? input({ homeSize: "4br", crew: 4, moveDate: "2026-09-16" }) : input({}), crew)).not.toMatch(NEVER_IN_CUSTOMER_TEXT);
    }
  });

  it("rates follow base + (crew − 2) × 50, weekend +15", () => {
    const weekday = calculateMovingQuote(input({ homeSize: "3br", stories: 2, pickupFlights: 2, moveDate: "2026-09-16" }));
    expect([weekday.crewOptions[2].rate, weekday.crewOptions[3].rate, weekday.crewOptions[4].rate]).toEqual([109, 159, 209]);
    const weekend = calculateMovingQuote(input({ homeSize: "3br", stories: 2, pickupFlights: 2, moveDate: "2026-09-20" }));
    expect([weekend.crewOptions[2].rate, weekend.crewOptions[3].rate, weekend.crewOptions[4].rate]).toEqual([124, 174, 224]);
  });
});

describe("floors", () => {
  it("never lowers a price and records nothing when the rate card already meets the floor", () => {
    const result = calculateMovingQuote(input({ homeSize: "studio_1br" }));
    expect(result.floorsApplied).toEqual([]);
    expect(result.packageOption?.flatPrice).toBeGreaterThanOrEqual(525);
  });
  it("raises a labor-only quote to the $218 minimum", () => {
    const result = calculateMovingQuote(input({ homeSize: "few_items", itemCount: 10, laborOnly: true, crew: 2, hoursOverride: { low: 1, high: 1 } }));
    expect(result.crewOptions[2].labor.low).toBe(218);
  });
});

describe("4-mover wording", () => {
  it("every 4-mover customer text carries the fallback sentence verbatim", () => {
    for (const homeSize of ["2br", "3br", "4br", "5br_plus"] as const) {
      const base = input({ homeSize, stories: 2, pickupFlights: 2, crew: 4, mode: "hourly" });
      expect(calculateMovingQuote(base).customerText).toContain(FOURTH_MOVER_FALLBACK_SENTENCE);
      expect(customerTextFor(base, 4)).toContain(FOURTH_MOVER_FALLBACK_SENTENCE);
    }
  });
  it("hourly quotes say estimate, not fixed", () => {
    expect(calculateMovingQuote(input({ homeSize: "4br", crew: 4 })).customerText).toMatch(/estimate, not a fixed price/);
  });
});

describe("escalations", () => {
  const codes = (overrides: Partial<MovingQuoteInput>) =>
    calculateMovingQuote(input(overrides))
      .warnings.filter(warning => warning.severity === "escalate")
      .map(warning => warning.code);

  it("safe / hot tub / >300 lb / >50 mi / 4-mover >8 hrs / unusual piano access", () => {
    expect(codes({ specialtyFlags: { safe: true, hotTub: false, over300lb: false } })).toContain("safe");
    expect(codes({ specialtyFlags: { safe: false, hotTub: true, over300lb: false } })).toContain("hot_tub");
    expect(codes({ specialtyFlags: { safe: false, hotTub: false, over300lb: true } })).toContain("over_300lb");
    expect(codes({ distanceMiles: 60 })).toContain("distance_over_service_area");
    expect(codes({ homeSize: "5br_plus", crew: 4 })).toContain("four_movers_over_8h");
    expect(codes({ piano: "upright", pianoAccessUnusual: true })).toContain("piano_access");
  });

  it("second truck at $0 and same-day packing warn; big jobs recommend a walkthrough", () => {
    const result = calculateMovingQuote(
      input({
        homeSize: "4br",
        secondTruck: { requested: true, price: 0 },
        packing: { enabled: true, separateDay: false, packers: 2, hours: 2, materials: 50 },
      }),
    );
    const codes = result.warnings.map(warning => warning.code);
    expect(codes).toContain("second_truck_unpriced");
    expect(codes).toContain("packing_same_day");
    expect(codes).toContain("walkthrough");
    expect(calculateMovingQuote(input({ homeSize: "4br", walkthroughDone: true })).warnings.map(w => w.code)).not.toContain("walkthrough");
  });
});

describe("van flat / cargo van", () => {
  it("single item within 15 miles is van-flat eligible at $199", () => {
    const result = calculateMovingQuote(input({ homeSize: "few_items", itemCount: 1, distanceMiles: 12, mode: "van_flat" }));
    expect(result.vanFlat).toMatchObject({ price: 199, eligible: true });
    expect(result.total.low).toBe(199);
    expect(result.customerText).toContain("$199 flat");
  });
  it("van flat over 15 miles warns", () => {
    const result = calculateMovingQuote(input({ homeSize: "few_items", itemCount: 1, distanceMiles: 22, mode: "van_flat" }));
    expect(result.vanFlat.eligible).toBe(false);
    expect(result.warnings.map(w => w.code)).toContain("van_flat_ineligible");
  });
  it("cargo van is $120 with no trip charge", () => {
    const result = calculateMovingQuote(input({ homeSize: "few_items", itemCount: 1, mode: "cargo_van" }));
    expect(result.total.low).toBe(120);
    expect(result.customerText).toContain("no trip charge");
  });
});

describe("worked example — Ee Ee Eng (4BR, 2-story, Gilbert → North Phoenix, Mon 9/21)", () => {
  const eeEeEng = input({
    homeSize: "4br",
    stories: 2,
    pickupFlights: 1,
    deliveryFlights: 0,
    distanceMiles: 60,
    moveDate: "2026-09-21",
    piano: "baby_grand",
    pianoStairLocations: 0,
    assemblyAddOns: [
      { skuId: "bed_frame", qty: 1 },
      { skuId: "desk", qty: 1 },
    ],
    crew: 4,
    mode: "auto",
  });

  it("is a weekday with no package, 4 movers recommended", () => {
    const result = calculateMovingQuote(eeEeEng);
    expect(result.dayType).toBe("weekday");
    expect(result.dateLabel).toBe("Mon, Sep 21");
    expect(result.packageOption).toBeUndefined();
    expect(result.recommended).toMatchObject({ kind: "hourly", crew: 4 });
  });

  it("reproduces the crew table to the cent (labor + trip), piano $399 + add-ons $300 + extended travel $150", () => {
    const result = calculateMovingQuote(eeEeEng);
    const c = result.crewOptions;
    expect(c[2].rate).toBe(109);
    expect(c[2].hours).toEqual({ low: 8.5, high: 10.75 });
    expect(c[2].labor.low + c[2].tripFee).toBeCloseTo(1011.5, 2);
    expect(c[2].labor.high + c[2].tripFee).toBeCloseTo(1256.75, 2);
    expect(c[2].eligible).toBe(false);

    expect(c[3].rate).toBe(159);
    expect(c[3].hours).toEqual({ low: 6.5, high: 8.75 });
    expect(c[3].labor.low + c[3].tripFee).toBeCloseTo(1118.5, 2);
    expect(c[3].labor.high + c[3].tripFee).toBeCloseTo(1476.25, 2);
    expect(c[3].eligible).toBe(true);

    expect(c[4].rate).toBe(209);
    expect(c[4].hours).toEqual({ low: 5.5, high: 7.75 });
    expect(c[4].labor.low + c[4].tripFee).toBeCloseTo(1234.5, 2);
    expect(c[4].labor.high + c[4].tripFee).toBeCloseTo(1704.75, 2);
    expect(c[4].eligible).toBe(true);

    const piano = result.addOnLines.find(line => line.key === "piano");
    expect(piano?.low).toBe(399);
    const assembly = result.addOnLines.filter(line => line.key === "assembly").reduce((sum, line) => sum + line.low, 0);
    expect(assembly).toBe(300);
    const travel = result.addOnLines.find(line => line.key === "extended_travel");
    expect(travel?.low).toBe(150);
    // Spec table totals (699 of add-ons) + the $150 extended-travel line the spec says is added automatically.
    expect(result.addOnsTotal).toBe(849);
    expect(c[2].total).toEqual({ low: 1710.5 + 150, high: 1955.75 + 150 });
    expect(c[3].total).toEqual({ low: 1817.5 + 150, high: 2175.25 + 150 });
    expect(c[4].total).toEqual({ low: 1933.5 + 150, high: 2403.75 + 150 });
    expect(result.total).toEqual(c[4].total);
  });

  it("warns about the 60-mile distance and recommends a walkthrough; 4-mover text has the fallback", () => {
    const result = calculateMovingQuote(eeEeEng);
    const codes = result.warnings.map(warning => warning.code);
    expect(codes).toContain("distance_over_service_area");
    expect(codes).toContain("walkthrough");
    expect(result.customerText).toContain(FOURTH_MOVER_FALLBACK_SENTENCE);
    expect(result.customerText).toContain("$209/hr");
    expect(result.customerText).toContain("baby grand is a separate flat rate of $399 added on top");
    expect(result.customerText).toContain("travel included, no hidden fees");
    expect(result.customerText).not.toMatch(NEVER_IN_CUSTOMER_TEXT);
  });

  it("after the Sep 8 walkthrough: 10 packer hours + $500 flat materials, playset, 6–8 hrs override, 58 mi → $3,977–$4,395", () => {
    const result = calculateMovingQuote({
      ...eeEeEng,
      distanceMiles: 58,
      assemblyAddOns: [],
      packing: { enabled: true, separateDay: true, packingDate: "2026-09-17", packers: 2, hours: 10, materials: 500 },
      playStructure: { enabled: true, mode: "flat", price: 499 },
      hoursOverride: { low: 6, high: 8 },
      walkthroughDone: true,
      crew: 4,
      mode: "hourly",
    });
    const byKey = (key: string) => result.lines.find(line => line.key === key);
    expect(byKey("packing_labor")).toMatchObject({ low: 1090 });
    expect(byKey("packing_labor")?.label).toContain("Thu, Sep 17");
    expect(byKey("packing_materials")).toMatchObject({ low: 500 });
    expect(byKey("labor")).toMatchObject({ low: 1254, high: 1672 });
    expect(byKey("trip_fee")).toMatchObject({ low: 85, internalOnly: true });
    expect(byKey("extended_travel")).toMatchObject({ low: 150 });
    expect(byKey("piano")).toMatchObject({ low: 399 });
    expect(byKey("play_structure")).toMatchObject({ low: 499 });
    expect(result.total).toEqual({ low: 3977, high: 4395 });
    expect(result.warnings.map(w => w.code)).not.toContain("walkthrough");
    expect(result.customerText).toContain("$209/hr");
    expect(result.customerText).toContain("6–8 hours");
    expect(result.customerText).toContain(FOURTH_MOVER_FALLBACK_SENTENCE);
    expect(result.customerText).not.toMatch(NEVER_IN_CUSTOMER_TEXT);
  });
});
