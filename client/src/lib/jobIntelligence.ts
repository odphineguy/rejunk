import type { Job } from "@/types/jobs";
import type { DisposalFacility, EstimateWarning, MaterialCategory, PricingSettings } from "@/types/pricing";

export type JobWarningCode =
  | "heavy_material"
  | "payload_exceeded"
  | "facility_mismatch"
  | "pricing_stale"
  | "missing_receipt"
  | "completed_unpaid"
  | "no_crew_assigned";

export interface JobWarning {
  code: JobWarningCode;
  label: string;
  severity: "info" | "warning" | "critical";
}

export interface FacilityCheckResult {
  selectedFacility?: DisposalFacility;
  recommendedFacility?: DisposalFacility;
  selectedCost: number;
  recommendedCost: number;
  savings: number;
  selectedAcceptsMaterial: boolean;
  selectedRejectsMaterial: boolean;
  recommendedAcceptsMaterial: boolean;
  selectedPricingStale: boolean;
}

const heavyMaterials: MaterialCategory[] = ["clean_concrete", "clean_tile", "brick", "dirt", "rock"];

function estimateWarningCodes(warnings: EstimateWarning[] | undefined) {
  return new Set((warnings ?? []).map((warning) => warning.code));
}

export function hasReceipt(job: Job) {
  return Boolean(job.actuals?.dumpReceiptUrl?.trim() || job.actuals?.receiptNumber?.trim());
}

export function actualTotalCost(job: Job) {
  const disposalCost = job.actuals?.disposalTotal ?? job.actuals?.disposalCost ?? 0;
  return disposalCost + (job.actuals?.laborCost ?? 0) + (job.actuals?.fuelCost ?? 0);
}

export function estimatedTotalCost(job: Job) {
  return job.estimatedCost ?? 0;
}

export function actualChargedAmount(job: Job) {
  return job.actuals?.chargedAmount ?? job.quotedAmount;
}

export function actualProfit(job: Job) {
  return actualChargedAmount(job) - actualTotalCost(job);
}

export function estimatedProfit(job: Job) {
  return job.estimatedProfit ?? job.quotedAmount - estimatedTotalCost(job);
}

export function margin(profit: number, amount: number) {
  return amount > 0 ? profit / amount : 0;
}

export function getJobWarnings(job: Job): JobWarning[] {
  const estimateCodes = estimateWarningCodes(job.warnings);
  const warnings: JobWarning[] = [];

  if (job.materialType && heavyMaterials.includes(job.materialType)) {
    warnings.push({ code: "heavy_material", label: "Heavy Material", severity: "warning" });
  }
  if (estimateCodes.has("payload_exceeded")) {
    warnings.push({ code: "payload_exceeded", label: "Payload Exceeded", severity: "critical" });
  }
  if (estimateCodes.has("facility_rejects_material")) {
    warnings.push({ code: "facility_mismatch", label: "Facility Mismatch", severity: "critical" });
  }
  if (estimateCodes.has("facility_not_verified_recently")) {
    warnings.push({ code: "pricing_stale", label: "Pricing Stale", severity: "warning" });
  }
  if (job.status === "completed" && !hasReceipt(job)) {
    warnings.push({ code: "missing_receipt", label: "Missing Receipt", severity: "warning" });
  }
  if (job.status === "completed" && job.paymentStatus !== "paid" && job.paymentStatus !== "refunded") {
    warnings.push({ code: "completed_unpaid", label: "Completed but Unpaid", severity: "critical" });
  }
  if (!job.assignment?.crewLead && !job.assignment?.crewMembers?.length) {
    warnings.push({ code: "no_crew_assigned", label: "No Crew Assigned", severity: "info" });
  }

  return warnings;
}

export function getJobWarningsWithFacilityCheck(job: Job, settings: PricingSettings): JobWarning[] {
  const warnings = getJobWarnings(job);
  const existingCodes = new Set(warnings.map((warning) => warning.code));
  const facilityCheck = getFacilityCheck(job, settings);

  if (facilityCheck.selectedRejectsMaterial && !existingCodes.has("facility_mismatch")) {
    warnings.push({ code: "facility_mismatch", label: "Facility Mismatch", severity: "critical" });
  }
  if (facilityCheck.selectedPricingStale && !existingCodes.has("pricing_stale")) {
    warnings.push({ code: "pricing_stale", label: "Pricing Stale", severity: "warning" });
  }

  return warnings;
}

function isPricingStale(facility: DisposalFacility | undefined) {
  if (!facility) return false;
  if (!facility.lastVerifiedDate) return true;
  const verifiedAt = new Date(facility.lastVerifiedDate).getTime();
  if (!Number.isFinite(verifiedAt)) return true;
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  return Date.now() - verifiedAt > ninetyDaysMs;
}

function facilityMatches(facility: DisposalFacility, job: Job) {
  return facility.id === job.facilityId || facility.facilityName === job.facilityName;
}

function acceptsMaterial(facility: DisposalFacility | undefined, materialType: MaterialCategory | undefined) {
  if (!facility || !materialType) return false;
  return facility.acceptedMaterials.includes(materialType);
}

function rejectsMaterial(facility: DisposalFacility | undefined, materialType: MaterialCategory | undefined) {
  if (!facility || !materialType) return false;
  return facility.rejectedMaterials.includes(materialType);
}

export function estimateFacilityDisposalCost(facility: DisposalFacility | undefined, job: Job) {
  if (!facility) return 0;

  const tons = job.actuals?.netWeightTons ?? job.estimatedTons ?? (job.estimatedWeightLbs ?? 0) / 2000;
  let cost = 0;

  switch (facility.priceType) {
    case "per_ton":
      cost = Math.max(facility.minimumCharge, tons * facility.defaultRate);
      break;
    case "flat_fee":
    case "per_item":
      cost = Math.max(facility.minimumCharge, facility.defaultRate);
      break;
    case "free":
      cost = 0;
      break;
    case "payout":
      cost = -Math.abs(tons * facility.defaultRate);
      break;
    default:
      cost = facility.minimumCharge;
  }

  return Math.max(0, cost + facility.environmentalFee + facility.fuelSurcharge + facility.extraFees);
}

export function getFacilityCheck(job: Job, settings: PricingSettings): FacilityCheckResult {
  const activeFacilities = settings.disposalFacilities.filter((facility) => facility.isActive);
  const selectedFacility = activeFacilities.find((facility) => facilityMatches(facility, job));
  const compatibleFacilities = activeFacilities.filter((facility) => acceptsMaterial(facility, job.materialType) && !rejectsMaterial(facility, job.materialType));
  const candidateFacilities = compatibleFacilities.length ? compatibleFacilities : activeFacilities;

  const recommendedFacility = candidateFacilities
    .map((facility) => ({ facility, cost: estimateFacilityDisposalCost(facility, job) }))
    .sort((a, b) => a.cost - b.cost)[0]?.facility;

  const selectedCost = estimateFacilityDisposalCost(selectedFacility, job);
  const recommendedCost = estimateFacilityDisposalCost(recommendedFacility, job);

  return {
    selectedFacility,
    recommendedFacility,
    selectedCost,
    recommendedCost,
    savings: selectedCost - recommendedCost,
    selectedAcceptsMaterial: acceptsMaterial(selectedFacility, job.materialType),
    selectedRejectsMaterial: rejectsMaterial(selectedFacility, job.materialType),
    recommendedAcceptsMaterial: acceptsMaterial(recommendedFacility, job.materialType),
    selectedPricingStale: isPricingStale(selectedFacility),
  };
}
