import { employeeName, getEmployees } from "@/lib/employeeStorage";
import { getJobs, saveJob, updateJob } from "@/lib/jobStorage";
import { ensureSession, supabase } from "@/lib/supabase";
import type { EmployeeRecord } from "@/types/employees";
import type { Job, JobLeadSource, JobPriority, JobServiceType } from "@/types/jobs";
import type {
  AddedScopeReviewStatus,
  JobActivity,
  JobAssignmentRecord,
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
  messages: JobMessage[];
  issues: JobIssue[];
};

export type DispatchAssignmentInput = {
  crewLeadId?: string;
  driverId?: string;
  helperIds: string[];
  vehicleId?: string;
  vehicleName?: string;
  crewSequence?: number;
};

export type DispatchJobInput = {
  customerName: string;
  phone?: string;
  email?: string;
  leadSource?: JobLeadSource;
  serviceType?: JobServiceType;
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

function employeeById(employeeId?: string) {
  if (!employeeId) return undefined;
  return getEmployees().find((employee) => employee.id === employeeId);
}

function employeeDisplay(employeeId?: string) {
  const employee = employeeById(employeeId);
  return employee ? employeeName(employee) : undefined;
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
    assignments: (current.assignments ?? []).filter((assignment) => assignment.jobId === job.id),
    stops: current.stops.filter((stop) => stop.jobId === job.id).sort((a, b) => a.stopOrder - b.stopOrder),
    items: current.items.filter((item) => item.jobId === job.id),
    activity: current.activity.filter((entry) => entry.jobId === job.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    photos: current.photos.filter((photo) => photo.jobId === job.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    messages: current.messages.filter((message) => message.jobId === job.id).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    issues: current.issues.filter((issue) => issue.jobId === job.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  };
}

function assignmentRecords(jobId: string, assignment: DispatchAssignmentInput): JobAssignmentRecord[] {
  const now = new Date().toISOString();
  const records: JobAssignmentRecord[] = [];
  if (assignment.crewLeadId) records.push({ id: id("assignment"), jobId, employeeId: assignment.crewLeadId, role: "crew_lead", createdAt: now });
  if (assignment.driverId && assignment.driverId !== assignment.crewLeadId) records.push({ id: id("assignment"), jobId, employeeId: assignment.driverId, role: "driver", createdAt: now });
  for (const helperId of assignment.helperIds.filter(Boolean)) {
    if (helperId !== assignment.crewLeadId && helperId !== assignment.driverId) records.push({ id: id("assignment"), jobId, employeeId: helperId, role: "helper", createdAt: now });
  }
  return records;
}

function legacyAssignment(assignment: DispatchAssignmentInput) {
  const helperNames = assignment.helperIds.map(employeeDisplay).filter(Boolean) as string[];
  return {
    crewLead: employeeDisplay(assignment.crewLeadId) || employeeDisplay(assignment.driverId),
    crewMembers: helperNames,
    vehicleId: assignment.vehicleId,
    vehicleName: assignment.vehicleName,
  };
}

export async function createDispatchJob(input: DispatchJobInput, mode: "draft" | "assign" = "assign") {
  const now = new Date().toISOString();
  const firstStop = input.stops[0];
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
    address: firstStop?.address,
    city: firstStop?.city,
    state: firstStop?.state,
    zip: firstStop?.zip,
    scheduledStart: input.scheduledStart,
    scheduledEnd: input.scheduledEnd,
    status: mode === "draft" ? "open" : "assigned",
    paymentStatus: "unpaid",
    leadSource: input.leadSource,
    serviceType: input.serviceType,
    priority: input.priority ?? "normal",
    estimatedDurationMinutes: input.estimatedDurationMinutes,
    crewSequence: input.assignment.crewSequence,
    vehicleId: input.assignment.vehicleId,
    vehicleName: input.assignment.vehicleName,
    quotedAmount: input.quotedAmount ?? 0,
    estimatedCost: input.estimatedCost,
    estimatedProfit: input.estimatedProfit,
    estimatedMarginDecimal: input.estimatedMarginDecimal,
    actuals: { chargedAmount: input.quotedAmount ?? 0 },
    notes: input.notes,
    internalNotes: input.internalNotes,
    assignment: legacyAssignment(input.assignment),
  });

  await saveDispatchOperationalPlan(job.id, {
    stops: input.stops,
    items: input.items,
    assignment: input.assignment,
    activityMessage: mode === "draft" ? "Dispatch saved job draft." : "Dispatch created and assigned job.",
  });

  return job;
}

export async function saveDispatchOperationalPlan(
  jobId: string,
  input: {
    stops?: JobStop[];
    items?: JobItem[];
    assignment?: DispatchAssignmentInput;
    activityMessage?: string;
    instructionUpdate?: string;
  },
) {
  const now = new Date().toISOString();
  const next = cache();

  if (input.stops) {
    next.stops = [
      ...input.stops.map((stop, index) => ({ ...stop, id: stop.id || id("stop"), jobId, stopOrder: index + 1, updatedAt: now, createdAt: stop.createdAt || now })),
      ...next.stops.filter((stop) => stop.jobId !== jobId),
    ];
  }

  if (input.items) {
    next.items = [
      ...input.items.map((item) => ({ ...item, id: item.id || id("item"), jobId, updatedAt: now, createdAt: item.createdAt || now })),
      ...next.items.filter((item) => item.jobId !== jobId),
    ];
  }

  if (input.assignment) {
    const records = assignmentRecords(jobId, input.assignment);
    next.assignments = [...records, ...(next.assignments ?? []).filter((assignment) => assignment.jobId !== jobId)];
    const currentJob = getJobs().find((job) => job.id === jobId);
    if (currentJob) {
      updateJob(jobId, {
        status: currentJob.status === "open" ? "assigned" : currentJob.status,
        vehicleId: input.assignment.vehicleId,
        vehicleName: input.assignment.vehicleName,
        crewSequence: input.assignment.crewSequence,
        assignment: legacyAssignment(input.assignment),
      });
    }
  }

  const eventType: JobActivity["eventType"] = input.instructionUpdate ? "scope_change" : input.assignment ? "assignment_changed" : "scope_change";
  next.activity = [
    {
      id: id("activity"),
      jobId,
      eventType,
      message: input.instructionUpdate || input.activityMessage || "Dispatch updated operational plan.",
      createdAt: now,
    },
    ...next.activity,
  ];
  writeCache(next);

  if (supabase && await ensureSession()) {
    if (input.stops?.length) {
      await (supabase as any).from("job_stops").upsert(input.stops.map((stop, index) => ({
        id: stop.id,
        job_id: jobId,
        stop_order: index + 1,
        stop_type: stop.stopType,
        name: stop.name,
        address: stop.address ?? null,
        city: stop.city ?? null,
        state: stop.state ?? null,
        zip: stop.zip ?? null,
        contact_name: stop.contactName ?? null,
        contact_phone: stop.contactPhone ?? null,
        arrival_window_start: stop.arrivalWindowStart ?? null,
        arrival_window_end: stop.arrivalWindowEnd ?? null,
        instructions: stop.instructions ?? null,
        status: stop.status,
      })));
    }
    if (input.items?.length) {
      await (supabase as any).from("job_items").upsert(input.items.map((item) => ({
        id: item.id,
        job_id: jobId,
        stop_id: item.stopId ?? null,
        name: item.name,
        quantity: item.quantity,
        category: item.category ?? null,
        estimated_weight_lbs: item.estimatedWeightLbs ?? null,
        oversized: item.oversized,
        fragile: item.fragile,
        heavy: item.heavy,
        disassembly_required: item.disassemblyRequired,
        reassembly_required: item.reassemblyRequired,
        destination_stop_id: item.destinationStopId ?? null,
        instructions: item.instructions ?? null,
        status: item.status,
      })));
    }
  }
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

export const serviceTypeOptions: Array<{ value: JobServiceType; label: string }> = [
  { value: "junk_removal", label: "Junk removal" },
  { value: "moving", label: "Moving" },
  { value: "labor_only", label: "Labor only" },
  { value: "furniture_assembly", label: "Furniture assembly" },
  { value: "appliance_moving", label: "Appliance moving" },
  { value: "heavy_material_hauling", label: "Heavy material hauling" },
  { value: "delivery", label: "Delivery" },
  { value: "demolition", label: "Demolition" },
  { value: "specialty_moving", label: "Specialty moving" },
  { value: "other", label: "Other" },
];

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
