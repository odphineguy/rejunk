import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { AlertTriangle, ArrowLeft, Camera, MessageSquare, Navigation, Phone, Send, Upload } from "lucide-react";
import { toast } from "sonner";

import { JobStatusBadge } from "@/components/JobBadges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getThreadsFromCache } from "@/lib/dispatchMessageStorage";
import {
  formatDriverAddress,
  confirmDispatchCalled,
  getDriverJob,
  sendJobMessage,
  updateDisposalEventFacility,
  updateDriverJobStatus,
  updateItemStatus,
  updateStopStatus,
  uploadJobPhoto,
} from "@/lib/driverStorage";
import { toDriverStatus } from "@/lib/jobStatus";
import { customerStops, disposalEvents } from "@/lib/operationalMetrics";
import { loadPricingSettings } from "@/utils/pricingStorage";
import type { DriverJob, JobPhotoType, JobPhotoVisibility } from "@/types/driver";
import type { DriverJobStatus } from "@/types/jobs";

const photoTypes: JobPhotoType[] = ["before", "progress", "after", "damage", "issue", "receipt", "equipment", "other"];

function label(value: string) {
  return value.replaceAll("_", " ");
}

function formatWindow(start?: string, end?: string) {
  const format = (value: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
  if (start && end) return `${format(start)}-${format(end)}`;
  if (start) return `After ${format(start)}`;
  return "Unscheduled";
}

function time(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

/** Short scannable facility code: "27th Ave Transfer Station" → "27A", "Sky Harbor" → "SH". */
function facilityCode(name?: string) {
  if (!name) return "TBD";
  const numberMatch = name.match(/(\d{1,3})\s*(?:th|st|nd|rd)?\s*([A-Za-z])?/);
  if (numberMatch?.[1]) return `${numberMatch[1]}${(numberMatch[2] ?? "").toUpperCase()}`.slice(0, 3);
  const initials = name
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .map((word) => word[0].toUpperCase());
  return initials.slice(0, 3).join("") || name.slice(0, 3).toUpperCase();
}

/** 3-letter waste-stream code from the job's material category. */
const WASTE_STREAM_CODES: Record<string, string> = {
  household_junk: "MSW",
  furniture: "MSW",
  appliances: "APL",
  mattresses: "MAT",
  tires: "TIR",
  mixed_c_and_d: "CND",
  clean_concrete: "CON",
  clean_tile: "TIL",
  brick: "BRK",
  dirt: "DRT",
  rock: "RCK",
  sod: "GRN",
  stone: "STN",
  asphalt: "ASP",
  pavers: "PVR",
  heavy_clean_debris: "HVY",
  green_waste: "GRN",
  metal: "MTL",
  cardboard: "OCC",
  hazardous_excluded: "HAZ",
};

function wasteStreamCode(materialType?: string) {
  if (!materialType) return "MSW";
  return WASTE_STREAM_CODES[materialType] ?? (materialType.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "MSW");
}

type StripAction = { label: string; to: DriverJobStatus; variant?: "default" | "outline" };

/** The driver's whole flow: On My Way → Start My Time → Pause/Complete → Resume. */
function stripFor(status: DriverJobStatus): { actions: StripAction[]; info?: string } {
  switch (status) {
    case "assigned":
      return { actions: [{ label: "On My Way", to: "en_route" }] };
    case "en_route":
    case "arrived":
      return { actions: [{ label: "Start My Time", to: "in_progress" }] };
    case "in_progress":
    case "loaded":
    case "en_route_to_next_stop":
    case "en_route_to_disposal":
    case "dumping":
      return {
        actions: [
          { label: "Pause", to: "paused", variant: "outline" },
          { label: "Complete", to: "completed" },
        ],
      };
    case "paused":
      return { actions: [{ label: "Resume", to: "in_progress" }] };
    case "delayed":
      return { info: "This job is marked delayed.", actions: [{ label: "Back to Work", to: "in_progress" }] };
    case "issue":
      return { info: "An issue is open on this job.", actions: [{ label: "Back to Work", to: "in_progress" }] };
    default:
      return { actions: [] };
  }
}

export default function DriverJobDetail() {
  const [, params] = useRoute("/driver/jobs/:jobId");
  const [job, setJob] = useState<DriverJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [photoType, setPhotoType] = useState<JobPhotoType>("before");
  const [photoVisibility, setPhotoVisibility] = useState<JobPhotoVisibility>("internal");
  const [photoCaption, setPhotoCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [changingFacilityFor, setChangingFacilityFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const facilities = useMemo(() => loadPricingSettings().disposalFacilities.filter((facility) => facility.isActive), []);

  const refresh = async () => {
    if (!params?.jobId) return;
    setJob(await getDriverJob(params.jobId));
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    const update = () => void refresh();
    window.addEventListener("jobs-updated", update);
    window.addEventListener("driver-data-updated", update);
    return () => {
      window.removeEventListener("jobs-updated", update);
      window.removeEventListener("driver-data-updated", update);
    };
  }, [params?.jobId]);

  const status = toDriverStatus(job?.status);
  // The job's dispatch thread exists once the first message has been sent.
  const jobThreadId = job ? getThreadsFromCache().find((thread) => thread.jobId === job.id)?.id : undefined;
  const blockingIssue = useMemo(
    () => job?.issues.find((issue) => issue.requiresDispatchResponse && issue.issueStatus !== "resolved" && !issue.driverReleasedAt),
    [job?.issues],
  );
  const strip = useMemo(() => {
    const base = stripFor(status);
    // A blocking issue freezes the flow until dispatch releases the driver.
    return blockingIssue ? { ...base, actions: [] } : base;
  }, [status, blockingIssue]);

  const changeStatus = async (next: DriverJobStatus, buttonLabel: string) => {
    if (!job) return;
    try {
      await updateDriverJobStatus(job.id, next);
      toast.success(buttonLabel === "Complete" ? "Job completed" : `${buttonLabel} — got it`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Status update failed");
    }
  };

  const submitMessage = async () => {
    if (!job || !message.trim()) return;
    await sendJobMessage(job.id, message);
    setMessage("");
    toast.success("Message sent to dispatch");
    await refresh();
  };

  const changeFacility = async (eventId: string, facilityId: string) => {
    const event = job?.disposalEvents.find((item) => item.id === eventId);
    if (!event) return;
    try {
      await updateDisposalEventFacility(event, facilityId);
      toast.success("Disposal facility updated");
      setChangingFacilityFor(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Facility change failed");
    }
  };

  const handlePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!job || !file) return;
    setUploading(true);
    try {
      await uploadJobPhoto({ jobId: job.id, file, photoType, visibility: photoVisibility, caption: photoCaption });
      setPhotoCaption("");
      toast.success("Photo uploaded");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Photo upload failed");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  if (loading) return <div className="min-h-dvh bg-background p-4 text-sm text-muted-foreground">Loading job...</div>;
  if (!job) {
    return (
      <div className="min-h-dvh bg-background p-4">
        <Button asChild variant="outline">
          <Link href="/driver"><ArrowLeft className="size-4" />Today</Link>
        </Button>
        <p className="mt-6 text-muted-foreground">This job is not assigned to the current driver.</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-muted/30 pb-8">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back to today">
            <Link href="/driver"><ArrowLeft className="size-5" /></Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-muted-foreground">{job.jobNumber}</div>
            <h1 className="truncate text-lg font-bold">{job.customerName}</h1>
          </div>
          <JobStatusBadge status={job.status} />
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">{job.serviceType}</div>
              <div className="mt-1 text-xl font-bold">{formatWindow(job.scheduledStart, job.scheduledEnd)}</div>
              <div className="mt-2 text-sm">{formatDriverAddress(job)}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              <span>{job.vehicleName || "Vehicle TBD"}</span>
              <span>{job.assignedCrew.map((crew) => crew.displayName).join(", ") || "Crew TBD"}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button asChild variant="outline" className="h-12">
                <a href={`https://maps.apple.com/?daddr=${encodeURIComponent(formatDriverAddress(job))}`}>
                  <Navigation className="size-4" />Go
                </a>
              </Button>
              <Button asChild variant="outline" className="h-12">
                <a href={job.phone ? `tel:${job.phone}` : "#"} onClick={(event) => !job.phone && event.preventDefault()}>
                  <Phone className="size-4" />Call
                </a>
              </Button>
              <Button variant="outline" className="h-12" onClick={() => document.getElementById("message-dispatch")?.scrollIntoView({ behavior: "smooth" })}>
                <MessageSquare className="size-4" />Msg
              </Button>
            </div>
          </CardContent>
        </Card>

        {(blockingIssue || strip.actions.length > 0 || strip.info) && (
          <div className="space-y-3">
            {blockingIssue && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950">
                <div className="flex gap-2 font-bold">
                  <AlertTriangle className="size-5 shrink-0" />
                  Do not leave this location until dispatch releases you.
                </div>
                <p className="mt-2">{blockingIssue.dispatchInstructions || blockingIssue.dispatchResponse || "Awaiting dispatch instructions."}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <a href="tel:">
                      <Phone className="size-4" />
                      Call Dispatch
                    </a>
                  </Button>
                  <Button onClick={() => void confirmDispatchCalled(blockingIssue).then(refresh)}>Called Dispatch</Button>
                </div>
              </div>
            )}
            {!blockingIssue && strip.info && (
              <p className="px-1 text-sm text-muted-foreground">{strip.info}</p>
            )}
            {strip.actions.length > 0 && (
              <div className={strip.actions.length > 1 ? "grid grid-cols-2 gap-2" : ""}>
                {strip.actions.map((action) => (
                  <Button
                    key={action.to}
                    variant={action.variant ?? "default"}
                    className="h-14 w-full text-base"
                    onClick={() => void changeStatus(action.to, action.label)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        <Card>
          <CardHeader>
              <CardTitle className="text-base">Service Locations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            {customerStops(job.stops).map((stop) => (
              <div key={stop.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground">Service location {stop.stopOrder} · {label(stop.stopType)}</div>
                    <div className="mt-1 font-semibold">{stop.name}</div>
                    <div className="text-sm text-muted-foreground">{[stop.address, stop.city, stop.zip].filter(Boolean).join(", ")}</div>
                    {stop.instructions && <div className="mt-2 text-sm">{stop.instructions}</div>}
                  </div>
                  <Badge variant="outline">{label(stop.status)}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-11" onClick={() => void updateStopStatus(stop, "arrived").then(refresh)}>Arrived</Button>
                  <Button className="h-11" disabled={Boolean(blockingIssue)} onClick={() => void updateStopStatus(stop, "completed").then(refresh).catch((error) => toast.error(error instanceof Error ? error.message : "Stop update failed"))}>Complete</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {job.disposalEvents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Disposal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {disposalEvents(job.disposalEvents).map((event) => (
                <div key={event.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Disposal trip {event.sequenceNumber}</div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div>
                      <span className="text-muted-foreground">Facility: </span>
                      <span className="font-semibold">{facilityCode(event.facilityName)} · {event.facilityName || "Facility TBD"}</span>
                    </div>
                    {event.facilityAddress && <div className="text-muted-foreground">{event.facilityAddress}</div>}
                    <div>
                      <span className="text-muted-foreground">Waste stream: </span>
                      <span className="font-semibold">{wasteStreamCode(event.materialType)}</span>
                      {event.materialType && <span className="text-muted-foreground"> · {label(event.materialType)}</span>}
                    </div>
                  </div>
                  {changingFacilityFor === event.id ? (
                    <div className="mt-3 space-y-2">
                      <Select onValueChange={(facilityId) => void changeFacility(event.id, facilityId)}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Pick the new facility" /></SelectTrigger>
                        <SelectContent>
                          {facilities.map((facility) => (
                            <SelectItem key={facility.id} value={facility.id}>
                              {facilityCode(facility.facilityName)} · {facility.facilityName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" className="h-9 w-full" onClick={() => setChangingFacilityFor(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <Button variant="outline" className="mt-3 h-11 w-full" onClick={() => setChangingFacilityFor(event.id)}>
                      Change facility
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            {job.items.map((item) => (
              <label key={item.id} className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
                <Checkbox
                  checked={["loaded", "delivered", "completed"].includes(item.status)}
                  onCheckedChange={(checked) => void updateItemStatus(item, checked ? "loaded" : "pending").then(refresh)}
                  className="mt-1"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{item.quantity}x {item.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {[item.heavy && "heavy", item.oversized && "oversized", item.fragile && "fragile", item.disassemblyRequired && "disassembly"].filter(Boolean).join(", ") || "standard item"}
                  </span>
                  {item.instructions && <span className="mt-1 block text-sm">{item.instructions}</span>}
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        {(job.notes || job.internalNotes) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 text-sm">
              {job.notes && <p>{job.notes}</p>}
              {job.internalNotes && <p className="rounded-md bg-amber-50 p-3 text-amber-950">{job.internalNotes}</p>}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Photos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="grid grid-cols-2 gap-2">
              <Select value={photoType} onValueChange={(value) => setPhotoType(value as JobPhotoType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{photoTypes.map((type) => <SelectItem key={type} value={type}>{label(type)}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={photoVisibility} onValueChange={(value) => setPhotoVisibility(value as JobPhotoVisibility)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">internal</SelectItem>
                  <SelectItem value="customer_ready">customer ready</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input value={photoCaption} onChange={(event) => setPhotoCaption(event.target.value)} placeholder="Caption optional" />
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void handlePhoto(event)} />
            <Button className="h-12 w-full" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Upload className="size-4 animate-pulse" /> : <Camera className="size-4" />}
              {uploading ? "Uploading..." : "Capture or upload photo"}
            </Button>
            <div className="grid grid-cols-3 gap-2">
              {job.photos.map((photo) => (
                <a key={photo.id} href={photo.publicUrl || "#"} className="aspect-square overflow-hidden rounded-md border bg-muted" title={`${label(photo.photoType)} · ${time(photo.createdAt)}`}>
                  {photo.publicUrl ? <img src={photo.publicUrl} alt={photo.caption || label(photo.photoType)} className="h-full w-full object-cover" /> : <div className="p-2 text-xs">{label(photo.photoType)}</div>}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card id="message-dispatch">
          <CardHeader>
            <CardTitle className="text-base">Message Dispatch</CardTitle>
            <Link
              href={jobThreadId ? `/driver/messages?thread=${jobThreadId}` : "/driver/messages"}
              className="text-sm font-medium text-[#2d5016] hover:underline"
            >
              Open full conversation →
            </Link>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex gap-2">
              <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message dispatch" />
              <Button size="icon" onClick={() => void submitMessage()} aria-label="Send message"><Send className="size-4" /></Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
