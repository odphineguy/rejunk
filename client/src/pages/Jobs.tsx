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
import { isJunkService, normalizeServiceType, serviceTypeLabel, serviceTypeLabels } from "@/lib/jobShape";
import { employeeNameById } from "@/lib/employeeStorage";
import { fleetVehicles, vehicleUnitCode } from "@/lib/fleet";
import { getSlot, jobSlotKey } from "@/lib/scheduleSlots";
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
import { useStaffSession } from "@/hooks/useStaffSession";
import { getJobWarningsWithFacilityCheck } from "@/lib/jobIntelligence";
import { deleteJob, getActualFinancials, getJobs } from "@/lib/jobStorage";
import { loadPricingSettings } from "@/utils/pricingStorage";
import type { CanonicalJobServiceType, Job, JobStatus } from "@/types/jobs";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const statusTabs: Array<"all" | JobStatus> = [
  "all",
  "needs_review",
  "open",
  "scheduled",
  "en_route",
  "in_progress",
  "paused",
  "delayed",
  "issue",
  "completed",
  "canceled",
];

const serviceTabs: Array<"all" | CanonicalJobServiceType> = ["all", "moving", "delivery", "assembly_handyman", "junk_removal", "other"];

function scheduledLabel(job: Job, vehicles: ReturnType<typeof fleetVehicles>) {
  if (!job.scheduledStart) return "Unscheduled";
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(job.scheduledStart));
  const slot = getSlot(jobSlotKey(job, vehicles));
  return slot ? `${day} · ${slot.shortLabel}` : `${day} · ${formatDate(job.scheduledStart).split(", ").at(-1)}`;
}

function whereLabel(job: Job) {
  const stops = job.stops ?? [];
  const short = (stop: Job["stops"][number] | undefined) => stop?.city || stop?.address || "";
  if (stops.length >= 2 && stops[1].stopType === "delivery") {
    return [short(stops[0]), short(stops[1])].filter(Boolean).join(" → ");
  }
  return [stops[0]?.address ?? job.address, stops[0]?.city ?? job.city].filter(Boolean).join(", ");
}

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
  // `/jobs?status=needs_review` (Dashboard tile) opens straight on the Thumbtack queue.
  const [activeStatus, setActiveStatus] = useState<"all" | JobStatus>(() => {
    if (typeof window === "undefined") return "all";
    const wanted = new URLSearchParams(window.location.search).get("status");
    return wanted && statusTabs.includes(wanted as JobStatus) ? (wanted as JobStatus) : "all";
  });
  const [activeService, setActiveService] = useState<"all" | CanonicalJobServiceType>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { isOwner } = useStaffSession();

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
        activeStatus === "all" || job.status === activeStatus || (activeStatus === "scheduled" && job.status === "assigned");
      const matchesService =
        activeService === "all" || normalizeServiceType(job.serviceType) === activeService;
      const searchable = [
        job.jobNumber,
        job.customerName,
        job.address,
        job.city,
        job.zip,
        job.materialName,
        job.facilityName,
        serviceTypeLabel(job),
        ...(job.stops ?? []).flatMap(stop => [stop.address, stop.city]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        matchesStatus &&
        matchesService &&
        (!normalizedQuery || searchable.includes(normalizedQuery))
      );
    });
  }, [activeService, activeStatus, jobs, query]);
  const junkView = activeService === "junk_removal";
  const vehicles = useMemo(() => fleetVehicles(settings.vehicles), [settings.vehicles]);

  const counts = useMemo(
    () => ({
      needs_review: jobs.filter(job => job.status === "needs_review").length,
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
          {isOwner && <StatCard label="Unpaid" value={counts.unpaid} icon={Briefcase} />}
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

            <div className="flex flex-col gap-3">
              <Tabs
                value={activeService}
                onValueChange={value =>
                  setActiveService(value as "all" | CanonicalJobServiceType)
                }
              >
                <TabsList className="h-auto flex-wrap justify-start">
                  {serviceTabs.map(service => (
                    <TabsTrigger key={service} value={service}>
                      {service === "all" ? "All services" : serviceTypeLabels[service]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Tabs
                value={activeStatus}
                onValueChange={value =>
                  setActiveStatus(value as "all" | JobStatus)
                }
              >
                <TabsList className="h-auto flex-wrap justify-start">
                  {statusTabs.map(status => (
                    <TabsTrigger key={status} value={status}>
                      {status === "all" ? "All" : status === "needs_review" ? "New from Thumbtack" : jobStatusLabels[status]}
                      {status === "needs_review" && counts.needs_review > 0 && (
                        <Badge className="ml-1.5 h-5 min-w-5 justify-center rounded-full bg-amber-500 px-1.5 text-[11px] text-white hover:bg-amber-500">
                          {counts.needs_review}
                        </Badge>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

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
                  <TableHead>Service</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Crew</TableHead>
                  <TableHead>Where</TableHead>
                  {junkView && <TableHead>Material</TableHead>}
                  {junkView && <TableHead>Facility</TableHead>}
                  <TableHead>Status</TableHead>
                  {isOwner && <TableHead>Payment</TableHead>}
                  <TableHead>Warn</TableHead>
                  <TableHead className="text-right">Quote</TableHead>
                  {isOwner && (
                    <TableHead className="text-right">Profit</TableHead>
                  )}
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
                      <TableCell>
                        <Badge variant="secondary" className="whitespace-nowrap">
                          {serviceTypeLabel(job)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {scheduledLabel(job, vehicles)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {(() => {
                          const vehicle = vehicles.find(candidate => candidate.id === job.vehicleId);
                          return vehicle ? vehicleUnitCode(vehicle) : job.vehicleName || "—";
                        })()}
                      </TableCell>
                      <TableCell
                        className={job.crew.length < job.requiredCrew ? "whitespace-nowrap text-amber-700" : "whitespace-nowrap"}
                        title={job.crew.map(member => employeeNameById(member.employeeId, member.employeeId)).join(", ")}
                      >
                        {job.crew.length}/{job.requiredCrew}
                        {job.crew.length > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {job.crew.map(member => employeeNameById(member.employeeId, "?").split(" ")[0]).join(", ")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell
                        className="max-w-[200px] truncate"
                        title={whereLabel(job) || "Not provided"}
                      >
                        {whereLabel(job) || "Not provided"}
                      </TableCell>
                      {junkView && (
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
                      )}
                      {junkView && (
                        <TableCell>
                          <span
                            className="font-medium"
                            title={job.facilityName || "Not selected"}
                          >
                            {facilityCode(job.facilityId, job.facilityName)}
                          </span>
                        </TableCell>
                      )}
                      <TableCell>
                        <JobStatusBadge status={job.status} />
                      </TableCell>
                      {isOwner && <TableCell>
                        <PaymentStatusBadge status={job.paymentStatus} />
                      </TableCell>}
                      <TableCell>
                        <JobWarningSummary warnings={warnings} />
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {money(job.quotedAmount)}
                      </TableCell>
                      {isOwner && (
                        <TableCell className="text-right font-semibold">
                          {money(getActualFinancials(job).profit)}
                        </TableCell>
                      )}
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
                      colSpan={12 + (junkView ? 2 : 0) + (isOwner ? 2 : 0)}
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
