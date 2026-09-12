import type { Job } from "@/types/jobs";
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

/** First active vehicle matching a slot's class — used to prefill a booking. */
export function defaultVehicleForSlot(
  slot: DailySlot,
  vehicles: Vehicle[]
): Vehicle | undefined {
  return vehicles.find(
    vehicle =>
      vehicle.isActive &&
      vehicleClassForType(vehicle.vehicleType) === slot.vehicleClass
  );
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
      updates.vehicleId = vehicle.id;
      updates.vehicleName = vehicle.vehicleName;
      updates.assignment = {
        ...job.assignment,
        vehicleId: vehicle.id,
        vehicleName: vehicle.vehicleName,
      };
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
