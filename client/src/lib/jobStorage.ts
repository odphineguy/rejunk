import {currentStaffIdentity} from "@/lib/financialCache";
import { actualChargedAmount, actualProfit, actualTotalCost } from "@/lib/jobIntelligence";
import { deleteJobRemote, loadJobsRemote, upsertJobRemote } from "@/lib/dataStore";
import { defaultStopsFor, normalizeJob, prepareJobForWrite, requiredCrewFor } from "@/lib/jobShape";
import { isSupabaseConfigured } from "@/lib/supabase";
import { loadPricingSettings } from "@/utils/pricingStorage";
import type { JobItem, JobStop } from "@/types/driver";
import type { DeliveryKind, Job, JobQuote, JobServiceType, MovingDetails, MovingKind } from "@/types/jobs";
import type { SavedEstimate } from "@/types/pricing";
import type { StairFloor } from "@/types/service";

const JOBS_KEY = "junk_estimator_jobs_v1";

const canUseLocalStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

function readJson<T>(key: string, fallback: T): T {
  if (!canUseLocalStorage()) return fallback;

  try {
    window.localStorage.removeItem(key);
    return fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseLocalStorage()) return;
  window.localStorage.removeItem(key);
}

function jobId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `job-${Date.now()}`;
}

function normalizeJobs(jobs: Job[]) {
  // Read-side adapter: every blob (old or new) becomes the current ticket shape.
  return jobs.map((job) => normalizeJob(job)).sort((a, b) => {
    const aTime = a.scheduledStart ?? a.createdAt;
    const bTime = b.scheduledStart ?? b.createdAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
}

function nextJobNumber(jobs: Job[]) {
  const highest = jobs.reduce((max, job) => {
    const parsed = Number(job.jobNumber.replace(/\D/g, ""));
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 1000);
  return `J-${highest + 1}`;
}

function parseEstimateLocation(address: string | undefined) {
  if (!address) return {};
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const lastPart = parts.at(-1) ?? "";
  const zipMatch = lastPart.match(/\b(\d{5})(?:-\d{4})?\b/);
  const cityCandidate = parts.length >= 2 ? parts.at(-2) : undefined;
  return {
    city: cityCandidate,
    zip: zipMatch?.[1],
  };
}

// Synchronous in-memory cache. Pages read this synchronously; Supabase reads
// happen through hydrateJobs() and writes are fire-and-forget below.
// Financial snapshots stay in memory; a new session reloads them from the server.
let cachedJobs = normalizeJobs(readJson<Job[]>(JOBS_KEY, []));

function reportRemoteError(context: string) {
  return (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[jobStorage] Remote ${context} failed; local cache kept in sync.`, message);
  };
}

/**
 * Loads jobs from Supabase into the in-memory cache. Call once at startup BEFORE
 * rendering so pages mount with shared data. Falls back to the localStorage cache
 * when Supabase is unconfigured/unreachable.
 *
 * The database is the source of truth — an empty database means an empty Jobs
 * page. (The old "promote local demo jobs into an empty DB" bootstrap was
 * removed 2026-06-12 when prod/test databases were split: it would have pushed
 * a browser's cached fake jobs into the clean production DB.)
 */
export async function hydrateJobs(): Promise<void> {
 const requestIdentity=currentStaffIdentity();
  if (!isSupabaseConfigured) return;

  const remote = await loadJobsRemote().catch((error) => {
    reportRemoteError("jobs load")(error);
    return null;
  });
 if(requestIdentity!==currentStaffIdentity()) return;
  if (!remote) return; // unreachable — keep the local cache

  cachedJobs = normalizeJobs(remote);
  writeJson(JOBS_KEY, cachedJobs);

  if (typeof window !== "undefined") window.dispatchEvent(new Event("jobs-updated"));
}

export function getJobs(): Job[] {
  return cachedJobs;
}

export function getJobByEstimateId(estimateId: string): Job | null {
  return cachedJobs.find((job) => job.sourceEstimateId === estimateId) ?? null;
}

export function saveJob(job: Job): Job {
  const now = new Date().toISOString();
  const withIds = {
    ...job,
    id: job.id || jobId(),
    jobNumber: job.jobNumber || nextJobNumber(cachedJobs),
    createdAt: job.createdAt || now,
    updatedAt: now,
  };
  // Write-side shape: stops → address mirror, vehicleId → vehicleName mirror,
  // legacy `assignment` / `crewSize` dropped.
  const nextJob = prepareJobForWrite(withIds, loadPricingSettings().vehicles);
  cachedJobs = normalizeJobs([nextJob, ...cachedJobs.filter((item) => item.id !== nextJob.id)]);
  writeJson(JOBS_KEY, cachedJobs);
  void upsertJobRemote(nextJob).catch(reportRemoteError("job save"));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("jobs-updated"));
  return nextJob;
}

export function updateJob(jobIdToUpdate: string, updates: Partial<Job>): Job | null {
  const current = cachedJobs.find((job) => job.id === jobIdToUpdate);
  if (!current) return null;

  const updated = saveJob({
    ...current,
    ...updates,
    actuals: updates.actuals ? { ...current.actuals, ...updates.actuals } : current.actuals,
  });
  return updated;
}

export function deleteJob(jobIdToDelete: string): Job[] {
  cachedJobs = cachedJobs.filter((job) => job.id !== jobIdToDelete);
  writeJson(JOBS_KEY, cachedJobs);
  void deleteJobRemote(jobIdToDelete).catch(reportRemoteError("job delete"));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("jobs-updated"));
  return cachedJobs;
}

export function duplicateJob(jobIdToDuplicate: string): Job | null {
  const current = cachedJobs.find((job) => job.id === jobIdToDuplicate);
  if (!current) return null;

  const now = new Date().toISOString();
  return saveJob({
    ...current,
    id: jobId(),
    jobNumber: nextJobNumber(cachedJobs),
    source: "manual",
    createdAt: now,
    updatedAt: now,
    customerName: `${current.customerName} copy`,
    status: "open",
    paymentStatus: "unpaid",
    scheduledStart: undefined,
    scheduledEnd: undefined,
  });
}

function serviceTypeFromEstimate(estimate: SavedEstimate): JobServiceType {
  // v19 moving quotes built on the van flat / cargo van options are delivery tickets.
  const kind = estimate.moving?.result.selected.kind;
  if (kind === "van_flat" || kind === "cargo_van") return "delivery";
  if (estimate.serviceType) return estimate.serviceType;
  if (estimate.mode === "moving") return "moving";
  if (estimate.mode === "service") return "assembly_handyman";
  return "junk_removal";
}

const PACKAGE_KIND: Record<string, MovingKind> = {
  small_move: "small_move",
  studio_1br: "studio_1br",
  "2br": "two_br",
  small_house: "small_house",
};

function deliveryKindFromEstimate(estimate: SavedEstimate): DeliveryKind | undefined {
  const kind = estimate.moving?.result.selected.kind;
  return kind === "van_flat" || kind === "cargo_van" ? kind : undefined;
}

/** Moving sub-kind: the v19 snapshot's selected option, else the legacy crew-size guess. */
function movingKindFromEstimate(estimate: SavedEstimate): MovingKind | undefined {
  if (estimate.mode !== "moving") return undefined;
  const v19 = estimate.moving?.result;
  if (v19) {
    const selected = v19.selected;
    if (selected.kind === "package" && v19.packageOption) return PACKAGE_KIND[v19.packageOption.key] ?? "hourly_3";
    if (selected.kind === "labor_only") return "labor_only";
    if (selected.kind === "hourly") return selected.crew === 4 ? "hourly_4" : selected.crew === 3 ? "hourly_3" : "hourly_2";
    return undefined; // van flat / cargo van → delivery ticket
  }
  const crew = estimate.crewSize ?? estimate.service?.crewSize;
  if (crew && crew >= 4) return "hourly_4";
  if (crew === 3) return "hourly_3";
  return "hourly_2";
}

const stairFlights: Record<StairFloor, number> = { none: 0, "2nd": 1, "3rd": 2, above_3rd: 3 };

function stopsFromEstimate(estimate: SavedEstimate, serviceType: JobServiceType, movingKind: MovingKind | undefined): JobStop[] {
  const stops = defaultStopsFor(serviceType, movingKind);
  const pickup = parseEstimateLocation(estimate.jobAddress);
  const service = estimate.service;
  const v19 = estimate.moving?.input;
  if (stops[0]) {
    const floor = service?.pickupStairFloor ?? service?.stairFloor;
    stops[0] = {
      ...stops[0],
      address: estimate.jobAddress,
      city: pickup.city,
      zip: pickup.zip,
      contactName: estimate.customerName,
      flights: v19 ? v19.pickupFlights : floor ? stairFlights[floor] : undefined,
    };
  }
  if (stops[1]) {
    const delivery = parseEstimateLocation(estimate.deliveryAddress);
    const floor = service?.deliveryStairFloor;
    stops[1] = {
      ...stops[1],
      address: estimate.deliveryAddress,
      city: delivery.city,
      zip: delivery.zip,
      contactName: estimate.customerName,
      flights: v19 ? v19.deliveryFlights : floor ? stairFlights[floor] : undefined,
    };
  }
  return stops;
}

/** Pricebook lines (assembly items, moved pieces) become the crew's checklist — never prices. */
function itemsFromEstimate(estimate: SavedEstimate, stops: JobStop[]): JobItem[] {
  const lines = estimate.service?.lineItems ?? [];
  const now = new Date().toISOString();
  const pickup = stops[0];
  const delivery = stops.find((stop) => stop.stopType === "delivery");
  // v19 moving quote: the specialty / add-on lines become the crew's checklist (never prices).
  const v19 = estimate.moving?.result;
  if (v19) {
    const checklistKeys = new Set(["piano", "assembly", "tv_mounts", "play_structure", "second_truck"]);
    return v19.addOnLines
      .filter((line) => checklistKeys.has(line.key))
      .map((line, index) => ({
        id: `item-${estimate.id}-${index + 1}`,
        jobId: "",
        stopId: pickup?.id,
        destinationStopId: delivery?.id,
        name: line.label,
        quantity: 1,
        category: line.key === "assembly" ? "Assembly" : "Specialty",
        oversized: line.key === "piano" || line.key === "play_structure",
        fragile: line.key === "piano",
        heavy: line.key === "piano",
        disassemblyRequired: line.key === "play_structure",
        reassemblyRequired: line.key === "assembly" || line.key === "play_structure",
        status: "pending",
        createdAt: now,
        updatedAt: now,
      }));
  }
  return lines
    .filter((line) => line.itemType !== "Fee" && line.priceUnit !== "hourly" && line.priceUnit !== "per_mile" && line.priceUnit !== "per_30min")
    .map((line, index) => ({
      id: `item-${estimate.id}-${index + 1}`,
      jobId: "",
      stopId: pickup?.id,
      destinationStopId: delivery?.id,
      name: line.name,
      quantity: Math.max(1, Math.round(line.quantity || 1)),
      category: line.itemType,
      oversized: false,
      fragile: false,
      heavy: (line.crewSize ?? 1) >= 2,
      disassemblyRequired: false,
      reassemblyRequired: estimate.mode === "service",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    }));
}

function movingDetailsFromEstimate(estimate: SavedEstimate, stops: JobStop[]): MovingDetails | undefined {
  if (estimate.mode !== "moving") return undefined;
  const service = estimate.service;
  const v19 = estimate.moving?.input;
  return {
    homeSize: v19?.homeSize,
    stories: v19?.stories,
    pickupFlights: stops[0]?.flights,
    deliveryFlights: stops[1]?.flights,
    piano: v19 && v19.piano !== "none" ? v19.piano : undefined,
    packing: v19?.packing.enabled,
    distanceMiles: v19?.distanceMiles ?? service?.routeMiles ?? estimate.roundTripMiles,
  };
}

/** Everything a ticket inherits from a saved estimate (JOB_TICKET_REDESIGN_SPEC D6). */
export interface EstimateTicketFields {
  sourceEstimateId: string;
  customerName: string;
  jobLabel?: string;
  serviceType: JobServiceType;
  movingKind?: MovingKind;
  deliveryKind?: DeliveryKind;
  requiredCrew: number;
  stops: JobStop[];
  items: JobItem[];
  /** Fleet unit only — a pricing template never reaches a ticket. */
  vehicleId?: string;
  quotedAmount: number;
  quote: JobQuote;
  moving?: MovingDetails;
  estimatedDurationMinutes?: number;
  notes?: string;
}

export function ticketFieldsFromEstimate(estimate: SavedEstimate): EstimateTicketFields {
  const serviceType = serviceTypeFromEstimate(estimate);
  const movingKind = movingKindFromEstimate(estimate);
  const deliveryKind = deliveryKindFromEstimate(estimate);
  const stops = stopsFromEstimate(estimate, serviceType, movingKind);
  const requiredCrew = Math.max(
    requiredCrewFor({ serviceType, movingKind, deliveryKind }),
    estimate.crewSize ?? estimate.service?.crewSize ?? 0,
  );
  // Junk estimates pick a pricing template (e.g. box-truck-liftgate) for cost
  // math; the ticket wants a fleet unit, so the vehicle is left for dispatch to
  // pick unless the estimate already chose a real unit.
  const fleet = loadPricingSettings().vehicles.find((vehicle) => vehicle.id === estimate.vehicleId && !vehicle.isTemplate);
  const hours = estimate.estimatedHours;
  return {
    sourceEstimateId: estimate.id,
    customerName: estimate.customerName || estimate.jobAddress || "Unnamed job",
    jobLabel: estimate.loadLabel,
    serviceType,
    movingKind,
    deliveryKind,
    requiredCrew,
    stops,
    items: itemsFromEstimate(estimate, stops),
    vehicleId: fleet?.id,
    quotedAmount: estimate.finalQuote,
    quote: {
      tier: estimate.loadLabel || serviceType,
      low: estimate.quoteRangeLower ?? estimate.finalQuote,
      high: estimate.quoteRangeUpper ?? estimate.finalQuote,
      source: "estimate",
    },
    moving: movingDetailsFromEstimate(estimate, stops),
    estimatedDurationMinutes: hours && hours > 0 ? Math.round(hours * 60) : undefined,
    notes: estimate.notes,
  };
}

export function createJobFromEstimate(estimate: SavedEstimate): Job {
  const existingJob = getJobByEstimateId(estimate.id);
  if (existingJob) return existingJob;

  const now = new Date().toISOString();
  const estimatedCost = estimate.baseCost;
  const estimatedProfit = estimate.grossProfitDollars ?? estimate.finalQuote - estimate.baseCost;
  const estimatedMarginDecimal = estimate.grossMarginDecimal ?? (estimate.finalQuote > 0 ? estimatedProfit / estimate.finalQuote : 0);

  // Moving estimates ride the same Pricebook snapshot as service estimates —
  // neither carries material/volume/facility data.
  const isService = estimate.mode === "service" || estimate.mode === "moving";
  const fields = ticketFieldsFromEstimate(estimate);

  return saveJob({
    id: jobId(),
    jobNumber: nextJobNumber(cachedJobs),
    source: "estimate",
    sourceEstimateId: fields.sourceEstimateId,
    createdAt: now,
    updatedAt: now,
    customerName: fields.customerName,
    jobLabel: fields.jobLabel,
    serviceType: fields.serviceType,
    movingKind: fields.movingKind,
    deliveryKind: fields.deliveryKind,
    requiredCrew: fields.requiredCrew,
    crew: [],
    stops: fields.stops,
    items: fields.items,
    moving: fields.moving,
    estimatedDurationMinutes: fields.estimatedDurationMinutes,
    address: estimate.jobAddress,
    status: "open",
    paymentStatus: "unpaid",
    // Service estimates carry no material/volume/facility — skip those fields.
    materialType: isService ? undefined : estimate.materialType,
    materialName: isService ? undefined : estimate.materialName,
    cubicYards: isService ? undefined : estimate.cubicYards,
    estimatedWeightLbs: isService ? undefined : estimate.estimatedWeightLbs,
    estimatedTons: isService ? undefined : estimate.estimatedTons ?? estimate.estimatedWeightLbs / 2000,
    facilityId: isService ? undefined : estimate.facilityId,
    facilityName: isService ? undefined : estimate.facilityName,
    vehicleId: fields.vehicleId,
    quotedAmount: fields.quotedAmount,
    quote: fields.quote,
    estimatedCost,
    estimatedProfit,
    estimatedMarginDecimal,
    warnings: estimate.warnings,
    recommendationSnapshot: estimate.recommendationSnapshot,
    facilityRouteComparisons: estimate.recommendationSnapshot?.facilityComparison ? [estimate.recommendationSnapshot.facilityComparison] : undefined,
    vehicleJobComparisons: estimate.recommendationSnapshot?.vehicleComparison ? [estimate.recommendationSnapshot.vehicleComparison] : undefined,
    actuals: {
      chargedAmount: estimate.finalQuote,
    },
    notes: fields.notes,
  });
}

export function getActualFinancials(job: Job) {
  return {
    charged: actualChargedAmount(job),
    cost: actualTotalCost(job),
    profit: actualProfit(job),
  };
}

window.addEventListener("business-cache-reset", () => { cachedJobs=[]; window.dispatchEvent(new Event("jobs-updated")); });
