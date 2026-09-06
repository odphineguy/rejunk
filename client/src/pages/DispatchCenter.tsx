import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ChevronDown,
  ChevronUp,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { animateMarkerTo, createDriverMarkerContent, MapView } from "@/components/Map";
import { OperationsShell } from "@/components/OperationsShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveServiceStopCoordinates } from "@/lib/dispatchOperations";
import {
  fetchLiveDriverSessions,
  isSessionLive,
  mapSessionRow,
} from "@/lib/driverActivation";
import { getEmployees, employeeName } from "@/lib/employeeStorage";
import { getJobs } from "@/lib/jobStorage";
import { profileColorHex } from "@/lib/profileColors";
import { ensureSession, supabase } from "@/lib/supabase";
import type { DriverSession } from "@/types/driver";
import {
  jobOperationalMetrics,
  openIssues,
  pluralize,
} from "@/lib/operationalMetrics";
import {
  geocodeStatusToReason,
  primaryServiceLocationStatus,
  readLocationCache,
  reasonLabel,
  writeLocationCache,
  type CachedLocation,
  type LocationStatus,
  type LocationUnavailableReason,
} from "@/lib/locationValidation";
import { cn } from "@/lib/utils";
import type { DriverJob } from "@/types/driver";
import type { Job } from "@/types/jobs";
import { toDriverJob } from "@/lib/driverStorage";

const PHOENIX = { lat: 33.4484, lng: -112.074 };
const AUTO_GEOCODE_BATCH_LIMIT = 3;
type DispatchRow = {
  job: Job;
  driverJob: DriverJob;
  location: LocationStatus;
};

function formatWindow(start?: string, end?: string) {
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  if (start && end) return `${format(start)}-${format(end)}`;
  if (start) return format(start);
  return "Unscheduled";
}

function sameDay(value: string | undefined, date: string) {
  if (!value) return false;
  return value.slice(0, 10) === date;
}

function agoShort(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function elapsedShort(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function markerColor(status: Job["status"], openIssueCount: number) {
  if (openIssueCount > 0 || status === "issue") return "#dc2626";
  if (status === "completed") return "#16a34a";
  if (status === "canceled") return "#64748b";
  if (status === "assigned" || status === "scheduled") return "#2563eb";
  if (status === "en_route" || status === "on_my_way") return "#0284c7";
  if (status === "arrived") return "#0891b2";
  if (status === "in_progress" || status === "loaded" || status === "dumping")
    return "#f97316";
  if (status === "paused") return "#71717a";
  if (status === "delayed") return "#ca8a04";
  return "#7c3aed";
}

export default function DispatchCenter() {
  const [jobs, setJobs] = useState<Job[]>(() => getJobs());
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [geocoding, setGeocoding] = useState(false);
  const [locationCacheVersion, setLocationCacheVersion] = useState(0);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showDrivers, setShowDrivers] = useState(false);
  const [driverSessions, setDriverSessions] = useState<DriverSession[]>([]);
  const [driversCollapsed, setDriversCollapsed] = useState(false);
  // Bumped every 30s while the GPS layer is on, so "last seen" labels and the
  // 5-minute offline fade stay honest between realtime events.
  const [staleTick, setStaleTick] = useState(0);
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const driverMarkers = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const infoWindow = useRef<google.maps.InfoWindow | null>(null);
  const autoGeocodeAttempted = useRef(false);

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
      .map(job => {
        const driverJob = toDriverJob(job);
        const location = primaryServiceLocationStatus(
          job,
          driverJob,
          coordCache
        );
        return { job, driverJob, location };
      })
      .filter(({ job, driverJob, location }) => {
        const text = [
          job.jobNumber,
          job.customerName,
          job.serviceType,
          job.materialName,
          location.address,
          driverJob.assignedCrew.map(crew => crew.displayName).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (normalized && !text.includes(normalized)) return false;
        if (statusFilter === "today")
          return sameDay(job.scheduledStart, selectedDate);
        if (statusFilter === "unassigned") return !job.assignment?.crewLead;
        if (statusFilter === "issues")
          return (
            openIssues(driverJob.issues).length > 0 || job.status === "issue"
          );
        if (statusFilter === "completed") return job.status === "completed";
        if (statusFilter === "active")
          return (
            sameDay(job.scheduledStart, selectedDate) &&
            !["completed", "canceled"].includes(job.status)
          );
        return true;
      })
      .sort(
        (a, b) =>
          new Date(a.job.scheduledStart ?? a.job.updatedAt).getTime() -
          new Date(b.job.scheduledStart ?? b.job.updatedAt).getTime()
      );
  }, [jobs, locationCacheVersion, query, selectedDate, statusFilter]);

  const unmappedRows = rows.filter(row => !row.location.coords);
  const autoGeocodableRows = unmappedRows.filter(row =>
    canAutoGeocode(row.location)
  );
  const manualGeocodableRows = unmappedRows.filter(row =>
    canManualGeocode(row.location)
  );

  const geocodeRows = async (
    targetRows: DispatchRow[],
    mode: "manual" | "auto"
  ) => {
    if (!window.google?.maps) {
      toast.error("Google Maps is not loaded yet.");
      return;
    }
    setGeocoding(true);
    const geocoder = new google.maps.Geocoder();
    const cache = readLocationCache();
    const result = { mapped: 0, incomplete: 0, failed: 0 };
    const attemptedCacheKeys = new Set<string>();

    try {
      for (const row of targetRows) {
        if (attemptedCacheKeys.has(row.location.cacheKey)) continue;
        if (
          mode === "auto"
            ? !canAutoGeocode(row.location)
            : !canManualGeocode(row.location)
        ) {
          result.incomplete += 1;
          continue;
        }
        attemptedCacheKeys.add(row.location.cacheKey);
        try {
          const response = await geocoder.geocode({
            address: row.location.address,
          });
          const location = response.results[0]?.geometry.location;
          if (!location) {
            cache[row.location.cacheKey] = failureCache(
              row.location.address,
              "geocode_no_results"
            );
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
          cache[row.location.cacheKey] = {
            address: row.location.address,
            coords,
            updatedAt: new Date().toISOString(),
          };
          result.mapped += 1;
        } catch (error) {
          const status =
            typeof error === "object" && error && "code" in error
              ? String((error as { code?: string }).code)
              : "UNKNOWN_ERROR";
          console.warn(
            "[dispatch] Geocode failed",
            row.location.address,
            status,
            error
          );
          cache[row.location.cacheKey] = failureCache(
            row.location.address,
            geocodeStatusToReason(status)
          );
          result.failed += 1;
        }
      }
    } finally {
      writeLocationCache(cache);
      setLocationCacheVersion(value => value + 1);
      refresh();
      setGeocoding(false);
    }

    return result;
  };

  const geocodeMissing = async () => {
    autoGeocodeAttempted.current = true;
    const result = await geocodeRows(unmappedRows, "manual");
    if (result)
      toast.success(
        `${result.mapped} mapped · ${result.incomplete} incomplete · ${result.failed} failed`
      );
  };

  useEffect(() => {
    if (
      autoGeocodeAttempted.current ||
      geocoding ||
      !map ||
      !window.google?.maps
    )
      return;
    const batch = autoGeocodableRows.slice(0, AUTO_GEOCODE_BATCH_LIMIT);
    if (batch.length === 0) return;

    autoGeocodeAttempted.current = true;
    void geocodeRows(batch, "auto").then(result => {
      if (!result || result.mapped + result.failed === 0) return;
      const summary = `${result.mapped} mapped · ${result.failed} failed`;
      if (result.mapped > 0) toast.success(`Auto-geocoded ${summary}`);
      else toast.error(`Auto-geocode failed · ${summary}`);
    });
  }, [autoGeocodableRows, geocoding, map]);

  useEffect(() => {
    if (!map || !window.google?.maps?.marker) return;
    markers.current.forEach(marker => {
      marker.map = null;
    });
    markers.current = [];
    infoWindow.current ??= new google.maps.InfoWindow();

    const bounds = new google.maps.LatLngBounds();
    rows.forEach(row => {
      if (!row.location.coords) return;
      const metrics = jobOperationalMetrics(row.driverJob);
      const element = document.createElement("button");
      element.className =
        "flex size-9 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-lg";
      element.style.background = markerColor(
        row.job.status,
        metrics.openIssueCount
      );
      element.textContent =
        metrics.openIssueCount > 0
          ? "!"
          : row.job.jobNumber.replace(/\D/g, "").slice(-2) || "J";
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: row.location.coords,
        title: row.job.customerName,
        content: element,
      });
      marker.addListener("click", () => openMarker(row, marker));
      markers.current.push(marker);
      bounds.extend(row.location.coords);
    });
    if (!bounds.isEmpty()) map.fitBounds(bounds, 64);
  }, [map, rows]);

  // ---------------------------------------------------------------------------
  // Live driver layer ("Show drivers" toggle)
  // ---------------------------------------------------------------------------

  const driverDetails = useMemo(() => {
    void staleTick; // staleness re-evaluation dependency
    const employees = getEmployees();
    return driverSessions.map(session => {
      const employee = employees.find(item => item.id === session.employeeId);
      const name = employee ? employeeName(employee) : session.displayName || "Driver";
      const online = isSessionLive(session);
      const job = rows.find(
        row =>
          !["completed", "canceled"].includes(row.job.status) &&
          row.driverJob.assignedCrew.some(
            crew => crew.displayName.toLowerCase() === name.toLowerCase()
          )
      );
      return {
        session,
        name,
        phone: employee?.phone,
        hex: profileColorHex(employee?.profileColor),
        online,
        job,
      };
    });
  }, [driverSessions, rows, staleTick]);

  type DriverDetail = (typeof driverDetails)[number];
  const driverDetailsRef = useRef<DriverDetail[]>([]);
  driverDetailsRef.current = driverDetails;

  // Fetch the live sessions + subscribe to realtime updates while the toggle is on.
  useEffect(() => {
    if (!showDrivers) {
      setDriverSessions([]);
      return;
    }
    let cancelled = false;
    void fetchLiveDriverSessions().then(sessions => {
      if (!cancelled) setDriverSessions(sessions);
    });
    const tick = window.setInterval(() => setStaleTick(value => value + 1), 30_000);

    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    if (supabase) {
      void ensureSession().then(ready => {
        if (!ready || cancelled || !supabase) return;
        channel = supabase
          .channel("dispatch-driver-sessions")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "driver_sessions" },
            payload => {
              const row = payload.new as { id?: string; has_token?: boolean } | null;
              if (!row?.id) return;
              const session = mapSessionRow(row as never);
              setDriverSessions(previous => {
                const others = previous.filter(
                  item => item.id !== session.id && item.employeeId !== session.employeeId
                );
                // A cleared token means dispatch revoked the session — drop the marker.
                return row.has_token === false ? others : [...others, session];
              });
            }
          )
          .subscribe();
      });
    }
    return () => {
      cancelled = true;
      window.clearInterval(tick);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [showDrivers]);

  const driverStatusText = (detail: DriverDetail) => {
    if (detail.session.downtimeStartedAt)
      return `vehicle down${detail.session.downtimeReason ? ` (${detail.session.downtimeReason.replaceAll("_", " ")})` : ""}`;
    if (detail.session.mealBreakStartedAt) return "on break";
    if (!detail.online) return "offline";
    if (!detail.job) return "idle";
    const status = detail.job.job.status;
    if (status.startsWith("en_route") || status === "on_my_way") return "en route";
    if (["arrived", "in_progress", "loaded", "dumping"].includes(status)) return "on job";
    if (status === "paused") return "paused";
    return "assigned";
  };

  const openDriverInfo = (
    detail: DriverDetail,
    marker?: google.maps.marker.AdvancedMarkerElement | null
  ) => {
    if (detail.session.lastLat != null && detail.session.lastLng != null) {
      map?.panTo({ lat: detail.session.lastLat, lng: detail.session.lastLng });
    }
    if (!marker || !infoWindow.current) return;
    const updated = detail.session.lastSeenAt
      ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(
          new Date(detail.session.lastSeenAt)
        )
      : "unknown";
    infoWindow.current.setContent(`
      <div style="min-width:220px;font-family:system-ui,sans-serif">
        <strong>${detail.name}${detail.online ? "" : " (offline)"}</strong>
        <div>${driverStatusText(detail)} · updated ${updated}</div>
        <div>${detail.phone ?? "No phone on file"}</div>
        <div>${detail.job ? `Job: ${detail.job.job.jobNumber} · ${detail.job.job.customerName}` : "No job assigned"}</div>
        <div style="margin-top:8px;display:flex;gap:12px">
          ${detail.phone ? `<a href="tel:${detail.phone}" style="color:#155e3f;font-weight:600">Call</a>` : ""}
          ${detail.phone ? `<a href="sms:${detail.phone}" style="color:#155e3f;font-weight:600">Message</a>` : ""}
          ${detail.job ? `<a href="/jobs/${detail.job.job.id}" style="color:#2563eb">Open Job</a>` : ""}
        </div>
      </div>
    `);
    infoWindow.current.open({ map, anchor: marker });
  };

  // Render/refresh driver markers; remove them all when the toggle goes off.
  useEffect(() => {
    if (!map || !window.google?.maps?.marker) return;
    if (!showDrivers) {
      driverMarkers.current.forEach(marker => {
        marker.map = null;
      });
      driverMarkers.current.clear();
      return;
    }
    infoWindow.current ??= new google.maps.InfoWindow();

    const seen = new Set<string>();
    driverDetails.forEach(detail => {
      const { session } = detail;
      if (session.lastLat == null || session.lastLng == null) return;
      seen.add(session.employeeId);
      const position = { lat: session.lastLat, lng: session.lastLng };
      const title = `${detail.name} · ${driverStatusText(detail)} · updated ${
        session.lastSeenAt ? agoShort(session.lastSeenAt) : "unknown"
      }`;
      const content = createDriverMarkerContent({
        hex: detail.hex,
        initial: detail.name.charAt(0).toUpperCase() || "D",
        online: detail.online,
        badge: session.downtimeStartedAt ? "downtime" : session.mealBreakStartedAt ? "meal_break" : undefined,
      });

      const existing = driverMarkers.current.get(session.employeeId);
      if (!existing) {
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position,
          title,
          content,
        });
        marker.addListener("click", () => {
          const latest = driverDetailsRef.current.find(
            item => item.session.employeeId === session.employeeId
          );
          if (latest) openDriverInfo(latest, marker);
        });
        driverMarkers.current.set(session.employeeId, marker);
      } else {
        existing.title = title;
        existing.content = content;
        animateMarkerTo(existing, position);
      }
    });
    driverMarkers.current.forEach((marker, employeeId) => {
      if (!seen.has(employeeId)) {
        marker.map = null;
        driverMarkers.current.delete(employeeId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, showDrivers, driverDetails]);

  const openMarker = (
    row: DispatchRow,
    marker?: google.maps.marker.AdvancedMarkerElement
  ) => {
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
          <div>Crew: ${row.driverJob.assignedCrew.map(crew => crew.displayName).join(", ") || "Unassigned"}</div>
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

  const selected = rows.find(row => row.job.id === selectedJobId);

  return (
    <OperationsShell title="Dispatch Center" icon={MapIcon}>
      <div className="flex h-[calc(100vh-150px)] min-h-[720px] flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
          <Input
            type="date"
            value={selectedDate}
            onChange={event => setSelectedDate(event.target.value)}
            className="w-40"
          />
          <Button
            variant="outline"
            onClick={() =>
              setSelectedDate(new Date().toISOString().slice(0, 10))
            }
          >
            Today
          </Button>
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search jobs, drivers, addresses..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active today</SelectItem>
              <SelectItem value="today">All today</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="issues">Issues</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={showDrivers ? "default" : "outline"}
            className={showDrivers ? "bg-[#155e3f] text-white hover:bg-[#0c4a30]" : undefined}
            onClick={() => setShowDrivers(value => !value)}
            title={showDrivers ? "Hide live driver locations" : "Show live driver locations"}
          >
            <LocateFixed className="size-4" />
            Show drivers
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={refresh}
            aria-label="Refresh dispatch center"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
        {unmappedRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <div>
              {pluralize(unmappedRows.length, "unmapped service location")} ·{" "}
              {pluralize(manualGeocodableRows.length, "ready to geocode")}
            </div>
            <Button
              variant="outline"
              onClick={() => void geocodeMissing()}
              disabled={geocoding || manualGeocodableRows.length === 0}
            >
              <MapPin className="size-4" />
              {geocoding
                ? "Geocoding..."
                : `Geocode ${manualGeocodableRows.length} missing ${manualGeocodableRows.length === 1 ? "location" : "locations"}`}
            </Button>
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="relative min-h-[460px] overflow-hidden rounded-lg border border-border bg-muted">
            <MapView
              className="h-full min-h-[460px]"
              initialCenter={PHOENIX}
              initialZoom={10}
              onMapReady={setMap}
            />
            <div className="absolute left-3 top-3 rounded-md bg-background/95 px-3 py-2 text-xs shadow">
              {rows.filter(row => row.location.coords).length} mapped ·{" "}
              {rows.filter(row => !row.location.coords).length} unmapped
            </div>
            {rows.length === 0 && (
              <div className="absolute inset-x-4 bottom-4 rounded-lg border border-border bg-background/95 p-4 text-sm shadow">
                No jobs match this date and filter.
              </div>
            )}
            {rows.length > 0 && rows.every(row => !row.location.coords) && (
              <div className="absolute inset-x-4 bottom-4 rounded-lg border border-border bg-background/95 p-4 text-sm shadow">
                Jobs are available, but their service locations have not been
                mapped yet.
              </div>
            )}
          </div>

          <aside className="min-h-0 space-y-3 overflow-y-auto">
            {showDrivers && (
              <Card>
                <CardContent className="space-y-2 p-4">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between"
                    onClick={() => setDriversCollapsed(value => !value)}
                  >
                    <span className="flex items-center gap-2 text-base font-semibold text-foreground">
                      <LocateFixed className="size-4 text-[#155e3f]" />
                      Drivers
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant="secondary">{driverDetails.length}</Badge>
                      {driversCollapsed ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronUp className="size-4 text-muted-foreground" />
                      )}
                    </span>
                  </button>
                  {!driversCollapsed &&
                    driverDetails.map(detail => (
                      <button
                        key={detail.session.id}
                        type="button"
                        onClick={() =>
                          openDriverInfo(
                            detail,
                            driverMarkers.current.get(detail.session.employeeId)
                          )
                        }
                        className="w-full rounded-md border border-border p-3 text-left text-sm transition-colors hover:bg-muted"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-2.5 rounded-full",
                              detail.online ? "bg-green-500" : "bg-gray-400"
                            )}
                          />
                          <span className="font-semibold">{detail.name}</span>
                          {!detail.online && (
                            <span className="text-xs text-muted-foreground">offline</span>
                          )}
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {detail.session.lastSeenAt
                            ? `Last seen ${agoShort(detail.session.lastSeenAt)}`
                            : "No location yet"}
                          {detail.job
                            ? ` · ${detail.job.job.customerName}`
                            : " · No job assigned"}
                        </div>
                        {detail.session.mealBreakStartedAt && (
                          <div className="mt-1 font-medium text-amber-700">
                            🍔 On break · {elapsedShort(detail.session.mealBreakStartedAt)}
                          </div>
                        )}
                        {detail.session.downtimeStartedAt && (
                          <div className="mt-1 font-medium text-red-700">
                            🔧 Vehicle down
                            {detail.session.downtimeReason
                              ? ` (${detail.session.downtimeReason.replaceAll("_", " ")})`
                              : ""}{" "}
                            · {elapsedShort(detail.session.downtimeStartedAt)}
                          </div>
                        )}
                      </button>
                    ))}
                  {!driversCollapsed && driverDetails.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No drivers online. Drivers appear here once they activate the
                      driver app and share location.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold text-foreground">Workload</div>
                  <Badge variant="secondary">{rows.length}</Badge>
                </div>
                {rows.map(row => {
                  const metrics = jobOperationalMetrics(row.driverJob);
                  const active = selectedJobId === row.job.id;
                  const crew =
                    row.driverJob.assignedCrew
                      .map(crew => crew.displayName)
                      .join(", ") || "Unassigned";
                  const warnings: string[] = [];
                  if (metrics.openIssueCount > 0)
                    warnings.push(
                      pluralize(metrics.openIssueCount, "open issue")
                    );
                  if (!row.location.coords)
                    warnings.push(reasonLabel(row.location.reason));
                  return (
                    <button
                      key={row.job.id}
                      onClick={() => openMarker(row)}
                      className={cn(
                        "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                        active ? "border-primary bg-primary/5" : "border-border"
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="min-w-0 truncate font-semibold">
                          {row.job.customerName}
                        </div>
                        <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                          {row.job.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <div className="truncate text-muted-foreground">
                        {row.location.address || "No address"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {crew}
                      </div>
                      {warnings.length > 0 && (
                        <div className="truncate text-xs font-medium text-foreground">
                          {warnings.join(" · ")}
                        </div>
                      )}
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {selected && (
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Selected
                    </div>
                    <div className="font-bold">
                      {selected.job.jobNumber} · {selected.job.customerName}
                    </div>
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

function canAutoGeocode(location: LocationStatus) {
  return Boolean(location.address && location.reason === "not_attempted");
}

function canManualGeocode(location: LocationStatus) {
  return Boolean(
    location.address &&
      !location.coords &&
      !nonGeocodableReasons.has(location.reason)
  );
}

const nonGeocodableReasons = new Set<LocationUnavailableReason | undefined>([
  undefined,
  "missing_street",
  "missing_city",
  "missing_state",
  "missing_zip",
  "incomplete_address",
  "coordinates_invalid",
]);

function failureCache(
  address: string,
  reason: CachedLocation["reason"]
): CachedLocation {
  return { address, reason, updatedAt: new Date().toISOString() };
}
