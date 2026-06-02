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

const hours = Array.from({ length: 13 }, (_, index) => index + 6);
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function money(value: number | undefined) {
  return currency.format(Number.isFinite(value) ? Number(value) : 0);
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + offset);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
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

function weekLabel(days: Date[]) {
  const first = days[0];
  const last = days[6];
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(first);
  const lastMonth = new Intl.DateTimeFormat("en-US", { month: "long" }).format(last);
  if (first.getMonth() === last.getMonth()) return `${month} ${first.getDate()}-${last.getDate()}, ${first.getFullYear()}`;
  return `${month} ${first.getDate()}-${lastMonth} ${last.getDate()}, ${last.getFullYear()}`;
}

function jobsForSlot(jobs: Job[], day: Date, hour: number) {
  return jobs.filter((job) => {
    if (!job.scheduledStart) return false;
    const start = new Date(job.scheduledStart);
    return sameDay(start, day) && start.getHours() === hour;
  });
}

export default function Schedule() {
  const [, navigate] = useLocation();
  const [jobs, setJobs] = useState<Job[]>(() => getJobs());
  const [settings, setSettings] = useState(() => loadPricingSettings());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

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

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  return (
    <OperationsShell title="Schedule" eyebrow="Week operations">
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
                <ChevronRight className="size-4" />
              </Button>
              <div className="ml-0 text-lg font-semibold md:ml-3">{weekLabel(days)}</div>
            </div>
            <div className="inline-flex rounded-md border border-border">
              <Button variant="ghost" className="rounded-r-none text-muted-foreground">
                Day
              </Button>
              <Button className="rounded-none">Week</Button>
              <Button variant="ghost" className="rounded-l-none text-muted-foreground">
                Month
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[1120px]">
              <div className="grid grid-cols-[76px_repeat(7,minmax(150px,1fr))] border-b border-border">
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
                <div key={hour} className="grid min-h-28 grid-cols-[76px_repeat(7,minmax(150px,1fr))] border-b border-border last:border-b-0">
                  <div className="border-r border-border bg-muted/20 p-3 text-sm font-medium text-muted-foreground">{hourLabel(hour)}</div>
                  {days.map((day) => {
                    const slotJobs = jobsForSlot(jobs, day, hour);
                    return (
                      <div key={`${day.toISOString()}-${hour}`} className="min-h-28 space-y-2 border-r border-border p-2 last:border-r-0">
                        {slotJobs.map((job) => {
                          const warnings = getJobWarningsWithFacilityCheck(job, settings);
                          const missingReceiptWarning = warnings.find((warning) => warning.code === "missing_receipt");
                          return (
                            <button
                              key={job.id}
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
                                <div className="text-xs font-semibold text-primary">
                                  {new Date(job.scheduledStart ?? "").toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                                </div>
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
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </OperationsShell>
  );
}
