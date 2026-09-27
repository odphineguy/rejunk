import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  Signature,
  Trash2,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteInvoice,
  getInvoice,
  getInvoices,
  saveInvoice,
} from "@/lib/invoiceStorage";
import { getJobs } from "@/lib/jobStorage";
import { isOwner } from "@/lib/staffSession";
import {
  getInvoiceCompanyInfo,
  getInvoiceSettings,
} from "@/lib/invoiceSettings";
import {
  buildInvoicePdf,
  downloadInvoicePdf,
  invoiceTotals,
} from "@/utils/invoicePdf";
import { cn } from "@/lib/utils";
import type { InvoiceRecord, InvoiceStatus } from "@/types/invoices";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatInvoiceDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function displayStatus(invoice: InvoiceRecord): InvoiceStatus {
  if (
    (invoice.status === "sent" || invoice.status === "partial") &&
    invoice.amountDue > 0 &&
    new Date(invoice.dueDate).getTime() < Date.now()
  )
    return "overdue";
  return invoice.status;
}

export default function Invoices() {
  const [, params] = useRoute("/invoices/:invoiceId");
  const [isNewRoute] = useRoute("/invoices/new");

  if (isNewRoute)
    return (
      <InvoiceDetails
        invoiceId="new"
        initialInvoice={newDraftInvoice()}
        isNew
      />
    );
  if (params?.invoiceId) return <InvoiceDetails invoiceId={params.invoiceId} />;
  return <InvoiceList />;
}

function newDraftInvoice(): InvoiceRecord {
  const nextNumber =
    Math.max(0, ...getInvoices().map(invoice => invoice.invoiceNumber)) + 1;
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    invoiceNumber: nextNumber,
    jobId: "",
    clientName: "",
    clientEmail: "",
    clientAddress: "",
    createdAt: now,
    dueDate: now,
    total: 0,
    amountDue: 0,
    status: "draft",
    notes: "",
    items: [],
  };
}

function InvoiceHeader({
  crumb,
  actions,
}: {
  crumb?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border bg-background px-4 py-5 md:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-[10px] border border-border bg-card text-[var(--moss-deep)] shadow-sm">
            <FileText className="size-[18px]" />
          </span>
          <Link
            href="/invoices"
            className="font-display text-xl font-bold tracking-tight text-foreground hover:text-[#155e3f]"
          >
            Invoices
          </Link>
          {crumb && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium text-foreground">{crumb}</span>
            </>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}

function InvoiceList() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(() =>
    getInvoices()
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Status");
  const [pageSize, setPageSize] = useState("10");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [, navigate] = useLocation();

  useEffect(() => {
    const refresh = () => setInvoices(getInvoices());
    window.addEventListener("invoices-updated", refresh);
    return () => window.removeEventListener("invoices-updated", refresh);
  }, []);

  const filteredInvoices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return invoices.filter(invoice => {
      const matchesStatus =
        statusFilter === "Status" ||
        displayStatus(invoice) === statusFilter.toLowerCase();
      const searchable = [
        invoice.invoiceNumber,
        invoice.jobId,
        invoice.clientName,
        invoice.status,
        invoice.total,
      ]
        .join(" ")
        .toLowerCase();
      return (
        matchesStatus &&
        (!normalizedQuery || searchable.includes(normalizedQuery))
      );
    });
  }, [invoices, query, statusFilter]);

  const size = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / size));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * size;
  const pagedInvoices = filteredInvoices.slice(pageStart, pageStart + size);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, pageSize]);

  const dueTotal = invoices
    .filter(invoice =>
      ["sent", "partial", "overdue"].includes(displayStatus(invoice))
    )
    .reduce((sum, invoice) => sum + invoice.amountDue, 0);
  const overdueTotal = invoices
    .filter(invoice => displayStatus(invoice) === "overdue")
    .reduce((sum, invoice) => sum + invoice.amountDue, 0);

  const removeInvoice = async (event: React.MouseEvent, invoiceId: string) => {
    event.stopPropagation();
    if (!window.confirm("Delete this invoice? This can't be undone.")) return;
    try {
      await deleteInvoice(invoiceId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete invoice"
      );
      return;
    }
    setInvoices(getInvoices());
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(invoiceId);
      return next;
    });
    toast.success("Invoice deleted");
  };

  const visibleIds = pagedInvoices.map(invoice => invoice.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some(id => selectedIds.has(id));

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) visibleIds.forEach(id => next.add(id));
      else visibleIds.forEach(id => next.delete(id));
      return next;
    });
  };

  const toggleOne = (invoiceId: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(invoiceId);
      else next.delete(invoiceId);
      return next;
    });
  };

  const deleteSelected = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (
      !window.confirm(
        `Delete ${count} invoice${count === 1 ? "" : "s"}? This can't be undone.`
      )
    )
      return;
    try {
      await Promise.all(Array.from(selectedIds).map(id => deleteInvoice(id)));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete invoices"
      );
      setInvoices(getInvoices());
      return;
    }
    setInvoices(getInvoices());
    setSelectedIds(new Set());
    toast.success(`${count} invoice${count === 1 ? "" : "s"} deleted`);
  };

  return (
    <>
      <InvoiceHeader
        actions={
          <Button
            asChild
            className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]"
          >
            <Link href="/invoices/new">
              <Plus className="size-4" />
              Create Invoice
            </Link>
          </Button>
        }
      />
      <div className="space-y-5 px-4 py-8 md:px-8">
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mx-auto grid max-w-3xl gap-8 md:grid-cols-[1fr_1px_1fr] md:items-center">
            <InvoiceMetric
              icon={CheckCircle2}
              iconClassName="bg-green-100 text-green-600"
              amount={dueTotal}
              label="Due from Invoices"
            />
            <div className="hidden h-16 bg-border md:block" />
            <InvoiceMetric
              icon={CalendarClock}
              iconClassName="bg-red-50 text-red-500"
              amount={overdueTotal}
              label="Overdue from Invoices"
            />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-[400px]">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
              <Input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search..."
                className="h-12 rounded-lg pl-10 pr-10"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8a9180]"
                  aria-label="Clear invoice search"
                >
                  x
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <FilterSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  "Status",
                  "Draft",
                  "Sent",
                  "Partial",
                  "Overdue",
                  "Paid",
                  "Void",
                ]}
              />
              <FilterSelect
                value={pageSize}
                onChange={setPageSize}
                options={["10", "25", "50"]}
              />
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm">
              <span className="font-medium">{selectedIds.size} selected</span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={deleteSelected}
                >
                  <Trash2 className="size-4" />
                  Delete selected
                </Button>
              </div>
            </div>
          )}

          <div className="mt-6">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-14 px-8">
                    <Checkbox
                      aria-label="Select all invoices"
                      checked={
                        allVisibleSelected
                          ? true
                          : someVisibleSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={checked =>
                        toggleAllVisible(checked === true)
                      }
                    />
                  </TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Job ID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedInvoices.map(invoice => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/invoices/${invoice.id}`)}
                  >
                    <TableCell
                      className="px-8"
                      onClick={event => event.stopPropagation()}
                    >
                      <Checkbox
                        aria-label={`Select invoice ${invoice.invoiceNumber}`}
                        checked={selectedIds.has(invoice.id)}
                        onCheckedChange={checked =>
                          toggleOne(invoice.id, checked === true)
                        }
                      />
                    </TableCell>
                    <TableCell>{invoice.invoiceNumber}</TableCell>
                    <TableCell>{invoice.jobId || "—"}</TableCell>
                    <TableCell>{invoice.clientName}</TableCell>
                    <TableCell>{formatInvoiceDate(invoice.dueDate)}</TableCell>
                    <TableCell>{money.format(invoice.total)}</TableCell>
                    <TableCell>
                      <InvoiceStatusBadge status={displayStatus(invoice)} />
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={event => event.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={event => removeInvoice(event, invoice.id)}
                        aria-label={`Delete invoice ${invoice.invoiceNumber}`}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {pagedInvoices.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-12 text-center text-muted-foreground"
                    >
                      No invoices yet. Create one to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 text-sm md:flex-row md:items-center md:justify-between">
          <span>
            {filteredInvoices.length
              ? `Showing ${pageStart + 1}-${pageStart + pagedInvoices.length} of ${filteredInvoices.length} results`
              : "No results."}
          </span>
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              className="size-10 rounded-lg"
              disabled={currentPage <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-10 rounded-lg"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

function InvoiceDetails({
  invoiceId,
  initialInvoice,
  isNew = false,
}: {
  invoiceId: string;
  initialInvoice?: InvoiceRecord;
  isNew?: boolean;
}) {
  const [, navigate] = useLocation();
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(
    () => initialInvoice ?? getInvoice(invoiceId)
  );
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [settings, setSettings] = useState(getInvoiceSettings);
  const [company, setCompany] = useState(getInvoiceCompanyInfo);
  useEffect(() => {
    if (isNew) return;
    const refresh = () => setInvoice(getInvoice(invoiceId));
    window.addEventListener("invoices-updated", refresh);
    return () => window.removeEventListener("invoices-updated", refresh);
  }, [invoiceId, isNew]);
  useEffect(() => {
    const refresh = () => {
      setSettings(getInvoiceSettings());
      setCompany(getInvoiceCompanyInfo());
    };
    window.addEventListener("settings-updated", refresh);
    return () => window.removeEventListener("settings-updated", refresh);
  }, []);

  if (!invoice) {
    return (
      <>
        <InvoiceHeader crumb="Invoice Details" />
        <div className="px-4 py-8 md:px-8">Invoice not found.</div>
      </>
    );
  }

  const totals = invoiceTotals(invoice);
  const jobs = getJobs();

  const updateInvoice = (updates: Partial<InvoiceRecord>) =>
    setInvoice(current => (current ? { ...current, ...updates } : current));
  const persistInvoice = async () => {
    if (!invoice.clientName.trim()) {
      toast.error("Enter a client name");
      return;
    }
    if (
      !invoice.items.length ||
      invoice.items.some(
        item =>
          !item.name.trim() ||
          !Number.isFinite(item.quantity) ||
          !Number.isFinite(item.amount) ||
          item.quantity <= 0 ||
          item.amount < 0
      )
    ) {
      toast.error("Add at least one valid item");
      return;
    }
    if (
      ![
        invoice.discount ?? 0,
        invoice.taxRate ?? 0,
        invoice.amountPaid ?? 0,
      ].every(value => Number.isFinite(value) && value >= 0)
    ) {
      toast.error("Discount, tax, and paid amount must be valid numbers");
      return;
    }
    setSaving(true);
    try {
      const status =
        totals.amountDue === 0
          ? "paid"
          : totals.amountPaid > 0
            ? "partial"
            : invoice.status === "paid"
              ? "draft"
              : invoice.status;
      const saved = await saveInvoice({
        ...invoice,
        status,
        total: totals.total,
        amountDue: totals.amountDue,
      });
      setInvoice(saved);
      toast.success("Invoice saved");
      if (isNew) navigate(`/invoices/${saved.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save invoice"
      );
    } finally {
      setSaving(false);
    }
  };
  const updateItem = (
    id: string,
    patch: Partial<InvoiceRecord["items"][number]>
  ) =>
    updateInvoice({
      items: invoice.items.map(item =>
        item.id === id ? { ...item, ...patch } : item
      ),
    });
  const previewPdf = async () => {
    const previewWindow = window.open("", "_blank");
    if (!previewWindow) {
      toast.error("Allow popups to preview the invoice");
      return;
    }
    previewWindow.opener = null;
    setPreviewing(true);
    try {
      const pdf = await buildInvoicePdf({
        ...invoice,
        total: totals.total,
        amountDue: totals.amountDue,
      });
      const url = URL.createObjectURL(pdf.output("blob"));
      previewWindow.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      previewWindow.close();
      toast.error("Could not preview PDF");
    } finally {
      setPreviewing(false);
    }
  };
  const downloadPdf = async () => {
    try {
      await downloadInvoicePdf({
        ...invoice,
        total: totals.total,
        amountDue: totals.amountDue,
      });
    } catch {
      toast.error("Could not create PDF");
    }
  };

  return (
    <>
      <InvoiceHeader
        crumb={`${isNew ? "New Invoice" : "Invoice Details"} - #${invoice.invoiceNumber}`}
        actions={
          <>
            <Select
              value={invoice.status}
              onValueChange={(status: InvoiceStatus) =>
                updateInvoice({
                  status,
                  ...(status === "paid"
                    ? { amountPaid: totals.total }
                    : status === "draft"
                      ? { amountPaid: 0 }
                      : {}),
                })
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["draft", "sent", "partial", "overdue", "paid", "void"].map(
                  status => (
                    <SelectItem
                      key={status}
                      value={status}
                      className="capitalize"
                    >
                      {status}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => void downloadPdf()}
              className="rounded-lg"
            >
              <Download className="size-4" />
              Download PDF
            </Button>
            <Button
              onClick={() => void persistInvoice()}
              disabled={saving}
              className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]"
            >
              <Save className="size-4" />
              Save
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-10 rounded-lg"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-lg p-2">
                <DropdownMenuItem
                  disabled={previewing}
                  onClick={() => void previewPdf()}
                >
                  <ExternalLink className="size-4" />
                  Preview
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void downloadPdf()}>
                  <Download className="size-4" />
                  Download PDF
                </DropdownMenuItem>
                {invoice.jobId && (
                  <DropdownMenuItem asChild>
                    <Link href={`/jobs/${invoice.jobId}`}>
                      <WalletCards className="size-4" />
                      View Job
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    void deleteInvoice(invoice.id)
                      .then(() => {
                        toast.success("Invoice deleted");
                        navigate("/invoices");
                      })
                      .catch(error =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not delete invoice"
                        )
                      )
                  }
                >
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="space-y-5 px-4 py-8 md:px-8">
        <Panel>
          <div className="flex flex-col gap-6 border-b border-border pb-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">Invoice #</h1>
              <Input
                value={invoice.invoiceNumber}
                readOnly
                className="h-10 w-24 rounded-lg"
              />
            </div>
            {isOwner() && <Link
              href="/settings/invoices"
              className="text-sm text-[#155e3f] underline"
            >
              Invoice Settings
            </Link>}
          </div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="text-sm font-medium text-[#8a9180]">Client:</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Input
                  aria-label="Client name"
                  value={invoice.clientName}
                  onChange={event =>
                    updateInvoice({ clientName: event.target.value })
                  }
                  placeholder="Client name"
                />
                <Input
                  aria-label="Client email"
                  type="email"
                  value={invoice.clientEmail ?? ""}
                  onChange={event =>
                    updateInvoice({ clientEmail: event.target.value })
                  }
                  placeholder="Email"
                />
                <Input
                  aria-label="Client address"
                  className="md:col-span-2"
                  value={invoice.clientAddress ?? ""}
                  onChange={event =>
                    updateInvoice({ clientAddress: event.target.value })
                  }
                  placeholder="Billing address"
                />
              </div>
              {(settings.showCompanyName ||
                settings.showCompanyAddress ||
                settings.showCompanyLogo) && (
                <p className="mt-4 text-xs text-muted-foreground">
                  PDF letterhead:{" "}
                  {settings.showCompanyName
                    ? company.companyName
                    : "Company name hidden"}
                  {settings.showCompanyAddress && company.companyAddress
                    ? ` · ${company.companyAddress}`
                    : ""}
                  {settings.showCompanyLogo && company.logoDataUrl
                    ? " · Logo"
                    : ""}
                </p>
              )}
            </div>
            <div className="w-full overflow-hidden rounded-lg border border-foreground lg:w-[246px]">
              <div className="border-b border-foreground px-5 py-3 text-sm">
                <label className="font-semibold" htmlFor="invoice-job">
                  JOB
                </label>
                <Select
                  value={invoice.jobId || "none"}
                  onValueChange={value => {
                    const job = jobs.find(row => row.id === value);
                    updateInvoice({
                      jobId: value === "none" ? "" : value,
                      ...(job
                        ? {
                            clientName: job.customerName,
                            clientEmail: job.email ?? "",
                            clientAddress: [
                              job.address,
                              job.city,
                              job.state,
                              job.zip,
                            ]
                              .filter(Boolean)
                              .join(", "),
                            items: invoice.items.length
                              ? invoice.items
                              : job.quotedAmount > 0
                                ? [
                                    {
                                      id: crypto.randomUUID(),
                                      name:
                                        job.jobLabel ||
                                        job.serviceType.replaceAll("_", " "),
                                      quantity: 1,
                                      amount: job.quotedAmount,
                                      taxable: false,
                                    },
                                  ]
                                : [],
                          }
                        : {}),
                    });
                  }}
                >
                  <SelectTrigger id="invoice-job" className="mt-2">
                    <SelectValue placeholder="Select job" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked job</SelectItem>
                    {jobs.map(job => (
                      <SelectItem key={job.id} value={job.id}>
                        #{job.jobNumber} · {job.customerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <InvoiceMeta
                label="CREATED"
                value={formatInvoiceDate(invoice.createdAt)}
              />
              <InvoiceMeta
                label="DUE DATE"
                value={formatInvoiceDate(invoice.dueDate)}
              />
            </div>
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-5">
            <Panel>
              <SectionHeader
                icon={FileText}
                title="Items"
                action={
                  <Button
                    variant="outline"
                    onClick={() =>
                      updateInvoice({
                        items: [
                          ...invoice.items,
                          {
                            id: crypto.randomUUID(),
                            name: "",
                            quantity: 1,
                            amount: 0,
                            taxable: false,
                          },
                        ],
                      })
                    }
                    className="rounded-full border-[#155e3f] text-[#155e3f] hover:text-[#155e3f]"
                  >
                    Add Item
                  </Button>
                }
              />
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Input
                          aria-label="Item description"
                          value={item.name}
                          onChange={event =>
                            updateItem(item.id, { name: event.target.value })
                          }
                          placeholder="Description"
                        />
                        <label className="mt-2 flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={item.taxable ?? false}
                            onCheckedChange={checked =>
                              updateItem(item.id, { taxable: checked === true })
                            }
                          />
                          Taxable
                        </label>
                      </TableCell>
                      <TableCell>
                        <Input
                          aria-label="Quantity"
                          type="number"
                          min="0.01"
                          step="0.01"
                          className="w-20"
                          value={item.quantity}
                          onChange={event =>
                            updateItem(item.id, {
                              quantity: Number(event.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          aria-label="Unit price"
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-28"
                          value={item.amount}
                          onChange={event =>
                            updateItem(item.id, {
                              amount: Number(event.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {money.format(item.quantity * item.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove item"
                          onClick={() =>
                            updateInvoice({
                              items: invoice.items.filter(
                                row => row.id !== item.id
                              ),
                            })
                          }
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>

            <Panel>
              <SectionHeader icon={CreditCard} title="Payment recorded" />
              <FieldLabel>Amount already paid</FieldLabel>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={
                  invoice.amountPaid ??
                  (invoice.status === "paid" ? invoice.total : 0)
                }
                onChange={event =>
                  updateInvoice({ amountPaid: Number(event.target.value) })
                }
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Enter payments received outside this invoice. Card collection is
                not connected here.
              </p>
            </Panel>

            <Panel>
              <SectionHeader icon={ClipboardList} title="Summary" />
              <div className="space-y-0 text-sm">
                <SummaryRow
                  label={
                    <span>
                      Items Subtotal{" "}
                      <span className="text-[#8a9180]">
                        ({invoice.items.length} items)
                      </span>
                    </span>
                  }
                  value={money.format(totals.subtotal)}
                />
                <div className="flex items-center justify-between gap-3 border-b border-border py-3">
                  <span>Discount</span>
                  <Input
                    aria-label="Discount amount"
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-28"
                    value={invoice.discount ?? 0}
                    onChange={event =>
                      updateInvoice({ discount: Number(event.target.value) })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-border py-3">
                  <span>Tax rate (%)</span>
                  <Input
                    aria-label="Tax rate percent"
                    type="number"
                    min="0"
                    step="0.001"
                    className="w-28"
                    value={invoice.taxRate ?? 0}
                    onChange={event =>
                      updateInvoice({ taxRate: Number(event.target.value) })
                    }
                  />
                </div>
                <SummaryRow label="Tax" value={money.format(totals.tax)} />
                <SummaryRow label="Total" value={money.format(totals.total)} />
                <SummaryRow
                  label="Paid"
                  value={money.format(totals.amountPaid)}
                />
                <SummaryRow
                  label="Amount Due"
                  value={money.format(totals.amountDue)}
                  valueClassName="text-red-500 font-semibold"
                />
              </div>
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel>
              <SectionHeader icon={ExternalLink} title="More" />
              <FieldLabel>Due Date</FieldLabel>
              <div className="relative">
                <Input
                  type="date"
                  value={invoice.dueDate.slice(0, 10)}
                  onChange={event =>
                    updateInvoice({
                      dueDate: `${event.target.value}T12:00:00.000Z`,
                    })
                  }
                  className="h-12 rounded-lg pr-12"
                />
              </div>
            </Panel>

            <Panel>
              <SectionHeader icon={FileText} title="Notes" />
              <Textarea
                value={invoice.notes ?? ""}
                onChange={event => updateInvoice({ notes: event.target.value })}
                className="min-h-[160px] rounded-lg p-6"
              />
            </Panel>

            {settings.invoiceSignature && (
              <Panel>
                <SectionHeader icon={Signature} title="Customer signature" />
                <p className="text-sm text-muted-foreground">
                  A signature line will appear on the downloaded PDF.
                </p>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function InvoiceMetric({
  icon: Icon,
  iconClassName,
  amount,
  label,
}: {
  icon: typeof CheckCircle2;
  iconClassName: string;
  amount: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-lg",
          iconClassName
        )}
      >
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-2xl font-bold">{money.format(amount)}</div>
        <div className="mt-2 text-sm text-[#8a9180]">{label}</div>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange?: (value: string) => void;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 min-w-[90px] rounded-lg bg-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(option => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const className =
    status === "overdue"
      ? "bg-red-50 text-foreground"
      : status === "paid"
        ? "bg-green-100 text-foreground"
        : "bg-muted text-foreground";
  return (
    <Badge
      className={cn("rounded-full px-3 font-normal capitalize", className)}
    >
      {status}
    </Badge>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
      {children}
    </section>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof FileText;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        <Icon className="size-5" />
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-3 block text-sm font-semibold text-foreground">
      {children}
    </label>
  );
}

function InvoiceMeta({
  label,
  value,
  link = false,
}: {
  label: string;
  value: string;
  link?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-foreground px-5 py-4 text-sm last:border-b-0">
      <div className="font-semibold">{label}</div>
      <div className={cn("text-right", link && "text-[#8a9180] underline")}>
        {value}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  action,
  valueClassName,
}: {
  label: React.ReactNode;
  value: string;
  action?: string;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border py-3 last:border-b-0">
      <div className="font-medium">{label}</div>
      {action && (
        <button className="text-[#155e3f] underline-offset-2 hover:underline">
          {action}
        </button>
      )}
      <div className={cn("text-right", valueClassName)}>{value}</div>
    </div>
  );
}
