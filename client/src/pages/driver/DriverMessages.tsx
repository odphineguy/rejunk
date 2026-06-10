import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowLeft, Megaphone, MessageSquarePlus, Send, Truck, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DISPATCH_MESSAGES_EVENT,
  createThread,
  getMessages,
  getThreads,
  getThreadsFromCache,
  isMessagingReachable,
  markThreadRead,
  sendMessage,
  subscribeToMessages,
  subscribeToThreads,
} from "@/lib/dispatchMessageStorage";
import { getStoredDriverSession } from "@/lib/driverSession";
import { cn } from "@/lib/utils";
import type { DispatchMessage, DispatchThread } from "@/types/dispatch-messages";

function relativeTime(value: string) {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

function timeOfDay(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function ThreadIcon({ thread }: { thread: DispatchThread }) {
  if (thread.threadType === "job") {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <Truck className="size-5" />
      </span>
    );
  }
  if (thread.threadType === "broadcast") {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e8f5e4] text-[#155e3f]">
        <Megaphone className="size-5" />
      </span>
    );
  }
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#155e3f] text-sm font-bold text-white">D</span>
  );
}

export default function DriverMessages() {
  const session = getStoredDriverSession();
  const employeeId = session?.employeeId ?? "";
  const displayName = session?.displayName || "Driver";

  const search = useSearch();
  const [, navigate] = useLocation();
  const [threads, setThreads] = useState<DispatchThread[]>(() => getThreadsFromCache(employeeId || undefined));
  const [activeId, setActiveId] = useState(() => new URLSearchParams(search).get("thread") ?? "");
  const [messages, setMessages] = useState<DispatchMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [reachable, setReachable] = useState(() => isMessagingReachable());
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeThread = threads.find((thread) => thread.id === activeId);

  useEffect(() => {
    void getThreads(employeeId || undefined).then(setThreads);
    const refresh = () => {
      setThreads(getThreadsFromCache(employeeId || undefined));
      setReachable(isMessagingReachable());
    };
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener(DISPATCH_MESSAGES_EVENT, refresh);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    const unsubMessages = subscribeToMessages(refresh);
    const unsubThreads = subscribeToThreads(refresh);
    return () => {
      window.removeEventListener(DISPATCH_MESSAGES_EVENT, refresh);
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      unsubMessages();
      unsubThreads();
    };
  }, [employeeId]);

  // Load + mark read when a thread is opened; live-append while it's open.
  useEffect(() => {
    if (!activeId || !employeeId) return;
    let canceled = false;
    void getMessages(activeId).then((loaded) => {
      if (!canceled) setMessages(loaded);
    });
    void markThreadRead(activeId, employeeId);
    const unsub = subscribeToMessages((message) => {
      if (message.threadId !== activeId) return;
      setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
      void markThreadRead(activeId, employeeId);
    });
    return () => {
      canceled = true;
      unsub();
    };
  }, [activeId, employeeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activeId]);

  const openThread = (threadId: string) => {
    setActiveId(threadId);
    navigate(`/driver/messages?thread=${threadId}`, { replace: true });
  };

  const closeThread = () => {
    setActiveId("");
    setMessages([]);
    navigate("/driver/messages", { replace: true });
  };

  const messageDispatch = async () => {
    if (!employeeId) return;
    const existing = threads.find((thread) => thread.threadType === "direct");
    if (existing) {
      openThread(existing.id);
      return;
    }
    const thread = await createThread({
      threadType: "direct",
      title: displayName,
      createdBy: employeeId,
      participantIds: [employeeId],
    });
    setThreads(getThreadsFromCache(employeeId));
    openThread(thread.id);
  };

  const sendDraft = async () => {
    if (!activeThread || !draft.trim() || !employeeId) return;
    const body = draft.trim();
    setDraft("");
    const sent = await sendMessage(activeThread.id, employeeId, displayName, body, activeThread.jobId ? { jobId: activeThread.jobId } : undefined);
    if (sent) setMessages((current) => (current.some((item) => item.id === sent.id) ? current : [...current, sent]));
  };

  const showReconnecting = !online || !reachable;

  // -------------------------------------------------------------------------
  // Thread view
  // -------------------------------------------------------------------------
  if (activeThread) {
    return (
      <div className="flex min-h-dvh flex-col bg-[#f4f6f1]">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <Button variant="ghost" size="icon" onClick={closeThread} aria-label="Back to messages">
              <ArrowLeft className="size-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold">{activeThread.threadType === "direct" ? "Dispatch" : activeThread.title}</h1>
            </div>
            {activeThread.threadType === "job" && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Job</span>
            )}
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-4">
          {showReconnecting && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <WifiOff className="size-4" />
              Reconnecting... messages will send when you're back online.
            </div>
          )}

          {activeThread.threadType === "job" && activeThread.jobId && (
            <Link
              href={`/driver/jobs/${activeThread.jobId}`}
              className="mb-3 block rounded-lg border border-[#c8d1c0] bg-white px-3 py-2 text-sm font-medium text-[#155e3f] shadow-sm"
            >
              {activeThread.title} — open job →
            </Link>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto pb-24">
            {messages.map((message) => {
              const outgoing = message.senderId === employeeId;
              return (
                <div key={message.id} className={cn("flex flex-col", outgoing ? "items-end" : "items-start")}>
                  {!outgoing && <span className="mb-0.5 px-1 text-xs font-semibold text-muted-foreground">{message.senderName}</span>}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
                      outgoing ? "bg-[#e8f5e4]" : "border border-[#c8d1c0] bg-white",
                    )}
                  >
                    {message.body}
                    <span className="ml-2 align-bottom text-[10px] text-muted-foreground">{timeOfDay(message.createdAt)}</span>
                  </div>
                </div>
              );
            })}
            {messages.length === 0 && <p className="pt-10 text-center text-sm text-muted-foreground">No messages yet. Say hello.</p>}
            <div ref={bottomRef} />
          </div>
        </main>

        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-md gap-2">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void sendDraft();
              }}
              placeholder="Message"
              className="h-11 border-[#c8d1c0] bg-white"
            />
            <Button size="icon" className="size-11 shrink-0 bg-[#155e3f] text-white hover:bg-[#0c4a30]" onClick={() => void sendDraft()} aria-label="Send message">
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Thread list view
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-dvh bg-[#f4f6f1] pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back to today">
            <Link href="/driver">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <h1 className="text-lg font-bold">Messages</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-2 px-4 py-4">
        {showReconnecting && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <WifiOff className="size-4" />
            Reconnecting...
          </div>
        )}

        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            onClick={() => openThread(thread.id)}
            className="w-full rounded-lg border border-[#c8d1c0] bg-white p-3 text-left shadow-sm"
          >
            <div className="flex items-center gap-3">
              <ThreadIcon thread={thread} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{thread.threadType === "direct" ? "Dispatch" : thread.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(thread.updatedAt)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {thread.lastMessage ? `${thread.lastMessage.senderName}: ${thread.lastMessage.body}` : "No messages yet"}
                  </span>
                  {thread.unreadCount > 0 && <span className="size-2.5 shrink-0 rounded-full bg-[#155e3f]" aria-label={`${thread.unreadCount} unread`} />}
                </div>
              </div>
            </div>
          </button>
        ))}

        {threads.length === 0 && (
          <div className="rounded-lg border border-dashed border-[#c8d1c0] bg-white p-8 text-center text-sm text-muted-foreground">
            No messages yet. Tap the button below to message dispatch.
          </div>
        )}
      </main>

      <button
        type="button"
        onClick={() => void messageDispatch()}
        className="fixed bottom-6 right-5 flex size-14 items-center justify-center rounded-full bg-[#155e3f] text-white shadow-lg hover:bg-[#0c4a30]"
        aria-label="Message Dispatch"
      >
        <MessageSquarePlus className="size-6" />
      </button>
    </div>
  );
}
