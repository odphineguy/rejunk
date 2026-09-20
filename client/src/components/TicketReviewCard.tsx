import { useMemo, useState } from "react";
import { CalendarDays, ExternalLink, MessageSquareText, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

import { ThumbtackConversationSheet } from "@/components/ThumbtackConversationSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { crewIsShort } from "@/lib/jobShape";
import { updateJob } from "@/lib/jobStorage";
import { cn } from "@/lib/utils";
import type { Job, JobExtractionField } from "@/types/jobs";

/** Plain-language names for the extractor's field paths. */
function fieldLabel(path: string): string {
  const stop = path.match(/^stops\[(\d+)\]\.(.+)$/);
  if (stop) {
    const index = Number(stop[1]);
    const where = index === 0 ? "Pickup" : index === 1 ? "Delivery" : `Stop ${index + 1}`;
    const names: Record<string, string> = {
      address: "address",
      unit: "unit",
      city: "city",
      zip: "zip",
      floor: "floor",
      flights: "flights of stairs",
      elevator: "elevator",
      gate_code: "gate code",
      parking_notes: "parking / truck",
      access_instructions: "access",
      contact_name: "contact",
      contact_phone: "contact phone",
    };
    return `${where} ${names[stop[2]] ?? stop[2]}`;
  }
  const flat: Record<string, string> = {
    "customer.name": "Customer",
    "customer.phone_real": "Phone",
    "customer.email": "Email",
    "service.type": "Service",
    "service.moving_kind": "Move type",
    "service.delivery_kind": "Delivery type",
    "service.package_or_rate_text": "What David quoted",
    "service.quoted_low": "Quote low",
    "service.quoted_high": "Quote high",
    "service.included_hours": "Included hours",
    "service.day_type": "Weekday / weekend",
    "service.crew_required": "Crew",
    "when.date": "Date",
    "when.window_start": "Arrival window start",
    "when.window_end": "Arrival window end",
    "when.day_part": "AM / PM",
    "when.flexible": "Flexible timing",
    items: "Items",
    payment_terms: "Payment terms",
    customer_said: "Crew summary",
    "specialty.piano": "Piano",
    "specialty.tvs_on_wall": "Wall-mounted TVs",
    "specialty.safe": "Safe",
    "specialty.third_party_pickup": "Third-party pickup",
    "specialty.play_structure": "Play structure",
  };
  return flat[path] ?? path;
}

const SOURCE_LABEL: Record<string, string> = {
  L: "Thumbtack request form",
  B: "booking record",
  H: "Housecall Pro appointment",
  V: "phone call",
};

function sourceLabel(field: JobExtractionField) {
  if (field.source.startsWith("M")) return "customer thread";
  return SOURCE_LABEL[field.source] ?? field.source;
}

/** Order the sources the way a dispatcher reads a ticket: who, what, when, where, items. */
const GROUP_ORDER = ["customer", "service", "when", "stops[0]", "stops[1]", "stops[2]", "items", "payment_terms", "specialty", "customer_said"];
function groupOf(path: string) {
  const stop = path.match(/^stops\[\d+\]/);
  if (stop) return stop[0];
  return path.split(".")[0];
}

/**
 * The review banner on a ticket the pipeline built from a Thumbtack thread
 * (BOOKING_TO_CREW_SPEC 1e). Shows what still needs a human, where every
 * field came from, and the two decisions: Book it or Reject.
 */
export function TicketReviewCard({ job, onChanged }: { job: Job; onChanged: () => void }) {
  const [, navigate] = useLocation();
  const [threadOpen, setThreadOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showSources, setShowSources] = useState(false);
  const extraction = job.extraction;
  const pending = job.status === "needs_review";

  const blockers = useMemo(() => {
    const list: string[] = [];
    if (!job.customerName?.trim() || job.customerName === "Unknown customer") list.push("a customer name");
    if (!job.stops?.[0]?.address?.trim()) list.push("the pickup / service address");
    if ((job.stops?.length ?? 0) > 1 && !job.stops?.[1]?.address?.trim()) list.push("the delivery address");
    if (!job.scheduledStart) list.push("a date and slot");
    const laborOnly = job.movingKind === "labor_only";
    if (!laborOnly && !job.vehicleId) list.push("a vehicle");
    if (crewIsShort(job)) list.push(`${(job.requiredCrew ?? 1) - (job.crew?.length ?? 0)} more on the crew`);
    return list;
  }, [job]);

  const sourceGroups = useMemo(() => {
    const fields = Object.entries(extraction?.fields ?? {});
    const groups = new Map<string, Array<[string, JobExtractionField]>>();
    for (const entry of fields) {
      const key = groupOf(entry[0]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a[0]);
      const ib = GROUP_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [extraction?.fields]);

  const highlightIds = useMemo(() => {
    const ids = new Set<string>();
    for (const field of Object.values(extraction?.fields ?? {})) if (field.sourceMessageId) ids.add(field.sourceMessageId);
    return ids;
  }, [extraction?.fields]);

  const lowConfidence = useMemo(
    () => Object.entries(extraction?.fields ?? {}).filter(([, field]) => field.confidence === "low").map(([path]) => fieldLabel(path)),
    [extraction?.fields],
  );

  const bookIt = () => {
    if (blockers.length) return;
    const updated = updateJob(job.id, { status: "scheduled" });
    if (!updated) return;
    toast.success("Booked. The crew can see it now.");
    onChanged();
  };

  const reject = () => {
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error("Say why, in a few words. It helps tune the extractor.");
      return;
    }
    const updated = updateJob(job.id, {
      status: "canceled",
      extraction: extraction ? { ...extraction, rejectedReason: reason, rejectedAt: new Date().toISOString() } : undefined,
      internalNotes: [job.internalNotes, `Rejected from the Thumbtack queue: ${reason}`].filter(Boolean).join("\n\n"),
    });
    if (!updated) return;
    toast.success("Ticket rejected");
    setRejecting(false);
    onChanged();
    navigate("/jobs");
  };

  const negotiationId = job.leadRef?.negotiationId ?? null;
  const attachments = extraction?.attachments ?? [];

  return (
    <Card className={cn(pending && "border-amber-300 bg-amber-50/40")}>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {pending ? "New from Thumbtack — check it, then book it" : "Built from the Thumbtack thread"}
              {extraction?.mode === "draft" && <Badge variant="outline">Draft</Badge>}
            </CardTitle>
            <CardDescription>
              {pending
                ? "Nothing reaches a driver until you click Book it. Fix anything below, assign crew and a vehicle, then book."
                : extraction?.rejectedReason
                  ? `Rejected: ${extraction.rejectedReason}`
                  : "Dispatch confirmed this ticket. The sources below show where each detail came from."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {negotiationId && (
              <Button variant="outline" size="sm" onClick={() => setThreadOpen(true)}>
                <MessageSquareText className="size-4" />
                Read the conversation
              </Button>
            )}
            {negotiationId && (
              <Button variant="ghost" size="sm" asChild>
                <a href={`https://www.thumbtack.com/pro-inbox/messenger/${negotiationId}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  Thumbtack
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!extraction && (
          <p className="text-sm text-muted-foreground">
            The extraction details aren't visible on this login. The owner can see where each field came from.
          </p>
        )}

        {extraction && (extraction.needsReview.length > 0 || lowConfidence.length > 0 || extraction.escalations.length > 0) && (
          <div className="grid gap-3 md:grid-cols-2">
            {(extraction.needsReview.length > 0 || lowConfidence.length > 0) && (
              <div className="rounded-lg border border-amber-200 bg-card p-4">
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-800">Needs a human</div>
                <ul className="space-y-1 text-sm">
                  {extraction.needsReview.map(item => (
                    <li key={item}>· {item}</li>
                  ))}
                  {lowConfidence.map(label => (
                    <li key={label}>· {label}: low confidence — check it against the thread</li>
                  ))}
                </ul>
              </div>
            )}
            {extraction.escalations.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">From the thread — decide</div>
                <ul className="space-y-1 text-sm">
                  {extraction.escalations.map(item => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {extraction?.customerSaid && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">For the crew</div>
            <p className="whitespace-pre-wrap text-sm">{extraction.customerSaid}</p>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="text-sm">
            <span className="font-medium">Customer photos on Thumbtack: </span>
            {attachments.map((file, index) => (
              <a key={`${file.messageId}-${index}`} href={file.url} target="_blank" rel="noreferrer" className="mr-3 underline underline-offset-2">
                {file.description || file.fileName}
              </a>
            ))}
            <span className="text-muted-foreground"> (open on Thumbtack — they can't be copied automatically)</span>
          </div>
        )}

        {extraction && sourceGroups.length > 0 && (
          <div>
            <button type="button" className="text-sm font-medium underline underline-offset-2" onClick={() => setShowSources(value => !value)}>
              {showSources ? "Hide where each detail came from" : "Show where each detail came from"}
            </button>
            {showSources && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {sourceGroups.map(([group, entries]) => (
                  <div key={group} className="rounded-lg border border-border bg-card p-3">
                    <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {group.startsWith("stops[0]") ? "Pickup / service location" : group.startsWith("stops[1]") ? "Delivery" : group === "customer" ? "Customer" : group === "service" ? "Service & quote" : group === "when" ? "When" : group === "items" ? "Items" : group === "payment_terms" ? "Payment" : group === "specialty" ? "Specialty" : "Summary"}
                    </div>
                    <dl className="space-y-2 text-sm">
                      {entries.map(([path, field]: [string, JobExtractionField]) => (
                        <div key={path}>
                          <dt className="flex flex-wrap items-center gap-2 font-medium">
                            {fieldLabel(path)}
                            <span className="text-xs font-normal text-muted-foreground">from the {sourceLabel(field)}</span>
                            {field.confidence !== "high" && (
                              <Badge variant="outline" className={cn("text-[10px]", field.confidence === "low" && "border-amber-300 text-amber-800")}>
                                {field.confidence} confidence
                              </Badge>
                            )}
                          </dt>
                          <dd className="text-muted-foreground">“{field.quote}”</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {pending && (
          <div className="flex flex-col gap-3 border-t border-border pt-4 md:flex-row md:items-start md:justify-between">
            <div className="text-sm text-muted-foreground">
              {blockers.length === 0 ? (
                "Everything the crew needs is on the ticket."
              ) : (
                <>
                  Before booking, add: {blockers.join(", ")}.
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={bookIt} disabled={blockers.length > 0} title={blockers.length ? `Still needs ${blockers.join(", ")}` : undefined}>
                <CalendarDays className="size-4" />
                Book it
              </Button>
              <Button variant="outline" onClick={() => setRejecting(value => !value)}>
                <XCircle className="size-4" />
                Reject
              </Button>
            </div>
          </div>
        )}

        {pending && rejecting && (
          <div className="space-y-2 rounded-lg border border-border bg-card p-4">
            <div className="text-sm font-medium">Why is this ticket wrong?</div>
            <Textarea
              value={rejectReason}
              onChange={event => setRejectReason(event.target.value)}
              placeholder="e.g. duplicate of J-1008 · customer canceled · wrong address pulled from an old message"
              rows={2}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={reject}>Reject ticket</Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Keep it</Button>
            </div>
          </div>
        )}
      </CardContent>

      <ThumbtackConversationSheet
        negotiationId={negotiationId}
        open={threadOpen}
        onClose={() => setThreadOpen(false)}
        title={job.customerName}
        description="Messages with a highlight were used to build this ticket."
        customerName={job.customerName}
        highlightMessageIds={highlightIds}
      />
    </Card>
  );
}
