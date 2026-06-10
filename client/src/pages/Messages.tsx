import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Archive,
  ArrowUp,
  ExternalLink,
  Mail,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Send,
  UserRound,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { JobStatusBadge } from "@/components/JobBadges";
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
import {
  DISPATCH_MESSAGES_EVENT,
  createThread,
  getDispatchIdentity,
  getMessages,
  getThreads,
  getThreadsFromCache,
  markThreadRead,
  sendMessage,
  setThreadArchived,
  subscribeToMessages,
  subscribeToThreads,
} from "@/lib/dispatchMessageStorage";
import { employeeName, getEmployees } from "@/lib/employeeStorage";
import { getJobs } from "@/lib/jobStorage";
import { profileColorHex } from "@/lib/profileColors";
import { ensureSession, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { DispatchMessage, DispatchThread } from "@/types/dispatch-messages";
import type { EmployeeRecord } from "@/types/employees";
import type { Job } from "@/types/jobs";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

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

function dateSeparatorLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
}

/** Groups ordered messages into runs by calendar day for the date separators. */
function groupByDay(messages: DispatchMessage[]) {
  const groups: Array<{ label: string; messages: DispatchMessage[] }> = [];
  for (const message of messages) {
    const label = dateSeparatorLabel(message.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.messages.push(message);
    else groups.push({ label, messages: [message] });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------

function ThreadAvatar({ thread, employees }: { thread: DispatchThread; employees: EmployeeRecord[] }) {
  if (thread.threadType === "job") {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <Wrench className="size-5" />
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
  const driver = directThreadDriver(thread, employees);
  return <PersonAvatar name={driver ? employeeName(driver) : thread.title} color={driver ? profileColorHex(driver.profileColor) : "#155e3f"} />;
}

function PersonAvatar({ name, color, size = "size-10" }: { name: string; color: string; size?: string }) {
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-full text-sm font-bold text-white", size)}
      style={{ backgroundColor: color }}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** The non-dispatch participant of a direct thread, resolved to an employee. */
function directThreadDriver(thread: DispatchThread, employees: EmployeeRecord[]): EmployeeRecord | undefined {
  const dispatchId = getDispatchIdentity().employeeId;
  const other = thread.participants.find((participant) => participant.employeeId !== dispatchId);
  return employees.find((employee) => employee.id === other?.employeeId);
}

function findEmployeeByName(name: string, employees: EmployeeRecord[]) {
  const lower = name.toLowerCase();
  return employees.find((employee) => employeeName(employee).toLowerCase() === lower);
}

function ThreadTypeBadge({ thread }: { thread: DispatchThread }) {
  if (thread.threadType === "job") {
    return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Job</span>;
  }
  if (thread.threadType === "direct") {
    return <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">Direct</span>;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Messages() {
  const [threads, setThreads] = useState<DispatchThread[]>(() => getThreadsFromCache());
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<DispatchMessage[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [employees, setEmployees] = useState<EmployeeRecord[]>(() => getEmployees());
  const bottomRef = useRef<HTMLDivElement>(null);

  const dispatchIdentity = useMemo(() => getDispatchIdentity(), [employees]);
  const activeThread = threads.find((thread) => thread.id === activeId);

  const refreshThreads = async () => setThreads(await getThreads());

  useEffect(() => {
    void refreshThreads();
    const onUpdated = () => setThreads(getThreadsFromCache());
    const onEmployees = () => setEmployees(getEmployees());
    window.addEventListener(DISPATCH_MESSAGES_EVENT, onUpdated);
    window.addEventListener("employees-updated", onEmployees);
    const unsubMessages = subscribeToMessages(() => setThreads(getThreadsFromCache()));
    const unsubThreads = subscribeToThreads(() => setThreads(getThreadsFromCache()));
    return () => {
      window.removeEventListener(DISPATCH_MESSAGES_EVENT, onUpdated);
      window.removeEventListener("employees-updated", onEmployees);
      unsubMessages();
      unsubThreads();
    };
  }, []);

  // Load + mark read when a thread is opened; live-append new messages.
  useEffect(() => {
    if (!activeId) return;
    let canceled = false;
    void getMessages(activeId).then((loaded) => {
      if (!canceled) setMessages(loaded);
    });
    void markThreadRead(activeId, dispatchIdentity.employeeId);
    const unsub = subscribeToMessages((message) => {
      if (message.threadId !== activeId) return;
      setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
      void markThreadRead(activeId, dispatchIdentity.employeeId);
    });
    return () => {
      canceled = true;
      unsub();
    };
  }, [activeId, dispatchIdentity.employeeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activeId]);

  const filteredThreads = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return threads;
    return threads.filter((thread) => {
      const participantNames = thread.participants
        .map((participant) => {
          const employee = employees.find((item) => item.id === participant.employeeId);
          return employee ? employeeName(employee) : "";
        })
        .join(" ");
      return [thread.title, participantNames, thread.lastMessage?.body ?? ""].join(" ").toLowerCase().includes(normalized);
    });
  }, [threads, employees, query]);

  const sendDraft = async () => {
    if (!activeThread || !draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    const sent = await sendMessage(activeThread.id, dispatchIdentity.employeeId, "Dispatch", body);
    if (sent) setMessages((current) => (current.some((item) => item.id === sent.id) ? current : [...current, sent]));
    setThreads(getThreadsFromCache());
  };

  const archiveActive = async () => {
    if (!activeThread) return;
    await setThreadArchived(activeThread.id, true);
    setActiveId("");
    setThreads(getThreadsFromCache());
    toast.success("Conversation archived");
  };

  return (
    <>
      <div className="border-b border-border bg-background px-4 py-5 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-lg font-medium">
            <MessageSquare className="size-5" />
            Messages
          </div>
          <Button onClick={() => setNewMessageOpen(true)} className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]">
            <Plus className="size-4" />
            New Message
          </Button>
        </div>
      </div>

      <div className="grid min-h-[calc(100vh-170px)] gap-0 bg-background lg:grid-cols-[430px_minmax(480px,1fr)_430px]">
        <aside className="border-r border-border p-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" className="h-11 rounded-lg pl-10" />
          </div>
          <div className="mt-5 space-y-2 border-t border-border pt-5">
            {filteredThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => setActiveId(thread.id)}
                className={cn(
                  "w-full rounded-md border border-border p-3 text-left transition-colors",
                  activeThread?.id === thread.id ? "bg-[#e8f5e4]" : "bg-card hover:bg-muted/40",
                )}
              >
                <div className="flex items-center gap-3">
                  <ThreadAvatar thread={thread} employees={employees} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold">{thread.title}</span>
                        <ThreadTypeBadge thread={thread} />
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(thread.updatedAt)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                        {thread.lastMessage ? `${thread.lastMessage.senderName}: ${thread.lastMessage.body}` : "No messages yet"}
                      </span>
                      {thread.unreadCount > 0 && <span className="size-2.5 shrink-0 rounded-full bg-[#155e3f]" aria-label={`${thread.unreadCount} unread`} />}
                    </div>
                  </div>
                </div>
              </button>
            ))}
            {filteredThreads.length === 0 && (
              <p className="px-1 py-6 text-sm text-muted-foreground">
                {threads.length === 0 ? "No conversations yet. Start one with New Message, or wait for a driver to message in." : "No conversations match that search."}
              </p>
            )}
          </div>
        </aside>

        <main className="flex min-h-[640px] flex-col border-r border-border">
          {activeThread ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <h1 className="truncate text-lg font-bold">{activeThread.title}</h1>
                  <ThreadTypeBadge thread={activeThread} />
                  {activeThread.threadType === "job" && activeThread.jobId && (
                    <Link href={`/jobs/${activeThread.jobId}`} className="flex shrink-0 items-center gap-1 text-sm font-medium text-[#155e3f] hover:underline">
                      Open job <ExternalLink className="size-3.5" />
                    </Link>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="size-10 rounded-lg">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 rounded-lg p-2">
                    <DropdownMenuItem onClick={() => void archiveActive()} className="rounded-md px-3 py-2.5">
                      <Archive className="size-4" />
                      Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6">
                {groupByDay(messages).map((group) => (
                  <div key={group.label}>
                    <div className="my-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-xs text-muted-foreground first:mt-0">
                      <div className="h-px bg-border" />
                      <span>{group.label}</span>
                      <div className="h-px bg-border" />
                    </div>
                    <div className="space-y-4">
                      {group.messages.map((message) => {
                        const outgoing = message.senderId === dispatchIdentity.employeeId;
                        const sender = employees.find((employee) => employee.id === message.senderId);
                        return (
                          <div key={message.id} className={cn("flex flex-col", outgoing ? "items-end" : "items-start")}>
                            {!outgoing && (
                              <div className="mb-1 flex items-center gap-2">
                                <PersonAvatar
                                  name={message.senderName}
                                  color={sender ? profileColorHex(sender.profileColor) : "#155e3f"}
                                  size="size-6"
                                />
                                <span className="text-sm font-semibold">{message.senderName}</span>
                              </div>
                            )}
                            <div
                              className={cn(
                                "max-w-[75%] rounded-lg px-4 py-3 text-sm leading-relaxed",
                                outgoing ? "bg-[#e8f5e4] text-foreground" : "border border-border bg-card",
                              )}
                            >
                              {message.body}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">{timeOfDay(message.createdAt)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {messages.length === 0 && <p className="pt-10 text-center text-sm text-muted-foreground">No messages in this conversation yet.</p>}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-border px-6 py-4">
                <div className="relative">
                  <Input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void sendDraft();
                    }}
                    placeholder="Write a message (⌘ or Windows + Enter to send)"
                    className="h-12 rounded-lg pr-12"
                  />
                  <button type="button" onClick={() => void sendDraft()} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#155e3f]" aria-label="Send message">
                    <ArrowUp className="size-5 fill-current" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-muted-foreground">Select a conversation or start a new one.</div>
          )}
        </main>

        <aside className="p-6">{activeThread && <ContextPanel thread={activeThread} employees={employees} />}</aside>
      </div>

      <NewMessageDialog
        open={newMessageOpen}
        onOpenChange={setNewMessageOpen}
        employees={employees}
        onCreated={(thread) => {
          setThreads(getThreadsFromCache());
          setActiveId(thread.id);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// New Message dialog (direct or broadcast)
// ---------------------------------------------------------------------------

function NewMessageDialog({
  open,
  onOpenChange,
  employees,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: EmployeeRecord[];
  onCreated: (thread: DispatchThread) => void;
}) {
  const [mode, setMode] = useState<"direct" | "broadcast">("direct");
  const [employeeId, setEmployeeId] = useState("");
  const [subject, setSubject] = useState("");
  const [creating, setCreating] = useState(false);

  const dispatchIdentity = getDispatchIdentity();
  const activeEmployees = employees.filter((employee) => employee.status === "active" && employee.id !== dispatchIdentity.employeeId);

  const create = async () => {
    setCreating(true);
    try {
      if (mode === "direct") {
        const employee = activeEmployees.find((item) => item.id === employeeId);
        if (!employee) {
          toast.error("Pick an employee first");
          return;
        }
        const thread = await createThread({
          threadType: "direct",
          title: employeeName(employee),
          createdBy: dispatchIdentity.employeeId,
          participantIds: [dispatchIdentity.employeeId, employee.id],
        });
        onCreated(thread);
      } else {
        if (!subject.trim()) {
          toast.error("Add a subject for the broadcast");
          return;
        }
        const fieldTechs = employees.filter((employee) => employee.fieldTech && employee.status === "active");
        const thread = await createThread({
          threadType: "broadcast",
          title: subject.trim(),
          createdBy: dispatchIdentity.employeeId,
          participantIds: [dispatchIdentity.employeeId, ...fieldTechs.map((employee) => employee.id)],
        });
        onCreated(thread);
      }
      setEmployeeId("");
      setSubject("");
      onOpenChange(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] rounded-xl p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Mail className="size-5 text-muted-foreground" />
            New Message
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 border-t border-border pt-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("direct")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium",
                mode === "direct" ? "border-[#155e3f] bg-[#e8f5e4] text-[#155e3f]" : "border-border bg-card hover:bg-muted/40",
              )}
            >
              <UserRound className="size-4" />
              Direct Message
            </button>
            <button
              type="button"
              onClick={() => setMode("broadcast")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium",
                mode === "broadcast" ? "border-[#155e3f] bg-[#e8f5e4] text-[#155e3f]" : "border-border bg-card hover:bg-muted/40",
              )}
            >
              <Megaphone className="size-4" />
              Broadcast
            </button>
          </div>

          {mode === "direct" ? (
            <div>
              <label className="mb-2 block text-sm font-semibold">Send to</label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger className="h-12 w-full rounded-lg">
                  <SelectValue placeholder="Pick an employee" />
                </SelectTrigger>
                <SelectContent>
                  {activeEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employeeName(employee)} · {employee.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <label className="mb-2 block text-sm font-semibold">Subject</label>
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Monsoon warning this afternoon" className="h-12 rounded-lg" />
              <p className="mt-2 text-xs text-muted-foreground">Goes to every active field tech driver.</p>
            </div>
          )}

          <Button onClick={() => void create()} disabled={creating} className="h-11 w-full rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]">
            <Send className="size-4" />
            {creating ? "Starting..." : "Start Conversation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Right panel — context per thread type
// ---------------------------------------------------------------------------

function ContextPanel({ thread, employees }: { thread: DispatchThread; employees: EmployeeRecord[] }) {
  if (thread.threadType === "job") return <JobContext thread={thread} employees={employees} />;
  if (thread.threadType === "direct") return <DriverContext thread={thread} employees={employees} />;
  return <BroadcastContext thread={thread} employees={employees} />;
}

function formatSchedule(job: Job) {
  if (!job.scheduledStart) return "Unscheduled";
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(job.scheduledStart));
  const start = timeOfDay(job.scheduledStart);
  return job.scheduledEnd ? `${day}, ${start}-${timeOfDay(job.scheduledEnd)}` : `${day}, ${start}`;
}

function CrewDots({ names, employees }: { names: string[]; employees: EmployeeRecord[] }) {
  if (names.length === 0) return <span className="text-muted-foreground">Crew TBD</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {names.map((name) => {
        const employee = findEmployeeByName(name, employees);
        return (
          <span key={name} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: employee ? profileColorHex(employee.profileColor) : "#9ca3af" }} />
            {name}
          </span>
        );
      })}
    </span>
  );
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function JobContext({ thread, employees }: { thread: DispatchThread; employees: EmployeeRecord[] }) {
  const job = getJobs().find((item) => item.id === thread.jobId);
  if (!job) {
    return <div className="text-sm text-muted-foreground">Job details aren't available for this thread.</div>;
  }
  const crewNames = [job.assignment?.crewLead, ...(job.assignment?.crewMembers ?? [])].filter(Boolean) as string[];
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
        <span className="font-bold">{job.jobNumber}</span>
        <JobStatusBadge status={job.status} />
      </div>
      <div className="mt-4 space-y-4">
        <ContextRow label="Customer">{job.customerName}</ContextRow>
        <ContextRow label="Address">{[job.address, job.city, job.zip].filter(Boolean).join(", ") || "Not provided"}</ContextRow>
        <ContextRow label="Service">{job.materialName || job.jobLabel || job.serviceType?.replaceAll("_", " ") || "Junk removal"}</ContextRow>
        <ContextRow label="Scheduled">{formatSchedule(job)}</ContextRow>
        <ContextRow label="Vehicle">{job.vehicleName || job.assignment?.vehicleName || "Vehicle TBD"}</ContextRow>
        <ContextRow label="Crew">
          <CrewDots names={crewNames} employees={employees} />
        </ContextRow>
      </div>
      <Button asChild className="mt-5 h-10 w-full rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]">
        <Link href={`/jobs/${job.id}`}>Open Job</Link>
      </Button>
    </div>
  );
}

function DriverContext({ thread, employees }: { thread: DispatchThread; employees: EmployeeRecord[] }) {
  const driver = directThreadDriver(thread, employees);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let canceled = false;
    setOnline(null);
    const load = async () => {
      if (!driver || !supabase || !(await ensureSession())) return;
      const { data } = await supabase
        .from("driver_sessions")
        .select("is_online, last_seen_at")
        .eq("employee_id", driver.id)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (canceled) return;
      // Same rule as the dispatch map: silent for >5 minutes counts as offline.
      const fresh = data?.last_seen_at && Date.now() - new Date(data.last_seen_at).getTime() < 5 * 60 * 1000;
      setOnline(Boolean(data?.is_online && fresh));
    };
    void load();
    return () => {
      canceled = true;
    };
  }, [driver?.id]);

  if (!driver) {
    return <div className="text-sm text-muted-foreground">This employee isn't in the employee list on this device.</div>;
  }

  const currentJob = getJobs().find((job) => {
    if (["completed", "canceled"].includes(job.status)) return false;
    const crew = [job.assignment?.crewLead, ...(job.assignment?.crewMembers ?? [])].filter(Boolean) as string[];
    return crew.some((name) => name.toLowerCase() === employeeName(driver).toLowerCase());
  });

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <PersonAvatar name={employeeName(driver)} color={profileColorHex(driver.profileColor)} size="size-12" />
        <div className="min-w-0">
          <div className="truncate font-bold">{employeeName(driver)}</div>
          <div className="text-sm text-muted-foreground">{driver.role}</div>
        </div>
        {online !== null && (
          <span className={cn("ml-auto flex items-center gap-1.5 text-xs font-medium", online ? "text-green-700" : "text-muted-foreground")}>
            <span className={cn("size-2 rounded-full", online ? "bg-green-600" : "bg-gray-400")} />
            {online ? "Online" : "Offline"}
          </span>
        )}
      </div>
      <div className="mt-4 space-y-4">
        <ContextRow label="Phone">
          {driver.phone ? (
            <a href={`tel:${driver.phone}`} className="flex items-center gap-2 text-[#155e3f] hover:underline">
              <Phone className="size-4" />
              {driver.phone}
            </a>
          ) : (
            "Not provided"
          )}
        </ContextRow>
        <ContextRow label="Email">{driver.email || "Not provided"}</ContextRow>
        <ContextRow label="Current job">
          {currentJob ? (
            <Link href={`/jobs/${currentJob.id}`} className="text-[#155e3f] hover:underline">
              {currentJob.jobNumber} · {currentJob.customerName}
            </Link>
          ) : (
            "No active job assigned"
          )}
        </ContextRow>
      </div>
    </div>
  );
}

function BroadcastContext({ thread, employees }: { thread: DispatchThread; employees: EmployeeRecord[] }) {
  const dispatchId = getDispatchIdentity().employeeId;
  const recipients = thread.participants.filter((participant) => participant.employeeId !== dispatchId);
  const createdBy = employees.find((employee) => employee.id === thread.createdBy);
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 border-b border-border pb-4 font-bold">
        <Megaphone className="size-4 text-[#155e3f]" />
        Broadcast
      </div>
      <div className="mt-4 space-y-4">
        <ContextRow label={`Recipients (${recipients.length})`}>
          <div className="space-y-2">
            {recipients.map((participant) => {
              const employee = employees.find((item) => item.id === participant.employeeId);
              const name = employee ? employeeName(employee) : participant.employeeId;
              return (
                <div key={participant.id} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: employee ? profileColorHex(employee.profileColor) : "#9ca3af" }} />
                  {name}
                </div>
              );
            })}
            {recipients.length === 0 && <span className="text-muted-foreground">No recipients</span>}
          </div>
        </ContextRow>
        <ContextRow label="Created by">
          {(createdBy ? employeeName(createdBy) : "Dispatch") +
            " · " +
            new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(thread.createdAt))}
        </ContextRow>
      </div>
    </div>
  );
}
