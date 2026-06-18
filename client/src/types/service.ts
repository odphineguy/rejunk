import type { PricebookCrewSize, PricebookItem, PricebookItemType, PricebookPriceUnit } from "@/types/pricebook";

/** Which estimator the EstimateBuilder is currently in. "service" and "moving"
 * share the Pricebook engine (serviceCalculator); "moving" just scopes the UI
 * to the moving categories and enforces the 2-hour moving minimum. "vision" is
 * the photo-based AI estimator (VisionEstimatePanel) — independent of both. */
export type EstimateMode = "junk" | "service" | "moving" | "vision";

export type StairFloor = "none" | "2nd" | "3rd" | "above_3rd";

/** Vehicle on a moving job — drives the travel fee ($50 van / $75 box truck)
 * and the excess-mileage rate ($2.00/mi van / $2.50/mi box truck). */
export type MovingVehicle = "van" | "box_truck";

/** A pricebook item + how many units (or hours/miles) of it are on the job. */
export interface ServiceQuoteEntry {
  item: PricebookItem;
  quantity: number;
}

export interface ServiceEstimateConfig {
  /** Assembly/handyman floor — no service job quotes below this (v4: $125; v4 supersedes v3's $99). */
  minimumServiceCall: number;
  /** Any 2-worker job floor (ops rule: 2-hr labor-only minimum). */
  twoWorkerMinimum: number;
  /** Number of line items at which the multi-item discount kicks in. */
  multiItemDiscountThreshold: number;
  /** Multi-item discount rate (v4: 10% for 4+ assembly items). */
  multiItemDiscountRate: number;
  /** Stair surcharges per move direction (v4: 2nd +$100, 3rd +$200, above 3rd +$300). */
  stairRates: { second: number; third: number; aboveThird: number };
}

export interface ServiceEstimateInput {
  lineItems: ServiceQuoteEntry[];
  surcharges?: ServiceQuoteEntry[];
  stairFloor?: StairFloor;
  stairDirections?: 1 | 2;
  /** Moving mode: independent stairs at each end of the move. When BOTH are set
   * they override stairFloor + stairDirections (each location is one direction). */
  pickupStairFloor?: StairFloor;
  deliveryStairFloor?: StairFloor;
  crewSizeOverride?: PricebookCrewSize;
  config?: Partial<ServiceEstimateConfig>;
}

export interface ServiceLineResult {
  itemId: string;
  name: string;
  unitPrice: number;
  priceUnit: PricebookPriceUnit;
  quantity: number;
  lineTotal: number;
  crewSize?: PricebookCrewSize;
  photoRequired: boolean;
  itemType: PricebookItemType;
}

export type ServiceWarningCode =
  | "no_items"
  | "crew_two_plus"
  | "crew_three"
  | "min_service_call"
  | "two_worker_minimum"
  | "moving_two_hour_min"
  | "photo_required";

export interface ServiceWarning {
  code: ServiceWarningCode;
  message: string;
  severity: "info" | "warning" | "critical";
}

export interface ServiceEstimateResult {
  lineItems: ServiceLineResult[];
  surcharges: ServiceLineResult[];
  itemsSubtotal: number;
  discountApplied: boolean;
  discountAmount: number;
  itemsAfterDiscount: number;
  minimumApplied: boolean;
  stairSurcharge: number;
  surchargesTotal: number;
  total: number;
  crewSize: PricebookCrewSize;
  estimatedCost: number;
  grossProfitDollars: number;
  grossMarginDecimal: number;
  photoRequired: boolean;
  warnings: ServiceWarning[];
}

/** Snapshot persisted inside a SavedEstimate when mode === "service". */
export interface ServiceEstimateSnapshot {
  lineItems: ServiceLineResult[];
  surcharges: ServiceLineResult[];
  stairFloor: StairFloor;
  stairDirections: 1 | 2;
  // Moving-mode extras (all optional so older saved estimates keep loading).
  pickupStairFloor?: StairFloor;
  deliveryStairFloor?: StairFloor;
  movingVehicle?: MovingVehicle;
  routeMiles?: number;
  routeDriveMinutes?: number;
  itemsSubtotal: number;
  discountApplied: boolean;
  discountAmount: number;
  stairSurcharge: number;
  surchargesTotal: number;
  total: number;
  crewSize: PricebookCrewSize;
  estimatedCost: number;
  grossProfitDollars: number;
  grossMarginDecimal: number;
  photoRequired: boolean;
}
