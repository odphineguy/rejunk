import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, CalendarClock, CopyPlus, Download, MessageSquare, Receipt, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { JobStatusBadge, JobWarningBadge, PaymentStatusBadge, jobStatusLabels, paymentStatusLabels } from "@/components/JobBadges";
import { loadMapScript } from "@/components/Map";
import { OperationsShell } from "@/components/OperationsShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  actualChargedAmount,
  actualProfit,
  actualTotalCost,
  estimatedProfit,
  estimatedTotalCost,
  getFacilityCheck,
  getJobWarningsWithFacilityCheck,
  margin,
} from "@/lib/jobIntelligence";
import { toDriverJob } from "@/lib/driverStorage";
import {
  dispatchResolveIssue,
  employeeLabel,
  employeeOptions,
  saveDispatchOperationalPlan,
  saveServiceStopCoordinates,
  sendDispatchJobMessage,
  updatePhotoVisibility,
  type DispatchAssignmentInput,
} from "@/lib/dispatchOperations";
import { deleteJob, duplicateJob, getActualFinancials, getJobs, saveJob, updateJob } from "@/lib/jobStorage";
import { customerStops, disposalEvents, jobOperationalMetrics } from "@/lib/operationalMetrics";
import { geocodeStatusToReason, primaryServiceLocationStatus, reasonLabel, writeLocationCache, readLocationCache } from "@/lib/locationValidation";
import { loadPricingSettings } from "@/utils/pricingStorage";
import { getRouteEstimateToFacility } from "@/utils/distanceRouting";
import { buildBestRecommendation, recommendationInputFromJob } from "@/utils/recommendations";
import type { Job, JobStatus, PaymentStatus } from "@/types/jobs";
import type { JobDisposalEvent, JobIssue, JobIssueResolutionType, JobIssueStatus, JobItem, JobPhotoVisibility, JobStop } from "@/types/driver";
import type { JobRouteEstimate } from "@/types/pricing";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const jobStatuses: JobStatus[] = ["open", "scheduled", "on_my_way", "in_progress", "completed", "canceled"];
const paymentStatuses: PaymentStatus[] = ["unpaid", "deposit_paid", "paid", "refunded"];

function money(value: number | undefined) {
  return currency.format(Number.isFinite(value) ? Number(value) : 0);
}

function miles(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)} mi` : "Unavailable";
}

function minutes(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)} min` : "Unavailable";
}

function formatDate(value?: string) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function fieldNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function routeEstimatesFromJob(job: Job | null): Record<string, JobRouteEstimate> {
  if (!job?.facilityRouteComparisons?.length) return {};
  return Object.fromEntries(
    job.facilityRouteComparisons.map((comparison) => [
      comparison.facilityId,
      {
        jobAddress: comparison.jobAddress,
        facilityId: comparison.facilityId,
        oneWayMiles: comparison.oneWayMiles,
        roundTripMiles: comparison.roundTripMiles,
        estimatedDriveMinutes: comparison.estimatedDriveMinutes,
        source: "fallback" as const,
      },
    ]),
  );
}

export function NewJob() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const now = new Date().toISOString();
    const job = saveJob({
      id: "",
      jobNumber: "",
      source: "manual",
      createdAt: now,
      updatedAt: now,
      customerName: "New job",
      status: "open",
      paymentStatus: "unpaid",
      quotedAmount: 0,
      actuals: { chargedAmount: 0 },
    });
    navigate(`/jobs/${job.id}`, { replace: true });
    toast.success("New job created");
  }, [navigate]);

  return (
    <OperationsShell title="New Job" eyebrow="Operations">
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Creating job...</CardContent>
      </Card>
    </OperationsShell>
  );
}

export default function JobDetail() {
  const [, params] = useRoute("/jobs/:jobId");
  const [, navigate] = useLocation();
  const [settings, setSettings] = useState(() => loadPricingSettings());
  const [job, setJob] = useState<Job | null>(() => getJobs().find((item) => item.id === params?.jobId) ?? null);
  const [photoVisibilityFilter, setPhotoVisibilityFilter] = useState<"all" | JobPhotoVisibility>("all");
  const [dispatchMessage, setDispatchMessage] = useState("");
  const [instructionUpdate, setInstructionUpdate] = useState("");
  const [routeEstimates, setRouteEstimates] = useState<Record<string, JobRouteEstimate>>(() =>
    routeEstimatesFromJob(getJobs().find((item) => item.id === params?.jobId) ?? null),
  );
  const savedSnapshotKey = useRef("");

  useEffect(() => {
    const refresh = () => setJob(getJobs().find((item) => item.id === params?.jobId) ?? null);
    window.addEventListener("jobs-updated", refresh);
    window.addEventListener("driver-data-updated", refresh);
    return () => {
      window.removeEventListener("jobs-updated", refresh);
      window.removeEventListener("driver-data-updated", refresh);
    };
  }, [params?.jobId]);

  useEffect(() => {
    const refreshSettings = () => setSettings(loadPricingSettings());
    window.addEventListener("pricing-settings-updated", refreshSettings);
    return () => window.removeEventListener("pricing-settings-updated", refreshSettings);
  }, []);

  const actualFinancials = useMemo(() => (job ? getActualFinancials(job) : { charged: 0, cost: 0, profit: 0 }), [job]);
  const driverJob = useMemo(() => (job ? toDriverJob(job) : null), [job]);
  const filteredDriverPhotos = useMemo(
    () => driverJob?.photos.filter((photo) => photoVisibilityFilter === "all" || photo.visibility === photoVisibilityFilter) ?? [],
    [driverJob?.photos, photoVisibilityFilter],
  );
  const operationalMetrics = useMemo(() => (driverJob ? jobOperationalMetrics(driverJob) : null), [driverJob]);
  const locationStatus = useMemo(() => (job && driverJob ? primaryServiceLocationStatus(job, driverJob) : null), [job, driverJob]);
  const actualMargin = margin(actualFinancials.profit, actualFinancials.charged);
  const jobWarnings = useMemo(() => (job ? getJobWarningsWithFacilityCheck(job, settings) : []), [job, settings]);
  const comparison = useMemo(() => {
    if (!job) {
      return {
        quotedAmount: 0,
        actualCharged: 0,
        estimatedCost: 0,
        actualCost: 0,
        estimatedProfitValue: 0,
        actualProfitValue: 0,
        profitVariance: 0,
        estimatedMarginValue: 0,
        actualMarginValue: 0,
        marginVariance: 0,
      };
    }

    const estimatedProfitValue = estimatedProfit(job);
    const actualProfitValue = actualProfit(job);
    const estimatedMarginValue = job.estimatedMarginDecimal ?? margin(estimatedProfitValue, job.quotedAmount);
    const actualMarginValue = margin(actualProfitValue, actualChargedAmount(job));

    return {
      quotedAmount: job.quotedAmount,
      actualCharged: actualChargedAmount(job),
      estimatedCost: estimatedTotalCost(job),
      actualCost: actualTotalCost(job),
      estimatedProfitValue,
      actualProfitValue,
      profitVariance: actualProfitValue - estimatedProfitValue,
      estimatedMarginValue,
      actualMarginValue,
      marginVariance: actualMarginValue - estimatedMarginValue,
    };
  }, [job]);
  const facilityCheck = useMemo(() => (job ? getFacilityCheck(job, settings) : null), [job, settings]);
  const routeRecommendationInput = useMemo(() => {
    if (!job) return null;
    return {
      ...recommendationInputFromJob(job, settings),
      routeEstimates: { ...routeEstimatesFromJob(job), ...routeEstimates },
    };
  }, [job, routeEstimates, settings]);
  const routeRecommendation = useMemo(
    () => (routeRecommendationInput ? buildBestRecommendation(routeRecommendationInput, settings) : null),
    [routeRecommendationInput, settings],
  );
  const selectedFacilityComparison = useMemo(
    () => routeRecommendation?.facilityComparisons.find((comparison) => comparison.facilityId === job?.facilityId),
    [job?.facilityId, routeRecommendation],
  );
  const selectedVehicleComparison = useMemo(
    () => routeRecommendation?.vehicleComparisons.find((comparison) => comparison.vehicleId === job?.vehicleId),
    [job?.vehicleId, routeRecommendation],
  );
  const recommendedVehicleComparison = routeRecommendation?.recommendation?.vehicleComparison;
  const heavyMode = recommendedVehicleComparison?.handlingClass === "heavy_lowboy" || selectedVehicleComparison?.handlingClass === "heavy_lowboy";
  const trailerAdvantage = useMemo(() => {
    if (!selectedVehicleComparison || !recommendedVehicleComparison || recommendedVehicleComparison.vehicleType !== "dump_trailer") return null;
    const profitGain = recommendedVehicleComparison.estimatedProfit - selectedVehicleComparison.estimatedProfit;
    if (recommendedVehicleComparison.tripsRequired < selectedVehicleComparison.tripsRequired) {
      return { reason: "Trailer reduces trip count.", profitGain };
    }
    if (selectedVehicleComparison.payloadWarning && !recommendedVehicleComparison.payloadWarning) {
      return { reason: "Trailer improves payload safety.", profitGain };
    }
    if (recommendedVehicleComparison.disposalCost < selectedVehicleComparison.disposalCost) {
      return { reason: "Trailer lowers disposal minimums across trips.", profitGain };
    }
    return null;
  }, [recommendedVehicleComparison, selectedVehicleComparison]);

  useEffect(() => {
    if (!job) return;
    const jobAddress = [job.address, job.city, job.state, job.zip].filter(Boolean).join(", ");
    if (!jobAddress.trim()) {
      setRouteEstimates(routeEstimatesFromJob(job));
      return;
    }

    let canceled = false;
    const facilities = settings.disposalFacilities.filter((facility) => facility.isActive);

    loadMapScript()
      .then(() => Promise.all(facilities.map((facility) => getRouteEstimateToFacility(jobAddress, facility))))
      .then((routes) => {
        if (canceled) return;
        setRouteEstimates(Object.fromEntries(routes.map((route) => [route.facilityId, route])));
      })
      .catch(() => {
        if (!canceled) setRouteEstimates(routeEstimatesFromJob(job));
      });

    return () => {
      canceled = true;
    };
  }, [job?.address, job?.city, job?.state, job?.zip, settings.disposalFacilities]);

  useEffect(() => {
    if (!job || !routeRecommendation?.recommendation) return;
    const snapshot = {
      recommendationSnapshot: routeRecommendation.recommendation,
      facilityRouteComparisons: routeRecommendation.facilityComparisons,
      vehicleJobComparisons: routeRecommendation.vehicleComparisons,
    };
    const nextKey = JSON.stringify(snapshot);
    const currentKey = JSON.stringify({
      recommendationSnapshot: job.recommendationSnapshot,
      facilityRouteComparisons: job.facilityRouteComparisons,
      vehicleJobComparisons: job.vehicleJobComparisons,
    });
    if (nextKey === currentKey || nextKey === savedSnapshotKey.current) return;

    savedSnapshotKey.current = nextKey;
    const updated = updateJob(job.id, snapshot);
    if (updated) setJob(updated);
  }, [job, routeRecommendation]);

  const applyUpdates = (updates: Partial<Job>) => {
    if (!job) return;
    const updated = updateJob(job.id, updates);
    if (updated) setJob(updated);
  };

  const saveInstructionUpdate = async () => {
    if (!job || !instructionUpdate.trim()) return;
    applyUpdates({ internalNotes: [job.internalNotes, instructionUpdate.trim()].filter(Boolean).join("\n\n") });
    await saveDispatchOperationalPlan(job.id, { instructionUpdate: `Instructions updated: ${instructionUpdate.trim()}` });
    setInstructionUpdate("");
    toast.success("Instruction update published");
  };

  const sendCrewMessage = async () => {
    if (!job || !dispatchMessage.trim()) return;
    await sendDispatchJobMessage(job.id, dispatchMessage);
    setDispatchMessage("");
    toast.success("Message sent to assigned crew");
  };

  const updateActual = (field: keyof NonNullable<Job["actuals"]>, value: string) => {
    if (!job) return;
    const stringFields: Array<keyof NonNullable<Job["actuals"]>> = [
      "dumpReceiptUrl",
      "receiptNumber",
      "scaleTicketNumber",
      "disposalFacilityId",
      "receiptNotes",
    ];
    applyUpdates({
      actuals: {
        ...job.actuals,
        [field]: stringFields.includes(field) ? value : fieldNumber(value),
        updatedAt: new Date().toISOString(),
      },
    });
  };

  const removeJob = () => {
    if (!job) return;
    deleteJob(job.id);
    toast.success("Job deleted");
    navigate("/jobs");
  };

  const copyJob = () => {
    if (!job) return;
    const duplicate = duplicateJob(job.id);
    if (duplicate) {
      toast.success("Job duplicated");
      navigate(`/jobs/${duplicate.id}`);
    }
  };

  if (!job) {
    return (
      <OperationsShell title="Job Not Found" eyebrow="Operations">
        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="text-muted-foreground">That job could not be found.</p>
            <Button asChild>
              <Link href="/jobs">Back to Jobs</Link>
            </Button>
          </CardContent>
        </Card>
      </OperationsShell>
    );
  }

  return (
    <OperationsShell
      title={`${job.jobNumber} · ${job.customerName}`}
      eyebrow="Job detail"
      actions={
        <Button asChild variant="outline">
          <Link href="/jobs">
            <ArrowLeft className="size-4" />
            Jobs
          </Link>
        </Button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle>Customer & Job Info</CardTitle>
                  <CardDescription>{job.jobLabel || "Internal operations record"}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <JobStatusBadge status={job.status} />
                  <PaymentStatusBadge status={job.paymentStatus} />
                  {jobWarnings.map((warning) => (
                    <JobWarningBadge key={warning.code} warning={warning} />
                  ))}
                  {routeRecommendation?.recommendation &&
                    routeRecommendation.recommendation.facilityId !== job.facilityId &&
                    routeRecommendation.recommendation.estimatedSavings > 0 && (
                      <Badge className="bg-green-100 text-green-700">
                        Better facility available: {money(routeRecommendation.recommendation.estimatedSavings)}
                      </Badge>
                    )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <EditableField label="Customer" value={job.customerName} onChange={(value) => applyUpdates({ customerName: value || "Unnamed customer" })} />
              <EditableField label="Job label" value={job.jobLabel ?? ""} onChange={(value) => applyUpdates({ jobLabel: value })} />
              <EditableField label="Phone" value={job.phone ?? ""} onChange={(value) => applyUpdates({ phone: value })} />
              <EditableField label="Email" value={job.email ?? ""} onChange={(value) => applyUpdates({ email: value })} />
              <div className="md:col-span-2">
                <EditableField label="Address" value={job.address ?? ""} onChange={(value) => applyUpdates({ address: value })} />
              </div>
              <EditableField label="City" value={job.city ?? ""} onChange={(value) => applyUpdates({ city: value })} />
              <EditableField label="ZIP" value={job.zip ?? ""} onChange={(value) => applyUpdates({ zip: value })} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Schedule, Material & Facility</CardTitle>
              <CardDescription>Route context for the crew and disposal plan.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <EditableField
                label="Scheduled start"
                type="datetime-local"
                value={job.scheduledStart ? job.scheduledStart.slice(0, 16) : ""}
                onChange={(value) => applyUpdates({ scheduledStart: value ? new Date(value).toISOString() : undefined, status: value && job.status === "open" ? "scheduled" : job.status })}
              />
              <EditableField
                label="Scheduled end"
                type="datetime-local"
                value={job.scheduledEnd ? job.scheduledEnd.slice(0, 16) : ""}
                onChange={(value) => applyUpdates({ scheduledEnd: value ? new Date(value).toISOString() : undefined })}
              />
              <EditableField label="Material" value={job.materialName ?? ""} onChange={(value) => applyUpdates({ materialName: value })} />
              <EditableField label="Facility" value={job.facilityName ?? ""} onChange={(value) => applyUpdates({ facilityName: value })} />
              <EditableField label="Vehicle" value={job.vehicleName ?? ""} onChange={(value) => applyUpdates({ vehicleName: value })} />
              <EditableField label="Cubic yards" type="number" value={String(job.cubicYards ?? "")} onChange={(value) => applyUpdates({ cubicYards: fieldNumber(value) })} />
            </CardContent>
          </Card>

          {driverJob && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle>Driver Operations</CardTitle>
                    <CardDescription>Field submissions, stops, items, photos, issues, and job activity.</CardDescription>
                  </div>
                  <Badge variant="outline">{driverJob.activity.length} activity events</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <MiniStat label="Assigned crew" value={driverJob.assignedCrew.map((crew) => crew.displayName).join(", ") || "Unassigned"} />
                  <MiniStat label="Service locations" value={String(operationalMetrics?.customerStopCount ?? 0)} />
                  <MiniStat label="Items touched" value={`${operationalMetrics?.itemsTouched ?? 0}/${driverJob.items.length}`} />
                  <MiniStat label="Disposal trips" value={String(operationalMetrics?.disposalEventCount ?? 0)} />
                  <MiniStat label="Open issues" value={String(operationalMetrics?.openIssueCount ?? 0)} />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-3 font-semibold">Service locations</div>
                    <div className="space-y-3">
                      {customerStops(driverJob.stops).map((stop) => (
                        <DetailRow key={stop.id} label={`${stop.stopOrder}. ${stop.name}`} value={stop.status.replaceAll("_", " ")} />
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-3 font-semibold">Items</div>
                    <div className="space-y-3">
                      {driverJob.items.map((item) => (
                        <DetailRow key={item.id} label={`${item.quantity}x ${item.name}`} value={item.status.replaceAll("_", " ")} />
                      ))}
                    </div>
                  </div>
                </div>

                <DisposalEventsPanel jobId={job.id} events={disposalEvents(driverJob.disposalEvents)} onSaved={() => setJob(getJobs().find((item) => item.id === job.id) ?? job)} />

                <div className="rounded-lg border border-border p-4">
                  <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="font-semibold">Photos</div>
                    <div className="flex flex-wrap gap-2">
                      <Select value={photoVisibilityFilter} onValueChange={(value) => setPhotoVisibilityFilter(value as "all" | JobPhotoVisibility)}>
                        <SelectTrigger className="h-9 w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All visibility</SelectItem>
                          <SelectItem value="internal">Internal</SelectItem>
                          <SelectItem value="customer_ready">Customer ready</SelectItem>
                        </SelectContent>
                      </Select>
                      {filteredDriverPhotos.filter((photo) => photo.visibility === "customer_ready").map((photo) => (
                        <Button key={photo.id} asChild variant="outline" size="sm">
                          <a href={photo.publicUrl || photo.storagePath} download>
                            <Download className="size-4" />
                            Photo
                          </a>
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {filteredDriverPhotos.map((photo) => (
                      <a key={photo.id} href={photo.publicUrl || photo.storagePath} className="rounded-lg border border-border p-3 text-sm" target="_blank" rel="noreferrer">
                        <div className="font-semibold">{photo.photoType.replaceAll("_", " ")}</div>
                        <div className="text-muted-foreground">{photo.visibility.replaceAll("_", " ")}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{formatDate(photo.createdAt)}</div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={(event) => {
                            event.preventDefault();
                            void updatePhotoVisibility(photo, photo.visibility === "customer_ready" ? "internal" : "customer_ready").then(() => setJob(getJobs().find((item) => item.id === job.id) ?? job));
                          }}
                        >
                          Mark {photo.visibility === "customer_ready" ? "internal" : "customer-ready"}
                        </Button>
                      </a>
                    ))}
                    {filteredDriverPhotos.length === 0 && <p className="text-sm text-muted-foreground">No photos match this filter.</p>}
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-3 font-semibold">Issues</div>
                    <div className="space-y-3">
                      {driverJob.issues.map((issue) => (
                        <div key={issue.id} className="rounded-md bg-muted/50 p-3 text-sm">
                          <div className="font-semibold">{issue.issueType.replaceAll("_", " ")} · {issue.severity}</div>
                          <p className="mt-1 text-muted-foreground">{issue.description}</p>
                        </div>
                      ))}
                      {driverJob.issues.length === 0 && <p className="text-sm text-muted-foreground">No driver issues submitted.</p>}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-3 font-semibold">Activity & Messages</div>
                    <div className="max-h-72 space-y-3 overflow-y-auto">
                      {[...driverJob.activity].slice(0, 10).map((entry) => (
                        <div key={entry.id} className="rounded-md bg-muted/50 p-3 text-sm">
                          <div className="font-semibold">{entry.eventType.replaceAll("_", " ")}</div>
                          <p className="mt-1 text-muted-foreground">{entry.message}</p>
                        </div>
                      ))}
                      {driverJob.activity.length === 0 && <p className="text-sm text-muted-foreground">No driver activity yet.</p>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {driverJob && (
            <Card>
              <CardHeader>
                <CardTitle>Dispatch Control</CardTitle>
                <CardDescription>Assignments, instructions, stop/item edits, crew messaging, and exception resolution.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <AssignmentEditor job={job} onSaved={() => setJob(getJobs().find((item) => item.id === job.id) ?? job)} />

                <LocationRepairPanel job={job} locationStatus={locationStatus} onSaved={() => setJob(getJobs().find((item) => item.id === job.id) ?? job)} />

                <div className="rounded-lg border border-border p-4">
                  <div className="mb-3 font-semibold">Publish instruction update</div>
                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <Textarea value={instructionUpdate} onChange={(event) => setInstructionUpdate(event.target.value)} placeholder="What changed for the crew?" rows={3} />
                    <Button className="h-11 md:self-end" onClick={() => void saveInstructionUpdate()}>
                      <Send className="size-4" />
                      Publish
                    </Button>
                  </div>
                </div>

                <StopsItemsEditor jobId={job.id} stops={customerStops(driverJob.stops)} items={driverJob.items} disposalEvents={driverJob.disposalEvents} onSaved={() => setJob(getJobs().find((item) => item.id === job.id) ?? job)} />

                <div className="rounded-lg border border-border p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold">
                    <MessageSquare className="size-4" />
                    Message assigned crew
                  </div>
                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <Input value={dispatchMessage} onChange={(event) => setDispatchMessage(event.target.value)} placeholder="Job-specific message" />
                    <Button onClick={() => void sendCrewMessage()}>
                      <Send className="size-4" />
                      Send
                    </Button>
                  </div>
                </div>

                <ExceptionResolutionPanel issues={driverJob.issues} onResolved={() => setJob(getJobs().find((item) => item.id === job.id) ?? job)} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Quoted vs Actual</CardTitle>
              <CardDescription>Compare the saved estimate against the final job economics.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
              <MiniStat label="Quoted amount" value={money(comparison.quotedAmount)} />
              <MiniStat label="Actual charged" value={money(comparison.actualCharged)} />
              <MiniStat label="Estimated cost" value={money(comparison.estimatedCost)} />
              <MiniStat label="Actual cost" value={money(comparison.actualCost)} />
              <MiniStat label="Estimated profit" value={money(comparison.estimatedProfitValue)} />
              <MiniStat label="Actual profit" value={money(comparison.actualProfitValue)} strong />
              <VarianceStat label="Profit variance" value={comparison.profitVariance} formatter={money} />
              <MiniStat label="Estimated margin" value={`${percent.format(comparison.estimatedMarginValue * 100)}%`} />
              <MiniStat label="Actual margin" value={`${percent.format(comparison.actualMarginValue * 100)}%`} />
              <VarianceStat
                label="Margin variance"
                value={comparison.marginVariance}
                formatter={(value) => `${percent.format(value * 100)}%`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actual Costs & Receipt</CardTitle>
              <CardDescription>Track final costs, dump receipt details, and scale-ticket data.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <EditableField label="Actual disposal cost" type="number" value={String(job.actuals?.disposalCost ?? "")} onChange={(value) => updateActual("disposalCost", value)} />
              <EditableField label="Actual labor cost" type="number" value={String(job.actuals?.laborCost ?? "")} onChange={(value) => updateActual("laborCost", value)} />
              <EditableField label="Actual fuel cost" type="number" value={String(job.actuals?.fuelCost ?? "")} onChange={(value) => updateActual("fuelCost", value)} />
              <EditableField label="Actual charged amount" type="number" value={String(job.actuals?.chargedAmount ?? job.quotedAmount)} onChange={(value) => updateActual("chargedAmount", value)} />
              <EditableField label="Receipt number" value={job.actuals?.receiptNumber ?? ""} onChange={(value) => updateActual("receiptNumber", value)} />
              <EditableField label="Scale ticket number" value={job.actuals?.scaleTicketNumber ?? ""} onChange={(value) => updateActual("scaleTicketNumber", value)} />
              <div className="space-y-2">
                <Label>Receipt facility</Label>
                <Select
                  value={job.actuals?.disposalFacilityId || job.facilityId || ""}
                  onValueChange={(value) => updateActual("disposalFacilityId", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select facility" />
                  </SelectTrigger>
                  <SelectContent>
                    {settings.disposalFacilities.map((facility) => (
                      <SelectItem key={facility.id} value={facility.id}>
                        {facility.facilityName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <EditableField label="Gross weight" type="number" value={String(job.actuals?.grossWeight ?? "")} onChange={(value) => updateActual("grossWeight", value)} />
              <EditableField label="Tare weight" type="number" value={String(job.actuals?.tareWeight ?? "")} onChange={(value) => updateActual("tareWeight", value)} />
              <EditableField label="Net weight tons" type="number" value={String(job.actuals?.netWeightTons ?? "")} onChange={(value) => updateActual("netWeightTons", value)} />
              <EditableField label="Disposal total" type="number" value={String(job.actuals?.disposalTotal ?? "")} onChange={(value) => updateActual("disposalTotal", value)} />
              <div className="xl:col-span-4">
                <EditableField
                  label="Dump receipt URL"
                  value={job.actuals?.dumpReceiptUrl ?? ""}
                  onChange={(value) => updateActual("dumpReceiptUrl", value)}
                  placeholder="Paste receipt URL when available"
                />
              </div>
              <div className="xl:col-span-4">
                <TextAreaField label="Receipt notes" value={job.actuals?.receiptNotes ?? ""} onChange={(value) => updateActual("receiptNotes", value)} />
              </div>
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground xl:col-span-4">
                Upload placeholder: file storage is not connected yet.
              </div>
            </CardContent>
          </Card>

          {facilityCheck && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle>Facility Check</CardTitle>
                    <CardDescription>Route-aware comparison using material compatibility, disposal, fuel, and drive cost.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {facilityCheck.selectedRejectsMaterial && <Badge className="bg-destructive text-white">Facility Mismatch</Badge>}
                    {facilityCheck.selectedPricingStale && <Badge className="bg-amber-600 text-white">Pricing Stale</Badge>}
                    {routeRecommendation?.recommendation &&
                      routeRecommendation.recommendation.facilityId !== job.facilityId &&
                      routeRecommendation.recommendation.estimatedSavings > 0 && (
                        <Badge className="bg-green-100 text-green-700">Better facility available</Badge>
                      )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <MiniStat label="Selected facility" value={selectedFacilityComparison?.facilityName ?? facilityCheck.selectedFacility?.facilityName ?? job.facilityName ?? "Not selected"} />
                  <MiniStat label="Recommended facility" value={routeRecommendation?.recommendation?.facilityName ?? facilityCheck.recommendedFacility?.facilityName ?? "No recommendation"} />
                  <MiniStat label="Selected total cost" value={money(routeRecommendation?.recommendation?.selectedTotalCost ?? facilityCheck.selectedCost)} />
                  <MiniStat label="Recommended total cost" value={money(routeRecommendation?.recommendation?.recommendedTotalCost ?? facilityCheck.recommendedCost)} />
                </div>
                <div className="rounded-lg border border-border p-4 text-sm">
                  <div className="grid gap-2 md:grid-cols-2">
                    <DetailRow
                      label="Estimated savings / added cost"
                      value={(routeRecommendation?.recommendation?.estimatedSavings ?? facilityCheck.savings) >= 0 ? money(routeRecommendation?.recommendation?.estimatedSavings ?? facilityCheck.savings) : `${money(Math.abs(routeRecommendation?.recommendation?.estimatedSavings ?? facilityCheck.savings))} added`}
                    />
                    <DetailRow label="Distance difference" value={miles(routeRecommendation?.recommendation?.distanceDifferenceMiles)} />
                    <DetailRow label="Drive time difference" value={minutes(routeRecommendation?.recommendation?.driveTimeDifferenceMinutes)} />
                    <DetailRow label="Selected accepts material" value={facilityCheck.selectedAcceptsMaterial ? "Yes" : "No"} />
                    <DetailRow label="Selected rejects material" value={facilityCheck.selectedRejectsMaterial ? "Yes" : "No"} />
                    <DetailRow label="Recommended accepts material" value={facilityCheck.recommendedAcceptsMaterial ? "Yes" : "No"} />
                  </div>
                </div>
                {routeRecommendation?.recommendation && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                    <div className="font-semibold">Reason</div>
                    <p className="mt-1 text-muted-foreground">{routeRecommendation.recommendation.reason}</p>
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  <RouteCostCard title="Selected" comparison={selectedFacilityComparison} fallbackName={job.facilityName ?? "Not selected"} />
                  <RouteCostCard title="Recommended" comparison={routeRecommendation?.recommendation?.facilityComparison} fallbackName={routeRecommendation?.recommendation?.facilityName ?? "No recommendation"} />
                </div>
              </CardContent>
            </Card>
          )}

          {routeRecommendation && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle>Vehicle Comparison</CardTitle>
                    <CardDescription>Compares capacity, payload, trips, route cost, disposal cost, and estimated profit.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedVehicleComparison?.payloadWarning && <Badge className="bg-amber-100 text-amber-800">{selectedVehicleComparison.payloadWarning}</Badge>}
                    {trailerAdvantage && <Badge className="bg-blue-100 text-blue-700">Trailer advantage</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <MiniStat label="Selected vehicle" value={selectedVehicleComparison?.vehicleName ?? job.vehicleName ?? "Not selected"} />
                  <MiniStat label="Recommended vehicle" value={recommendedVehicleComparison?.vehicleName ?? "No recommendation"} />
                  <MiniStat label="Selected trips" value={String(selectedVehicleComparison?.tripsRequired ?? "—")} />
                  <MiniStat label="Recommended trips" value={String(recommendedVehicleComparison?.tripsRequired ?? "—")} />
                  <MiniStat label="Selected profit" value={money(selectedVehicleComparison?.estimatedProfit)} />
                  <MiniStat label="Recommended profit" value={money(recommendedVehicleComparison?.estimatedProfit)} />
                  <VarianceStat
                    label="Profit difference"
                    value={(recommendedVehicleComparison?.estimatedProfit ?? 0) - (selectedVehicleComparison?.estimatedProfit ?? 0)}
                    formatter={money}
                  />
                  <MiniStat label="Estimated tons" value={(selectedVehicleComparison?.estimatedTons ?? job.estimatedTons ?? 0).toFixed(2)} />
                </div>

                {trailerAdvantage && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                    <div className="font-semibold">Trailer advantage</div>
                    <p className="mt-1">
                      {trailerAdvantage.reason} Estimated profit gain: {money(trailerAdvantage.profitGain)}.
                    </p>
                  </div>
                )}

                {heavyMode && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="font-semibold">Lowboy-style heavy load</div>
                    <p className="mt-1">10 yd3 roll-off equivalent ≈ 2 van trips. Dense material: volume may fit, but weight controls legality.</p>
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <VehicleCostCard title="Selected" comparison={selectedVehicleComparison} fallbackName={job.vehicleName ?? "Not selected"} />
                  <VehicleCostCard title="Recommended" comparison={recommendedVehicleComparison} fallbackName="No recommendation" />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
              <CardDescription>Customer-facing notes and private crew context.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <TextAreaField label="Notes" value={job.notes ?? ""} onChange={(value) => applyUpdates({ notes: value })} />
              <TextAreaField label="Internal notes" value={job.internalNotes ?? ""} onChange={(value) => applyUpdates({ internalNotes: value })} />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle>Financial Summary</CardTitle>
              <CardDescription>{job.sourceEstimateId ? "Linked to saved estimate" : "Manual job record"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Quoted" value={money(job.quotedAmount)} />
                <MiniStat label="Estimated cost" value={money(job.estimatedCost)} />
                <MiniStat label="Estimated profit" value={money(job.estimatedProfit)} />
                <MiniStat label="Estimated margin" value={`${percent.format((job.estimatedMarginDecimal ?? 0) * 100)}%`} />
                <MiniStat label="Actual profit" value={money(actualFinancials.profit)} strong />
                <MiniStat label="Actual margin" value={`${percent.format(actualMargin * 100)}%`} strong />
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                <DetailRow label="Scheduled" value={formatDate(job.scheduledStart)} />
                <DetailRow label="Material" value={job.materialName || job.materialType?.replaceAll("_", " ") || "Not set"} />
                <DetailRow label="Facility" value={job.facilityName || "Not selected"} />
                <DetailRow label="Crew lead" value={job.assignment?.crewLead || "Unassigned"} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Update Job</CardTitle>
              <CardDescription>Move the job through dispatch and payment states.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={job.status} onValueChange={(value) => applyUpdates({ status: value as JobStatus })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {jobStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {jobStatusLabels[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Payment status</Label>
                <Select value={job.paymentStatus} onValueChange={(value) => applyUpdates({ paymentStatus: value as PaymentStatus })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {paymentStatusLabels[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => toast.success("Job saved")}>
                  <Save className="size-4" />
                  Save
                </Button>
                <Button variant="outline" onClick={copyJob}>
                  <CopyPlus className="size-4" />
                  Duplicate
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/schedule">
                    <CalendarClock className="size-4" />
                    Schedule
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <a href={job.actuals?.dumpReceiptUrl || "#"} onClick={(event) => !job.actuals?.dumpReceiptUrl && event.preventDefault()}>
                    <Receipt className="size-4" />
                    Receipt
                  </a>
                </Button>
                <Button variant="destructive" className="col-span-2" onClick={removeJob}>
                  <Trash2 className="size-4" />
                  Delete Job
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </OperationsShell>
  );
}

function EditableField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} rows={6} />
    </div>
  );
}

function AssignmentEditor({ job, onSaved }: { job: Job; onSaved: () => void }) {
  const employees = employeeOptions();
  const [crewLeadId, setCrewLeadId] = useState("none");
  const [driverId, setDriverId] = useState("none");
  const [helperIds, setHelperIds] = useState<string[]>([]);
  const [vehicleName, setVehicleName] = useState(job.vehicleName ?? job.assignment?.vehicleName ?? "");
  const [crewSequence, setCrewSequence] = useState(String(job.crewSequence ?? 1));

  const save = async () => {
    const assignment: DispatchAssignmentInput = {
      crewLeadId: crewLeadId === "none" ? undefined : crewLeadId,
      driverId: driverId === "none" ? undefined : driverId,
      helperIds,
      vehicleName,
      crewSequence: Number(crewSequence || 1),
    };
    await saveDispatchOperationalPlan(job.id, { assignment, activityMessage: "Dispatch updated crew assignment." });
    toast.success("Assignment updated");
    onSaved();
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 font-semibold">Assignment</div>
      <div className="grid gap-4 md:grid-cols-2">
        <SelectLite label="Crew lead" value={crewLeadId} onChange={setCrewLeadId} options={[{ value: "none", label: "Unassigned" }, ...employees.map((employee) => ({ value: employee.id, label: employeeLabel(employee) }))]} />
        <SelectLite label="Driver" value={driverId} onChange={setDriverId} options={[{ value: "none", label: "Unassigned" }, ...employees.map((employee) => ({ value: employee.id, label: employeeLabel(employee) }))]} />
        <EditableField label="Vehicle" value={vehicleName} onChange={setVehicleName} />
        <EditableField label="Crew sequence" type="number" value={crewSequence} onChange={setCrewSequence} />
        <div className="space-y-2 md:col-span-2">
          <Label>Helpers</Label>
          <div className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-2">
            {employees.map((employee) => (
              <label key={employee.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={helperIds.includes(employee.id)}
                  onChange={(event) => setHelperIds((current) => event.target.checked ? [...current, employee.id] : current.filter((id) => id !== employee.id))}
                />
                {employeeLabel(employee)}
              </label>
            ))}
          </div>
        </div>
      </div>
      <Button className="mt-4" onClick={() => void save()}>
        Save Assignment
      </Button>
    </div>
  );
}

function DisposalEventsPanel({ jobId, events, onSaved }: { jobId: string; events: JobDisposalEvent[]; onSaved: () => void }) {
  const [draftEvents, setDraftEvents] = useState(events);

  useEffect(() => setDraftEvents(events), [events]);

  const save = async () => {
    await saveDispatchOperationalPlan(jobId, { disposalEvents: draftEvents, activityMessage: "Dispatch updated disposal and dumping plan." });
    toast.success("Disposal plan updated");
    onSaved();
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-semibold">Disposal & dumping</div>
        <Button variant="outline" size="sm" onClick={() => {
          const now = new Date().toISOString();
          setDraftEvents((current) => [...current, { id: `disposal-${Date.now()}`, jobId, sequenceNumber: current.length + 1, status: "planned", planned: true, createdAt: now, updatedAt: now }]);
        }}>Add disposal trip</Button>
      </div>
      <div className="space-y-3">
        {draftEvents.map((event, index) => (
          <div key={event.id} className="rounded-md bg-muted/40 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="font-semibold">Disposal Trip {index + 1}</span>
              <Button variant="outline" size="sm" onClick={() => setDraftEvents((current) => current.filter((item) => item.id !== event.id))}>Remove</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <EditableField label="Facility" value={event.facilityName ?? ""} onChange={(value) => setDraftEvents((current) => current.map((item) => item.id === event.id ? { ...item, facilityName: value } : item))} />
              <EditableField label="Material" value={event.materialType ?? ""} onChange={(value) => setDraftEvents((current) => current.map((item) => item.id === event.id ? { ...item, materialType: value } : item))} />
              <SelectLite label="Status" value={event.status} onChange={(value) => setDraftEvents((current) => current.map((item) => item.id === event.id ? { ...item, status: value as JobDisposalEvent["status"] } : item))} options={["planned", "en_route", "arrived", "unloading", "completed", "rejected", "canceled"].map((value) => ({ value, label: value.replaceAll("_", " ") }))} />
              <EditableField label="Net weight lbs" type="number" value={String(event.netWeightLbs ?? "")} onChange={(value) => setDraftEvents((current) => current.map((item) => item.id === event.id ? { ...item, netWeightLbs: fieldNumber(value), netWeightTons: fieldNumber(value) / 2000 } : item))} />
              <EditableField label="Disposal cost" type="number" value={String(event.disposalCost ?? "")} onChange={(value) => setDraftEvents((current) => current.map((item) => item.id === event.id ? { ...item, disposalCost: fieldNumber(value) } : item))} />
              <EditableField label="Receipt number" value={event.receiptNumber ?? ""} onChange={(value) => setDraftEvents((current) => current.map((item) => item.id === event.id ? { ...item, receiptNumber: value } : item))} />
              <EditableField label="Scale ticket" value={event.scaleTicketNumber ?? ""} onChange={(value) => setDraftEvents((current) => current.map((item) => item.id === event.id ? { ...item, scaleTicketNumber: value } : item))} />
              <div className="md:col-span-2">
                <TextAreaField label="Notes" value={event.notes ?? ""} onChange={(value) => setDraftEvents((current) => current.map((item) => item.id === event.id ? { ...item, notes: value } : item))} />
              </div>
            </div>
          </div>
        ))}
        {draftEvents.length === 0 && <p className="text-sm text-muted-foreground">No disposal trips planned.</p>}
      </div>
      <Button className="mt-4" onClick={() => void save()}>Save Disposal Plan</Button>
    </div>
  );
}

function LocationRepairPanel({ job, locationStatus, onSaved }: { job: Job; locationStatus: ReturnType<typeof primaryServiceLocationStatus> | null; onSaved: () => void }) {
  const [working, setWorking] = useState(false);
  if (!locationStatus) return null;

  const geocode = async () => {
    if (!window.google?.maps) {
      toast.error("Google Maps is not loaded yet.");
      return;
    }
    if (locationStatus.coords && !window.confirm("This service location already has coordinates. Re-geocode and overwrite them?")) return;
    setWorking(true);
    try {
      const geocoder = new google.maps.Geocoder();
      const response = await geocoder.geocode({ address: locationStatus.address });
      const location = response.results[0]?.geometry.location;
      if (!location) {
        toast.error("No geocode result");
        return;
      }
      const coords = { lat: location.lat(), lng: location.lng() };
      await saveServiceStopCoordinates({ jobId: job.id, stopId: locationStatus.primaryStop?.id, latitude: coords.lat, longitude: coords.lng });
      const cache = readLocationCache();
      cache[locationStatus.cacheKey] = { address: locationStatus.address, coords, updatedAt: new Date().toISOString() };
      writeLocationCache(cache);
      toast.success("Service location mapped");
      onSaved();
    } catch (error) {
      const status = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "UNKNOWN_ERROR";
      const reason = geocodeStatusToReason(status);
      const cache = readLocationCache();
      cache[locationStatus.cacheKey] = { address: locationStatus.address, reason, updatedAt: new Date().toISOString() };
      writeLocationCache(cache);
      console.warn("[job-detail] Geocode failed", locationStatus.address, status, error);
      toast.error(reasonLabel(reason));
    } finally {
      setWorking(false);
    }
  };

  const clear = async () => {
    if (!window.confirm("Clear saved coordinates for this service location?")) return;
    await saveServiceStopCoordinates({ jobId: job.id, stopId: locationStatus.primaryStop?.id, clear: true });
    const cache = readLocationCache();
    delete cache[locationStatus.cacheKey];
    writeLocationCache(cache);
    toast.success("Coordinates cleared");
    onSaved();
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 font-semibold">Service location mapping</div>
      <div className="grid gap-2 text-sm md:grid-cols-2">
        <DetailRow label="Address status" value={locationStatus.coords ? "Mapped" : reasonLabel(locationStatus.reason)} />
        <DetailRow label="Latitude" value={locationStatus.coords ? locationStatus.coords.lat.toFixed(6) : "Not set"} />
        <DetailRow label="Longitude" value={locationStatus.coords ? locationStatus.coords.lng.toFixed(6) : "Not set"} />
        <DetailRow label="Source" value={locationStatus.primaryStop ? "Primary service location" : "Job address fallback"} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void geocode()} disabled={working || !locationStatus.address}>
          {working ? "Geocoding..." : locationStatus.coords ? "Re-geocode" : "Geocode"}
        </Button>
        <Button variant="outline" onClick={() => void clear()} disabled={!locationStatus.coords}>Clear coordinates</Button>
      </div>
    </div>
  );
}

function StopsItemsEditor({ jobId, stops, items, disposalEvents: currentDisposalEvents, onSaved }: { jobId: string; stops: JobStop[]; items: JobItem[]; disposalEvents: JobDisposalEvent[]; onSaved: () => void }) {
  const [draftStops, setDraftStops] = useState(stops);
  const [draftItems, setDraftItems] = useState(items);

  useEffect(() => setDraftStops(stops), [stops]);
  useEffect(() => setDraftItems(items), [items]);

  const save = async () => {
    await saveDispatchOperationalPlan(jobId, { stops: draftStops, items: draftItems, disposalEvents: currentDisposalEvents, activityMessage: "Dispatch updated service locations and item checklist." });
    toast.success("Service locations and items updated");
    onSaved();
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 font-semibold">Service locations and items</div>
      <div className="space-y-3">
        {draftStops.map((stop, index) => (
          <div key={stop.id} className="rounded-md bg-muted/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Service location {index + 1}</span>
              <Button variant="outline" size="sm" disabled={draftStops.length === 1} onClick={() => setDraftStops((current) => current.filter((item) => item.id !== stop.id))}>Remove</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <EditableField label="Name" value={stop.name} onChange={(value) => setDraftStops((current) => current.map((item) => item.id === stop.id ? { ...item, name: value } : item))} />
              <EditableField label="Address" value={stop.address ?? ""} onChange={(value) => setDraftStops((current) => current.map((item) => item.id === stop.id ? { ...item, address: value } : item))} />
              <div className="md:col-span-2">
                <TextAreaField label="Instructions" value={stop.instructions ?? ""} onChange={(value) => setDraftStops((current) => current.map((item) => item.id === stop.id ? { ...item, instructions: value } : item))} />
              </div>
            </div>
          </div>
        ))}
        <Button variant="outline" onClick={() => {
          const now = new Date().toISOString();
          setDraftStops((current) => [...current, { id: `stop-${Date.now()}`, jobId, stopOrder: current.length + 1, stopType: "service", name: `Stop ${current.length + 1}`, state: "AZ", status: "pending", createdAt: now, updatedAt: now }]);
        }}>
          Add Stop
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        {draftItems.map((item) => (
          <div key={item.id} className="grid gap-3 rounded-md bg-muted/40 p-3 md:grid-cols-[1fr_100px_auto]">
            <EditableField label="Item" value={item.name} onChange={(value) => setDraftItems((current) => current.map((draft) => draft.id === item.id ? { ...draft, name: value } : draft))} />
            <EditableField label="Qty" type="number" value={String(item.quantity)} onChange={(value) => setDraftItems((current) => current.map((draft) => draft.id === item.id ? { ...draft, quantity: Number(value || 1) } : draft))} />
            <Button variant="outline" className="self-end" onClick={() => setDraftItems((current) => current.filter((draft) => draft.id !== item.id))}>Remove</Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => {
          const now = new Date().toISOString();
          setDraftItems((current) => [...current, { id: `item-${Date.now()}`, jobId, stopId: draftStops[0]?.id, name: "New item", quantity: 1, oversized: false, fragile: false, heavy: false, disassemblyRequired: false, reassemblyRequired: false, status: "pending", createdAt: now, updatedAt: now }]);
        }}>
          Add Item
        </Button>
      </div>
      <Button className="mt-4" onClick={() => void save()}>Save Service Locations and Items</Button>
    </div>
  );
}

function ExceptionResolutionPanel({ issues, onResolved }: { issues: JobIssue[]; onResolved: () => void }) {
  const unresolved = issues.filter((issue) => issue.issueStatus !== "resolved" || !issue.resolvedAt);
  if (issues.length === 0) {
    return <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No driver exceptions submitted.</div>;
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 font-semibold">Exception queue</div>
      <div className="space-y-3">
        {unresolved.map((issue) => (
          <IssueResolutionRow key={issue.id} issue={issue} onResolved={onResolved} />
        ))}
        {unresolved.length === 0 && <p className="text-sm text-muted-foreground">All issues resolved.</p>}
      </div>
    </div>
  );
}

function IssueResolutionRow({ issue, onResolved }: { issue: JobIssue; onResolved: () => void }) {
  const [issueStatus, setIssueStatus] = useState<JobIssueStatus>(issue.issueStatus ?? "dispatch_reviewing");
  const [resolutionType, setResolutionType] = useState<JobIssueResolutionType>("proceed");
  const [dispatchInstructions, setDispatchInstructions] = useState(issue.dispatchInstructions ?? "");
  const [releaseDriver, setReleaseDriver] = useState(false);

  const resolve = async () => {
    if (["skip_stop", "reschedule", "cancel_job", "unable_to_service"].includes(resolutionType) && !dispatchInstructions.trim()) {
      toast.error("A resolution note is required for this action");
      return;
    }
    await dispatchResolveIssue(issue, { issueStatus, resolutionType, dispatchInstructions, dispatchResponse: dispatchInstructions, releaseDriver });
    toast.success("Dispatch resolution recorded");
    onResolved();
  };

  return (
    <div className="rounded-md bg-muted/40 p-3 text-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="font-semibold">{issue.issueType.replaceAll("_", " ")} · {issue.severity}</div>
          <p className="mt-1 text-muted-foreground">{issue.description}</p>
          {issue.driverCalledDispatchAt && <Badge className="mt-2 bg-green-100 text-green-700">Driver called dispatch</Badge>}
        </div>
        <Badge variant="outline">{(issue.issueStatus ?? "awaiting_dispatch").replaceAll("_", " ")}</Badge>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <SelectLite
          label="Issue status"
          value={issueStatus}
          onChange={(value) => setIssueStatus(value as JobIssueStatus)}
          options={["dispatch_reviewing", "contacting_customer", "waiting_on_customer", "instructions_sent", "resolved"].map((value) => ({ value, label: value.replaceAll("_", " ") }))}
        />
        <SelectLite
          label="Resolution"
          value={resolutionType}
          onChange={(value) => setResolutionType(value as JobIssueResolutionType)}
          options={["proceed", "wait", "return_later", "reschedule", "skip_stop", "cancel_job", "unable_to_service", "other"].map((value) => ({ value, label: value.replaceAll("_", " ") }))}
        />
        <div className="md:col-span-2">
          <TextAreaField label="Dispatch instructions / resolution note" value={dispatchInstructions} onChange={setDispatchInstructions} />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={releaseDriver} onChange={(event) => setReleaseDriver(event.target.checked)} />
          Release driver from location
        </label>
      </div>
      <Button className="mt-3" onClick={() => void resolve()}>Record Resolution</Button>
    </div>
  );
}

function SelectLite({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MiniStat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 break-words text-lg font-bold ${strong ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function RouteCostCard({
  title,
  comparison,
  fallbackName,
}: {
  title: string;
  comparison?: NonNullable<ReturnType<typeof buildBestRecommendation>["recommendation"]>["facilityComparison"];
  fallbackName: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className="font-semibold">{comparison?.facilityName ?? fallbackName}</div>
        </div>
        {comparison?.acceptedMaterial ? <Badge className="bg-green-100 text-green-700">Accepts</Badge> : <Badge className="bg-amber-100 text-amber-800">Check material</Badge>}
      </div>
      <div className="mt-3 grid gap-2">
        <DetailRow label="Round trip" value={miles(comparison?.roundTripMiles)} />
        <DetailRow label="Drive time" value={minutes(comparison?.estimatedDriveMinutes)} />
        <DetailRow label="Disposal" value={money(comparison?.disposalCost)} />
        <DetailRow label="Fuel" value={money(comparison?.fuelCost)} />
        <DetailRow label="Vehicle miles" value={money(comparison?.vehicleCost)} />
        <DetailRow label="Total" value={money(comparison?.totalOperationalCost)} />
      </div>
    </div>
  );
}

function VehicleCostCard({
  title,
  comparison,
  fallbackName,
}: {
  title: string;
  comparison?: NonNullable<ReturnType<typeof buildBestRecommendation>["recommendation"]>["vehicleComparison"];
  fallbackName: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className="font-semibold">{comparison?.vehicleName ?? fallbackName}</div>
        </div>
        {comparison?.payloadWarning ? <Badge className="bg-amber-100 text-amber-800">{comparison.payloadWarning}</Badge> : <Badge className="bg-green-100 text-green-700">Payload ok</Badge>}
      </div>
      <div className="mt-3 grid gap-2">
        <DetailRow label="Capacity" value={`${comparison?.cubicYardCapacity ?? 0} yd3 / ${(comparison?.payloadCapacityLbs ?? 0).toLocaleString()} lb`} />
        <DetailRow label="Trips" value={String(comparison?.tripsRequired ?? "—")} />
        {comparison?.handlingClass === "heavy_lowboy" && <DetailRow label="Service" value={comparison.recommendedService ?? "manual review"} />}
        {comparison?.includedTons != null && <DetailRow label="Included tons" value={comparison.includedTons.toFixed(2)} />}
        {comparison?.extraTons != null && <DetailRow label="Extra tons" value={comparison.extraTons.toFixed(2)} />}
        {comparison?.extraTonCost != null && <DetailRow label="Extra ton cost" value={money(comparison.extraTonCost)} />}
        <DetailRow label="MPG / mile cost" value={`${comparison?.mpg ?? 0} mpg / ${money(comparison?.operatingCostPerMile)}`} />
        <DetailRow label="Fuel" value={money(comparison?.fuelCost)} />
        <DetailRow label="Vehicle miles" value={money(comparison?.vehicleCost)} />
        <DetailRow label="Disposal" value={money(comparison?.disposalCost)} />
        <DetailRow label="Total cost" value={money(comparison?.totalOperationalCost)} />
        <DetailRow label="Estimated profit" value={money(comparison?.estimatedProfit)} />
      </div>
    </div>
  );
}

function VarianceStat({ label, value, formatter }: { label: string; value: number; formatter: (value: number) => string }) {
  const positive = value >= 0;

  return (
    <div className={`rounded-lg border p-3 ${positive ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
      <div className={`text-xs font-medium uppercase tracking-wide ${positive ? "text-green-700" : "text-amber-800"}`}>{label}</div>
      <div className={`mt-1 text-lg font-bold ${positive ? "text-green-700" : "text-amber-800"}`}>
        {positive && value !== 0 ? "+" : ""}
        {formatter(value)}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}
