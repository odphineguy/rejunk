import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, FileWarning, MessageSquare, Navigation, Phone, Send, Upload } from "lucide-react";
import { toast } from "sonner";

import { JobStatusBadge } from "@/components/JobBadges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatDriverAddress,
  confirmDispatchCalled,
  getDriverJob,
  reportJobIssue,
  sendJobMessage,
  updateDisposalEventStatus,
  updateDriverJobStatus,
  updateItemStatus,
  updateStopStatus,
  uploadJobPhoto,
} from "@/lib/driverStorage";
import { nextDriverStatuses, operationalStatusLabels, toDriverStatus } from "@/lib/jobStatus";
import { customerStops, disposalEvents } from "@/lib/operationalMetrics";
import type { DriverJob, JobIssueSeverity, JobIssueType, JobPhotoType, JobPhotoVisibility } from "@/types/driver";
import type { DriverJobStatus } from "@/types/jobs";

const issueTypes: JobIssueType[] = [
  "customer_not_home",
  "gate_locked",
  "access_blocked",
  "unable_to_locate",
  "customer_not_ready",
  "unsafe_to_service",
  "scope_dispute",
  "disposal_access_problem",
  "other_service_blocker",
  "access_problem",
  "additional_items",
  "item_not_listed",
  "heavy_item",
  "oversized_item",
  "damage",
  "vehicle_problem",
  "running_late",
  "disposal_problem",
  "unsafe_condition",
  "other",
];

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

export default function DriverJobDetail() {
  const [, params] = useRoute("/driver/jobs/:jobId");
  const [job, setJob] = useState<DriverJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [issueType, setIssueType] = useState<JobIssueType>("additional_items");
  const [issueSeverity, setIssueSeverity] = useState<JobIssueSeverity>("medium");
  const [issueDescription, setIssueDescription] = useState("");
  const [photoType, setPhotoType] = useState<JobPhotoType>("before");
  const [photoVisibility, setPhotoVisibility] = useState<JobPhotoVisibility>("internal");
  const [photoCaption, setPhotoCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const availableStatuses = useMemo(() => nextDriverStatuses(job?.status), [job?.status]);
  const blockingIssue = useMemo(
    () => job?.issues.find((issue) => issue.requiresDispatchResponse && issue.issueStatus !== "resolved" && !issue.driverReleasedAt),
    [job?.issues],
  );
  const primaryAction = useMemo(() => {
    if (!job || blockingIssue) return null;
    const status = toDriverStatus(job.status);
    const next = availableStatuses[0];
    if (!next) return null;
    const labels: Partial<Record<DriverJobStatus, string>> = {
      en_route: "Start Trip",
      arrived: "Arrived",
      in_progress: "Start Work",
      loaded: "Mark Loaded",
      en_route_to_next_stop: "Go to Next Stop",
      en_route_to_disposal: "Go to Disposal",
      dumping: "Begin Dumping",
      completed: status === "dumping" ? "Complete Disposal" : "Complete Job",
    };
    return { status: next, label: labels[next] ?? operationalStatusLabels[next] };
  }, [availableStatuses, blockingIssue, job]);

  const changeStatus = async (status: DriverJobStatus) => {
    if (!job) return;
    try {
      await updateDriverJobStatus(job.id, status);
      toast.success(`Status updated to ${operationalStatusLabels[status]}`);
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

  const submitIssue = async () => {
    if (!job || !issueDescription.trim()) {
      toast.error("Add a short issue description");
      return;
    }
    await reportJobIssue({
      jobId: job.id,
      issueType,
      severity: issueSeverity,
      description: issueDescription,
      requiresDispatchResponse: true,
    });
    setIssueDescription("");
    toast.success("Issue sent to dispatch");
    await refresh();
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next action</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
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
            {primaryAction ? (
              <Button className="h-14 w-full text-base" onClick={() => void changeStatus(primaryAction.status)}>
                {primaryAction.label}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">{toDriverStatus(job.status) === "completed" ? "This job is complete." : "Waiting for dispatch resolution."}</p>
            )}
            {!blockingIssue && (
              <div className="flex flex-wrap gap-2">
                {availableStatuses.filter((status) => status !== primaryAction?.status && status !== "canceled").map((status) => (
                  <Button key={status} variant={status === "issue" ? "destructive" : "outline"} className="h-11" onClick={() => void changeStatus(status)}>
                    {status === "issue" ? "Report Problem" : operationalStatusLabels[status]}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase text-muted-foreground">Disposal trip {event.sequenceNumber}</div>
                      <div className="mt-1 font-semibold">{event.facilityName || "Facility TBD"}</div>
                      {event.facilityAddress && <div className="text-sm text-muted-foreground">{event.facilityAddress}</div>}
                      {event.notes && <div className="mt-2 text-sm">{event.notes}</div>}
                    </div>
                    <Badge variant="outline">{label(event.status)}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-11" onClick={() => void updateDisposalEventStatus(event, "en_route").then(refresh)}>Route to Facility</Button>
                    <Button variant="outline" className="h-11" onClick={() => void updateDisposalEventStatus(event, "arrived").then(refresh)}>Arrived</Button>
                    <Button variant="outline" className="h-11" onClick={() => void updateDisposalEventStatus(event, "unloading").then(refresh)}>Begin Unloading</Button>
                    <Button className="h-11" onClick={() => void updateDisposalEventStatus(event, "completed").then(refresh)}>Complete Disposal</Button>
                    <Button variant="destructive" className="col-span-2 h-11" onClick={() => void updateDisposalEventStatus(event, "rejected").then(refresh)}>Report Facility Rejection</Button>
                  </div>
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FileWarning className="size-4" />Report issue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="grid grid-cols-2 gap-2">
              <Select value={issueType} onValueChange={(value) => setIssueType(value as JobIssueType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{issueTypes.map((type) => <SelectItem key={type} value={type}>{label(type)}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={issueSeverity} onValueChange={(value) => setIssueSeverity(value as JobIssueSeverity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">low</SelectItem>
                  <SelectItem value="medium">medium</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                  <SelectItem value="urgent">urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea value={issueDescription} onChange={(event) => setIssueDescription(event.target.value)} placeholder="What should dispatch know?" rows={3} />
            <Button className="h-12 w-full" variant="destructive" onClick={() => void submitIssue()}>Send Issue</Button>
            {job.issues.map((issue) => (
              <div key={issue.id} className="rounded-md border border-border bg-background p-3 text-sm">
                <div className="font-semibold">{label(issue.issueType)} · {issue.severity}</div>
                <div className="mt-1 text-muted-foreground">{issue.description}</div>
                {issue.addedScopeStatus && <Badge className="mt-2" variant="outline">{label(issue.addedScopeStatus)}</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card id="message-dispatch">
          <CardHeader>
            <CardTitle className="text-base">Dispatch activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="flex gap-2">
              <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message dispatch" />
              <Button size="icon" onClick={() => void submitMessage()} aria-label="Send message"><Send className="size-4" /></Button>
            </div>
            <div className="space-y-2">
              {job.activity.map((entry) => (
                <div key={entry.id} className="rounded-md bg-muted p-3 text-sm">
                  <div className="font-medium">{entry.message || label(entry.eventType)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{time(entry.createdAt)}</div>
                </div>
              ))}
              {job.activity.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
