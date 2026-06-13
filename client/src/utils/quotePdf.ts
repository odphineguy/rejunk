import { jsPDF } from "jspdf";

import { loadSettingsSection } from "@/lib/settingsStorage";

/**
 * Branded, customer-facing Quote PDF — a real downloadable file Sam can text or
 * email. Fed by a single normalized model so both estimate engines (junk volume
 * + service/moving Pricebook) produce the same clean document. Pure vector text
 * for crisp output and a tiny file; the only raster is the optional uploaded
 * company logo (Settings → Company), embedded straight from its stored data URL.
 */

const PINE: [number, number, number] = [5, 42, 43];
const LIME: [number, number, number] = [131, 226, 130];
const INK: [number, number, number] = [34, 34, 34];
const SOFT: [number, number, number] = [90, 99, 87];
const HAIR: [number, number, number] = [222, 226, 217];

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function money(value: number | undefined): string {
  return usd.format(Number.isFinite(value) ? Number(value) : 0);
}

export interface QuotePdfLine {
  label: string;
  amount?: number;
  /** Free-text amount (e.g. "−$45" for a discount) when `amount` doesn't fit. */
  amountText?: string;
}

export interface QuotePdfInput {
  /** e.g. "Junk Removal Estimate", "Moving Estimate", "Service Estimate". */
  heading: string;
  customerName?: string;
  addressLabel?: string;
  address?: string;
  secondAddressLabel?: string;
  secondAddress?: string;
  /** The headline price. */
  total: number;
  rangeLower?: number;
  rangeUpper?: number;
  /** Compact key/value facts (Load size, Material, Crew, Vehicle, Distance…). */
  facts?: Array<{ label: string; value: string }>;
  /** Itemized lines with prices (service/moving). */
  lineItems?: QuotePdfLine[];
  /** Plain "what's included" bullets (junk mode). */
  includes?: string[];
  notes?: string;
  photoRequired?: boolean;
  /** Overrides the default fine-print disclaimer. */
  disclaimer?: string;
}

interface CompanyInfo {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  logoDataUrl: string;
}

const COMPANY_FALLBACK: CompanyInfo = {
  companyName: "Rejunk",
  companyAddress: "",
  companyPhone: "(480) 351-0291",
  companyEmail: "abe@saguarotransport.com",
  logoDataUrl: "",
};

const DEFAULT_DISCLAIMER =
  "This is an estimate, not a final invoice. The price may change if the job " +
  "involves heavy or restricted materials, extra labor, stairs, or noticeably " +
  "more volume than described. We'll always confirm before doing extra work.";

function loadImageSize(
  dataUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * The bundled Rejunk wordmark, pine on transparent — reads cleanly on the white
 * PDF header. Used as the default letterhead when no company logo has been
 * uploaded in Settings → Company. Fetched once and cached as a data URL because
 * jsPDF's addImage needs raster bytes, not a URL.
 */
let defaultLogoPromise: Promise<string | null> | null = null;
function loadDefaultLogoDataUrl(): Promise<string | null> {
  if (defaultLogoPromise) return defaultLogoPromise;
  defaultLogoPromise = (async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}rejunk-whites.png`);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string | null>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  })();
  return defaultLogoPromise;
}

function formattedDate(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function safeFileName(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "estimate";
}

/**
 * Builds and downloads the quote as a PDF. Returns the suggested file name.
 * Resolves once the browser save is triggered.
 */
export async function downloadQuotePdf(input: QuotePdfInput): Promise<string> {
  const company = loadSettingsSection<CompanyInfo>("company", COMPANY_FALLBACK);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // ── Letterhead ──────────────────────────────────────────────────────────
  // Prefer the company logo uploaded in Settings → Company; otherwise fall back
  // to the bundled Rejunk wordmark. The text wordmark below is a last resort if
  // even the bundled asset can't load (e.g. offline).
  let headerBottom = y;
  let logoPlaced = false;
  const logoSource = company.logoDataUrl?.startsWith("data:image")
    ? company.logoDataUrl
    : await loadDefaultLogoDataUrl();
  if (logoSource) {
    try {
      const { width, height } = await loadImageSize(logoSource);
      const logoH = 13;
      const logoW = (width / height) * logoH;
      const format = logoSource.includes("image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(logoSource, format, margin, y, logoW, logoH);
      headerBottom = y + logoH;
      logoPlaced = true;
    } catch {
      logoPlaced = false;
    }
  }
  if (!logoPlaced) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...PINE);
    doc.text(company.companyName || "Rejunk", margin, y + 8);
    headerBottom = y + 11;
  }

  // Company contact, right-aligned.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  const contactLines = [
    company.companyPhone,
    company.companyEmail,
    company.companyAddress,
  ].filter(Boolean);
  contactLines.forEach((line, i) => {
    doc.text(line, pageW - margin, y + 3 + i * 4.5, { align: "right" });
  });

  y = Math.max(headerBottom, y + 3 + contactLines.length * 4.5) + 4;

  // Lime accent rule.
  doc.setDrawColor(...LIME);
  doc.setLineWidth(1.2);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // ── Title + date ────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text(input.heading, margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text(formattedDate(), pageW - margin, y, { align: "right" });
  y += 9;

  // ── Customer / address block ──────────────────────────────────────────────
  const blockLabel = (label: string, value: string, atY: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...SOFT);
    doc.text(label.toUpperCase(), margin, atY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(value || "Not provided", contentW);
    doc.text(lines, margin, atY + 5);
    return atY + 5 + lines.length * 5;
  };

  if (input.customerName) {
    y = blockLabel("Prepared for", input.customerName, y) + 2;
  }
  if (input.address) {
    y = blockLabel(input.addressLabel ?? "Address", input.address, y) + 2;
  }
  if (input.secondAddress) {
    y =
      blockLabel(
        input.secondAddressLabel ?? "Delivery",
        input.secondAddress,
        y
      ) + 2;
  }
  y += 3;

  // ── Headline price ────────────────────────────────────────────────────────
  ensureSpace(26);
  doc.setFillColor(244, 248, 242);
  doc.setDrawColor(...HAIR);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentW, 22, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...SOFT);
  doc.text("ESTIMATED PRICE", margin + 6, y + 7);
  doc.setFontSize(24);
  doc.setTextColor(...PINE);
  doc.text(money(input.total), margin + 6, y + 17);
  if (
    input.rangeLower != null &&
    input.rangeUpper != null &&
    input.rangeUpper > input.rangeLower
  ) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...SOFT);
    doc.text(
      `Typical range: ${money(input.rangeLower)} – ${money(input.rangeUpper)}`,
      pageW - margin - 6,
      y + 17,
      { align: "right" }
    );
  }
  y += 30;

  // ── Facts grid ────────────────────────────────────────────────────────────
  if (input.facts?.length) {
    const colW = contentW / 2;
    input.facts.forEach((fact, i) => {
      const col = i % 2;
      if (col === 0) ensureSpace(11);
      const x = margin + col * colW;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...SOFT);
      doc.text(fact.label.toUpperCase(), x, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(...INK);
      doc.text(doc.splitTextToSize(fact.value, colW - 6), x, y + 5);
      if (col === 1 || i === input.facts!.length - 1) y += 12;
    });
    y += 2;
  }

  // ── Itemized lines ────────────────────────────────────────────────────────
  if (input.lineItems?.length) {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text("Estimate details", margin, y);
    y += 3;
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
    input.lineItems.forEach(line => {
      ensureSpace(8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      const amount =
        line.amountText ?? (line.amount != null ? money(line.amount) : "");
      const labelLines = doc.splitTextToSize(line.label, contentW - 30);
      doc.text(labelLines, margin, y);
      if (amount) doc.text(amount, pageW - margin, y, { align: "right" });
      y += labelLines.length * 5 + 1.5;
    });
    y += 2;
    doc.setDrawColor(...HAIR);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
    ensureSpace(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...PINE);
    doc.text("Total", margin, y);
    doc.text(money(input.total), pageW - margin, y, { align: "right" });
    y += 8;
  }

  // ── Includes bullets ──────────────────────────────────────────────────────
  if (input.includes?.length) {
    ensureSpace(10 + input.includes.length * 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text("What's included", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...SOFT);
    input.includes.forEach(item => {
      ensureSpace(6);
      doc.text(`•  ${item}`, margin + 1, y);
      y += 5.5;
    });
    y += 2;
  }

  // ── Photo-required nudge ──────────────────────────────────────────────────
  if (input.photoRequired) {
    ensureSpace(12);
    doc.setFillColor(255, 250, 235);
    doc.setDrawColor(245, 215, 130);
    doc.setLineWidth(0.3);
    const lines = doc.splitTextToSize(
      "Please send a few photos of the items so we can confirm the exact price.",
      contentW - 8
    );
    const boxH = lines.length * 5 + 6;
    doc.roundedRect(margin, y, contentW, boxH, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(120, 90, 20);
    doc.text(lines, margin + 4, y + 6);
    y += boxH + 5;
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (input.notes?.trim()) {
    ensureSpace(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text("Notes", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...SOFT);
    const noteLines = doc.splitTextToSize(input.notes.trim(), contentW);
    noteLines.forEach((line: string) => {
      ensureSpace(6);
      doc.text(line, margin, y);
      y += 5;
    });
    y += 3;
  }

  // ── Fine-print disclaimer ─────────────────────────────────────────────────
  ensureSpace(20);
  doc.setDrawColor(...HAIR);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 5;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...SOFT);
  doc.text(
    doc.splitTextToSize(input.disclaimer ?? DEFAULT_DISCLAIMER, contentW),
    margin,
    y
  );

  const fileName = `${safeFileName(company.companyName || "Rejunk")}-Quote-${safeFileName(
    input.customerName ?? "estimate"
  )}.pdf`;
  doc.save(fileName);
  return fileName;
}
