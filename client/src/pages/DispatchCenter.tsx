import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, LocateFixed, MapPin, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import { JobStatusBadge } from "@/components/JobBadges";
import { MapView } from "@/components/Map";
import { OperationsShell } from "@/components/OperationsShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getDispatchOperationalCache, saveServiceStopCoordinates } from "@/lib/dispatchOperations";
import { getJobs } from "@/lib/jobStorage";
import { jobOperationalMetrics, openIssues, pluralize } from "@/lib/operationalMetrics";
import {
  geocodeStatusToReason,
  primaryServiceLocationStatus,
  readLocationCache,
  reasonLabel,
  writeLocationCache,
  type CachedLocation,
  type LocationStatus,
} from "@/lib/locationValidation";
import { cn } from "@/lib/utils";
import type { DriverJob, JobIssue } from "@/types/driver";
import type { Job } from "@/types/jobs";
import { toDriverJob } from "@/lib/driverStorage";

const PHOENIX = { lat: 33.4484, lng: -112.074 };
type DispatchRow = {
  job: Job;
  driverJob: DriverJob;
  location: LocationStatus;
};

function formatWindow(start?: string, end?: string) {
  const format = (value: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
  if (start && end) return `${format(start)}-${format(end)}`;
  if (start) return format(start);
  return "Unscheduled";
}

function sameDay(value: string | undefined, date: string) {
  if (!value) return false;
  return value.slice(0, 10) === date;
}

function markerColor(status: Job["status"], openIssueCount: number) {
  if (openIssueCount > 0 || status === "issue") return "#dc2626";
  if (status === "completed") return "#16a34a";
  if (status === "canceled") return "#64748b";
  if (status === "assigned" || status === "scheduled") return "#2563eb";
  if (status === "en_route" || status === "on_my_way") return "#0284c7";
  if (status === "arrived") return "#0891b2";
  if (status === "in_progress" || status === "loaded" || status === "dumping") return "#f97316";
  if (status === "delayed") return "#ca8a04";
  return "#7c3aed";
}

export default function DispatchCenter() {
  const [jobs, setJobs] = useState<Job[]>(() => getJobs());
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [geocoding, setGeocoding] = useState(false);
  const [locationCacheVersion, setLocationCacheVersion] = useState(0);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoWindow = useRef<google.maps.InfoWindow | null>(null);

  const refresh = () => setJobs(getJobs());

  useEffect(() => {
    window.addEventListener("jobs-updated", refresh);
    window.addEventListener("driver-data-updated", refresh);
    return () => {
      window.removeEventListener("jobs-updated", refresh);
      window.removeEventListener("driver-data-updated", refresh);
    };
  }, []);

  const rows = useMemo<DispatchRow[]>(() => {
    const coordCache = typeof window === "undefined" ? {} : readLocationCache();
    const normalized = query.trim().toLowerCase();
    return jobs
      .map((job) => {
        const driverJob = toDriverJob(job);
        const location = primaryServiceLocationStatus(job, driverJob, coordCache);
        return { job, driverJob, location };
      })
      .filter(({ job, driverJob, location }) => {
        const text = [job.jobNumber, job.customerName, job.serviceType, job.materialName, location.address, driverJob.assignedCrew.map((crew) => crew.displayName).join(" ")].join(" ").toLowerCase();
        if (normalized && !text.includes(normalized)) return false;
        if (statusFilter === "today") return sameDay(job.scheduledStart, selectedDate);
        if (statusFilter === "unassigned") return !job.assignment?.crewLead;
        if (statusFilter === "issues") return openIssues(driverJob.issues).length > 0 || job.status === "issue";
        if (statusFilter === "completed") return job.status === "completed";
        if (statusFilter === "active") return sameDay(job.scheduledStart, selectedDate) && !["completed", "canceled"].includes(job.status);
        return true;
      })
      .sort((a, b) => new Date(a.job.scheduledStart ?? a.job.updatedAt).getTime() - new Date(b.job.scheduledStart ?? b.job.updatedAt).getTime());
  }, [jobs, locationCacheVersion, query, selectedDate, statusFilter]);

  const exceptions = useMemo(() => {
    const cache = getDispatchOperationalCache();
    return cache.issues.filter((issue) => issue.requiresDispatchResponse && issue.issueStatus !== "resolved").map((issue) => ({
      issue,
      row: rows.find((row) => row.job.id === issue.jobId),
    })).filter((entry): entry is { issue: JobIssue; row: DispatchRow } => Boolean(entry.row));
  }, [rows]);

  const unmappedRows = rows.filter((row) => !row.location.coords);
  const geocodableRows = unmappedRows.filter((row) => row.location.address && row.location.reason === "not_attempted");

  const geocodeMissing = async () => {
    if (!window.google?.maps) {
      toast.error("Google Maps is not loaded yet.");
      return;
    }
    setGeocoding(true);
    const geocoder = new google.maps.Geocoder();
    const cache = readLocationCache();
    const result = { mapped: 0, incomplete: 0, failed: 0 };

    for (const row of unmappedRows) {
      if (!row.location.address || row.location.reason !== "not_attempted") {
        result.incomplete += 1;
        continue;
      }
      try {
        const response = await geocoder.geocode({ address: row.location.address });
        const location = response.results[0]?.geometry.location;
        if (!location) {
          cache[row.location.cacheKey] = failureCache(row.location.address, "geocode_no_results");
          result.failed += 1;
          continue;
        }
        const coords = { lat: location.lat(), lng: location.lng() };
        await saveServiceStopCoordinates({
          jobId: row.job.id,
          stopId: row.location.primaryStop?.id,
          latitude: coords.lat,
          longitude: coords.lng,
        });
        cache[row.location.cacheKey] = { address: row.location.address, coords, updatedAt: new Date().toISOString() };
        result.mapped += 1;
      } catch (error) {
        const status = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "UNKNOWN_ERROR";
        console.warn("[dispatch] Geocode failed", row.location.address, status, error);
        cache[row.location.cacheKey] = failureCache(row.location.address, geocodeStatusToReason(status));
        result.failed += 1;
      }
    }
    writeLocationCache(cache);
    setLocationCacheVersion((value) => value + 1);
    refresh();
    setGeocoding(false);
    toast.success(`${result.mapped} mapped · ${result.incomplete} incomplete · ${result.failed} failed`);
  };

  useEffect(() => {
    if (!map || !window.google?.maps?.marker) return;
    markers.current.forEach((marker) => {
      marker.map = null;
    });
    markers.current = [];
    infoWindow.current ??= new google.maps.InfoWindow();

    const bounds = new google.maps.LatLngBounds();
    rows.forEach((row) => {
      if (!row.location.coords) return;
      const metrics = jobOperationalMetrics(row.driverJob);
      const element = document.createElement("button");
      element.className = "flex size-9 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-lg";
      element.style.background = markerColor(row.job.status, metrics.openIssueCount);
      element.textContent = metrics.openIssueCount > 0 ? "!" : row.job.jobNumber.replace(/\D/g, "").slice(-2) || "J";
      const marker = new google.maps.marker.AdvancedMarkerElement({ map, position: row.location.coords, title: row.job.customerName, content: element });
      marker.addListener("click", () => openMarker(row, marker));
      markers.current.push(marker);
      bounds.extend(row.location.coords);
    });
    if (!bounds.isEmpty()) map.fitBounds(bounds, 64);
  }, [map, rows]);

  const openMarker = (row: DispatchRow, marker?: google.maps.marker.AdvancedMarkerElement) => {
    setSelectedJobId(row.job.id);
    if (row.location.coords) map?.panTo(row.location.coords);
    const metrics = jobOperationalMetrics(row.driverJob);
    if (marker && infoWindow.current) {
      infoWindow.current.setContent(`
        <div style="min-width:240px;font-family:system-ui,sans-serif">
          <strong>${row.job.jobNumber} · ${row.job.customerName}</strong>
          <div>${row.job.serviceType?.replaceAll("_", " ") || row.job.materialName || "Service"}</div>
          <div>${formatWindow(row.job.scheduledStart, row.job.scheduledEnd)}</div>
          <div>${row.location.address || reasonLabel(row.location.reason)}</div>
          <hr style="margin:8px 0" />
          <div>Crew: ${row.driverJob.assignedCrew.map((crew) => crew.displayName).join(", ") || "Unassigned"}</div>
          <div>Vehicle: ${row.job.vehicleName || row.job.assignment?.vehicleName || "TBD"}</div>
          <div>Status: ${row.job.status.replaceAll("_", " ")}</div>
          <div>${pluralize(metrics.customerStopCount, "service location")}</div>
          <div>${pluralize(metrics.disposalEventCount, "disposal trip")}</div>
          <div>${pluralize(metrics.openIssueCount, "open issue")}</div>
          <a href="/jobs/${row.job.id}" style="display:inline-block;margin-top:8px;color:#2563eb">Open Job</a>
        </div>
      `);
      infoWindow.current.open({ map, anchor: marker });
    }
  };

  const selected = rows.find((row) => row.job.id === selectedJobId);

  return (
    <OperationsShell title="Dispatch Center" eyebrow="Live operations">
      <div className="flex h-[calc(100vh-150px)] min-h-[720px] flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
          <Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="w-40" />
          <Button variant="outline" onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}>Today</Button>
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search jobs, drivers, addresses..." className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active today</SelectItem>
              <SelectItem value="today">All today</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="issues">Issues</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" disabled title="Future GPS layer">
            <LocateFixed className="size-4" />
            Show drivers
          </Button>
          <Button variant="outline" size="icon" onClick={refresh} aria-label="Refresh dispatch center">
            <RefreshCw className="size-4" />
          </Button>
        </div>
        {unmappedRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <div>
              {pluralize(unmappedRows.length, "unmapped service location")} · {pluralize(geocodableRows.length, "ready to geocode")}
            </div>
            <Button variant="outline" onClick={() => void geocodeMissing()} disabled={geocoding || geocodableRows.length === 0}>
              <MapPin className="size-4" />
              {geocoding ? "Geocoding..." : `Geocode ${geocodableRows.length} missing ${geocodableRows.length === 1 ? "location" : "locations"}`}
            </Button>
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="relative min-h-[460px] overflow-hidden rounded-lg border border-border bg-muted">
            <MapView className="h-full min-h-[460px]" initialCenter={PHOENIX} initialZoom={10} onMapReady={setMap} />
            <div className="absolute left-3 top-3 rounded-md bg-background/95 px-3 py-2 text-xs shadow">
              {rows.filter((row) => row.location.coords).length} mapped · {rows.filter((row) => !row.location.coords).length} unmapped
            </div>
            {rows.length === 0 && (
              <div className="absolute inset-x-4 bottom-4 rounded-lg border border-border bg-background/95 p-4 text-sm shadow">
                No jobs match this date and filter.
              </div>
            )}
            {rows.length > 0 && rows.every((row) => !row.location.coords) && (
              <div className="absolute inset-x-4 bottom-4 rounded-lg border border-border bg-background/95 p-4 text-sm shadow">
                Jobs are available, but their service locations have not been mapped yet.
              </div>
            )}
          </div>

          <aside className="min-h-0 space-y-3 overflow-y-auto">
            <Card className="border-red-200">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-bold"><AlertTriangle className="size-4 text-red-600" />Exceptions</h2>
                  <Badge className="bg-red-100 text-red-700">{exceptions.length}</Badge>
                </div>
                {exceptions.map(({ issue, row }) => (
                  <button key={issue.id} className="w-full rounded-md border border-border p-3 text-left text-sm hover:bg-muted" onClick={() => openMarker(row)}>
                    <div className="font-semibold">{row.job.customerName}</div>
                    <div className="text-muted-foreground">{issue.issueType.replaceAll("_", " ")} · {(issue.issueStatus ?? "awaiting_dispatch").replaceAll("_", " ")}</div>
                    <Button asChild size="sm" className="mt-2">
                      <Link href={`/jobs/${row.job.id}`}>Open resolution</Link>
                    </Button>
                  </button>
                ))}
                {exceptions.length === 0 && <p className="text-sm text-muted-foreground">No open blockers.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold">Workload</h2>
                  <Badge variant="secondary">{rows.length}</Badge>
                </div>
                {rows.map((row) => {
                  const metrics = jobOperationalMetrics(row.driverJob);
                  const active = selectedJobId === row.job.id;
                  return (
                    <button key={row.job.id} onClick={() => openMarker(row)} className={cn("w-full rounded-md border p-3 text-left text-sm transition-colors hover:bg-muted", active ? "border-primary bg-primary/5" : "border-border")}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">{formatWindow(row.job.scheduledStart, row.job.scheduledEnd)} · {row.job.customerName}</div>
                          <div className="text-muted-foreground">{row.job.serviceType?.replaceAll("_", " ") || row.job.materialName || "Service"}</div>
                        </div>
                        <JobStatusBadge status={row.job.status} />
                      </div>
                      <div className="mt-2 text-muted-foreground">
                        {row.driverJob.assignedCrew.map((crew) => crew.displayName).join(", ") || "Unassigned"} · {row.job.vehicleName || row.job.assignment?.vehicleName || "Vehicle TBD"}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline">{pluralize(metrics.customerStopCount, "service location")}</Badge>
                        <Badge variant="outline">{pluralize(metrics.disposalEventCount, "disposal trip")}</Badge>
                        {metrics.openIssueCount > 0 && <Badge className="bg-red-100 text-red-700">{pluralize(metrics.openIssueCount, "open issue")}</Badge>}
                        {!row.location.coords && <Badge className="bg-amber-100 text-amber-800">{reasonLabel(row.location.reason)}</Badge>}
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {selected && (
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Selected</div>
                    <div className="font-bold">{selected.job.jobNumber} · {selected.job.customerName}</div>
                  </div>
                  <Button asChild className="w-full">
                    <Link href={`/jobs/${selected.job.id}`}>Open Job</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </OperationsShell>
  );
}

function failureCache(address: string, reason: CachedLocation["reason"]): CachedLocation {
  return { address, reason, updatedAt: new Date().toISOString() };
}
