import { addClientNote, findClientByContact } from "@/lib/clientStorage";
import { employeeName, getEmployees } from "@/lib/employeeStorage";
import { crewFromRoles, requiredCrewFor, serviceTypeLabels } from "@/lib/jobShape";
import { getJobs, saveJob, updateJob } from "@/lib/jobStorage";
import { ensureSession, supabase } from "@/lib/supabase";
import type { EmployeeRecord } from "@/types/employees";
import type { CanonicalJobServiceType, DeliveryKind, Job, JobCrewMember, JobLeadSource, JobPriority, JobServiceType, MovingKind } from "@/types/jobs";
import type {
  AddedScopeReviewStatus,
  JobActivity,
  JobAssignmentRecord,
  JobDisposalEvent,
  JobIssue,
  JobIssueResolutionType,
  JobIssueStatus,
  JobItem,
  JobMessage,
  JobPhoto,
  JobPhotoType,
  JobPhotoVisibility,
  JobStop,
} from "@/types/driver";

const OPERATIONAL_CACHE_KEY = "rejunk_driver_operational_cache_v1";

type OperationalCache = {
  assignments?: JobAssignmentRecord[];
  stops: JobStop[];
  items: JobItem[];
  activity: JobActivity[];
  photos: JobPhoto[];
  disposalEvents?: JobDisposalEvent[];
  messages: JobMessage[];
  issues: JobIssue[];
};

export type DispatchAssignmentInput = {
  crewLeadId?: string;
  driverId?: string;
  helperIds: string[];
  /** Fleet unit id (spr-01 … box-01). */
  vehicleId?: string;
  /** @deprecated display only — resolved from `vehicleId` on save. */
  vehicleName?: string;
  crewSequence?: number;
};

export type DispatchJobInput = {
  customerName: string;
  phone?: string;
  email?: string;
  leadSource?: JobLeadSource;
  serviceType: JobServiceType;
  movingKind?: MovingKind;
  deliveryKind?: DeliveryKind;
  /** Dispatcher may raise the safety floor, never lower it. */
  requiredCrew?: number;
  clientId?: string;
  jobLabel?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  notes?: string;
  internalNotes?: string;
  priority?: JobPriority;
  estimatedDurationMinutes?: number;
  quotedAmount?: number;
  estimatedCost?: number;
  estimatedProfit?: number;
  estimatedMarginDecimal?: number;
  stops: JobStop[];
  items: JobItem[];
  assignment: DispatchAssignmentInput;
};

const emptyOperationalCache = (): OperationalCache => ({
  assignments: [],
  stops: [],
  items: [],
  activity: [],
  photos: [],
  disposalEvents: [],
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

function cache() {
  return readJson(OPERATIONAL_CACHE_KEY, emptyOperationalCache());
}

function writeCache(next: OperationalCache) {
  writeJson(OPERATIONAL_CACHE_KEY, next);
  window.dispatchEvent(new Event("driver-data-updated"));
}

function appendActivity(jobId: string, message: string, eventType: JobActivity["eventType"], metadata?: Record<string, unknown>) {
  const now = new Date().toISOString();
  const entry: JobActivity = { id: id("activity"), jobId, eventType, message, metadata, createdAt: now };
  const next = cache();
  next.activity = [entry, ...next.activity.filter((item) => item.id !== entry.id)];
  writeCache(next);
  return entry;
}

export function getDispatchOperationalCache() {
  return cache();
}

export function getDispatchJobView(job: Job) {
  const current = cache();
  return {
    assignments: [] as JobAssignmentRecord[],
    stops: [...(job.stops ?? [])].sort((a, b) => a.stopOrder - b.stopOrder),
    items: job.items ?? [],
    activity: current.activity.filter((entry) => entry.jobId === job.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    photos: current.photos.filter((photo) => photo.jobId === job.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    disposalEvents: [...(job.disposalEvents ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber),
    messages: current.messages.filter((message) => message.jobId === job.id).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    issues: current.issues.filter((issue) => issue.jobId === job.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  };
}

export function crewFromAssignmentInput(assignment: DispatchAssignmentInput): JobCrewMember[] {
  return crewFromRoles(assignment);
}

/**
 * Create a ticket from the New Job form. Stops, items, crew and vehicle live ON
 * the job record (`jobs.data`) — nothing is written to the dead `job_stops` /
 * `job_items` tables or the per-browser operational blob any more.
 */
export async function createDispatchJob(input: DispatchJobInput, mode: "draft" | "assign" = "assign") {
  const now = new Date().toISOString();
  const crew = crewFromAssignmentInput(input.assignment);
  const requiredCrew = Math.max(requiredCrewFor(input), input.requiredCrew ?? 0);
  const job = saveJob({
    id: "",
    jobNumber: "",
    source: "manual",
    createdAt: now,
    updatedAt: now,
    customerName: input.customerName || "Unnamed customer",
    jobLabel: input.jobLabel,
    phone: input.phone,
    email: input.email,
    scheduledStart: input.scheduledStart,
    scheduledEnd: input.scheduledEnd,
    status: mode === "draft" ? "open" : "assigned",
    paymentStatus: "unpaid",
    leadSource: input.leadSource,
    clientId: input.clientId,
    serviceType: input.serviceType,
    movingKind: input.movingKind,
    deliveryKind: input.deliveryKind,
    requiredCrew,
    crew,
    stops: input.stops,
    items: input.items,
    priority: input.priority ?? "normal",
    estimatedDurationMinutes: input.estimatedDurationMinutes,
    crewSequence: input.assignment.crewSequence,
    vehicleId: input.assignment.vehicleId,
    quotedAmount: input.quotedAmount ?? 0,
    estimatedCost: input.estimatedCost,
    estimatedProfit: input.estimatedProfit,
    estimatedMarginDecimal: input.estimatedMarginDecimal,
    actuals: { chargedAmount: input.quotedAmount ?? 0 },
    notes: input.notes,
    internalNotes: input.internalNotes,
  });

  if (job.facilityId || job.facilityName) {
    updateJob(job.id, { disposalEvents: plannedDisposalEvents(job) });
  }
  appendActivity(job.id, mode === "draft" ? "Dispatch saved job draft." : "Dispatch created and assigned job.", mode === "draft" ? "scope_change" : "assignment_changed");

  return job;
}

/**
 * Update the operational plan of an existing ticket. Stops / items / crew /
 * vehicle / disposal trips are written onto the job record; only the activity
 * log still lives in the local operational cache.
 */
export async function saveDispatchOperationalPlan(
  jobId: string,
  input: {
    stops?: JobStop[];
    items?: JobItem[];
    disposalEvents?: JobDisposalEvent[];
    assignment?: DispatchAssignmentInput;
    activityMessage?: string;
    instructionUpdate?: string;
  },
) {
  const now = new Date().toISOString();
  const currentJob = getJobs().find((job) => job.id === jobId);
  if (currentJob) {
    const updates: Partial<Job> = {};
    if (input.stops) {
      updates.stops = input.stops.map((stop, index) => ({ ...stop, id: stop.id || id("stop"), jobId, stopOrder: index + 1, updatedAt: now, createdAt: stop.createdAt || now }));
    }
    if (input.items) {
      updates.items = input.items.map((item) => ({ ...item, id: item.id || id("item"), jobId, updatedAt: now, createdAt: item.createdAt || now }));
    }
    if (input.disposalEvents) {
      updates.disposalEvents = input.disposalEvents.map((event, index) => ({ ...event, id: event.id || id("disposal"), jobId, sequenceNumber: index + 1, updatedAt: now, createdAt: event.createdAt || now }));
    }
    if (input.assignment) {
      updates.crew = crewFromAssignmentInput(input.assignment);
      updates.vehicleId = input.assignment.vehicleId;
      updates.crewSequence = input.assignment.crewSequence;
      if (currentJob.status === "open" && updates.crew.length > 0) updates.status = "assigned";
    }
    if (Object.keys(updates).length > 0) updateJob(jobId, updates);
  }

  const eventType: JobActivity["eventType"] = input.instructionUpdate ? "scope_change" : input.assignment ? "assignment_changed" : "scope_change";
  appendActivity(jobId, input.instructionUpdate || input.activityMessage || "Dispatch updated operational plan.", eventType);
}

function plannedDisposalEvents(job: Job): JobDisposalEvent[] {
  if (!job.facilityId && !job.facilityName) return [];
  const now = new Date().toISOString();
  return [
    {
      id: id("disposal"),
      jobId: job.id,
      facilityId: job.facilityId,
      facilityName: job.facilityName,
      materialType: job.materialName ?? job.materialType,
      sequenceNumber: 1,
      status: "planned",
      planned: true,
      notes: "Planned disposal trip. Dispatch may update facility, cost, weights, and receipts.",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export async function sendDispatchJobMessage(jobId: string, message: string) {
  const trimmed = message.trim();
  if (!trimmed) return;
  const now = new Date().toISOString();
  const row: JobMessage = { id: id("message"), jobId, recipientScope: "assigned_crew", message: trimmed, createdAt: now };
  const next = cache();
  next.messages = [...next.messages, row];
  next.activity = [{ id: id("activity"), jobId, eventType: "message", message: `Dispatch: ${trimmed}`, createdAt: now }, ...next.activity];
  writeCache(next);

  if (supabase && await ensureSession()) {
    await (supabase as any).from("job_messages").insert({ id: row.id, job_id: jobId, recipient_scope: row.recipientScope, message: row.message });
  }
}

export async function updatePhotoVisibility(photo: JobPhoto, visibility: JobPhotoVisibility) {
  const next = cache();
  next.photos = next.photos.map((item) => item.id === photo.id ? { ...item, visibility } : item);
  next.activity = [{ id: id("activity"), jobId: photo.jobId, eventType: "photo_uploaded", message: `Dispatch marked photo ${visibility.replaceAll("_", " ")}.`, createdAt: new Date().toISOString() }, ...next.activity];
  writeCache(next);

  if (supabase && await ensureSession()) {
    await (supabase as any).from("job_photos").update({ visibility }).eq("id", photo.id);
  }
}

export async function saveServiceStopCoordinates(input: {
  jobId: string;
  stopId?: string;
  latitude?: number;
  longitude?: number;
  clear?: boolean;
}) {
  const job = getJobs().find((item) => item.id === input.jobId);
  if (!job) return false;
  const stop =
    input.stopId
      ? job.stops.find((item) => item.id === input.stopId)
      : job.stops.filter((item) => item.stopType !== "disposal").sort((a, b) => a.stopOrder - b.stopOrder)[0];
  if (!stop) return false;

  const updated: JobStop = {
    ...stop,
    latitude: input.clear ? undefined : input.latitude,
    longitude: input.clear ? undefined : input.longitude,
    updatedAt: new Date().toISOString(),
  };
  updateJob(job.id, { stops: job.stops.map((item) => (item.id === stop.id ? updated : item)) });
  appendActivity(
    input.jobId,
    input.clear ? "Dispatch cleared service location coordinates." : "Dispatch geocoded service location.",
    "scope_change",
    { stopId: stop.id, latitude: updated.latitude, longitude: updated.longitude },
  );
  return true;
}

export async function dispatchResolveIssue(
  issue: JobIssue,
  input: {
    issueStatus: JobIssueStatus;
    resolutionType?: JobIssueResolutionType;
    dispatchInstructions?: string;
    dispatchResponse?: string;
    releaseDriver?: boolean;
    addedScopeStatus?: AddedScopeReviewStatus;
    customerContactResult?: string;
  },
) {
  const now = new Date().toISOString();
  const updated: JobIssue = {
    ...issue,
    issueStatus: input.issueStatus,
    resolutionType: input.resolutionType,
    dispatchInstructions: input.dispatchInstructions,
    dispatchResponse: input.dispatchResponse,
    addedScopeStatus: input.addedScopeStatus ?? issue.addedScopeStatus,
    customerContactAttemptedAt: input.customerContactResult ? now : issue.customerContactAttemptedAt,
    customerContactResult: input.customerContactResult ?? issue.customerContactResult,
    driverReleasedAt: input.releaseDriver ? now : issue.driverReleasedAt,
    driverReleasedBy: input.releaseDriver ? "dispatch" : issue.driverReleasedBy,
    resolvedAt: input.issueStatus === "resolved" ? now : issue.resolvedAt,
    resolvedBy: input.issueStatus === "resolved" ? "dispatch" : issue.resolvedBy,
    updatedAt: now,
  };
  const next = cache();
  next.issues = [updated, ...next.issues.filter((item) => item.id !== issue.id)];
  next.activity = [
    {
      id: id("activity"),
      jobId: issue.jobId,
      eventType: input.releaseDriver ? "driver_release" : "dispatch_resolution",
      message: input.dispatchInstructions || input.dispatchResponse || `Dispatch set issue to ${input.issueStatus.replaceAll("_", " ")}.`,
      metadata: { issueId: issue.id, resolutionType: input.resolutionType, addedScopeStatus: input.addedScopeStatus },
      createdAt: now,
    },
    ...next.activity,
  ];
  writeCache(next);

  if (input.resolutionType === "cancel_job") {
    updateJob(issue.jobId, { status: "canceled" });
  }

  // Mirror the resolution into the matched client's Contact Log so field issues
  // land on the CRM record — "you never showed up" billing disputes can then be
  // settled from the log. Jobs carry no clientId, so we match by phone/name; no
  // match → skip silently rather than note the wrong account.
  if (input.issueStatus === "resolved") {
    const job = getJobs().find((item) => item.id === issue.jobId);
    if (job) {
      const client = findClientByContact({ phone: job.phone, name: job.customerName });
      if (client) {
        const label = issue.issueType.replaceAll("_", " ");
        const detail =
          input.dispatchInstructions?.trim() ||
          input.dispatchResponse?.trim() ||
          (input.resolutionType ? input.resolutionType.replaceAll("_", " ") : "");
        const note = `Job ${job.jobNumber} — field issue resolved (${label})${detail ? `: ${detail}` : ""}.`;
        addClientNote(client.id, note, "dispatch");
      }
    }
  }

  if (supabase && await ensureSession()) {
    await (supabase as any).rpc("dispatch_resolve_job_issue", {
      target_issue_id: issue.id,
      next_issue_status: input.issueStatus,
      resolution: input.resolutionType ?? null,
      instructions: input.dispatchInstructions ?? null,
      response: input.dispatchResponse ?? null,
      release_driver: input.releaseDriver ?? false,
    });
  }
}

export function employeeOptions() {
  return getEmployees().filter((employee) => employee.status === "active");
}

export function employeeLabel(employee?: EmployeeRecord) {
  return employee ? `${employeeName(employee)} · ${employee.role}` : "";
}

export const serviceTypeOptions: Array<{ value: CanonicalJobServiceType; label: string }> = (
  ["moving", "delivery", "assembly_handyman", "junk_removal", "other"] as CanonicalJobServiceType[]
).map((value) => ({ value, label: serviceTypeLabels[value] }));

export const leadSourceOptions: Array<{ value: JobLeadSource; label: string }> = [
  { value: "thumbtack", label: "Thumbtack" },
  { value: "phone", label: "Phone" },
  { value: "repeat_customer", label: "Repeat customer" },
  { value: "referral", label: "Referral" },
  { value: "website", label: "Website" },
  { value: "housecall_pro", label: "Housecall Pro" },
  { value: "other", label: "Other" },
];

export const photoTypeOptions: JobPhotoType[] = ["before", "progress", "after", "damage", "issue", "receipt", "equipment", "other"];
