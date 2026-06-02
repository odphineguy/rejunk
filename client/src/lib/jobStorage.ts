import { defaultDemoJobs } from "@/data/defaultJobs";
import { actualChargedAmount, actualProfit, actualTotalCost } from "@/lib/jobIntelligence";
import { deleteJobRemote, loadJobsRemote, upsertJobRemote } from "@/lib/dataStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { Job } from "@/types/jobs";
import type { SavedEstimate } from "@/types/pricing";

const JOBS_KEY = "junk_estimator_jobs_v1";
const JOBS_SEEDED_KEY = "junk_estimator_jobs_seeded_v1";

const canUseLocalStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

function readJson<T>(key: string, fallback: T): T {
  if (!canUseLocalStorage()) return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function jobId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `job-${Date.now()}`;
}

function normalizeJobs(jobs: Job[]) {
  return [...jobs].sort((a, b) => {
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
// localStorage stays as an offline warm cache / fallback.
let cachedJobs = normalizeJobs(readJson<Job[]>(JOBS_KEY, defaultDemoJobs));

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
 * First run against an empty database promotes the local demo jobs to shared
 * data (one-time, guarded by a localStorage flag) so the Jobs page isn't empty.
 */
export async function hydrateJobs(): Promise<void> {
  if (!isSupabaseConfigured) return;

  const remote = await loadJobsRemote().catch((error) => {
    reportRemoteError("jobs load")(error);
    return null;
  });
  if (!remote) return; // unreachable — keep the local cache

  const alreadySeeded = canUseLocalStorage() && window.localStorage.getItem(JOBS_SEEDED_KEY) === "1";

  if (remote.length === 0 && !alreadySeeded) {
    if (canUseLocalStorage()) window.localStorage.setItem(JOBS_SEEDED_KEY, "1");
    cachedJobs.forEach((job) => void upsertJobRemote(job).catch(reportRemoteError("jobs seed")));
  } else {
    cachedJobs = normalizeJobs(remote);
    writeJson(JOBS_KEY, cachedJobs);
  }

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
  const nextJob = {
    ...job,
    id: job.id || jobId(),
    jobNumber: job.jobNumber || nextJobNumber(cachedJobs),
    createdAt: job.createdAt || now,
    updatedAt: now,
  };
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
    assignment: updates.assignment ? { ...current.assignment, ...updates.assignment } : current.assignment,
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

export function createJobFromEstimate(estimate: SavedEstimate): Job {
  const existingJob = getJobByEstimateId(estimate.id);
  if (existingJob) return existingJob;

  const now = new Date().toISOString();
  const estimatedCost = estimate.baseCost;
  const estimatedProfit = estimate.grossProfitDollars ?? estimate.finalQuote - estimate.baseCost;
  const estimatedMarginDecimal = estimate.grossMarginDecimal ?? (estimate.finalQuote > 0 ? estimatedProfit / estimate.finalQuote : 0);
  const location = parseEstimateLocation(estimate.jobAddress);

  return saveJob({
    id: jobId(),
    jobNumber: nextJobNumber(cachedJobs),
    source: "estimate",
    sourceEstimateId: estimate.id,
    createdAt: now,
    updatedAt: now,
    customerName: estimate.customerName || estimate.jobAddress || "Unnamed job",
    jobLabel: estimate.loadLabel,
    address: estimate.jobAddress,
    city: location.city,
    zip: location.zip,
    status: "open",
    paymentStatus: "unpaid",
    materialType: estimate.materialType,
    materialName: estimate.materialName,
    cubicYards: estimate.cubicYards,
    estimatedWeightLbs: estimate.estimatedWeightLbs,
    estimatedTons: estimate.estimatedTons ?? estimate.estimatedWeightLbs / 2000,
    facilityId: estimate.facilityId,
    facilityName: estimate.facilityName,
    vehicleId: estimate.vehicleId,
    vehicleName: estimate.vehicleName,
    quotedAmount: estimate.finalQuote,
    estimatedCost,
    estimatedProfit,
    estimatedMarginDecimal,
    warnings: estimate.warnings,
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
