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
