import { getEmployees, employeeName } from "@/lib/employeeStorage";
import { getJobs, updateJob } from "@/lib/jobStorage";
import { canTransitionJobStatus, statusActivityMessage, toDriverStatus } from "@/lib/jobStatus";
import { ensureSession, supabase } from "@/lib/supabase";
import type { EmployeeRecord } from "@/types/employees";
import type { DriverJobStatus, Job } from "@/types/jobs";
import type {
  DriverJob,
  DriverProfile,
  DriverTodayData,
  JobActivity,
  JobIssue,
  JobIssueSeverity,
  JobIssueType,
  JobItem,
  JobItemStatus,
  JobMessage,
  JobPhoto,
  JobPhotoType,
  JobPhotoVisibility,
  JobStop,
  JobStopStatus,
} from "@/types/driver";

const DRIVER_CACHE_KEY = "rejunk_driver_today_cache_v1";
const DRIVER_DRAFTS_KEY = "rejunk_driver_unsent_text_v1";
const OPERATIONAL_CACHE_KEY = "rejunk_driver_operational_cache_v1";

type OperationalCache = {
  stops: JobStop[];
  items: JobItem[];
  activity: JobActivity[];
  photos: JobPhoto[];
  messages: JobMessage[];
  issues: JobIssue[];
};

const emptyOperationalCache = (): OperationalCache => ({
  stops: [],
  items: [],
  activity: [],
  photos: [],
  messages: [],
  issues: [],
});

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

function id(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fullAddress(job: Pick<Job, "address" | "city" | "state" | "zip">) {
  return [job.address, job.city, job.state, job.zip].filter(Boolean).join(", ");
}

function defaultDriverFromEmployees(): DriverProfile | null {
  const employees = getEmployees();
  const driver = employees.find((employee) => employee.status === "active" && (employee.role === "Driver" || employee.fieldTech)) ?? employees[0];
  return driver ? driverProfileFromEmployee(driver) : null;
}

function driverProfileFromEmployee(employee: EmployeeRecord): DriverProfile {
  return {
    id: employee.id,
    employeeId: employee.id,
    displayName: employeeName(employee),
    email: employee.email,
    phone: employee.phone,
    role: employee.role === "Owner" || employee.role === "Manager" ? "admin" : employee.role === "Dispatcher" ? "dispatcher" : "driver",
    status: employee.status,
  };
}

function isJobAssignedToDriver(job: Job, driver: DriverProfile | null) {
  if (!driver) return false;
  const names = [job.assignment?.crewLead, ...(job.assignment?.crewMembers ?? [])].filter(Boolean).map((name) => String(name).toLowerCase());
  if (names.length === 0) return true;
  const driverName = driver.displayName.toLowerCase();
  return names.some((name) => driverName.includes(name) || name.includes(driverName) || name.includes(driver.id.toLowerCase()));
}

function defaultStopForJob(job: Job): JobStop {
  const now = new Date().toISOString();
  return {
    id: `stop-${job.id}-service`,
    jobId: job.id,
    stopOrder: 1,
    stopType: job.facilityId ? "pickup" : "service",
    name: job.jobLabel || job.customerName,
    address: job.address,
    city: job.city,
    state: job.state ?? "AZ",
    zip: job.zip,
    contactName: job.customerName,
    contactPhone: job.phone,
    arrivalWindowStart: job.scheduledStart,
    arrivalWindowEnd: job.scheduledEnd,
    instructions: job.notes,
    status: toDriverStatus(job.status) === "completed" ? "completed" : "pending",
    createdAt: job.createdAt ?? now,
    updatedAt: job.updatedAt ?? now,
  };
}

function defaultDisposalStopForJob(job: Job): JobStop | null {
  if (!job.facilityName) return null;
  const now = new Date().toISOString();
  return {
    id: `stop-${job.id}-disposal`,
    jobId: job.id,
    stopOrder: 2,
    stopType: "disposal",
    name: job.facilityName,
    status: "pending",
    instructions: "Use dispatch-approved disposal facility. Upload receipt photo if available.",
    createdAt: job.createdAt ?? now,
    updatedAt: job.updatedAt ?? now,
  };
}

function defaultItemForJob(job: Job, stopId: string): JobItem {
  const now = new Date().toISOString();
  return {
    id: `item-${job.id}-primary`,
    jobId: job.id,
    stopId,
    name: job.materialName || job.jobLabel || "Assigned items",
    quantity: 1,
    category: job.materialType,
    estimatedWeightLbs: job.estimatedWeightLbs,
    oversized: (job.cubicYards ?? 0) >= 8,
    fragile: false,
    heavy: (job.estimatedWeightLbs ?? 0) >= 700,
    disassemblyRequired: false,
    reassemblyRequired: false,
    destinationStopId: job.facilityName ? `stop-${job.id}-disposal` : undefined,
    instructions: job.notes,
    status: toDriverStatus(job.status) === "completed" ? "completed" : "pending",
    createdAt: job.createdAt ?? now,
    updatedAt: job.updatedAt ?? now,
  };
}

function ensureOperationalRows(job: Job, cache: OperationalCache) {
  const existingStops = cache.stops.filter((stop) => stop.jobId === job.id);
  const stops = existingStops.length > 0 ? existingStops : [defaultStopForJob(job), defaultDisposalStopForJob(job)].filter(Boolean) as JobStop[];
  const existingItems = cache.items.filter((item) => item.jobId === job.id);
  const items = existingItems.length > 0 ? existingItems : [defaultItemForJob(job, stops[0].id)];
  return {
    stops: stops.sort((a, b) => a.stopOrder - b.stopOrder),
    items,
    activity: cache.activity.filter((activity) => activity.jobId === job.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    photos: cache.photos.filter((photo) => photo.jobId === job.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    messages: cache.messages.filter((message) => message.jobId === job.id).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    issues: cache.issues.filter((issue) => issue.jobId === job.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  };
}

export function toDriverJob(job: Job, cache = readJson(OPERATIONAL_CACHE_KEY, emptyOperationalCache()), driver?: DriverProfile | null): DriverJob {
  const rows = ensureOperationalRows(job, cache);
  const crewNames = [job.assignment?.crewLead, ...(job.assignment?.crewMembers ?? [])].filter(Boolean) as string[];
  const assignedCrew: DriverProfile[] = crewNames.map((name, index) => ({
    id: `crew-${job.id}-${index}`,
    displayName: name,
    role: "driver" as const,
    status: "active" as const,
  }));
  if (driver && assignedCrew.length === 0) assignedCrew.push(driver);

  return {
    id: job.id,
    jobNumber: job.jobNumber,
    customerName: job.customerName,
    jobLabel: job.jobLabel,
    phone: job.phone,
    address: job.address,
    city: job.city,
    state: job.state,
    zip: job.zip,
    scheduledStart: job.scheduledStart,
    scheduledEnd: job.scheduledEnd,
    status: job.status,
    vehicleId: job.vehicleId ?? job.assignment?.vehicleId,
    vehicleName: job.vehicleName ?? job.assignment?.vehicleName,
    assignment: job.assignment,
    notes: job.notes,
    internalNotes: job.internalNotes,
    materialName: job.materialName,
    materialType: job.materialType,
    updatedAt: job.updatedAt,
    serviceType: job.materialName || job.jobLabel || "Junk removal",
    instructionsChanged: rows.activity.some((entry) => entry.eventType === "scope_change"),
    assignedCrew,
    ...rows,
  };
}

function todayBuckets(jobs: DriverJob[], driver: DriverProfile | null): DriverTodayData {
  const sorted = [...jobs].sort((a, b) => new Date(a.scheduledStart ?? a.updatedAt).getTime() - new Date(b.scheduledStart ?? b.updatedAt).getTime());
  const activeStatuses = new Set(["en_route", "arrived", "in_progress", "loaded", "en_route_to_next_stop", "en_route_to_disposal", "dumping", "delayed", "issue"]);
  const activeJob = sorted.find((job) => activeStatuses.has(toDriverStatus(job.status))) ?? null;
  return {
    driver,
    activeJob,
    upcomingJobs: sorted.filter((job) => job.id !== activeJob?.id && !["completed", "canceled"].includes(toDriverStatus(job.status))),
    completedJobs: sorted.filter((job) => toDriverStatus(job.status) === "completed"),
    lastSyncedAt: new Date().toISOString(),
    fromCache: false,
  };
}

export async function loadDriverToday(): Promise<DriverTodayData> {
  const driver = defaultDriverFromEmployees();
  const cached = readJson<DriverTodayData | null>(DRIVER_CACHE_KEY, null);
  const cache = readJson(OPERATIONAL_CACHE_KEY, emptyOperationalCache());

  if (supabase && await ensureSession()) {
    const { data, error } = await (supabase as any).rpc("get_driver_today");
    if (!error && Array.isArray(data)) {
      const remoteJobs = data.map((row: { job: Job; stops?: JobStop[]; items?: JobItem[]; activity?: JobActivity[]; photos?: JobPhoto[]; messages?: JobMessage[]; issues?: JobIssue[] }) => {
        const mergedCache: OperationalCache = {
          stops: row.stops ?? [],
          items: row.items ?? [],
          activity: row.activity ?? [],
          photos: row.photos ?? [],
          messages: row.messages ?? [],
          issues: row.issues ?? [],
        };
        return toDriverJob(row.job, mergedCache, driver);
      });
      const result = todayBuckets(remoteJobs, driver);
      writeJson(DRIVER_CACHE_KEY, result);
      return result;
    }
  }

  const localJobs = getJobs().filter((job) => isJobAssignedToDriver(job, driver)).map((job) => toDriverJob(job, cache, driver));
  const result = todayBuckets(localJobs, driver);
  if (cached && localJobs.length === 0) return { ...cached, fromCache: true };
  writeJson(DRIVER_CACHE_KEY, result);
  return result;
}

export async function getDriverJob(jobId: string): Promise<DriverJob | null> {
  const today = await loadDriverToday();
  const fromToday = [today.activeJob, ...today.upcomingJobs, ...today.completedJobs].filter(Boolean).find((job) => job?.id === jobId);
  if (fromToday) return fromToday;
  const driver = today.driver ?? defaultDriverFromEmployees();
  const job = getJobs().find((item) => item.id === jobId);
  if (!job || !isJobAssignedToDriver(job, driver)) return null;
  return toDriverJob(job, readJson(OPERATIONAL_CACHE_KEY, emptyOperationalCache()), driver);
}

function upsertOperational<K extends keyof OperationalCache>(key: K, row: OperationalCache[K][number]) {
  const cache = readJson(OPERATIONAL_CACHE_KEY, emptyOperationalCache());
  const list = cache[key] as Array<{ id: string }>;
  const next = { ...cache, [key]: [row, ...list.filter((item) => item.id !== row.id)] };
  writeJson(OPERATIONAL_CACHE_KEY, next);
  window.dispatchEvent(new Event("driver-data-updated"));
  return next;
}

export async function updateDriverJobStatus(jobId: string, nextStatus: DriverJobStatus, message?: string) {
  const job = getJobs().find((item) => item.id === jobId);
  if (!job) throw new Error("Job not found.");
  if (!canTransitionJobStatus(job.status, nextStatus)) throw new Error("That status transition is not available.");

  const previousStatus = toDriverStatus(job.status);
  updateJob(jobId, { status: nextStatus });
  const activity: JobActivity = {
    id: id("activity"),
    jobId,
    eventType: "status_change",
    previousStatus,
    newStatus: nextStatus,
    message: message || statusActivityMessage(previousStatus, nextStatus),
    createdAt: new Date().toISOString(),
  };
  upsertOperational("activity", activity);

  if (supabase && await ensureSession()) {
    await (supabase as any).rpc("driver_update_job_status", {
      target_job_id: jobId,
      next_status: nextStatus,
      note: activity.message,
    });
  }
}

export async function updateStopStatus(stop: JobStop, status: JobStopStatus) {
  const now = new Date().toISOString();
  const updated = { ...stop, status, arrivedAt: status === "arrived" ? now : stop.arrivedAt, completedAt: status === "completed" ? now : stop.completedAt, updatedAt: now };
  upsertOperational("stops", updated);
  upsertOperational("activity", {
    id: id("activity"),
    jobId: stop.jobId,
    eventType: status === "completed" ? "stop_completed" : "status_change",
    message: `${stop.name} marked ${status.replaceAll("_", " ")}.`,
    createdAt: now,
  });

  if (supabase && await ensureSession()) {
    await (supabase as any).from("job_stops").upsert({
      id: updated.id,
      job_id: updated.jobId,
      stop_order: updated.stopOrder,
      stop_type: updated.stopType,
      name: updated.name,
      address: updated.address ?? null,
      city: updated.city ?? null,
      state: updated.state ?? null,
      zip: updated.zip ?? null,
      contact_name: updated.contactName ?? null,
      contact_phone: updated.contactPhone ?? null,
      arrival_window_start: updated.arrivalWindowStart ?? null,
      arrival_window_end: updated.arrivalWindowEnd ?? null,
      instructions: updated.instructions ?? null,
      status: updated.status,
      arrived_at: updated.arrivedAt ?? null,
      completed_at: updated.completedAt ?? null,
    });
  }
}

export async function updateItemStatus(item: JobItem, status: JobItemStatus) {
  const now = new Date().toISOString();
  const updated = { ...item, status, updatedAt: now };
  upsertOperational("items", updated);
  upsertOperational("activity", {
    id: id("activity"),
    jobId: item.jobId,
    eventType: "item_updated",
    message: `${item.name} marked ${status.replaceAll("_", " ")}.`,
    createdAt: now,
  });

  if (supabase && await ensureSession()) {
    await (supabase as any).from("job_items").upsert({
      id: updated.id,
      job_id: updated.jobId,
      stop_id: updated.stopId ?? null,
      name: updated.name,
      quantity: updated.quantity,
      category: updated.category ?? null,
      estimated_weight_lbs: updated.estimatedWeightLbs ?? null,
      oversized: updated.oversized,
      fragile: updated.fragile,
      heavy: updated.heavy,
      disassembly_required: updated.disassemblyRequired,
      reassembly_required: updated.reassemblyRequired,
      destination_stop_id: updated.destinationStopId ?? null,
      instructions: updated.instructions ?? null,
      status: updated.status,
    });
  }
}

export async function sendJobMessage(jobId: string, message: string) {
  const trimmed = message.trim();
  if (!trimmed) return;
  const now = new Date().toISOString();
  const row: JobMessage = {
    id: id("message"),
    jobId,
    recipientScope: "dispatch",
    message: trimmed,
    createdAt: now,
  };
  upsertOperational("messages", row);
  upsertOperational("activity", {
    id: id("activity"),
    jobId,
    eventType: "message",
    message: trimmed,
    createdAt: now,
  });

  if (supabase && await ensureSession()) {
    await (supabase as any).from("job_messages").insert({
      id: row.id,
      job_id: jobId,
      recipient_scope: row.recipientScope,
      message: row.message,
    });
  } else {
    const drafts = readJson<Record<string, string[]>>(DRIVER_DRAFTS_KEY, {});
    writeJson(DRIVER_DRAFTS_KEY, { ...drafts, [jobId]: [...(drafts[jobId] ?? []), trimmed] });
  }
}

export async function reportJobIssue(input: {
  jobId: string;
  stopId?: string;
  issueType: JobIssueType;
  severity: JobIssueSeverity;
  description: string;
  requiresDispatchResponse: boolean;
}) {
  const now = new Date().toISOString();
  const row: JobIssue = {
    id: id("issue"),
    jobId: input.jobId,
    stopId: input.stopId,
    issueType: input.issueType,
    severity: input.severity,
    description: input.description.trim(),
    requiresDispatchResponse: input.requiresDispatchResponse,
    addedScopeStatus: ["additional_items", "item_not_listed", "heavy_item", "oversized_item"].includes(input.issueType) ? "awaiting_review" : undefined,
    createdAt: now,
    updatedAt: now,
  };
  upsertOperational("issues", row);
  upsertOperational("activity", {
    id: id("activity"),
    jobId: input.jobId,
    eventType: "issue_reported",
    message: `Issue reported: ${input.issueType.replaceAll("_", " ")}.`,
    metadata: { severity: input.severity, requiresDispatchResponse: input.requiresDispatchResponse },
    createdAt: now,
  });

  if (supabase && await ensureSession()) {
    await (supabase as any).from("job_issues").insert({
      id: row.id,
      job_id: row.jobId,
      stop_id: row.stopId ?? null,
      issue_type: row.issueType,
      description: row.description,
      severity: row.severity,
      requires_dispatch_response: row.requiresDispatchResponse,
      added_scope_status: row.addedScopeStatus ?? null,
    });
  }
}

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1_500_000 || typeof document === "undefined") return file;
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
}

export async function uploadJobPhoto(input: {
  jobId: string;
  stopId?: string;
  file: File;
  photoType: JobPhotoType;
  visibility: JobPhotoVisibility;
  caption?: string;
}) {
  const now = new Date().toISOString();
  const compressed = await compressImage(input.file);
  const storagePath = `${input.jobId}/${Date.now()}-${compressed.name.replace(/[^a-z0-9._-]/gi, "-")}`;
  let publicUrl: string | undefined;

  if (supabase && await ensureSession()) {
    const uploaded = await supabase.storage.from("job-photos").upload(storagePath, compressed, { upsert: false });
    if (uploaded.error) throw uploaded.error;
    publicUrl = supabase.storage.from("job-photos").getPublicUrl(storagePath).data.publicUrl;
  } else {
    publicUrl = URL.createObjectURL(compressed);
  }

  const row: JobPhoto = {
    id: id("photo"),
    jobId: input.jobId,
    stopId: input.stopId,
    storagePath,
    publicUrl,
    photoType: input.photoType,
    visibility: input.visibility,
    caption: input.caption,
    createdAt: now,
  };
  upsertOperational("photos", row);
  upsertOperational("activity", {
    id: id("activity"),
    jobId: input.jobId,
    eventType: "photo_uploaded",
    message: `${input.photoType.replaceAll("_", " ")} photo uploaded.`,
    createdAt: now,
  });

  if (supabase && await ensureSession()) {
    await (supabase as any).from("job_photos").insert({
      id: row.id,
      job_id: row.jobId,
      stop_id: row.stopId ?? null,
      storage_path: row.storagePath,
      photo_type: row.photoType,
      visibility: row.visibility,
      caption: row.caption ?? null,
    });
  }
  return row;
}

export function formatDriverAddress(job: DriverJob) {
  return fullAddress(job) || "Address not provided";
}
