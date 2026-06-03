export type ClientKind = "client" | "lead";

export type LeadSource =
  | "Angies"
  | "Facebook Ads"
  | "Craigslist"
  | "Google Ads"
  | "Referral"
  | "Website"
  | "Thumbtack"
  | "Googe Maps";

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
  privateNotes?: string;
  doNotService?: boolean;
  createdAt: string;
  updatedAt: string;
}
