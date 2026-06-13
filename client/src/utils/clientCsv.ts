import { saveClient } from "@/lib/clientStorage";
import type {
  ClientKind,
  ClientRecord,
  ContactLogEntry,
  LeadSource,
} from "@/types/clients";

/**
 * CSV import/export for the Clients & Leads page. The export columns are chosen
 * so the file opens cleanly in Excel / Google Sheets and round-trips back
 * through import. The contact log is flattened into a single readable "Notes"
 * column on export; on import it comes back as one timestamped log entry.
 */

const COLUMNS = [
  "First Name",
  "Last Name",
  "Type",
  "Company",
  "Email",
  "Phone",
  "SMS",
  "Street Address",
  "Unit",
  "City",
  "State",
  "ZIP",
  "Lead Source",
  "Tags",
  "Do Not Service",
  "Notes",
] as const;

const LEAD_SOURCES: LeadSource[] = [
  "Angies",
  "Facebook Ads",
  "Craigslist",
  "Google Ads",
  "Referral",
  "Website",
  "Thumbtack",
  "Googe Maps",
];

function escapeCsv(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function contactLogToText(client: ClientRecord): string {
  const parts = (client.contactLog ?? []).map(entry => {
    const when = new Date(entry.createdAt).toLocaleString("en-US");
    return `[${when}] ${entry.text}`;
  });
  if (client.privateNotes?.trim()) parts.push(client.privateNotes.trim());
  return parts.join("\n");
}

export function clientsToCsv(clients: ClientRecord[]): string {
  const rows = clients.map(client =>
    [
      client.firstName ?? "",
      client.lastName ?? "",
      client.kind,
      client.company ?? "",
      client.email ?? "",
      client.phone ?? "",
      client.smsSetting === "do_not_receive" ? "Do not receive" : "Receive",
      client.streetAddress ?? "",
      client.unit ?? "",
      client.city ?? "",
      client.state ?? "",
      client.zip ?? "",
      client.leadSource ?? "",
      (client.tags ?? []).join("; "),
      client.doNotService ? "Yes" : "",
      contactLogToText(client),
    ]
      .map(value => escapeCsv(String(value)))
      .join(",")
  );
  return [COLUMNS.join(","), ...rows].join("\r\n");
}

export function downloadClientsCsv(clients: ClientRecord[]): void {
  const csv = clientsToCsv(clients);
  const blob = new Blob([`﻿${csv}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rejunk-clients-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** RFC-4180-ish CSV parser: handles quoted fields, escaped quotes, CRLF. */
function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (char === "\r") {
      i++;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += char;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function noteId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `note-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

/**
 * Looks up a column value for the current row using a set of accepted header
 * aliases (all compared lowercase/trimmed). Returns "" when no column matches.
 */
function makeGetter(headers: string[], row: string[]) {
  const normalized = headers.map(h => h.trim().toLowerCase());
  return (...aliases: string[]): string => {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias.toLowerCase());
      if (idx !== -1) return (row[idx] ?? "").trim();
    }
    return "";
  };
}

export interface ClientImportResult {
  imported: number;
  skipped: number;
}

/**
 * Parses a CSV string and saves each row as a client/lead. Tolerant of column
 * order and common header variants. Rows with no name, email, or phone are
 * skipped. Returns counts for a user-facing toast.
 */
export function importClientsFromCsv(text: string): ClientImportResult {
  const rows = parseCsv(text).filter(cells =>
    cells.some(cell => cell.trim() !== "")
  );
  if (rows.length < 2) return { imported: 0, skipped: 0 };

  const headers = rows[0];
  let imported = 0;
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const get = makeGetter(headers, row);

    let firstName = get("first name", "firstname", "first");
    let lastName = get("last name", "lastname", "last");
    const fullName = get("name", "full name", "client name");
    if (!firstName && !lastName && fullName) {
      const parts = fullName.trim().split(/\s+/);
      firstName = parts.shift() ?? "";
      lastName = parts.join(" ");
    }

    const email = get("email", "email address");
    const phone = get("phone", "phone number", "telephone");

    if (!firstName && !lastName && !email && !phone) {
      skipped++;
      continue;
    }

    const typeRaw = get("type", "kind").toLowerCase();
    const kind: ClientKind = typeRaw.includes("lead") ? "lead" : "client";

    const smsRaw = get("sms", "client sms setting").toLowerCase();
    const smsSetting: ClientRecord["smsSetting"] =
      smsRaw.includes("not") || smsRaw === "no"
        ? "do_not_receive"
        : "receive";

    const leadSourceRaw = get("lead source", "source");
    const leadSource = LEAD_SOURCES.find(
      source => source.toLowerCase() === leadSourceRaw.toLowerCase()
    );

    const tags = get("tags")
      .split(/[;,]/)
      .map(tag => tag.trim())
      .filter(Boolean);

    const doNotServiceRaw = get("do not service", "do_not_service").toLowerCase();
    const doNotService = ["yes", "true", "1", "y"].includes(doNotServiceRaw);

    const notes = get("notes", "note");
    const contactLog: ContactLogEntry[] | undefined = notes
      ? [{ id: noteId(), createdAt: new Date().toISOString(), text: notes }]
      : undefined;

    saveClient({
      kind,
      firstName: firstName || "New",
      lastName: lastName || "Client",
      company: get("company", "company name") || undefined,
      email: email || undefined,
      phone: phone || undefined,
      smsSetting,
      streetAddress: get("street address", "address", "street") || undefined,
      unit: get("unit", "unit #", "apt") || undefined,
      city: get("city") || undefined,
      state: get("state") || undefined,
      zip: get("zip", "zip code", "postal code") || undefined,
      leadSource,
      tags,
      doNotService,
      contactLog,
    });
    imported++;
  }

  return { imported, skipped };
}
