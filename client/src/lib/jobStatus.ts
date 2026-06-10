import type { DriverJobStatus, JobStatus } from "@/types/jobs";

export const driverJobStatuses: DriverJobStatus[] = [
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
  "paused",
  "loaded",
  "en_route_to_next_stop",
  "en_route_to_disposal",
  "dumping",
  "completed",
  "delayed",
  "issue",
  "canceled",
];

export const operationalStatusLabels: Record<DriverJobStatus, string> = {
  assigned: "Assigned",
  en_route: "En Route",
  arrived: "Arrived",
  in_progress: "In Progress",
  paused: "Paused",
  loaded: "Loaded",
  en_route_to_next_stop: "To Next Stop",
  en_route_to_disposal: "To Disposal",
  dumping: "Dumping",
  completed: "Completed",
  delayed: "Delayed",
  issue: "Issue",
  canceled: "Canceled",
};

export const legacyToDriverStatus: Record<string, DriverJobStatus> = {
  open: "assigned",
  scheduled: "assigned",
  on_my_way: "en_route",
  in_progress: "in_progress",
  completed: "completed",
  canceled: "canceled",
};

// The driver UI only walks assigned → en_route → in_progress ⇄ paused →
// completed; the intermediate states (loaded, en_route_to_*, dumping) remain
// for dispatch-side tracking, so they still allow pause/complete in case
// dispatch put a job there.
const allowedTransitions: Record<DriverJobStatus, DriverJobStatus[]> = {
  assigned: ["en_route", "delayed", "issue"],
  en_route: ["arrived", "in_progress", "delayed", "issue"],
  arrived: ["in_progress", "delayed", "issue"],
  in_progress: ["paused", "loaded", "completed", "delayed", "issue"],
  paused: ["in_progress", "completed", "issue"],
  loaded: ["en_route_to_next_stop", "en_route_to_disposal", "paused", "completed", "delayed", "issue"],
  en_route_to_next_stop: ["arrived", "paused", "completed", "delayed", "issue"],
  en_route_to_disposal: ["dumping", "paused", "completed", "delayed", "issue"],
  dumping: ["completed", "paused", "delayed", "issue"],
  completed: [],
  delayed: ["en_route", "arrived", "in_progress", "loaded", "issue"],
  issue: ["in_progress"],
  canceled: [],
};

export const dispatchOnlyStatuses: DriverJobStatus[] = ["canceled"];

export function toDriverStatus(status: JobStatus | string | undefined): DriverJobStatus {
  if (status && driverJobStatuses.includes(status as DriverJobStatus)) return status as DriverJobStatus;
  return legacyToDriverStatus[String(status ?? "scheduled")] ?? "assigned";
}

export function canTransitionJobStatus(current: JobStatus | string | undefined, next: DriverJobStatus) {
  const normalized = toDriverStatus(current);
  return normalized === next || allowedTransitions[normalized].includes(next);
}

export function nextDriverStatuses(current: JobStatus | string | undefined) {
  return allowedTransitions[toDriverStatus(current)];
}

export function statusActivityMessage(previousStatus: JobStatus | string | undefined, nextStatus: DriverJobStatus) {
  return `Status changed from ${operationalStatusLabels[toDriverStatus(previousStatus)]} to ${operationalStatusLabels[nextStatus]}.`;
}
