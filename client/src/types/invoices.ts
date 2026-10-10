export type InvoiceStatus =
  | "paid"
  | "overdue"
  | "draft"
  | "sent"
  | "partial"
  | "void";

export interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  amount: number;
  taxable?: boolean;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: number;
  jobId: string;
  clientName: string;
  clientEmail?: string;
  clientAddress?: string;
  dueDate: string;
  createdAt: string;
  total: number;
  amountDue: number;
  amountPaid?: number;
  /** Set by the server once a durable received-payment record exists. */
  paymentRecorded?: boolean;
  taxRate?: number;
  taxName?: string;
  discount?: number;
  status: InvoiceStatus;
  notes?: string;
  items: InvoiceItem[];
}
