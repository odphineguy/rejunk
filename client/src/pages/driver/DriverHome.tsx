import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, CheckCircle2, Clock, MapPinned, MessageSquare, Navigation, RefreshCw, UserRound, WifiOff } from "lucide-react";

import { JobStatusBadge } from "@/components/JobBadges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadDriverToday, formatDriverAddress } from "@/lib/driverStorage";
import { toDriverStatus } from "@/lib/jobStatus";
import { jobOperationalMetrics, pluralize } from "@/lib/operationalMetrics";
import type { DriverJob, DriverTodayData } from "@/types/driver";

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

function navigationUrl(job: DriverJob) {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(formatDriverAddress(job))}`;
}

function DriverJobCard({ job, active }: { job: DriverJob; active?: boolean }) {
  const metrics = jobOperationalMetrics(job);
  return (
    <Card className={active ? "border-primary shadow-sm" : "border-border/80"}>
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
            <MapPinned className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{formatDriverAddress(job)}</span>
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

  const refresh = async () => setToday(await loadDriverToday());

  useEffect(() => {
    void refresh();
    const updateOnline = () => setOnline(navigator.onLine);
    const updateData = () => void refresh();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener("jobs-updated", updateData);
    window.addEventListener("driver-data-updated", updateData);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("jobs-updated", updateData);
      window.removeEventListener("driver-data-updated", updateData);
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

  if (!today) {
    return <div className="min-h-dvh bg-background p-4 text-sm text-muted-foreground">Loading today...</div>;
  }

  return (
    <div className="min-h-dvh bg-muted/30 pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div>
            <div className="text-sm text-muted-foreground">Driver</div>
            <h1 className="text-2xl font-bold">Today</h1>
          </div>
          <Button variant="outline" size="icon" onClick={() => void refresh()} aria-label="Refresh jobs">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-4 py-5">
        <section className="rounded-lg border border-border bg-background p-4">
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
            <div className="rounded-md bg-muted p-2"><strong>{stats.total}</strong><br />Jobs</div>
            <div className="rounded-md bg-muted p-2"><strong>{stats.issues}</strong><br />Issues</div>
            <div className="rounded-md bg-muted p-2"><strong>{stats.completed}</strong><br />Done</div>
          </div>
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
          {today.upcomingJobs.length === 0 && <div className="rounded-lg border border-dashed bg-background p-5 text-center text-sm text-muted-foreground">No upcoming jobs assigned.</div>}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Completed today</h2>
          {today.completedJobs.map((job) => <DriverJobCard key={job.id} job={job} />)}
          {today.completedJobs.length === 0 && <div className="rounded-lg border border-dashed bg-background p-5 text-center text-sm text-muted-foreground">Nothing completed yet.</div>}
        </section>
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2 text-xs font-medium">
          <Link href="/driver" className="flex flex-col items-center gap-1 rounded-md bg-primary/10 py-2 text-primary"><CheckCircle2 className="size-5" />Today</Link>
          <Link href="/driver/messages" className="flex flex-col items-center gap-1 rounded-md py-2 text-muted-foreground"><MessageSquare className="size-5" />Messages</Link>
          <Link href="/driver/profile" className="flex flex-col items-center gap-1 rounded-md py-2 text-muted-foreground"><UserRound className="size-5" />Profile</Link>
        </div>
      </nav>
    </div>
  );
}
