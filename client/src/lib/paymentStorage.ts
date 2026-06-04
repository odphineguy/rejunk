import type { PaymentRecord } from "@/types/payments";

const PAYMENTS_KEY = "junk_estimator_payments_v1";

const now = "2026-06-01T18:45:00.000Z";

const defaultPayments: PaymentRecord[] = [
  {
    id: "payment-1",
    customerName: "John Doe",
    method: "Cash",
    baseAmount: 845,
    tip: 0,
    paidAt: "2026-06-01T12:00:00.000Z",
    jobId: "1",
    invoiceId: "1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "payment-2",
    customerName: "Jane Doe",
    method: "Offline Credit Card",
    baseAmount: 220,
    tip: 0,
    paidAt: "2026-06-01T12:00:00.000Z",
    jobId: "2",
    invoiceId: "2",
    createdAt: now,
    updatedAt: now,
  },
];

const canUseLocalStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

function readPayments() {
  if (!canUseLocalStorage()) return defaultPayments;
  try {
    const raw = window.localStorage.getItem(PAYMENTS_KEY);
    return raw ? (JSON.parse(raw) as PaymentRecord[]) : defaultPayments;
  } catch {
    return defaultPayments;
  }
}

function writePayments(payments: PaymentRecord[]) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
  window.dispatchEvent(new Event("payments-updated"));
}

export function getPayments(): PaymentRecord[] {
  return readPayments().sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
}

export function deletePayment(paymentId: string): PaymentRecord[] {
  const next = readPayments().filter((payment) => payment.id !== paymentId);
  writePayments(next);
  return next;
}
