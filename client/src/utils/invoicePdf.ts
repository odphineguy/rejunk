import { jsPDF } from "jspdf";
import {
  getInvoiceCompanyInfo,
  getInvoiceSettings,
} from "@/lib/invoiceSettings";
import type { InvoiceRecord } from "@/types/invoices";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value
  );
const date = (value: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date(value)
  );

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

export async function buildInvoicePdf(invoice: InvoiceRecord): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const settings = getInvoiceSettings();
  const company = getInvoiceCompanyInfo();
  const totals = invoiceTotals(invoice);
  const left = 48;
  const right = 564;
  let y = 56;
  pdf.setTextColor(8, 59, 45);
  if (
    settings.showCompanyLogo &&
    company.logoDataUrl.startsWith("data:image/")
  ) {
    try {
      pdf.addImage(
        company.logoDataUrl,
        company.logoDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG",
        left,
        y - 16,
        74,
        42,
        undefined,
        "FAST"
      );
      y += 50;
    } catch {
      /* Keep the invoice usable if a stored logo is invalid. */
    }
  }
  if (settings.showCompanyName && company.companyName.trim()) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(company.companyName, left, y);
    y += 22;
  }
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(80, 88, 82);
  if (settings.showCompanyAddress && company.companyAddress.trim()) {
    for (const line of pdf.splitTextToSize(company.companyAddress, 300)) {
      pdf.text(line, left, y);
      y += 14;
    }
  }
  if (company.companyPhone) {
    pdf.text(company.companyPhone, left, y);
    y += 14;
  }
  if (company.companyEmail) {
    pdf.text(company.companyEmail, left, y);
    y += 14;
  }
  y = Math.max(y + 28, 175);
  pdf.setDrawColor(218, 226, 217);
  pdf.line(left, y, right, y);
  y += 30;
  pdf.setTextColor(28, 36, 30);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.text(`INVOICE #${invoice.invoiceNumber}`, left, y);
  y += 28;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Issued: ${date(invoice.createdAt)}`, left, y);
  pdf.text(`Due: ${date(invoice.dueDate)}`, 290, y);
  y += 22;
  if (invoice.jobId) {
    pdf.text(`Job: ${invoice.jobId}`, left, y);
    y += 20;
  }
  pdf.setFont("helvetica", "bold");
  pdf.text("BILL TO", left, y);
  y += 17;
  pdf.setFont("helvetica", "normal");
  for (const value of [
    invoice.clientName,
    invoice.clientAddress,
    invoice.clientEmail,
  ]) {
    if (!value) continue;
    for (const line of pdf.splitTextToSize(value, 310)) {
      pdf.text(line, left, y);
      y += 14;
    }
  }
  y += 25;
  const header = () => {
    pdf.setFillColor(8, 59, 45);
    pdf.rect(left, y - 17, right - left, 26, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("Description", left + 10, y);
    pdf.text("Qty", 390, y, { align: "right" });
    pdf.text("Rate", 470, y, { align: "right" });
    pdf.text("Amount", right - 10, y, { align: "right" });
    y += 30;
    pdf.setTextColor(28, 36, 30);
    pdf.setFont("helvetica", "normal");
  };
  header();
  for (const item of invoice.items) {
    const lines = pdf.splitTextToSize(item.name, 290);
    const height = Math.max(27, lines.length * 13 + 12);
    if (y + height > 670) {
      pdf.addPage();
      y = 55;
      header();
    }
    pdf.text(lines, left + 10, y);
    pdf.text(String(item.quantity), 390, y, { align: "right" });
    pdf.text(money(item.amount), 470, y, { align: "right" });
    pdf.text(money(item.quantity * item.amount), right - 10, y, {
      align: "right",
    });
    y += height;
    pdf.setDrawColor(230, 233, 226);
    pdf.line(left, y - 10, right, y - 10);
  }
  if (y > 600) {
    pdf.addPage();
    y = 60;
  }
  y += 16;
  const row = (label: string, value: number, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.text(label, 365, y);
    pdf.text(money(value), right - 10, y, { align: "right" });
    y += 21;
  };
  row("Subtotal", totals.subtotal);
  if (totals.discount) row("Discount", -totals.discount);
  if (totals.tax)
    row(`${invoice.taxName || "Tax"} (${invoice.taxRate}%)`, totals.tax);
  row("Total", totals.total, true);
  if (totals.amountPaid) row("Paid", -totals.amountPaid);
  row("Amount due", totals.amountDue, true);
  if (invoice.notes?.trim()) {
    y += 20;
    pdf.setFont("helvetica", "bold");
    pdf.text("Notes", left, y);
    y += 17;
    pdf.setFont("helvetica", "normal");
    for (const line of pdf.splitTextToSize(invoice.notes, right - left)) {
      if (y > 720) {
        pdf.addPage();
        y = 60;
      }
      pdf.text(line, left, y);
      y += 14;
    }
  }
  if (settings.invoiceSignature) {
    if (y > 680) {
      pdf.addPage();
      y = 80;
    }
    y += 50;
    pdf.setDrawColor(80, 88, 82);
    pdf.line(left, y, 310, y);
    pdf.setFontSize(9);
    pdf.text("Customer signature", left, y + 14);
  }
  return pdf;
}

export async function downloadInvoicePdf(invoice: InvoiceRecord) {
  const pdf = await buildInvoicePdf(invoice);
  pdf.save(`invoice-${invoice.invoiceNumber}.pdf`);
}
