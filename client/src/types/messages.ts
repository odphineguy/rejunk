export type ConversationContactType = "client" | "employee";

export interface ConversationMessage {
  id: string;
  sender: "contact" | "admin";
  body: string;
  sentAt: string;
  media?: "video";
}

export interface ConversationRecord {
  id: string;
  name: string;
  type: ConversationContactType;
  email: string;
  phone: string;
  company: string;
  address: string;
  dateLabel: string;
  preview: string;
  messages: ConversationMessage[];
}
