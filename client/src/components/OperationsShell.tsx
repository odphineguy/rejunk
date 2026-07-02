import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Bell,
  Banknote,
  BriefcaseBusiness,
  Calculator,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  MessageSquare,
  PackageSearch,
  Plus,
  Search,
  Settings,
  SquareArrowOutUpRight,
  UserPlus,
  UsersRound,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { WeatherChip } from "@/components/WeatherChip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clientName, getClients } from "@/lib/clientStorage";
import { DISPATCH_MESSAGES_EVENT, getThreads, getUnreadTotalFromCache, subscribeToMessages } from "@/lib/dispatchMessageStorage";
import { employeeName, getEmployees } from "@/lib/employeeStorage";
import { eventAddress, getEvents } from "@/lib/eventStorage";
import { getInvoices } from "@/lib/invoiceStorage";
import { getJobs } from "@/lib/jobStorage";
import { getPayments } from "@/lib/paymentStorage";
import { clearStaffSession, getStoredStaffSession } from "@/lib/staffSession";
import { useStaffSession } from "@/hooks/useStaffSession";
import { cn } from "@/lib/utils";
import { loadSavedEstimates } from "@/utils/pricingStorage";
import type { ClientRecord } from "@/types/clients";
import type { EmployeeRecord } from "@/types/employees";
import type { EventRecord } from "@/types/events";
import type { InvoiceRecord } from "@/types/invoices";
import type { Job } from "@/types/jobs";
import type { PaymentRecord } from "@/types/payments";

const navGroups = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/messages", label: "Messages", icon: MessageSquare },
      { href: "/clients", label: "Clients & Leads", icon: UsersRound },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/jobs", label: "Jobs", icon: Wrench },
      { href: "/dispatch", label: "Dispatch Center", icon: MapIcon },
      { href: "/map", label: "Map Facility", icon: MapIcon },
      { href: "/estimate-builder", label: "Estimates", icon: Calculator },
      { href: "/schedule", label: "Schedule", icon: CalendarDays },
      { href: "/events", label: "Events", icon: CalendarPlus },
      { href: "/invoices", label: "Invoices", icon: FileText },
      { href: "/payments", label: "Payments", icon: Banknote, ownerOnly: true },
      { href: "/pricebook", label: "Pricebook", icon: PackageSearch, ownerOnly: true },
      { href: "/employees", label: "Employees", icon: BriefcaseBusiness },
    ],
  },
  {
    label: "Admin",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

const actionItems = [
  { href: "/messages", label: "Message", icon: MessageSquare },
  { href: "/clients/new", label: "Client or Lead", icon: UsersRound },
  { href: "/employees/new", label: "Employee", icon: UserPlus },
  { href: "/jobs/new", label: "Job", icon: Wrench },
  { href: "/invoices/new", label: "Invoice", icon: FileText },
  { href: "/estimate-builder", label: "Estimate", icon: Calculator },
  { href: "/events/new", label: "Event", icon: CalendarPlus },
];

type SearchGroup = {
  label: string;
  href: string;
  icon: typeof UsersRound;
  items: Array<{
    id: string;
    title: string;
    subtitle?: string;
    href: string;
  }>;
};

function formatSearchDate(value?: string) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function clientRows(clients: ClientRecord[]) {
  return clients.map(client => ({
    id: client.id,
    title: clientName(client),
    subtitle:
      [client.phone, client.email].filter(Boolean).join(", ") ||
      [client.company, client.city].filter(Boolean).join(", "),
    href: `/clients/${client.id}`,
  }));
}

function employeeRows(employees: EmployeeRecord[]) {
  return employees.map(employee => ({
    id: employee.id,
    title: employeeName(employee),
    subtitle: [employee.email, employee.phone, employee.role]
      .filter(Boolean)
      .join(", "),
    href: `/employees/${employee.id}`,
  }));
}

function eventRows(events: EventRecord[]) {
  return events.map(event => ({
    id: event.id,
    title: event.title,
    subtitle: [formatSearchDate(event.startDate), eventAddress(event)]
      .filter(Boolean)
      .join(", "),
    href: `/events/${event.id}`,
  }));
}

function paymentRows(payments: PaymentRecord[]) {
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  return payments.map(payment => ({
    id: payment.id,
    title: payment.customerName,
    subtitle: [
      payment.method,
      money.format(payment.baseAmount + payment.tip),
      payment.invoiceId ? `Invoice ${payment.invoiceId}` : undefined,
    ]
      .filter(Boolean)
      .join(", "),
    href: "/payments",
  }));
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { isOwner: isOwnerUser } = useStaffSession();
  const [unread, setUnread] = useState(() => getUnreadTotalFromCache());
  const [shellJobs, setShellJobs] = useState<Job[]>(() => getJobs());

  // Office Staff don't see owner-only areas (pricing setup, payments).
  const visibleGroups = navGroups.map(group => ({
    ...group,
    items: group.items.filter(item => isOwnerUser || !("ownerOnly" in item)),
  }));

  useEffect(() => {
    // Hydrate threads so the Messages badge is accurate, then track changes.
    void getThreads().then(() => setUnread(getUnreadTotalFromCache()));
    const updateUnread = () => setUnread(getUnreadTotalFromCache());
    const updateJobs = () => setShellJobs(getJobs());
    window.addEventListener(DISPATCH_MESSAGES_EVENT, updateUnread);
    window.addEventListener("jobs-updated", updateJobs);
    const unsubMessages = subscribeToMessages(updateUnread);
    return () => {
      window.removeEventListener(DISPATCH_MESSAGES_EVENT, updateUnread);
      window.removeEventListener("jobs-updated", updateJobs);
      unsubMessages();
    };
  }, []);

  const onRouteJobs = shellJobs.filter(
    job => job.status === "on_my_way" || job.status === "in_progress"
  ).length;
  const activeJobs = shellJobs.filter(job =>
    ["scheduled", "on_my_way", "in_progress"].includes(job.status)
  ).length;
  const crewPct = activeJobs > 0 ? Math.round((onRouteJobs / activeJobs) * 100) : 0;

  const unreadBadge =
    unread > 0 ? (
      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
        {unread > 99 ? "99+" : unread}
      </span>
    ) : null;

  return (
    <div className="min-h-screen bg-background md:flex md:h-screen md:overflow-hidden">
      <aside className="sidebar-pine hidden w-[268px] shrink-0 md:flex md:h-screen md:flex-col">
        <Link
          href="/dashboard"
          className="block border-b border-[var(--pine-line)] px-5 pb-4 pt-5"
        >
          <img src="/rejunk-mark.png" alt="Rejunk" className="h-9 w-auto" />
          <div className="mt-2.5 px-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--pine-text-dim)]">
            Field Ops Platform
          </div>
        </Link>

        <nav className="pine-scroll flex-1 overflow-y-auto px-3.5 py-3">
          {visibleGroups.map((group, groupIndex) => (
            <div key={group.label}>
              <div
                className={cn(
                  "mb-2 flex items-center gap-2.5 px-2.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--pine-text-dim)]",
                  groupIndex === 0 ? "mt-1" : "mt-5"
                )}
              >
                {group.label}
                <span className="h-px flex-1 bg-[var(--pine-line)]" />
              </div>
              <div>
                {group.items.map(item => {
                  const Icon = item.icon;
                  const active =
                    location === item.href ||
                    (item.href !== "/" && location.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "relative mb-0.5 flex h-10 items-center gap-3 rounded-[10px] border border-transparent px-3 text-sm font-semibold transition-colors",
                        active
                          ? "border-[rgba(131,226,130,0.28)] bg-gradient-to-r from-[rgba(131,226,130,0.16)] to-[rgba(131,226,130,0.05)] text-[#f3f7e9] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                          : "text-[var(--pine-text)] hover:bg-white/5 hover:text-[#e8ead9]"
                      )}
                    >
                      {active && (
                        <span className="absolute -left-3.5 top-1/2 h-[22px] w-[3px] -translate-y-1/2 rounded-r-[3px] bg-[var(--moss)] shadow-[0_0_10px_rgba(131,226,130,0.6)]" />
                      )}
                      <Icon
                        className={cn(
                          "size-[18px] shrink-0",
                          active ? "text-[var(--moss)]" : "opacity-75"
                        )}
                      />
                      {item.label}
                      {item.href === "/messages" && unread > 0 && (
                        <span className="ml-auto rounded-full border border-[rgba(201,139,60,0.35)] bg-[rgba(201,139,60,0.18)] px-2 py-px font-display text-[11px] font-bold text-[#deb277]">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                      {item.href === "/jobs" && onRouteJobs > 0 && (
                        <span className="ml-auto rounded-full border border-[rgba(131,226,130,0.3)] bg-[rgba(131,226,130,0.15)] px-2 py-px font-display text-[11px] font-bold text-[#b8e89e]">
                          {onRouteJobs} live
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mx-3.5 mb-4 rounded-[14px] border border-[var(--pine-line)] bg-gradient-to-br from-[var(--pine-800)] to-[var(--pine-850)] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex items-center gap-2.5">
            <span className="pulse-dot size-2 rounded-full bg-[var(--moss)] shadow-[0_0_8px_rgba(131,226,130,0.7)]" />
            <span className="text-xs font-bold text-[#e3e9da]">Crews on route</span>
            <span className="ml-auto font-display text-[11px] font-semibold text-[var(--pine-text-dim)]">
              {onRouteJobs} / {activeJobs}
            </span>
          </div>
          <div className="mt-2.5 h-[5px] overflow-hidden rounded bg-white/10">
            <span
              className="block h-full rounded bg-gradient-to-r from-[var(--moss-deep)] to-[var(--moss)] transition-[width] duration-1000"
              style={{ width: `${crewPct}%` }}
            />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:h-screen md:overflow-hidden">
        <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-md md:static">
          <div className="flex min-h-[68px] flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
            <GlobalSearch />
            <div className="flex flex-wrap items-center gap-2.5">
              <AddNewMenu />
              <WeatherChip />
              <button
                className="relative flex size-11 items-center justify-center rounded-[11px] border border-border bg-card text-muted-foreground transition-colors hover:border-[var(--line-strong)] hover:bg-muted"
                aria-label="Notifications"
              >
                <Bell className="size-[18px]" />
                <span className="absolute right-2.5 top-2 size-2 rounded-full border-2 border-card bg-[var(--amber)]" />
              </button>
              <AccountMenu />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto border-t border-border px-4 py-3 md:hidden">
            {visibleGroups
              .flatMap(group => group.items)
              .map(item => {
                const Icon = item.icon;
                const active =
                  location === item.href ||
                  (item.href !== "/" && location.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-muted"
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                    {item.href === "/messages" && unreadBadge}
                  </Link>
                );
              })}
          </div>
        </header>

        <main className="min-w-0 md:flex-1 md:overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export function OperationsShell({
  title,
  icon: Icon,
  actions,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="border-b border-border bg-background px-4 py-5 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            {Icon && (
              <span className="flex size-9 items-center justify-center rounded-[10px] border border-border bg-card text-[var(--moss-deep)] shadow-sm">
                <Icon className="size-[18px]" />
              </span>
            )}
            <span className="font-display text-xl font-bold tracking-tight text-foreground">
              {title}
            </span>
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
      <div className="px-4 py-6 md:px-6">{children}</div>
    </>
  );
}

/**
 * The header account chip. Signing out clears the staff session — the
 * StaffSessionGate listens for the session event and bounces to /login.
 */
function AccountMenu() {
  const session = getStoredStaffSession();
  const initials = (session?.fullName ?? "Rejunk Staff")
    .split(/\s+/)
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-11 items-center gap-2 rounded-[11px] border border-border bg-card px-2 text-sm font-medium transition-colors hover:border-[var(--line-strong)] hover:bg-muted"
          aria-label="Account menu"
        >
          <span className="flex size-8 items-center justify-center rounded-[9px] bg-gradient-to-br from-[#1f7a4a] to-[#052a2b] font-display text-[11px] font-extrabold tracking-wide text-[#dde8c2]">
            {initials}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-lg p-2">
        <div className="px-3 py-2">
          <div className="truncate text-sm font-semibold text-foreground">
            {session?.fullName ?? "Signed in"}
          </div>
          {session?.email && (
            <div className="truncate text-xs text-muted-foreground">{session.email}</div>
          )}
        </div>
        <DropdownMenuItem
          className="rounded-md px-3 py-2.5 text-[15px] text-destructive focus:text-destructive"
          onClick={() => clearStaffSession()}
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AddNewMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-11 gap-2 rounded-[11px] border border-[#11604a] bg-gradient-to-br from-[#0f5132] to-[#052a2b] px-4 text-sm font-bold text-[#eafbe7] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_4px_12px_-4px_rgba(5,42,43,0.5)] transition hover:from-[#136040] hover:to-[#063537]">
          <Plus className="size-4" />
          <span>Add New</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 rounded-lg p-3">
        {actionItems.map(item => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.label}
              asChild
              className="rounded-md px-3 py-2.5 text-[15px]"
            >
              <Link href={item.href}>
                <Icon className="size-4 text-foreground" />
                {item.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GlobalSearch() {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  const { isOwner: isOwnerUser } = useStaffSession();
  const [jobs, setJobs] = useState<Job[]>(() => getJobs());
  const [clients, setClients] = useState<ClientRecord[]>(() => getClients());
  const [employees, setEmployees] = useState<EmployeeRecord[]>(() =>
    getEmployees()
  );
  const [events, setEvents] = useState<EventRecord[]>(() => getEvents());
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(() =>
    getInvoices()
  );
  const [payments, setPayments] = useState<PaymentRecord[]>(() =>
    getPayments()
  );
  const [estimates, setEstimates] = useState(() => loadSavedEstimates());
  const trimmedQuery = query.trim().toLowerCase();

  useEffect(() => {
    const refresh = () => {
      setJobs(getJobs());
      setClients(getClients());
      setEmployees(getEmployees());
      setEvents(getEvents());
      setInvoices(getInvoices());
      setPayments(getPayments());
      setEstimates(loadSavedEstimates());
    };
    window.addEventListener("jobs-updated", refresh);
    window.addEventListener("clients-updated", refresh);
    window.addEventListener("employees-updated", refresh);
    window.addEventListener("events-updated", refresh);
    window.addEventListener("invoices-updated", refresh);
    window.addEventListener("payments-updated", refresh);
    window.addEventListener("pricing-settings-updated", refresh);
    return () => {
      window.removeEventListener("jobs-updated", refresh);
      window.removeEventListener("clients-updated", refresh);
      window.removeEventListener("employees-updated", refresh);
      window.removeEventListener("events-updated", refresh);
      window.removeEventListener("invoices-updated", refresh);
      window.removeEventListener("payments-updated", refresh);
      window.removeEventListener("pricing-settings-updated", refresh);
    };
  }, []);

  const groups = useMemo<SearchGroup[]>(() => {
    if (!trimmedQuery) return [];
    const matches = (values: Array<string | number | undefined>) =>
      values
        .filter(value => value !== undefined && value !== null)
        .join(" ")
        .toLowerCase()
        .includes(trimmedQuery);

    const clientResults = clientRows(clients)
      .filter(client => matches([client.title, client.subtitle]))
      .slice(0, 4);

    const employeeResults = employeeRows(employees)
      .filter(employee => matches([employee.title, employee.subtitle]))
      .slice(0, 4);

    const eventResults = eventRows(events)
      .filter(event => matches([event.title, event.subtitle]))
      .slice(0, 4);

    const jobRows = jobs
      .filter(job =>
        matches([
          job.jobNumber,
          job.customerName,
          job.jobLabel,
          job.address,
          job.city,
          job.quotedAmount,
        ])
      )
      .slice(0, 4)
      .map(job => ({
        id: job.id,
        title: `${job.jobNumber} - ${job.customerName}`,
        subtitle: `${formatSearchDate(job.scheduledStart)}, ${job.city ?? "no city"}`,
        href: `/jobs/${job.id}`,
      }));

    const invoiceRows = invoices
      .filter(invoice =>
        matches([
          invoice.invoiceNumber,
          invoice.jobId,
          invoice.clientName,
          invoice.total,
          invoice.status,
        ])
      )
      .slice(0, 3)
      .map(invoice => ({
        id: invoice.id,
        title: `Invoice #${invoice.invoiceNumber}`,
        subtitle: `${invoice.clientName} - ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(invoice.total)}`,
        href: `/invoices/${invoice.id}`,
      }));

    const paymentResults = paymentRows(payments)
      .filter(payment => matches([payment.title, payment.subtitle]))
      .slice(0, 3);

    const estimateRows = estimates
      .filter(estimate =>
        matches([
          estimate.customerName,
          estimate.loadLabel,
          estimate.jobAddress,
          estimate.finalQuote,
        ])
      )
      .slice(0, 3)
      .map(estimate => ({
        id: estimate.id,
        title: estimate.customerName || estimate.loadLabel || "Saved estimate",
        subtitle: new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(estimate.finalQuote),
        href: "/estimate-builder",
      }));

    return [
      {
        label: "Clients",
        href: "/clients",
        icon: UsersRound,
        items: clientResults,
      },
      {
        label: "Employees",
        href: "/employees",
        icon: BriefcaseBusiness,
        items: employeeResults,
      },
      {
        label: "Events",
        href: "/events",
        icon: CalendarPlus,
        items: eventResults,
      },
      { label: "Jobs", href: "/jobs", icon: ClipboardList, items: jobRows },
      {
        label: "Invoices",
        href: "/invoices",
        icon: FileText,
        items: invoiceRows,
      },
      // Payments are owner-only — never surface them to Office Staff.
      ...(isOwnerUser
        ? [
            {
              label: "Payments",
              href: "/payments",
              icon: Banknote,
              items: paymentResults,
            },
          ]
        : []),
      {
        label: "Estimates",
        href: "/estimate-builder",
        icon: Calculator,
        items: estimateRows,
      },
    ].filter(group => group.items.length > 0);
  }, [
    clients,
    employees,
    events,
    estimates,
    invoices,
    jobs,
    payments,
    trimmedQuery,
    isOwnerUser,
  ]);

  const resultCount = groups.reduce(
    (sum, group) => sum + group.items.length,
    0
  );

  return (
    <div className="relative w-full md:max-w-[440px]">
      <div className="flex h-11 items-center gap-2.5 rounded-[11px] border border-border bg-card px-3 transition-shadow focus-within:border-[var(--moss-deep)] focus-within:ring-[3px] focus-within:ring-[rgba(31,122,74,0.12)]">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search jobs, clients, invoices…"
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="flex size-5 shrink-0 items-center justify-center rounded-full border border-muted-foreground text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-3" />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded-md border border-b-2 border-border bg-muted px-2 py-0.5 font-display text-[11px] font-semibold text-muted-foreground md:block">
            ⌘ K
          </kbd>
        )}
      </div>

      {query && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 max-h-[70vh] w-full overflow-y-auto rounded-lg border border-border bg-popover p-6 shadow-xl md:w-[370px]">
          {groups.length > 0 ? (
            <div className="space-y-6">
              {groups.map(group => {
                const Icon = group.icon;
                return (
                  <section key={group.label} className="space-y-3">
                    <div className="flex items-center gap-2 text-primary">
                      <Icon className="size-4" />
                      <span className="text-base font-medium">
                        {group.label}
                      </span>
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-xs text-[#8a9180]">
                        {group.items.length} result
                      </span>
                    </div>
                    <div className="space-y-3">
                      {group.items.map(item => (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={() => setQuery("")}
                          className="group flex items-start justify-between gap-3 rounded-md"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-base font-semibold text-foreground">
                              {item.title}
                            </span>
                            {item.subtitle && (
                              <span className="mt-0.5 block truncate text-sm text-[#8a9180]">
                                {item.subtitle}
                              </span>
                            )}
                          </span>
                          <SquareArrowOutUpRight className="mt-1 size-4 shrink-0 text-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </Link>
                      ))}
                    </div>
                  </section>
                );
              })}
              <div className="border-t border-border pt-3 text-xs text-[#8a9180]">
                {resultCount} total results
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No clients, employees, events, jobs, invoices, or estimates match
              that search.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
