import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Bell,
  BriefcaseBusiness,
  Calculator,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Map as MapIcon,
  MessageSquare,
  Plus,
  Search,
  Settings,
  SquareArrowOutUpRight,
  Truck,
  UserPlus,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { clientName, getClients } from "@/lib/clientStorage";
import { employeeName, getEmployees } from "@/lib/employeeStorage";
import { getInvoices } from "@/lib/invoiceStorage";
import { getJobs } from "@/lib/jobStorage";
import { cn } from "@/lib/utils";
import { loadSavedEstimates } from "@/utils/pricingStorage";
import type { ClientRecord } from "@/types/clients";
import type { EmployeeRecord } from "@/types/employees";
import type { InvoiceRecord } from "@/types/invoices";
import type { Job } from "@/types/jobs";

const navGroups = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/messages", label: "Messages", icon: MessageSquare },
      { href: "/clients", label: "Clients & Leads", icon: UsersRound },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/jobs", label: "Jobs", icon: Truck },
      { href: "/map", label: "Map Facility", icon: MapIcon },
      { href: "/estimate-builder", label: "Estimates", icon: Calculator },
      { href: "/schedule", label: "Schedule", icon: CalendarDays },
      { href: "/invoices", label: "Invoices", icon: FileText },
      { href: "/employees", label: "Employees", icon: BriefcaseBusiness },
    ],
  },
  {
    label: "Admin",
    items: [{ href: "/settings", label: "Pricing Settings", icon: Settings }],
  },
];

const actionItems = [
  { href: "/messages", label: "Message", icon: MessageSquare },
  { href: "/clients/new", label: "Client or Lead", icon: UsersRound },
  { href: "/employees/new", label: "Employee", icon: UserPlus },
  { href: "/jobs/new", label: "Job", icon: Wrench },
  { href: "/invoices/new", label: "Invoice", icon: FileText },
  { href: "/estimate-builder", label: "Estimate", icon: Calculator },
  { href: "/events", label: "Event", icon: CalendarPlus },
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
  return clients.map((client) => ({
    id: client.id,
    title: clientName(client),
    subtitle: [client.phone, client.email].filter(Boolean).join(", ") || [client.company, client.city].filter(Boolean).join(", "),
    href: `/clients/${client.id}`,
  }));
}

function employeeRows(employees: EmployeeRecord[]) {
  return employees.map((employee) => ({
    id: employee.id,
    title: employeeName(employee),
    subtitle: [employee.email, employee.phone, employee.role].filter(Boolean).join(", "),
    href: `/employees/${employee.id}`,
  }));
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-muted/20 md:flex md:h-screen md:overflow-hidden">
      <aside className="hidden w-[248px] shrink-0 border-r border-border bg-card md:flex md:h-screen md:flex-col">
        <Link href="/" className="flex h-20 items-center border-b border-border px-6">
          <img src="/rejunk-whites.png" alt="reJunk" className="h-20 w-auto" />
        </Link>

        <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-2">
              <div className="px-2 text-xs font-medium text-muted-foreground">{group.label}</div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                        active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted",
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:h-screen md:overflow-hidden">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur md:static">
          <div className="flex min-h-20 flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
            <GlobalSearch />
            <div className="flex flex-wrap items-center gap-3">
              <AddNewMenu />
              <button className="flex size-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted" aria-label="Notifications">
                <Bell className="size-5" />
              </button>
              <button className="flex h-10 items-center gap-2 rounded-full px-2 text-sm font-medium text-primary transition-colors hover:bg-muted" aria-label="Account menu">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary/10">AM</span>
                <ChevronDown className="size-4 text-foreground" />
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto border-t border-border px-4 py-3 md:hidden">
            {navGroups.flatMap((group) => group.items).map((item) => {
              const Icon = item.icon;
              const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </header>

        <main className="min-w-0 md:flex-1 md:overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export function OperationsShell({ title, eyebrow, actions, children }: { title: string; eyebrow?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="border-b border-border bg-background px-4 py-5 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            {eyebrow && <div className="text-sm font-medium text-muted-foreground">{eyebrow}</div>}
            <h1 className="mt-1 text-2xl font-bold text-foreground md:text-3xl">{title}</h1>
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
      <div className="px-4 py-6 md:px-6">{children}</div>
    </>
  );
}

export function AddNewMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-10 gap-2 rounded-lg bg-[#3f3df1] px-2 pr-4 text-white hover:bg-[#3330df]">
          <span className="flex size-8 items-center justify-center rounded-md bg-[#1515d6]">
            <Plus className="size-5" />
          </span>
          <span>Add New</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 rounded-lg p-3">
        {actionItems.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.label} asChild className="rounded-md px-3 py-2.5 text-[15px]">
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
  const [jobs, setJobs] = useState<Job[]>(() => getJobs());
  const [clients, setClients] = useState<ClientRecord[]>(() => getClients());
  const [employees, setEmployees] = useState<EmployeeRecord[]>(() => getEmployees());
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(() => getInvoices());
  const [estimates, setEstimates] = useState(() => loadSavedEstimates());
  const trimmedQuery = query.trim().toLowerCase();

  useEffect(() => {
    const refresh = () => {
      setJobs(getJobs());
      setClients(getClients());
      setEmployees(getEmployees());
      setInvoices(getInvoices());
      setEstimates(loadSavedEstimates());
    };
    window.addEventListener("jobs-updated", refresh);
    window.addEventListener("clients-updated", refresh);
    window.addEventListener("employees-updated", refresh);
    window.addEventListener("invoices-updated", refresh);
    window.addEventListener("pricing-settings-updated", refresh);
    return () => {
      window.removeEventListener("jobs-updated", refresh);
      window.removeEventListener("clients-updated", refresh);
      window.removeEventListener("employees-updated", refresh);
      window.removeEventListener("invoices-updated", refresh);
      window.removeEventListener("pricing-settings-updated", refresh);
    };
  }, []);

  const groups = useMemo<SearchGroup[]>(() => {
    if (!trimmedQuery) return [];
    const matches = (values: Array<string | number | undefined>) =>
      values
        .filter((value) => value !== undefined && value !== null)
        .join(" ")
        .toLowerCase()
        .includes(trimmedQuery);

    const clientResults = clientRows(clients)
      .filter((client) => matches([client.title, client.subtitle]))
      .slice(0, 4);

    const employeeResults = employeeRows(employees)
      .filter((employee) => matches([employee.title, employee.subtitle]))
      .slice(0, 4);

    const jobRows = jobs
      .filter((job) => matches([job.jobNumber, job.customerName, job.jobLabel, job.address, job.city, job.quotedAmount]))
      .slice(0, 4)
      .map((job) => ({
        id: job.id,
        title: `${job.jobNumber} - ${job.customerName}`,
        subtitle: `${formatSearchDate(job.scheduledStart)}, ${job.city ?? "no city"}`,
        href: `/jobs/${job.id}`,
      }));

    const invoiceRows = invoices
      .filter((invoice) => matches([invoice.invoiceNumber, invoice.jobId, invoice.clientName, invoice.total, invoice.status]))
      .slice(0, 3)
      .map((invoice) => ({
        id: invoice.id,
        title: `Invoice #${invoice.invoiceNumber}`,
        subtitle: `${invoice.clientName} - ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(invoice.total)}`,
        href: `/invoices/${invoice.id}`,
      }));

    const estimateRows = estimates
      .filter((estimate) => matches([estimate.customerName, estimate.loadLabel, estimate.jobAddress, estimate.finalQuote]))
      .slice(0, 3)
      .map((estimate) => ({
        id: estimate.id,
        title: estimate.customerName || estimate.loadLabel || "Saved estimate",
        subtitle: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(estimate.finalQuote),
        href: "/estimate-builder",
      }));

    return [
      { label: "Clients", href: "/clients", icon: UsersRound, items: clientResults },
      { label: "Employees", href: "/employees", icon: BriefcaseBusiness, items: employeeResults },
      { label: "Jobs", href: "/jobs", icon: ClipboardList, items: jobRows },
      { label: "Invoices", href: "/invoices", icon: FileText, items: invoiceRows },
      { label: "Estimates", href: "/estimate-builder", icon: Calculator, items: estimateRows },
    ].filter((group) => group.items.length > 0);
  }, [clients, employees, estimates, invoices, jobs, trimmedQuery]);

  const resultCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="relative w-full md:max-w-[370px]">
      <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search"
        className="h-10 rounded-lg bg-card pl-10 pr-10 text-base"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="absolute right-3 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border border-foreground text-foreground"
          aria-label="Clear search"
        >
          <X className="size-3" />
        </button>
      )}

      {query && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 max-h-[70vh] w-full overflow-y-auto rounded-lg border border-border bg-popover p-6 shadow-xl md:w-[370px]">
          {groups.length > 0 ? (
            <div className="space-y-6">
              {groups.map((group) => {
                const Icon = group.icon;
                return (
                  <section key={group.label} className="space-y-3">
                    <div className="flex items-center gap-2 text-primary">
                      <Icon className="size-4" />
                      <span className="text-base font-medium">{group.label}</span>
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-xs text-[#7180a8]">{group.items.length} result</span>
                    </div>
                    <div className="space-y-3">
                      {group.items.map((item) => (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={() => setQuery("")}
                          className="group flex items-start justify-between gap-3 rounded-md"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-base font-semibold text-foreground">{item.title}</span>
                            {item.subtitle && <span className="mt-0.5 block truncate text-sm text-[#7180a8]">{item.subtitle}</span>}
                          </span>
                          <SquareArrowOutUpRight className="mt-1 size-4 shrink-0 text-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </Link>
                      ))}
                    </div>
                  </section>
                );
              })}
              <div className="border-t border-border pt-3 text-xs text-[#7180a8]">{resultCount} total results</div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No clients, employees, jobs, invoices, or estimates match that search.</div>
          )}
        </div>
      )}
    </div>
  );
}
