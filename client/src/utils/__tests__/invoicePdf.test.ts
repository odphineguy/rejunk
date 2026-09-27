import { describe, expect, it } from "vitest";
import { buildInvoicePdf, invoiceTotals } from "../invoicePdf";
import type { InvoiceRecord } from "@/types/invoices";

const invoice: InvoiceRecord = {
  id: "test-invoice",
  invoiceNumber: 42,
  jobId: "job-1",
  clientName: "Customer Test",
  createdAt: "2026-09-27T12:00:00.000Z",
  dueDate: "2026-10-04T12:00:00.000Z",
  total: 0,
  amountDue: 0,
  amountPaid: 25,
  discount: 10,
  taxRate: 8.6,
  status: "partial",
  items: [
    { id: "one", name: "Removal", quantity: 2, amount: 50, taxable: true },
    {
      id: "two",
      name: "Donation trip",
      quantity: 1,
      amount: 40,
      taxable: false,
    },
  ],
};

describe("invoice PDF", () => {
  it("calculates discounts and tax only on taxable items", () => {
    expect(invoiceTotals(invoice)).toEqual({
      subtotal: 140,
      discount: 10,
      tax: 7.99,
      total: 137.99,
      amountPaid: 25,
      amountDue: 112.99,
    });
  });

  it("creates a downloadable PDF document", async () => {
    const pdf = await buildInvoicePdf(invoice);
    expect(pdf.output()).toMatch(/^%PDF-/);
    expect(pdf.getNumberOfPages()).toBe(1);
  });
});
