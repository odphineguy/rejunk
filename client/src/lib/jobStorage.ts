import {currentStaffIdentity} from "@/lib/financialCache";
import { actualChargedAmount, actualProfit, actualTotalCost } from "@/lib/jobIntelligence";
import { deleteJobRemote, loadJobsRemote, upsertJobRemote } from "@/lib/dataStore";
import { defaultStopsFor, normalizeJob, prepareJobForWrite, requiredCrewFor } from "@/lib/jobShape";
import { isSupabaseConfigured } from "@/lib/supabase";
import { loadPricingSettings } from "@/utils/pricingStorage";
import type { JobStop } from "@/types/driver";
import type { Job, JobServiceType, MovingKind } from "@/types/jobs";
import type { SavedEstimate } from "@/types/pricing";

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
  if (estimate.serviceType) return estimate.serviceType;
  if (estimate.mode === "moving") return "moving";
  if (estimate.mode === "service") return "assembly_handyman";
  return "junk_removal";
}

/** Best-effort moving sub-kind from a Pricebook moving estimate (crew size drives it). */
function movingKindFromEstimate(estimate: SavedEstimate): MovingKind | undefined {
  if (estimate.mode !== "moving") return undefined;
  const crew = estimate.crewSize ?? estimate.service?.crewSize;
  if (crew && crew >= 4) return "hourly_4";
  if (crew === 3) return "hourly_3";
  return "hourly_2";
}

function stopsFromEstimate(estimate: SavedEstimate, serviceType: JobServiceType, movingKind: MovingKind | undefined): JobStop[] {
  const stops = defaultStopsFor(serviceType, movingKind);
  const pickup = parseEstimateLocation(estimate.jobAddress);
  if (stops[0]) {
    stops[0] = { ...stops[0], address: estimate.jobAddress, city: pickup.city, zip: pickup.zip, contactName: estimate.customerName };
  }
  if (stops[1]) {
    const delivery = parseEstimateLocation(estimate.deliveryAddress);
    stops[1] = { ...stops[1], address: estimate.deliveryAddress, city: delivery.city, zip: delivery.zip, contactName: estimate.customerName };
  }
  return stops;
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
  const serviceType = serviceTypeFromEstimate(estimate);
  const movingKind = movingKindFromEstimate(estimate);
  const stops = stopsFromEstimate(estimate, serviceType, movingKind);
  const requiredCrew = Math.max(
    requiredCrewFor({ serviceType, movingKind }),
    estimate.crewSize ?? estimate.service?.crewSize ?? 0,
  );

  // Junk estimates pick a pricing template (e.g. box-truck-liftgate) for cost
  // math; the ticket wants a fleet unit, so the vehicle is left for dispatch to
  // pick unless the estimate already chose a real unit.
  const fleet = loadPricingSettings().vehicles.find((vehicle) => vehicle.id === estimate.vehicleId && !vehicle.isTemplate);

  return saveJob({
    id: jobId(),
    jobNumber: nextJobNumber(cachedJobs),
    source: "estimate",
    sourceEstimateId: estimate.id,
    createdAt: now,
    updatedAt: now,
    customerName: estimate.customerName || estimate.jobAddress || "Unnamed job",
    jobLabel: estimate.loadLabel,
    serviceType,
    movingKind,
    requiredCrew,
    crew: [],
    stops,
    items: [],
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
    vehicleId: fleet?.id,
    quotedAmount: estimate.finalQuote,
    quote: {
      tier: estimate.loadLabel || serviceType,
      low: estimate.quoteRangeLower ?? estimate.finalQuote,
      high: estimate.quoteRangeUpper ?? estimate.finalQuote,
      source: "estimate",
    },
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
    notes: estimate.notes,
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
