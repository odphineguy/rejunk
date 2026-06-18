export type ClientKind = "client" | "lead";

export type LeadSource =
  | "Angies"
  | "Facebook Ads"
  | "Craigslist"
  | "Google Ads"
  | "Referral"
  | "Website"
  | "AI Estimate"
  | "Thumbtack"
  | "Googe Maps";

/**
 * One entry in a client's Contact Log — a timestamped, add-only record of
 * customer contact (calls, texts, service-issue resolutions). Modeled on the
 * old AS400 account-notes workflow: pull up the account, read what was said and
 * when, so "you never showed up" billing disputes can be settled from the log.
 */
export interface ContactLogEntry {
  id: string;
  createdAt: string;
  /** Who logged it. Empty until user accounts exist (currently anonymous auth). */
  author?: string;
  text: string;
}

export interface ClientRecord {
  id: string;
  kind: ClientKind;
  firstName: string;
  lastName: string;
  company?: string;
  email?: string;
  phone?: string;
  smsSetting: "receive" | "do_not_receive";
  streetAddress?: string;
  unit?: string;
  city?: string;
  state?: string;
  zip?: string;
  leadSource?: LeadSource;
  tags?: string[];
  /** @deprecated Free-text notes replaced by the timestamped `contactLog`. Kept for back-compat. */
  privateNotes?: string;
  /** Timestamped, add-only contact log (newest entries appended). */
  contactLog?: ContactLogEntry[];
  doNotService?: boolean;
  createdAt: string;
  updatedAt: string;
}
