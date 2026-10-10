export type PaymentMethod =
  | "Zelle"
  | "Cash"
  | "Offline Credit Card"
  | "Credit Card"
  | "Check"
  | "ACH";

export interface PaymentRecord {
  id: string;
  customerName: string;
  method: PaymentMethod;
  baseAmount: number;
  tip: number;
  paidAt: string;
  jobId?: string;
  invoiceId?: string;
  /** Client this payment belongs to; older records fall back to a customerName lookup. */
  clientId?: string;
  createdAt: string;
  updatedAt: string;
  reference?: string;
  source?: "manual";
  recordedBy?: string;
}
