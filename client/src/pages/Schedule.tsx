import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { JobStatusBadge, JobWarningBadge, PaymentStatusBadge } from "@/components/JobBadges";
import { OperationsShell } from "@/components/OperationsShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getJobWarningsWithFacilityCheck } from "@/lib/jobIntelligence";
import { getJobs } from "@/lib/jobStorage";
import { cn } from "@/lib/utils";
import { loadPricingSettings } from "@/utils/pricingStorage";
import type { Job } from "@/types/jobs";

type ScheduleView = "day" | "week" | "month" | "agenda";

const hours = Array.from({ length: 13 }, (_, index) => index + 6);
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function money(value: number | undefined) {
  return currency.format(Number.isFinite(value) ? Number(value) : 0);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + offset);
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
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function hourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display} ${suffix}`;
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function weekLabel(days: Date[]) {
  const first = days[0];
  const last = days[6];
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(first);
  const lastMonth = new Intl.DateTimeFormat("en-US", { month: "long" }).format(last);
  if (first.getMonth() === last.getMonth()) return `${month} ${first.getDate()}-${last.getDate()}, ${first.getFullYear()}`;
  return `${month} ${first.getDate()}-${lastMonth} ${last.getDate()}, ${last.getFullYear()}`;
}

const dayHeaderFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const agendaDayFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" });

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

function jobsForSlot(jobs: Job[], day: Date, hour: number) {
  return jobs.filter((job) => {
    if (!job.scheduledStart) return false;
    const start = new Date(job.scheduledStart);
    return sameDay(start, day) && start.getHours() === hour;
  });
}

function jobsForDay(jobs: Job[], day: Date) {
  return jobs
    .filter((job) => job.scheduledStart && sameDay(new Date(job.scheduledStart), day))
    .sort((a, b) => new Date(a.scheduledStart!).getTime() - new Date(b.scheduledStart!).getTime());
}

function upcomingGroups(jobs: Job[], from: Date) {
  const fromTime = startOfDay(from).getTime();
  const scheduled = jobs
    .filter((job) => job.scheduledStart && startOfDay(new Date(job.scheduledStart)).getTime() >= fromTime)
    .sort((a, b) => new Date(a.scheduledStart!).getTime() - new Date(b.scheduledStart!).getTime());

  const groups: Array<{ key: string; day: Date; jobs: Job[] }> = [];
  for (const job of scheduled) {
    const day = startOfDay(new Date(job.scheduledStart!));
    const key = day.toISOString();
    const existing = groups.find((group) => group.key === key);
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
    return () => window.removeEventListener("pricing-settings-updated", refreshSettings);
  }, []);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index)), [cursor]);
  const weeks = useMemo(() => monthWeeks(cursor), [cursor]);
  const agenda = useMemo(() => upcomingGroups(jobs, cursor), [jobs, cursor]);

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
    <OperationsShell title="Schedule" eyebrow="Crew operations">
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setCursor(startOfDay(new Date()))}>
                Today
              </Button>
              {view !== "agenda" && (
                <>
                  <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous">
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next">
                    <ChevronRight className="size-4" />
                  </Button>
                </>
              )}
              <div className="ml-0 text-lg font-semibold md:ml-3">{headerLabel}</div>
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
                    view !== option.key && "text-muted-foreground",
                  )}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {view === "day" && <TimeGrid days={[cursor]} jobs={jobs} settings={settings} navigate={navigate} />}
          {view === "week" && <TimeGrid days={weekDays} jobs={jobs} settings={settings} navigate={navigate} />}
          {view === "month" && (
            <MonthGrid
              weeks={weeks}
              month={cursor.getMonth()}
              jobs={jobs}
              onSelectDay={(day) => {
                setCursor(startOfDay(day));
                setView("day");
              }}
              navigate={navigate}
            />
          )}
          {view === "agenda" && <Agenda groups={agenda} settings={settings} navigate={navigate} />}
        </CardContent>
      </Card>
    </OperationsShell>
  );
}

function JobSlotCard({ job, settings, navigate }: { job: Job; settings: ReturnType<typeof loadPricingSettings>; navigate: (to: string) => void }) {
  const warnings = getJobWarningsWithFacilityCheck(job, settings);
  const missingReceiptWarning = warnings.find((warning) => warning.code === "missing_receipt");
  return (
    <button
      onClick={() => navigate(`/jobs/${job.id}`)}
      className="w-full rounded-md border border-primary/30 bg-primary/5 p-2 text-left shadow-sm transition-colors hover:bg-primary/10"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{job.customerName}</div>
          <div className="truncate text-xs text-muted-foreground">
            {[job.city, job.zip].filter(Boolean).join(" ") || "Phoenix area"}
          </div>
        </div>
        <div className="whitespace-nowrap text-xs font-semibold text-primary">{job.scheduledStart ? timeLabel(job.scheduledStart) : ""}</div>
      </div>
      <div className="mt-2 truncate text-xs">{job.materialName || job.materialType?.replaceAll("_", " ") || "Material not set"}</div>
      <div className="mt-1 truncate text-xs font-semibold">
        {money(job.quotedAmount)} · {job.paymentStatus.replaceAll("_", " ")}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <JobStatusBadge status={job.status} />
        <PaymentStatusBadge status={job.paymentStatus} />
        {missingReceiptWarning && <JobWarningBadge warning={missingReceiptWarning} />}
      </div>
    </button>
  );
}

function TimeGrid({
  days,
  jobs,
  settings,
  navigate,
}: {
  days: Date[];
  jobs: Job[];
  settings: ReturnType<typeof loadPricingSettings>;
  navigate: (to: string) => void;
}) {
  const isSingleDay = days.length === 1;
  const columns = `76px repeat(${days.length}, minmax(${isSingleDay ? "0" : "150px"}, 1fr))`;

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: isSingleDay ? undefined : 1120 }}>
        <div className="grid border-b border-border" style={{ gridTemplateColumns: columns }}>
          <div className="border-r border-border bg-muted/30 p-3 text-sm font-medium text-muted-foreground">Time</div>
          {days.map((day) => {
            const isToday = sameDay(day, new Date());
            return (
              <div key={day.toISOString()} className={cn("border-r border-border p-3 last:border-r-0", isToday && "bg-primary/5")}>
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  {new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day)}
                </div>
                <div className="text-2xl font-bold">{day.getDate()}</div>
              </div>
            );
          })}
        </div>

        {hours.map((hour) => (
          <div key={hour} className="grid min-h-28 border-b border-border last:border-b-0" style={{ gridTemplateColumns: columns }}>
            <div className="border-r border-border bg-muted/20 p-3 text-sm font-medium text-muted-foreground">{hourLabel(hour)}</div>
            {days.map((day) => {
              const slotJobs = jobsForSlot(jobs, day, hour);
              return (
                <div key={`${day.toISOString()}-${hour}`} className="min-h-28 space-y-2 border-r border-border p-2 last:border-r-0">
                  {slotJobs.map((job) => (
                    <JobSlotCard key={job.id} job={job} settings={settings} navigate={navigate} />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthGrid({
  weeks,
  month,
  jobs,
  onSelectDay,
  navigate,
}: {
  weeks: Date[][];
  month: number;
  jobs: Job[];
  onSelectDay: (day: Date) => void;
  navigate: (to: string) => void;
}) {
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[840px]">
        <div className="grid grid-cols-7 border-b border-border">
          {weekdayLabels.map((label) => (
            <div key={label} className="border-r border-border p-2 text-center text-xs font-semibold uppercase text-muted-foreground last:border-r-0">
              {label}
            </div>
          ))}
        </div>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 border-b border-border last:border-b-0">
            {week.map((day) => {
              const dayJobs = jobsForDay(jobs, day);
              const inMonth = day.getMonth() === month;
              const isToday = sameDay(day, new Date());
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-28 border-r border-border p-1.5 last:border-r-0",
                    !inMonth && "bg-muted/20",
                    isToday && "bg-primary/5",
                  )}
                >
                  <button
                    onClick={() => onSelectDay(day)}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors hover:bg-muted",
                      isToday && "bg-primary text-primary-foreground hover:bg-primary",
                      !inMonth && "text-muted-foreground",
                    )}
                    title="Open day"
                  >
                    {day.getDate()}
                  </button>
                  <div className="mt-1 space-y-1">
                    {dayJobs.slice(0, 3).map((job) => (
                      <button
                        key={job.id}
                        onClick={() => navigate(`/jobs/${job.id}`)}
                        className="block w-full truncate rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-left text-[11px] font-medium transition-colors hover:bg-primary/10"
                        title={job.customerName}
                      >
                        {job.scheduledStart ? `${timeLabel(job.scheduledStart)} ` : ""}
                        {job.customerName}
                      </button>
                    ))}
                    {dayJobs.length > 3 && (
                      <button onClick={() => onSelectDay(day)} className="px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                        +{dayJobs.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
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
    return <div className="p-10 text-center text-sm text-muted-foreground">No upcoming scheduled jobs.</div>;
  }

  return (
    <div className="divide-y divide-border">
      {groups.map((group) => {
        const isToday = sameDay(group.day, new Date());
        return (
          <div key={group.key} className="p-4 md:p-6">
            <div className="mb-3 flex items-center gap-2">
              <div className="text-sm font-semibold">{agendaDayFmt.format(group.day)}</div>
              {isToday && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Today</span>}
              <span className="text-xs text-muted-foreground">
                {group.jobs.length} {group.jobs.length === 1 ? "job" : "jobs"}
              </span>
            </div>
            <div className="space-y-2">
              {group.jobs.map((job) => {
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
                      <div className="truncate text-sm font-semibold">{job.customerName}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[job.address, job.city, job.zip].filter(Boolean).join(", ") || "No address"}
                        {" · "}
                        {job.materialName || job.materialType?.replaceAll("_", " ") || "Material not set"}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <JobStatusBadge status={job.status} />
                      <PaymentStatusBadge status={job.paymentStatus} />
                      {warnings.slice(0, 1).map((warning) => (
                        <JobWarningBadge key={warning.code} warning={warning} />
                      ))}
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold sm:w-24">{money(job.quotedAmount)}</div>
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
