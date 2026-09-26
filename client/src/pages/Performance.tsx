import { useEffect, useMemo, useState } from "react";
import {
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Megaphone,
  Minus,
  MoveDownRight,
  MoveUpRight,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import { OperationsShell } from "@/components/OperationsShell";
import { businessRows } from "@/lib/businessAccess";
import { loadLaborHoursSeries, type LaborHoursSeries } from "@/lib/jobTime";
import { ensureSession, isSupabaseConfigured, supabase } from "@/lib/supabase";
import { APP_TENANT_ID } from "@/lib/tenant";
import { cn } from "@/lib/utils";

// PERFORMANCE_PAGE_SPEC.md — three weekly numbers, Monday–Sunday, Arizona time.
//
//   Lead Spend   Thumbtack's per-lead charge (`lead_price` on the lead row,
//                read through `app_leads_v`), summed by the day the lead came in.
//   Revenue      `hcp_appointments.total_amount` for jobs completed that week —
//                the same `dashboard_metrics` numbers the Dashboard uses, summed.
//   Labor Hours  (finish − start − paused time) × crew size per completed job,
//                from the crew's taps in the driver app (DRIVER_TIME_TRACKING_SPEC,
//                `labor_hours_series`), counted on the Phoenix day the job finished.
//                Weeks before the first saved tap show "—". Nothing reads HCP.

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Rendered wherever the truth is "no data" — never a fake 0. */
const NO_DATA = "—";

const PHOENIX = "America/Phoenix";

// ---------- weeks (Monday–Sunday, Arizona) ----------

/** Calendar date in Phoenix as YYYY-MM-DD. */
function phoenixDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PHOENIX,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Date-only arithmetic in UTC so the week never shifts with the browser zone. */
function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Monday of the week that contains `iso`. */
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return shiftDate(iso, dow === 0 ? -6 : 1 - dow);
}

function formatWeek(monday: string): string {
  const sunday = shiftDate(monday, 6);
  const fmt = (iso: string, withYear: boolean) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
    });
  };
  return `${fmt(monday, false)} – ${fmt(sunday, true)}`;
}

// ---------- data ----------

interface WeekNumbers {
  leadSpend: number | null;
  revenue: number | null;
  laborHours: number | null;
}

const num = (value: unknown): number | null =>
  value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);

/** "$26.89" / "$0.00" / "" → dollars, or null when the row carries no charge. */
function parseLeadPrice(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^0-9.]/g, "");
  return cleaned === "" ? null : num(cleaned);
}

/** Sum that stays null when nothing in the run had a value. */
function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v != null);
  return present.length ? present.reduce((acc, v) => acc + v, 0) : null;
}

/**
 * Revenue per Phoenix day from the Dashboard's `dashboard_metrics_series`
 * (completed HCP jobs, `total_amount`). One call covers this week and last.
 */
async function loadRevenueByDay(sunday: string): Promise<Map<string, number | null>> {
  const byDay = new Map<string, number | null>();
  if (!isSupabaseConfigured || !supabase) return byDay;
  if (!(await ensureSession())) return byDay;
  const { data, error } = await supabase.rpc("dashboard_metrics_series", {
    p_tenant: APP_TENANT_ID,
    p_date: sunday,
    p_days: 14,
  });
  if (error) throw new Error(error.message);
  for (const row of Array.isArray(data) ? (data as Record<string, unknown>[]) : []) {
    byDay.set(String(row.date ?? ""), num(row.revenue));
  }
  return byDay;
}

interface LeadCharge {
  day: string;
  amount: number | null;
}

/** Every Thumbtack lead's charge keyed by the Phoenix day it was received. */
async function loadLeadCharges(): Promise<LeadCharge[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await businessRows("app_leads_v");
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter(row => row.source === "thumbtack" && row.received_at)
    .map(row => ({
      day: phoenixDate(new Date(String(row.received_at))),
      amount: parseLeadPrice(row.lead_price_num ?? row.lead_price),
    }));
}

function weekSpend(charges: LeadCharge[], monday: string): number | null {
  if (charges.length === 0) return null;
  const sunday = shiftDate(monday, 6);
  // Weeks before the first captured lead have no data, not a $0 spend.
  const first = charges.reduce((min, c) => (c.day < min ? c.day : min), charges[0].day);
  if (sunday < first) return null;
  return charges
    .filter(c => c.day >= monday && c.day <= sunday)
    .reduce((acc, c) => acc + (c.amount ?? 0), 0);
}

function weekLaborHours(series: LaborHoursSeries, monday: string): number | null {
  const sunday = shiftDate(monday, 6);
  if (!series.trackingSince || sunday < series.trackingSince) return null;
  const total = series.days
    .filter(d => d.date >= monday && d.date <= sunday)
    .reduce((acc, d) => acc + Number(d.hours), 0);
  return Math.round(total * 10) / 10;
}

function weekRevenue(byDay: Map<string, number | null>, monday: string): number | null {
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
  if (!days.some(d => byDay.has(d))) return null;
  return sumNullable(days.map(d => byDay.get(d) ?? null));
}

// ---------- tiles ----------

function DeltaPill({ current, prev }: { current: number | null; prev: number | null }) {
  if (current == null || prev == null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#dedbc9] bg-[#eceade] px-2.5 py-0.5 font-display text-xs font-semibold text-[#71755f]">
        <Minus className="size-3" />
        {NO_DATA}{" "}
        <span className="font-sans font-medium opacity-70">
          {current == null ? "no data" : "no last week"}
        </span>
      </span>
    );
  }
  const pct = prev === 0 ? (current > 0 ? 100 : 0) : ((current - prev) / prev) * 100;
  const direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const Arrow = direction === "up" ? MoveUpRight : direction === "down" ? MoveDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-display text-xs font-semibold",
        direction === "up" && "border-[#c6e7bd] bg-[#e2f4dc] text-[#1f6b3c]",
        direction === "down" && "border-[#ead4ae] bg-[#f4e7d2] text-[#a06b22]",
        direction === "flat" && "border-[#dedbc9] bg-[#eceade] text-[#71755f]"
      )}
    >
      <Arrow className="size-3" />
      {pct > 0 ? "+" : ""}
      {Math.round(pct)}%{" "}
      <span className="font-sans font-medium opacity-70">vs last week</span>
    </span>
  );
}

const cardDefs: Array<{
  key: keyof WeekNumbers;
  label: string;
  icon: LucideIcon;
  fmt: (value: number) => string;
  hint: string;
}> = [
  {
    key: "leadSpend",
    label: "Lead Spend",
    icon: Megaphone,
    fmt: value => currency.format(value),
    hint: "Thumbtack charges for leads received this week",
  },
  {
    key: "revenue",
    label: "Revenue",
    icon: WalletCards,
    fmt: value => currency.format(value),
    hint: "Invoice totals for jobs completed this week",
  },
  {
    key: "laborHours",
    label: "Labor Hours",
    icon: Clock3,
    fmt: value => `${value.toFixed(1)} h`,
    hint: "Crew time on finished jobs × crew size, from the driver app",
  },
];

export default function Performance() {
  const [monday, setMonday] = useState(() => mondayOf(phoenixDate(new Date())));
  const [revenueByDay, setRevenueByDay] = useState<Map<string, number | null> | null>(null);
  const [charges, setCharges] = useState<LeadCharge[] | null>(null);
  const [laborSeries, setLaborSeries] = useState<LaborHoursSeries | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sunday = shiftDate(monday, 6);
  const lastMonday = shiftDate(monday, -7);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setRevenueByDay(null);
    loadRevenueByDay(sunday)
      .then(rows => {
        if (!cancelled) setRevenueByDay(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRevenueByDay(new Map());
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [sunday]);

  useEffect(() => {
    let cancelled = false;
    loadLeadCharges()
      .then(rows => {
        if (!cancelled) setCharges(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCharges([]);
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLaborSeries(null);
    if (!isSupabaseConfigured) {
      setLaborSeries({ trackingSince: null, days: [] });
      return;
    }
    loadLaborHoursSeries(lastMonday, sunday)
      .then(series => {
        if (!cancelled) setLaborSeries(series);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLaborSeries({ trackingSince: null, days: [] });
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [lastMonday, sunday]);

  const loading = revenueByDay === null || charges === null || laborSeries === null;

  const { current, prev } = useMemo(() => {
    const week = (start: string): WeekNumbers => ({
      leadSpend: charges ? weekSpend(charges, start) : null,
      revenue: revenueByDay ? weekRevenue(revenueByDay, start) : null,
      laborHours: laborSeries ? weekLaborHours(laborSeries, start) : null,
    });
    return { current: week(monday), prev: week(lastMonday) };
  }, [charges, revenueByDay, laborSeries, monday, lastMonday]);

  return (
    <OperationsShell
      title="Performance"
      icon={ChartNoAxesCombined}
      actions={
        <WeekPicker
          monday={monday}
          onShift={days => setMonday(shiftDate(monday, days))}
        />
      }
    >
      <div className="mx-auto w-full max-w-[1480px] md:pb-6">
        {!isSupabaseConfigured && (
          <p className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Live numbers need the database connection. Running in local-only mode.
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-lg border border-[#ead4ae] bg-[#f4e7d2] px-4 py-3 text-sm text-[#a06b22]">
            Couldn't load the performance numbers: {error}
          </p>
        )}

        <div
          className={cn(
            "grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]",
            loading && "opacity-60"
          )}
          aria-busy={loading}
        >
          {cardDefs.map((card, index) => {
            const Icon = card.icon;
            const value = current[card.key];
            return (
              <section
                key={card.key}
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
                  {value == null ? NO_DATA : card.fmt(value)}
                </div>
                <div className="mt-1 text-xs font-medium text-muted-foreground">{card.hint}</div>
                <div className="mt-4 flex items-end justify-between gap-2.5">
                  <DeltaPill current={value} prev={prev[card.key]} />
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </OperationsShell>
  );
}

function WeekPicker({
  monday,
  onShift,
}: {
  monday: string;
  onShift: (days: number) => void;
}) {
  return (
    <div className="flex h-11 items-center gap-1 rounded-[11px] border border-border bg-card pl-3 pr-1 shadow-[var(--shadow-card)]">
      <span className="font-display text-sm font-semibold">{formatWeek(monday)}</span>
      <div className="ml-2 flex gap-0.5 border-l border-border pl-1">
        <button
          type="button"
          aria-label="Previous week"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => onShift(-7)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Next week"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => onShift(7)}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
