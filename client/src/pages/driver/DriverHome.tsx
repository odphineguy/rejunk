import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, Clock, MapPinned, Navigation, RefreshCw, Sandwich, UserRound, WifiOff, Wrench, X } from "lucide-react";
import { toast } from "sonner";

import { DriverBottomNav } from "@/components/DriverBottomNav";
import { JobStatusBadge } from "@/components/JobBadges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLocationPermissionState, isLocationReporting, startLocationReporting } from "@/lib/driverLocation";
import {
  DRIVER_WORKDAY_EVENT,
  endMealBreak,
  endVehicleDowntime,
  fetchWorkdayStatus,
  formatDriverAddress,
  getCachedWorkdayStatus,
  loadDriverToday,
  startMealBreak,
  startVehicleDowntime,
} from "@/lib/driverStorage";
import { toDriverStatus } from "@/lib/jobStatus";
import { jobOperationalMetrics, pluralize } from "@/lib/operationalMetrics";
import { loadPricingSettings } from "@/utils/pricingStorage";
import { cn } from "@/lib/utils";
import type { DriverJob, DriverTodayData, DriverWorkdayStatus, VehicleDowntimeReason } from "@/types/driver";

const DOWNTIME_REASONS: { value: VehicleDowntimeReason; label: string }[] = [
  { value: "mechanical", label: "Mechanical" },
  { value: "flat_tire", label: "Flat tire" },
  { value: "accident", label: "Accident" },
  { value: "other", label: "Other" },
];

function formatWindow(start?: string, end?: string) {
  const format = (value: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
  if (start && end) return `${format(start)}-${format(end)}`;
  if (start) return `After ${format(start)}`;
  return "Unscheduled";
}

function syncLabel(value?: string) {
  if (!value) return "Not synced yet";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function elapsedLabel(since?: string) {
  if (!since) return "";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function navigationUrl(job: DriverJob) {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(formatDriverAddress(job))}`;
}

function DriverJobCard({ job, active }: { job: DriverJob; active?: boolean }) {
  const metrics = jobOperationalMetrics(job);
  return (
    <Card className={active ? "border-primary shadow-sm" : "border-[#c8d1c0] bg-white shadow-sm"}>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Clock className="size-4" />
              {formatWindow(job.scheduledStart, job.scheduledEnd)}
            </div>
            <h2 className="mt-2 text-xl font-bold leading-tight">{job.customerName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{job.serviceType}</p>
          </div>
          <JobStatusBadge status={job.status} />
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex gap-2">
            <MapPinned className="mt-1 size-4 shrink-0 text-primary" />
            <span className="text-base font-medium">{formatDriverAddress(job)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-muted-foreground">
            <span>{pluralize(metrics.customerStopCount, "service location")}</span>
            <span>{pluralize(metrics.disposalEventCount, "disposal trip")}</span>
            <span>{job.vehicleName || "Vehicle TBD"}</span>
            <span className="col-span-2 truncate">{job.assignedCrew.map((crew) => crew.displayName).join(", ") || "Crew TBD"}</span>
          </div>
        </div>

        {job.instructionsChanged && (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertCircle className="size-4" />
            Instructions changed
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button asChild className="h-12">
            <Link href={`/driver/jobs/${job.id}`}>Open Job</Link>
          </Button>
          <Button asChild variant="outline" className="h-12 px-4" aria-label="Navigate">
            <a href={navigationUrl(job)}>
              <Navigation className="size-5" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DriverHome() {
  const [today, setToday] = useState<DriverTodayData | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [locationActive, setLocationActive] = useState(() => isLocationReporting());
  const [locationBannerDismissed, setLocationBannerDismissed] = useState(false);
  const [workday, setWorkday] = useState<DriverWorkdayStatus>(() => getCachedWorkdayStatus());
  const [downtimePromptOpen, setDowntimePromptOpen] = useState(false);
  const [downtimeVehicleId, setDowntimeVehicleId] = useState<string>("");
  const [downtimeReason, setDowntimeReason] = useState<VehicleDowntimeReason>("mechanical");
  const [, setClockTick] = useState(0);

  const vehicles = useMemo(() => loadPricingSettings().vehicles.filter((vehicle) => vehicle.isActive !== false), []);

  const refresh = async () => setToday(await loadDriverToday());

  useEffect(() => {
    void refresh();
    void fetchWorkdayStatus().then(setWorkday);
    const updateOnline = () => setOnline(navigator.onLine);
    const updateData = () => void refresh();
    const updateLocation = () => setLocationActive(isLocationReporting());
    const updateWorkday = () => setWorkday(getCachedWorkdayStatus());
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener("jobs-updated", updateData);
    window.addEventListener("driver-data-updated", updateData);
    window.addEventListener("driver-location-reporting-changed", updateLocation);
    window.addEventListener(DRIVER_WORKDAY_EVENT, updateWorkday);
    // Keeps the meal break / downtime elapsed labels honest.
    const tick = window.setInterval(() => setClockTick((value) => value + 1), 60_000);

    // Resume GPS reporting if the driver already granted permission during
    // activation (the prompt itself only ever shows on the activation flow).
    void getLocationPermissionState().then((state) => {
      if (state === "granted") void startLocationReporting();
    });

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("jobs-updated", updateData);
      window.removeEventListener("driver-data-updated", updateData);
      window.removeEventListener("driver-location-reporting-changed", updateLocation);
      window.removeEventListener(DRIVER_WORKDAY_EVENT, updateWorkday);
      window.clearInterval(tick);
    };
  }, []);

  const stats = useMemo(() => {
    const jobs = [today?.activeJob, ...(today?.upcomingJobs ?? []), ...(today?.completedJobs ?? [])].filter(Boolean) as DriverJob[];
    return {
      total: jobs.length,
      issues: jobs.filter((job) => toDriverStatus(job.status) === "issue" || job.issues.length > 0).length,
      completed: today?.completedJobs.length ?? 0,
    };
  }, [today]);

  const toggleMealBreak = async () => {
    try {
      const next = workday.mealBreakStartedAt ? await endMealBreak() : await startMealBreak();
      setWorkday(next);
    } catch {
      toast.error("Couldn't update your break right now.");
    }
  };

  const openDowntimePrompt = () => {
    setDowntimeVehicleId(today?.activeJob?.vehicleId ?? vehicles[0]?.id ?? "");
    setDowntimeReason("mechanical");
    setDowntimePromptOpen(true);
  };

  const beginDowntime = async () => {
    try {
      const next = await startVehicleDowntime(downtimeVehicleId || undefined, downtimeReason);
      setWorkday(next);
      setDowntimePromptOpen(false);
    } catch {
      toast.error("Couldn't report the downtime right now.");
    }
  };

  const finishDowntime = async () => {
    try {
      setWorkday(await endVehicleDowntime());
    } catch {
      toast.error("Couldn't update the downtime right now.");
    }
  };

  if (!today) {
    return <div className="min-h-dvh bg-background p-4 text-sm text-muted-foreground">Loading today...</div>;
  }

  return (
    <div className="min-h-dvh bg-[#f4f6f1] pb-24">
      <header className="sticky top-0 z-10 border-b border-[var(--pine-line)] bg-[#052a2b] px-4 py-3">
        <div className="mx-auto grid max-w-md grid-cols-[2.25rem_1fr_2.25rem] items-center">
          <span />
          <img src="/rejunk-mark.png" alt="Rejunk" className="mx-auto h-9 w-auto max-w-[280px]" />
          <Button
            variant="outline"
            size="icon"
            className="border-[var(--pine-line)] bg-white/5 text-[#cfe3d8] hover:bg-white/10 hover:text-white"
            onClick={() => void refresh()}
            aria-label="Refresh jobs"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-4 py-5">
        {locationActive && !locationBannerDismissed && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#155e3f]/30 bg-[#155e3f]/5 px-3 py-2 text-sm text-[#155e3f]">
            <span>📍 Location sharing active</span>
            <button type="button" onClick={() => setLocationBannerDismissed(true)} aria-label="Dismiss location banner">
              <X className="size-4" />
            </button>
          </div>
        )}

        <section className="rounded-lg border border-[#c8d1c0] bg-background p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="size-5" />
              </span>
              <div>
                <div className="font-semibold">{today.driver?.displayName || "Driver session"}</div>
                <div className="text-xs text-muted-foreground">Last sync {syncLabel(today.lastSyncedAt)}</div>
              </div>
            </div>
            {!online || today.fromCache ? (
              <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-900">
                <WifiOff className="size-3" />
                Offline
              </Badge>
            ) : (
              <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Online</Badge>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-md border border-[#d4dece] bg-[#f0f4ec] p-2"><span className="text-xl font-bold">{stats.total}</span><br />Jobs</div>
            <div className="rounded-md border border-[#d4dece] bg-[#f0f4ec] p-2"><span className="text-xl font-bold">{stats.issues}</span><br />Issues</div>
            <div className="rounded-md border border-[#d4dece] bg-[#f0f4ec] p-2"><span className="text-xl font-bold">{stats.completed}</span><br />Done</div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void toggleMealBreak()}
              className={cn(
                "flex h-[72px] flex-col items-center justify-center gap-1 rounded-lg border text-sm font-semibold transition-colors",
                workday.mealBreakStartedAt
                  ? "border-amber-300 bg-amber-100 text-amber-900"
                  : "border-[#c8d1c0] bg-white text-foreground shadow-sm hover:bg-muted",
              )}
            >
              <span className="flex items-center gap-1.5">
                {workday.mealBreakStartedAt ? <span aria-hidden>🍔</span> : <Sandwich className="size-5" />}
                {workday.mealBreakStartedAt ? "End Break" : "Meal Break"}
              </span>
              {workday.mealBreakStartedAt && (
                <span className="text-xs font-normal">On break · {elapsedLabel(workday.mealBreakStartedAt)}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => (workday.downtimeStartedAt ? void finishDowntime() : openDowntimePrompt())}
              className={cn(
                "flex h-[72px] flex-col items-center justify-center gap-1 rounded-lg border text-sm font-semibold transition-colors",
                workday.downtimeStartedAt
                  ? "border-red-300 bg-red-100 text-red-900"
                  : "border-[#c8d1c0] bg-white text-foreground shadow-sm hover:bg-muted",
              )}
            >
              <span className="flex items-center gap-1.5">
                <Wrench className="size-5" />
                {workday.downtimeStartedAt ? "End Downtime" : "Downtime"}
              </span>
              {workday.downtimeStartedAt && (
                <span className="text-xs font-normal">
                  Vehicle down · {elapsedLabel(workday.downtimeStartedAt)}
                </span>
              )}
            </button>
          </div>
          {downtimePromptOpen && !workday.downtimeStartedAt && (
            <div className="space-y-2 rounded-lg border border-[#c8d1c0] bg-white p-3 shadow-sm">
              <div className="text-sm font-semibold">Which vehicle is down?</div>
              <Select value={downtimeVehicleId} onValueChange={setDowntimeVehicleId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Pick a vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>{vehicle.vehicleName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={downtimeReason} onValueChange={(value) => setDowntimeReason(value as VehicleDowntimeReason)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOWNTIME_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>{reason.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" className="h-11" onClick={() => setDowntimePromptOpen(false)}>Cancel</Button>
                <Button className="h-11" onClick={() => void beginDowntime()}>Start Downtime</Button>
              </div>
            </div>
          )}
        </section>

        {today.activeJob && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">Active job</h2>
            <DriverJobCard job={today.activeJob} active />
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Upcoming jobs</h2>
          {today.upcomingJobs.map((job) => <DriverJobCard key={job.id} job={job} />)}
          {today.upcomingJobs.length === 0 && <div className="rounded-lg border border-dashed border-[#c8d1c0] bg-white p-5 text-center text-sm text-muted-foreground">No upcoming jobs assigned.</div>}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Completed today</h2>
          {today.completedJobs.map((job) => <DriverJobCard key={job.id} job={job} />)}
          {today.completedJobs.length === 0 && <div className="rounded-lg border border-dashed border-[#c8d1c0] bg-white p-5 text-center text-sm text-muted-foreground">Nothing completed yet.</div>}
        </section>
      </main>

      <DriverBottomNav active="today" />
    </div>
  );
}
