import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  Building2,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Edit3,
  FileText,
  FolderOpen,
  Import,
  Info,
  Mail,
  MapPin,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  Save,
  Search,
  ShieldAlert,
  Tag,
  Trash2,
  Upload,
  User,
  UsersRound,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  addClientNote,
  clientName,
  deleteClient,
  getClient,
  getClients,
  saveClient,
} from "@/lib/clientStorage";
import {
  downloadThumbtackLeadsCsv,
  getThumbtackLeads,
  loadConversation,
  type ThumbtackLead,
  type ThumbtackMessage,
} from "@/lib/leadsStorage";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { importClientsFromCsv } from "@/utils/clientCsv";
import type {
  ClientKind,
  ClientRecord,
  ContactLogEntry,
  LeadSource,
} from "@/types/clients";

const leadSources: LeadSource[] = [
  "Angies",
  "Facebook Ads",
  "Craigslist",
  "Google Ads",
  "Referral",
  "Website",
  "AI Estimate",
  "Thumbtack",
  "Googe Maps",
];

const emptyClient: Partial<ClientRecord> = {
  kind: "client",
  firstName: "",
  lastName: "",
  company: "",
  email: "",
  phone: "",
  smsSetting: "receive",
  streetAddress: "",
  unit: "",
  city: "",
  state: "",
  zip: "",
  tags: [],
  privateNotes: "",
};

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  }).format(new Date(value));
}

export default function ClientsLeads() {
  const [, params] = useRoute("/clients/:clientId");
  const [isNewRoute] = useRoute("/clients/new");

  if (isNewRoute) return <ClientEditor mode="new" />;
  if (params?.clientId) return <ClientDetails clientId={params.clientId} />;
  return <ClientsList />;
}

function PageHeader({
  crumb,
  actions,
}: {
  crumb?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border bg-background px-4 py-5 md:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-[10px] border border-border bg-card text-[var(--moss-deep)] shadow-sm">
            <UsersRound className="size-[18px]" />
          </span>
          <Link
            href="/clients"
            className="font-display text-xl font-bold tracking-tight text-foreground hover:text-[#155e3f]"
          >
            Clients & Leads
          </Link>
          {crumb && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium text-foreground">{crumb}</span>
            </>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * One row of the list: a Thumbtack negotiation (read-only, from the
 * `app_leads_v` view) or a manually created client/lead (editable, from
 * clientStorage). DASHBOARD_LEADS_SPEC §2.
 */
type ListRow =
  | { source: "thumbtack"; id: string; lead: ThumbtackLead }
  | { source: "manual"; id: string; client: ClientRecord };

function rowName(row: ListRow) {
  return row.source === "thumbtack" ? row.lead.name : clientName(row.client);
}
function rowCompany(row: ListRow) {
  return row.source === "thumbtack" ? row.lead.category ?? "" : row.client.company ?? "";
}
function rowEmail(row: ListRow) {
  return row.source === "thumbtack" ? row.lead.email ?? "" : row.client.email ?? "";
}
function rowPhone(row: ListRow) {
  return row.source === "thumbtack" ? row.lead.phone ?? "" : row.client.phone ?? "";
}
function rowKind(row: ListRow): ClientKind {
  return row.source === "thumbtack" ? row.lead.kind : row.client.kind;
}
function rowCreatedAt(row: ListRow) {
  return row.source === "thumbtack" ? row.lead.receivedAt : row.client.createdAt;
}
function rowTags(row: ListRow) {
  return row.source === "thumbtack" ? ["Thumbtack"] : (row.client.tags ?? []);
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value;
}

const statusLabel: Record<ThumbtackLead["status"], string> = {
  new: "New",
  quoted: "Quoted",
  escalated: "Escalated",
  booked: "Booked",
  lost: "Lost",
};

function ClientsList() {
  const [clients, setClients] = useState<ClientRecord[]>(() => getClients());
  const [leads, setLeads] = useState<ThumbtackLead[]>(() => getThumbtackLeads());
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | ClientKind>("all");
  const [tagFilter, setTagFilter] = useState("Tags");
  const [sortField, setSortField] = useState<
    "Name" | "Company" | "Date Created"
  >("Date Created");
  const [sortDir, setSortDir] = useState<"Ascending" | "Descending">(
    "Descending"
  );
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openLead, setOpenLead] = useState<ThumbtackLead | null>(null);
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refresh = () => setClients(getClients());
    const refreshLeads = () => setLeads(getThumbtackLeads());
    window.addEventListener("clients-updated", refresh);
    window.addEventListener("thumbtack-leads-updated", refreshLeads);
    return () => {
      window.removeEventListener("clients-updated", refresh);
      window.removeEventListener("thumbtack-leads-updated", refreshLeads);
    };
  }, []);

  // Any filter/sort change drops the user back to the first page.
  useEffect(() => {
    setPage(1);
  }, [activeTab, query, tagFilter, sortField, sortDir, pageSize]);

  const rows = useMemo<ListRow[]>(
    () => [
      ...leads.map(lead => ({
        source: "thumbtack" as const,
        id: `tt:${lead.negotiationId}`,
        lead,
      })),
      ...clients.map(client => ({
        source: "manual" as const,
        id: client.id,
        client,
      })),
    ],
    [clients, leads]
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(row => rowTags(row).forEach(tag => set.add(tag)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  // Export = CSV of the Thumbtack view (spec §2). Manual clients stay on Import.
  const exportLeads = () => {
    const all = getThumbtackLeads();
    if (all.length === 0) {
      toast.info("No Thumbtack leads to export yet.");
      return;
    }
    downloadThumbtackLeadsCsv(all);
    toast.success(`Exported ${all.length} lead${all.length === 1 ? "" : "s"}.`);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-importing the same file
    if (!file) return;
    try {
      const text = await file.text();
      const { imported, skipped } = importClientsFromCsv(text);
      if (imported === 0) {
        toast.error("No clients found in that file. Check the column headers.");
        return;
      }
      const skippedNote = skipped > 0 ? ` (${skipped} row${skipped === 1 ? "" : "s"} skipped)` : "";
      toast.success(`Imported ${imported} client${imported === 1 ? "" : "s"}.${skippedNote}`);
    } catch {
      toast.error("Couldn't read that file. Please upload a CSV.");
    }
  };

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = rows.filter(row => {
      const matchesTab = activeTab === "all" || rowKind(row) === activeTab;
      const matchesTag = tagFilter === "Tags" || rowTags(row).includes(tagFilter);
      const searchable = [
        rowName(row),
        rowCompany(row),
        rowEmail(row),
        rowPhone(row),
        rowKind(row),
        row.source === "thumbtack" ? row.lead.city : "",
        row.source === "thumbtack" ? statusLabel[row.lead.status] : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        matchesTab &&
        matchesTag &&
        (!normalizedQuery || searchable.includes(normalizedQuery))
      );
    });
    const dir = sortDir === "Ascending" ? 1 : -1;
    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "Name") {
        cmp = rowName(a).localeCompare(rowName(b));
      } else if (sortField === "Company") {
        cmp = rowCompany(a).localeCompare(rowCompany(b));
      } else {
        cmp =
          new Date(rowCreatedAt(a)).getTime() - new Date(rowCreatedAt(b)).getTime();
      }
      return cmp * dir;
    });
    return result;
  }, [activeTab, rows, query, tagFilter, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pagedRows = filteredRows.slice(pageStart, pageStart + pageSize);

  const removeClient = (event: React.MouseEvent, clientId: string) => {
    event.stopPropagation();
    setClients(deleteClient(clientId));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(clientId);
      return next;
    });
    toast.success("Client deleted");
  };

  // Only manual rows can be selected/deleted — Thumbtack rows are read-only.
  const visibleIds = pagedRows
    .filter(row => row.source === "manual")
    .map(row => row.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some(id => selectedIds.has(id));

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) visibleIds.forEach(id => next.add(id));
      else visibleIds.forEach(id => next.delete(id));
      return next;
    });
  };

  const toggleOne = (clientId: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(clientId);
      else next.delete(clientId);
      return next;
    });
  };

  const deleteSelected = () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (
      !window.confirm(
        `Delete ${count} ${count === 1 ? "entry" : "entries"}? This can't be undone.`
      )
    )
      return;
    let result = clients;
    selectedIds.forEach(id => {
      result = deleteClient(id);
    });
    setClients(result);
    setSelectedIds(new Set());
    toast.success(`${count} ${count === 1 ? "entry" : "entries"} deleted`);
  };

  const openRow = (row: ListRow) => {
    if (row.source === "thumbtack") setOpenLead(row.lead);
    else navigate(`/clients/${row.id}`);
  };

  const columnCount = activeTab === "lead" ? 7 : 9;

  return (
    <>
      <PageHeader
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border-[#155e3f] text-[#155e3f] hover:text-[#155e3f]"
            >
              <Import className="size-4" />
              Import Clients
            </Button>
            <Button
              variant="outline"
              onClick={exportLeads}
              className="rounded-lg border-[#155e3f] text-[#155e3f] hover:text-[#155e3f]"
            >
              <Upload className="size-4" />
              Export Leads
            </Button>
            <Button
              asChild
              className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]"
            >
              <Link href="/clients/new">
                <Plus className="size-4" />
                Create Client or Lead
              </Link>
            </Button>
          </>
        }
      />
      <div className="space-y-5 px-4 py-8 md:px-8">
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-[400px]">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
              <Input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search name, phone, city, status..."
                className="h-12 rounded-lg pl-10 pr-10"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8a9180]"
                  aria-label="Clear client search"
                >
                  x
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <FilterSelect
                value={tagFilter}
                onChange={setTagFilter}
                options={["Tags", ...allTags]}
              />
              <FilterSelect
                value={sortField}
                onChange={value =>
                  setSortField(value as "Name" | "Company" | "Date Created")
                }
                options={["Name", "Company", "Date Created"]}
              />
              <FilterSelect
                value={sortDir}
                onChange={value =>
                  setSortDir(value as "Ascending" | "Descending")
                }
                options={["Ascending", "Descending"]}
              />
              <FilterSelect
                value={String(pageSize)}
                onChange={value => setPageSize(Number(value))}
                options={["10", "25", "50"]}
              />
            </div>
          </div>

          <div className="mt-6 flex border-b border-border">
            {(["all", "client", "lead"] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "min-w-20 border-b-4 border-transparent px-4 py-4 text-left text-base font-medium capitalize transition-colors",
                  activeTab === tab
                    ? "border-[#155e3f] text-[#155e3f]"
                    : "text-foreground hover:text-primary"
                )}
              >
                {tab === "all" ? "All" : tab}
              </button>
            ))}
          </div>

          {selectedIds.size > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm">
              <span className="font-medium">{selectedIds.size} selected</span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={deleteSelected}
                >
                  <Trash2 className="size-4" />
                  Delete selected
                </Button>
              </div>
            </div>
          )}

          <div className="mt-5 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-14 px-8">
                    <Checkbox
                      aria-label="Select all clients"
                      checked={
                        allVisibleSelected
                          ? true
                          : someVisibleSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={checked =>
                        toggleAllVisible(checked === true)
                      }
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  {activeTab !== "lead" && <TableHead>Company / Service</TableHead>}
                  {activeTab !== "lead" && <TableHead>Email</TableHead>}
                  <TableHead>Phone</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedRows.map(row => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => openRow(row)}
                  >
                    <TableCell
                      className="px-8"
                      onClick={event => event.stopPropagation()}
                    >
                      <Checkbox
                        aria-label={`Select ${rowName(row)}`}
                        disabled={row.source === "thumbtack"}
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={checked =>
                          toggleOne(row.id, checked === true)
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{rowName(row)}</span>
                        {row.source === "thumbtack" && row.lead.escalatedAt && (
                          <Badge className="rounded-full border-[#ead4ae] bg-[#f4e7d2] px-2 font-semibold text-[#a06b22] hover:bg-[#f4e7d2]">
                            <ShieldAlert className="size-3" />
                            Escalated
                          </Badge>
                        )}
                        {row.source === "thumbtack" && row.lead.leadCountForPhone > 1 && (
                          <Badge
                            variant="secondary"
                            className="rounded-full bg-muted px-2 font-normal text-foreground"
                          >
                            repeat ({row.lead.leadCountForPhone})
                          </Badge>
                        )}
                        {row.source === "thumbtack" && row.lead.tvInstallReferral && (
                          <Badge
                            variant="secondary"
                            className="rounded-full bg-muted px-2 font-normal text-foreground"
                          >
                            TV referral
                          </Badge>
                        )}
                      </div>
                      {row.source === "thumbtack" && row.lead.city && (
                        <div className="text-xs font-normal text-muted-foreground">
                          {row.lead.city}
                        </div>
                      )}
                    </TableCell>
                    {activeTab !== "lead" && (
                      <TableCell>{rowCompany(row)}</TableCell>
                    )}
                    {activeTab !== "lead" && (
                      <TableCell>{rowEmail(row)}</TableCell>
                    )}
                    <TableCell>
                      {rowPhone(row) ? formatPhone(rowPhone(row)) : ""}
                      {row.source === "thumbtack" && row.lead.phone && row.lead.phoneIsRelay && (
                        <span
                          className="ml-1.5 text-xs text-muted-foreground"
                          title="Thumbtack relay number — not the customer's real line"
                        >
                          relay
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="rounded-full bg-muted px-3 font-normal text-foreground"
                      >
                        {rowKind(row)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.source === "thumbtack" ? (
                        <span className="text-sm">{statusLabel[row.lead.status]}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Manual</span>
                      )}
                    </TableCell>
                    <TableCell>{formatCreatedAt(rowCreatedAt(row))}</TableCell>
                    <TableCell
                      className="text-right"
                      onClick={event => event.stopPropagation()}
                    >
                      {row.source === "thumbtack" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[#155e3f] hover:text-[#0c4a30]"
                          onClick={() => setOpenLead(row.lead)}
                        >
                          <MessageSquareText className="size-4" />
                          Open conversation
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={event => removeClient(event, row.id)}
                            aria-label={`Delete ${rowName(row)}`}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            aria-label={`Edit ${rowName(row)}`}
                          >
                            <Link href={`/clients/${row.id}`}>
                              <Edit3 className="size-4 text-[#8a9180]" />
                            </Link>
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={columnCount} className="h-72 text-center">
                      <div className="flex flex-col items-center justify-center gap-6 text-base">
                        <div className="flex items-center gap-2">
                          <FolderOpen className="size-5 text-[#155e3f]" />
                          {rows.length === 0
                            ? "No leads yet. Thumbtack leads appear here automatically."
                            : "Nothing matches that filter."}
                        </div>
                        {rows.length === 0 && (
                          <Button
                            onClick={() => fileInputRef.current?.click()}
                            className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]"
                          >
                            <Download className="size-4" />
                            Import Clients
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 text-sm md:flex-row md:items-center md:justify-between">
          <span>
            {filteredRows.length
              ? `Showing ${pageStart + 1}-${pageStart + pagedRows.length} of ${filteredRows.length} results`
              : "No results."}
          </span>
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              className="size-10 rounded-lg"
              disabled={currentPage <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-10 rounded-lg"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </section>
      </div>
      <ConversationSheet lead={openLead} onClose={() => setOpenLead(null)} />
    </>
  );
}

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
 * Read-only Thumbtack thread for one negotiation, newest last. No composer:
 * replies stay in the responder pipeline (spec §2), and nothing here can
 * clear an escalation.
 */
function ConversationSheet({
  lead,
  onClose,
}: {
  lead: ThumbtackLead | null;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ThumbtackMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lead) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessages([]);
    loadConversation(lead.negotiationId)
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
  }, [lead]);

  return (
    <Sheet open={Boolean(lead)} onOpenChange={open => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle className="flex flex-wrap items-center gap-2 font-display text-xl">
            {lead?.name}
            {lead?.escalatedAt && (
              <Badge className="rounded-full border-[#ead4ae] bg-[#f4e7d2] px-2 font-semibold text-[#a06b22] hover:bg-[#f4e7d2]">
                <ShieldAlert className="size-3" />
                Escalated
              </Badge>
            )}
            {lead && (
              <Badge
                variant="secondary"
                className="rounded-full bg-muted px-2 font-normal text-foreground"
              >
                {statusLabel[lead.status]}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription className="text-sm">
            {[
              lead?.category,
              lead?.city,
              lead?.phone
                ? `${formatPhone(lead.phone)}${lead.phoneIsRelay ? " (relay)" : ""}`
                : null,
              lead?.leadPrice ? `Lead cost ${lead.leadPrice}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-5">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading conversation…</p>
          )}
          {error && (
            <p className="text-sm text-[#a06b22]">Couldn't load the thread: {error}</p>
          )}
          {!loading && !error && messages.length === 0 && (
            <p className="text-sm text-muted-foreground">No messages on this lead yet.</p>
          )}
          {messages.map(message => (
            <div
              key={message.id}
              className={cn(
                "flex flex-col gap-1",
                message.direction === "outbound" ? "items-end" : "items-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                  message.direction === "outbound"
                    ? "rounded-br-md bg-[#155e3f] text-white"
                    : "rounded-bl-md border border-border bg-card text-foreground"
                )}
              >
                {message.text}
              </div>
              <span className="px-1 text-[11px] text-muted-foreground">
                {message.direction === "outbound" ? "Us" : lead?.name ?? "Customer"} ·{" "}
                {formatMessageTime(message.sentAt)}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-border bg-card px-5 py-3 text-xs text-muted-foreground">
          Read-only. Replies go out through the Thumbtack responder, not from here.
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange?: (value: string) => void;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 min-w-[110px] rounded-lg bg-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(option => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ClientEditor({ mode }: { mode: "new" }) {
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState<Partial<ClientRecord>>(emptyClient);

  const updateDraft = (updates: Partial<ClientRecord>) =>
    setDraft(current => ({ ...current, ...updates }));

  const createClient = () => {
    const initialNote = (draft.privateNotes ?? "").trim();
    const saved = saveClient({
      ...draft,
      privateNotes: undefined,
      kind: draft.kind ?? "client",
      firstName: draft.firstName?.trim() || "New",
      lastName: draft.lastName?.trim() || "Client",
    });
    if (initialNote) addClientNote(saved.id, initialNote);
    toast.success(`${saved.kind === "client" ? "Client" : "Lead"} created`);
    navigate(`/clients/${saved.id}`);
  };

  return (
    <>
      <PageHeader
        crumb="New Client or Lead"
        actions={
          <Button
            onClick={createClient}
            className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]"
          >
            <Plus className="size-4" />
            Create Client
          </Button>
        }
      />
      <div className="grid gap-5 px-4 py-8 xl:grid-cols-[1fr_1fr] md:px-8">
        <div className="space-y-5">
          <Panel>
            <FieldLabel>Client or Lead</FieldLabel>
            <Select
              value={draft.kind}
              onValueChange={value =>
                updateDraft({ kind: value as ClientKind })
              }
            >
              <SelectTrigger className="h-12 w-full rounded-lg bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
              </SelectContent>
            </Select>
          </Panel>
          <ClientFields draft={draft} updateDraft={updateDraft} />
          <AddressFields draft={draft} updateDraft={updateDraft} />
        </div>
        <div className="space-y-5">
          <InitialNoteField
            value={draft.privateNotes ?? ""}
            onChange={privateNotes => updateDraft({ privateNotes })}
          />
          <MoreFields draft={draft} updateDraft={updateDraft} />
        </div>
      </div>
    </>
  );
}

function ClientDetails({ clientId }: { clientId: string }) {
  const [, navigate] = useLocation();
  const [client, setClient] = useState<ClientRecord | null>(() =>
    getClient(clientId)
  );

  if (!client) {
    return (
      <>
        <PageHeader crumb="Details" />
        <div className="px-4 py-8 md:px-8">Client not found.</div>
      </>
    );
  }

  const updateClient = (updates: Partial<ClientRecord>) =>
    setClient(current => (current ? { ...current, ...updates } : current));
  const persistClient = () => {
    const saved = saveClient(client);
    setClient(saved);
    toast.success("Client saved");
  };

  return (
    <>
      <PageHeader
        crumb="Details"
        actions={
          <>
            <Button
              onClick={persistClient}
              className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]"
            >
              <Save className="size-4" />
              Save
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-10 rounded-lg"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => toast.info("Message composer placeholder")}
                >
                  Send Message
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    deleteClient(client.id);
                    toast.success("Client deleted");
                    navigate("/clients");
                  }}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <div className="grid gap-5 px-4 py-8 xl:grid-cols-[1fr_1fr] md:px-8">
        <div className="space-y-5">
          <ClientFields draft={client} updateDraft={updateClient} showMap />
          <AddressFields draft={client} updateDraft={updateClient} compact />
        </div>
        <div className="space-y-5">
          <ContactLog
            entries={client.contactLog ?? []}
            legacyNote={client.privateNotes}
            legacyDate={client.updatedAt}
            onAddNote={text => {
              const saved = addClientNote(client.id, text);
              if (saved)
                setClient(current =>
                  current ? { ...current, contactLog: saved.contactLog } : saved
                );
            }}
          />
          <DetailSection
            icon={CreditCard}
            title="Credit Cards"
            actions={
              <>
                <Button
                  variant="outline"
                  className="rounded-full border-[#155e3f] text-[#155e3f] hover:text-[#155e3f]"
                >
                  Send Card Request
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full border-[#155e3f] text-[#155e3f] hover:text-[#155e3f]"
                >
                  Add Card
                </Button>
              </>
            }
          >
            <p className="text-sm text-[#8a9180]">No saved cards</p>
          </DetailSection>
          <DetailSection
            icon={Wrench}
            title="Jobs"
            actions={
              <Button
                variant="outline"
                className="rounded-full border-[#155e3f] text-[#155e3f] hover:text-[#155e3f]"
              >
                Create Job
              </Button>
            }
          >
            <p className="text-sm text-[#8a9180]">No jobs added.</p>
          </DetailSection>
          <DetailSection
            icon={FileText}
            title="Invoices"
            actions={
              <Button
                variant="outline"
                className="rounded-full border-[#155e3f] text-[#155e3f] hover:text-[#155e3f]"
              >
                Create Invoice
              </Button>
            }
          >
            <p className="text-sm text-[#8a9180]">No invoices added.</p>
          </DetailSection>
          <DetailSection
            icon={FileText}
            title="Estimates"
            actions={
              <Button
                variant="outline"
                className="rounded-full border-[#155e3f] text-[#155e3f] hover:text-[#155e3f]"
              >
                Create Estimate
              </Button>
            }
          >
            <p className="text-sm text-[#8a9180]">No estimates added.</p>
          </DetailSection>
          <MoreFields draft={client} updateDraft={updateClient} />
          <DetailSection
            icon={Paperclip}
            title="Attachments"
            actions={
              <Button
                variant="outline"
                className="rounded-full border-[#155e3f] text-[#155e3f] hover:text-[#155e3f]"
              >
                Upload
              </Button>
            }
          >
            <p className="text-sm text-[#8a9180]">No attachments uploaded.</p>
          </DetailSection>
        </div>
      </div>
    </>
  );
}

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card p-6 shadow-sm",
        className
      )}
    >
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-3 block text-sm font-semibold text-foreground">
      {children}
    </label>
  );
}

function ClientFields({
  draft,
  updateDraft,
  showMap = false,
}: {
  draft: Partial<ClientRecord>;
  updateDraft: (updates: Partial<ClientRecord>) => void;
  showMap?: boolean;
}) {
  return (
    <Panel>
      <SectionTitle icon={Info}>Client</SectionTitle>
      {showMap && <StreetViewPreview client={draft} />}
      <div className="grid gap-5 md:grid-cols-2">
        <TextField
          label="First Name"
          value={draft.firstName ?? ""}
          placeholder="Enter client's first name"
          icon={User}
          onChange={firstName => updateDraft({ firstName })}
        />
        <TextField
          label="Last Name"
          value={draft.lastName ?? ""}
          placeholder="Enter client's last name"
          icon={User}
          onChange={lastName => updateDraft({ lastName })}
        />
        <TextField
          label="Email"
          value={draft.email ?? ""}
          placeholder="Enter client's email address"
          icon={Mail}
          onChange={email => updateDraft({ email })}
        />
        <TextField
          label="Phone Number"
          value={draft.phone ?? ""}
          placeholder="Enter client's phone number"
          icon={Phone}
          onChange={phone => updateDraft({ phone })}
        />
      </div>
      <div className="mt-5">
        <TextField
          label="Company Name"
          value={draft.company ?? ""}
          placeholder="Enter client's company (optional)"
          icon={Building2}
          onChange={company => updateDraft({ company })}
        />
      </div>
      <div className="mt-5">
        <FieldLabel>Client SMS Setting</FieldLabel>
        <Select
          value={draft.smsSetting ?? "receive"}
          onValueChange={value =>
            updateDraft({ smsSetting: value as ClientRecord["smsSetting"] })
          }
        >
          <SelectTrigger className="h-12 w-full rounded-lg bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="receive">Receive SMS</SelectItem>
            <SelectItem value="do_not_receive">Do not receive SMS</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {showMap && (
        <div className="mt-6 flex items-center justify-between">
          <span className="text-sm font-medium">
            Mark client "Do Not Service"
          </span>
          <Switch
            checked={Boolean(draft.doNotService)}
            onCheckedChange={doNotService => updateDraft({ doNotService })}
          />
        </div>
      )}
    </Panel>
  );
}

function AddressFields({
  draft,
  updateDraft,
  compact = false,
}: {
  draft: Partial<ClientRecord>;
  updateDraft: (updates: Partial<ClientRecord>) => void;
  compact?: boolean;
}) {
  return (
    <Panel>
      <SectionTitle icon={MapPin}>Client Address</SectionTitle>
      {!compact && <MapPreview />}
      <div className="space-y-5">
        <TextField
          label="Street Address"
          value={draft.streetAddress ?? ""}
          placeholder="Street Address"
          icon={MapPin}
          onChange={streetAddress => updateDraft({ streetAddress })}
        />
        <TextField
          label="Unit #"
          value={draft.unit ?? ""}
          placeholder="Unit #"
          icon={MapPin}
          onChange={unit => updateDraft({ unit })}
        />
        <TextField
          label="City"
          value={draft.city ?? ""}
          placeholder="City"
          icon={Building2}
          onChange={city => updateDraft({ city })}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <FieldLabel>State</FieldLabel>
            <Select
              value={draft.state || undefined}
              onValueChange={state => updateDraft({ state })}
            >
              <SelectTrigger className="h-12 w-full rounded-lg bg-card">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {["AZ", "CA", "NV", "NM", "UT"].map(state => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TextField
            label="ZIP"
            value={draft.zip ?? ""}
            placeholder="ZIP"
            icon={MapPin}
            onChange={zip => updateDraft({ zip })}
          />
        </div>
      </div>
    </Panel>
  );
}

function InitialNoteField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Panel>
      <SectionTitle icon={FileText}>Notes</SectionTitle>
      <Textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder="Add an optional first note. Once the client is created, this starts their contact log."
        className="min-h-[216px] resize-none rounded-lg p-6"
      />
    </Panel>
  );
}

function formatLogTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function ContactLog({
  entries,
  legacyNote,
  legacyDate,
  onAddNote,
}: {
  entries: ContactLogEntry[];
  legacyNote?: string;
  legacyDate?: string;
  onAddNote: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const ordered = [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const hasLegacy = Boolean(legacyNote && legacyNote.trim());

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAddNote(trimmed);
    setText("");
  };

  return (
    <Panel>
      <SectionTitle icon={FileText}>Contact Log</SectionTitle>
      <div className="space-y-3">
        <Textarea
          value={text}
          onChange={event => setText(event.target.value)}
          placeholder={`Log a call or note — e.g. "Spoke to Sam, advised red truck blocking container; he'll move it."`}
          className="min-h-[96px] resize-none rounded-lg p-4"
        />
        <div className="flex justify-end">
          <Button
            onClick={submit}
            disabled={!text.trim()}
            className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]"
          >
            <Plus className="size-4" />
            Add note
          </Button>
        </div>
        {ordered.length === 0 && !hasLegacy ? (
          <p className="text-sm text-[#8a9180]">No contact logged yet.</p>
        ) : (
          <ul className="space-y-3">
            {ordered.map(entry => (
              <li
                key={entry.id}
                className="rounded-lg border border-border bg-muted/30 p-3"
              >
                <div className="mb-1 text-xs font-medium text-[#8a9180]">
                  {formatLogTimestamp(entry.createdAt)}
                  {entry.author ? ` · ${entry.author}` : ""}
                </div>
                <div className="whitespace-pre-wrap text-sm text-foreground">
                  {entry.text}
                </div>
              </li>
            ))}
            {hasLegacy && (
              <li className="rounded-lg border border-dashed border-border bg-muted/20 p-3">
                <div className="mb-1 text-xs font-medium text-[#8a9180]">
                  {legacyDate ? formatLogTimestamp(legacyDate) : "Earlier"} ·
                  earlier note
                </div>
                <div className="whitespace-pre-wrap text-sm text-foreground">
                  {legacyNote}
                </div>
              </li>
            )}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function MoreFields({
  draft,
  updateDraft,
}: {
  draft: Partial<ClientRecord>;
  updateDraft: (updates: Partial<ClientRecord>) => void;
}) {
  return (
    <Panel>
      <SectionTitle icon={Tag}>More</SectionTitle>
      <div className="space-y-5">
        <div>
          <FieldLabel>Lead Source</FieldLabel>
          <Select
            value={draft.leadSource}
            onValueChange={leadSource =>
              updateDraft({ leadSource: leadSource as LeadSource })
            }
          >
            <SelectTrigger className="h-12 w-full rounded-lg bg-card">
              <SelectValue placeholder="Select lead source" />
            </SelectTrigger>
            <SelectContent>
              {leadSources.map(source => (
                <SelectItem key={source} value={source}>
                  {source}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <TextField
          label="Tags"
          value={(draft.tags ?? []).join(", ")}
          placeholder="Enter tags"
          icon={Tag}
          onChange={tags =>
            updateDraft({
              tags: tags
                .split(",")
                .map(tag => tag.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
    </Panel>
  );
}

function DetailSection({
  icon: Icon,
  title,
  actions,
  children,
}: {
  icon: typeof FileText;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Panel className="p-0">
      <div className="flex flex-col gap-3 border-b border-border p-6 md:flex-row md:items-center md:justify-between">
        <SectionTitle icon={Icon} noBorder>
          {title}
        </SectionTitle>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="p-6">{children}</div>
    </Panel>
  );
}

function SectionTitle({
  icon: Icon,
  children,
  noBorder = false,
}: {
  icon: typeof Info;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div
      className={cn(
        "mb-5 flex items-center gap-2 text-2xl font-bold",
        !noBorder && "border-b border-border pb-4"
      )}
    >
      <Icon className="size-5" />
      <h2 className="text-2xl font-bold">{children}</h2>
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  icon: Icon,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  icon: typeof User;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <Input
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-12 rounded-lg pr-11"
        />
        <Icon className="absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#8a9180]" />
      </div>
    </div>
  );
}

function MapPreview() {
  return (
    <div className="mb-6 h-[202px] overflow-hidden rounded-lg border border-border bg-[linear-gradient(135deg,#e8eef8_0%,#f6f8fb_45%,#e9f1e5_100%)]">
      <div className="flex h-full flex-col justify-between p-4">
        <div className="flex w-fit overflow-hidden rounded-md bg-card shadow-sm">
          <span className="bg-card px-4 py-3 font-bold">Map</span>
          <span className="bg-muted px-4 py-3 text-muted-foreground">
            Satellite
          </span>
        </div>
        <div className="text-xs font-semibold text-muted-foreground">
          Google map preview
        </div>
      </div>
    </div>
  );
}

function StreetViewPreview({ client }: { client: Partial<ClientRecord> }) {
  return (
    <div className="mb-6 h-[202px] overflow-hidden rounded-lg border border-border bg-[linear-gradient(115deg,#d8e5f5_0%,#9fb7c9_42%,#e0d2bd_43%,#9e8d78_60%,#627b5f_100%)]">
      <div className="flex h-full flex-col justify-between p-4 text-white">
        <div className="w-fit rounded-sm bg-black/50 px-4 py-3 text-sm">
          <div className="font-bold">
            {client.streetAddress || "13809 Barrydale St"}
          </div>
          <div className="text-xs opacity-90">
            {[client.city, client.state].filter(Boolean).join(", ") ||
              "West Puente Valley, California"}
          </div>
        </div>
        <div className="flex items-end justify-between">
          <span className="font-bold">Google</span>
          <span className="rounded-full bg-black/50 px-5 py-2 text-base">
            Map View
          </span>
        </div>
      </div>
    </div>
  );
}
