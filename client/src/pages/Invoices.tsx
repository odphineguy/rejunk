import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  CalendarClock,
  CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  MoreHorizontal,
  Paperclip,
  Plus,
  Save,
  Search,
  Send,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { deleteInvoice, getInvoice, getInvoices, saveInvoice } from "@/lib/invoiceStorage";
import { cn } from "@/lib/utils";
import type { InvoiceRecord, InvoiceStatus } from "@/types/invoices";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatInvoiceDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatInputDate(value: string) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}/${date.getFullYear()}`;
}

export default function Invoices() {
  const [, params] = useRoute("/invoices/:invoiceId");
  const [isNewRoute] = useRoute("/invoices/new");

  if (isNewRoute) return <InvoiceDetails invoiceId="new" initialInvoice={newDraftInvoice()} isNew />;
  if (params?.invoiceId) return <InvoiceDetails invoiceId={params.invoiceId} />;
  return <InvoiceList />;
}

function newDraftInvoice(): InvoiceRecord {
  const nextNumber = Math.max(0, ...getInvoices().map((invoice) => invoice.invoiceNumber)) + 1;
  const now = new Date().toISOString();
  return {
    id: `invoice-draft-${nextNumber}`,
    invoiceNumber: nextNumber,
    jobId: "",
    clientName: "New Client",
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

function InvoiceHeader({ crumb, actions }: { crumb?: string; actions?: React.ReactNode }) {
  return (
    <div className="border-b border-border bg-background px-4 py-5 md:px-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-base">
          <FileText className="size-5 text-[#7180a8]" />
          <Link href="/invoices" className="text-[#7180a8] hover:text-[#3f3df1]">
            Invoices
          </Link>
          {crumb && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium text-foreground">{crumb}</span>
            </>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

function InvoiceList() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(() => getInvoices());
  const [query, setQuery] = useState("");
  const [, navigate] = useLocation();

  useEffect(() => {
    const refresh = () => setInvoices(getInvoices());
    window.addEventListener("invoices-updated", refresh);
    return () => window.removeEventListener("invoices-updated", refresh);
  }, []);

  const filteredInvoices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const searchable = [invoice.invoiceNumber, invoice.jobId, invoice.clientName, invoice.status, invoice.total].join(" ").toLowerCase();
      return !normalizedQuery || searchable.includes(normalizedQuery);
    });
  }, [invoices, query]);

  const dueTotal = invoices.filter((invoice) => invoice.status !== "paid").reduce((sum, invoice) => sum + invoice.amountDue, 0);
  const overdueTotal = invoices.filter((invoice) => invoice.status === "overdue").reduce((sum, invoice) => sum + invoice.amountDue, 0);

  const removeInvoice = (event: React.MouseEvent, invoiceId: string) => {
    event.stopPropagation();
    setInvoices(deleteInvoice(invoiceId));
    toast.success("Invoice deleted");
  };

  return (
    <>
      <InvoiceHeader
        actions={
          <Button asChild className="rounded-lg bg-[#3f3df1] text-white hover:bg-[#3330df]">
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
            <InvoiceMetric icon={CheckCircle2} iconClassName="bg-green-100 text-green-600" amount={dueTotal} label="Due from Invoices" />
            <div className="hidden h-16 bg-border md:block" />
            <InvoiceMetric icon={CalendarClock} iconClassName="bg-red-50 text-red-500" amount={overdueTotal} label="Overdue from Invoices" />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-[400px]">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." className="h-12 rounded-lg pl-10 pr-10" />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7180a8]" aria-label="Clear invoice search">
                  x
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <FilterSelect value="Tags" options={["Tags", "Overdue", "Paid"]} />
              <FilterSelect value="10" options={["10", "25", "50"]} />
              <Button variant="outline" size="icon" className="size-10 rounded-lg">
                <MoreHorizontal className="size-4" />
              </Button>
            </div>
          </div>

          <div className="mt-6">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-14 px-8">
                    <Checkbox aria-label="Select all invoices" />
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
                {filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${invoice.id}`)}>
                    <TableCell className="px-8" onClick={(event) => event.stopPropagation()}>
                      <Checkbox aria-label={`Select invoice ${invoice.invoiceNumber}`} />
                    </TableCell>
                    <TableCell>{invoice.invoiceNumber}</TableCell>
                    <TableCell>{invoice.jobId}</TableCell>
                    <TableCell>{invoice.clientName}</TableCell>
                    <TableCell>{formatInvoiceDate(invoice.dueDate)}</TableCell>
                    <TableCell>{money.format(invoice.total)}</TableCell>
                    <TableCell>
                      <InvoiceStatusBadge status={invoice.status} />
                    </TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={(event) => removeInvoice(event, invoice.id)} aria-label={`Delete invoice ${invoice.invoiceNumber}`}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 text-sm md:flex-row md:items-center md:justify-between">
          <span>{filteredInvoices.length ? `Showing 1-${filteredInvoices.length} of ${filteredInvoices.length} results` : "No results."}</span>
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" className="size-10 rounded-lg">
              <ChevronLeft className="size-4" />
            </Button>
            <span>Page 1 of 1</span>
            <Button variant="outline" size="icon" className="size-10 rounded-lg">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

function InvoiceDetails({ invoiceId, initialInvoice, isNew = false }: { invoiceId: string; initialInvoice?: InvoiceRecord; isNew?: boolean }) {
  const [, navigate] = useLocation();
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(() => initialInvoice ?? getInvoice(invoiceId));

  if (!invoice) {
    return (
      <>
        <InvoiceHeader crumb="Invoice Details" />
        <div className="px-4 py-8 md:px-8">Invoice not found.</div>
      </>
    );
  }

  const subtotal = invoice.items.reduce((sum, item) => sum + item.quantity * item.amount, 0);
  const amountDue = invoice.status === "paid" ? 0 : subtotal;

  const updateInvoice = (updates: Partial<InvoiceRecord>) => setInvoice((current) => (current ? { ...current, ...updates } : current));
  const persistInvoice = () => {
    const saved = saveInvoice({ ...invoice, amountDue, total: subtotal });
    setInvoice(saved);
    toast.success("Invoice saved");
  };

  return (
    <>
      <InvoiceHeader
        crumb={`${isNew ? "New Invoice" : "Invoice Details"} - #${invoice.invoiceNumber}`}
        actions={
          <>
            <Button variant="outline" className="rounded-lg border-red-400 text-red-500 hover:text-red-500">
              <CalendarClock className="size-4" />
              {invoice.status === "overdue" ? "Overdue" : invoice.status === "paid" ? "Paid" : "Draft"}
            </Button>
            <Button variant="outline" className="rounded-lg">
              <Send className="size-4" />
              Send Invoice
            </Button>
            <Button onClick={persistInvoice} className="rounded-lg bg-[#3f3df1] text-white hover:bg-[#3330df]">
              <Save className="size-4" />
              Save
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-10 rounded-lg">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-lg p-2">
                <DropdownMenuItem onClick={() => toast.info("Preview placeholder")}>
                  <ExternalLink className="size-4" />
                  Preview
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info("PDF download placeholder")}>
                  <Download className="size-4" />
                  Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const invoiceUrl = `${window.location.origin}/invoices/${invoice.id}`;
                    if (navigator.clipboard) {
                      void navigator.clipboard.writeText(invoiceUrl).then(() => toast.success("Invoice link copied"));
                    } else {
                      toast.info(invoiceUrl);
                    }
                  }}
                >
                  <Copy className="size-4" />
                  Copy Invoice Link
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/jobs/${invoice.jobId}`}>
                    <WalletCards className="size-4" />
                    View Job
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    deleteInvoice(invoice.id);
                    toast.success("Invoice deleted");
                    navigate("/invoices");
                  }}
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
              <Input value={invoice.invoiceNumber} readOnly className="h-10 w-24 rounded-lg" />
            </div>
            <Button variant="outline" className="w-fit rounded-full border-[#3f3df1] text-[#3f3df1] hover:text-[#3f3df1]">
              Edit Client
            </Button>
          </div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="text-sm font-medium text-[#7180a8]">Client:</div>
              <div className="mt-2 text-2xl font-semibold">{invoice.clientName}</div>
              {invoice.clientAddress && (
                <div className="mt-5 flex items-center gap-3 text-sm">
                  <MapPin className="size-4 fill-foreground" />
                  {invoice.clientAddress}
                </div>
              )}
              {invoice.clientEmail && (
                <div className="mt-5 flex items-center gap-3 text-sm">
                  <Mail className="size-4 fill-foreground" />
                  {invoice.clientEmail}
                </div>
              )}
            </div>
            <div className="w-full overflow-hidden rounded-lg border border-foreground lg:w-[246px]">
              <InvoiceMeta label="JOB ID" value={invoice.jobId} link />
              <InvoiceMeta label="CREATED" value={formatInvoiceDate(invoice.createdAt)} />
              <InvoiceMeta label="DUE DATE" value={formatInvoiceDate(invoice.dueDate)} />
            </div>
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-5">
            <Panel>
              <SectionHeader icon={FileText} title="Items" action={<Button variant="outline" className="rounded-full border-[#3f3df1] text-[#3f3df1] hover:text-[#3f3df1]">Add Item</Button>} />
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
                  {invoice.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.name}
                        {item.taxable && <Badge className="ml-2 rounded-full bg-[#efedff] text-[#3f3df1]">Taxable</Badge>}
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{money.format(item.amount)}</TableCell>
                      <TableCell>{money.format(item.quantity * item.amount)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon">
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Edit3 className="size-4 text-[#7180a8]" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>

            <Panel>
              <SectionHeader icon={CreditCard} title="Payments" action={<Button variant="outline" className="rounded-full border-[#3f3df1] text-[#3f3df1] hover:text-[#3f3df1]">Add Payment</Button>} />
              <p className="text-sm text-[#7180a8]">No payments made</p>
            </Panel>

            <Panel>
              <SectionHeader icon={ClipboardList} title="Summary" />
              <div className="space-y-0 text-sm">
                <SummaryRow label={<span>Items Subtotal <span className="text-[#7180a8]">({invoice.items.length} item)</span></span>} value={money.format(subtotal)} />
                <SummaryRow label="Discounts Subtotal" action="Add Discount" value="-$0.00" />
                <SummaryRow label="Taxes" action="Select ..." value="$0.00" />
                <SummaryRow label="Total" value={money.format(subtotal)} />
                <SummaryRow label="Amount Due" value={money.format(amountDue)} valueClassName="text-red-500 font-semibold" />
              </div>
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel>
              <SectionHeader icon={ExternalLink} title="More" />
              <FieldLabel>Due Date</FieldLabel>
              <div className="relative">
                <Input value={formatInputDate(invoice.dueDate)} onChange={(event) => updateInvoice({ dueDate: new Date(event.target.value).toISOString() })} className="h-12 rounded-lg pr-12" />
                <CalendarIcon className="absolute right-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
              </div>
            </Panel>

            <Panel>
              <SectionHeader icon={FileText} title="Notes" />
              <Textarea value={invoice.notes ?? ""} onChange={(event) => updateInvoice({ notes: event.target.value })} className="min-h-[160px] rounded-lg p-6" />
            </Panel>

            <Panel>
              <SectionHeader
                icon={Paperclip}
                title="Attachments"
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="rounded-full border-[#3f3df1] text-[#3f3df1] hover:text-[#3f3df1]">Add Photo/Doc</Button>
                    <Button variant="outline" className="rounded-full border-[#3f3df1] text-[#3f3df1] hover:text-[#3f3df1]">Transfer from Job</Button>
                  </div>
                }
              />
              <p className="text-sm text-[#7180a8]">No attachments found</p>
            </Panel>

            <Panel>
              <SectionHeader icon={Signature} title="Signature" />
              <div className="h-48 rounded-lg border border-dashed border-[#dce1f1] bg-background" />
              <div className="mt-5 flex justify-end">
                <Button variant="secondary" className="rounded-lg bg-[#efedff] text-[#3f3df1] hover:bg-[#e5e2ff]">
                  Save Signature
                </Button>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}

function InvoiceMetric({ icon: Icon, iconClassName, amount, label }: { icon: typeof CheckCircle2; iconClassName: string; amount: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("flex size-10 items-center justify-center rounded-lg", iconClassName)}>
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-2xl font-bold">{money.format(amount)}</div>
        <div className="mt-2 text-sm text-[#7180a8]">{label}</div>
      </div>
    </div>
  );
}

function FilterSelect({ value, options }: { value: string; options: string[] }) {
  return (
    <Select value={value}>
      <SelectTrigger className="h-10 min-w-[90px] rounded-lg bg-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
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
  return <Badge className={cn("rounded-full px-3 font-normal capitalize", className)}>{status}</Badge>;
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-lg border border-border bg-card p-6 shadow-sm">{children}</section>;
}

function SectionHeader({ icon: Icon, title, action }: { icon: typeof FileText; title: string; action?: React.ReactNode }) {
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
  return <label className="mb-3 block text-sm font-semibold text-foreground">{children}</label>;
}

function InvoiceMeta({ label, value, link = false }: { label: string; value: string; link?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-foreground px-5 py-4 text-sm last:border-b-0">
      <div className="font-semibold">{label}</div>
      <div className={cn("text-right", link && "text-[#7180a8] underline")}>{value}</div>
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
      {action && <button className="text-[#3f3df1] underline-offset-2 hover:underline">{action}</button>}
      <div className={cn("text-right", valueClassName)}>{value}</div>
    </div>
  );
}
