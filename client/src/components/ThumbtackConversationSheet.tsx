import { useEffect, useState, type ReactNode } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { loadConversation, type ThumbtackMessage } from "@/lib/leadsStorage";
import { cn } from "@/lib/utils";

function formatMessageTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * Read-only Thumbtack thread for one negotiation, oldest first. No composer:
 * replies stay in the responder pipeline, and nothing here can clear an
 * escalation. Shared by Clients & Leads and the ticket review card so the
 * dispatcher sees the same conversation everywhere.
 *
 * `highlightMessageIds` marks the messages a ticket field came from.
 */
export function ThumbtackConversationSheet({
  negotiationId,
  open,
  onClose,
  title,
  description,
  customerName,
  highlightMessageIds,
}: {
  negotiationId: string | null;
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  customerName?: string | null;
  highlightMessageIds?: Set<string>;
}) {
  const [messages, setMessages] = useState<ThumbtackMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !negotiationId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessages([]);
    loadConversation(negotiationId)
      .then(rows => {
        if (!cancelled) setMessages(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, negotiationId]);

  return (
    <Sheet open={open} onOpenChange={value => !value && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle className="flex flex-wrap items-center gap-2 font-display text-xl">{title}</SheetTitle>
          {description && <SheetDescription className="text-sm">{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-5">
          {loading && <p className="text-sm text-muted-foreground">Loading conversation…</p>}
          {error && <p className="text-sm text-[#a06b22]">Couldn't load the thread: {error}</p>}
          {!loading && !error && messages.length === 0 && (
            <p className="text-sm text-muted-foreground">No messages on this lead yet.</p>
          )}
          {messages.map(message => {
            const highlighted = highlightMessageIds?.has(message.id) ?? false;
            return (
              <div
                key={message.id}
                className={cn("flex flex-col gap-1", message.direction === "outbound" ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                    message.direction === "outbound"
                      ? "rounded-br-md bg-[#155e3f] text-white"
                      : "rounded-bl-md border border-border bg-card text-foreground",
                    highlighted && "ring-2 ring-amber-400 ring-offset-1"
                  )}
                >
                  {message.text}
                </div>
                <span className="px-1 text-[11px] text-muted-foreground">
                  {message.direction === "outbound" ? "Us" : customerName ?? "Customer"} · {formatMessageTime(message.sentAt)}
                  {highlighted ? " · used on the ticket" : ""}
                </span>
              </div>
            );
          })}
        </div>
        <div className="border-t border-border bg-card px-5 py-3 text-xs text-muted-foreground">
          Read-only. Replies go out through the Thumbtack responder, not from here.
        </div>
      </SheetContent>
    </Sheet>
  );
}
