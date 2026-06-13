import { useMemo, useState } from "react";
import {
  Banknote,
  CalendarIcon,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Minus,
  MoveDownRight,
  MoveUpRight,
  Percent,
  Repeat2,
  Target,
  TrendingUp,
  Trophy,
  UserRoundPlus,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useStaffSession } from "@/hooks/useStaffSession";
import { getJobs } from "@/lib/jobStorage";
import { loadSavedEstimates } from "@/utils/pricingStorage";
import type { Job } from "@/types/jobs";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const quickRanges = [
  "Today",
  "Yesterday",
  "This Week",
  "Last Week",
  "This Month",
  "Last Month",
] as const;

function formatLongDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function uniqueCustomers(jobs: Job[]) {
  return new Set(
    jobs.map(job => job.customerName.trim().toLowerCase()).filter(Boolean)
  );
}

type Estimates = ReturnType<typeof loadSavedEstimates>;

function metricsForDate(jobs: Job[], estimates: Estimates, date: Date) {
  const selectedJobs = jobs.filter(job => {
    const candidate = job.scheduledStart ?? job.createdAt;
    return sameDay(new Date(candidate), date);
  });
  const completedJobs = selectedJobs.filter(job => job.status === "completed");
  const paidJobs = selectedJobs.filter(
    job => job.paymentStatus === "paid" || job.actuals?.chargedAmount
  );
  const collected = paidJobs.reduce(
    (sum, job) => sum + (job.actuals?.chargedAmount ?? job.quotedAmount),
    0
  );
  const totalQuoted = selectedJobs.reduce(
    (sum, job) => sum + job.quotedAmount,
    0
  );
  const customers = uniqueCustomers(selectedJobs);
  const repeatCustomers = Array.from(customers).filter(
    customer =>
      jobs.filter(job => job.customerName.trim().toLowerCase() === customer)
        .length > 1
  ).length;
  const wonEstimates = estimates.filter(estimate =>
    jobs.some(job => job.sourceEstimateId === estimate.id)
  ).length;

  return {
    totalRevenue: totalQuoted,
    collected,
    jobsCompleted: completedJobs.length,
    grossMargin: totalQuoted
      ? Math.round(
          (selectedJobs.reduce(
            (sum, job) => sum + (job.estimatedProfit ?? 0),
            0
          ) /
            totalQuoted) *
            100
        )
      : 0,
    averageJobSize: selectedJobs.length ? totalQuoted / selectedJobs.length : 0,
    newClients: customers.size,
    repeatCustomers,
    bookingRate: estimates.length ? selectedJobs.length / estimates.length : 0,
    closeRate: estimates.length ? wonEstimates / estimates.length : 0,
    wonEstimates,
    lostEstimates: Math.max(estimates.length - wonEstimates, 0),
  };
}

type DayMetrics = ReturnType<typeof metricsForDate>;

const cardDefs: Array<{
  label: string;
  icon: LucideIcon;
  get: (m: DayMetrics) => number;
  fmt: (m: DayMetrics) => string;
  ownerOnly?: boolean;
}> = [
  {
    label: "Total Revenue",
    icon: WalletCards,
    get: m => m.totalRevenue,
    fmt: m => currency.format(m.totalRevenue),
    ownerOnly: true,
  },
  {
    label: "Collected Payments",
    icon: Banknote,
    get: m => m.collected,
    fmt: m => currency.format(m.collected),
    ownerOnly: true,
  },
  {
    label: "Jobs Completed",
    icon: CheckCheck,
    get: m => m.jobsCompleted,
    fmt: m => String(m.jobsCompleted),
  },
  {
    label: "Gross Margin",
    icon: Percent,
    get: m => m.grossMargin,
    fmt: m => `${m.grossMargin}%`,
    ownerOnly: true,
  },
  {
    label: "Average Job Size",
    icon: TrendingUp,
    get: m => m.averageJobSize,
    fmt: m => currency.format(m.averageJobSize),
    ownerOnly: true,
  },
  {
    label: "New Clients",
    icon: UsersRound,
    get: m => m.newClients,
    fmt: m => String(m.newClients),
  },
  {
    label: "Repeat Customers",
    icon: Repeat2,
    get: m => m.repeatCustomers,
    fmt: m => String(m.repeatCustomers),
  },
  {
    label: "Booking Rate",
    icon: UserRoundPlus,
    get: m => m.bookingRate,
    fmt: m => `${(m.bookingRate * 100).toFixed(2)}%`,
  },
  {
    label: "Close Rate",
    icon: Target,
    get: m => m.closeRate,
    fmt: m => `${(m.closeRate * 100).toFixed(2)}%`,
  },
  {
    label: "Estimates Won Ratio",
    icon: Trophy,
    get: m => m.wonEstimates,
    fmt: m => `${m.wonEstimates}:${m.lostEstimates}`,
  },
];

function sparkPath(data: number[], w: number, h: number, close: boolean) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pad = 3;
  const points = data.map((value, index) => [
    (index / (data.length - 1)) * (w - 2) + 1,
    max === min
      ? h / 2
      : h - pad - ((value - min) / (max - min)) * (h - pad * 2),
  ]);
  let d =
    "M" + points.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L");
  if (close) d += ` L${w - 1},${h} L1,${h} Z`;
  return d;
}

function Sparkline({ data }: { data: number[] }) {
  return (
    <svg
      className="h-[30px] w-[110px] flex-none opacity-85"
      viewBox="0 0 110 30"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={sparkPath(data, 110, 30, true)} fill="url(#kpi-sparkfill)" />
      <path
        d={sparkPath(data, 110, 30, false)}
        fill="none"
        stroke="var(--moss-deep)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeltaPill({ today, prev }: { today: number; prev: number }) {
  const pct =
    prev === 0 ? (today > 0 ? 100 : 0) : ((today - prev) / prev) * 100;
  const trend = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const Arrow = trend === "up" ? MoveUpRight : trend === "down" ? MoveDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-display text-xs font-semibold",
        trend === "up" && "border-[#c6e7bd] bg-[#e2f4dc] text-[#1f6b3c]",
        trend === "down" && "border-[#ead4ae] bg-[#f4e7d2] text-[#a06b22]",
        trend === "flat" && "border-[#dedbc9] bg-[#eceade] text-[#71755f]"
      )}
    >
      <Arrow className="size-3" />
      {pct > 0 ? "+" : ""}
      {Math.round(pct)}%{" "}
      <span className="font-sans font-medium opacity-70">vs prior day</span>
    </span>
  );
}

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const { isOwner } = useStaffSession();
  const jobs = getJobs();
  const estimates = loadSavedEstimates();

  // One metrics snapshot per day for the trailing 8 days — the last entry is
  // the selected day (drives the big numbers), the rest feed the sparklines.
  const series = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) =>
        metricsForDate(jobs, estimates, addDays(selectedDate, index - 7))
      ),
    [estimates, jobs, selectedDate]
  );
  const metrics = series[7];
  const prevMetrics = series[6];

  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 py-6 md:px-7 md:pb-12">
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="kpi-sparkfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--moss)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--moss)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Workspace / Overview
          </div>
          <h1 className="font-display text-[1.7rem] font-bold tracking-tight md:text-[1.7rem]">
            Dashboard
          </h1>
          <div className="mt-1 text-sm font-semibold text-muted-foreground">
            Operational snapshot · {formatLongDate(selectedDate)}
          </div>
        </div>
        <DashboardDatePicker
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      </div>

      <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]">
        {cards(metrics, prevMetrics, series, isOwner).map((card, index) => {
          const Icon = card.icon;
          return (
            <section
              key={card.label}
              className="kpi-card rounded-[var(--radius)] border border-border bg-card px-5 pb-4 pt-5"
              style={{ animationDelay: `${index * 0.04}s` }}
            >
              <div className="mb-3.5 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {card.label}
                </span>
                <span className="kpi-ico flex size-9 items-center justify-center rounded-[10px] border border-border bg-[#edebde] text-[var(--moss-deep)]">
                  <Icon className="size-[17px]" />
                </span>
              </div>
              <div className="font-display text-[2.05rem] font-bold leading-[1.05] tracking-tight">
                {card.value}
              </div>
              <div className="mt-4 flex items-end justify-between gap-2.5">
                <DeltaPill today={card.today} prev={card.prev} />
                <Sparkline data={card.spark} />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function cards(
  metrics: DayMetrics,
  prevMetrics: DayMetrics,
  series: DayMetrics[],
  isOwner: boolean
) {
  return cardDefs
    .filter(def => isOwner || !def.ownerOnly)
    .map(def => ({
    label: def.label,
    icon: def.icon,
    value: def.fmt(metrics),
    today: def.get(metrics),
    prev: def.get(prevMetrics),
    spark: series.map(def.get),
  }));
}

function startOfWeek(date: Date) {
  const day = date.getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function quickRangeDate(range: (typeof quickRanges)[number]) {
  const now = new Date();
  switch (range) {
    case "Today":
      return now;
    case "Yesterday":
      return addDays(now, -1);
    case "This Week":
      return startOfWeek(now);
    case "Last Week":
      return addDays(startOfWeek(now), -7);
    case "This Month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "Last Month":
      return new Date(now.getFullYear(), now.getMonth() - 1, 1);
  }
}

function DashboardDatePicker({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}) {
  return (
    <div className="flex h-11 items-center gap-1 rounded-[11px] border border-border bg-card pl-1 pr-1 shadow-[var(--shadow-card)]">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-9 gap-2.5 rounded-lg px-3 font-display text-sm font-semibold hover:bg-muted"
          >
            <CalendarIcon className="size-4 text-[var(--moss-deep)]" />
            {selectedDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[min(calc(100vw-2rem),410px)] rounded-[14px] p-0 shadow-[var(--shadow-pop)]"
        >
          <div className="grid gap-0 sm:grid-cols-[132px_1fr]">
            <div className="space-y-1 border-b border-border p-4 sm:border-b-0 sm:border-r">
              {quickRanges.map(range => (
                <button
                  key={range}
                  type="button"
                  className="block w-full rounded-md px-2 py-1.5 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-[var(--moss-deep)]"
                  onClick={() => onSelectDate(quickRangeDate(range))}
                >
                  {range}
                </button>
              ))}
            </div>
            <div className="p-3">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={date => date && onSelectDate(date)}
                month={selectedDate}
                className="mx-auto"
                classNames={{
                  caption_label: "text-base font-semibold",
                  button_previous: "size-8",
                  button_next: "size-8",
                }}
                components={{
                  Chevron: ({ orientation, className, ...props }) =>
                    orientation === "left" ? (
                      <ChevronLeft
                        className={cn("size-4", className)}
                        {...props}
                      />
                    ) : (
                      <ChevronRight
                        className={cn("size-4", className)}
                        {...props}
                      />
                    ),
                }}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <div className="flex gap-0.5 border-l border-border pl-1">
        <button
          type="button"
          aria-label="Previous day"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => onSelectDate(addDays(selectedDate, -1))}
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Next day"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => onSelectDate(addDays(selectedDate, 1))}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
