import type { DriverJobStatus, JobStatus } from "@/types/jobs";

export const driverJobStatuses: DriverJobStatus[] = [
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
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

const allowedTransitions: Record<DriverJobStatus, DriverJobStatus[]> = {
  assigned: ["en_route", "delayed", "issue"],
  en_route: ["arrived", "delayed", "issue"],
  arrived: ["in_progress", "delayed", "issue"],
  in_progress: ["loaded", "completed", "delayed", "issue"],
  loaded: ["en_route_to_next_stop", "en_route_to_disposal", "completed", "delayed", "issue"],
  en_route_to_next_stop: ["arrived", "delayed", "issue"],
  en_route_to_disposal: ["dumping", "delayed", "issue"],
  dumping: ["completed", "delayed", "issue"],
  completed: [],
  delayed: ["en_route", "arrived", "in_progress", "loaded", "issue"],
  issue: [],
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
