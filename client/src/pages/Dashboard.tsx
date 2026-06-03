import { useMemo, useState } from "react";
import {
  Banknote,
  CalendarIcon,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Percent,
  Repeat2,
  TrendingUp,
  UserRoundPlus,
  UsersRound,
  WalletCards,
} from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getJobs } from "@/lib/jobStorage";
import { loadSavedEstimates } from "@/utils/pricingStorage";
import type { Job } from "@/types/jobs";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const quickRanges = ["Today", "Yesterday", "This Week", "Last Week", "This Month", "Last Month"];

function formatInputDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}/${date.getFullYear()}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function uniqueCustomers(jobs: Job[]) {
  return new Set(jobs.map((job) => job.customerName.trim().toLowerCase()).filter(Boolean));
}

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(2026, 5, 1));
  const jobs = getJobs();
  const estimates = loadSavedEstimates();

  const metrics = useMemo(() => {
    const selectedJobs = jobs.filter((job) => {
      const candidate = job.scheduledStart ?? job.createdAt;
      return sameDay(new Date(candidate), selectedDate);
    });
    const completedJobs = selectedJobs.filter((job) => job.status === "completed");
    const paidJobs = selectedJobs.filter((job) => job.paymentStatus === "paid" || job.actuals?.chargedAmount);
    const collected = paidJobs.reduce((sum, job) => sum + (job.actuals?.chargedAmount ?? job.quotedAmount), 0);
    const totalQuoted = selectedJobs.reduce((sum, job) => sum + job.quotedAmount, 0);
    const customers = uniqueCustomers(selectedJobs);
    const repeatCustomers = Array.from(customers).filter((customer) => jobs.filter((job) => job.customerName.trim().toLowerCase() === customer).length > 1).length;
    const wonEstimates = estimates.filter((estimate) => jobs.some((job) => job.sourceEstimateId === estimate.id)).length;

    return {
      totalRevenue: totalQuoted,
      collected,
      jobsCompleted: completedJobs.length,
      grossMargin: totalQuoted ? Math.round((selectedJobs.reduce((sum, job) => sum + (job.estimatedProfit ?? 0), 0) / totalQuoted) * 100) : 0,
      averageJobSize: selectedJobs.length ? totalQuoted / selectedJobs.length : 0,
      newClients: customers.size,
      repeatCustomers,
      bookingRate: estimates.length ? selectedJobs.length / estimates.length : 0,
      closeRate: estimates.length ? wonEstimates / estimates.length : 0,
      estimatesWon: `${wonEstimates}:${Math.max(estimates.length - wonEstimates, 0)}`,
    };
  }, [estimates, jobs, selectedDate]);

  const cards = [
    { label: "Total Revenue", value: currency.format(metrics.totalRevenue), delta: "+0%", icon: WalletCards },
    { label: "Collected Payments", value: currency.format(metrics.collected), delta: "+0%", icon: Banknote },
    { label: "Jobs Completed", value: String(metrics.jobsCompleted), delta: "+0%", icon: CheckCheck },
    { label: "Gross Margin", value: `${metrics.grossMargin}%`, delta: "+0%", icon: Percent },
    { label: "Average Job Size", value: currency.format(metrics.averageJobSize), delta: "+0%", icon: TrendingUp },
    { label: "New Clients", value: String(metrics.newClients), delta: "+0%", icon: UsersRound },
    { label: "Repeat Customers", value: String(metrics.repeatCustomers), delta: "+100%", icon: Repeat2 },
    { label: "Booking Rate", value: `${(metrics.bookingRate * 100).toFixed(2)}%`, delta: "+0%", icon: Percent },
    { label: "Close Rate", value: `${(metrics.closeRate * 100).toFixed(2)}%`, delta: "+0%", icon: Percent },
    { label: "Estimates Won Ratio", value: metrics.estimatesWon, delta: "+0%", icon: UserRoundPlus },
  ];

  return (
    <>
      <div className="border-b border-border bg-background px-4 py-5 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">Daily revenue, client, and job performance at a glance.</p>
          </div>
          <DashboardDatePicker selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </div>
      </div>

      <div className="px-4 py-8 md:px-8">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <section key={card.label} className="min-h-[116px] rounded-lg border border-border bg-card p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-medium text-foreground">{card.label}</div>
                    <div className="mt-4 text-2xl font-bold tracking-normal text-foreground">{card.value}</div>
                  </div>
                  <Icon className="size-5 text-foreground" />
                </div>
                <div className="mt-4 text-right text-sm font-medium text-[#7180a8]">{card.delta}</div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

function DashboardDatePicker({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-10 w-full justify-between rounded-lg border-border bg-card px-4 text-base font-normal md:w-[230px]"
        >
          {formatInputDate(selectedDate)}
          <CalendarIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(calc(100vw-2rem),410px)] rounded-lg p-0">
        <div className="grid gap-0 sm:grid-cols-[132px_1fr]">
          <div className="space-y-1 border-b border-border p-4 sm:border-b-0 sm:border-r">
            {quickRanges.map((range) => (
              <button
                key={range}
                type="button"
                className={cn(
                  "block w-full rounded-md px-2 py-1.5 text-left text-base font-medium text-[#7180a8] transition-colors hover:bg-muted hover:text-primary",
                  range === "Today" && "text-primary",
                )}
                onClick={() => onSelectDate(new Date(2026, 5, 1))}
              >
                {range}
              </button>
            ))}
          </div>
          <div className="p-3">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && onSelectDate(date)}
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
                    <ChevronLeft className={cn("size-4", className)} {...props} />
                  ) : (
                    <ChevronRight className={cn("size-4", className)} {...props} />
                  ),
              }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
