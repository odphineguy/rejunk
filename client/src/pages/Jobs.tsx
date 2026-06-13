import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Briefcase,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Map,
  Search,
  Trash2,
  Wrench,
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
  "paused",
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const removeJob = (event: React.MouseEvent, jobId: string) => {
    event.stopPropagation();
    setJobs(deleteJob(jobId));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(jobId);
      return next;
    });
    toast.success("Job deleted");
  };

  const visibleIds = filteredJobs.map(job => job.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some(id => selectedIds.has(id));

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) visibleIds.forEach(id => next.add(id));
      else visibleIds.forEach(id => next.delete(id));
      return next;
    });
  };

  const toggleOne = (jobId: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  };

  const deleteSelected = () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (
      !window.confirm(
        `Delete ${count} job${count === 1 ? "" : "s"}? This can't be undone.`
      )
    )
      return;
    let result = jobs;
    selectedIds.forEach(id => {
      result = deleteJob(id);
    });
    setJobs(result);
    setSelectedIds(new Set());
    toast.success(`${count} job${count === 1 ? "" : "s"} deleted`);
  };

  return (
    <OperationsShell
      title="Jobs"
      icon={Wrench}
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
          <StatCard label="On My Way" value={counts.on_my_way} icon={Wrench} />
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

            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm">
                <span className="font-medium">{selectedIds.size} selected</span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={deleteSelected}
                  >
                    <Trash2 className="size-4" />
                    Delete selected
                  </Button>
                </div>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select all jobs"
                      checked={
                        allVisibleSelected
                          ? true
                          : someVisibleSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={checked =>
                        toggleAllVisible(checked === true)
                      }
                    />
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
                        <Checkbox
                          aria-label={`Select ${job.jobNumber}`}
                          checked={selectedIds.has(job.id)}
                          onCheckedChange={checked =>
                            toggleOne(job.id, checked === true)
                          }
                        />
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
      </div>
    </OperationsShell>
  );
}
