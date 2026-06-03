import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, CalendarClock, CopyPlus, Receipt, Save, Trash2 } from "lucide-react";
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
import { deleteJob, duplicateJob, getActualFinancials, getJobs, saveJob, updateJob } from "@/lib/jobStorage";
import { loadPricingSettings } from "@/utils/pricingStorage";
import { getRouteEstimateToFacility } from "@/utils/distanceRouting";
import { buildBestRecommendation, recommendationInputFromJob } from "@/utils/recommendations";
import type { Job, JobStatus, PaymentStatus } from "@/types/jobs";
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
  const [routeEstimates, setRouteEstimates] = useState<Record<string, JobRouteEstimate>>(() =>
    routeEstimatesFromJob(getJobs().find((item) => item.id === params?.jobId) ?? null),
  );
  const savedSnapshotKey = useRef("");

  useEffect(() => {
    const refresh = () => setJob(getJobs().find((item) => item.id === params?.jobId) ?? null);
    window.addEventListener("jobs-updated", refresh);
    return () => window.removeEventListener("jobs-updated", refresh);
  }, [params?.jobId]);

  useEffect(() => {
    const refreshSettings = () => setSettings(loadPricingSettings());
    window.addEventListener("pricing-settings-updated", refreshSettings);
    return () => window.removeEventListener("pricing-settings-updated", refreshSettings);
  }, []);

  const actualFinancials = useMemo(() => (job ? getActualFinancials(job) : { charged: 0, cost: 0, profit: 0 }), [job]);
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
