import { useEffect, useMemo, useState } from "react";
import {
  ArrowUp,
  Building2,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Info,
  Mail,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Trash2,
  User,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveClient } from "@/lib/clientStorage";
import { deleteConversation, getConversations, saveConversation } from "@/lib/messageStorage";
import { cn } from "@/lib/utils";
import type { ConversationContactType, ConversationRecord } from "@/types/messages";

function splitName(name: string) {
  const [firstName, ...rest] = name.split(" ");
  return { firstName: firstName || name, lastName: rest.join(" ") || "" };
}

export default function Messages() {
  const [conversations, setConversations] = useState<ConversationRecord[]>(() => getConversations());
  const [activeId, setActiveId] = useState(() => getConversations()[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [recipient, setRecipient] = useState("");

  useEffect(() => {
    const refresh = () => setConversations(getConversations());
    window.addEventListener("messages-updated", refresh);
    return () => window.removeEventListener("messages-updated", refresh);
  }, []);

  const filteredConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const searchable = [conversation.name, conversation.phone, conversation.email, conversation.preview].join(" ").toLowerCase();
      return !normalizedQuery || searchable.includes(normalizedQuery);
    });
  }, [conversations, query]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0];

  const persistActive = (conversation: ConversationRecord) => {
    const saved = saveConversation(conversation);
    setConversations(getConversations());
    setActiveId(saved.id);
  };

  const sendDraft = () => {
    if (!activeConversation || !draft.trim()) return;
    persistActive({
      ...activeConversation,
      preview: draft.trim(),
      messages: [
        ...activeConversation.messages,
        {
          id: `message-${Date.now()}`,
          sender: "admin",
          body: draft.trim(),
          sentAt: new Date().toISOString(),
        },
      ],
    });
    setDraft("");
  };

  const createConversation = () => {
    const trimmedRecipient = recipient.trim();
    if (!trimmedRecipient) return;
    const conversation: ConversationRecord = {
      id: `conversation-${Date.now()}`,
      name: trimmedRecipient,
      type: "client",
      email: "",
      phone: trimmedRecipient.match(/\d/) ? trimmedRecipient : "",
      company: "",
      address: "",
      dateLabel: "Today",
      preview: "New conversation",
      messages: [],
    };
    persistActive(conversation);
    setRecipient("");
    setNewMessageOpen(false);
  };

  const saveActiveAs = (type: ConversationContactType) => {
    if (!activeConversation) return;
    const { firstName, lastName } = splitName(activeConversation.name);
    saveClient({
      kind: type === "client" ? "client" : "lead",
      firstName,
      lastName,
      email: activeConversation.email,
      phone: activeConversation.phone,
      company: activeConversation.company,
      streetAddress: activeConversation.address,
    });
    toast.success(type === "client" ? "Saved as client" : "Saved as lead");
  };

  const removeActive = () => {
    if (!activeConversation) return;
    const next = deleteConversation(activeConversation.id);
    setConversations(next);
    setActiveId(next[0]?.id ?? "");
    toast.success("Conversation deleted");
  };

  return (
    <>
      <div className="border-b border-border bg-background px-4 py-5 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-lg font-medium">
            <MessageSquare className="size-5" />
            Messages
          </div>
          <Button onClick={() => setNewMessageOpen(true)} className="rounded-lg bg-[#2d5016] text-white hover:bg-[#234011]">
            <Plus className="size-4" />
            New Message
          </Button>
        </div>
      </div>

      <div className="border-b border-red-100 bg-red-50 px-4 py-5 md:px-8">
        <div className="mx-auto max-w-2xl text-sm">
          <div className="flex items-center gap-2 font-medium">
            <MessageSquare className="size-4 fill-red-500 text-red-500" />
            Messages will not be received and sent until you get approved for A2P 10DLC.
          </div>
          <div className="mt-2 pl-6">
            A2P 10DLC registration is required for SMS functionality.{" "}
            <a href="#" className="text-red-500 underline">
              Please register here <ExternalLink className="inline size-3" />
            </a>
          </div>
        </div>
      </div>

      <div className="grid min-h-[calc(100vh-250px)] gap-0 bg-background lg:grid-cols-[430px_minmax(480px,1fr)_430px]">
        <aside className="border-r border-border p-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search for name or number" className="h-11 rounded-lg pl-10" />
          </div>
          <div className="mt-5 border-t border-border pt-5">
            <div className="space-y-2">
              {filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setActiveId(conversation.id)}
                  className={cn(
                    "w-full rounded-md border border-border p-4 text-left transition-colors",
                    activeConversation?.id === conversation.id ? "bg-[#eef4e8]" : "bg-card hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{conversation.name}</span>
                    <span className="text-[#7180a8]">{conversation.dateLabel}</span>
                  </div>
                  <div className="mt-4 truncate text-sm text-[#7180a8]">{conversation.preview}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex min-h-[640px] flex-col border-r border-border p-8">
          {activeConversation ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border pb-6">
                <div className="flex items-center gap-3">
                  <h1 className="text-lg font-bold">{activeConversation.name}</h1>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-xs font-semibold capitalize",
                      activeConversation.type === "client" ? "bg-[#8e98b5] text-white" : "bg-orange-100 text-orange-600",
                    )}
                  >
                    <CheckCircle2 className="size-3 fill-current" />
                    {activeConversation.type}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="size-10 rounded-lg">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52 rounded-lg p-3">
                      <DropdownMenuItem onClick={() => saveActiveAs("client")} className="rounded-md px-3 py-2.5">
                        <User className="size-4" />
                        Save as Client
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => saveActiveAs("employee")} className="rounded-md px-3 py-2.5">
                        <UserPlus className="size-4" />
                        Save as Lead
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={removeActive} className="rounded-md px-3 py-2.5">
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="secondary" size="icon" className="size-10 rounded-lg bg-[#eef4e8] text-[#2d5016]">
                    <ChevronRight className="size-5" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto py-8">
                <ConversationMessages conversation={activeConversation} />
              </div>

              <div className="grid gap-4 border-t border-border pt-5 md:grid-cols-[1fr_174px]">
                <div className="relative">
                  <Input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) sendDraft();
                    }}
                    placeholder="Write a message (⌘ or Windows + Enter to send)"
                    className="h-12 rounded-lg pr-20"
                  />
                  <Paperclip className="absolute right-14 top-1/2 size-4 -translate-y-1/2 text-foreground" />
                  <button type="button" onClick={sendDraft} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8b92df]" aria-label="Send message">
                    <ArrowUp className="size-5 fill-current" />
                  </button>
                </div>
                <Select value="none">
                  <SelectTrigger className="h-12 w-full rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No registered n...</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">No conversation selected.</div>
          )}
        </main>

        <aside className="p-8">
          {activeConversation && <ContactInfo conversation={activeConversation} />}
        </aside>
      </div>

      <Dialog open={newMessageOpen} onOpenChange={setNewMessageOpen}>
        <DialogContent className="max-w-[400px] rounded-xl p-6" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Mail className="size-5 text-muted-foreground" />
              New Message
            </DialogTitle>
          </DialogHeader>
          <div className="border-t border-border pt-8">
            <label className="mb-4 block text-sm font-semibold">Recipient</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
              <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Search client / lead or enter phone number" className="h-12 rounded-lg pl-10 pr-10" />
              {recipient && (
                <button type="button" onClick={() => setRecipient("")} className="absolute right-4 top-1/2 size-4 -translate-y-1/2 rounded-full border text-xs text-[#7180a8]" aria-label="Clear recipient">
                  x
                </button>
              )}
            </div>
            <Button onClick={createConversation} className="mt-6 h-10 w-full rounded-lg bg-[#eef4e8] text-[#2d5016] hover:bg-[#e1ecd6]">
              <Send className="size-4" />
              Proceed
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConversationMessages({ conversation }: { conversation: ConversationRecord }) {
  if (conversation.id === "conversation-admin") {
    return (
      <div className="pt-56">
        <div className="mb-10 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-[#7180a8]">
          <div className="h-px bg-border" />
          <span>Tuesday, December 31, 2024</span>
          <div className="h-px bg-border" />
        </div>
        {conversation.messages.map((message) => (
          <div key={message.id} className="grid max-w-[390px] grid-cols-[1fr_auto] gap-4">
            <div className="font-semibold">Admin</div>
            <div className="text-[#7180a8]">5:00 PM</div>
            <div className="col-span-2 rounded-lg border border-border bg-card p-4 leading-relaxed">{message.body}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {conversation.messages.map((message) => (
        <div key={message.id}>
          <div className="w-fit rounded-lg border border-border bg-card px-4 py-3">{message.body}</div>
          {message.media === "video" && <VideoPreview />}
        </div>
      ))}
    </div>
  );
}

function VideoPreview() {
  return (
    <div className="mt-5 flex h-[360px] w-[204px] flex-col justify-end overflow-hidden bg-[radial-gradient(circle_at_50%_28%,#d8d4bf_0%,#8f917f_28%,#1e2520_29%,#0d0f13_55%,#050507_100%)] text-white shadow-sm">
      <div className="mb-4 flex items-center justify-around px-3">
        <span>▶</span>
        <span>⌕</span>
        <span>⛶</span>
        <span>⋮</span>
      </div>
      <div className="mx-4 mb-5 h-1 rounded-full bg-white/40">
        <div className="h-1 w-1/3 rounded-full bg-white" />
      </div>
    </div>
  );
}

function ContactInfo({ conversation }: { conversation: ConversationRecord }) {
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border pb-5 text-lg font-bold">
        <Info className="size-5" />
        Contact Info
      </div>
      <div className="mt-6 space-y-6">
        <InfoRow icon={User} value={conversation.name} />
        <InfoRow icon={Mail} value={conversation.email} />
        <InfoRow icon={Phone} value={conversation.phone} />
        <InfoRow icon={Building2} value={conversation.company} />
        <InfoRow icon={MapPin} value={conversation.address} />
      </div>
      <div className="mt-6 h-[200px] overflow-hidden rounded-lg border border-border bg-[linear-gradient(115deg,#d8e5f5_0%,#9fb7c9_42%,#e0d2bd_43%,#9e8d78_60%,#627b5f_100%)]">
        <div className="flex h-full flex-col justify-between p-3 text-white">
          <div className="w-fit rounded-sm bg-black/50 px-3 py-2 text-xs">
            <div className="font-bold">490 Oak Tree Ln</div>
            <div className="opacity-90">Thousand Oaks, California</div>
          </div>
          <div className="flex items-end justify-between">
            <span className="font-bold">Google</span>
            <span className="rounded-full bg-black/50 px-5 py-2 text-base">Map View</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, value }: { icon: typeof User; value: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-[#7180a8]">
        <Icon className="size-4" />
      </span>
      <span className="text-sm">{value || "Not provided"}</span>
    </div>
  );
}
