/**
 * Moving pricing v19 — the app-side rate card.
 *
 * Mirror of `businesses.responder_config.agent_rates` / `pricing_guards` in
 * rejunk-prod (tenant `progressive`). A rate change is made there first
 * (pipeline), then here. The app must never read the `businesses` table.
 *
 * The moving quote engine (`utils/movingCalculator.ts`) reads ONLY this object —
 * never pricebook item names. `pricebook_items` carries the same numbers for the
 * Pricebook page / HCP sync, but it is not the engine's input.
 */

export type DayType = "weekday" | "weekend";
export type HomeSize =
  | "few_items"
  | "studio_1br"
  | "2br"
  | "3br"
  | "4br"
  | "5br_plus";
export type PianoType =
  | "none"
  | "upright"
  | "large_upright"
  | "baby_grand"
  | "grand";
export type CrewSize = 2 | 3 | 4;

export interface HoursRange {
  low: number;
  high: number;
}

export interface AssemblySku {
  id: string;
  name: string;
  price: number;
}

/** Assembly add-on SKUs quoted on a move (same visit → no separate $125 minimum). */
export const ASSEMBLY_SKUS: readonly AssemblySku[] = Object.freeze([
  { id: "dining_chair", name: "Dining chair", price: 35 },
  { id: "office_chair", name: "Office chair", price: 45 },
  { id: "nightstand_small_table", name: "Nightstand / small table", price: 65 },
  { id: "desk", name: "Desk", price: 125 },
  { id: "tv_stand", name: "TV stand", price: 125 },
  { id: "dresser", name: "Dresser", price: 150 },
  { id: "bed_frame", name: "Bed frame", price: 175 },
  { id: "bunk_bed", name: "Bunk bed", price: 350 },
  { id: "shelving_storage", name: "Shelving / storage unit", price: 225 },
  { id: "ikea_small", name: "IKEA — small piece", price: 149 },
  { id: "ikea_large", name: "IKEA — large piece", price: 399 },
  { id: "five_item_bundle", name: "5-item bundle", price: 199 },
  { id: "play_equipment", name: "Play equipment (small kit)", price: 195 },
]);

export function assemblySkuById(id: string): AssemblySku | undefined {
  return ASSEMBLY_SKUS.find(sku => sku.id === id);
}

/**
 * Estimated on-site hours by home size and crew, BEFORE stairs and minimums.
 * `null` = that crew is not offered for that size. Defaults per the v19 moving
 * spec (Sep 9, 2026) — Abe confirms before the first real quote.
 */
export const HOURS_TABLE: Readonly<
  Record<HomeSize, Record<CrewSize, HoursRange | null>>
> = Object.freeze({
  few_items: { 2: { low: 2, high: 2 }, 3: { low: 2, high: 2 }, 4: null },
  studio_1br: { 2: { low: 3, high: 4 }, 3: { low: 2, high: 3 }, 4: null },
  "2br": {
    2: { low: 5, high: 6 },
    3: { low: 4, high: 5 },
    4: { low: 3, high: 4 },
  },
  "3br": {
    2: { low: 6, high: 8 },
    3: { low: 5, high: 6 },
    4: { low: 4, high: 5 },
  },
  "4br": {
    2: { low: 8, high: 10 },
    3: { low: 6, high: 8 },
    4: { low: 5, high: 7 },
  },
  "5br_plus": {
    2: { low: 10, high: 12 },
    3: { low: 8, high: 10 },
    4: { low: 7, high: 9 },
  },
});

export const MOVING_RATES = Object.freeze({
  pricingVersion: "v19 2026-09-06",

  /** 2 movers + 26-ft liftgate truck, per hour. */
  hourly: { weekday: 109, weekend: 124 },
  /** Each mover beyond the second, per hour (same on weekends). */
  extraMoverPerHour: 50,
  /** Baked into every truck-job total. Never itemized to the customer. */
  tripFee: 85,
  /** Hourly jobs bill at least this many hours. */
  minimumHours: { default: 2, fourMovers: 4 },
  /** Any single-crew estimate above this needs dispatch review. */
  escalateAboveHours: 8,

  packages: {
    small_move: {
      key: "small_move",
      name: "Small Move — up to 8 items, no full rooms",
      price: { weekday: 303, weekend: 333 },
      includedHours: 2,
      crewShown: 2 as CrewSize,
    },
    studio_1br: {
      key: "studio_1br",
      name: "Apartment Move — Studio / 1BR",
      price: { weekday: 525, weekend: 595 },
      includedHours: 4,
      crewShown: 2 as CrewSize,
    },
    "2br": {
      key: "2br",
      name: "Apartment Move — 2BR",
      price: { weekday: 750, weekend: 850 },
      includedHours: 6,
      crewShown: 3 as CrewSize,
    },
    small_house: {
      key: "small_house",
      name: "Home Move — Small House (up to 3BR, single level or one flight)",
      price: { weekday: 750, weekend: 850 },
      includedHours: 6,
      crewShown: 3 as CrewSize,
    },
  },
  /** Package overage past the included hours, billed in quarter hours. */
  packageOverage: { weekday: 109, weekend: 124 },
  /** Packages: first flight per address included, then this per extra flight per address. */
  extraFlightOfStairs: 75,
  /** Small Move qualifies up to this many items. */
  smallMoveMaxItems: 8,

  /** 2 movers, no truck, no trip fee. Weekend labor-only is $124/hr (Abe, Sep 9). */
  laborOnly: { weekday: 109, weekend: 124, minimumHours: 2 },

  /** Single large item (or item + its set), ≤ 15 miles between addresses. */
  vanFlat: { price: 199, maxMiles: 15 },
  /** One person + cargo van, single small item. No trip fee. */
  cargoVanSmallItem: 120,

  piano: {
    upright: 299,
    large_upright: 349,
    baby_grand: 399,
    grand: 499,
    /** Per location with stairs / difficult access. */
    stairsPerLocation: 75,
  },

  tvMount: { upTo65: 125, over65: 149 },

  packing: {
    /** Per 2 packers, per hour (labor-only rate). */
    ratePer2Packers: { weekday: 109, weekend: 124 },
    boxesPerPackerHour: 10,
    perBoxMaterials: 5,
    perWardrobeBox: 15,
  },

  /** Wooden playset / swing set disassemble + reassemble. */
  playStructureFlat: 499,

  /** Address-to-address miles beyond the metro. The ONLY travel line ever itemized. */
  extendedTravel: {
    freeUpToMiles: 50,
    tiers: [
      { maxMiles: 75, price: 150, label: "51–75 mi" },
      { maxMiles: 100, price: 300, label: "76–100 mi" },
    ],
  },
  /** Beyond this the job needs dispatch approval. */
  serviceAreaMiles: 50,

  /** Hours added per flight of stairs per address on hourly jobs (a 2nd story = one flight). */
  hoursPerFlight: { low: 0.5, high: 0.75 },

  /** `pricing_guards` — never quote below. Floors only ever raise a price. */
  floors: {
    hourly: { weekday: 109, weekend: 124 },
    extraMover: 50,
    tripFee: 85,
    smallMove: 303,
    studio: 525,
    twoBrOrSmallHouse: 750,
    laborOnlyMinimum: { weekday: 218, weekend: 248 },
    vanFlat: 199,
    cargoVan: 120,
    assembly: 125,
    tvMount: 125,
  },
});

export type MovingRates = typeof MOVING_RATES;
export type PackageKey = keyof MovingRates["packages"];

/** Verbatim on every 4-mover quote (v19 §2b). */
export const FOURTH_MOVER_FALLBACK_SENTENCE =
  "If our fourth mover is ever unavailable that day, we run the job with three and bill the three-mover rate instead — you'd never pay more.";

// ── Weekday / weekend rule (Phoenix time) ───────────────────────────────────

const PHOENIX_TZ = "America/Phoenix";

interface CalendarDate {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 = Sunday … 6 = Saturday, for a calendar date (timezone-free). */
function weekdayOf({ year, month, day }: CalendarDate) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Resolve a Date or ISO string to a Phoenix calendar date. A plain "YYYY-MM-DD"
 * is taken literally (it already IS the calendar date the office picked); a
 * full timestamp or Date object is converted to Phoenix wall-clock time.
 */
export function toPhoenixDate(value: Date | string): CalendarDate | null {
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month))
        return null;
      return { year, month, day };
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PHOENIX_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: string) =>
    Number(parts.find(part => part.type === type)?.value);
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

/**
 * Weekend = Friday, Saturday, Sunday, PLUS the first two and last two calendar
 * days of any month (Phoenix time). Sep 1, 2, 29, 30 are weekend days whatever
 * the weekday. Unparseable input defaults to "weekday".
 */
export function dayTypeOf(value: Date | string): DayType {
  const date = toPhoenixDate(value);
  if (!date) return "weekday";
  const weekday = weekdayOf(date);
  if (weekday === 0 || weekday === 5 || weekday === 6) return "weekend";
  const last = daysInMonth(date.year, date.month);
  if (date.day <= 2 || date.day >= last - 1) return "weekend";
  return "weekday";
}

/** "Mon Sep 21" style label for a date input value. */
export function shortDateLabel(value: Date | string): string {
  const date = toPhoenixDate(value);
  if (!date) return "";
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(utc);
}
