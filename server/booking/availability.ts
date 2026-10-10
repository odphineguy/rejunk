/**
 * Open arrival windows for /book. Pure — the handler loads the rows.
 *
 * Capacity follows the day-slot board (lib/scheduleSlots.ts): one AM and one
 * PM booking per calendar (box truck crew, van), and 2BR / Small House moves
 * take the whole truck day. While HCP is still running, its appointments count
 * too, or the page would double-book. A job and its own HCP appointment land
 * in the same half day, so counting both is harmless.
 */
import {
  BOOKING_WINDOWS,
  type BookingService,
  type BookingVehicleClass,
} from "../../shared/bookingCatalog";

export interface Occupancy {
  /** Phoenix calendar date, YYYY-MM-DD. */
  date: string;
  vehicleClass: BookingVehicleClass;
  am: boolean;
  pm: boolean;
  /** For the post-insert race check. */
  ref?: string;
  createdAt?: string;
}

const PHOENIX_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Phoenix date + minutes after midnight for a timestamp. */
export function phoenixParts(iso: string): { date: string; minutes: number } | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const local = new Date(ms - PHOENIX_OFFSET_MS);
  return {
    date: local.toISOString().slice(0, 10),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/** AM if it starts before noon; PM if it starts at noon or later, or runs past 1pm. */
function halves(start: { minutes: number }, end: { date: string; minutes: number } | null, startDate: string) {
  const am = start.minutes < 12 * 60;
  const runsPastOne = end ? end.date > startDate || end.minutes > 13 * 60 : false;
  return { am, pm: !am || runsPastOne };
}

export interface HcpRow {
  id?: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  resource: string | null;
  status: string | null;
  canceled: boolean | null;
  created_at?: string;
}

export function occupancyFromHcp(row: HcpRow): Occupancy | null {
  if (row.canceled || (row.status ?? "").toLowerCase().includes("cancel")) return null;
  if (!row.scheduled_start) return null;
  const resource = (row.resource ?? "").toLowerCase();
  const vehicleClass: BookingVehicleClass | null =
    resource === "truck" ? "box_truck" : resource === "van" ? "van" : null;
  if (!vehicleClass) return null;
  const start = phoenixParts(row.scheduled_start);
  if (!start) return null;
  const end = row.scheduled_end ? phoenixParts(row.scheduled_end) : null;
  return { date: start.date, vehicleClass, ...halves(start, end, start.date), ref: `hcp:${row.id ?? ""}`, createdAt: row.created_at };
}

export interface JobRow {
  id: string;
  status: string | null;
  scheduled_start: string | null;
  created_at?: string;
  data: Record<string, unknown> | null;
}

const FULL_DAY_KINDS = new Set(["two_br", "small_house", "hourly_4"]);

/** Which calendar a Rejunk ticket uses: its vehicle first, then its service. */
function jobVehicleClass(data: Record<string, unknown>, vehicleTypes: Map<string, string>): BookingVehicleClass | null {
  const vehicleId = typeof data.vehicleId === "string" ? data.vehicleId : "";
  const type = vehicleTypes.get(vehicleId) ?? "";
  if (type === "box_truck") return "box_truck";
  if (type === "cargo_van" || type === "passenger_van") return "van";
  const name = String(data.vehicleName ?? "").toLowerCase();
  if (name.includes("box")) return "box_truck";
  if (name.includes("van") || name.startsWith("spr")) return "van";
  const serviceType = String(data.serviceType ?? "");
  if (serviceType === "moving" || serviceType === "labor_only" || serviceType === "specialty_moving") return "box_truck";
  if (serviceType === "delivery" || serviceType === "junk_removal" || serviceType === "assembly_handyman" || serviceType === "furniture_assembly") return "van";
  return null;
}

export function occupancyFromJob(row: JobRow, vehicleTypes: Map<string, string>): Occupancy | null {
  const status = (row.status ?? "").toLowerCase();
  if (status === "canceled" || status === "cancelled") return null;
  const data = row.data ?? {};
  const startIso = row.scheduled_start ?? (typeof data.scheduledStart === "string" ? data.scheduledStart : null);
  if (!startIso) return null;
  const start = phoenixParts(startIso);
  if (!start) return null;
  const vehicleClass = jobVehicleClass(data, vehicleTypes);
  if (!vehicleClass) return null;
  const endIso = typeof data.scheduledEnd === "string" ? data.scheduledEnd : null;
  const end = endIso ? phoenixParts(endIso) : null;
  const fullDay =
    vehicleClass === "box_truck" &&
    String(data.serviceType ?? "") === "moving" &&
    FULL_DAY_KINDS.has(String(data.movingKind ?? ""));
  const h = fullDay ? { am: true, pm: true } : halves(start, end, start.date);
  return { date: start.date, vehicleClass, ...h, ref: `job:${row.id}`, createdAt: row.created_at };
}

export interface DayWindows {
  date: string;
  windows: { key: "am" | "pm"; label: string; open: boolean }[];
}

export interface AvailabilityRules {
  /** Today's Phoenix date. */
  today: string;
  nowMs: number;
  allowSameDay: boolean;
  /** Minimum notice before an arrival window starts. */
  leadHours: number;
}

/** Which windows a service can take on `date`, given everything already booked. */
export function windowsForDay(
  service: Pick<BookingService, "vehicleClass" | "fullDay">,
  date: string,
  occupied: Occupancy[],
  rules: AvailabilityRules,
  ignoreRef?: string
): DayWindows {
  const taken = { am: false, pm: false };
  for (const o of occupied) {
    if (o.date !== date || o.vehicleClass !== service.vehicleClass || (ignoreRef && o.ref === ignoreRef)) continue;
    if (o.am) taken.am = true;
    if (o.pm) taken.pm = true;
  }
  const windows = BOOKING_WINDOWS.filter(w => !service.fullDay || w.key === "am").map(w => {
    let open = service.fullDay ? !taken.am && !taken.pm : !taken[w.key];
    if (date < rules.today || (date === rules.today && !rules.allowSameDay)) open = false;
    const startsAt = Date.parse(`${date}T${w.start}:00-07:00`);
    if (startsAt - rules.nowMs < rules.leadHours * 3600_000) open = false;
    return { key: w.key, label: w.label, open };
  });
  return { date, windows };
}

/** Phoenix YYYY-MM-DD for `ms`, plus `addDays`. */
export function phoenixDate(ms: number, addDays = 0): string {
  return new Date(ms - PHOENIX_OFFSET_MS + addDays * 86400_000).toISOString().slice(0, 10);
}

/** Settings "Booking Lead Time" → hours. */
export function leadHoursFrom(value: unknown): number {
  switch (value) {
    case "1 hour":
      return 1;
    case "4 hours":
      return 4;
    case "Next day":
      return 0;
    default:
      return 2;
  }
}
