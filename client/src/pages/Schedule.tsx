import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";

import {
  JobStatusBadge,
  JobWarningBadge,
  PaymentStatusBadge,
} from "@/components/JobBadges";
import { OperationsShell } from "@/components/OperationsShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getJobWarningsWithFacilityCheck } from "@/lib/jobIntelligence";
import { getJobs, updateJob } from "@/lib/jobStorage";
import {
  DAILY_SLOTS,
  DRAG_MIME,
  SLOTS_PER_DAY,
  getSlot,
  isJobMovable,
  jobSlotKey,
  moveJobToDay,
  moveJobToSlot,
  newJobHrefForSlot,
  type DailySlot,
  type SlotKey,
} from "@/lib/scheduleSlots";
import { cn } from "@/lib/utils";
import { loadPricingSettings } from "@/utils/pricingStorage";
import type { Job } from "@/types/jobs";

type ScheduleView = "day" | "week" | "month" | "agenda";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function money(value: number | undefined) {
  return currency.format(Number.isFinite(value) ? Number(value) : 0);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

/** Weeks run Sunday → Saturday. */
function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setDate(next.getDate() - next.getDay());
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfMonth(date: Date) {
  const next = new Date(date.getFullYear(), date.getMonth(), 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function weekLabel(days: Date[]) {
  const first = days[0];
  const last = days[6];
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    first
  );
  const lastMonth = new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    last
  );
  if (first.getMonth() === last.getMonth())
    return `${month} ${first.getDate()}-${last.getDate()}, ${first.getFullYear()}`;
  return `${month} ${first.getDate()}-${lastMonth} ${last.getDate()}, ${last.getFullYear()}`;
}

const dayHeaderFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const monthFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const agendaDayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
});

function monthWeeks(date: Date) {
  const first = startOfMonth(date);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const weeks: Date[][] = [];
  let cursor = startOfWeek(first);
  while (cursor <= last) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDays(cursor, index)));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

type Vehicles = ReturnType<typeof loadPricingSettings>["vehicles"];

interface DayBoard {
  bySlot: Record<SlotKey, Job[]>;
  unslotted: Job[];
  booked: number;
}

/** Sort a day's jobs into the four daily slots (plus a bucket for jobs that don't fit one). */
function buildDayBoard(jobs: Job[], day: Date, vehicles: Vehicles): DayBoard {
  const bySlot = Object.fromEntries(
    DAILY_SLOTS.map(slot => [slot.key, [] as Job[]])
  ) as Record<SlotKey, Job[]>;
  const unslotted: Job[] = [];
  for (const job of jobsForDay(jobs, day)) {
    if (job.status === "canceled") continue;
    const key = jobSlotKey(job, vehicles);
    if (key) bySlot[key].push(job);
    else unslotted.push(job);
  }
  const booked = DAILY_SLOTS.filter(slot => bySlot[slot.key].length > 0).length;
  return { bySlot, unslotted, booked };
}

type MoveJob = (jobId: string, day: Date, slot: DailySlot) => void;

function startJobDrag(event: DragEvent, job: Job) {
  event.dataTransfer.setData(DRAG_MIME, job.id);
  event.dataTransfer.setData("text/plain", job.customerName);
  event.dataTransfer.effectAllowed = "move";
}

function isJobDrag(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes(DRAG_MIME);
}

/** Shared drag-over / drop wiring for a drop target. */
function useDropTarget(onDrop: (jobId: string) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (event: DragEvent) => {
        if (!isJobDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      },
      onDragLeave: (event: DragEvent) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null))
          return;
        setOver(false);
      },
      onDrop: (event: DragEvent) => {
        if (!isJobDrag(event)) return;
        event.preventDefault();
        setOver(false);
        const jobId = event.dataTransfer.getData(DRAG_MIME);
        if (jobId) onDrop(jobId);
      },
    },
  };
}

function jobsForDay(jobs: Job[], day: Date) {
  return jobs
    .filter(
      job => job.scheduledStart && sameDay(new Date(job.scheduledStart), day)
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledStart!).getTime() -
        new Date(b.scheduledStart!).getTime()
    );
}

function upcomingGroups(jobs: Job[], from: Date) {
  const fromTime = startOfDay(from).getTime();
  const scheduled = jobs
    .filter(
      job =>
        job.scheduledStart &&
        startOfDay(new Date(job.scheduledStart)).getTime() >= fromTime
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledStart!).getTime() -
        new Date(b.scheduledStart!).getTime()
    );

  const groups: Array<{ key: string; day: Date; jobs: Job[] }> = [];
  for (const job of scheduled) {
    const day = startOfDay(new Date(job.scheduledStart!));
    const key = day.toISOString();
    const existing = groups.find(group => group.key === key);
    if (existing) existing.jobs.push(job);
    else groups.push({ key, day, jobs: [job] });
  }
  return groups;
}

export default function Schedule() {
  const [, navigate] = useLocation();
  const [jobs, setJobs] = useState<Job[]>(() => getJobs());
  const [settings, setSettings] = useState(() => loadPricingSettings());
  const [view, setView] = useState<ScheduleView>("week");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    const refresh = () => setJobs(getJobs());
    window.addEventListener("jobs-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("jobs-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    const refreshSettings = () => setSettings(loadPricingSettings());
    window.addEventListener("pricing-settings-updated", refreshSettings);
    return () =>
      window.removeEventListener("pricing-settings-updated", refreshSettings);
  }, []);

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        addDays(startOfWeek(cursor), index)
      ),
    [cursor]
  );
  const weeks = useMemo(() => monthWeeks(cursor), [cursor]);
  const agenda = useMemo(() => upcomingGroups(jobs, cursor), [jobs, cursor]);

  const moveJob: MoveJob = (jobId, day, slot) => {
    const job = jobs.find(candidate => candidate.id === jobId);
    if (!job) return;
    if (!isJobMovable(job)) {
      toast.error("Finished or canceled jobs can't be moved.");
      return;
    }
    const alreadyThere =
      job.scheduledStart &&
      sameDay(new Date(job.scheduledStart), day) &&
      jobSlotKey(job, settings.vehicles) === slot.key;
    if (alreadyThere) return;

    const occupied = buildDayBoard(jobs, day, settings.vehicles).bySlot[
      slot.key
    ].filter(other => other.id !== job.id);
    const updates = moveJobToSlot(job, day, slot, settings.vehicles);
    if (!updateJob(job.id, updates)) return;

    const where = `${slot.label} on ${agendaDayFmt.format(day)}`;
    if (occupied.length > 0) {
      toast.warning(
        `${job.customerName} moved to ${where} — that slot now has ${occupied.length + 1} jobs.`
      );
    } else {
      toast.success(`${job.customerName} moved to ${where}.`);
    }
  };

  const headerLabel =
    view === "day"
      ? dayHeaderFmt.format(cursor)
      : view === "week"
        ? weekLabel(weekDays)
        : view === "month"
          ? monthFmt.format(cursor)
          : "Upcoming jobs";

  const shift = (direction: 1 | -1) => {
    if (view === "day") setCursor(addDays(cursor, direction));
    else if (view === "month") setCursor(addMonths(cursor, direction));
    else setCursor(addDays(cursor, direction * 7));
  };

  const views: Array<{ key: ScheduleView; label: string }> = [
    { key: "day", label: "Day" },
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
    { key: "agenda", label: "Agenda" },
  ];

  return (
    <OperationsShell title="Schedule" icon={CalendarDays}>
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setCursor(startOfDay(new Date()))}
              >
                Today
              </Button>
              {view !== "agenda" && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => shift(-1)}
                    aria-label="Previous"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => shift(1)}
                    aria-label="Next"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </>
              )}
              <div className="ml-0 text-lg font-semibold md:ml-3">
                {headerLabel}
              </div>
            </div>
            <div className="inline-flex rounded-md border border-border">
              {views.map((option, index) => (
                <Button
                  key={option.key}
                  variant={view === option.key ? "default" : "ghost"}
                  onClick={() => setView(option.key)}
                  className={cn(
                    index === 0 && "rounded-r-none",
                    index === views.length - 1 && "rounded-l-none",
                    index > 0 && index < views.length - 1 && "rounded-none",
                    view !== option.key && "text-muted-foreground"
                  )}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {view === "day" && (
            <SlotBoard
              days={[cursor]}
              jobs={jobs}
              settings={settings}
              navigate={navigate}
              moveJob={moveJob}
            />
          )}
          {view === "week" && (
            <SlotBoard
              days={weekDays}
              jobs={jobs}
              settings={settings}
              navigate={navigate}
              moveJob={moveJob}
            />
          )}
          {view === "month" && (
            <MonthGrid
              weeks={weeks}
              month={cursor.getMonth()}
              jobs={jobs}
              settings={settings}
              moveJob={moveJob}
              onSelectDay={day => {
                setCursor(startOfDay(day));
                setView("day");
              }}
              navigate={navigate}
            />
          )}
          {view === "agenda" && (
            <Agenda groups={agenda} settings={settings} navigate={navigate} />
          )}
        </CardContent>
      </Card>
    </OperationsShell>
  );
}

function JobSlotCard({
  job,
  settings,
  navigate,
  tone = "default",
}: {
  job: Job;
  settings: ReturnType<typeof loadPricingSettings>;
  navigate: (to: string) => void;
  tone?: "default" | "warning";
}) {
  const warnings = getJobWarningsWithFacilityCheck(job, settings);
  const missingReceiptWarning = warnings.find(
    warning => warning.code === "missing_receipt"
  );
  const movable = isJobMovable(job);
  return (
    <button
      onClick={() => navigate(`/jobs/${job.id}`)}
      draggable={movable}
      onDragStart={event => startJobDrag(event, job)}
      title={movable ? "Drag to another slot or day" : undefined}
      className={cn(
        "w-full rounded-md border p-2 text-left shadow-sm transition-colors",
        movable && "cursor-grab active:cursor-grabbing",
        tone === "warning"
          ? "border-amber-400/60 bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
          : "border-primary/30 bg-primary/5 hover:bg-primary/10"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {job.customerName}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {[job.city, job.zip].filter(Boolean).join(" ") || "Phoenix area"}
          </div>
        </div>
        <div className="whitespace-nowrap text-xs font-semibold text-primary">
          {job.scheduledStart ? timeLabel(job.scheduledStart) : ""}
        </div>
      </div>
      <div className="mt-2 truncate text-xs">
        {job.materialName ||
          job.materialType?.replaceAll("_", " ") ||
          "Material not set"}
      </div>
      <div className="truncate text-xs text-muted-foreground">
        {job.vehicleName || job.assignment?.vehicleName || "No vehicle"}
      </div>
      <div className="mt-1 truncate text-xs font-semibold">
        {money(job.quotedAmount)} · {job.paymentStatus.replaceAll("_", " ")}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <JobStatusBadge status={job.status} />
        <PaymentStatusBadge status={job.paymentStatus} />
        {missingReceiptWarning && (
          <JobWarningBadge warning={missingReceiptWarning} />
        )}
      </div>
    </button>
  );
}

function SlotBoard({
  days,
  jobs,
  settings,
  navigate,
  moveJob,
}: {
  days: Date[];
  jobs: Job[];
  settings: ReturnType<typeof loadPricingSettings>;
  navigate: (to: string) => void;
  moveJob: MoveJob;
}) {
  const isSingleDay = days.length === 1;
  const columns = `120px repeat(${days.length}, minmax(${isSingleDay ? "0" : "150px"}, 1fr))`;
  const boards = days.map(day => buildDayBoard(jobs, day, settings.vehicles));
  const hasUnslotted = boards.some(board => board.unslotted.length > 0);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: isSingleDay ? undefined : 1180 }}>
        <div
          className="grid border-b border-border"
          style={{ gridTemplateColumns: columns }}
        >
          <div className="border-r border-border bg-muted/30 p-3 text-sm font-medium text-muted-foreground">
            Slot
          </div>
          {days.map((day, index) => {
            const isToday = sameDay(day, new Date());
            const board = boards[index];
            const full = board.booked >= SLOTS_PER_DAY;
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "border-r border-border p-3 last:border-r-0",
                  isToday && "bg-primary/5"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                      {new Intl.DateTimeFormat("en-US", {
                        weekday: "short",
                      }).format(day)}
                    </div>
                    <div className="text-2xl font-bold">{day.getDate()}</div>
                  </div>
                  <span
                    className={cn(
                      "mt-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      full
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                    title={`${board.booked} of ${SLOTS_PER_DAY} slots booked`}
                  >
                    {board.booked}/{SLOTS_PER_DAY}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {DAILY_SLOTS.map(slot => (
          <div
            key={slot.key}
            className="grid min-h-28 border-b border-border last:border-b-0"
            style={{ gridTemplateColumns: columns }}
          >
            <div className="border-r border-border bg-muted/20 p-3">
              <div className="text-sm font-semibold">{slot.label}</div>
              <div className="text-xs text-muted-foreground">
                {slotWindowLabel(slot)}
              </div>
            </div>
            {days.map((day, index) => (
              <SlotCell
                key={`${day.toISOString()}-${slot.key}`}
                day={day}
                slot={slot}
                jobs={boards[index].bySlot[slot.key]}
                settings={settings}
                navigate={navigate}
                moveJob={moveJob}
              />
            ))}
          </div>
        ))}

        {hasUnslotted && (
          <div
            className="grid min-h-20 border-t-2 border-border bg-muted/10"
            style={{ gridTemplateColumns: columns }}
          >
            <div className="border-r border-border p-3">
              <div className="text-sm font-semibold">Needs a slot</div>
              <div className="text-xs text-muted-foreground">
                No time or vehicle yet
              </div>
            </div>
            {boards.map((board, index) => (
              <div
                key={days[index].toISOString()}
                className="space-y-2 border-r border-border p-2 last:border-r-0"
              >
                {board.unslotted.map(job => (
                  <JobSlotCard
                    key={job.id}
                    job={job}
                    settings={settings}
                    navigate={navigate}
                    tone="warning"
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function slotWindowLabel(slot: DailySlot) {
  const fmt = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    const date = new Date();
    date.setHours(h, m, 0, 0);
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };
  return `${fmt(slot.windowStart)} – ${fmt(slot.windowEnd)}`;
}

function SlotCell({
  day,
  slot,
  jobs,
  settings,
  navigate,
  moveJob,
}: {
  day: Date;
  slot: DailySlot;
  jobs: Job[];
  settings: ReturnType<typeof loadPricingSettings>;
  navigate: (to: string) => void;
  moveJob: MoveJob;
}) {
  const isPast = startOfDay(day).getTime() < startOfDay(new Date()).getTime();
  const overbooked = jobs.length > 1;
  const drop = useDropTarget(jobId => moveJob(jobId, day, slot));

  return (
    <div
      {...drop.props}
      className={cn(
        "min-h-28 space-y-2 border-r border-border p-2 transition-colors last:border-r-0",
        overbooked && "bg-amber-50/60 dark:bg-amber-950/20",
        drop.over && "bg-primary/10 ring-2 ring-inset ring-primary/60"
      )}
    >
      {jobs.length === 0 &&
        (isPast ? (
          <div className="flex min-h-24 items-center justify-center text-xs text-muted-foreground/60">
            Open
          </div>
        ) : (
          <button
            onClick={() => navigate(newJobHrefForSlot(day, slot))}
            className="flex h-full min-h-24 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 hover:text-primary"
            title={`Book the ${slot.label} slot on ${dayHeaderFmt.format(day)}`}
          >
            <Plus className="size-4" />
            Open · Book
          </button>
        ))}
      {overbooked && (
        <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3" />
          {jobs.length} jobs in one slot
        </div>
      )}
      {jobs.map(job => (
        <JobSlotCard
          key={job.id}
          job={job}
          settings={settings}
          navigate={navigate}
        />
      ))}
    </div>
  );
}

function MonthGrid({
  weeks,
  month,
  jobs,
  settings,
  moveJob,
  onSelectDay,
  navigate,
}: {
  weeks: Date[][];
  month: number;
  jobs: Job[];
  settings: ReturnType<typeof loadPricingSettings>;
  moveJob: MoveJob;
  onSelectDay: (day: Date) => void;
  navigate: (to: string) => void;
}) {
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[840px]">
        <div className="grid grid-cols-7 border-b border-border">
          {weekdayLabels.map(label => (
            <div
              key={label}
              className="border-r border-border p-2 text-center text-xs font-semibold uppercase text-muted-foreground last:border-r-0"
            >
              {label}
            </div>
          ))}
        </div>
        {weeks.map((week, weekIndex) => (
          <div
            key={weekIndex}
            className="grid grid-cols-7 border-b border-border last:border-b-0"
          >
            {week.map(day => (
              <MonthDayCell
                key={day.toISOString()}
                day={day}
                month={month}
                jobs={jobs}
                settings={settings}
                moveJob={moveJob}
                onSelectDay={onSelectDay}
                navigate={navigate}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthDayCell({
  day,
  month,
  jobs,
  settings,
  moveJob,
  onSelectDay,
  navigate,
}: {
  day: Date;
  month: number;
  jobs: Job[];
  settings: ReturnType<typeof loadPricingSettings>;
  moveJob: MoveJob;
  onSelectDay: (day: Date) => void;
  navigate: (to: string) => void;
}) {
  const dayJobs = jobsForDay(jobs, day);
  const board = buildDayBoard(jobs, day, settings.vehicles);
  const inMonth = day.getMonth() === month;
  const isToday = sameDay(day, new Date());
  // Dropping on a month day keeps the job's slot (AM/PM + vehicle) and only changes the date.
  // A job with a time but no vehicle yet just moves date and stays in "Needs a slot".
  const drop = useDropTarget(jobId => {
    const job = jobs.find(candidate => candidate.id === jobId);
    if (!job) return;
    const slot = getSlot(jobSlotKey(job, settings.vehicles));
    if (slot) {
      moveJob(jobId, day, slot);
      return;
    }
    if (!isJobMovable(job)) {
      toast.error("Finished or canceled jobs can't be moved.");
      return;
    }
    const updates = moveJobToDay(job, day);
    if (!updates) {
      toast.error(
        "This job has no scheduled time yet — set one on the job page first."
      );
      return;
    }
    if (job.scheduledStart && sameDay(new Date(job.scheduledStart), day))
      return;
    if (!updateJob(job.id, updates)) return;
    toast.success(
      `${job.customerName} moved to ${agendaDayFmt.format(day)}. Pick a vehicle to put it in a slot.`
    );
  });

  return (
    <div
      {...drop.props}
      className={cn(
        "min-h-28 border-r border-border p-1.5 transition-colors last:border-r-0",
        !inMonth && "bg-muted/20",
        isToday && "bg-primary/5",
        drop.over && "bg-primary/10 ring-2 ring-inset ring-primary/60"
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <button
          onClick={() => onSelectDay(day)}
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors hover:bg-muted",
            isToday && "bg-primary text-primary-foreground hover:bg-primary",
            !inMonth && "text-muted-foreground"
          )}
          title="Open day"
        >
          {day.getDate()}
        </button>
        {(board.booked > 0 || board.unslotted.length > 0) && (
          <span
            className={cn(
              "rounded-full px-1.5 text-[10px] font-semibold",
              board.booked >= SLOTS_PER_DAY
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
            title={`${board.booked} of ${SLOTS_PER_DAY} slots booked`}
          >
            {board.booked}/{SLOTS_PER_DAY}
          </span>
        )}
      </div>
      <div className="mt-1 flex gap-0.5">
        {DAILY_SLOTS.map(slot => (
          <span
            key={slot.key}
            title={`${slot.label}: ${board.bySlot[slot.key].length ? "booked" : "open"}`}
            className={cn(
              "h-1 flex-1 rounded-full",
              board.bySlot[slot.key].length ? "bg-primary" : "bg-border"
            )}
          />
        ))}
      </div>
      <div className="mt-1 space-y-1">
        {dayJobs.slice(0, 3).map(job => {
          const movable = isJobMovable(job);
          return (
            <button
              key={job.id}
              onClick={() => navigate(`/jobs/${job.id}`)}
              draggable={movable}
              onDragStart={event => startJobDrag(event, job)}
              className={cn(
                "block w-full truncate rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-left text-[11px] font-medium transition-colors hover:bg-primary/10",
                movable && "cursor-grab active:cursor-grabbing"
              )}
              title={job.customerName}
            >
              {job.scheduledStart ? `${timeLabel(job.scheduledStart)} ` : ""}
              {job.customerName}
            </button>
          );
        })}
        {dayJobs.length > 3 && (
          <button
            onClick={() => onSelectDay(day)}
            className="px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            +{dayJobs.length - 3} more
          </button>
        )}
      </div>
    </div>
  );
}

function Agenda({
  groups,
  settings,
  navigate,
}: {
  groups: Array<{ key: string; day: Date; jobs: Job[] }>;
  settings: ReturnType<typeof loadPricingSettings>;
  navigate: (to: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        No upcoming scheduled jobs.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {groups.map(group => {
        const isToday = sameDay(group.day, new Date());
        return (
          <div key={group.key} className="p-4 md:p-6">
            <div className="mb-3 flex items-center gap-2">
              <div className="text-sm font-semibold">
                {agendaDayFmt.format(group.day)}
              </div>
              {isToday && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Today
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {group.jobs.length} {group.jobs.length === 1 ? "job" : "jobs"}
              </span>
            </div>
            <div className="space-y-2">
              {group.jobs.map(job => {
                const warnings = getJobWarningsWithFacilityCheck(job, settings);
                return (
                  <button
                    key={job.id}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                    className="flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="w-20 shrink-0 text-sm font-semibold text-primary">
                      {job.scheduledStart ? timeLabel(job.scheduledStart) : "—"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {job.customerName}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[job.address, job.city, job.zip]
                          .filter(Boolean)
                          .join(", ") || "No address"}
                        {" · "}
                        {job.materialName ||
                          job.materialType?.replaceAll("_", " ") ||
                          "Material not set"}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <JobStatusBadge status={job.status} />
                      <PaymentStatusBadge status={job.paymentStatus} />
                      {warnings.slice(0, 1).map(warning => (
                        <JobWarningBadge key={warning.code} warning={warning} />
                      ))}
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold sm:w-24">
                      {money(job.quotedAmount)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
