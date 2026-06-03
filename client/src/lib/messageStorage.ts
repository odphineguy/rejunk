import type { ConversationRecord } from "@/types/messages";

const MESSAGES_KEY = "junk_estimator_messages_v1";

const defaultConversations: ConversationRecord[] = [
  {
    id: "conversation-andrew-thompson",
    name: "Andrew Thompson",
    type: "client",
    email: "andrew@autopilotapp.io",
    phone: "(310) 591-0990",
    company: "Autopilot",
    address: "490 Oak Tree Lane, Thousand Oaks, CA 91360",
    dateLabel: "01/01/25",
    preview: "Here is a sample video for you!",
    messages: [
      {
        id: "message-andrew-1",
        sender: "contact",
        body: "Here is a sample video for you!",
        sentAt: "2025-01-01T17:00:00.000Z",
        media: "video",
      },
    ],
  },
  {
    id: "conversation-admin",
    name: "Admin",
    type: "employee",
    email: "admin@example.com",
    phone: "(123) 456-7890",
    company: "Autopilot",
    address: "490 Oak Tree Lane, Thousand Oaks, CA 91360",
    dateLabel: "01/01/25",
    preview: "Hey there! Please be sure to use the chat button in...",
    messages: [
      {
        id: "message-admin-1",
        sender: "admin",
        body: "Hey there! Please be sure to use the chat button in bottom right corner if you have any questions.",
        sentAt: "2024-12-31T17:00:00.000Z",
      },
    ],
  },
];

const canUseLocalStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

function readConversations() {
  if (!canUseLocalStorage()) return defaultConversations;
  try {
    const raw = window.localStorage.getItem(MESSAGES_KEY);
    return raw ? (JSON.parse(raw) as ConversationRecord[]) : defaultConversations;
  } catch {
    return defaultConversations;
  }
}

function writeConversations(conversations: ConversationRecord[]) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(MESSAGES_KEY, JSON.stringify(conversations));
  window.dispatchEvent(new Event("messages-updated"));
}

export function getConversations(): ConversationRecord[] {
  return readConversations();
}

export function saveConversation(conversation: ConversationRecord): ConversationRecord {
  const conversations = readConversations();
  writeConversations([conversation, ...conversations.filter((item) => item.id !== conversation.id)]);
  return conversation;
}

export function deleteConversation(conversationId: string): ConversationRecord[] {
  const next = readConversations().filter((conversation) => conversation.id !== conversationId);
  writeConversations(next);
  return next;
}
