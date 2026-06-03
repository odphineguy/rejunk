import { defaultPricingSettings } from "@/data/defaultPricing";
import type { MaterialHandlingClass, MaterialPricingRule, PricingSettings, SavedEstimate, Vehicle } from "@/types/pricing";
import {
  deleteSavedEstimateRemote,
  loadAllSettings,
  loadSavedEstimatesRemote,
  saveAllSettings,
  upsertSavedEstimateRemote,
} from "@/lib/dataStore";
import { isSupabaseConfigured } from "@/lib/supabase";

const SETTINGS_KEY = "junk_estimator_pricing_settings_v1";
const SAVED_ESTIMATES_KEY = "junk_estimator_saved_estimates_v1";

const canUseLocalStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

function readJson<T>(key: string, fallback: T): T {
  if (!canUseLocalStorage()) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function defaultHandlingClass(material: Partial<MaterialPricingRule>): MaterialHandlingClass {
  if (
    material.materialCategory &&
    ["clean_concrete", "dirt", "rock", "brick", "clean_tile", "asphalt", "pavers", "heavy_clean_debris"].includes(material.materialCategory)
  ) {
    return "heavy_lowboy";
  }
  if (material.materialCategory === "green_waste") return "green_waste";
  if (material.materialCategory === "mixed_c_and_d") return "mixed_demo";
  if (material.materialCategory === "appliances" || material.materialCategory === "metal") return "metal_appliance";
  return "standard_junk";
}

function normalizeVehicle(vehicle: Vehicle): Vehicle {
  if (vehicle.vehicleType === "box_truck") {
    return {
      ...vehicle,
      allowedHandlingClasses: vehicle.allowedHandlingClasses ?? ["standard_junk", "green_waste", "mixed_demo", "metal_appliance"],
      bedHeightClass: vehicle.bedHeightClass ?? "high",
      looseDebrisSuitable: vehicle.looseDebrisSuitable ?? false,
      heavyMaterialSuitable: vehicle.heavyMaterialSuitable ?? false,
    };
  }
  if (vehicle.vehicleType === "dump_trailer") {
    return {
      ...vehicle,
      allowedHandlingClasses: vehicle.allowedHandlingClasses ?? ["standard_junk", "green_waste", "mixed_demo", "metal_appliance", "heavy_lowboy"],
      bedHeightClass: vehicle.bedHeightClass ?? "low",
      looseDebrisSuitable: vehicle.looseDebrisSuitable ?? true,
      heavyMaterialSuitable: vehicle.heavyMaterialSuitable ?? true,
    };
  }
  if (vehicle.vehicleType === "cargo_van") {
    return {
      ...vehicle,
      allowedHandlingClasses: vehicle.allowedHandlingClasses ?? ["standard_junk", "green_waste", "mixed_demo", "metal_appliance", "heavy_lowboy"],
      bedHeightClass: vehicle.bedHeightClass ?? "medium",
      looseDebrisSuitable: vehicle.looseDebrisSuitable ?? true,
      heavyMaterialSuitable: vehicle.heavyMaterialSuitable ?? "conditional",
    };
  }
  return {
    ...vehicle,
    allowedHandlingClasses: vehicle.allowedHandlingClasses ?? ["standard_junk", "green_waste", "mixed_demo", "metal_appliance"],
    bedHeightClass: vehicle.bedHeightClass ?? "medium",
    looseDebrisSuitable: vehicle.looseDebrisSuitable ?? true,
    heavyMaterialSuitable: vehicle.heavyMaterialSuitable ?? false,
  };
}

function normalizeMaterial(material: MaterialPricingRule): MaterialPricingRule {
  const handlingClass = material.handlingClass ?? defaultHandlingClass(material);
  return {
    ...material,
    handlingClass,
    includedTons:
      material.includedTons ??
      (handlingClass === "heavy_lowboy" ? (material.materialCategory === "heavy_clean_debris" ? 3 : 4) : undefined),
    extraTonRate: material.extraTonRate ?? (handlingClass === "heavy_lowboy" ? 95 : undefined),
  };
}

function mergeSettings(stored: Partial<PricingSettings>): PricingSettings {
  const defaultMaterialById = new Map(defaultPricingSettings.materialPricingRules.map((material) => [material.id, material]));
  const defaultVehicleById = new Map(defaultPricingSettings.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const storedMaterials = stored.materialPricingRules ?? defaultPricingSettings.materialPricingRules;
  const storedVehicles = stored.vehicles ?? defaultPricingSettings.vehicles;

  return {
    ...defaultPricingSettings,
    ...stored,
    defaults: {
      ...defaultPricingSettings.defaults,
      ...stored.defaults,
    },
    disposalFacilities: stored.disposalFacilities ?? defaultPricingSettings.disposalFacilities,
    vehicles: storedVehicles.map((vehicle) => normalizeVehicle({ ...defaultVehicleById.get(vehicle.id), ...vehicle } as Vehicle)),
    materialPricingRules: storedMaterials.map((material) =>
      normalizeMaterial({ ...defaultMaterialById.get(material.id), ...material } as MaterialPricingRule),
    ),
    volumePricingBenchmarks: stored.volumePricingBenchmarks ?? defaultPricingSettings.volumePricingBenchmarks,
  };
}

// Synchronous in-memory cache. The pages read this synchronously (via useState
// initializers); Supabase reads/writes happen through hydratePricingData() and
// the fire-and-forget writes below. localStorage stays as an offline warm cache
// and fallback when Supabase is not configured.
let cachedSettings: PricingSettings = mergeSettings(readJson<Partial<PricingSettings>>(SETTINGS_KEY, {}));
let cachedEstimates: SavedEstimate[] = readJson<SavedEstimate[]>(SAVED_ESTIMATES_KEY, []);

function reportRemoteError(context: string) {
  return (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pricingStorage] Remote ${context} failed; local cache kept in sync.`, message);
  };
}

/**
 * Loads settings + saved estimates from Supabase into the in-memory cache.
 * Call once at startup BEFORE rendering so pages mount with fresh data.
 * Falls back to the localStorage cache when Supabase is unconfigured/unreachable.
 */
export async function hydratePricingData(): Promise<void> {
  if (!isSupabaseConfigured) return;

  const [remoteSettings, remoteEstimates] = await Promise.all([
    loadAllSettings().catch((error) => {
      reportRemoteError("settings load")(error);
      return null;
    }),
    loadSavedEstimatesRemote().catch((error) => {
      reportRemoteError("estimates load")(error);
      return null;
    }),
  ]);

  if (remoteSettings) {
    cachedSettings = mergeSettings(remoteSettings);
    writeJson(SETTINGS_KEY, cachedSettings);
  }
  if (remoteEstimates) {
    cachedEstimates = remoteEstimates;
    writeJson(SAVED_ESTIMATES_KEY, cachedEstimates);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("pricing-settings-updated"));
  }
}

export function loadPricingSettings(): PricingSettings {
  return cachedSettings;
}

export function savePricingSettings(settings: PricingSettings) {
  cachedSettings = settings;
  writeJson(SETTINGS_KEY, settings);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("pricing-settings-updated"));
  }
  void saveAllSettings(settings).catch(reportRemoteError("settings save"));
}

export function resetPricingSettings() {
  savePricingSettings(defaultPricingSettings);
  return defaultPricingSettings;
}

export function resetDisposalFacilities(settings: PricingSettings): PricingSettings {
  const next = {
    ...settings,
    disposalFacilities: defaultPricingSettings.disposalFacilities,
  };
  savePricingSettings(next);
  return next;
}

export function resetVehicles(settings: PricingSettings): PricingSettings {
  const next = {
    ...settings,
    vehicles: defaultPricingSettings.vehicles,
  };
  savePricingSettings(next);
  return next;
}

export function resetMaterialPricingRules(settings: PricingSettings): PricingSettings {
  const next = {
    ...settings,
    materialPricingRules: defaultPricingSettings.materialPricingRules,
  };
  savePricingSettings(next);
  return next;
}

export function loadSavedEstimates(): SavedEstimate[] {
  return cachedEstimates;
}

export function saveEstimate(estimate: SavedEstimate) {
  const estimateIndex = cachedEstimates.findIndex((item) => item.id === estimate.id);
  const updatedEstimate = {
    ...estimate,
    updatedAt: new Date().toISOString(),
  };

  cachedEstimates =
    estimateIndex >= 0
      ? cachedEstimates.map((item, index) => (index === estimateIndex ? updatedEstimate : item))
      : [updatedEstimate, ...cachedEstimates];

  writeJson(SAVED_ESTIMATES_KEY, cachedEstimates);
  void upsertSavedEstimateRemote(updatedEstimate).catch(reportRemoteError("estimate save"));
  return updatedEstimate;
}

export function deleteSavedEstimate(estimateId: string) {
  cachedEstimates = cachedEstimates.filter((estimate) => estimate.id !== estimateId);
  writeJson(SAVED_ESTIMATES_KEY, cachedEstimates);
  void deleteSavedEstimateRemote(estimateId).catch(reportRemoteError("estimate delete"));
  return cachedEstimates;
}
