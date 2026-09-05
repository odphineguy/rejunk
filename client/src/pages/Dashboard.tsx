import { useEffect, useMemo, useState } from "react";
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
  PhoneCall,
  Repeat2,
  Star,
  Target,
  Timer,
  TrendingUp,
  Truck,
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
import { ensureSession, isSupabaseConfigured, supabase } from "@/lib/supabase";
import { APP_TENANT_ID } from "@/lib/tenant";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Rendered wherever the truth is "no data" — never a fake 0. */
const NO_DATA = "—";

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

/** Local calendar date as YYYY-MM-DD (the DB function works in Phoenix time). */
function isoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------- data (DASHBOARD_LEADS_SPEC §3: one call → every tile) ----------

interface CapacityRow {
  slug: string;
  label: string;
  granularity: "halfday" | "day";
  units: number;
  booked: number;
  open: number;
}

/** One day from `dashboard_metrics`. `null` = no data for that tile. */
interface DayMetrics {
  date: string;
  revenue: number | null;
  collected: number | null;
  jobsCompleted: number;
  jobsWithAmount: number;
  avgJobSize: number | null;
  newLeads: number;
  repeatCustomers: number;
  leadsBooked: number;
  bookingRate: number | null;
  closeRate30d: number | null;
  closeBooked30d: number;
  closeReceived30d: number;
  firstReplyMedianSec: number | null;
  reviewsReceived: number;
  voiceCalls: number;
  voiceCallsBooked: number;
  capacity: CapacityRow[];
}

const num = (value: unknown): number | null =>
  value == null || value === "" || Number.isNaN(Number(value))
    ? null
    : Number(value);
const int = (value: unknown): number => num(value) ?? 0;

function dayFromJson(raw: Record<string, unknown>): DayMetrics {
  const capacity = Array.isArray(raw.capacity)
    ? (raw.capacity as Record<string, unknown>[]).map(row => ({
        slug: String(row.slug ?? ""),
        label: String(row.label ?? row.slug ?? ""),
        granularity: row.granularity === "day" ? ("day" as const) : ("halfday" as const),
        units: int(row.units),
        booked: int(row.booked),
        open: int(row.open),
      }))
    : [];
  return {
    date: String(raw.date ?? ""),
    revenue: num(raw.revenue),
    collected: num(raw.collected),
    jobsCompleted: int(raw.jobs_completed),
    jobsWithAmount: int(raw.jobs_with_amount),
    avgJobSize: num(raw.avg_job_size),
    newLeads: int(raw.new_leads),
    repeatCustomers: int(raw.repeat_customers),
    leadsBooked: int(raw.leads_booked),
    bookingRate: num(raw.booking_rate),
    closeRate30d: num(raw.close_rate_30d),
    closeBooked30d: int(raw.close_booked_30d),
    closeReceived30d: int(raw.close_received_30d),
    firstReplyMedianSec: num(raw.first_reply_median_sec),
    reviewsReceived: int(raw.reviews_received),
    voiceCalls: int(raw.voice_calls),
    voiceCallsBooked: int(raw.voice_calls_booked),
    capacity,
  };
}

const SPARK_DAYS = 8;

/** Inclusive date range; a single day has from === to. */
interface DateRange {
  from: Date;
  to: Date;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function rangeLength(range: DateRange) {
  return (
    Math.round(
      (startOfDay(range.to).getTime() - startOfDay(range.from).getTime()) / 86400000
    ) + 1
  );
}

function isSingleDay(range: DateRange) {
  return rangeLength(range) === 1;
}

function formatRange(range: DateRange) {
  if (isSingleDay(range)) return formatLongDate(range.to);
  const sameYear = range.from.getFullYear() === range.to.getFullYear();
  const from = range.from.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const to = range.to.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${from} – ${to} · ${rangeLength(range)} days`;
}

/**
 * Adds up a run of days into one tile set. Counts and dollars sum; averages
 * and rates are recomputed from the sums; the close rate (already rolling
 * 30 days) and capacity come from the last day; the first-reply figure is
 * the median of the daily medians. Empty input → null (no data).
 */
function aggregate(days: DayMetrics[]): DayMetrics | null {
  if (days.length === 0) return null;
  if (days.length === 1) return days[0];
  const last = days[days.length - 1];
  const sum = (pick: (d: DayMetrics) => number) => days.reduce((acc, d) => acc + pick(d), 0);
  const sumNullable = (pick: (d: DayMetrics) => number | null) => {
    const values = days.map(pick).filter((v): v is number => v != null);
    return values.length ? values.reduce((acc, v) => acc + v, 0) : null;
  };
  const revenue = sumNullable(d => d.revenue);
  const jobsWithAmount = sum(d => d.jobsWithAmount);
  const newLeads = sum(d => d.newLeads);
  const leadsBooked = sum(d => d.leadsBooked);
  const medians = days
    .map(d => d.firstReplyMedianSec)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const median =
    medians.length === 0
      ? null
      : medians.length % 2
        ? medians[(medians.length - 1) / 2]
        : (medians[medians.length / 2 - 1] + medians[medians.length / 2]) / 2;
  return {
    date: last.date,
    revenue,
    collected: sumNullable(d => d.collected),
    jobsCompleted: sum(d => d.jobsCompleted),
    jobsWithAmount,
    avgJobSize: revenue != null && jobsWithAmount > 0 ? revenue / jobsWithAmount : null,
    newLeads,
    repeatCustomers: sum(d => d.repeatCustomers),
    leadsBooked,
    bookingRate: newLeads > 0 ? leadsBooked / newLeads : null,
    closeRate30d: last.closeRate30d,
    closeBooked30d: last.closeBooked30d,
    closeReceived30d: last.closeReceived30d,
    firstReplyMedianSec: median,
    reviewsReceived: sum(d => d.reviewsReceived),
    voiceCalls: sum(d => d.voiceCalls),
    voiceCallsBooked: sum(d => d.voiceCallsBooked),
    capacity: last.capacity,
  };
}

async function loadSeries(endDate: Date, days: number): Promise<DayMetrics[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  if (!(await ensureSession())) return [];
  const { data, error } = await supabase.rpc("dashboard_metrics_series", {
    p_tenant: APP_TENANT_ID,
    p_date: isoDate(endDate),
    p_days: days,
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data)
    ? (data as Record<string, unknown>[]).map(dayFromJson)
    : [];
}

// ---------- tiles ----------

function formatPct(value: number | null) {
  return value == null ? NO_DATA : `${(value * 100).toFixed(1)}%`;
}

function formatSeconds(value: number | null) {
  if (value == null) return NO_DATA;
  if (value < 60) return `${Math.round(value)}s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

const cardDefs: Array<{
  label: string;
  icon: LucideIcon;
  /** null = no data → "—" and no delta */
  get: (m: DayMetrics) => number | null;
  fmt: (m: DayMetrics) => string;
  hint?: (m: DayMetrics) => string | undefined;
  ownerOnly?: boolean;
  /** Static tile (no delta / sparkline) — e.g. margin until the pricing overhaul. */
  static?: boolean;
  /** Lower is better (first-reply time). */
  invert?: boolean;
}> = [
  {
    label: "Total Revenue",
    icon: WalletCards,
    get: m => m.revenue,
    fmt: m => (m.revenue == null ? NO_DATA : currency.format(m.revenue)),
    hint: m =>
      m.jobsCompleted > 0 && m.jobsWithAmount < m.jobsCompleted
        ? `${m.jobsWithAmount} of ${m.jobsCompleted} jobs have totals`
        : undefined,
    ownerOnly: true,
  },
  {
    label: "Collected Payments",
    icon: Banknote,
    get: m => m.collected,
    fmt: m => (m.collected == null ? NO_DATA : currency.format(m.collected)),
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
    get: () => null,
    fmt: () => "n/a",
    hint: () => "Until the pricing overhaul",
    ownerOnly: true,
    static: true,
  },
  {
    label: "Average Job Size",
    icon: TrendingUp,
    get: m => m.avgJobSize,
    fmt: m => (m.avgJobSize == null ? NO_DATA : currency.format(m.avgJobSize)),
    ownerOnly: true,
  },
  {
    label: "New Clients",
    icon: UsersRound,
    get: m => m.newLeads,
    fmt: m => String(m.newLeads),
    hint: () => "Thumbtack leads received",
  },
  {
    label: "Repeat Customers",
    icon: Repeat2,
    get: m => m.repeatCustomers,
    fmt: m => String(m.repeatCustomers),
    hint: () => "Leads from a phone seen before",
  },
  {
    label: "Booking Rate",
    icon: UserRoundPlus,
    get: m => m.bookingRate,
    fmt: m => formatPct(m.bookingRate),
    hint: m =>
      m.newLeads > 0 ? `${m.leadsBooked} booked of ${m.newLeads} received` : undefined,
  },
  {
    label: "Close Rate",
    icon: Target,
    get: m => m.closeRate30d,
    fmt: m => formatPct(m.closeRate30d),
    hint: m =>
      m.closeReceived30d > 0
        ? `${m.closeBooked30d} of ${m.closeReceived30d} leads, rolling 30 days`
        : undefined,
  },
  {
    label: "First Reply (median)",
    icon: Timer,
    get: m => m.firstReplyMedianSec,
    fmt: m => formatSeconds(m.firstReplyMedianSec),
    hint: () => "Lead received → first response",
    invert: true,
  },
];

function sparkPath(data: number[], w: number, h: number, close: boolean) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pad = 3;
  const points = data.map((value, index) => [
    (index / Math.max(data.length - 1, 1)) * (w - 2) + 1,
    max === min
      ? h / 2
      : h - pad - ((value - min) / (max - min)) * (h - pad * 2),
  ]);
  let d =
    "M" + points.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L");
  if (close) d += ` L${w - 1},${h} L1,${h} Z`;
  return d;
}

function Sparkline({ data }: { data: Array<number | null> }) {
  // Days with no data draw as gaps at the baseline; an all-empty series is blank.
  if (data.every(value => value == null)) {
    return <span className="h-[30px] w-[110px] flex-none" aria-hidden />;
  }
  const filled = data.map(value => value ?? 0);
  return (
    <svg
      className="h-[30px] w-[110px] flex-none opacity-85"
      viewBox="0 0 110 30"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={sparkPath(filled, 110, 30, true)} fill="url(#kpi-sparkfill)" />
      <path
        d={sparkPath(filled, 110, 30, false)}
        fill="none"
        stroke="var(--moss-deep)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeltaPill({
  today,
  prev,
  invert = false,
  periodLabel = "prior day",
}: {
  today: number | null;
  prev: number | null;
  invert?: boolean;
  periodLabel?: string;
}) {
  if (today == null || prev == null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#dedbc9] bg-[#eceade] px-2.5 py-0.5 font-display text-xs font-semibold text-[#71755f]">
        <Minus className="size-3" />
        {NO_DATA}{" "}
        <span className="font-sans font-medium opacity-70">
          {today == null ? "no data" : `no ${periodLabel}`}
        </span>
      </span>
    );
  }
  const pct =
    prev === 0 ? (today > 0 ? 100 : 0) : ((today - prev) / prev) * 100;
  const direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  // "Good" is green: up for most tiles, down for time-to-reply.
  const good = direction === "flat" ? "flat" : (direction === "up") !== invert ? "good" : "bad";
  const Arrow = direction === "up" ? MoveUpRight : direction === "down" ? MoveDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-display text-xs font-semibold",
        good === "good" && "border-[#c6e7bd] bg-[#e2f4dc] text-[#1f6b3c]",
        good === "bad" && "border-[#ead4ae] bg-[#f4e7d2] text-[#a06b22]",
        good === "flat" && "border-[#dedbc9] bg-[#eceade] text-[#71755f]"
      )}
    >
      <Arrow className="size-3" />
      {pct > 0 ? "+" : ""}
      {Math.round(pct)}%{" "}
      <span className="font-sans font-medium opacity-70">vs {periodLabel}</span>
    </span>
  );
}

export default function Dashboard() {
  const [range, setRange] = useState<DateRange>(() => {
    const today = startOfDay(new Date());
    return { from: today, to: today };
  });
  const { isOwner } = useStaffSession();
  const [series, setSeries] = useState<DayMetrics[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const length = rangeLength(range);
  const single = length === 1;
  // Fetch the range plus the same length before it (for "vs prior period");
  // a single day also needs a trailing window for its sparklines.
  const fetchDays = single ? SPARK_DAYS : length * 2;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadSeries(range.to, fetchDays)
      .then(rows => {
        if (!cancelled) setSeries(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSeries([]);
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [range, fetchDays]);

  const loading = series === null;
  const rows = series ?? [];
  // Last `length` days = the selected range; the `length` before = prior period.
  const rangeDays = rows.slice(Math.max(0, rows.length - length));
  const priorDays = single
    ? rows.slice(Math.max(0, rows.length - 2), Math.max(0, rows.length - 1))
    : rows.slice(Math.max(0, rows.length - length * 2), Math.max(0, rows.length - length));
  const metrics = aggregate(rangeDays);
  const prevMetrics = aggregate(priorDays);
  const sparkDays = single ? rows : rangeDays;
  const periodLabel = single ? "prior day" : `prior ${length} days`;

  const tiles = useMemo(
    () => cards(metrics, prevMetrics, sparkDays, isOwner),
    [metrics, prevMetrics, sparkDays, isOwner]
  );

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
            Operational snapshot · {formatRange(range)}
          </div>
        </div>
        <DashboardDatePicker range={range} onSelectRange={setRange} />
      </div>

      {!isSupabaseConfigured && (
        <p className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Live numbers need the database connection. Running in local-only mode.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-[#ead4ae] bg-[#f4e7d2] px-4 py-3 text-sm text-[#a06b22]">
          Couldn't load the dashboard numbers: {error}
        </p>
      )}

      <div
        className={cn(
          "grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]",
          loading && "opacity-60"
        )}
        aria-busy={loading}
      >
        {tiles.map((card, index) => {
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
              {card.hint && (
                <div className="mt-1 text-xs font-medium text-muted-foreground">
                  {card.hint}
                </div>
              )}
              {!card.static && (
                <div className="mt-4 flex items-end justify-between gap-2.5">
                  <DeltaPill
                    today={card.today}
                    prev={card.prev}
                    invert={card.invert}
                    periodLabel={periodLabel}
                  />
                  <Sparkline data={card.spark} />
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div
        className={cn(
          "mt-[18px] grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]",
          loading && "opacity-60"
        )}
      >
        <SmallTile
          icon={Star}
          label="Reviews Received"
          value={metrics ? String(metrics.reviewsReceived) : NO_DATA}
          hint={single ? "Thumbtack reviews that day" : "Thumbtack reviews in the period"}
          today={metrics?.reviewsReceived ?? null}
          prev={prevMetrics?.reviewsReceived ?? null}
          periodLabel={periodLabel}
        />
        <SmallTile
          icon={PhoneCall}
          label="Voice Calls"
          value={metrics ? String(metrics.voiceCalls) : NO_DATA}
          hint={
            metrics
              ? `${metrics.voiceCallsBooked} booked on the call`
              : "Answered by the voice agent"
          }
          today={metrics?.voiceCalls ?? null}
          prev={prevMetrics?.voiceCalls ?? null}
          periodLabel={periodLabel}
        />
        <CapacityStrip rows={metrics?.capacity ?? null} date={range.to} />
      </div>
    </div>
  );
}

function SmallTile({
  icon: Icon,
  label,
  value,
  hint,
  today,
  prev,
  periodLabel,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  today: number | null;
  prev: number | null;
  periodLabel: string;
}) {
  return (
    <section className="kpi-card rounded-[var(--radius)] border border-border bg-card px-5 pb-4 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="kpi-ico flex size-8 items-center justify-center rounded-[10px] border border-border bg-[#edebde] text-[var(--moss-deep)]">
          <Icon className="size-4" />
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="font-display text-[1.6rem] font-bold leading-[1.05] tracking-tight">
            {value}
          </div>
          {hint && (
            <div className="mt-1 text-xs font-medium text-muted-foreground">{hint}</div>
          )}
        </div>
        <DeltaPill today={today} prev={prev} periodLabel={periodLabel} />
      </div>
    </section>
  );
}

function CapacityStrip({
  rows,
  date,
}: {
  rows: CapacityRow[] | null;
  date: Date;
}) {
  return (
    <section className="kpi-card rounded-[var(--radius)] border border-border bg-card px-5 pb-4 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Capacity ·{" "}
          {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
        <span className="kpi-ico flex size-8 items-center justify-center rounded-[10px] border border-border bg-[#edebde] text-[var(--moss-deep)]">
          <Truck className="size-4" />
        </span>
      </div>
      {!rows || rows.length === 0 ? (
        <div className="font-display text-[1.6rem] font-bold leading-[1.05]">{NO_DATA}</div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(row => {
            const total = (row.granularity === "halfday" ? 2 : 1) * row.units;
            const full = row.open === 0;
            return (
              <li key={row.slug} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold capitalize">{row.slug}</span>
                <span
                  className={cn(
                    "font-display text-xs font-semibold",
                    full ? "text-[#a06b22]" : "text-[#1f6b3c]"
                  )}
                >
                  {row.open} open · {row.booked} booked
                  <span className="ml-1 font-sans font-medium text-muted-foreground">
                    of {total} {row.granularity === "halfday" ? "half-days" : "day"}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function cards(
  metrics: DayMetrics | null,
  prevMetrics: DayMetrics | null,
  series: DayMetrics[],
  isOwner: boolean
) {
  return cardDefs
    .filter(def => isOwner || !def.ownerOnly)
    .map(def => ({
      label: def.label,
      icon: def.icon,
      value: metrics ? def.fmt(metrics) : NO_DATA,
      hint: metrics ? def.hint?.(metrics) : undefined,
      today: metrics ? def.get(metrics) : null,
      prev: prevMetrics ? def.get(prevMetrics) : null,
      spark: series.map(def.get),
      static: def.static ?? false,
      invert: def.invert ?? false,
    }));
}

function startOfWeek(date: Date) {
  const day = date.getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function quickRange(range: (typeof quickRanges)[number]): DateRange {
  const today = startOfDay(new Date());
  switch (range) {
    case "Today":
      return { from: today, to: today };
    case "Yesterday": {
      const d = addDays(today, -1);
      return { from: d, to: d };
    }
    case "This Week":
      return { from: startOfWeek(today), to: today };
    case "Last Week": {
      const from = addDays(startOfWeek(today), -7);
      return { from, to: addDays(from, 6) };
    }
    case "This Month":
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
    case "Last Month":
      return {
        from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        to: new Date(today.getFullYear(), today.getMonth(), 0),
      };
  }
}

function DashboardDatePicker({
  range,
  onSelectRange,
}: {
  range: DateRange;
  onSelectRange: (range: DateRange) => void;
}) {
  const selectedDate = range.to;
  const single = isSingleDay(range);
  const step = rangeLength(range);
  const shift = (direction: 1 | -1) =>
    onSelectRange({
      from: addDays(range.from, step * direction),
      to: addDays(range.to, step * direction),
    });
  const pickDay = (date: Date) => {
    const d = startOfDay(date);
    onSelectRange({ from: d, to: d });
  };
  return (
    <div className="flex h-11 items-center gap-1 rounded-[11px] border border-border bg-card pl-1 pr-1 shadow-[var(--shadow-card)]">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-9 gap-2.5 rounded-lg px-3 font-display text-sm font-semibold hover:bg-muted"
          >
            <CalendarIcon className="size-4 text-[var(--moss-deep)]" />
            {single
              ? selectedDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : `${range.from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${range.to.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
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
                  onClick={() => onSelectRange(quickRange(range))}
                >
                  {range}
                </button>
              ))}
            </div>
            <div className="p-3">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={date => date && pickDay(date)}
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
          aria-label={single ? "Previous day" : "Previous period"}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => shift(-1)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          aria-label={single ? "Next day" : "Next period"}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => shift(1)}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
