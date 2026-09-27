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
  taxRate?: number;
  taxName?: string;
  discount?: number;
  status: InvoiceStatus;
  notes?: string;
  items: InvoiceItem[];
}
