import type { DriverJob, JobDisposalEvent, JobIssue, JobItem, JobStop } from "@/types/driver";

export function customerStops(stops: JobStop[]) {
  return stops.filter((stop) => stop.stopType !== "disposal").sort((a, b) => a.stopOrder - b.stopOrder);
}

export function disposalEvents(events: JobDisposalEvent[]) {
  return [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}

export function openIssues(issues: JobIssue[]) {
  return issues.filter((issue) => issue.issueStatus !== "resolved" && !issue.resolvedAt);
}

export function completedItems(items: JobItem[]) {
  return items.filter((item) => item.status !== "pending");
}

export function jobOperationalMetrics(job: Pick<DriverJob, "stops" | "disposalEvents" | "issues" | "items">) {
  const serviceStops = customerStops(job.stops);
  const disposals = disposalEvents(job.disposalEvents);
  return {
    customerStopCount: serviceStops.length,
    disposalEventCount: disposals.length,
    completedCustomerStops: serviceStops.filter((stop) => stop.status === "completed").length,
    completedDisposalEvents: disposals.filter((event) => event.status === "completed").length,
    itemsTouched: completedItems(job.items).length,
    openIssueCount: openIssues(job.issues).length,
  };
}

export function jobCount<T>(jobs: T[]) {
  return jobs.length;
}
