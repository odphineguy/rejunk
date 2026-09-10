import { facilityFromRow, vehicleFromRow, materialFromRow, defaultsFromRow, benchmarkFromRow } from "@shared/pricingRows";
import { businessRows } from "@/lib/businessAccess";
import { isOwner } from "@/lib/staffSession";
import { supabase, ensureSession } from "@/lib/supabase";
import { APP_TENANT_ID } from "@/lib/tenant";
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
  SavedEstimate,
  Vehicle,
  VehicleType,
  VolumePricingBenchmark,
} from "@/types/pricing";
import type { Job } from "@/types/jobs";
import type { ClientRecord } from "@/types/clients";
import type {
  PricebookCategory,
  PricebookCrewSize,
  PricebookItem,
  PricebookItemType,
  PricebookMode,
  PricebookPriceUnit,
} from "@/types/pricebook";
import { defaultPricingSettings } from "@/data/defaultPricing";

type Tables = Database["public"]["Tables"];
type FacilityRow = Tables["facilities"]["Row"];
type VehicleRow = Tables["vehicles"]["Row"];
type MaterialRow = Tables["material_pricing_rules"]["Row"];
type BenchmarkRow = Tables["volume_benchmarks"]["Row"];
type DefaultsRow = Tables["pricing_defaults"]["Row"];
type EstimateRow = Tables["saved_estimates"]["Row"];
type JobRow = Tables["jobs"]["Row"];
type ClientRow = Tables["clients"]["Row"];

// ---------------------------------------------------------------------------
// Row -> domain mappers
// ---------------------------------------------------------------------------

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

function materialToRow(
  m: MaterialPricingRule
): Tables["material_pricing_rules"]["Insert"] {
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

function benchmarkToRow(
  b: VolumePricingBenchmark
): Tables["volume_benchmarks"]["Insert"] {
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

// Set true once we've successfully read the config tables from Supabase this
// session — meaning the in-memory cache reflects the real DB. Until then we
// NEVER destructively delete rows on save: a partial cache (hydration race or
// localStorage fallback) must not wipe rows it never knew about. This is the
// guard that stops the "save Settings → a facility silently disappears" bug
// (the San Tan Transfer Station incident).
let remoteConfigConfirmed = false;

/**
 * Sync a config table to exactly `rows`: upsert all, then delete any id not
 * present — but ONLY when it's safe to do so.
 *
 * `allowDelete` must be the confirmed-remote flag: if we've never read the live
 * table this session, we upsert-only and skip the delete pass entirely. We also
 * refuse to delete on an empty list, since an empty config list always means a
 * bug/race ("wipe every facility"), never an intentional save.
 */
async function syncTable(
  table:
    | "facilities"
    | "vehicles"
    | "material_pricing_rules"
    | "volume_benchmarks",
  rows: { id: string }[],
  allowDelete: boolean
) {
  if (!supabase) return;
  if (rows.length > 0) {
    const { error } = await supabase.from(table).upsert(rows as never[]);
    if (error) throw error;
  }
  // Safety floor: only delete when we've confirmed live DB state this session
  // AND we have a non-empty list to sync against. Otherwise upsert-only.
  if (!allowDelete || rows.length === 0) {
    if (!allowDelete && rows.length > 0) {
      console.warn(
        `[dataStore] ${table}: skipped delete-sync (live DB state not confirmed this session) — upserted ${rows.length} row(s) only, kept existing rows.`
      );
    }
    return;
  }
  const ids = rows.map(r => r.id);
  const { error } = await supabase
    .from(table)
    .delete()
    .not("id", "in", `(${ids.join(",")})`);
  if (error) throw error;
}

export async function loadAllSettings(): Promise<PricingSettings | null> {
  if (!supabase) return null;
  const ok = await ensureSession();
  if (!ok) return null;

  const [facilities, vehicles, materials, benchmarks, defaults] =
    await Promise.all([
      businessRows("facilities"),
      businessRows("vehicles"),
      businessRows("material_pricing_rules"),
      businessRows("volume_benchmarks"),
      businessRows("pricing_defaults").then(r => ({...r, data: r.data?.[0] ?? null})),
    ]);

  const firstError =
    facilities.error ||
    vehicles.error ||
    materials.error ||
    benchmarks.error ||
    defaults.error;
  if (firstError) {
    console.error("[dataStore] Failed to load settings:", firstError.message);
    return null;
  }

  // We've now seen the real DB this session — future saves may safely delete-sync.
  remoteConfigConfirmed = true;

  return {
    disposalFacilities: (facilities.data ?? []).map(facilityFromRow),
    vehicles: (vehicles.data ?? []).map(vehicleFromRow),
    materialPricingRules: (materials.data ?? []).map(materialFromRow),
    volumePricingBenchmarks: (benchmarks.data ?? []).map(benchmarkFromRow),
    heavyBedloadPricing: defaultPricingSettings.heavyBedloadPricing,
    defaults: defaults.data
      ? defaultsFromRow(defaults.data)
      : defaultPricingSettings.defaults,
  };
}

export async function saveAllSettings(
  settings: PricingSettings
): Promise<void> {
  if (!supabase) return;
  const ok = await ensureSession();
  if (!ok) return;

  await syncTable(
    "facilities",
    settings.disposalFacilities.map(facilityToRow),
    remoteConfigConfirmed
  );
  await syncTable(
    "vehicles",
    settings.vehicles.map(vehicleToRow),
    remoteConfigConfirmed
  );
  await syncTable(
    "material_pricing_rules",
    settings.materialPricingRules.map(materialToRow),
    remoteConfigConfirmed
  );
  await syncTable(
    "volume_benchmarks",
    settings.volumePricingBenchmarks.map(benchmarkToRow),
    remoteConfigConfirmed
  );

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

export async function loadSavedEstimatesRemote(): Promise<
  SavedEstimate[] | null
> {
  if (!supabase) return null;
  const ok = await ensureSession();
  if (!ok) return null;

  const { data, error } = await businessRows("saved_estimates");
  if (error) {
    console.error("[dataStore] Failed to load estimates:", error.message);
    return null;
  }
  return (data ?? []).map(
    (row: EstimateRow) => row.data as unknown as SavedEstimate
  );
}

export async function upsertSavedEstimateRemote(
  estimate: SavedEstimate
): Promise<void> {
  if (!supabase) return;
  const ok = await ensureSession();
  if (!ok) throw new Error("Sign in required.");

  if (!isOwner()) {
    const {error} = await (supabase as any).rpc("office_save_estimate", {value: estimate});
    if (error) throw error;
    return;
  }

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
  if (!isOwner()) {
    const {error}=await (supabase as any).rpc("office_delete_record",{resource:"saved_estimates",record_id:id});
    if(error) throw error;
    return;
  }
  const { error } = await supabase
    .from("saved_estimates")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Jobs (full Job snapshot stored in the jsonb `data` column, like estimates)
// ---------------------------------------------------------------------------

export async function loadJobsRemote(): Promise<Job[] | null> {
  if (!supabase) return null;
  const ok = await ensureSession();
  if (!ok) return null;

  const { data, error } = await businessRows("jobs");
  if (error) {
    console.error("[dataStore] Failed to load jobs:", error.message);
    return null;
  }
  return (data ?? []).map((row: JobRow) => row.data as unknown as Job);
}

export async function upsertJobRemote(job: Job): Promise<void> {
  if (!supabase) return;
  const ok = await ensureSession();
  if (!ok) return;

  if (!isOwner()) {
    const {error} = await (supabase as any).rpc("office_save_job", {value: job});
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("jobs").upsert({
    id: job.id,
    created_by: await getUserId(),
    job_number: job.jobNumber,
    source: job.source,
    estimate_id: job.sourceEstimateId ?? null,
    customer_name: job.customerName ?? null,
    status: job.status,
    payment_status: job.paymentStatus,
    scheduled_start: job.scheduledStart ?? null,
    quoted_amount: job.quotedAmount ?? null,
    data: job as unknown as Database["public"]["Tables"]["jobs"]["Insert"]["data"],
  });
  if (error) throw error;
}

export async function deleteJobRemote(id: string): Promise<void> {
  if (!supabase) return;
  const ok = await ensureSession();
  if (!ok) return;
  if (!isOwner()) {
    const {error}=await (supabase as any).rpc("office_delete_record",{resource:"jobs",record_id:id});
    if(error) throw error;
    return;
  }
  const { error } = await supabase.from("jobs").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Clients (full ClientRecord snapshot in the jsonb `data` column, like jobs).
// Carries the contact log alongside the client.
// ---------------------------------------------------------------------------

export async function loadClientsRemote(): Promise<ClientRecord[] | null> {
  if (!supabase) return null;
  const ok = await ensureSession();
  if (!ok) return null;

  const { data, error } = await supabase.from("clients").select("*");
  if (error) {
    console.error("[dataStore] Failed to load clients:", error.message);
    return null;
  }
  return (data ?? []).map(
    (row: ClientRow) => row.data as unknown as ClientRecord
  );
}

export async function upsertClientRemote(client: ClientRecord): Promise<void> {
  if (!supabase) return;
  const ok = await ensureSession();
  if (!ok) return;

  const { error } = await supabase.from("clients").upsert({
    id: client.id,
    created_by: await getUserId(),
    kind: client.kind,
    first_name: client.firstName ?? null,
    last_name: client.lastName ?? null,
    company: client.company ?? null,
    email: client.email ?? null,
    phone: client.phone ?? null,
    data: client as unknown as Database["public"]["Tables"]["clients"]["Insert"]["data"],
  });
  if (error) throw error;
}

export async function deleteClientRemote(id: string): Promise<void> {
  if (!supabase) return;
  const ok = await ensureSession();
  if (!ok) return;
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Pricebook (canonical columns, like config tables — readable by a future
// server-side quote engine, not just the browser)
// ---------------------------------------------------------------------------

type PricebookCategoryRow = Tables["pricebook_categories"]["Row"];
type PricebookItemRow = Tables["pricebook_items"]["Row"];

function pricebookCategoryFromRow(
  row: PricebookCategoryRow
): PricebookCategory {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageName: row.image_name ?? undefined,
    mode: (row.mode as PricebookMode | null) ?? undefined,
    sortOrder: row.sort_order ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function pricebookCategoryToRow(
  c: PricebookCategory
): Tables["pricebook_categories"]["Insert"] {
  return {
    id: c.id,
    name: c.name,
    description: c.description ?? "",
    image_name: c.imageName ?? null,
    mode: c.mode ?? null,
    sort_order: c.sortOrder ?? null,
  };
}

function pricebookItemFromRow(row: PricebookItemRow): PricebookItem {
  return {
    id: row.id,
    name: row.name,
    modelNumber: row.model_number ?? undefined,
    price: row.price,
    cost: row.cost,
    categoryId: row.category_id ?? "",
    itemType: row.item_type as PricebookItemType,
    description: row.description,
    imageName: row.image_name ?? undefined,
    crewSize: (row.crew_size as PricebookCrewSize | null) ?? undefined,
    marginDecimal: row.margin_decimal ?? undefined,
    priceUnit: row.price_unit as PricebookPriceUnit,
    priceNote: row.price_note ?? undefined,
    mode: (row.mode as PricebookMode | null) ?? undefined,
    notes: row.notes ?? undefined,
    photoRequired: row.photo_required,
    addToOnlineBooking: row.add_to_online_booking,
    taxable: row.taxable,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function pricebookItemToRow(
  it: PricebookItem
): Tables["pricebook_items"]["Insert"] {
  return {
    id: it.id,
    name: it.name,
    model_number: it.modelNumber ?? null,
    price: it.price,
    cost: it.cost,
    category_id: it.categoryId,
    item_type: it.itemType,
    description: it.description ?? "",
    image_name: it.imageName ?? null,
    crew_size: it.crewSize ?? null,
    margin_decimal: it.marginDecimal ?? null,
    price_unit: it.priceUnit ?? "flat",
    price_note: it.priceNote ?? null,
    mode: it.mode ?? null,
    notes: it.notes ?? null,
    photo_required: it.photoRequired ?? false,
    add_to_online_booking: it.addToOnlineBooking,
    taxable: it.taxable,
    tenant_id: APP_TENANT_ID,
  };
}

export async function loadPricebookRemote(): Promise<{
  categories: PricebookCategory[];
  items: PricebookItem[];
} | null> {
  if (!supabase) return null;
  const ok = await ensureSession();
  if (!ok) return null;

  const [categories, items] = await Promise.all([
    businessRows("pricebook_categories"),
    // Shared with the webhook pipeline (multi-tenant) — only this business's rows.
    businessRows("pricebook_items"),
  ]);
  if (categories.error || items.error) {
    console.error(
      "[dataStore] Failed to load pricebook:",
      (categories.error || items.error)?.message
    );
    return null;
  }
  return {
    categories: (categories.data ?? []).map(pricebookCategoryFromRow),
    items: (items.data ?? []).map(pricebookItemFromRow),
  };
}

/** Bulk upsert (used for the one-time seed of an empty pricebook). Categories first for the FK. */
export async function seedPricebookRemote(
  categories: PricebookCategory[],
  items: PricebookItem[]
): Promise<void> {
  if (!supabase) return;
  const ok = await ensureSession();
  if (!ok) return;
  if (categories.length > 0) {
    const { error } = await supabase
      .from("pricebook_categories")
      .upsert(categories.map(pricebookCategoryToRow));
    if (error) throw error;
  }
  if (items.length > 0) {
    const { error } = await supabase
      .from("pricebook_items")
      .upsert(items.map(pricebookItemToRow));
    if (error) throw error;
  }
}

export async function upsertPricebookCategoryRemote(
  category: PricebookCategory
): Promise<void> {
  if (!supabase) return;
  const ok = await ensureSession();
  if (!ok) return;
  const { error } = await supabase
    .from("pricebook_categories")
    .upsert(pricebookCategoryToRow(category));
  if (error) throw error;
}

export async function upsertPricebookItemRemote(
  item: PricebookItem
): Promise<void> {
  if (!supabase) return;
  const ok = await ensureSession();
  if (!ok) return;
  const { error } = await supabase
    .from("pricebook_items")
    .upsert(pricebookItemToRow(item));
  if (error) throw error;
}

export async function deletePricebookCategoryRemote(id: string): Promise<void> {
  if (!supabase) return;
  const ok = await ensureSession();
  if (!ok) return;
  // Items cascade-delete via the FK.
  const { error } = await supabase
    .from("pricebook_categories")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function deletePricebookItemRemote(id: string): Promise<void> {
  if (!supabase) return;
  const ok = await ensureSession();
  if (!ok) return;
  const { error } = await supabase
    .from("pricebook_items")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
