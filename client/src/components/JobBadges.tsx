import { Badge } from "@/components/ui/badge";
import type { JobWarning } from "@/lib/jobIntelligence";
import type { JobStatus, PaymentStatus } from "@/types/jobs";

export const jobStatusLabels: Record<JobStatus, string> = {
  open: "Open",
  scheduled: "Scheduled",
  on_my_way: "On My Way",
  in_progress: "In Progress",
  completed: "Completed",
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
  in_progress: "bg-orange-100 text-orange-700 border-orange-200",
  completed: "bg-green-100 text-green-700 border-green-200",
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
