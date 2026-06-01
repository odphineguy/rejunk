import { supabase, ensureSession } from "@/lib/supabase";
import type { Database } from "@/types/database.types";
import type {
  Facility,
  FacilityAcceptanceFlags,
  FacilityType,
  LegacyFacilityPricing,
  MaterialCategory,
  MaterialPricingMode,
  MaterialPricingRule,
  PricingSettings,
  SavedEstimate,
  Vehicle,
  VehicleType,
  VolumePricingBenchmark,
} from "@/types/pricing";
import { defaultPricingSettings } from "@/data/defaultPricing";

type Tables = Database["public"]["Tables"];
type FacilityRow = Tables["facilities"]["Row"];
type VehicleRow = Tables["vehicles"]["Row"];
type MaterialRow = Tables["material_pricing_rules"]["Row"];
type BenchmarkRow = Tables["volume_benchmarks"]["Row"];
type DefaultsRow = Tables["pricing_defaults"]["Row"];
type EstimateRow = Tables["saved_estimates"]["Row"];

// ---------------------------------------------------------------------------
// Row -> domain mappers
// ---------------------------------------------------------------------------

function deriveAcceptance(accepted: string[], facilityType: string): FacilityAcceptanceFlags {
  return {
    tires: accepted.includes("tires"),
    appliances: accepted.includes("appliances"),
    recycling:
      facilityType === "recycling_center" || accepted.includes("cardboard") || accepted.includes("metal"),
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
    minimum: row.minimum_charge > 0 ? `$${row.minimum_charge} minimum estimate` : undefined,
  };
}

function facilityFromRow(row: FacilityRow): Facility {
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

function vehicleFromRow(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    vehicleName: row.vehicle_name,
    vehicleType: row.vehicle_type as VehicleType,
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
    notes: row.notes ?? undefined,
    isDefault: row.is_default,
    isActive: row.is_active,
  };
}

function materialFromRow(row: MaterialRow): MaterialPricingRule {
  const range: [number, number] | undefined =
    row.density_range_min != null && row.density_range_max != null
      ? [row.density_range_min, row.density_range_max]
      : undefined;
  return {
    id: row.id,
    materialName: row.material_name,
    materialCategory: row.material_category as MaterialCategory,
    defaultDensityLbsPerYard: row.default_density_lbs_per_yard,
    densityRangeLbsPerYard: range,
    pricingMode: row.pricing_mode as MaterialPricingMode,
    requiresWeightOverride: row.requires_weight_override,
    preferredFacilityTypes: row.preferred_facility_types as FacilityType[],
    warningText: row.warning_text ?? undefined,
    laborDifficultyMultiplier: row.labor_difficulty_multiplier,
    disposalDifficultyMultiplier: row.disposal_difficulty_multiplier,
    notes: row.notes ?? undefined,
    isActive: row.is_active,
  };
}

function benchmarkFromRow(row: BenchmarkRow): VolumePricingBenchmark {
  return { id: row.id, label: row.label, fraction: row.fraction, price: row.price };
}

function defaultsFromRow(row: DefaultsRow): PricingSettings["defaults"] {
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

// ---------------------------------------------------------------------------
// Domain -> row mappers (canonical columns only)
// ---------------------------------------------------------------------------

function facilityToRow(f: Facility): Tables["facilities"]["Insert"] {
  return {
    id: f.id,
    facility_name: f.facilityName,
    facility_type: f.facilityType,
    address: f.address,
    city: f.city,
    state: f.state,
    zip: f.zip,
    phone: f.phone ?? null,
    website: f.website ?? null,
    latitude: f.latitude,
    longitude: f.longitude,
    accepted_materials: f.acceptedMaterials,
    rejected_materials: f.rejectedMaterials,
    price_type: f.priceType,
    default_rate: f.defaultRate,
    minimum_charge: f.minimumCharge,
    environmental_fee: f.environmentalFee,
    fuel_surcharge: f.fuelSurcharge,
    extra_fees: f.extraFees,
    hours: f.hours,
    notes: f.notes ?? null,
    best_use_case: f.bestUseCase ?? null,
    pricing_impact_label: f.pricingImpactLabel ?? null,
    last_verified_date: f.lastVerifiedDate ?? null,
    is_default: f.isDefault,
    is_active: f.isActive,
  };
}

function vehicleToRow(v: Vehicle): Tables["vehicles"]["Insert"] {
  return {
    id: v.id,
    vehicle_name: v.vehicleName,
    vehicle_type: v.vehicleType,
    usable_cubic_yards: v.usableCubicYards,
    max_payload_lbs: v.maxPayloadLbs,
    empty_weight_lbs: v.emptyWeightLbs ?? null,
    gvwr_lbs: v.gvwrLbs ?? null,
    fuel_type: v.fuelType,
    mpg_unloaded: v.mpgUnloaded,
    mpg_loaded: v.mpgLoaded,
    hourly_vehicle_cost: v.hourlyVehicleCost ?? null,
    mileage_cost: v.mileageCost ?? null,
    has_liftgate: v.hasLiftgate,
    has_dump_capability: v.hasDumpCapability,
    requires_tow_vehicle: v.requiresTowVehicle,
    notes: v.notes ?? null,
    is_default: v.isDefault,
    is_active: v.isActive,
  };
}

function materialToRow(m: MaterialPricingRule): Tables["material_pricing_rules"]["Insert"] {
  return {
    id: m.id,
    material_name: m.materialName,
    material_category: m.materialCategory,
    default_density_lbs_per_yard: m.defaultDensityLbsPerYard,
    density_range_min: m.densityRangeLbsPerYard?.[0] ?? null,
    density_range_max: m.densityRangeLbsPerYard?.[1] ?? null,
    pricing_mode: m.pricingMode,
    requires_weight_override: m.requiresWeightOverride,
    preferred_facility_types: m.preferredFacilityTypes,
    warning_text: m.warningText ?? null,
    labor_difficulty_multiplier: m.laborDifficultyMultiplier,
    disposal_difficulty_multiplier: m.disposalDifficultyMultiplier,
    notes: m.notes ?? null,
    is_active: m.isActive ?? true,
  };
}

function benchmarkToRow(b: VolumePricingBenchmark): Tables["volume_benchmarks"]["Insert"] {
  return { id: b.id, label: b.label, fraction: b.fraction, price: b.price };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function getUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Sync a config table to exactly `rows`: upsert all, delete any id not present. */
async function syncTable(
  table: "facilities" | "vehicles" | "material_pricing_rules" | "volume_benchmarks",
  rows: { id: string }[],
) {
  if (!supabase) return;
  if (rows.length > 0) {
    const { error } = await supabase.from(table).upsert(rows as never[]);
    if (error) throw error;
  }
  const ids = rows.map((r) => r.id);
  const remove = supabase.from(table).delete();
  const { error } =
    ids.length > 0
      ? await remove.not("id", "in", `(${ids.join(",")})`)
      : await remove.gte("created_at", "1970-01-01"); // delete all
  if (error) throw error;
}

export async function loadAllSettings(): Promise<PricingSettings | null> {
  if (!supabase) return null;
  const ok = await ensureSession();
  if (!ok) return null;

  const [facilities, vehicles, materials, benchmarks, defaults] = await Promise.all([
    supabase.from("facilities").select("*"),
    supabase.from("vehicles").select("*"),
    supabase.from("material_pricing_rules").select("*"),
    supabase.from("volume_benchmarks").select("*").order("fraction"),
    supabase.from("pricing_defaults").select("*").eq("id", 1).maybeSingle(),
  ]);

  const firstError =
    facilities.error || vehicles.error || materials.error || benchmarks.error || defaults.error;
  if (firstError) {
    console.error("[dataStore] Failed to load settings:", firstError.message);
    return null;
  }

  return {
    disposalFacilities: (facilities.data ?? []).map(facilityFromRow),
    vehicles: (vehicles.data ?? []).map(vehicleFromRow),
    materialPricingRules: (materials.data ?? []).map(materialFromRow),
    volumePricingBenchmarks: (benchmarks.data ?? []).map(benchmarkFromRow),
    defaults: defaults.data ? defaultsFromRow(defaults.data) : defaultPricingSettings.defaults,
  };
}

export async function saveAllSettings(settings: PricingSettings): Promise<void> {
  if (!supabase) return;
  const ok = await ensureSession();
  if (!ok) return;

  await syncTable("facilities", settings.disposalFacilities.map(facilityToRow));
  await syncTable("vehicles", settings.vehicles.map(vehicleToRow));
  await syncTable("material_pricing_rules", settings.materialPricingRules.map(materialToRow));
  await syncTable("volume_benchmarks", settings.volumePricingBenchmarks.map(benchmarkToRow));

  const d = settings.defaults;
  const { error } = await supabase.from("pricing_defaults").upsert({
    id: 1,
    fuel_price_per_gallon: d.fuelPricePerGallon,
    workers: d.workers,
    hourly_labor_cost: d.hourlyLaborCost,
    estimated_hours: d.estimatedHours,
    target_margin_decimal: d.targetMarginDecimal,
    minimum_profit_dollars: d.minimumProfitDollars,
    default_facility_rate_per_ton: d.defaultFacilityRatePerTon,
  });
  if (error) throw error;
}

export async function loadSavedEstimatesRemote(): Promise<SavedEstimate[] | null> {
  if (!supabase) return null;
  const ok = await ensureSession();
  if (!ok) return null;

  const { data, error } = await supabase
    .from("saved_estimates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[dataStore] Failed to load estimates:", error.message);
    return null;
  }
  return (data ?? []).map((row: EstimateRow) => row.data as unknown as SavedEstimate);
}

export async function upsertSavedEstimateRemote(estimate: SavedEstimate): Promise<void> {
  if (!supabase) return;
  const ok = await ensureSession();
  if (!ok) return;

  const { error } = await supabase.from("saved_estimates").upsert({
    id: estimate.id,
    created_by: await getUserId(),
    customer_name: estimate.customerName ?? null,
    job_address: estimate.jobAddress ?? null,
    material_type: estimate.materialType ?? null,
    vehicle_id: estimate.vehicleId ?? null,
    facility_id: estimate.facilityId ?? null,
    final_quote: estimate.finalQuote ?? null,
    data: estimate as unknown as Database["public"]["Tables"]["saved_estimates"]["Insert"]["data"],
  });
  if (error) throw error;
}

export async function deleteSavedEstimateRemote(id: string): Promise<void> {
  if (!supabase) return;
  const ok = await ensureSession();
  if (!ok) return;
  const { error } = await supabase.from("saved_estimates").delete().eq("id", id);
  if (error) throw error;
}
