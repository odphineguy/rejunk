import { useEffect, useMemo, useState } from "react";
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
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  Save,
  Search,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { clientName, deleteClient, getClient, getClients, saveClient } from "@/lib/clientStorage";
import { cn } from "@/lib/utils";
import type { ClientKind, ClientRecord, LeadSource } from "@/types/clients";

const leadSources: LeadSource[] = ["Angies", "Facebook Ads", "Craigslist", "Google Ads", "Referral", "Website", "Thumbtack", "Googe Maps"];

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

function PageHeader({ crumb, actions }: { crumb?: string; actions?: React.ReactNode }) {
  return (
    <div className="border-b border-border bg-background px-4 py-5 md:px-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-base">
          <UsersRound className="size-5 text-[#7180a8]" />
          <Link href="/clients" className="text-[#7180a8] hover:text-primary">
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

function ClientsList() {
  const [clients, setClients] = useState<ClientRecord[]>(() => getClients());
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | ClientKind>("client");
  const [, navigate] = useLocation();

  useEffect(() => {
    const refresh = () => setClients(getClients());
    window.addEventListener("clients-updated", refresh);
    return () => window.removeEventListener("clients-updated", refresh);
  }, []);

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return clients.filter((client) => {
      const matchesTab = activeTab === "all" || client.kind === activeTab;
      const searchable = [clientName(client), client.company, client.email, client.phone, client.kind].filter(Boolean).join(" ").toLowerCase();
      return matchesTab && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [activeTab, clients, query]);

  const removeClient = (event: React.MouseEvent, clientId: string) => {
    event.stopPropagation();
    setClients(deleteClient(clientId));
    toast.success("Client deleted");
  };

  return (
    <>
      <PageHeader
        actions={
          <>
            <Button variant="outline" className="rounded-lg border-[#3f3df1] text-[#3f3df1] hover:text-[#3f3df1]">
              <Import className="size-4" />
              Import Clients
            </Button>
            <Button variant="outline" className="rounded-lg border-[#3f3df1] text-[#3f3df1] hover:text-[#3f3df1]">
              <Upload className="size-4" />
              Export Clients
            </Button>
            <Button asChild className="rounded-lg bg-[#3f3df1] text-white hover:bg-[#3330df]">
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
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." className="h-12 rounded-lg pl-10 pr-10" />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7180a8]" aria-label="Clear client search">
                  x
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <FilterSelect value="Tags" options={["Tags", "Autopilot", "Referral", "Website"]} />
              <FilterSelect value="Name" options={["Name", "Company", "Date Created"]} />
              <FilterSelect value="Ascending" options={["Ascending", "Descending"]} />
              <FilterSelect value="10" options={["10", "25", "50"]} />
              <Button variant="outline" size="icon" className="size-10 rounded-lg">
                <MoreHorizontal className="size-4" />
              </Button>
            </div>
          </div>

          <div className="mt-6 flex border-b border-border">
            {(["all", "client", "lead"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "min-w-20 border-b-4 border-transparent px-4 py-4 text-left text-base font-medium capitalize transition-colors",
                  activeTab === tab ? "border-[#3f3df1] text-[#3f3df1]" : "text-foreground hover:text-primary",
                )}
              >
                {tab === "all" ? "All" : tab}
              </button>
            ))}
          </div>

          <div className="mt-5 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-14 px-8">
                    <Checkbox aria-label="Select all clients" />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  {activeTab !== "lead" && <TableHead>Company</TableHead>}
                  {activeTab !== "lead" && <TableHead>Email</TableHead>}
                  <TableHead>Phone</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id} className="cursor-pointer" onClick={() => navigate(`/clients/${client.id}`)}>
                    <TableCell className="px-8" onClick={(event) => event.stopPropagation()}>
                      <Checkbox aria-label={`Select ${clientName(client)}`} />
                    </TableCell>
                    <TableCell className="font-medium">{clientName(client)}</TableCell>
                    {activeTab !== "lead" && <TableCell>{client.company || ""}</TableCell>}
                    {activeTab !== "lead" && <TableCell>{client.email || ""}</TableCell>}
                    <TableCell>{client.phone || ""}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="rounded-full bg-muted px-3 font-normal text-foreground">
                        {client.kind}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatCreatedAt(client.createdAt)}</TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={(event) => removeClient(event, client.id)} aria-label={`Delete ${clientName(client)}`}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                      <Button variant="ghost" size="icon" asChild aria-label={`Edit ${clientName(client)}`}>
                        <Link href={`/clients/${client.id}`}>
                          <Edit3 className="size-4 text-[#7180a8]" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredClients.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={activeTab === "lead" ? 6 : 8} className="h-72 text-center">
                      <div className="flex flex-col items-center justify-center gap-6 text-base">
                        <div className="flex items-center gap-2">
                          <FolderOpen className="size-5 text-[#3f3df1]" />
                          There are no leads found. Please add some!
                        </div>
                        <Button className="rounded-lg bg-[#3f3df1] text-white hover:bg-[#3330df]">
                          <Download className="size-4" />
                          Import Clients
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 text-sm md:flex-row md:items-center md:justify-between">
          <span>{filteredClients.length ? `Showing 1-${filteredClients.length} of ${filteredClients.length} results` : "No results."}</span>
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" className="size-10 rounded-lg">
              <ChevronLeft className="size-4" />
            </Button>
            <span>Page 1 of 1</span>
            <Button variant="outline" size="icon" className="size-10 rounded-lg">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

function FilterSelect({ value, options }: { value: string; options: string[] }) {
  return (
    <Select value={value}>
      <SelectTrigger className="h-10 min-w-[110px] rounded-lg bg-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
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

  const updateDraft = (updates: Partial<ClientRecord>) => setDraft((current) => ({ ...current, ...updates }));

  const createClient = () => {
    const saved = saveClient({
      ...draft,
      kind: draft.kind ?? "client",
      firstName: draft.firstName?.trim() || "New",
      lastName: draft.lastName?.trim() || "Client",
    });
    toast.success(`${saved.kind === "client" ? "Client" : "Lead"} created`);
    navigate(`/clients/${saved.id}`);
  };

  return (
    <>
      <PageHeader
        crumb="New Client or Lead"
        actions={
          <Button onClick={createClient} className="rounded-lg bg-[#3f3df1] text-white hover:bg-[#3330df]">
            <Plus className="size-4" />
            Create Client
          </Button>
        }
      />
      <div className="grid gap-5 px-4 py-8 xl:grid-cols-[1fr_1fr] md:px-8">
        <div className="space-y-5">
          <Panel>
            <FieldLabel>Client or Lead</FieldLabel>
            <Select value={draft.kind} onValueChange={(value) => updateDraft({ kind: value as ClientKind })}>
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
          <PrivateNotes value={draft.privateNotes ?? ""} onChange={(privateNotes) => updateDraft({ privateNotes })} />
          <MoreFields draft={draft} updateDraft={updateDraft} />
        </div>
      </div>
    </>
  );
}

function ClientDetails({ clientId }: { clientId: string }) {
  const [, navigate] = useLocation();
  const [client, setClient] = useState<ClientRecord | null>(() => getClient(clientId));

  if (!client) {
    return (
      <>
        <PageHeader crumb="Details" />
        <div className="px-4 py-8 md:px-8">Client not found.</div>
      </>
    );
  }

  const updateClient = (updates: Partial<ClientRecord>) => setClient((current) => (current ? { ...current, ...updates } : current));
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
            <Button onClick={persistClient} className="rounded-lg bg-[#3f3df1] text-white hover:bg-[#3330df]">
              <Save className="size-4" />
              Save
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-10 rounded-lg">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => toast.info("Message composer placeholder")}>Send Message</DropdownMenuItem>
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
          <PrivateNotes value={client.privateNotes ?? ""} onChange={(privateNotes) => updateClient({ privateNotes })} />
          <DetailSection icon={CreditCard} title="Credit Cards" actions={<><Button variant="outline" className="rounded-full border-[#3f3df1] text-[#3f3df1] hover:text-[#3f3df1]">Send Card Request</Button><Button variant="outline" className="rounded-full border-[#3f3df1] text-[#3f3df1] hover:text-[#3f3df1]">Add Card</Button></>}>
            <p className="text-sm text-[#7180a8]">No saved cards</p>
          </DetailSection>
          <DetailSection icon={Wrench} title="Jobs" actions={<Button variant="outline" className="rounded-full border-[#3f3df1] text-[#3f3df1] hover:text-[#3f3df1]">Create Job</Button>}>
            <p className="text-sm text-[#7180a8]">No jobs added.</p>
          </DetailSection>
          <DetailSection icon={FileText} title="Invoices" actions={<Button variant="outline" className="rounded-full border-[#3f3df1] text-[#3f3df1] hover:text-[#3f3df1]">Create Invoice</Button>}>
            <p className="text-sm text-[#7180a8]">No invoices added.</p>
          </DetailSection>
          <DetailSection icon={FileText} title="Estimates" actions={<Button variant="outline" className="rounded-full border-[#3f3df1] text-[#3f3df1] hover:text-[#3f3df1]">Create Estimate</Button>}>
            <p className="text-sm text-[#7180a8]">No estimates added.</p>
          </DetailSection>
          <MoreFields draft={client} updateDraft={updateClient} />
          <DetailSection icon={Paperclip} title="Attachments" actions={<Button variant="outline" className="rounded-full border-[#3f3df1] text-[#3f3df1] hover:text-[#3f3df1]">Upload</Button>}>
            <p className="text-sm text-[#7180a8]">No attachments uploaded.</p>
          </DetailSection>
        </div>
      </div>
    </>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-lg border border-border bg-card p-6 shadow-sm", className)}>{children}</section>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-3 block text-sm font-semibold text-foreground">{children}</label>;
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
        <TextField label="First Name" value={draft.firstName ?? ""} placeholder="Enter client's first name" icon={User} onChange={(firstName) => updateDraft({ firstName })} />
        <TextField label="Last Name" value={draft.lastName ?? ""} placeholder="Enter client's last name" icon={User} onChange={(lastName) => updateDraft({ lastName })} />
        <TextField label="Email" value={draft.email ?? ""} placeholder="Enter client's email address" icon={Mail} onChange={(email) => updateDraft({ email })} />
        <TextField label="Phone Number" value={draft.phone ?? ""} placeholder="Enter client's phone number" icon={Phone} onChange={(phone) => updateDraft({ phone })} />
      </div>
      <div className="mt-5">
        <TextField label="Company Name" value={draft.company ?? ""} placeholder="Enter client's company (optional)" icon={Building2} onChange={(company) => updateDraft({ company })} />
      </div>
      <div className="mt-5">
        <FieldLabel>Client SMS Setting</FieldLabel>
        <Select value={draft.smsSetting ?? "receive"} onValueChange={(value) => updateDraft({ smsSetting: value as ClientRecord["smsSetting"] })}>
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
          <span className="text-sm font-medium">Mark client "Do Not Service"</span>
          <Switch checked={Boolean(draft.doNotService)} onCheckedChange={(doNotService) => updateDraft({ doNotService })} />
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
        <TextField label="Street Address" value={draft.streetAddress ?? ""} placeholder="Street Address" icon={MapPin} onChange={(streetAddress) => updateDraft({ streetAddress })} />
        <TextField label="Unit #" value={draft.unit ?? ""} placeholder="Unit #" icon={MapPin} onChange={(unit) => updateDraft({ unit })} />
        <TextField label="City" value={draft.city ?? ""} placeholder="City" icon={Building2} onChange={(city) => updateDraft({ city })} />
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <FieldLabel>State</FieldLabel>
            <Select value={draft.state || undefined} onValueChange={(state) => updateDraft({ state })}>
              <SelectTrigger className="h-12 w-full rounded-lg bg-card">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {["AZ", "CA", "NV", "NM", "UT"].map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TextField label="ZIP" value={draft.zip ?? ""} placeholder="ZIP" icon={MapPin} onChange={(zip) => updateDraft({ zip })} />
        </div>
      </div>
    </Panel>
  );
}

function PrivateNotes({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Panel>
      <SectionTitle icon={FileText}>Private Notes</SectionTitle>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="Enter notes (optional)" className="min-h-[216px] resize-none rounded-lg p-6" />
    </Panel>
  );
}

function MoreFields({ draft, updateDraft }: { draft: Partial<ClientRecord>; updateDraft: (updates: Partial<ClientRecord>) => void }) {
  return (
    <Panel>
      <SectionTitle icon={Tag}>More</SectionTitle>
      <div className="space-y-5">
        <div>
          <FieldLabel>Lead Source</FieldLabel>
          <Select value={draft.leadSource} onValueChange={(leadSource) => updateDraft({ leadSource: leadSource as LeadSource })}>
            <SelectTrigger className="h-12 w-full rounded-lg bg-card">
              <SelectValue placeholder="Select lead source" />
            </SelectTrigger>
            <SelectContent>
              {leadSources.map((source) => (
                <SelectItem key={source} value={source}>
                  {source}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <TextField label="Tags" value={(draft.tags ?? []).join(", ")} placeholder="Enter tags" icon={Tag} onChange={(tags) => updateDraft({ tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) })} />
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

function SectionTitle({ icon: Icon, children, noBorder = false }: { icon: typeof Info; children: React.ReactNode; noBorder?: boolean }) {
  return (
    <div className={cn("mb-5 flex items-center gap-2 text-2xl font-bold", !noBorder && "border-b border-border pb-4")}>
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
        <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-12 rounded-lg pr-11" />
        <Icon className="absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#7180a8]" />
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
          <span className="bg-muted px-4 py-3 text-muted-foreground">Satellite</span>
        </div>
        <div className="text-xs font-semibold text-muted-foreground">Google map preview</div>
      </div>
    </div>
  );
}

function StreetViewPreview({ client }: { client: Partial<ClientRecord> }) {
  return (
    <div className="mb-6 h-[202px] overflow-hidden rounded-lg border border-border bg-[linear-gradient(115deg,#d8e5f5_0%,#9fb7c9_42%,#e0d2bd_43%,#9e8d78_60%,#627b5f_100%)]">
      <div className="flex h-full flex-col justify-between p-4 text-white">
        <div className="w-fit rounded-sm bg-black/50 px-4 py-3 text-sm">
          <div className="font-bold">{client.streetAddress || "13809 Barrydale St"}</div>
          <div className="text-xs opacity-90">{[client.city, client.state].filter(Boolean).join(", ") || "West Puente Valley, California"}</div>
        </div>
        <div className="flex items-end justify-between">
          <span className="font-bold">Google</span>
          <span className="rounded-full bg-black/50 px-5 py-2 text-base">Map View</span>
        </div>
      </div>
    </div>
  );
}
