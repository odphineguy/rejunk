import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  AlertTriangle,
  Briefcase,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Map,
  Search,
  Trash2,
  Truck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  JobStatusBadge,
  JobWarningSummary,
  PaymentStatusBadge,
  jobStatusLabels,
} from "@/components/JobBadges";
import { facilityCode, materialCode } from "@/lib/jobCodes";
import { OperationsShell } from "@/components/OperationsShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getJobWarningsWithFacilityCheck } from "@/lib/jobIntelligence";
import { getDispatchOperationalCache } from "@/lib/dispatchOperations";
import { deleteJob, getActualFinancials, getJobs } from "@/lib/jobStorage";
import { loadPricingSettings } from "@/utils/pricingStorage";
import type { Job, JobStatus } from "@/types/jobs";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const statusTabs: Array<"all" | JobStatus> = [
  "all",
  "open",
  "scheduled",
  "on_my_way",
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
  "loaded",
  "delayed",
  "issue",
  "completed",
  "canceled",
];

function money(value: number | undefined) {
  return currency.format(Number.isFinite(value) ? Number(value) : 0);
}

function formatDate(value?: string) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Briefcase;
}) {
  return (
    <Card className="border-border/80">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Jobs() {
  const [, navigate] = useLocation();
  const [jobs, setJobs] = useState<Job[]>(() => getJobs());
  const [settings, setSettings] = useState(() => loadPricingSettings());
  const [query, setQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState<"all" | JobStatus>("all");

  useEffect(() => {
    const refresh = () => setJobs(getJobs());
    window.addEventListener("jobs-updated", refresh);
    window.addEventListener("driver-data-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("jobs-updated", refresh);
      window.removeEventListener("driver-data-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    const refreshSettings = () => setSettings(loadPricingSettings());
    window.addEventListener("pricing-settings-updated", refreshSettings);
    return () =>
      window.removeEventListener("pricing-settings-updated", refreshSettings);
  }, []);

  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return jobs.filter(job => {
      const matchesStatus =
        activeStatus === "all" || job.status === activeStatus;
      const searchable = [
        job.jobNumber,
        job.customerName,
        job.address,
        job.city,
        job.zip,
        job.materialName,
        job.facilityName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        matchesStatus &&
        (!normalizedQuery || searchable.includes(normalizedQuery))
      );
    });
  }, [activeStatus, jobs, query]);

  const counts = useMemo(
    () => ({
      open: jobs.filter(job => job.status === "open").length,
      scheduled: jobs.filter(job => job.status === "scheduled").length,
      on_my_way: jobs.filter(job => job.status === "on_my_way").length,
      in_progress: jobs.filter(job => job.status === "in_progress").length,
      completed: jobs.filter(job => job.status === "completed").length,
      canceled: jobs.filter(job => job.status === "canceled").length,
      unpaid: jobs.filter(job => job.paymentStatus === "unpaid").length,
    }),
    [jobs]
  );

  const exceptionQueue = useMemo(() => {
    const cache = getDispatchOperationalCache();
    return cache.issues
      .filter(
        issue =>
          issue.requiresDispatchResponse && issue.issueStatus !== "resolved"
      )
      .map(issue => ({ issue, job: jobs.find(job => job.id === issue.jobId) }))
      .filter(row => row.job)
      .sort(
        (a, b) =>
          new Date(b.issue.createdAt).getTime() -
          new Date(a.issue.createdAt).getTime()
      );
  }, [jobs]);

  const removeJob = (event: React.MouseEvent, jobId: string) => {
    event.stopPropagation();
    setJobs(deleteJob(jobId));
    toast.success("Job deleted");
  };

  return (
    <OperationsShell
      title="Jobs"
      icon={Truck}
      actions={
        <Button asChild variant="outline">
          <Link href="/dispatch">
            <Map className="size-4" />
            Open Dispatch Center
          </Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <StatCard label="Open" value={counts.open} icon={Briefcase} />
          <StatCard
            label="Scheduled"
            value={counts.scheduled}
            icon={CalendarCheck}
          />
          <StatCard label="On My Way" value={counts.on_my_way} icon={Truck} />
          <StatCard
            label="In Progress"
            value={counts.in_progress}
            icon={Clock}
          />
          <StatCard
            label="Completed"
            value={counts.completed}
            icon={CheckCircle2}
          />
          <StatCard label="Canceled" value={counts.canceled} icon={XCircle} />
          <StatCard label="Unpaid" value={counts.unpaid} icon={Briefcase} />
        </div>

        <Card>
          <CardContent className="space-y-5 p-4 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search jobs..."
                  className="pl-9"
                />
              </div>
              <Badge variant="secondary">{filteredJobs.length} jobs</Badge>
            </div>

            <Tabs
              value={activeStatus}
              onValueChange={value =>
                setActiveStatus(value as "all" | JobStatus)
              }
            >
              <TabsList className="h-auto flex-wrap justify-start">
                {statusTabs.map(status => (
                  <TabsTrigger key={status} value={status}>
                    {status === "all" ? "All" : jobStatusLabels[status]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox aria-label="Select all jobs" />
                  </TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Facility</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Warn</TableHead>
                  <TableHead className="text-right">Quote</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map(job => {
                  const warnings = getJobWarningsWithFacilityCheck(
                    job,
                    settings
                  );
                  return (
                    <TableRow
                      key={job.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/jobs/${job.id}`)}
                    >
                      <TableCell onClick={event => event.stopPropagation()}>
                        <Checkbox aria-label={`Select ${job.jobNumber}`} />
                      </TableCell>
                      <TableCell className="font-medium">
                        {job.jobNumber}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{job.customerName}</div>
                        {job.jobLabel && (
                          <div className="text-xs text-muted-foreground">
                            {job.jobLabel}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(job.scheduledStart)}
                      </TableCell>
                      <TableCell
                        className="max-w-[150px] truncate"
                        title={
                          [job.address, job.city, job.zip]
                            .filter(Boolean)
                            .join(", ") || "Not provided"
                        }
                      >
                        {[job.address, job.city, job.zip]
                          .filter(Boolean)
                          .join(", ") || "Not provided"}
                      </TableCell>
                      <TableCell>
                        <span
                          className="font-medium"
                          title={
                            job.materialName ||
                            job.materialType?.replaceAll("_", " ") ||
                            "Not set"
                          }
                        >
                          {materialCode(job.materialType, job.materialName)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className="font-medium"
                          title={job.facilityName || "Not selected"}
                        >
                          {facilityCode(job.facilityId, job.facilityName)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <JobStatusBadge status={job.status} />
                      </TableCell>
                      <TableCell>
                        <PaymentStatusBadge status={job.paymentStatus} />
                      </TableCell>
                      <TableCell>
                        <JobWarningSummary warnings={warnings} />
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {money(job.quotedAmount)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {money(getActualFinancials(job).profit)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={event => removeJob(event, job.id)}
                          aria-label={`Delete ${job.jobNumber}`}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredJobs.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={13}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No jobs match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-red-200">
          <CardContent className="space-y-4 p-4 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <AlertTriangle className="size-5 text-red-600" />
                  Exception Queue
                </h2>
                <p className="text-sm text-muted-foreground">
                  Haul or Call blockers and added-scope requests awaiting
                  dispatch.
                </p>
              </div>
              <Badge className="bg-red-100 text-red-700">
                {exceptionQueue.length} open
              </Badge>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {exceptionQueue.map(({ issue, job }) => (
                <div
                  key={issue.id}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold">{job?.customerName}</div>
                      <div className="text-sm text-muted-foreground">
                        {issue.issueType.replaceAll("_", " ")} ·{" "}
                        {formatDate(issue.createdAt)}
                      </div>
                    </div>
                    <Badge variant="outline">
                      {(issue.issueStatus ?? "awaiting_dispatch").replaceAll(
                        "_",
                        " "
                      )}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm">{issue.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {issue.driverCalledDispatchAt ? (
                      <Badge className="bg-green-100 text-green-700">
                        driver called
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800">
                        call pending
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      onClick={() => job && navigate(`/jobs/${job.id}`)}
                    >
                      Resolve
                    </Button>
                  </div>
                </div>
              ))}
              {exceptionQueue.length === 0 && (
                <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                  No open exceptions.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </OperationsShell>
  );
}
