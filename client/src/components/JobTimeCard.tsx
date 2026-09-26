import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadJobTime, setJobTime, type JobTime, type JobTimeEvent } from "@/lib/jobTime";

// Owner-only: the crew's taps for this job, time on job, labor hours, and a logged
// correction for a missed or wrong Start / Finish tap (DRIVER_TIME_TRACKING_SPEC).

const PHOENIX = "America/Phoenix";

function clock(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { timeZone: PHOENIX, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function duration(minutes: number | null) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

/** Phoenix wall-clock value for a datetime-local input (Arizona has no DST: UTC−7). */
function toPhoenixInput(iso: string | null) {
  const at = iso ? new Date(iso) : new Date();
  return new Date(at.getTime() - 7 * 3600_000).toISOString().slice(0, 16);
}

function fromPhoenixInput(value: string) {
  return new Date(`${value}:00-07:00`);
}

const kindLabels: Record<JobTimeEvent["kind"], string> = {
  start: "Start My Time",
  pause: "Pause",
  resume: "Resume",
  complete: "Complete",
  reminder: "Missed-start reminder sent",
};

function eventLine(event: JobTimeEvent) {
  if (event.source === "owner") {
    const what = event.kind === "start" ? "Start" : "Finish";
    return `${what} changed ${event.previousAt ? `from ${clock(event.previousAt)} ` : ""}to ${clock(event.at)} by ${event.staffEmail ?? "owner"}${event.note ? ` — "${event.note}"` : ""}`;
  }
  if (event.source === "system") return kindLabels[event.kind];
  return `${kindLabels[event.kind]} · ${event.employeeName ?? "crew"}`;
}

export function JobTimeCard({ jobId }: { jobId: string }) {
  const [time, setTime] = useState<JobTime | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<"start" | "complete" | null>(null);
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    loadJobTime(jobId)
      .then((next) => {
        setTime(next);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [jobId]);

  useEffect(() => {
    refresh();
    window.addEventListener("jobs-updated", refresh);
    // Keep a running job's clock moving.
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("jobs-updated", refresh);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const startEdit = (which: "start" | "complete") => {
    setEditing(which);
    setDraft(toPhoenixInput(which === "start" ? time?.startedAt ?? null : time?.completedAt ?? null));
    setReason("");
  };

  const save = async () => {
    if (!editing || !draft) return;
    setSaving(true);
    try {
      setTime(await setJobTime(jobId, editing, fromPhoenixInput(draft), reason));
      setEditing(null);
      toast.success(editing === "start" ? "Start time saved." : "Finish time saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the time.");
    } finally {
      setSaving(false);
    }
  };

  const running = Boolean(time?.startedAt && !time?.completedAt);
  const rows: Array<{ label: string; value: string; edit?: "start" | "complete" }> = [
    { label: "Started", value: clock(time?.startedAt ?? null), edit: "start" },
    { label: "Finished", value: running ? "Still working" : clock(time?.completedAt ?? null), edit: "complete" },
    { label: "Paused", value: time ? duration(time.pausedMinutes) : "—" },
    { label: running ? "Time on job so far" : "Time on job", value: duration(time?.onJobMinutes ?? null) },
    { label: "Crew", value: time ? `${time.crewSize} ${time.crewSize === 1 ? "person" : "people"}` : "—" },
    { label: "Labor hours", value: time?.laborHours != null ? `${Number(time.laborHours).toFixed(2)} h` : "—" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time on job</CardTitle>
        <CardDescription>From the crew's taps in the driver app. Fix a missed tap here; every change is logged.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-muted-foreground">Couldn't load the times: {error}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div key={row.label} className="rounded-md border border-border px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{row.label}</div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="font-display text-base font-semibold">{row.value}</span>
                {row.edit && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => startEdit(row.edit!)}>
                    Edit
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {editing && (
          <form
            className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="space-y-1.5">
              <Label>{editing === "start" ? "Start time" : "Finish time"} (Arizona)</Label>
              <Input type="datetime-local" value={draft} onChange={(event) => setDraft(event.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Why</Label>
              <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Dakota forgot to tap Start" />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                Save
              </Button>
            </div>
          </form>
        )}

        {time && time.events.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Log</div>
            <ul className="space-y-1 text-sm">
              {time.events.map((event, index) => (
                <li key={`${event.createdAt}-${index}`} className="flex gap-3">
                  <span className="w-32 shrink-0 text-muted-foreground">{clock(event.source === "owner" ? event.createdAt : event.at)}</span>
                  <span>{eventLine(event)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {time && time.events.length === 0 && <p className="text-sm text-muted-foreground">No taps yet.</p>}
      </CardContent>
    </Card>
  );
}
