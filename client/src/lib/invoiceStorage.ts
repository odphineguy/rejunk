import { currentStaffIdentity } from "@/lib/financialCache";
import { ensureSession, supabase } from "@/lib/supabase";
import type { InvoiceRecord } from "@/types/invoices";

const LEGACY_KEY = "junk_estimator_invoices_v1";
let invoices: InvoiceRecord[] = [];
const notify = () => window.dispatchEvent(new Event("invoices-updated"));

function isOriginalDemo(invoice: InvoiceRecord) {
  const demos: Record<string, [string, number]> = {
    "invoice-1": ["John Doe", 845],
    "invoice-2": ["Jane Doe", 220],
    "invoice-3": ["Sam Doe", 450],
  };
  const match = demos[invoice.id];
  return Boolean(
    match &&
      invoice.clientName === match[0] &&
      invoice.total === match[1] &&
      invoice.createdAt === "2026-06-01T18:45:00.000Z"
  );
}

function database() {
  if (!supabase) throw new Error("Invoice storage is unavailable.");
  return supabase as any;
}

export async function hydrateInvoices() {
  const identity = currentStaffIdentity();
  if (!identity || !(await ensureSession())) {
    invoices = [];
    notify();
    return;
  }
  const db = database();
  const initial = await db.from("app_invoices").select("data");
  if (initial.error) throw initial.error;
  const remote = (initial.data ?? []).map(
    (row: { data: InvoiceRecord }) => row.data
  );
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    const rows = JSON.parse(legacy) as InvoiceRecord[];
    if (
      !Array.isArray(rows) ||
      rows.some(row => !row.id || !Array.isArray(row.items))
    )
      throw new Error("Invalid saved invoice records.");
    const usedNumbers = new Set<number>(
      remote.map((row: InvoiceRecord) => row.invoiceNumber)
    );
    const usedIds = new Set<string>(remote.map((row: InvoiceRecord) => row.id));
    let nextNumber = Math.max(0, ...Array.from(usedNumbers)) + 1;
    const actualRows = rows
      .filter(row => !isOriginalDemo(row) && !usedIds.has(row.id))
      .map(row => {
        if (usedNumbers.has(row.invoiceNumber)) {
          while (usedNumbers.has(nextNumber)) nextNumber++;
          usedNumbers.add(nextNumber);
          return { ...row, invoiceNumber: nextNumber++ };
        }
        usedNumbers.add(row.invoiceNumber);
        return row;
      });
    if (actualRows.length) {
      const { error } = await db.from("app_invoices").upsert(
        actualRows.map(data => ({
          id: data.id,
          invoice_number: data.invoiceNumber,
          data,
        })),
        { onConflict: "id", ignoreDuplicates: true }
      );
      if (error) throw error;
    }
    localStorage.removeItem(LEGACY_KEY);
  }
  const { data, error } = legacy
    ? await db.from("app_invoices").select("data")
    : initial;
  if (error) throw error;
  if (identity !== currentStaffIdentity()) return;
  invoices = (data ?? []).map((row: { data: InvoiceRecord }) => row.data);
  notify();
}

export function getInvoices(): InvoiceRecord[] {
  return [...invoices].sort((a, b) => b.invoiceNumber - a.invoiceNumber);
}

export function getInvoice(invoiceId: string): InvoiceRecord | null {
  return invoices.find(invoice => invoice.id === invoiceId) ?? null;
}

export async function saveInvoice(
  invoice: InvoiceRecord
): Promise<InvoiceRecord> {
  if (!currentStaffIdentity() || !(await ensureSession()))
    throw new Error("Sign in to save invoices.");
  const { error } = await database().from("app_invoices").upsert(
    {
      id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      data: invoice,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) throw error;
  invoices = [invoice, ...invoices.filter(row => row.id !== invoice.id)];
  notify();
  return invoice;
}

export async function deleteInvoice(invoiceId: string): Promise<void> {
  if (!currentStaffIdentity() || !(await ensureSession()))
    throw new Error("Sign in to delete invoices.");
  const { error } = await database()
    .from("app_invoices")
    .delete()
    .eq("id", invoiceId);
  if (error) throw error;
  invoices = invoices.filter(invoice => invoice.id !== invoiceId);
  notify();
}

window.addEventListener("business-cache-reset", () => {
  invoices = [];
  notify();
});
