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
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "America/Phoenix",
  }).format(new Date(value));

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

/** Overrides allow previews without saving an invoice or changing business settings. */
export interface InvoicePdfOptions {
  settings?: ReturnType<typeof getInvoiceSettings>;
  company?: ReturnType<typeof getInvoiceCompanyInfo>;
  logoDataUrl?: string;
}

async function loadInvoiceLogo(): Promise<string> {
  if (typeof window === "undefined") return "";
  try {
    const response = await fetch("/progressive-logo.png");
    if (!response.ok) return "";
    const blob = await response.blob();
    return await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

export async function buildInvoicePdf(
  invoice: InvoiceRecord,
  options: InvoicePdfOptions = {}
): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const settings = options.settings ?? getInvoiceSettings();
  const company = options.company ?? getInvoiceCompanyInfo();
  const totals = invoiceTotals(invoice);
  const left = 44,
    right = 568,
    width = right - left,
    bottom = 716;
  const ink = [24, 45, 38] as const;
  const green = [8, 59, 45] as const;
  const muted = [91, 108, 99] as const;
  let y = 0;
  const textStyle = (
    size = 10,
    bold = false,
    color: readonly [number, number, number] = ink
  ) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
  };
  const rule = (at: number) => {
    pdf.setDrawColor(216, 225, 220);
    pdf.setLineWidth(0.5);
    pdf.line(left, at, right, at);
  };
  const newPage = () => {
    pdf.addPage();
    textStyle(10, true, green);
    pdf.text(`Invoice #${invoice.invoiceNumber}`, left, 38);
    textStyle(9, false, muted);
    pdf.text("Continued", right, 38, { align: "right" });
    rule(50);
    y = 76;
  };
  const ensure = (height: number) => {
    if (y + height > bottom) newPage();
  };
  const paragraph = (
    value: string,
    maxWidth = width,
    x = left,
    leading = 14
  ) => {
    for (const line of pdf.splitTextToSize(value, maxWidth) as string[]) {
      ensure(leading);
      pdf.text(line, x, y);
      y += leading;
    }
  };

  const logo = settings.showCompanyLogo
    ? (options.logoDataUrl ?? (await loadInvoiceLogo()))
    : "";
  let companyY = 46;
  if (logo.startsWith("data:image/")) {
    try {
      const image = pdf.getImageProperties(logo);
      const logoWidth = Math.min(260, (62 * image.width) / image.height);
      pdf.addImage(
        logo,
        left,
        32,
        logoWidth,
        (logoWidth * image.height) / image.width
      );
      companyY = 112;
    } catch {
      /* An invalid logo must not prevent downloading the invoice. */
    }
  }
  textStyle(28, true, green);
  pdf.text("INVOICE", right, 58, { align: "right" });
  textStyle(13, false, muted);
  pdf.text(`#${invoice.invoiceNumber}`, right, 80, { align: "right" });
  y = companyY;
  if (settings.showCompanyName && company.companyName.trim()) {
    textStyle(11, true, green);
    paragraph(company.companyName, 330);
  }
  textStyle(9, false, muted);
  if (settings.showCompanyAddress && company.companyAddress.trim())
    paragraph(company.companyAddress, 330, left, 13);
  const phoneDigits = company.companyPhone.replace(/\D/g, "");
  const phone =
    phoneDigits.length === 10
      ? `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`
      : company.companyPhone;
  for (const value of [phone, company.companyEmail])
    if (value) paragraph(value, 330, left, 13);
  y = Math.max(204, y + 24);
  rule(y);
  y += 24;
  const billTop = y;
  textStyle(8, true, muted);
  pdf.text("BILL TO", left, y);
  y += 18;
  textStyle(12, true);
  paragraph(invoice.clientName, 280, left, 16);
  textStyle(10);
  for (const value of [invoice.clientAddress, invoice.clientEmail])
    if (value) paragraph(value, 280);
  if (invoice.jobId) {
    y += 7;
    textStyle(9, false, muted);
    paragraph(`Job reference: ${invoice.jobId}`, 280);
  }
  const billingEnd = y;
  pdf.setFillColor(239, 245, 241);
  pdf.rect(366, billTop - 8, 202, 90, "F");
  textStyle(8, true, muted);
  pdf.text(
    invoice.status === "void" ? "VOID INVOICE" : "AMOUNT DUE",
    380,
    billTop + 8
  );
  textStyle(25, true, green);
  pdf.text(money(totals.amountDue), 380, billTop + 38);
  textStyle(9, false, muted);
  pdf.text(`Issued  ${date(invoice.createdAt)}`, 380, billTop + 59);
  pdf.text(`Due      ${date(invoice.dueDate)}`, 380, billTop + 73);
  y = Math.max(billingEnd, billTop + 90) + 32;

  const tableHeader = () => {
    pdf.setFillColor(...green);
    pdf.rect(left, y - 17, width, 29, "F");
    textStyle(9, true, [255, 255, 255]);
    pdf.text("DESCRIPTION", left + 12, y);
    pdf.text("QTY", 385, y, { align: "right" });
    pdf.text("RATE", 472, y, { align: "right" });
    pdf.text("AMOUNT", right - 12, y, { align: "right" });
    y += 34;
    textStyle(10);
  };
  ensure(55);
  tableHeader();
  for (const item of invoice.items) {
    const lines = pdf.splitTextToSize(item.name, 285) as string[];
    const height = Math.max(34, lines.length * 14 + 20);
    if (y + height > bottom) {
      newPage();
      tableHeader();
    }
    pdf.text(String(item.quantity), 385, y, { align: "right" });
    pdf.text(money(item.amount), 472, y, { align: "right" });
    pdf.text(money(item.quantity * item.amount), right - 12, y, {
      align: "right",
    });
    for (const line of lines) {
      if (y + 14 > bottom) {
        newPage();
        tableHeader();
      }
      pdf.text(line, left + 12, y);
      y += 14;
    }
    y += 20;
    rule(y - 12);
  }
  y += 12;
  ensure(180);
  const row = (label: string, value: number, bold = false) => {
    textStyle(10, bold, bold ? ink : muted);
    pdf.text(label, 365, y);
    pdf.text(money(value), right - 12, y, { align: "right" });
    y += 22;
  };
  row("Subtotal", totals.subtotal);
  if (totals.discount) row("Discount", -totals.discount);
  if (totals.tax)
    row(`${invoice.taxName || "Tax"} (${invoice.taxRate}%)`, totals.tax);
  row("Invoice total", totals.total, true);
  if (totals.amountPaid) row("Payments received", totals.amountPaid);
  pdf.setFillColor(...green);
  pdf.rect(350, y - 6, 218, 37, "F");
  textStyle(10, true, [255, 255, 255]);
  pdf.text("Balance due", 365, y + 17);
  pdf.text(money(totals.amountDue), right - 12, y + 17, { align: "right" });
  y += 57;

  const section = (title: string, content: string) => {
    if (!content.trim()) return;
    ensure(55);
    textStyle(9, true, green);
    pdf.text(title.toUpperCase(), left, y);
    y += 19;
    textStyle(9, false, muted);
    paragraph(content, width, left, 13);
    y += 20;
  };
  section("Notes", invoice.notes ?? "");
  section("Payment instructions", settings.paymentInstructions);
  section("Service terms", settings.invoiceTerms);
  if (settings.invoiceSignature) {
    ensure(76);
    y += 36;
    rule(y);
    textStyle(9, false, muted);
    pdf.text("Customer signature", left, y + 15);
    pdf.text("Date", 440, y + 15);
    textStyle(8, false, muted);
    pdf.text(
      "Receipt acknowledgement; this signature does not waive damage claims.",
      left,
      y + 31
    );
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    rule(748);
    textStyle(8, false, muted);
    pdf.text(`Invoice #${invoice.invoiceNumber}`, left, 766);
    pdf.text(`Page ${page} of ${pages}`, right, 766, { align: "right" });
  }
  return pdf;
}

export async function downloadInvoicePdf(invoice: InvoiceRecord) {
  const pdf = await buildInvoicePdf(invoice);
  pdf.save(`invoice-${invoice.invoiceNumber}.pdf`);
}
