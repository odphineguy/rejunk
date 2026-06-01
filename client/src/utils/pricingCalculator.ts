import type {
  EstimateCalculationResult,
  EstimateCalculatorInput,
  EstimateWarning,
  FacilityPriceType,
  MaterialPricingRule,
  Vehicle,
  VolumePricingBenchmark,
} from "@/types/pricing";

const ROUND_TO_DOLLAR = 1;
const RECENT_VERIFICATION_DAYS = 180;

function money(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value / ROUND_TO_DOLLAR) * ROUND_TO_DOLLAR;
}

function positive(value: number | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function isHeavyMaterial(rule: MaterialPricingRule) {
  return (
    rule.requiresWeightOverride ||
    rule.pricingMode === "weight_based" ||
    rule.defaultDensityLbsPerYard >= 700 ||
    ["clean_concrete", "clean_tile", "brick", "dirt", "rock"].includes(rule.materialCategory)
  );
}

function facilityVerificationIsStale(lastVerifiedDate?: string) {
  if (!lastVerifiedDate) {
    return true;
  }

  const verifiedAt = new Date(lastVerifiedDate).getTime();
  if (!Number.isFinite(verifiedAt)) {
    return true;
  }

  const ageDays = (Date.now() - verifiedAt) / (1000 * 60 * 60 * 24);
  return ageDays > RECENT_VERIFICATION_DAYS;
}

function getDisposalCost(
  priceType: FacilityPriceType,
  estimatedTons: number,
  rate: number,
  minimumCharge: number,
  itemCount: number,
) {
  switch (priceType) {
    case "per_ton":
      return Math.max(estimatedTons * rate, minimumCharge);
    case "flat_fee":
      return rate;
    case "per_item":
      return Math.max(itemCount * rate, minimumCharge);
    case "payout":
      return -Math.abs(itemCount > 0 ? itemCount * rate : estimatedTons * rate);
    case "free":
      return 0;
    default:
      return 0;
  }
}

function getPayloadStatus(estimatedWeightLbs: number, vehicle: Vehicle): EstimateCalculationResult["payloadStatus"] {
  if (estimatedWeightLbs > vehicle.maxPayloadLbs) {
    return "over_limit";
  }

  if (estimatedWeightLbs >= vehicle.maxPayloadLbs * 0.85) {
    return "near_limit";
  }

  return "ok";
}

function buildWarnings(input: EstimateCalculatorInput, result: Omit<EstimateCalculationResult, "warnings">) {
  const warnings: EstimateWarning[] = [];
  const heavyMaterial = isHeavyMaterial(input.materialRule);

  if (input.materialRule.pricingMode === "excluded") {
    warnings.push({
      code: "excluded_material",
      severity: "critical",
      message: "This material is marked as excluded. Do not accept it through normal junk removal pricing.",
    });
  }

  if (result.payloadStatus === "over_limit") {
    warnings.push({
      code: "payload_exceeded",
      severity: "critical",
      message: `Estimated weight (${Math.round(result.estimatedWeightLbs)} lb) exceeds ${input.vehicle.vehicleName} payload (${input.vehicle.maxPayloadLbs} lb).`,
    });
  } else if (result.payloadStatus === "near_limit") {
    warnings.push({
      code: "payload_near_limit",
      severity: "warning",
      message: `Estimated weight is within 15% of ${input.vehicle.vehicleName} payload. Verify weight before dispatch.`,
    });
  }

  if (heavyMaterial) {
    warnings.push({
      code: "heavy_material",
      severity: input.manualWeightLbs ? "warning" : "critical",
      message:
        "Heavy material detected. Do not price by volume alone; use estimated weight, payload, labor, and facility disposal cost.",
    });
  }

  if (input.facility.rejectedMaterials.includes(input.materialRule.materialCategory)) {
    warnings.push({
      code: "facility_rejects_material",
      severity: "critical",
      message: `${input.facility.facilityName} is configured to reject ${input.materialRule.materialName}. Choose a compatible facility.`,
    });
  }

  if (facilityVerificationIsStale(input.facility.lastVerifiedDate)) {
    warnings.push({
      code: "facility_not_verified_recently",
      severity: "warning",
      message: "Facility pricing has not been verified recently. Confirm rate, minimums, and accepted materials before quoting.",
    });
  }

  if (result.cubicYards > input.vehicle.usableCubicYards) {
    warnings.push({
      code: "multiple_trips_likely",
      severity: "warning",
      message: `Load volume (${result.cubicYards.toFixed(1)} yd3) exceeds ${input.vehicle.vehicleName} usable capacity (${input.vehicle.usableCubicYards} yd3).`,
    });
  }

  if (input.vehicle.vehicleType === "dump_trailer" && result.payloadStatus !== "ok") {
    warnings.push({
      code: "vehicle_mismatch",
      severity: "critical",
      message: "Dump trailer selected with a heavy load near or over payload. Confirm trailer payload and tow rating.",
    });
  }

  if (heavyMaterial && result.selectedVolumeBenchmark && result.finalRecommendedQuote <= result.selectedVolumeBenchmark) {
    warnings.push({
      code: "margin_below_target",
      severity: "warning",
      message: "Heavy material quote is close to the volume benchmark. Recheck disposal and labor assumptions before presenting.",
    });
  }

  return warnings;
}

export function calculateEstimate(input: EstimateCalculatorInput): EstimateCalculationResult {
  const cubicYards = positive(input.cubicYards, input.vehicle.usableCubicYards * positive(input.loadFraction, 0));
  const estimatedWeightLbs = positive(input.manualWeightLbs, cubicYards * input.materialRule.defaultDensityLbsPerYard);
  const estimatedTons = estimatedWeightLbs / 2000;
  const workers = positive(input.workers, 2);
  const estimatedHours = positive(input.estimatedHours, 2);
  const hourlyLaborCost = positive(input.hourlyLaborCost, 25);
  const roundTripMiles = positive(input.roundTripMiles, 0);
  const mpg = positive(input.mpg, input.vehicle.mpgLoaded || input.vehicle.mpgUnloaded || 12);
  const fuelPricePerGallon = positive(input.fuelPricePerGallon, 4);
  const targetMarginDecimal = Math.min(Math.max(positive(input.targetMarginDecimal, 0.6), 0), 0.95);
  const minimumProfitDollars = positive(input.minimumProfitDollars, 150);
  const itemCount = Math.max(0, Math.round(positive(input.itemCount, 0)));
  const disposalRate = positive(input.overrideDisposalRate, input.facility.defaultRate);

  const laborCost = workers * hourlyLaborCost * estimatedHours * input.materialRule.laborDifficultyMultiplier;
  const disposalBeforeDifficulty = getDisposalCost(
    input.facility.priceType,
    estimatedTons,
    disposalRate,
    input.facility.minimumCharge,
    itemCount,
  );
  const disposalCost =
    disposalBeforeDifficulty * input.materialRule.disposalDifficultyMultiplier +
    input.facility.environmentalFee +
    input.facility.fuelSurcharge +
    input.facility.extraFees;
  const fuelCost = input.manualFuelCost ?? (roundTripMiles / mpg) * fuelPricePerGallon;
  const vehicleCost =
    typeof input.vehicle.hourlyVehicleCost === "number"
      ? estimatedHours * input.vehicle.hourlyVehicleCost
      : roundTripMiles * positive(input.vehicle.mileageCost, 0);
  const extraFeesTotal = (input.extraFees ?? []).reduce((total, fee) => total + positive(fee.amount, 0), 0);
  const baseCost = laborCost + disposalCost + fuelCost + vehicleCost + extraFeesTotal;
  const recommendedQuote = targetMarginDecimal >= 0.95 ? baseCost : baseCost / (1 - targetMarginDecimal);
  const minimumQuote = baseCost + minimumProfitDollars;
  const heavyMaterial = isHeavyMaterial(input.materialRule);
  const applicableBenchmark = heavyMaterial ? undefined : input.volumeBenchmarkPrice;
  const finalRecommendedQuote = Math.max(
    recommendedQuote,
    minimumQuote,
    positive(applicableBenchmark, 0),
    positive(input.minimumAcceptablePrice, 0),
  );
  const grossProfitDollars = finalRecommendedQuote - baseCost;
  const grossMarginDecimal = finalRecommendedQuote > 0 ? grossProfitDollars / finalRecommendedQuote : 0;
  const payloadStatus = getPayloadStatus(estimatedWeightLbs, input.vehicle);

  const resultWithoutWarnings = {
    cubicYards,
    estimatedWeightLbs,
    estimatedTons,
    laborCost: money(laborCost),
    disposalCost: money(disposalCost),
    fuelCost: money(fuelCost),
    vehicleCost: money(vehicleCost),
    extraFeesTotal: money(extraFeesTotal),
    baseCost: money(baseCost),
    recommendedQuote: money(recommendedQuote),
    minimumQuote: money(minimumQuote),
    finalRecommendedQuote: money(finalRecommendedQuote),
    grossProfitDollars: money(grossProfitDollars),
    grossMarginDecimal,
    selectedVolumeBenchmark: applicableBenchmark,
    payloadStatus,
  };

  return {
    ...resultWithoutWarnings,
    warnings: buildWarnings(input, resultWithoutWarnings),
  };
}

export function findVolumeBenchmark(
  benchmarks: VolumePricingBenchmark[],
  loadFraction: number | undefined,
): VolumePricingBenchmark | undefined {
  if (typeof loadFraction !== "number") {
    return undefined;
  }

  return benchmarks
    .slice()
    .sort((a, b) => a.fraction - b.fraction)
    .find((benchmark) => loadFraction <= benchmark.fraction);
}
