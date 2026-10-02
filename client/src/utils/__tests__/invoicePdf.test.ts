import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildInvoicePdf, invoiceTotals } from "../invoicePdf";
import { DEFAULT_INVOICE_SETTINGS } from "@/lib/invoiceSettings";
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

  it("uses the company logo and omits it when disabled or missing", async () => {
    const company = {
      companyName: "Another Company",
      companyAddress: "",
      companyPhone: "",
      companyEmail: "",
      logoDataUrl:
        "data:image/png;base64," +
        readFileSync(
          new URL("../../../public/progressive-logo.png", import.meta.url)
        ).toString("base64"),
    };
    const branded = await buildInvoicePdf(invoice, { company });
    expect(branded.output()).toContain("/Subtype /Image");
    expect(branded.output()).toContain("Another Company");
    const hidden = await buildInvoicePdf(invoice, {
      company,
      settings: { ...DEFAULT_INVOICE_SETTINGS, showCompanyLogo: false },
    });
    expect(hidden.output()).not.toContain("/Subtype /Image");
    const missing = await buildInvoicePdf(invoice, {
      company: { ...company, logoDataUrl: "" },
    });
    expect(missing.output()).not.toContain("/Subtype /Image");
  });

  it("keeps long descriptions and terms across continuation pages", async () => {
    const pdf = await buildInvoicePdf(
      {
        ...invoice,
        items: [
          {
            id: "long",
            name: "Packing and moving service ".repeat(600) + "ITEMEND",
            quantity: 1,
            amount: 50,
          },
        ],
      },
      {
        settings: {
          ...DEFAULT_INVOICE_SETTINGS,
          invoiceSignature: true,
          invoiceTerms:
            "Documented service conditions ".repeat(600) + "TERMSEND",
          paymentInstructions: "PAYMENTREFERENCE",
        },
      }
    );
    const output = pdf.output();
    expect(pdf.getNumberOfPages()).toBeGreaterThan(3);
    expect(output).toContain("ITEMEND");
    expect(output).toContain("TERMSEND");
    expect(output).toContain("PAYMENTREFERENCE");
    expect(output).toContain("does not waive damage claims");
    expect(output).toContain(
      `Page ${pdf.getNumberOfPages()} of ${pdf.getNumberOfPages()}`
    );
  });

  it("prints dates in Phoenix time", async () => {
    const pdf = await buildInvoicePdf({
      ...invoice,
      createdAt: "2026-09-28T01:00:00.000Z",
    });
    expect(pdf.output()).toContain("Issued  Sep 27, 2026");
  });
});
