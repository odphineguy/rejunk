import type { InvoiceRecord } from "../client/src/types/invoices";

/** Shared by PDF, editor and server Checkout: dollars rounded to cents. */
export function invoiceTotals(invoice: InvoiceRecord) {
  const subtotal =
    Math.round(
      invoice.items.reduce(
        (sum, item) => sum + item.quantity * item.amount,
        0
      ) * 100
    ) / 100;
  const discount = Math.min(subtotal, Math.max(0, invoice.discount ?? 0));
  const taxRate = Math.max(0, invoice.taxRate ?? 0);
  const taxableSubtotal = invoice.items
    .filter(item => item.taxable)
    .reduce((sum, item) => sum + item.quantity * item.amount, 0);
  const tax =
    Math.round(
      Math.max(
        0,
        taxableSubtotal - discount * (subtotal ? taxableSubtotal / subtotal : 0)
      ) * taxRate
    ) / 100;
  const total = Math.round((subtotal - discount + tax) * 100) / 100;
  const amountPaid = Math.max(
    0,
    invoice.amountPaid ?? (invoice.status === "paid" ? invoice.total : 0)
  );
  return {
    subtotal,
    discount,
    tax,
    total,
    amountPaid,
    amountDue: Math.max(0, Math.round((total - amountPaid) * 100) / 100),
  };
}
