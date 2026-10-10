import { cacheReceivedInvoice } from "@/lib/invoiceStorage";
import { currentStaffIdentity } from "@/lib/financialCache";
import type { PaymentRecord } from "@/types/payments";
import { supabase, ensureSession } from "@/lib/supabase";
import { getStoredStaffSession, isOwner } from "@/lib/staffSession";

const LEGACY_KEY = "junk_estimator_payments_v1";
let payments: PaymentRecord[] = [];
const notify = () => window.dispatchEvent(new Event("payments-updated"));
/** Import only explicitly persisted records, never the old demo fallback. */
export async function hydratePayments() {
  const requestIdentity = currentStaffIdentity();
  if (!supabase || !isOwner() || !(await ensureSession())) {
    payments = [];
    notify();
    return;
  }
  const db = supabase as any;
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    const rows = JSON.parse(legacy) as PaymentRecord[];
    if (!Array.isArray(rows) || rows.some(r => !r.id))
      throw new Error("Invalid legacy payment records.");
    if (rows.length) {
      const { error } = await db.from("app_payments").upsert(
        rows.map(data => ({ id: data.id, data })),
        { onConflict: "id", ignoreDuplicates: true }
      );
      if (error) throw error; // Keep the only old copy until the owner-only import succeeds.
    }
    localStorage.removeItem(LEGACY_KEY);
  }
  const { data, error } = await db.from("app_payments").select("data");
  if (error) throw error;
  if (requestIdentity !== currentStaffIdentity()) return;
  payments = (data ?? []).map((r: any) => r.data);
  notify();
}
export function getPayments(): PaymentRecord[] {
  return isOwner()
    ? [...payments].sort(
        (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
      )
    : [];
}
export function deletePayment(id: string): PaymentRecord[] {
  if (!isOwner()) throw new Error("Owner access required.");
  const previous = payments;
  payments = payments.filter(p => p.id !== id);
  notify();
  void (async () => {
    if (!supabase || !(await ensureSession()))
      throw new Error("Sign in required.");
    const { error } = await (supabase as any)
      .from("app_payments")
      .delete()
      .eq("id", id);
    if (error) throw error;
  })().catch(error => {
    payments = previous;
    notify();
    console.error("Payment deletion failed", error);
  });
  return payments;
}
window.addEventListener("business-cache-reset", () => {
  payments = [];
  notify();
});

export class ReceivedPaymentError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/** Durable save first; retries keep the same request ID and never create a charge. */
export async function recordReceivedPayment(input: {
  requestId: string;
  invoiceId: string;
  method: string;
  amount: number;
  expectedPaid: number;
  receivedDate: string;
  reference: string;
}): Promise<{ payment: PaymentRecord; duplicate: boolean }> {
  if (!isOwner()) throw new Error("Owner access required.");
  const identity = currentStaffIdentity();
  const response = await fetch("/api/pay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      action: "record-received",
      token: getStoredStaffSession()?.token,
    }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new ReceivedPaymentError(
      result.error || "Could not record payment.",
      response.status
    );
  if (identity !== currentStaffIdentity())
    throw new Error("Account changed. Sign in and check Payments.");
  payments = [
    result.payment,
    ...payments.filter(payment => payment.id !== result.payment.id),
  ];
  notify();
  cacheReceivedInvoice(result.invoice);
  return result;
}
