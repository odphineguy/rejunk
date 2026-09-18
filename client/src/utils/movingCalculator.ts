/**
 * Moving quote engine — pricing v19 (MOVING_ESTIMATOR_V19_SPEC, Sep 2026).
 *
 * Pure functions, no React, no storage. Reads ONLY `MOVING_RATES` /
 * `HOURS_TABLE` from `data/movingRates.ts` — never pricebook item names.
 *
 * Shape of a quote:
 *   • every crew size (2 / 3 / 4) is always computed so the office can compare;
 *   • a flat package is offered when the home qualifies;
 *   • add-ons (piano, stairs, assembly, TV mounts, packing, play structure,
 *     second truck, extended travel) are shared by every option;
 *   • the trip fee is baked into truck totals and NEVER itemized to the customer;
 *   • floors only ever raise a price; warnings never block.
 */

import {
  ASSEMBLY_SKUS,
  FOURTH_MOVER_FALLBACK_SENTENCE,
  HOURS_TABLE,
  MOVING_RATES,
  assemblySkuById,
  dayTypeOf,
  shortDateLabel,
  type CrewSize,
  type DayType,
  type HomeSize,
  type HoursRange,
  type PackageKey,
  type PianoType,
} from "@/data/movingRates";
import type {
  CrewOption,
  MovingFloorApplied,
  MovingQuoteInput,
  MovingQuoteLine,
  MovingQuoteResult,
  MovingRecommendation,
  MovingWarning,
  PackageOption,
  QuoteKind,
} from "@/types/moving";

export const CREW_SIZES: readonly CrewSize[] = [2, 3, 4];

const R = MOVING_RATES;

// ── Small helpers ───────────────────────────────────────────────────────────

/** Round up to the next quarter hour. */
export function ceil4(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.ceil(hours * 4 - 1e-9) / 4;
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function dollars(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function hoursLabel(range: HoursRange): string {
  const fmt = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
  return range.low === range.high ? `${fmt(range.low)} hours` : `${fmt(range.low)}–${fmt(range.high)} hours`;
}

const HOME_SIZE_LABEL: Record<HomeSize, string> = {
  few_items: "a few items",
  studio_1br: "studio / 1-bedroom",
  "2br": "2-bedroom",
  "3br": "3-bedroom",
  "4br": "4-bedroom",
  "5br_plus": "5+ bedroom",
};

const PIANO_LABEL: Record<Exclude<PianoType, "none">, string> = {
  upright: "upright piano",
  large_upright: "large upright piano",
  baby_grand: "baby grand",
  grand: "grand piano",
};

export function homeSizeLabel(size: HomeSize): string {
  return HOME_SIZE_LABEL[size];
}

export function pianoLabel(piano: PianoType): string {
  return piano === "none" ? "" : PIANO_LABEL[piano];
}

/** Resolve the move-day type: manual override → date rule → weekday. */
export function resolveDayType(input: Pick<MovingQuoteInput, "moveDate" | "dayType">): DayType {
  if (input.dayType) return input.dayType;
  if (input.moveDate) return dayTypeOf(input.moveDate);
  return "weekday";
}

export function hourlyRate(crew: CrewSize, dayType: DayType): number {
  return R.hourly[dayType] + (crew - 2) * R.extraMoverPerHour;
}

// ── Floors ──────────────────────────────────────────────────────────────────

function applyFloor(label: string, value: number, floor: number, floors: MovingFloorApplied[]): number {
  if (value < floor) {
    floors.push({ label, from: value, to: floor });
    return floor;
  }
  return value;
}

// ── Extended travel ─────────────────────────────────────────────────────────

export function extendedTravelFor(miles: number | undefined): { price: number; label: string; manual: boolean } | null {
  if (miles == null || !Number.isFinite(miles) || miles <= R.extendedTravel.freeUpToMiles) return null;
  for (const tier of R.extendedTravel.tiers) {
    if (miles <= tier.maxMiles) return { price: tier.price, label: tier.label, manual: false };
  }
  return { price: 0, label: `over ${R.extendedTravel.tiers[R.extendedTravel.tiers.length - 1].maxMiles} mi`, manual: true };
}

// ── Packing ─────────────────────────────────────────────────────────────────

export interface PackingBreakdown {
  dayType: DayType;
  dateLabel: string;
  packers: number;
  hours: number;
  ratePerHour: number;
  labor: number;
  boxes: number;
  perBox: number;
  materials: number;
}

export function packingBreakdown(input: MovingQuoteInput, moveDayType: DayType): PackingBreakdown | null {
  const p = input.packing;
  if (!p?.enabled) return null;
  const packers = p.packers ?? 2;
  const boxes = Math.max(0, Math.round(p.boxes ?? 0));
  const dayType: DayType =
    p.separateDay && p.packingDate ? dayTypeOf(p.packingDate) : p.separateDay ? "weekday" : moveDayType;
  const teams = packers / 2; // rate is per 2 packers
  const hours =
    p.hoursOverride != null && p.hoursOverride > 0
      ? ceil4(p.hoursOverride)
      : ceil4(boxes / (R.packing.boxesPerPackerHour * teams));
  const ratePerHour = R.packing.ratePer2Packers[dayType] * teams;
  const perBox = p.perBoxMaterials ?? R.packing.perBoxMaterials;
  return {
    dayType,
    dateLabel: p.separateDay && p.packingDate ? shortDateLabel(p.packingDate) : "",
    packers,
    hours,
    ratePerHour,
    labor: cents(ratePerHour * hours),
    boxes,
    perBox,
    materials: cents(boxes * perBox),
  };
}

// ── Add-on lines (shared by every option) ───────────────────────────────────

function buildAddOnLines(input: MovingQuoteInput, dayType: DayType, warnings: MovingWarning[]): MovingQuoteLine[] {
  const lines: MovingQuoteLine[] = [];
  const flat = (key: MovingQuoteLine["key"], label: string, amount: number, detail?: string): MovingQuoteLine => ({
    key,
    label,
    detail,
    low: cents(amount),
    high: cents(amount),
  });

  // Extended travel — the only travel line ever itemized.
  const travel = extendedTravelFor(input.distanceMiles);
  if (travel && !travel.manual) {
    lines.push(flat("extended_travel", `Extended travel, ${Math.round(input.distanceMiles!)} mi (${travel.label} tier)`, travel.price, "flat"));
  } else if (travel?.manual) {
    warnings.push({
      code: "distance_over_100",
      severity: "escalate",
      message: `${Math.round(input.distanceMiles!)} miles — over 100 miles, price the extended travel manually.`,
    });
  }

  // Piano
  if (input.piano !== "none") {
    const price = R.piano[input.piano];
    lines.push(flat("piano", `${pianoLabel(input.piano).replace(/^./, c => c.toUpperCase())}`, price, "flat, added on top"));
    if (input.pianoStairLocations > 0) {
      lines.push(
        flat(
          "piano_stairs",
          `Piano stairs / difficult access × ${input.pianoStairLocations}`,
          R.piano.stairsPerLocation * input.pianoStairLocations,
          `${input.pianoStairLocations} × $${R.piano.stairsPerLocation}`,
        ),
      );
    }
  }

  // Assembly SKUs (same visit → no separate $125 minimum; decision 6 default).
  for (const addOn of input.assemblyAddOns ?? []) {
    const sku = assemblySkuById(addOn.skuId);
    const qty = Math.max(0, Math.round(addOn.qty));
    if (!sku || qty === 0) continue;
    lines.push(flat("assembly", `${sku.name}${qty > 1 ? ` × ${qty}` : ""}`, sku.price * qty, `${qty} × $${sku.price}`));
  }

  // TV mounts
  const tv = input.tvMounts ?? { upTo65: 0, over65: 0 };
  if (tv.upTo65 > 0) lines.push(flat("tv_mounts", `TV mounting ≤65" × ${tv.upTo65}`, R.tvMount.upTo65 * tv.upTo65, `${tv.upTo65} × $${R.tvMount.upTo65}`));
  if (tv.over65 > 0) lines.push(flat("tv_mounts", `TV mounting >65" × ${tv.over65}`, R.tvMount.over65 * tv.over65, `${tv.over65} × $${R.tvMount.over65}`));

  // Packing
  const packing = packingBreakdown(input, dayType);
  if (packing) {
    const when = packing.dateLabel ? `, ${packing.dateLabel} (${packing.dayType})` : input.packing.separateDay ? " (separate day)" : " (same day as the move)";
    lines.push(
      flat(
        "packing_labor",
        `Packing labor${when}`,
        packing.labor,
        `${packing.packers} packers, ${packing.hours} hrs × $${packing.ratePerHour}`,
      ),
    );
    lines.push(flat("packing_materials", "Packing materials", packing.materials, `${packing.boxes} boxes × $${packing.perBox}`));
    if (!input.packing.separateDay) {
      warnings.push({
        code: "packing_same_day",
        severity: "warning",
        message: "Same-day packing — add the packer hours to the move-day range.",
      });
    }
  }

  // Play structure — its own line, never move-day hours.
  if (input.playStructure?.enabled) {
    if (input.playStructure.mode === "hourly") {
      const hours = ceil4(input.playStructure.hours ?? 0);
      const rate = R.laborOnly[dayType];
      lines.push(flat("play_structure", "Play structure disassemble + reassemble (hourly)", rate * hours, `${hours} hrs × $${rate}`));
    } else {
      lines.push(flat("play_structure", "Play structure disassemble + reassemble", input.playStructure.price ?? R.playStructureFlat, "flat"));
    }
  }

  // Second truck — manual line, Abe decides per job.
  if (input.secondTruck?.requested) {
    lines.push(flat("second_truck", "Second truck", input.secondTruck.price ?? 0, "manual"));
    if (!(input.secondTruck.price > 0)) {
      warnings.push({
        code: "second_truck_unpriced",
        severity: "warning",
        message: "Second truck — set a price or confirm no charge.",
      });
    }
  }

  return lines;
}

// ── Crew options ────────────────────────────────────────────────────────────

function crewOption(
  input: MovingQuoteInput,
  crew: CrewSize,
  dayType: DayType,
  addOnsTotal: number,
  floors: MovingFloorApplied[],
): CrewOption {
  const notes: string[] = [];
  const laborOnly = input.laborOnly;
  const baseHours = HOURS_TABLE[input.homeSize][crew];
  const minimum = crew === 4 ? R.minimumHours.fourMovers : R.minimumHours.default;

  let rate = laborOnly ? R.laborOnly[dayType] : hourlyRate(crew, dayType);
  const rateFloor = R.floors.hourly[dayType] + (crew - 2) * R.floors.extraMover;
  rate = applyFloor(`${crew}-mover hourly rate`, rate, rateFloor, floors);

  const flights = Math.max(0, input.pickupFlights ?? 0) + Math.max(0, input.deliveryFlights ?? 0);
  let hours: HoursRange;
  if (input.hoursOverride && crew === input.crew) {
    hours = { low: input.hoursOverride.low, high: Math.max(input.hoursOverride.low, input.hoursOverride.high) };
  } else if (baseHours) {
    hours = {
      low: baseHours.low + flights * R.hoursPerFlight.low,
      high: baseHours.high + flights * R.hoursPerFlight.high,
    };
  } else {
    hours = { low: minimum, high: minimum };
  }
  const minimumApplied = hours.low < minimum;
  if (minimumApplied) {
    hours = { low: minimum, high: Math.max(minimum, hours.high) };
    notes.push(`${minimum}-hour minimum`);
  } else if (crew === 4) {
    notes.push("4-hour minimum");
  }

  let laborLow = cents(rate * hours.low);
  const laborHigh = cents(rate * hours.high);
  if (laborOnly) {
    laborLow = applyFloor("Labor-only minimum", laborLow, R.floors.laborOnlyMinimum[dayType], floors);
  }
  const tripFee = laborOnly ? 0 : R.tripFee;

  let eligible = true;
  let ineligibleReason: string | undefined;
  if (laborOnly && crew !== 2) {
    eligible = false;
    ineligibleReason = "Labor-only is a 2-mover job.";
  } else if (!baseHours) {
    eligible = false;
    ineligibleReason = `${crew} movers aren't offered for ${homeSizeLabel(input.homeSize)}.`;
  } else if (crew === 2 && hours.low > R.escalateAboveHours) {
    eligible = false;
    ineligibleReason = `Over ${R.escalateAboveHours} hours with 2 movers — add crew.`;
  }
  if (crew === 4 && eligible && hours.high > R.escalateAboveHours) {
    notes.push(`Over ${R.escalateAboveHours} hours — needs dispatch review`);
  }
  if (crew === 4) notes.push(FOURTH_MOVER_FALLBACK_SENTENCE);

  return {
    crew,
    rate,
    hours,
    baseHours,
    minimumApplied,
    labor: { low: laborLow, high: Math.max(laborLow, laborHigh) },
    tripFee,
    addOnsTotal,
    total: { low: cents(laborLow + tripFee + addOnsTotal), high: cents(Math.max(laborLow, laborHigh) + tripFee + addOnsTotal) },
    notes,
    eligible,
    ineligibleReason,
  };
}

// ── Package eligibility ─────────────────────────────────────────────────────

export function packageKeyFor(input: MovingQuoteInput): PackageKey | null {
  if (input.laborOnly) return null;
  switch (input.homeSize) {
    case "few_items":
      return (input.itemCount ?? 0) > 0 && (input.itemCount ?? 0) <= R.smallMoveMaxItems ? "small_move" : null;
    case "studio_1br":
      return "studio_1br";
    case "2br":
      return "2br";
    case "3br":
      return input.stories <= 2 && (input.pickupFlights ?? 0) <= 1 && (input.deliveryFlights ?? 0) <= 1 ? "small_house" : null;
    default:
      return null;
  }
}

function packageOptionFor(input: MovingQuoteInput, dayType: DayType, addOnsTotal: number, floors: MovingFloorApplied[]): PackageOption | undefined {
  const key = packageKeyFor(input);
  if (!key) return undefined;
  const pkg = R.packages[key];
  const floorByKey: Record<PackageKey, number> = {
    small_move: R.floors.smallMove,
    studio_1br: R.floors.studio,
    "2br": R.floors.twoBrOrSmallHouse,
    small_house: R.floors.twoBrOrSmallHouse,
  };
  const flatPrice = applyFloor(`${pkg.name} package`, pkg.price[dayType], floorByKey[key], floors);
  const extraFlights = Math.max(0, (input.pickupFlights ?? 0) - 1) + Math.max(0, (input.deliveryFlights ?? 0) - 1);
  const extraFlightsTotal = extraFlights * R.extraFlightOfStairs;
  return {
    key,
    name: pkg.name,
    flatPrice,
    includedHours: pkg.includedHours,
    overageRate: R.packageOverage[dayType],
    extraFlights,
    extraFlightsTotal,
    crewShown: pkg.crewShown,
    addOnsTotal,
    total: cents(flatPrice + extraFlightsTotal + addOnsTotal),
  };
}

// ── Van flat / cargo van ────────────────────────────────────────────────────

function vanFlatFor(input: MovingQuoteInput): { price: number; eligible: boolean; reason?: string } {
  const price = Math.max(R.vanFlat.price, R.floors.vanFlat);
  if (input.homeSize !== "few_items" || (input.itemCount ?? 0) > 1) {
    return { price, eligible: false, reason: "Van flat is for a single large item (or an item plus its set)." };
  }
  if ((input.distanceMiles ?? 0) > R.vanFlat.maxMiles) {
    return { price, eligible: false, reason: `Van flat covers up to ${R.vanFlat.maxMiles} miles between addresses.` };
  }
  const flags = input.specialtyFlags ?? { safe: false, hotTub: false, over300lb: false };
  if (flags.safe || flags.hotTub || flags.over300lb) {
    return { price, eligible: false, reason: "Van flat excludes safes, hot tubs, and items over 150 lb." };
  }
  return { price, eligible: true };
}

// ── Recommendation ──────────────────────────────────────────────────────────

function recommend(
  input: MovingQuoteInput,
  crewOptions: Record<CrewSize, CrewOption>,
  packageOption: PackageOption | undefined,
): MovingRecommendation {
  if (input.laborOnly) {
    return { kind: "labor_only", crew: 2, reason: "Customer provides the truck — 2 movers, no trip charge." };
  }
  if (packageOption) {
    return { kind: "package", crew: packageOption.crewShown, reason: `${packageOption.name} fits — packages first.` };
  }
  let crew: CrewSize;
  let reason: string;
  switch (input.homeSize) {
    case "few_items":
    case "studio_1br":
      crew = 2;
      reason = "Small job — 2 movers and the truck.";
      break;
    case "2br":
      crew = 3;
      reason = "2-bedroom — never quote 2 movers on a 2BR or larger.";
      break;
    default:
      crew = 4;
      reason = "3BR+ / large house — v19 quotes 4 movers with a 4-hour minimum.";
  }
  if (!crewOptions[crew].eligible) {
    const next = CREW_SIZES.find(size => size > crew && crewOptions[size].eligible) ?? CREW_SIZES.find(size => crewOptions[size].eligible);
    if (next) {
      reason = crewOptions[crew].ineligibleReason ?? reason;
      crew = next;
    }
  }
  return { kind: "hourly", crew, reason };
}

// ── Customer text ───────────────────────────────────────────────────────────

const ESTIMATE_NOT_FIXED = "This is an estimate, not a fixed price — you only pay for the time we actually work, billed in quarter hours.";

function addOnSentences(lines: MovingQuoteLine[], input: MovingQuoteInput): string[] {
  const out: string[] = [];
  const piano = lines.find(line => line.key === "piano");
  if (piano) {
    const stairs = lines.find(line => line.key === "piano_stairs");
    out.push(
      `The ${pianoLabel(input.piano)} is a separate flat rate of ${dollars(piano.low)} added on top${
        stairs ? ` (plus ${dollars(stairs.low)} for stairs / difficult access)` : ""
      }.`,
    );
  }
  const travel = lines.find(line => line.key === "extended_travel");
  if (travel) out.push(`Because the two addresses are ${Math.round(input.distanceMiles ?? 0)} miles apart there's an extended travel charge of ${dollars(travel.low)}.`);
  const assembly = lines.filter(line => line.key === "assembly");
  if (assembly.length) {
    out.push(
      `Furniture assembly at the new place: ${assembly.map(line => `${line.label.toLowerCase()} (${dollars(line.low)})`).join(", ")} — ${dollars(
        assembly.reduce((sum, line) => sum + line.low, 0),
      )} total.`,
    );
  }
  const tv = lines.filter(line => line.key === "tv_mounts");
  if (tv.length) out.push(`TV mounting: ${tv.map(line => `${line.label.replace("TV mounting ", "")} (${dollars(line.low)})`).join(", ")}.`);
  const packingLabor = lines.find(line => line.key === "packing_labor");
  const packingMaterials = lines.find(line => line.key === "packing_materials");
  if (packingLabor) {
    out.push(
      `Packing${packingLabor.label.replace("Packing labor", "")}: ${packingLabor.detail ?? ""}${
        packingMaterials ? `, plus materials (${packingMaterials.detail ?? ""})` : ""
      } — about ${dollars(packingLabor.low + (packingMaterials?.low ?? 0))}.`,
    );
  }
  const play = lines.find(line => line.key === "play_structure");
  if (play) out.push(`Play structure take-down and reassembly: ${dollars(play.low)}${play.detail === "flat" ? " flat" : ""}.`);
  const secondTruck = lines.find(line => line.key === "second_truck");
  if (secondTruck) out.push(secondTruck.low > 0 ? `Second truck: ${dollars(secondTruck.low)}.` : "Second truck at no extra charge.");
  return out;
}

function hourlyText(input: MovingQuoteInput, option: CrewOption, lines: MovingQuoteLine[], total: HoursRange, dayType: DayType): string {
  const addOns = addOnSentences(lines, input);
  const crewTruck = { low: option.labor.low + option.tripFee, high: option.labor.high + option.tripFee };
  const parts: string[] = [
    `${option.crew} movers with our 26-ft liftgate truck at ${dollars(option.rate)}/hr${dayType === "weekend" ? " (weekend rate)" : ""}. Most ${homeSizeLabel(
      input.homeSize,
    )} moves like yours run about ${hoursLabel(option.hours)}, so you're looking at roughly ${dollars(crewTruck.low)}–${dollars(
      crewTruck.high,
    )} all-in for the crew and truck — travel included, no hidden fees.`,
  ];
  if (option.minimumApplied || option.crew === 4) parts.push(`There's a ${option.crew === 4 ? 4 : R.minimumHours.default}-hour minimum.`);
  parts.push(...addOns);
  if (addOns.length) parts.push(`Estimated total: ${dollars(total.low)}–${dollars(total.high)}.`);
  parts.push(ESTIMATE_NOT_FIXED);
  if (option.crew === 4) parts.push(FOURTH_MOVER_FALLBACK_SENTENCE);
  return parts.join("\n");
}

function packageText(input: MovingQuoteInput, pkg: PackageOption, lines: MovingQuoteLine[]): string {
  const addOns = addOnSentences(lines, input);
  const parts: string[] = [
    `Our ${pkg.name} package is ${dollars(pkg.flatPrice)} flat, travel included — ${pkg.crewShown} experienced professional movers, our 26-ft liftgate truck, blankets, shrink wrap, and disassembly/reassembly. That covers ${pkg.includedHours} hours on site; anything past that is ${dollars(
      pkg.overageRate,
    )}/hr, billed in quarter hours.`,
  ];
  if (pkg.extraFlights > 0) parts.push(`Additional flights of stairs: ${pkg.extraFlights} × ${dollars(R.extraFlightOfStairs)} = ${dollars(pkg.extraFlightsTotal)}.`);
  parts.push(...addOns);
  if (pkg.extraFlights > 0 || addOns.length) parts.push(`Total: ${dollars(pkg.total)}.`);
  return parts.join("\n");
}

function laborOnlyText(input: MovingQuoteInput, option: CrewOption, lines: MovingQuoteLine[], total: HoursRange): string {
  const addOns = addOnSentences(lines, input);
  const parts: string[] = [
    `2 movers, labor only (your truck) at ${dollars(option.rate)}/hr with a ${R.laborOnly.minimumHours}-hour minimum (${dollars(
      option.rate * R.laborOnly.minimumHours,
    )}) — no trip charge. We estimate about ${hoursLabel(option.hours)}, so roughly ${dollars(option.labor.low)}–${dollars(option.labor.high)}.`,
    "Full payment is due at booking for labor-only jobs.",
  ];
  parts.push(...addOns);
  if (addOns.length) parts.push(`Estimated total: ${dollars(total.low)}–${dollars(total.high)}.`);
  parts.push(ESTIMATE_NOT_FIXED);
  return parts.join("\n");
}

function vanFlatText(input: MovingQuoteInput, price: number, lines: MovingQuoteLine[], total: number): string {
  const addOns = addOnSentences(lines, input);
  const parts = [
    `${dollars(price)} flat for a single large item (or the item plus its matching set) with our cargo van — up to ${R.vanFlat.maxMiles} miles between addresses, travel included.`,
    ...addOns,
  ];
  if (addOns.length) parts.push(`Total: ${dollars(total)}.`);
  return parts.join("\n");
}

function cargoVanText(input: MovingQuoteInput, price: number, lines: MovingQuoteLine[], total: number): string {
  const addOns = addOnSentences(lines, input);
  const parts = [`${dollars(price)} flat for a single small-item pickup and delivery with our cargo van (one person) — no trip charge.`, ...addOns];
  if (addOns.length) parts.push(`Total: ${dollars(total)}.`);
  return parts.join("\n");
}

// ── Main entry ──────────────────────────────────────────────────────────────

export function calculateMovingQuote(input: MovingQuoteInput): MovingQuoteResult {
  const dayType = resolveDayType(input);
  const dateLabel = input.moveDate ? shortDateLabel(input.moveDate) : "";
  const warnings: MovingWarning[] = [];
  const floors: MovingFloorApplied[] = [];

  const addOnLines = buildAddOnLines(input, dayType, warnings);
  const addOnsTotal = cents(addOnLines.reduce((sum, line) => sum + line.low, 0));

  const crewOptions = Object.fromEntries(CREW_SIZES.map(crew => [crew, crewOption(input, crew, dayType, addOnsTotal, floors)])) as Record<CrewSize, CrewOption>;
  const packageOption = packageOptionFor(input, dayType, addOnsTotal, floors);
  const vanFlat = vanFlatFor(input);
  const cargoVan = { price: Math.max(R.cargoVanSmallItem, R.floors.cargoVan) };

  const recommended = recommend(input, crewOptions, packageOption);

  // Resolve the selected option from `mode`.
  let selected: MovingRecommendation;
  switch (input.mode) {
    case "van_flat":
      selected = { kind: "van_flat", reason: vanFlat.eligible ? "Van flat selected." : vanFlat.reason ?? "Van flat selected." };
      break;
    case "cargo_van":
      selected = { kind: "cargo_van", reason: "Cargo van small-item delivery selected." };
      break;
    case "labor_only":
      selected = { kind: "labor_only", crew: 2, reason: "Labor-only selected." };
      break;
    case "package":
      selected = packageOption
        ? { kind: "package", crew: packageOption.crewShown, reason: "Package selected." }
        : { kind: input.laborOnly ? "labor_only" : "hourly", crew: input.laborOnly ? 2 : input.crew, reason: "No package fits — hourly." };
      break;
    case "hourly":
      selected = input.laborOnly
        ? { kind: "labor_only", crew: 2, reason: "Labor-only (customer's truck)." }
        : { kind: "hourly", crew: input.crew, reason: `${input.crew} movers selected.` };
      break;
    default:
      selected = recommended;
  }

  // Lines + total for the selected option.
  const lines: MovingQuoteLine[] = [];
  let total: HoursRange;
  let customerText: string;
  const kind: QuoteKind = selected.kind;
  if (kind === "package" && packageOption) {
    lines.push({
      key: "package",
      label: `${packageOption.name} (${dayType})`,
      detail: `${packageOption.includedHours} hrs included · ${dollars(packageOption.overageRate)}/hr after`,
      low: packageOption.flatPrice,
      high: packageOption.flatPrice,
    });
    if (packageOption.extraFlights > 0) {
      lines.push({
        key: "extra_flights",
        label: `Additional flights of stairs × ${packageOption.extraFlights}`,
        detail: `${packageOption.extraFlights} × $${R.extraFlightOfStairs}`,
        low: packageOption.extraFlightsTotal,
        high: packageOption.extraFlightsTotal,
      });
    }
    lines.push(...addOnLines);
    total = { low: packageOption.total, high: packageOption.total };
    customerText = packageText(input, packageOption, addOnLines);
  } else if (kind === "van_flat") {
    lines.push({ key: "van_flat", label: "Cargo van flat — single large item", low: vanFlat.price, high: vanFlat.price });
    lines.push(...addOnLines);
    total = { low: cents(vanFlat.price + addOnsTotal), high: cents(vanFlat.price + addOnsTotal) };
    customerText = vanFlatText(input, vanFlat.price, addOnLines, total.low);
    if (!vanFlat.eligible) warnings.push({ code: "van_flat_ineligible", severity: "warning", message: vanFlat.reason ?? "Van flat doesn't apply." });
  } else if (kind === "cargo_van") {
    lines.push({ key: "cargo_van", label: "Cargo van small-item delivery (1 person)", low: cargoVan.price, high: cargoVan.price });
    lines.push(...addOnLines);
    total = { low: cents(cargoVan.price + addOnsTotal), high: cents(cargoVan.price + addOnsTotal) };
    customerText = cargoVanText(input, cargoVan.price, addOnLines, total.low);
  } else {
    const crew = (selected.crew ?? (kind === "labor_only" ? 2 : input.crew)) as CrewSize;
    // Labor-only pricing needs the labor-only rate even if the input flag is off (mode override).
    const option =
      kind === "labor_only" && !input.laborOnly
        ? crewOption({ ...input, laborOnly: true, crew }, crew, dayType, addOnsTotal, floors)
        : crewOptions[crew];
    lines.push({
      key: "labor",
      label: kind === "labor_only" ? "Labor only — 2 movers, no truck" : `${crew} movers + 26-ft liftgate truck (${dayType})`,
      detail: `${hoursLabel(option.hours)} × $${option.rate}`,
      low: option.labor.low,
      high: option.labor.high,
    });
    if (option.tripFee > 0) {
      lines.push({ key: "trip_fee", label: "Trip fee (internal — travel included in customer text)", low: option.tripFee, high: option.tripFee, internalOnly: true });
    }
    lines.push(...addOnLines);
    total = option.total;
    customerText = kind === "labor_only" ? laborOnlyText(input, option, addOnLines, total) : hourlyText(input, option, addOnLines, total, dayType);
    if (kind === "hourly" && crew === 2 && input.homeSize !== "few_items" && input.homeSize !== "studio_1br") {
      warnings.push({ code: "two_movers_on_2br_plus", severity: "warning", message: "Never quote 2 movers on a 2BR or larger — pick 3 or 4." });
    }
    if (!option.eligible && option.ineligibleReason) {
      warnings.push({ code: "crew_ineligible", severity: "warning", message: option.ineligibleReason });
    }
  }

  // ── Warnings (never block) ────────────────────────────────────────────────
  const miles = input.distanceMiles;
  if (miles != null && miles > R.serviceAreaMiles) {
    warnings.push({
      code: "distance_over_service_area",
      severity: "escalate",
      message: `${Math.round(miles)} miles — beyond the ${R.serviceAreaMiles}-mile service area, dispatch approval.`,
    });
  }
  const flags = input.specialtyFlags ?? { safe: false, hotTub: false, over300lb: false };
  if (flags.safe) warnings.push({ code: "safe", severity: "escalate", message: "Safe — never auto-price; escalate for weight and access." });
  if (flags.hotTub) warnings.push({ code: "hot_tub", severity: "escalate", message: "Hot tub — escalate; not auto-priced." });
  if (flags.over300lb) warnings.push({ code: "over_300lb", severity: "escalate", message: "Item over 300 lb (non-piano) — escalate; not auto-priced." });
  if (crewOptions[4].baseHours && crewOptions[4].hours.high > R.escalateAboveHours) {
    warnings.push({
      code: "four_movers_over_8h",
      severity: "escalate",
      message: `4-mover estimate runs past ${R.escalateAboveHours} hours — large job, needs dispatch review.`,
    });
  }
  if (input.piano !== "none" && input.pianoAccessUnusual) {
    warnings.push({ code: "piano_access", severity: "escalate", message: "Unusual piano access (crane / balcony / spiral / >2 flights) — escalate." });
  }
  const bigJob = input.homeSize === "3br" || input.homeSize === "4br" || input.homeSize === "5br_plus";
  const special = input.piano !== "none" || flags.safe || flags.hotTub || flags.over300lb || Boolean(input.playStructure?.enabled);
  if (!input.walkthroughDone && (bigJob || input.packing?.enabled || special)) {
    warnings.push({ code: "walkthrough", severity: "info", message: "Recommend a walkthrough before confirming this quote." });
  }

  return {
    pricingVersion: R.pricingVersion,
    dayType,
    dateLabel,
    selected,
    recommended,
    crewOptions,
    packageOption,
    vanFlat,
    cargoVan,
    addOnLines,
    addOnsTotal,
    lines,
    total,
    floorsApplied: floors,
    warnings,
    customerText,
  };
}

/** Copy-ready customer text for a specific crew column (hourly / labor-only). */
export function customerTextFor(input: MovingQuoteInput, crew: CrewSize): string {
  return calculateMovingQuote({ ...input, crew, mode: input.laborOnly ? "labor_only" : "hourly", hoursOverride: crew === input.crew ? input.hoursOverride : undefined }).customerText;
}

/** A fresh, empty input with every default from the spec. */
export function defaultMovingInput(overrides: Partial<MovingQuoteInput> = {}): MovingQuoteInput {
  return {
    moveDate: undefined,
    dayType: undefined,
    homeSize: "2br",
    itemCount: undefined,
    stories: 1,
    pickupFlights: 0,
    deliveryFlights: 0,
    distanceMiles: undefined,
    laborOnly: false,
    crew: 3,
    hoursOverride: undefined,
    packing: { enabled: false, separateDay: true, packingDate: undefined, packers: 2, boxes: 0, hoursOverride: undefined, perBoxMaterials: R.packing.perBoxMaterials },
    playStructure: { enabled: false, mode: "flat", price: R.playStructureFlat, hours: undefined },
    secondTruck: { requested: false, price: 0 },
    walkthroughDone: false,
    piano: "none",
    pianoStairLocations: 0,
    pianoAccessUnusual: false,
    assemblyAddOns: [],
    tvMounts: { upTo65: 0, over65: 0 },
    specialtyFlags: { safe: false, hotTub: false, over300lb: false },
    mode: "auto",
    ...overrides,
  };
}

export { ASSEMBLY_SKUS, FOURTH_MOVER_FALLBACK_SENTENCE };
