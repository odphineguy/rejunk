/**
 * Ticket shape helpers (JOB_TICKET_REDESIGN_SPEC, phase 1).
 *
 * The job record is a JSON blob in `jobs.data`, so there is no SQL migration
 * for the shape change. Instead every job passes through `normalizeJob()` on
 * the way IN (hydration, cache reads) and `prepareJobForWrite()` on the way
 * OUT (save). Old blobs — flat address, `assignment` names, no serviceType —
 * become the new shape on load and are written back in the new shape on the
 * next save.
 */

import type { JobItem, JobStop } from "@/types/driver";
import type {
  CanonicalJobServiceType,
  DeliveryKind,
  Job,
  JobCrewMember,
  JobDayType,
  JobServiceType,
  MovingKind,
} from "@/types/jobs";
import type { Vehicle } from "@/types/pricing";

// ---------------------------------------------------------------------------
// Service types
// ---------------------------------------------------------------------------

const SERVICE_TYPE_ALIASES: Record<string, CanonicalJobServiceType> = {
  moving: "moving",
  delivery: "delivery",
  assembly_handyman: "assembly_handyman",
  junk_removal: "junk_removal",
  other: "other",
  // Legacy values (read, never written)
  furniture_assembly: "assembly_handyman",
  appliance_moving: "delivery",
  specialty_moving: "moving",
  labor_only: "moving",
  heavy_material_hauling: "junk_removal",
  demolition: "junk_removal",
};

export function normalizeServiceType(value: JobServiceType | string | undefined | null): CanonicalJobServiceType | undefined {
  if (!value) return undefined;
  return SERVICE_TYPE_ALIASES[value];
}

export const serviceTypeLabels: Record<CanonicalJobServiceType, string> = {
  moving: "Moving",
  delivery: "Delivery",
  assembly_handyman: "Assembly & Handyman",
  junk_removal: "Junk removal",
  other: "Other",
};

export const movingKindLabels: Record<MovingKind, string> = {
  small_move: "Small Move (≤8 items)",
  studio_1br: "Studio / 1BR package",
  two_br: "2BR package",
  small_house: "Small House package",
  hourly_2: "Hourly · 2 movers",
  hourly_3: "Hourly · 3 movers",
  hourly_4: "Hourly · 4 movers",
  labor_only: "Labor only (no truck)",
  piano: "Piano",
};

export const deliveryKindLabels: Record<DeliveryKind, string> = {
  cargo_van: "Cargo van delivery",
  van_flat: "Van flat (single large item)",
};

export const movingKinds = Object.keys(movingKindLabels) as MovingKind[];
export const deliveryKinds = Object.keys(deliveryKindLabels) as DeliveryKind[];

export function serviceTypeLabel(job: Pick<Job, "serviceType" | "movingKind" | "deliveryKind" | "jobLabel">): string {
  const type = normalizeServiceType(job.serviceType) ?? "other";
  if (type === "moving" && job.movingKind) return `Moving · ${movingKindLabels[job.movingKind]}`;
  if (type === "delivery" && job.deliveryKind) return deliveryKindLabels[job.deliveryKind];
  if (type === "other" && job.jobLabel) return job.jobLabel;
  return serviceTypeLabels[type];
}

/** Whether a service type carries the junk-removal fields (material, facility, disposal). */
export function isJunkService(serviceType: JobServiceType | undefined) {
  return normalizeServiceType(serviceType) === "junk_removal";
}

/** Whether a service type is a two-address job (pickup → delivery). */
export function isTwoStopService(serviceType: JobServiceType | undefined, movingKind?: MovingKind) {
  const type = normalizeServiceType(serviceType);
  if (type === "delivery") return true;
  if (type === "moving") return movingKind !== "labor_only";
  return false;
}

// ---------------------------------------------------------------------------
// Crew floors (rejunk-operations-rules-v1 §4 + David's rate card)
// ---------------------------------------------------------------------------

const MOVING_CREW: Record<MovingKind, number> = {
  small_move: 2,
  studio_1br: 2,
  two_br: 3,
  small_house: 3,
  hourly_2: 2,
  hourly_3: 3,
  hourly_4: 4,
  labor_only: 2,
  piano: 2,
};

/** Included on-site hours per package (undefined = hourly / not fixed). */
export const MOVING_INCLUDED_HOURS: Partial<Record<MovingKind, number>> = {
  small_move: 2,
  studio_1br: 4,
  two_br: 6,
  small_house: 6,
};

/** Packages / crews that take both halves of the truck's day. */
export function isFullDayMove(movingKind: MovingKind | undefined) {
  return movingKind === "two_br" || movingKind === "small_house" || movingKind === "hourly_4";
}

/** Safety floor for the crew on a ticket. Dispatch can raise it, never lower it. */
export function requiredCrewFor(input: Pick<Job, "serviceType" | "movingKind" | "deliveryKind">): number {
  const type = normalizeServiceType(input.serviceType) ?? "other";
  switch (type) {
    case "moving":
      return input.movingKind ? MOVING_CREW[input.movingKind] : 2;
    case "delivery":
      return 1;
    case "assembly_handyman":
      return 1;
    case "junk_removal":
      return 1;
    default:
      return 1;
  }
}

// ---------------------------------------------------------------------------
// Day type — weekend = Fri/Sat/Sun + first two and last two calendar days of the
// month, in Phoenix time (no DST: UTC−7 all year).
// ---------------------------------------------------------------------------

export function phoenixDayType(iso: string | undefined): JobDayType | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  const phoenix = new Date(date.getTime() - 7 * 60 * 60 * 1000);
  const weekday = phoenix.getUTCDay(); // 0 Sun … 6 Sat
  const day = phoenix.getUTCDate();
  const daysInMonth = new Date(Date.UTC(phoenix.getUTCFullYear(), phoenix.getUTCMonth() + 1, 0)).getUTCDate();
  const weekend = weekday === 0 || weekday === 5 || weekday === 6 || day <= 2 || day >= daysInMonth - 1;
  return weekend ? "weekend" : "weekday";
}

// ---------------------------------------------------------------------------
// Stops
// ---------------------------------------------------------------------------

function stopId(jobId: string, order: number) {
  return `stop-${jobId}-${order}`;
}

/** A single stop synthesized from a job's flat address (old blobs). */
function stopFromAddress(job: Job, order: number, stopType: JobStop["stopType"], name: string): JobStop {
  const now = new Date().toISOString();
  return {
    id: stopId(job.id, order),
    jobId: job.id,
    stopOrder: order,
    stopType,
    name,
    address: job.address,
    city: job.city,
    state: job.state ?? "AZ",
    zip: job.zip,
    contactName: job.customerName,
    contactPhone: job.phone,
    arrivalWindowStart: job.scheduledStart,
    arrivalWindowEnd: job.scheduledEnd,
    status: job.status === "completed" ? "completed" : "pending",
    createdAt: job.createdAt ?? now,
    updatedAt: job.updatedAt ?? now,
  };
}

/** Empty stop cards for a brand-new ticket of a given service type. */
export function defaultStopsFor(serviceType: JobServiceType | undefined, movingKind?: MovingKind): JobStop[] {
  const now = new Date().toISOString();
  const make = (order: number, stopType: JobStop["stopType"], name: string): JobStop => ({
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `stop-${Date.now()}-${order}`,
    jobId: "",
    stopOrder: order,
    stopType,
    name,
    state: "AZ",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
  if (isTwoStopService(serviceType, movingKind)) return [make(1, "pickup", "Pickup"), make(2, "delivery", "Delivery")];
  return [make(1, "service", "Service location")];
}

function renumberStops(jobId: string, stops: JobStop[]): JobStop[] {
  return stops.map((stop, index) => ({
    ...stop,
    id: stop.id || stopId(jobId, index + 1),
    jobId,
    stopOrder: index + 1,
    state: stop.state || "AZ",
    status: stop.status || "pending",
  }));
}

function attachItems(jobId: string, items: JobItem[] | undefined): JobItem[] {
  return (items ?? []).map((item, index) => ({
    ...item,
    id: item.id || `item-${jobId}-${index + 1}`,
    jobId,
    quantity: item.quantity || 1,
    status: item.status || "pending",
  }));
}

// ---------------------------------------------------------------------------
// Crew
// ---------------------------------------------------------------------------

function crewFromLegacyAssignment(job: Job): JobCrewMember[] {
  const ids = job.assignment?.employeeIds ?? [];
  return ids.map((employeeId, index) => ({ employeeId, role: index === 0 ? "lead" : "helper" }));
}

export function crewIds(job: Pick<Job, "crew">): string[] {
  return (job.crew ?? []).map((member) => member.employeeId);
}

export function crewIsShort(job: Pick<Job, "crew" | "requiredCrew">) {
  return (job.crew?.length ?? 0) < (job.requiredCrew ?? 1);
}

/** Build a crew list from the dispatcher's lead / driver / helper picks. */
export function crewFromRoles(input: { crewLeadId?: string; driverId?: string; helperIds?: string[] }): JobCrewMember[] {
  const crew: JobCrewMember[] = [];
  const seen = new Set<string>();
  const push = (employeeId: string | undefined, role: JobCrewMember["role"]) => {
    if (!employeeId || seen.has(employeeId)) return;
    seen.add(employeeId);
    crew.push({ employeeId, role });
  };
  push(input.crewLeadId, "lead");
  push(input.driverId, "driver");
  for (const helperId of input.helperIds ?? []) push(helperId, "helper");
  return crew;
}

// ---------------------------------------------------------------------------
// normalizeJob — read-side adapter
// ---------------------------------------------------------------------------

type RawJob = Partial<Job> & { id: string };

/**
 * Old blob → new shape. Idempotent: running it on an already-normalized job
 * returns an equivalent job. Never throws on missing fields.
 */
export function normalizeJob(raw: RawJob): Job {
  const job = raw as Job;
  const looksLikeJunk = Boolean(job.materialType || job.materialName || job.facilityId || job.facilityName || job.cubicYards);
  const serviceType: JobServiceType =
    normalizeServiceType(job.serviceType) ?? (looksLikeJunk ? "junk_removal" : "other");

  const movingKind = serviceType === "moving" ? job.movingKind : undefined;
  const deliveryKind = serviceType === "delivery" ? job.deliveryKind : undefined;

  let stops = Array.isArray(job.stops) ? job.stops.filter(Boolean) : [];
  if (stops.length === 0 && (job.address || job.city || job.zip)) {
    stops = [stopFromAddress(job, 1, isTwoStopService(serviceType, movingKind) ? "pickup" : "service", job.jobLabel || job.customerName || "Service location")];
  }
  stops = renumberStops(job.id, stops);

  const crew = Array.isArray(job.crew) && job.crew.length > 0 ? job.crew.filter((member) => member?.employeeId) : crewFromLegacyAssignment(job);

  const floor = requiredCrewFor({ serviceType, movingKind, deliveryKind });
  const requiredCrew = Math.max(floor, Number(job.requiredCrew ?? job.crewSize ?? 0) || 0);

  const vehicleId = job.vehicleId ?? job.assignment?.vehicleId;
  const vehicleName = job.vehicleName ?? job.assignment?.vehicleName;

  const first = stops[0];
  const paymentTerms =
    job.paymentTerms ?? (movingKind === "labor_only" || job.thirdPartyPickup ? "full_upfront" : "deposit");

  return {
    ...job,
    serviceType,
    movingKind,
    deliveryKind,
    stops,
    items: attachItems(job.id, job.items),
    crew,
    requiredCrew,
    vehicleId: vehicleId || undefined,
    vehicleName: vehicleName || undefined,
    // Mirror stays consistent with stops[0]
    address: first?.address ?? job.address,
    city: first?.city ?? job.city,
    state: first?.state ?? job.state,
    zip: first?.zip ?? job.zip,
    dayType: job.dayType ?? phoenixDayType(job.scheduledStart),
    paymentTerms,
    quotedAmount: Number(job.quotedAmount ?? 0) || 0,
    paymentStatus: job.paymentStatus ?? "unpaid",
    status: job.status ?? "open",
  };
}

// ---------------------------------------------------------------------------
// prepareJobForWrite — write-side shape
// ---------------------------------------------------------------------------

/**
 * Normalize, derive the mirrors (address from stops[0], vehicleName from the
 * fleet list), and drop the legacy `assignment` / `crewSize` duplicates.
 * `crew[]` + `vehicleId` are the single source of truth; the database
 * (migration 20260912000002_ticket_shape) reads crew ids first and only falls
 * back to `assignment` on old blobs that were never re-saved.
 */
export function prepareJobForWrite(input: RawJob, vehicles?: Vehicle[]): Job {
  const job = normalizeJob(input);
  const vehicle = job.vehicleId && vehicles ? vehicles.find((candidate) => candidate.id === job.vehicleId) : undefined;
  const vehicleName = vehicle?.vehicleName ?? (job.vehicleId ? job.vehicleName : undefined);
  const { assignment: _assignment, crewSize: _crewSize, ...rest } = job;
  void _assignment;
  void _crewSize;
  return {
    ...rest,
    vehicleName,
    // Re-stamp day type from the (possibly new) schedule so a reschedule keeps the quote tier right.
    dayType: phoenixDayType(job.scheduledStart) ?? job.dayType,
  };
}
