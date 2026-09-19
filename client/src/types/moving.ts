import type {
  CrewSize,
  DayType,
  HomeSize,
  HoursRange,
  PianoType,
} from "@/data/movingRates";

export type { CrewSize, DayType, HomeSize, HoursRange, PianoType };

export type QuoteMode =
  | "auto"
  | "package"
  | "hourly"
  | "labor_only"
  | "van_flat"
  | "cargo_van";
export type QuoteKind = Exclude<QuoteMode, "auto">;

export interface MovingPackingInput {
  enabled: boolean;
  /** Default true — packing happens the day before the move, on its own clock. */
  separateDay: boolean;
  /** Drives its own dayType when separateDay. */
  packingDate?: string;
  packers: 2 | 3 | 4;
  /** Packer hours, entered directly (Abe doesn't count boxes). Rounded up to the quarter hour. */
  hours: number;
  /** Materials as ONE flat amount for the job (Abe: "I charge a flat rate for materials"). */
  materials: number;
}

export interface MovingQuoteInput {
  /** ISO date (YYYY-MM-DD); drives dayType unless overridden. */
  moveDate?: string;
  /** Manual override of the weekday/weekend rule. */
  dayType?: DayType;
  homeSize: HomeSize;
  /** few_items only — ≤ 8 qualifies for Small Move. */
  itemCount?: number;
  /** Stories at pickup. */
  stories: 1 | 2 | 3;
  /** Flights of stairs at pickup (0..n). */
  pickupFlights: number;
  deliveryFlights: number;
  /** Address-to-address miles — manual; may be auto-filled if Distance Matrix ever works. */
  distanceMiles?: number;
  /** Customer provides the truck / same building. 2 movers only, no trip fee. */
  laborOnly: boolean;
  /** The selected crew (all three are always computed). */
  crew: CrewSize;
  /** Applies to the selected crew's move-day hours. */
  hoursOverride?: HoursRange;
  packing: MovingPackingInput;
  /** Wooden playset / swing set — its own line, never move-day hours. */
  playStructure: {
    enabled: boolean;
    mode: "flat" | "hourly";
    price: number;
    hours?: number;
  };
  /** Manual flat line — Abe decides per job. Warns while $0. */
  secondTruck: { requested: boolean; price: number };
  walkthroughDone: boolean;
  piano: PianoType;
  /** Locations with stairs / difficult access for the piano. Charged only when `MOVING_RATES.chargeStairs`. */
  pianoStairLocations: 0 | 1 | 2;
  /** Crane / balcony / spiral / > 2 flights → escalate. */
  pianoAccessUnusual: boolean;
  assemblyAddOns: { skuId: string; qty: number }[];
  tvMounts: { upTo65: number; over65: number };
  specialtyFlags: { safe: boolean; hotTub: boolean; over300lb: boolean };
  /** "auto" = recommend. */
  mode: QuoteMode;
}

export type MovingLineKey =
  | "labor"
  | "trip_fee"
  | "extended_travel"
  | "piano"
  | "piano_stairs"
  | "extra_flights"
  | "assembly"
  | "tv_mounts"
  | "packing_labor"
  | "packing_materials"
  | "play_structure"
  | "second_truck"
  | "package"
  | "van_flat"
  | "cargo_van";

export interface MovingQuoteLine {
  key: MovingLineKey;
  /** Internal label (breakdown). */
  label: string;
  /** Math shown next to the label, e.g. "6–8 hrs × $209". */
  detail?: string;
  low: number;
  high: number;
  /** Never shown to the customer (trip fee). */
  internalOnly?: boolean;
}

export interface CrewOption {
  crew: CrewSize;
  rate: number;
  hours: HoursRange;
  /** Base hours from the table before stairs / overrides / minimums (null = not offered). */
  baseHours: HoursRange | null;
  minimumApplied: boolean;
  labor: HoursRange;
  tripFee: number;
  addOnsTotal: number;
  total: HoursRange;
  notes: string[];
  eligible: boolean;
  ineligibleReason?: string;
}

export interface PackageOption {
  key: string;
  name: string;
  flatPrice: number;
  includedHours: number;
  overageRate: number;
  extraFlights: number;
  extraFlightsTotal: number;
  crewShown: CrewSize;
  addOnsTotal: number;
  total: number;
}

export interface MovingRecommendation {
  kind: QuoteKind;
  crew?: CrewSize;
  reason: string;
}

export type MovingWarningSeverity = "info" | "warning" | "escalate";

export interface MovingWarning {
  code: string;
  message: string;
  severity: MovingWarningSeverity;
}

export interface MovingFloorApplied {
  label: string;
  from: number;
  to: number;
}

export interface MovingQuoteResult {
  pricingVersion: string;
  dayType: DayType;
  dateLabel: string;
  /** The option the quote is built on after `mode` is resolved. */
  selected: MovingRecommendation;
  recommended: MovingRecommendation;
  crewOptions: Record<CrewSize, CrewOption>;
  packageOption?: PackageOption;
  /** Flat-price options that only apply when chosen (or auto-recommended). */
  vanFlat: { price: number; eligible: boolean; reason?: string };
  cargoVan: { price: number };
  /** Add-on lines shared by every option (piano, stairs, assembly, packing, …). */
  addOnLines: MovingQuoteLine[];
  addOnsTotal: number;
  /** Full internal breakdown for the selected option. */
  lines: MovingQuoteLine[];
  total: HoursRange;
  floorsApplied: MovingFloorApplied[];
  warnings: MovingWarning[];
  /** Copy-ready customer quote for the selected option. */
  customerText: string;
}

/** Persisted inside a SavedEstimate when mode === "moving" (v19 engine). */
export interface MovingEstimateSnapshot {
  pricingVersion: string;
  input: MovingQuoteInput;
  result: MovingQuoteResult;
  walkthrough: Record<string, boolean>;
  walkthroughNotes?: string;
  sqft?: string;
}
