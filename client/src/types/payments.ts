export type PaymentMethod = "Cash" | "Offline Credit Card" | "Credit Card" | "Check" | "ACH";

export interface PaymentRecord {
  id: string;
  customerName: string;
  method: PaymentMethod;
  baseAmount: number;
  tip: number;
  paidAt: string;
  jobId?: string;
  invoiceId?: string;
  createdAt: string;
  updatedAt: string;
}
