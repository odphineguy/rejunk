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
  const blue = [24, 91, 139] as const;
  const accent = [88, 166, 64] as const;
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
    ? (options.logoDataUrl ?? company.logoDataUrl)
    : "";
  // Keep the approved angled masthead independent of company branding.
  const polygon = (
    points: [number, number][],
    color: readonly [number, number, number]
  ) => {
    pdf.setFillColor(...color);
    pdf.lines(
      points
        .slice(1)
        .map((point, index) => [
          point[0] - points[index][0],
          point[1] - points[index][1],
        ]),
      points[0][0],
      points[0][1],
      [1, 1],
      "F",
      true
    );
  };
  polygon(
    [
      [393, 0],
      [612, 0],
      [612, 104],
      [347, 104],
    ],
    blue
  );
  polygon(
    [
      [378, 0],
      [385, 0],
      [339, 104],
      [332, 104],
    ],
    accent
  );
  let companyY = 43;
  if (logo.startsWith("data:image/")) {
    try {
      const image = pdf.getImageProperties(logo);
      const logoWidth = Math.min(250, (62 * image.width) / image.height);
      pdf.addImage(
        logo,
        left,
        34,
        logoWidth,
        (logoWidth * image.height) / image.width
      );
      companyY = 110;
    } catch {
      /* An invalid logo must not prevent downloading the invoice. */
    }
  }
  textStyle(29, true, [255, 255, 255]);
  pdf.text("INVOICE", right, 53, { align: "right" });
  textStyle(12, false, [255, 255, 255]);
  pdf.text(`#${invoice.invoiceNumber}`, right, 77, { align: "right" });
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
  y = Math.max(186, y + 18);
  pdf.setDrawColor(...blue);
  pdf.setLineWidth(1);
  pdf.line(left, y, right, y);
  y += 27;
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
  pdf.setFillColor(239, 244, 248);
  pdf.rect(366, billTop - 8, 202, 90, "F");
  textStyle(8, true, muted);
  pdf.text(
    invoice.status === "void" ? "VOID INVOICE" : "AMOUNT DUE",
    380,
    billTop + 8
  );
  textStyle(25, true, blue);
  pdf.text(money(totals.amountDue), 380, billTop + 38);
  textStyle(9, false, muted);
  pdf.text(`Issued  ${date(invoice.createdAt)}`, 380, billTop + 59);
  pdf.text(`Due      ${date(invoice.dueDate)}`, 380, billTop + 73);
  y = Math.max(billingEnd, billTop + 90) + 26;

  const tableHeader = () => {
    pdf.setFillColor(...blue);
    pdf.rect(left, y - 17, width, 29, "F");
    textStyle(9, true, [255, 255, 255]);
    pdf.text("NO.", left + 12, y);
    pdf.text("ITEM DESCRIPTION", left + 47, y);
    pdf.text("QTY", 385, y, { align: "right" });
    pdf.text("RATE", 472, y, { align: "right" });
    pdf.text("AMOUNT", right - 12, y, { align: "right" });
    y += 34;
    textStyle(10);
  };
  ensure(55);
  tableHeader();
  for (let index = 0; index < invoice.items.length; index++) {
    const item = invoice.items[index];
    const lines = pdf.splitTextToSize(item.name, 252) as string[];
    const height = Math.max(38, lines.length * 14 + 24);
    if (y + Math.min(height, 60) > bottom) {
      newPage();
      tableHeader();
    }
    const stripe = () => {
      if (index % 2 === 0) {
        pdf.setFillColor(240, 243, 245);
        pdf.rect(left, y - 14, width, Math.min(height, bottom - y + 14), "F");
      }
    };
    stripe();
    textStyle(9, false, muted);
    pdf.text(String(index + 1).padStart(2, "0"), left + 12, y);
    textStyle(10);
    pdf.text(String(item.quantity), 385, y, { align: "right" });
    pdf.text(money(item.amount), 472, y, { align: "right" });
    pdf.text(money(item.quantity * item.amount), right - 12, y, {
      align: "right",
    });
    for (const line of lines) {
      if (y + 14 > bottom) {
        newPage();
        tableHeader();
        stripe();
      }
      pdf.text(line, left + 47, y);
      y += 14;
    }
    y += 24;
  }
  y += 12;
  ensure(180);
  textStyle(14, true, blue);
  pdf.text("Thank you for your business.", left, y + 8);
  textStyle(10, false, muted);
  pdf.text("We appreciate the opportunity to help.", left, y + 26);
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
  pdf.setFillColor(...blue);
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
    polygon(
      [
        [0, 747],
        [475, 747],
        [498, 769],
        [612, 769],
        [612, 792],
        [0, 792],
      ],
      blue
    );
    polygon(
      [
        [492, 747],
        [520, 747],
        [543, 769],
        [515, 769],
      ],
      accent
    );
    textStyle(8, false, [255, 255, 255]);
    pdf.text(`Invoice #${invoice.invoiceNumber}`, left, 776);
    pdf.text(`Page ${page} of ${pages}`, right, 776, { align: "right" });
  }
  return pdf;
}

export async function downloadInvoicePdf(invoice: InvoiceRecord) {
  const pdf = await buildInvoicePdf(invoice);
  pdf.save(`invoice-${invoice.invoiceNumber}.pdf`);
}
