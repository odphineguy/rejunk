import type { PricebookCrewSize, PricebookPriceUnit } from "@/types/pricebook";
import type {
  ServiceEstimateConfig,
  ServiceEstimateInput,
  ServiceEstimateResult,
  ServiceLineResult,
  ServiceQuoteEntry,
  ServiceWarning,
  StairFloor,
} from "@/types/service";

/** Pricebook v4 + Operations Rules defaults. These are the hard floors. */
export const DEFAULT_SERVICE_CONFIG: ServiceEstimateConfig = {
  minimumServiceCall: 125,
  twoWorkerMinimum: 199,
  multiItemDiscountThreshold: 4,
  multiItemDiscountRate: 0.1,
  stairRates: { second: 100, third: 200, aboveThird: 300 },
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Percent-priced items (e.g. CC processing) apply to the running subtotal, not as a flat line. */
function isPercentUnit(unit: PricebookPriceUnit | undefined) {
  return unit === "percent";
}

/** A flat/per-unit line total. Percent units are handled separately against the subtotal. */
function lineTotalFor(unitPrice: number, unit: PricebookPriceUnit | undefined, quantity: number) {
  if (isPercentUnit(unit)) return 0;
  return round2(unitPrice * Math.max(0, quantity));
}

/** Ops rule: 2-hour minimum on ALL moving jobs — hourly moving lines bill at least 2 hours. */
const MOVING_MIN_HOURS = 2;

function isHourlyMoving(entry: ServiceQuoteEntry) {
  return entry.item.mode === "moving" && entry.item.priceUnit === "hourly";
}

function toLineResult(entry: ServiceQuoteEntry): ServiceLineResult {
  const { item } = entry;
  let quantity = Math.max(0, entry.quantity || 0);
  if (quantity > 0 && isHourlyMoving(entry)) quantity = Math.max(quantity, MOVING_MIN_HOURS);
  return {
    itemId: item.id,
    name: item.name,
    unitPrice: item.price,
    priceUnit: item.priceUnit ?? "flat",
    quantity,
    lineTotal: lineTotalFor(item.price, item.priceUnit, quantity),
    crewSize: item.crewSize,
    photoRequired: Boolean(item.photoRequired),
    itemType: item.itemType,
  };
}

function stairRateFor(floor: StairFloor, rates: ServiceEstimateConfig["stairRates"]) {
  switch (floor) {
    case "2nd":
      return rates.second;
    case "3rd":
      return rates.third;
    case "above_3rd":
      return rates.aboveThird;
    default:
      return 0;
  }
}

/**
 * Flat-rate service / assembly / handyman / appliance pricing (Pricebook v4 Mode 1).
 *
 * Order of operations:
 *   1. Sum line items (flat / per-unit; percent items deferred).
 *   2. Apply multi-item discount (−10% on assembly items when 4+ are on the visit).
 *   3. Floor the items portion at the $125 minimum service call.
 *   4. Add stair surcharges + selected surcharges (percent surcharges apply to the subtotal).
 *   5. Floor a 2-worker job at $199.
 * Crew size is the MAX across all items (safety — never crew below the heaviest item).
 */
export function calculateServiceEstimate(input: ServiceEstimateInput): ServiceEstimateResult {
  const config: ServiceEstimateConfig = { ...DEFAULT_SERVICE_CONFIG, ...input.config };
  const lineItems = (input.lineItems ?? []).map(toLineResult);
  const surchargeEntries = input.surcharges ?? [];
  const surcharges = surchargeEntries.map(toLineResult);

  // 1. Items subtotal (non-percent lines).
  const itemsSubtotal = round2(lineItems.reduce((sum, line) => sum + line.lineTotal, 0));

  // 2. Multi-item discount — assembly Service items only, counted by total quantity.
  const discountableQty = (input.lineItems ?? [])
    .filter((entry) => entry.item.mode === "assembly_service" && entry.item.itemType === "Service")
    .reduce((sum, entry) => sum + Math.max(0, entry.quantity || 0), 0);
  const discountableSubtotal = round2(
    lineItems
      .filter((line) => {
        const source = (input.lineItems ?? []).find((entry) => entry.item.id === line.itemId);
        return source?.item.mode === "assembly_service" && source.item.itemType === "Service";
      })
      .reduce((sum, line) => sum + line.lineTotal, 0),
  );
  const discountApplied = discountableQty >= config.multiItemDiscountThreshold && discountableSubtotal > 0;
  const discountAmount = discountApplied ? round2(discountableSubtotal * config.multiItemDiscountRate) : 0;
  let itemsAfterDiscount = round2(itemsSubtotal - discountAmount);

  // 3. Minimum service call floor (assembly/handyman service jobs).
  const hasServiceItems = (input.lineItems ?? []).some(
    (entry) => entry.item.mode === "assembly_service" && entry.item.itemType === "Service",
  );
  let minimumApplied = false;
  if (hasServiceItems && itemsAfterDiscount < config.minimumServiceCall) {
    itemsAfterDiscount = config.minimumServiceCall;
    minimumApplied = true;
  }

  // 4. Surcharges: stairs + flat surcharges, then percent surcharges on the subtotal.
  // Moving mode sends per-location stairs (pickup + delivery, one direction each);
  // when both are present they override the legacy floor × directions model.
  const stairFloor: StairFloor = input.stairFloor ?? "none";
  const stairDirections = input.stairDirections ?? 1;
  const hasPerLocationStairs = input.pickupStairFloor != null && input.deliveryStairFloor != null;
  const stairSurcharge = hasPerLocationStairs
    ? round2(
        stairRateFor(input.pickupStairFloor!, config.stairRates) +
          stairRateFor(input.deliveryStairFloor!, config.stairRates),
      )
    : round2(stairRateFor(stairFloor, config.stairRates) * stairDirections);

  const flatSurchargeTotal = round2(surcharges.reduce((sum, line) => sum + line.lineTotal, 0));
  const baseBeforePercent = round2(itemsAfterDiscount + stairSurcharge + flatSurchargeTotal);

  const percentRate = surchargeEntries
    .filter((entry) => isPercentUnit(entry.item.priceUnit))
    .reduce((sum, entry) => sum + (entry.item.price / 100) * Math.max(1, entry.quantity || 1), 0);
  const percentSurchargeTotal = round2(baseBeforePercent * percentRate);

  let total = round2(baseBeforePercent + percentSurchargeTotal);
  const surchargesTotal = round2(stairSurcharge + flatSurchargeTotal + percentSurchargeTotal);

  // Crew size = max across all items (safety), unless dispatch overrides up.
  const allCrew = [...lineItems, ...surcharges]
    .map((line) => line.crewSize ?? 1)
    .concat(input.crewSizeOverride ?? 1);
  const crewSize = (Math.max(1, ...allCrew) as PricebookCrewSize);

  // 5. Hard guard: any 2-worker job floors at the 2-hour labor-only minimum.
  let twoWorkerFloorApplied = false;
  if (crewSize >= 2 && total < config.twoWorkerMinimum) {
    total = config.twoWorkerMinimum;
    twoWorkerFloorApplied = true;
  }

  // Cost / margin (informational). Item cost uses each item's margin; surcharges treated as pure margin.
  const estimatedCost = round2(
    lineItems.reduce((sum, line) => {
      const source = (input.lineItems ?? []).find((entry) => entry.item.id === line.itemId);
      const margin = source?.item.marginDecimal ?? 0;
      return sum + line.lineTotal * (1 - margin);
    }, 0),
  );
  const grossProfitDollars = round2(total - estimatedCost);
  const grossMarginDecimal = total > 0 ? grossProfitDollars / total : 0;

  const photoRequired = [...lineItems, ...surcharges].some((line) => line.photoRequired);

  const warnings: ServiceWarning[] = [];
  if (lineItems.length === 0) {
    warnings.push({ code: "no_items", message: "Add at least one service item to build a quote.", severity: "info" });
  }
  if (crewSize === 2) {
    warnings.push({ code: "crew_two_plus", message: "This job requires a 2-worker crew (safety classification ⚠️2).", severity: "warning" });
  }
  if (crewSize >= 3) {
    warnings.push({ code: "crew_three", message: "This job requires a 3-worker crew (safety classification ⚠️3).", severity: "warning" });
  }
  if (minimumApplied) {
    warnings.push({ code: "min_service_call", message: `Raised to the $${config.minimumServiceCall} minimum service call.`, severity: "info" });
  }
  if (twoWorkerFloorApplied) {
    warnings.push({ code: "two_worker_minimum", message: `Raised to the $${config.twoWorkerMinimum} two-worker minimum.`, severity: "info" });
  }
  const movingMinHoursApplied = (input.lineItems ?? []).some(
    (entry) => isHourlyMoving(entry) && (entry.quantity || 0) > 0 && (entry.quantity || 0) < MOVING_MIN_HOURS,
  );
  if (movingMinHoursApplied) {
    warnings.push({
      code: "moving_two_hour_min",
      message: `Moving jobs bill a ${MOVING_MIN_HOURS}-hour minimum — hourly lines below ${MOVING_MIN_HOURS} hours were raised to ${MOVING_MIN_HOURS}.`,
      severity: "info",
    });
  }
  if (photoRequired) {
    warnings.push({ code: "photo_required", message: "Photos required before confirming final price with customer.", severity: "warning" });
  }

  return {
    lineItems,
    surcharges,
    itemsSubtotal,
    discountApplied,
    discountAmount,
    itemsAfterDiscount,
    minimumApplied,
    stairSurcharge,
    surchargesTotal,
    total,
    crewSize,
    estimatedCost,
    grossProfitDollars,
    grossMarginDecimal,
    photoRequired,
    warnings,
  };
}
