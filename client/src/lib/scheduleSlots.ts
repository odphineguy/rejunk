import { isFullDayMove, normalizeServiceType } from "@/lib/jobShape";
import type { DeliveryKind, Job, JobServiceType, MovingKind } from "@/types/jobs";
import type { Vehicle, VehicleType } from "@/types/pricing";

/**
 * Daily booking slots. For now the business runs four per day:
 * one AM + one PM window for the van, and one AM + one PM window for the box truck.
 * Adjust `DAILY_SLOTS` (or the AM/PM windows) to change capacity later.
 */

export type SlotPeriod = "am" | "pm";
export type SlotVehicleClass = "van" | "box_truck";
export type SlotKey = `${SlotPeriod}_${SlotVehicleClass}`;

export interface DailySlot {
  key: SlotKey;
  period: SlotPeriod;
  vehicleClass: SlotVehicleClass;
  label: string;
  shortLabel: string;
  /** Default arrival window used when booking from an open slot (24h "HH:MM"). */
  windowStart: string;
  windowEnd: string;
}

/** Anything starting before this hour counts as an AM job. */
export const PM_CUTOFF_HOUR = 12;

export const DAILY_SLOTS: DailySlot[] = [
  {
    key: "am_van",
    period: "am",
    vehicleClass: "van",
    label: "AM · Van",
    shortLabel: "AM Van",
    windowStart: "08:00",
    windowEnd: "12:00",
  },
  {
    key: "am_box_truck",
    period: "am",
    vehicleClass: "box_truck",
    label: "AM · Box Truck",
    shortLabel: "AM Box",
    windowStart: "08:00",
    windowEnd: "12:00",
  },
  {
    key: "pm_van",
    period: "pm",
    vehicleClass: "van",
    label: "PM · Van",
    shortLabel: "PM Van",
    windowStart: "13:00",
    windowEnd: "17:00",
  },
  {
    key: "pm_box_truck",
    period: "pm",
    vehicleClass: "box_truck",
    label: "PM · Box Truck",
    shortLabel: "PM Box",
    windowStart: "13:00",
    windowEnd: "17:00",
  },
];

export const SLOTS_PER_DAY = DAILY_SLOTS.length;

export function getSlot(key: string | null | undefined): DailySlot | undefined {
  return DAILY_SLOTS.find(slot => slot.key === key);
}

export function vehicleClassForType(
  type: VehicleType | undefined
): SlotVehicleClass | undefined {
  if (type === "box_truck") return "box_truck";
  if (type === "cargo_van" || type === "passenger_van") return "van";
  return undefined;
}

/** Best-effort read of a job's vehicle class from its assigned vehicle or free-text name. */
export function jobVehicleClass(
  job: Job,
  vehicles: Vehicle[]
): SlotVehicleClass | undefined {
  const vehicleId = job.vehicleId ?? job.assignment?.vehicleId;
  const vehicle = vehicleId
    ? vehicles.find(candidate => candidate.id === vehicleId)
    : undefined;
  const fromType = vehicleClassForType(vehicle?.vehicleType);
  if (fromType) return fromType;

  const name = (
    job.vehicleName ??
    job.assignment?.vehicleName ??
    vehicle?.vehicleName ??
    ""
  ).toLowerCase();
  if (!name) return undefined;
  if (name.includes("box")) return "box_truck";
  if (name.includes("van") || name.startsWith("spr")) return "van";
  return undefined;
}

export function jobPeriod(job: Job): SlotPeriod | undefined {
  if (!job.scheduledStart) return undefined;
  const start = new Date(job.scheduledStart);
  if (Number.isNaN(start.getTime())) return undefined;
  return start.getHours() < PM_CUTOFF_HOUR ? "am" : "pm";
}

/** Which of the four daily slots a job occupies, or undefined if it can't be placed. */
export function jobSlotKey(job: Job, vehicles: Vehicle[]): SlotKey | undefined {
  const period = jobPeriod(job);
  const vehicleClass = jobVehicleClass(job, vehicles);
  if (!period || !vehicleClass) return undefined;
  return `${period}_${vehicleClass}`;
}

/** First active FLEET vehicle matching a slot's class — used to prefill a booking. Never a pricing template. */
export function defaultVehicleForSlot(
  slot: DailySlot,
  vehicles: Vehicle[]
): Vehicle | undefined {
  return vehicles.find(
    vehicle =>
      vehicle.isActive &&
      !vehicle.isTemplate &&
      vehicleClassForType(vehicle.vehicleType) === slot.vehicleClass
  );
}

// ---------------------------------------------------------------------------
// Day board — which jobs sit in which slot on a given day. Shared by the
// Schedule calendar and the New Job slot picker so both always agree.
// ---------------------------------------------------------------------------

export function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Parse a "YYYY-MM-DD" input value as a local-time date (no UTC shift). */
export function fromDateInputValue(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function jobsForDay(jobs: Job[], day: Date) {
  return jobs
    .filter(
      job => job.scheduledStart && sameDay(new Date(job.scheduledStart), day)
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledStart!).getTime() -
        new Date(b.scheduledStart!).getTime()
    );
}

/** A 2BR / Small House / 4-mover move takes both halves of the box truck's day. */
export function jobTakesFullDay(job: Pick<Job, "serviceType" | "movingKind">) {
  return normalizeServiceType(job.serviceType) === "moving" && isFullDayMove(job.movingKind);
}

/** The assembly tech takes at most one job per day (David's assembly calendar). */
export const ASSEMBLY_JOBS_PER_DAY = 1;

export interface DayBoard {
  bySlot: Record<SlotKey, Job[]>;
  unslotted: Job[];
  /** How many of the four slots have at least one job. */
  booked: number;
  /** Assembly & handyman jobs that day, whatever slot they sit in. */
  assemblyJobs: Job[];
}

/**
 * Sort a day's jobs into the four daily slots (plus a bucket for jobs that don't fit one).
 * Full-day moves on the box truck occupy BOTH the AM and PM box-truck slots.
 */
export function buildDayBoard(jobs: Job[], day: Date, vehicles: Vehicle[]): DayBoard {
  const bySlot = Object.fromEntries(
    DAILY_SLOTS.map(slot => [slot.key, [] as Job[]])
  ) as Record<SlotKey, Job[]>;
  const unslotted: Job[] = [];
  const assemblyJobs: Job[] = [];
  for (const job of jobsForDay(jobs, day)) {
    if (job.status === "canceled") continue;
    if (normalizeServiceType(job.serviceType) === "assembly_handyman") assemblyJobs.push(job);
    const key = jobSlotKey(job, vehicles);
    if (!key) {
      unslotted.push(job);
      continue;
    }
    bySlot[key].push(job);
    if (jobTakesFullDay(job) && key.endsWith("box_truck")) {
      const other: SlotKey = key === "am_box_truck" ? "pm_box_truck" : "am_box_truck";
      if (!bySlot[other].includes(job)) bySlot[other].push(job);
    }
  }
  const booked = DAILY_SLOTS.filter(slot => bySlot[slot.key].length > 0).length;
  return { bySlot, unslotted, booked, assemblyJobs };
}

/**
 * Which vehicle class a new ticket books against (rejunk-operations-rules §7 + David's menu).
 * `undefined` = no vehicle needed (labor-only) or dispatcher's choice (other).
 */
export function vehicleClassForService(input: {
  serviceType: JobServiceType | undefined;
  movingKind?: MovingKind;
  deliveryKind?: DeliveryKind;
}): SlotVehicleClass | undefined {
  switch (normalizeServiceType(input.serviceType)) {
    case "moving":
      return input.movingKind === "labor_only" ? undefined : "box_truck";
    case "delivery":
      return "van";
    case "assembly_handyman":
      return "van";
    case "junk_removal":
      return "van";
    default:
      return undefined;
  }
}

/**
 * Start / end for a booking in `slot` on `day`. A full-day job starts at the AM
 * window and ends at the PM window so it blocks both halves.
 */
export function slotWindow(day: Date, slot: DailySlot, fullDay = false) {
  const am = DAILY_SLOTS.find(candidate => candidate.period === "am" && candidate.vehicleClass === slot.vehicleClass) ?? slot;
  const pm = DAILY_SLOTS.find(candidate => candidate.period === "pm" && candidate.vehicleClass === slot.vehicleClass) ?? slot;
  const start = withClockTime(day, fullDay ? am.windowStart : slot.windowStart);
  const end = withClockTime(day, fullDay ? pm.windowEnd : slot.windowEnd);
  return { start, end };
}

export function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function newJobHrefForSlot(day: Date, slot: DailySlot) {
  const params = new URLSearchParams({
    date: toDateInputValue(day),
    slot: slot.key,
  });
  return `/jobs/new?${params.toString()}`;
}

function withClockTime(day: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const next = new Date(day);
  next.setHours(h, m, 0, 0);
  return next;
}

/**
 * Work out the field changes needed to move a job onto `day` in `slot`.
 * - Same half-day (AM→AM / PM→PM): keep the job's clock time, only the date changes.
 * - Different half-day: start at the slot's default window start.
 * - The end time keeps the job's existing duration when it has one, else the slot's window end.
 * - Vehicle class change (van ↔ box truck): assign the first active vehicle of the new class.
 */
export function moveJobToSlot(
  job: Job,
  day: Date,
  slot: DailySlot,
  vehicles: Vehicle[]
): Partial<Job> {
  const currentStart = job.scheduledStart ? new Date(job.scheduledStart) : null;
  const currentEnd = job.scheduledEnd ? new Date(job.scheduledEnd) : null;
  const samePeriod = jobPeriod(job) === slot.period;

  const start =
    samePeriod && currentStart
      ? (() => {
          const next = new Date(day);
          next.setHours(
            currentStart.getHours(),
            currentStart.getMinutes(),
            0,
            0
          );
          return next;
        })()
      : withClockTime(day, slot.windowStart);

  let end: Date;
  if (currentStart && currentEnd && currentEnd > currentStart) {
    end = new Date(
      start.getTime() + (currentEnd.getTime() - currentStart.getTime())
    );
  } else {
    end = withClockTime(day, slot.windowEnd);
  }

  const updates: Partial<Job> = {
    scheduledStart: start.toISOString(),
    scheduledEnd: end.toISOString(),
  };
  if (job.status === "open") updates.status = "scheduled";

  if (jobVehicleClass(job, vehicles) !== slot.vehicleClass) {
    const vehicle = defaultVehicleForSlot(slot, vehicles);
    if (vehicle) {
      // vehicleId is the single source of truth; vehicleName is a display mirror.
      updates.vehicleId = vehicle.id;
      updates.vehicleName = vehicle.vehicleName;
    }
  }
  return updates;
}

/**
 * Move a job to another day, keeping its clock time and duration. Used by the Month view for jobs
 * that have a time but no vehicle yet (so no slot to preserve). Returns null if the job has no time.
 */
export function moveJobToDay(job: Job, day: Date): Partial<Job> | null {
  if (!job.scheduledStart) return null;
  const currentStart = new Date(job.scheduledStart);
  if (Number.isNaN(currentStart.getTime())) return null;
  const start = new Date(day);
  start.setHours(currentStart.getHours(), currentStart.getMinutes(), 0, 0);
  const updates: Partial<Job> = { scheduledStart: start.toISOString() };
  const currentEnd = job.scheduledEnd ? new Date(job.scheduledEnd) : null;
  if (currentEnd && currentEnd > currentStart) {
    updates.scheduledEnd = new Date(
      start.getTime() + (currentEnd.getTime() - currentStart.getTime())
    ).toISOString();
  }
  return updates;
}

/** Jobs already finished or canceled shouldn't be dragged around the board. */
export function isJobMovable(job: Job) {
  return job.status !== "completed" && job.status !== "canceled";
}

export const DRAG_MIME = "application/x-rejunk-job-id";
