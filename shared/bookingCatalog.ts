/**
 * Online booking (/book) — the services a customer can book, their prices,
 * arrival windows and the stairs rule. Shared by the public page (display) and
 * /api/book (the server re-prices every booking from this file; the browser's
 * numbers are never trusted).
 *
 * Moving / piano / van prices come from the v19 rate card (`movingRates.ts`).
 * Junk prices mirror the "Progressive — Junk Removal" pricebook rows (Oct 9,
 * 2026) — change both together.
 */
import { MOVING_RATES, dayTypeOf, type DayType } from "../client/src/data/movingRates";

export type BookingGroup = "moving" | "junk" | "delivery";
export type BookingVehicleClass = "box_truck" | "van";
export type BookingStairsRule = "extra_flight" | "per_location" | "time" | "none";

export interface BookingService {
  id: string;
  group: BookingGroup;
  /** Second level of the drill-down, e.g. "Local Moving". */
  subgroup: string;
  name: string;
  description: string;
  pricing:
    | { kind: "flat"; weekday: number; weekend: number }
    | { kind: "hourly"; weekday: number; weekend: number; minimumHours: number };
  includedHours?: number;
  serviceType: "moving" | "junk_removal" | "delivery";
  movingKind?: "small_move" | "studio_1br" | "two_br" | "small_house" | "hourly_2" | "labor_only" | "piano";
  deliveryKind?: "cargo_van" | "van_flat";
  /** Which crew/vehicle calendar the booking takes (labor-only uses the truck crew). */
  vehicleClass: BookingVehicleClass;
  /** Truck moves get BOX-01 pre-set on the ticket (same rule as the Thumbtack extractor). */
  presetBoxTruck: boolean;
  /** Takes the whole day (AM + PM) — only the morning window is offered. */
  fullDay: boolean;
  /** Loading + Unloading addresses instead of one service address. */
  twoAddresses: boolean;
  stairs: BookingStairsRule;
  requiredCrew: number;
}

export const BOOKING_DEPOSIT = 50;
/** Card processing fee on card payments (Abe, Oct 9: 3% until Stripe's real cost is known). */
export const CARD_FEE_RATE = 0.03;
/** $1.50 — the fee on the deposit, in dollars. */
export const BOOKING_DEPOSIT_CARD_FEE = Math.round(BOOKING_DEPOSIT * CARD_FEE_RATE * 100) / 100;
/** What the customer pays by card for the deposit: $51.50. */
export const BOOKING_DEPOSIT_CARD_TOTAL = BOOKING_DEPOSIT + BOOKING_DEPOSIT_CARD_FEE;
export const BOOKING_REFUND_HOURS = 24;
export const BOOKING_DAYS_AHEAD = 45;

const R = MOVING_RATES;
const P = R.packages;
const overage = `then $${R.packageOverage.weekday}/hr ($${R.packageOverage.weekend} weekends), billed in quarter hours`;
const stairsLine = `First flight of stairs at each address included; $${R.extraFlightOfStairs} for each extra flight.`;

function junk(id: string, name: string, price: number, description: string): BookingService {
  return {
    id,
    group: "junk",
    subgroup: "Junk Removal",
    name,
    description,
    pricing: { kind: "flat", weekday: price, weekend: price },
    serviceType: "junk_removal",
    vehicleClass: "van",
    presetBoxTruck: false,
    fullDay: false,
    twoAddresses: false,
    stairs: "none",
    requiredCrew: 1,
  };
}

function piano(id: "upright" | "large_upright" | "baby_grand" | "grand", name: string): BookingService {
  const price = R.piano[id];
  return {
    id: `piano_${id}`,
    group: "moving",
    subgroup: "Piano Moving",
    name,
    description: `Local piano move with a 26-ft liftgate truck, padded and strapped. $${R.piano.stairsPerLocation} per location with stairs or difficult access.`,
    pricing: { kind: "flat", weekday: price, weekend: price },
    serviceType: "moving",
    movingKind: "piano",
    vehicleClass: "box_truck",
    presetBoxTruck: true,
    fullDay: false,
    twoAddresses: true,
    stairs: "per_location",
    requiredCrew: 2,
  };
}

export const BOOKING_SERVICES: readonly BookingService[] = [
  {
    id: "small_move",
    group: "moving",
    subgroup: "Local Moving",
    name: "Small Move — up to 8 items (no full rooms)",
    description: `2 movers + 26-ft liftgate truck. ${P.small_move.includedHours} hours on site included, ${overage}. ${stairsLine}`,
    pricing: { kind: "flat", ...P.small_move.price },
    includedHours: P.small_move.includedHours,
    serviceType: "moving",
    movingKind: "small_move",
    vehicleClass: "box_truck",
    presetBoxTruck: true,
    fullDay: false,
    twoAddresses: true,
    stairs: "extra_flight",
    requiredCrew: 2,
  },
  {
    id: "studio_1br",
    group: "moving",
    subgroup: "Local Moving",
    name: "Apartment Move — Studio / 1 Bedroom",
    description: `2 movers + 26-ft liftgate truck. ${P.studio_1br.includedHours} hours on site included, ${overage}. ${stairsLine}`,
    pricing: { kind: "flat", ...P.studio_1br.price },
    includedHours: P.studio_1br.includedHours,
    serviceType: "moving",
    movingKind: "studio_1br",
    vehicleClass: "box_truck",
    presetBoxTruck: true,
    fullDay: false,
    twoAddresses: true,
    stairs: "extra_flight",
    requiredCrew: 2,
  },
  {
    id: "two_br",
    group: "moving",
    subgroup: "Local Moving",
    name: "Apartment Move — 2 Bedroom",
    description: `3 movers + 26-ft liftgate truck. ${P["2br"].includedHours} hours on site included, ${overage}. ${stairsLine}`,
    pricing: { kind: "flat", ...P["2br"].price },
    includedHours: P["2br"].includedHours,
    serviceType: "moving",
    movingKind: "two_br",
    vehicleClass: "box_truck",
    presetBoxTruck: true,
    fullDay: true,
    twoAddresses: true,
    stairs: "extra_flight",
    requiredCrew: 3,
  },
  {
    id: "small_house",
    group: "moving",
    subgroup: "Local Moving",
    name: "Home Move — Small House (up to 3 bedrooms)",
    description: `3 movers + 26-ft liftgate truck, single level or one flight. ${P.small_house.includedHours} hours on site included, ${overage}. ${stairsLine}`,
    pricing: { kind: "flat", ...P.small_house.price },
    includedHours: P.small_house.includedHours,
    serviceType: "moving",
    movingKind: "small_house",
    vehicleClass: "box_truck",
    presetBoxTruck: true,
    fullDay: true,
    twoAddresses: true,
    stairs: "extra_flight",
    requiredCrew: 3,
  },
  {
    id: "hourly_2",
    group: "moving",
    subgroup: "Local Moving",
    name: "Hourly Move — 2 Movers + 26-ft Truck",
    description: `Billed for actual time in quarter hours, ${R.minimumHours.default}-hour minimum. Travel included. Stairs add time, not fees.`,
    pricing: { kind: "hourly", ...R.hourly, minimumHours: R.minimumHours.default },
    serviceType: "moving",
    movingKind: "hourly_2",
    vehicleClass: "box_truck",
    presetBoxTruck: true,
    fullDay: false,
    twoAddresses: true,
    stairs: "time",
    requiredCrew: 2,
  },
  {
    id: "labor_only",
    group: "moving",
    subgroup: "Labor Only",
    name: "Moving Labor — 2 Movers, no truck",
    description: `Loading or unloading your truck, POD or storage unit. Billed for actual time, ${R.laborOnly.minimumHours}-hour minimum. Paid in full before the job.`,
    pricing: { kind: "hourly", weekday: R.laborOnly.weekday, weekend: R.laborOnly.weekend, minimumHours: R.laborOnly.minimumHours },
    serviceType: "moving",
    movingKind: "labor_only",
    vehicleClass: "box_truck",
    presetBoxTruck: false,
    fullDay: false,
    twoAddresses: false,
    stairs: "time",
    requiredCrew: 2,
  },
  piano("upright", "Piano — Upright"),
  piano("large_upright", "Piano — Large Upright (48\"+)"),
  piano("baby_grand", "Piano — Baby Grand"),
  piano("grand", "Piano — Grand"),
  {
    id: "van_flat",
    group: "delivery",
    subgroup: "Cargo Van Delivery",
    name: "Cargo Van — Single Large Item",
    description: `One large item or a matching set (couch, dresser, appliance), up to ${R.vanFlat.maxMiles} miles between addresses.`,
    pricing: { kind: "flat", weekday: R.vanFlat.price, weekend: R.vanFlat.price },
    serviceType: "delivery",
    deliveryKind: "van_flat",
    vehicleClass: "van",
    presetBoxTruck: false,
    fullDay: false,
    twoAddresses: true,
    stairs: "none",
    requiredCrew: 1,
  },
  {
    id: "cargo_van_small",
    group: "delivery",
    subgroup: "Cargo Van Delivery",
    name: "Cargo Van — Small Item Delivery",
    description: "One person + cargo van for a single small item.",
    pricing: { kind: "flat", weekday: R.cargoVanSmallItem, weekend: R.cargoVanSmallItem },
    serviceType: "delivery",
    deliveryKind: "cargo_van",
    vehicleClass: "van",
    presetBoxTruck: false,
    fullDay: false,
    twoAddresses: true,
    stairs: "none",
    requiredCrew: 1,
  },
  junk("junk_eighth", "Junk Removal — 1/8 Truck Load", 99, "A few bulky items (about a pickup-bed corner). Loading, hauling and disposal included."),
  junk("junk_quarter", "Junk Removal — 1/4 Truck Load", 149, "About a pickup bed of junk. Loading, hauling and disposal included."),
  junk("junk_half", "Junk Removal — 1/2 Truck Load", 249, "A room's worth of junk. Loading, hauling and disposal included."),
  junk("junk_three_quarter", "Junk Removal — 3/4 Truck Load", 329, "A large room or small garage. Loading, hauling and disposal included."),
  junk("junk_full", "Junk Removal — Full Truck Load", 389, "A garage or full cleanout. Loading, hauling and disposal included."),
  junk("junk_sofa", "Couch / Sofa Removal", 99, "One couch or sofa hauled away and disposed of."),
  junk("junk_mattress", "Mattress Removal", 89, "One mattress or box spring hauled away and disposed of."),
  junk("junk_appliance", "Appliance Removal", 99, "One appliance hauled away and disposed of."),
];

export const BOOKING_GROUPS: { id: BookingGroup; label: string; blurb: string }[] = [
  { id: "moving", label: "Moving", blurb: "Local moves, labor only, pianos" },
  { id: "junk", label: "Junk Removal", blurb: "Single items to full truck loads" },
  { id: "delivery", label: "Cargo Van Delivery", blurb: "One item, across town" },
];

export function bookingServiceById(id: string | null | undefined): BookingService | undefined {
  return BOOKING_SERVICES.find(service => service.id === id);
}

// ── Arrival windows (HCP's, Sep 29: 8–10am and 12–2pm, Arizona time) ────────

export interface BookingWindow {
  key: "am" | "pm";
  label: string;
  /** Arrival window, 24h "HH:MM" Phoenix time. */
  start: string;
  end: string;
  /** Where the ticket's scheduled end lands (blocks the half day). */
  blockEnd: string;
}

export const BOOKING_WINDOWS: readonly BookingWindow[] = [
  { key: "am", label: "8:00–10:00am", start: "08:00", end: "10:00", blockEnd: "12:00" },
  { key: "pm", label: "12:00–2:00pm", start: "12:00", end: "14:00", blockEnd: "17:00" },
];

export const FULL_DAY_BLOCK_END = "17:00";

/** ISO timestamp for a Phoenix wall-clock time (Arizona has no DST: UTC−7). */
export function phoenixIso(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00-07:00`).toISOString();
}

// ── Service area ─────────────────────────────────────────────────────────────

/** Phoenix metro + East Valley + Pinal (850xx–853xx). Anything else → call us. */
export function inServiceArea(zip: string): boolean {
  return /^85[0-3]\d\d$/.test(zip.trim());
}

// ── Pricing ──────────────────────────────────────────────────────────────────

export interface BookingPriceLine {
  name: string;
  amount: number;
  quantity: number;
}

export interface BookingPrice {
  dayType: DayType;
  lines: BookingPriceLine[];
  /** Flat total, or the minimum-hours total for hourly work. */
  total: number;
  hourly: boolean;
  /** Customer wording for the price. */
  summary: string;
}

/**
 * Price a booking. `flights` = flights of stairs at each address, in order.
 * Flat moves: first flight per address included, $75 per extra flight
 * (Abe, Sep 29). Pianos: $75 per location with stairs. Hourly work: stairs
 * add time, never dollars.
 */
export function priceBooking(service: BookingService, date: string, flights: number[]): BookingPrice {
  const dayType = dayTypeOf(date);
  const rate = service.pricing[dayType];
  const lines: BookingPriceLine[] = [];
  let summary: string;
  if (service.pricing.kind === "hourly") {
    const hours = service.pricing.minimumHours;
    lines.push({ name: `${service.name} — ${hours}-hour minimum ($${rate}/hr)`, amount: rate, quantity: hours });
    summary = `$${rate}/hr${dayType === "weekend" ? " (weekend rate)" : ""}, ${hours}-hour minimum. This is an estimate — you pay for the actual time.`;
  } else {
    lines.push({ name: service.name, amount: rate, quantity: 1 });
    summary = `$${rate} flat${dayType === "weekend" ? " (weekend price)" : ""}.`;
  }
  const clean = flights.map(f => Math.max(0, Math.min(20, Math.floor(Number(f) || 0))));
  if (service.stairs === "extra_flight") {
    const extra = clean.reduce((sum, f) => sum + Math.max(0, f - 1), 0);
    if (extra > 0) lines.push({ name: "Additional flight of stairs", amount: R.extraFlightOfStairs, quantity: extra });
  } else if (service.stairs === "per_location") {
    const locations = clean.filter(f => f > 0).length;
    if (locations > 0) lines.push({ name: "Piano — stairs / difficult access (per location)", amount: R.piano.stairsPerLocation, quantity: locations });
  }
  const total = lines.reduce((sum, line) => sum + line.amount * line.quantity, 0);
  if (service.pricing.kind === "flat" && lines.length > 1) summary = `$${total} total${dayType === "weekend" ? " (weekend price)" : ""}, stairs included.`;
  return { dayType, lines, total, hourly: service.pricing.kind === "hourly", summary };
}

/** "Fri Oct 9"-style label for a YYYY-MM-DD date. */
export function bookingDateLabel(date: string, long = false): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: long ? "long" : "short",
    month: long ? "long" : "short",
    day: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
