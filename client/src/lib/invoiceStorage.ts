import type { InvoiceRecord } from "@/types/invoices";

const INVOICES_KEY = "junk_estimator_invoices_v1";

const defaultInvoices: InvoiceRecord[] = [
  {
    id: "invoice-3",
    invoiceNumber: 3,
    jobId: "3",
    clientName: "Sam Doe",
    clientEmail: "sam.doe@example.com",
    clientAddress: "5300 Lost Hills Road, Calabasas, CA 91302",
    createdAt: "2026-06-01T18:45:00.000Z",
    dueDate: "2026-06-02T12:00:00.000Z",
    total: 450,
    amountDue: 450,
    status: "overdue",
    notes: "Removal of 6-person hot tub from difficult access area. Unit was pre-disconnected. Thank you for your business!",
    items: [
      {
        id: "invoice-3-item-1",
        name: "Demo - Hot Tub Removal",
        quantity: 1,
        amount: 450,
        taxable: true,
      },
    ],
  },
  {
    id: "invoice-1",
    invoiceNumber: 1,
    jobId: "1",
    clientName: "John Doe",
    clientEmail: "john.doe@example.com",
    createdAt: "2026-06-01T18:45:00.000Z",
    dueDate: "2026-06-01T12:00:00.000Z",
    total: 845,
    amountDue: 0,
    status: "paid",
    items: [{ id: "invoice-1-item-1", name: "Junk Removal", quantity: 1, amount: 845, taxable: true }],
  },
  {
    id: "invoice-2",
    invoiceNumber: 2,
    jobId: "2",
    clientName: "Jane Doe",
    clientEmail: "jane.doe@example.com",
    createdAt: "2026-06-01T18:45:00.000Z",
    dueDate: "2026-06-01T12:00:00.000Z",
    total: 220,
    amountDue: 0,
    status: "paid",
    items: [{ id: "invoice-2-item-1", name: "Junk Removal", quantity: 1, amount: 220, taxable: true }],
  },
];

const canUseLocalStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

function readInvoices() {
  if (!canUseLocalStorage()) return defaultInvoices;
  try {
    const raw = window.localStorage.getItem(INVOICES_KEY);
    return raw ? (JSON.parse(raw) as InvoiceRecord[]) : defaultInvoices;
  } catch {
    return defaultInvoices;
  }
}

function writeInvoices(invoices: InvoiceRecord[]) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));
  window.dispatchEvent(new Event("invoices-updated"));
}

export function getInvoices(): InvoiceRecord[] {
  return readInvoices().sort((a, b) => {
    const statusRank = (invoice: InvoiceRecord) => (invoice.status === "overdue" ? 0 : invoice.status === "draft" ? 1 : 2);
    return statusRank(a) - statusRank(b) || a.invoiceNumber - b.invoiceNumber;
  });
}

export function getInvoice(invoiceId: string): InvoiceRecord | null {
  return getInvoices().find((invoice) => invoice.id === invoiceId) ?? null;
}

export function saveInvoice(invoice: InvoiceRecord): InvoiceRecord {
  const updated = { ...invoice };
  writeInvoices([updated, ...readInvoices().filter((item) => item.id !== invoice.id)]);
  return updated;
}

export function deleteInvoice(invoiceId: string): InvoiceRecord[] {
  const next = readInvoices().filter((invoice) => invoice.id !== invoiceId);
  writeInvoices(next);
  return next;
}
