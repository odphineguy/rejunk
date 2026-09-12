import type { Database } from "@/types/database.types";
import type {
  Facility,
  FacilityAcceptanceFlags,
  FacilityType,
  MaterialHandlingClass,
  LegacyFacilityPricing,
  MaterialCategory,
  MaterialPricingMode,
  MaterialPricingRule,
  PricingSettings,
  Vehicle,
  VehicleType,
  VolumePricingBenchmark,
} from "@/types/pricing";
type Tables = Database["public"]["Tables"];
type FacilityRow = Tables["facilities"]["Row"];
type VehicleRow = Tables["vehicles"]["Row"];
type MaterialRow = Tables["material_pricing_rules"]["Row"];
type BenchmarkRow = Tables["volume_benchmarks"]["Row"];
type DefaultsRow = Tables["pricing_defaults"]["Row"];
function deriveAcceptance(
  accepted: string[],
  facilityType: string
): FacilityAcceptanceFlags {
  return {
    tires: accepted.includes("tires"),
    appliances: accepted.includes("appliances"),
    recycling:
      facilityType === "recycling_center" ||
      accepted.includes("cardboard") ||
      accepted.includes("metal"),
    hazardousWaste: accepted.includes("hazardous_excluded"),
  };
}

function derivePricing(row: FacilityRow): LegacyFacilityPricing {
  const rateLabel = (() => {
    switch (row.price_type) {
      case "free":
        return "Free";
      case "per_ton":
        return `$${row.default_rate}/ton estimate`;
      case "per_item":
        return `$${row.default_rate}/item estimate`;
      case "flat_fee":
        return `$${row.default_rate} flat fee`;
      case "payout":
        return `Payout $${row.default_rate}`;
      default:
        return undefined;
    }
  })();

  return {
    msw: rateLabel,
    minimum:
      row.minimum_charge > 0
        ? `$${row.minimum_charge} minimum estimate`
        : undefined,
  };
}

function defaultHandlingClass(
  materialCategory: MaterialCategory
): MaterialHandlingClass {
  if (
    [
      "clean_concrete",
      "dirt",
      "rock",
      "sod",
      "stone",
      "brick",
      "clean_tile",
      "asphalt",
      "pavers",
      "heavy_clean_debris",
    ].includes(materialCategory)
  ) {
    return "heavy_lowboy";
  }
  if (materialCategory === "green_waste") return "green_waste";
  if (materialCategory === "mixed_c_and_d") return "mixed_demo";
  if (materialCategory === "appliances" || materialCategory === "metal")
    return "metal_appliance";
  return "standard_junk";
}

export function facilityFromRow(row: FacilityRow): Facility {
  const facilityType = row.facility_type as FacilityType;
  return {
    id: row.id,
    facilityName: row.facility_name,
    facilityType,
    address: row.address ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    zip: row.zip ?? "",
    phone: row.phone ?? undefined,
    website: row.website ?? undefined,
    latitude: row.latitude ?? 0,
    longitude: row.longitude ?? 0,
    acceptedMaterials: row.accepted_materials as MaterialCategory[],
    rejectedMaterials: row.rejected_materials as MaterialCategory[],
    priceType: row.price_type as Facility["priceType"],
    defaultRate: row.default_rate,
    minimumCharge: row.minimum_charge,
    environmentalFee: row.environmental_fee,
    fuelSurcharge: row.fuel_surcharge,
    extraFees: row.extra_fees,
    hours: row.hours,
    notes: row.notes ?? undefined,
    bestUseCase: row.best_use_case ?? undefined,
    pricingImpactLabel: row.pricing_impact_label ?? undefined,
    lastVerifiedDate: row.last_verified_date ?? undefined,
    isDefault: row.is_default,
    isActive: row.is_active,
    // Legacy display fields (consumed by Map/FacilityDetails). Reconstructed
    // from the canonical columns since they are not stored separately.
    name: row.facility_name,
    type: facilityType,
    lat: row.latitude ?? 0,
    lng: row.longitude ?? 0,
    description: row.best_use_case ?? row.notes ?? "",
    pricing: derivePricing(row),
    acceptance: deriveAcceptance(row.accepted_materials, row.facility_type),
  };
}

export function vehicleFromRow(row: VehicleRow): Vehicle {
  const vehicleType = row.vehicle_type as VehicleType;
  const heavyMaterialSuitable =
    vehicleType === "dump_trailer"
      ? true
      : vehicleType === "cargo_van"
        ? "conditional"
        : false;
  const bedHeightClass =
    vehicleType === "dump_trailer"
      ? "low"
      : vehicleType === "box_truck"
        ? "high"
        : "medium";
  const allowedHandlingClasses =
    vehicleType === "box_truck"
      ? ([
          "standard_junk",
          "green_waste",
          "mixed_demo",
          "metal_appliance",
        ] as const)
      : ([
          "standard_junk",
          "green_waste",
          "mixed_demo",
          "metal_appliance",
          "heavy_lowboy",
        ] as const);

  return {
    id: row.id,
    vehicleName: row.vehicle_name,
    vehicleType,
    usableCubicYards: row.usable_cubic_yards,
    maxPayloadLbs: row.max_payload_lbs,
    emptyWeightLbs: row.empty_weight_lbs ?? undefined,
    gvwrLbs: row.gvwr_lbs ?? undefined,
    fuelType: row.fuel_type ?? "",
    mpgUnloaded: row.mpg_unloaded ?? 0,
    mpgLoaded: row.mpg_loaded ?? 0,
    hourlyVehicleCost: row.hourly_vehicle_cost ?? undefined,
    mileageCost: row.mileage_cost ?? undefined,
    hasLiftgate: row.has_liftgate,
    hasDumpCapability: row.has_dump_capability,
    requiresTowVehicle: row.requires_tow_vehicle,
    allowedHandlingClasses: [...allowedHandlingClasses],
    bedHeightClass,
    looseDebrisSuitable: vehicleType !== "box_truck",
    heavyMaterialSuitable,
    notes: row.notes ?? undefined,
    isDefault: row.is_default,
    isActive: row.is_active,
    isTemplate: row.is_template ?? false,
  };
}

export function materialFromRow(row: MaterialRow): MaterialPricingRule {
  const materialCategory = row.material_category as MaterialCategory;
  const handlingClass = defaultHandlingClass(materialCategory);
  const range: [number, number] | undefined =
    row.density_range_min != null && row.density_range_max != null
      ? [row.density_range_min, row.density_range_max]
      : undefined;
  return {
    id: row.id,
    materialName: row.material_name,
    materialCategory,
    defaultDensityLbsPerYard: row.default_density_lbs_per_yard,
    densityRangeLbsPerYard: range,
    pricingMode: row.pricing_mode as MaterialPricingMode,
    handlingClass,
    requiresWeightOverride: row.requires_weight_override,
    preferredFacilityTypes: row.preferred_facility_types as FacilityType[],
    includedTons:
      handlingClass === "heavy_lowboy"
        ? materialCategory === "heavy_clean_debris"
          ? 3
          : 4
        : undefined,
    extraTonRate: handlingClass === "heavy_lowboy" ? 95 : undefined,
    warningText: row.warning_text ?? undefined,
    laborDifficultyMultiplier: row.labor_difficulty_multiplier,
    disposalDifficultyMultiplier: row.disposal_difficulty_multiplier,
    notes: row.notes ?? undefined,
    isActive: row.is_active,
  };
}

export function benchmarkFromRow(row: BenchmarkRow): VolumePricingBenchmark {
  return {
    id: row.id,
    label: row.label,
    fraction: row.fraction,
    price: row.price,
  };
}

export function defaultsFromRow(row: DefaultsRow): PricingSettings["defaults"] {
  return {
    fuelPricePerGallon: row.fuel_price_per_gallon,
    workers: row.workers,
    hourlyLaborCost: row.hourly_labor_cost,
    estimatedHours: row.estimated_hours,
    targetMarginDecimal: row.target_margin_decimal,
    minimumProfitDollars: row.minimum_profit_dollars,
    defaultFacilityRatePerTon: row.default_facility_rate_per_ton,
  };
}
