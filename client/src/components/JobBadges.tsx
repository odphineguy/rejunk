import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { JobWarning } from "@/lib/jobIntelligence";
import type { JobStatus, PaymentStatus } from "@/types/jobs";

export const jobStatusLabels: Record<JobStatus, string> = {
  open: "Open",
  scheduled: "Scheduled",
  on_my_way: "On My Way",
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

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  deposit_paid: "Deposit Paid",
  paid: "Paid",
  refunded: "Refunded",
};

const jobTone: Record<JobStatus, string> = {
  open: "bg-violet-100 text-violet-700 border-violet-200",
  scheduled: "bg-blue-100 text-blue-700 border-blue-200",
  on_my_way: "bg-sky-100 text-sky-700 border-sky-200",
  assigned: "bg-blue-100 text-blue-700 border-blue-200",
  en_route: "bg-sky-100 text-sky-700 border-sky-200",
  arrived: "bg-cyan-100 text-cyan-700 border-cyan-200",
  in_progress: "bg-orange-100 text-orange-700 border-orange-200",
  paused: "bg-zinc-100 text-zinc-700 border-zinc-200",
  loaded: "bg-amber-100 text-amber-800 border-amber-200",
  en_route_to_next_stop: "bg-sky-100 text-sky-700 border-sky-200",
  en_route_to_disposal: "bg-indigo-100 text-indigo-700 border-indigo-200",
  dumping: "bg-stone-100 text-stone-700 border-stone-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  delayed: "bg-yellow-100 text-yellow-800 border-yellow-200",
  issue: "bg-red-100 text-red-700 border-red-200",
  canceled: "bg-rose-100 text-rose-700 border-rose-200",
};

const paymentTone: Record<PaymentStatus, string> = {
  unpaid: "bg-yellow-100 text-yellow-700 border-yellow-200",
  deposit_paid: "bg-indigo-100 text-indigo-700 border-indigo-200",
  paid: "bg-green-100 text-green-700 border-green-200",
  refunded: "bg-slate-100 text-slate-700 border-slate-200",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge variant="outline" className={jobTone[status]}>
      {jobStatusLabels[status]}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant="outline" className={paymentTone[status]}>
      {paymentStatusLabels[status]}
    </Badge>
  );
}

export function JobWarningBadge({ warning }: { warning: JobWarning }) {
  const tone =
    warning.severity === "critical"
      ? "border-red-200 bg-red-100 text-red-700"
      : warning.severity === "warning"
        ? "border-amber-200 bg-amber-100 text-amber-800"
        : "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <Badge variant="outline" className={tone}>
      {warning.label}
    </Badge>
  );
}

/** Collapses all of a job's warnings into one count chip, colored by the most
 *  severe warning. Full list shown on hover. Renders a muted dash when clean. */
export function JobWarningSummary({ warnings }: { warnings: JobWarning[] }) {
  if (warnings.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const tone = warnings.some((w) => w.severity === "critical")
    ? "border-red-200 bg-red-100 text-red-700"
    : warnings.some((w) => w.severity === "warning")
      ? "border-amber-200 bg-amber-100 text-amber-800"
      : "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <Badge variant="outline" className={cn(tone, "gap-1")} title={warnings.map((w) => w.label).join(", ")}>
      <AlertTriangle className="size-3" />
      {warnings.length}
    </Badge>
  );
}
