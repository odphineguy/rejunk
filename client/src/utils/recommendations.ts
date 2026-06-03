import {
  estimateFacilityDisposalCost,
  facilityAcceptsMaterial,
  facilityPricingIsStale,
  facilityRejectsMaterial,
} from "@/lib/jobIntelligence";
import type { Job } from "@/types/jobs";
import type {
  BestFacilityRecommendation,
  DisposalFacility,
  FacilityRouteComparison,
  JobRouteEstimate,
  MaterialCategory,
  MaterialHandlingClass,
  MaterialPricingRule,
  PricingSettings,
  Vehicle,
  VehicleJobComparison,
} from "@/types/pricing";
import { emptyRouteEstimate, manualRouteEstimate } from "@/utils/distanceRouting";

interface RecommendationInput {
  jobAddress?: string;
  selectedFacilityId?: string;
  selectedVehicleId?: string;
  materialType?: MaterialCategory;
  materialRule?: MaterialPricingRule;
  cubicYards?: number;
  estimatedWeightLbs?: number;
  estimatedTons?: number;
  quotedAmount?: number;
  estimatedHours?: number;
  fuelPricePerGallon?: number;
  manualRoundTripMiles?: number;
  routeEstimates?: Record<string, JobRouteEstimate | undefined>;
}

function roundMoney(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function positive(value: number | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function materialRuleForInput(input: RecommendationInput, settings: PricingSettings) {
  return (
    input.materialRule ??
    settings.materialPricingRules.find((rule) => rule.materialCategory === input.materialType) ??
    settings.materialPricingRules[0]
  );
}

function handlingClassForInput(input: RecommendationInput, settings: PricingSettings): MaterialHandlingClass {
  return materialRuleForInput(input, settings)?.handlingClass ?? "standard_junk";
}

function fullAddress(job: Job) {
  return [job.address, job.city, job.state, job.zip].filter(Boolean).join(", ") || job.address;
}

function routeForFacility(input: RecommendationInput, facility: DisposalFacility): JobRouteEstimate {
  const route = input.routeEstimates?.[facility.id];
  if (route) return route;
  if (facility.id === input.selectedFacilityId && input.manualRoundTripMiles) {
    return manualRouteEstimate(input.jobAddress, facility.id, input.manualRoundTripMiles);
  }
  return emptyRouteEstimate(input.jobAddress, facility.id);
}

function vehicleMilesCost(vehicle: Vehicle, miles: number | null, trips: number) {
  if (!miles) return 0;
  return miles * trips * positive(vehicle.mileageCost, 0);
}

function vehicleFuelCost(vehicle: Vehicle, miles: number | null, trips: number, fuelPrice: number) {
  if (!miles) return 0;
  const mpg = positive(vehicle.mpgLoaded, positive(vehicle.mpgUnloaded, 12));
  return (miles * trips * fuelPrice) / mpg;
}

function heavyPlanningCapacity(vehicle: Vehicle) {
  return vehicle.vehicleType === "cargo_van" ? Math.min(vehicle.usableCubicYards, 5) : vehicle.usableCubicYards;
}

function tripsRequired(vehicle: Vehicle, cubicYards: number, estimatedWeightLbs: number, handlingClass: MaterialHandlingClass) {
  const planningCapacity = handlingClass === "heavy_lowboy" ? heavyPlanningCapacity(vehicle) : vehicle.usableCubicYards;
  const volumeTrips = Math.ceil(positive(cubicYards, 0) / positive(planningCapacity, 1));
  const payloadTrips = Math.ceil(positive(estimatedWeightLbs, 0) / positive(vehicle.maxPayloadLbs, 1));
  return Math.max(1, volumeTrips, payloadTrips);
}

function isHeavyLowboyEligible(vehicle: Vehicle) {
  if (vehicle.vehicleType === "box_truck" || vehicle.bedHeightClass === "high") return false;
  if (vehicle.heavyMaterialSuitable === false) return false;
  if (!vehicle.allowedHandlingClasses.includes("heavy_lowboy")) return false;
  return vehicle.vehicleType === "dump_trailer" || vehicle.vehicleType === "cargo_van" || vehicle.heavyMaterialSuitable === true;
}

function vehicleIsEligible(vehicle: Vehicle, handlingClass: MaterialHandlingClass) {
  if (handlingClass === "heavy_lowboy") return isHeavyLowboyEligible(vehicle);
  return vehicle.allowedHandlingClasses.includes(handlingClass);
}

function lowboyPackageYards(cubicYards: number) {
  return Math.max(5, Math.ceil(positive(cubicYards, 0) / 5) * 5);
}

function includedTonDetails(materialRule: MaterialPricingRule | undefined, estimatedTons: number, cubicYards: number) {
  if (materialRule?.handlingClass !== "heavy_lowboy") {
    return { includedTons: undefined, extraTons: undefined, extraTonCost: undefined };
  }

  const packageMultiplier = lowboyPackageYards(cubicYards) / 5;
  const includedTons = positive(materialRule.includedTons, materialRule.materialCategory === "heavy_clean_debris" ? 3 : 4) * packageMultiplier;
  const extraTons = Math.max(0, estimatedTons - includedTons);
  const extraTonCost = extraTons * positive(materialRule.extraTonRate, 95);
  return { includedTons, extraTons, extraTonCost };
}

function recommendedService(vehicle: Vehicle, trips: number, handlingClass: MaterialHandlingClass) {
  if (handlingClass !== "heavy_lowboy") return undefined;
  if (vehicle.vehicleType === "dump_trailer") return "dump trailer";
  if (trips <= 1) return "1-trip heavy pickup";
  if (trips === 2) return "2-trip heavy pickup";
  return "manual review";
}

function warningsForFacility(facility: DisposalFacility, materialType: MaterialCategory | undefined, route: JobRouteEstimate) {
  const warnings: string[] = [];
  if (facilityRejectsMaterial(facility, materialType)) warnings.push("Facility rejects this material.");
  if (!facilityAcceptsMaterial(facility, materialType)) warnings.push("Material acceptance is not confirmed.");
  if (facilityPricingIsStale(facility)) warnings.push("Facility pricing is stale.");
  if (route.roundTripMiles == null) warnings.push("Route distance unavailable.");
  return warnings;
}

export function buildFacilityRouteComparisons(input: RecommendationInput, settings: PricingSettings): FacilityRouteComparison[] {
  const selectedVehicle = settings.vehicles.find((vehicle) => vehicle.id === input.selectedVehicleId) ?? settings.vehicles.find((vehicle) => vehicle.isDefault) ?? settings.vehicles[0];
  const estimatedTons = positive(input.estimatedTons, positive(input.estimatedWeightLbs, 0) / 2000);
  const fuelPrice = positive(input.fuelPricePerGallon, settings.defaults.fuelPricePerGallon);
  const vehicle = selectedVehicle;
  const handlingClass = handlingClassForInput(input, settings);

  return settings.disposalFacilities
    .filter((facility) => facility.isActive)
    .map((facility) => {
      const route = routeForFacility(input, facility);
      const acceptedMaterial = facilityAcceptsMaterial(facility, input.materialType) && !facilityRejectsMaterial(facility, input.materialType);
      const pricingStale = facilityPricingIsStale(facility);
      const trips = vehicle ? tripsRequired(vehicle, positive(input.cubicYards, 0), positive(input.estimatedWeightLbs, 0), handlingClass) : 1;
      const disposalCost = estimateFacilityDisposalCost(facility, { estimatedTons } as Job, trips);
      const fuelCost = vehicle ? vehicleFuelCost(vehicle, route.roundTripMiles, trips, fuelPrice) : 0;
      const vehicleCost = vehicle ? vehicleMilesCost(vehicle, route.roundTripMiles, trips) : 0;

      return {
        jobAddress: input.jobAddress,
        facilityId: facility.id,
        facilityName: facility.facilityName,
        oneWayMiles: route.oneWayMiles,
        roundTripMiles: route.roundTripMiles,
        estimatedDriveMinutes: route.estimatedDriveMinutes,
        fuelCost: roundMoney(fuelCost),
        vehicleCost: roundMoney(vehicleCost),
        disposalCost: roundMoney(disposalCost),
        totalOperationalCost: roundMoney(disposalCost + fuelCost + vehicleCost),
        acceptedMaterial,
        pricingStale,
        warnings: warningsForFacility(facility, input.materialType, route),
      };
    });
}

export function buildVehicleJobComparisons(
  input: RecommendationInput,
  settings: PricingSettings,
  facilityComparison?: FacilityRouteComparison,
): VehicleJobComparison[] {
  const selectedFacility =
    settings.disposalFacilities.find((facility) => facility.id === facilityComparison?.facilityId) ??
    settings.disposalFacilities.find((facility) => facility.id === input.selectedFacilityId) ??
    settings.disposalFacilities.find((facility) => facility.isDefault) ??
    settings.disposalFacilities[0];
  const route = selectedFacility ? routeForFacility(input, selectedFacility) : emptyRouteEstimate(input.jobAddress, "");
  const fuelPrice = positive(input.fuelPricePerGallon, settings.defaults.fuelPricePerGallon);
  const estimatedWeightLbs = positive(input.estimatedWeightLbs, 0);
  const estimatedTons = positive(input.estimatedTons, estimatedWeightLbs / 2000);
  const cubicYards = positive(input.cubicYards, 0);
  const quotedAmount = positive(input.quotedAmount, 0);
  const materialRule = materialRuleForInput(input, settings);
  const handlingClass = materialRule?.handlingClass ?? "standard_junk";
  const includedTons = includedTonDetails(materialRule, estimatedTons, cubicYards);

  return settings.vehicles
    .filter((vehicle) => vehicle.isActive)
    .map((vehicle) => {
      const eligible = vehicleIsEligible(vehicle, handlingClass);
      const trips = tripsRequired(vehicle, cubicYards, estimatedWeightLbs, handlingClass);
      const disposalCost = estimateFacilityDisposalCost(selectedFacility, { estimatedTons } as Job, trips);
      const fuelCost = vehicleFuelCost(vehicle, route.roundTripMiles, trips, fuelPrice);
      const vehicleCost = vehicleMilesCost(vehicle, route.roundTripMiles, trips);
      const totalOperationalCost = disposalCost + fuelCost + vehicleCost + (includedTons.extraTonCost ?? 0);
      const payloadWarning =
        estimatedWeightLbs > vehicle.maxPayloadLbs
          ? "Payload exceeded"
          : estimatedWeightLbs > vehicle.maxPayloadLbs * 0.85
            ? "Near payload limit"
            : undefined;
      const warnings = [
        ...(handlingClass === "heavy_lowboy" && vehicle.vehicleType === "box_truck"
          ? ["Box truck excluded: heavy loose debris should be handled with low-load equipment or split van/trailer trips."]
          : []),
        ...(handlingClass === "heavy_lowboy" && vehicle.bedHeightClass === "high" && vehicle.vehicleType !== "box_truck"
          ? ["High-bed vehicle excluded for dense loose debris."]
          : []),
        ...(handlingClass === "heavy_lowboy" && vehicle.vehicleType === "cargo_van"
          ? ["Van fallback uses 5 yd3 per trip for heavy material planning."]
          : []),
        ...(payloadWarning ? [payloadWarning] : []),
        ...(trips > 1 ? [`${trips} trips required`] : []),
        ...(route.roundTripMiles == null ? ["Route distance unavailable"] : []),
      ];

      return {
        jobAddress: input.jobAddress,
        vehicleId: vehicle.id,
        vehicleName: vehicle.vehicleName,
        vehicleType: vehicle.vehicleType,
        cubicYardCapacity: vehicle.usableCubicYards,
        payloadCapacityLbs: vehicle.maxPayloadLbs,
        mpg: positive(vehicle.mpgLoaded, positive(vehicle.mpgUnloaded, 0)),
        operatingCostPerMile: positive(vehicle.mileageCost, 0),
        estimatedWeightLbs,
        estimatedTons,
        tripsRequired: trips,
        oneWayMiles: route.oneWayMiles,
        roundTripMiles: route.roundTripMiles,
        estimatedDriveMinutes: route.estimatedDriveMinutes,
        fuelCost: roundMoney(fuelCost),
        vehicleCost: roundMoney(vehicleCost),
        disposalCost: roundMoney(disposalCost),
        totalOperationalCost: roundMoney(totalOperationalCost),
        estimatedProfit: roundMoney(quotedAmount - totalOperationalCost),
        payloadWarning,
        handlingClass,
        includedTons: includedTons.includedTons,
        extraTons: includedTons.extraTons,
        extraTonCost: includedTons.extraTonCost ? roundMoney(includedTons.extraTonCost) : includedTons.extraTonCost,
        recommendedService: recommendedService(vehicle, trips, handlingClass),
        excludedFromRecommendation: !eligible,
        acceptedMaterial: facilityAcceptsMaterial(selectedFacility, input.materialType),
        pricingStale: facilityPricingIsStale(selectedFacility),
        warnings,
      };
    });
}

function recommendationReason(
  selected: FacilityRouteComparison | undefined,
  recommended: FacilityRouteComparison | undefined,
  handlingClass: MaterialHandlingClass,
  recommendedVehicle?: VehicleJobComparison,
) {
  if (!recommended) return "No active facility recommendation is available.";
  if (handlingClass === "heavy_lowboy") {
    if (recommendedVehicle?.vehicleType === "dump_trailer") {
      return "Lowboy-style heavy load: dump trailer preferred for dense loose debris because it keeps loading height low and reduces overweight risk.";
    }
    return "Box truck excluded: heavy loose debris should be handled with low-load equipment or split van/trailer trips.";
  }
  if (!selected) return `${recommended.facilityName} has the lowest available operational cost.`;
  if (!selected.acceptedMaterial && recommended.acceptedMaterial) return "Recommended facility accepts this material while the selected facility does not.";
  if (selected.pricingStale && !recommended.pricingStale) return "Recommended facility has fresher pricing and a lower operating cost.";
  if ((selected.roundTripMiles ?? 0) > (recommended.roundTripMiles ?? 0)) return "Recommended facility lowers drive distance and operating cost.";
  return "Recommended facility has the lowest combined disposal, fuel, and vehicle operating cost.";
}

export function buildBestRecommendation(
  input: RecommendationInput,
  settings: PricingSettings,
): {
  recommendation: BestFacilityRecommendation | null;
  facilityComparisons: FacilityRouteComparison[];
  vehicleComparisons: VehicleJobComparison[];
} {
  const facilityComparisons = buildFacilityRouteComparisons(input, settings);
  const handlingClass = handlingClassForInput(input, settings);
  const compatible = facilityComparisons.filter((comparison) => comparison.acceptedMaterial);
  const rankedFacilities = (compatible.length ? compatible : facilityComparisons).slice().sort((a, b) => {
    if (a.acceptedMaterial !== b.acceptedMaterial) return a.acceptedMaterial ? -1 : 1;
    if (a.pricingStale !== b.pricingStale) return a.pricingStale ? 1 : -1;
    return a.totalOperationalCost - b.totalOperationalCost;
  });
  const recommendedFacility = rankedFacilities[0];
  const selectedFacility =
    facilityComparisons.find((comparison) => comparison.facilityId === input.selectedFacilityId) ?? recommendedFacility;
  const vehicleComparisons = buildVehicleJobComparisons(input, settings, recommendedFacility);
  const eligibleVehicleComparisons = vehicleComparisons.filter((comparison) => !comparison.excludedFromRecommendation);
  const rankedVehicles = (eligibleVehicleComparisons.length ? eligibleVehicleComparisons : vehicleComparisons).slice().sort((a, b) => {
    if (handlingClass === "heavy_lowboy") {
      const aDump = a.vehicleType === "dump_trailer" ? 0 : 1;
      const bDump = b.vehicleType === "dump_trailer" ? 0 : 1;
      if (aDump !== bDump) return aDump - bDump;
    }
    const aSafe = a.payloadWarning === "Payload exceeded" ? 1 : 0;
    const bSafe = b.payloadWarning === "Payload exceeded" ? 1 : 0;
    if (aSafe !== bSafe) return aSafe - bSafe;
    if (a.tripsRequired !== b.tripsRequired) return a.tripsRequired - b.tripsRequired;
    return b.estimatedProfit - a.estimatedProfit;
  });
  const recommendedVehicle = rankedVehicles[0];
  const selectedVehicle =
    vehicleComparisons.find((comparison) => comparison.vehicleId === input.selectedVehicleId) ?? recommendedVehicle;

  if (!recommendedFacility) {
    return { recommendation: null, facilityComparisons, vehicleComparisons };
  }

  const selectedTotalCost = selectedFacility?.totalOperationalCost ?? recommendedFacility.totalOperationalCost;
  const recommendedTotalCost = recommendedFacility.totalOperationalCost;
  const distanceDifferenceMiles =
    selectedFacility?.roundTripMiles != null && recommendedFacility.roundTripMiles != null
      ? selectedFacility.roundTripMiles - recommendedFacility.roundTripMiles
      : null;
  const driveTimeDifferenceMinutes =
    selectedFacility?.estimatedDriveMinutes != null && recommendedFacility.estimatedDriveMinutes != null
      ? selectedFacility.estimatedDriveMinutes - recommendedFacility.estimatedDriveMinutes
      : null;

  return {
    facilityComparisons,
    vehicleComparisons,
    recommendation: {
      jobAddress: input.jobAddress,
      facilityId: recommendedFacility.facilityId,
      facilityName: recommendedFacility.facilityName,
      vehicleId: recommendedVehicle?.vehicleId,
      vehicleName: recommendedVehicle?.vehicleName,
      selectedFacilityId: input.selectedFacilityId,
      selectedVehicleId: input.selectedVehicleId,
      selectedTotalCost,
      recommendedTotalCost,
      estimatedSavings: roundMoney(selectedTotalCost - recommendedTotalCost),
      distanceDifferenceMiles,
      driveTimeDifferenceMinutes,
      reason: recommendationReason(selectedFacility, recommendedFacility, handlingClass, recommendedVehicle),
      facilityComparison: recommendedFacility,
      vehicleComparison: recommendedVehicle,
      warnings: [...recommendedFacility.warnings, ...(recommendedVehicle?.warnings ?? [])],
    },
  };
}

export function recommendationInputFromJob(job: Job, settings: PricingSettings): RecommendationInput {
  return {
    jobAddress: fullAddress(job),
    selectedFacilityId: job.facilityId,
    selectedVehicleId: job.vehicleId,
    materialType: job.materialType,
    materialRule: settings.materialPricingRules.find((rule) => rule.materialCategory === job.materialType),
    cubicYards: job.cubicYards,
    estimatedWeightLbs: job.estimatedWeightLbs,
    estimatedTons: job.estimatedTons,
    quotedAmount: job.quotedAmount,
    fuelPricePerGallon: settings.defaults.fuelPricePerGallon,
  };
}
