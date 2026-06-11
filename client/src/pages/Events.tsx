import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useRoute } from "wouter";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarDays,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  MapPin,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { deleteEvent, eventAddress, getEvent, getEvents, saveEvent } from "@/lib/eventStorage";
import { cn } from "@/lib/utils";
import type { EventRecord } from "@/types/events";

const stateOptions = ["AZ", "CA", "NV", "NM", "UT"];

function defaultEvent(): Partial<EventRecord> {
  return {
    private: true,
    title: "",
    notes: "",
    startDate: formatInputDate(new Date()),
    startTime: "21:00",
    endTime: "22:00",
    streetAddress: "",
    unit: "",
    city: "",
    state: "",
    zip: "",
  };
}

function formatInputDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDisplayDate(value?: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

function formatTime(value?: string) {
  if (!value) return "";
  const [hourRaw, minute = "00"] = value.split(":");
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour.toString().padStart(2, "0")}:${minute} ${suffix}`;
}

export default function Events() {
  const [, params] = useRoute("/events/:eventId");
  const [isNewRoute] = useRoute("/events/new");

  if (isNewRoute) return <EventEditor mode="new" />;
  if (params?.eventId) return <EventEditor eventId={params.eventId} />;
  return <EventsList />;
}

function EventsHeader({ crumb, actions }: { crumb?: string; actions?: ReactNode }) {
  return (
    <div className="border-b border-border bg-background px-4 py-5 md:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-[10px] border border-border bg-card text-[var(--moss-deep)] shadow-sm">
            <CalendarDays className="size-[18px]" />
          </span>
          <Link
            href="/events"
            className="font-display text-xl font-bold tracking-tight text-foreground hover:text-[#155e3f]"
          >
            Events
          </Link>
          {crumb && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium text-foreground">{crumb}</span>
            </>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

function EventsList() {
  const [events, setEvents] = useState<EventRecord[]>(() => getEvents());
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState("10");
  const [, navigate] = useLocation();

  useEffect(() => {
    const refresh = () => setEvents(getEvents());
    window.addEventListener("events-updated", refresh);
    return () => window.removeEventListener("events-updated", refresh);
  }, []);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return events.filter((event) => {
      const searchable = [event.title, eventAddress(event), event.startDate, event.startTime, event.endTime].filter(Boolean).join(" ").toLowerCase();
      return !normalizedQuery || searchable.includes(normalizedQuery);
    });
  }, [events, query]);

  const removeEvent = (event: React.MouseEvent, eventId: string) => {
    event.stopPropagation();
    setEvents(deleteEvent(eventId));
    toast.success("Event deleted");
  };

  return (
    <>
      <EventsHeader
        actions={
          <Button asChild className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]">
            <Link href="/events/new">
              <Plus className="size-4" />
              Create Event
            </Link>
          </Button>
        }
      />
      <div className="px-4 py-8 md:px-8">
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-[400px]">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." className="h-12 rounded-lg pl-10 pr-10" />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8a9180]" aria-label="Clear event search">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Select value={pageSize} onValueChange={setPageSize}>
                <SelectTrigger className="h-10 w-20 rounded-lg bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["10", "25", "50"].map((size) => (
                    <SelectItem key={size} value={size}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="size-10 rounded-lg">
                <MoreHorizontal className="size-4" />
              </Button>
            </div>
          </div>

          <div className="mt-6">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="h-14 px-5">Title</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => navigate(`/events/${item.id}`)}>
                    <TableCell className="px-5 font-medium">{item.title}</TableCell>
                    <TableCell>{eventAddress(item)}</TableCell>
                    <TableCell>{`${formatDisplayDate(item.startDate)} ${formatTime(item.startTime)}`}</TableCell>
                    <TableCell>{`${formatDisplayDate(item.startDate)} ${formatTime(item.endTime)}`}</TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <Button variant="ghost" size="icon" asChild aria-label={`Open ${item.title}`}>
                        <Link href={`/events/${item.id}`}>
                          <MoreHorizontal className="size-4 text-[#8a9180]" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={(event) => removeEvent(event, item.id)} aria-label={`Delete ${item.title}`}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredEvents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-14 text-center text-sm text-muted-foreground">
                      No events found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="mt-5 flex flex-col gap-3 rounded-lg border border-border bg-card p-5 text-sm md:flex-row md:items-center md:justify-between">
          <span>{filteredEvents.length ? `Showing 1-${filteredEvents.length} of ${filteredEvents.length} results` : "No results."}</span>
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

function EventEditor({ mode, eventId }: { mode?: "new"; eventId?: string }) {
  const [, navigate] = useLocation();
  const [event, setEvent] = useState<Partial<EventRecord>>(() => (mode === "new" ? defaultEvent() : getEvent(eventId ?? "") ?? {}));
  const isNew = mode === "new";
  const isMissing = !isNew && !event.id;

  if (isMissing) {
    return (
      <>
        <EventsHeader crumb="Details" />
        <div className="px-4 py-8 md:px-8">Event not found.</div>
      </>
    );
  }

  const updateEvent = (updates: Partial<EventRecord>) => setEvent((current) => ({ ...current, ...updates }));

  const persistEvent = () => {
    const saved = saveEvent({
      ...event,
      title: event.title?.trim() || "New Event",
    });
    setEvent(saved);
    toast.success(isNew ? "Event created" : "Event saved");
    navigate(`/events/${saved.id}`);
  };

  const removeEvent = () => {
    if (!event.id) return;
    deleteEvent(event.id);
    toast.success("Event deleted");
    navigate("/events");
  };

  return (
    <>
      <EventsHeader
        crumb={isNew ? "New Event" : event.title || "Event Details"}
        actions={
          <>
            <Button onClick={persistEvent} className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]">
              {isNew ? <Plus className="size-4" /> : <Save className="size-4" />}
              {isNew ? "Create Event" : "Save"}
            </Button>
            {!isNew && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="size-10 rounded-lg">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" onClick={removeEvent}>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
      <div className="grid gap-5 px-4 py-8 xl:grid-cols-[1fr_1fr] md:px-8">
        <div className="space-y-5">
          <Panel>
            <SectionTitle icon={Info}>Event Info</SectionTitle>
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">Private</span>
                <Switch checked={event.private ?? true} onCheckedChange={(isPrivate) => updateEvent({ private: isPrivate })} />
                <span className="text-sm text-[#8a9180]">Only shown to you</span>
              </div>
              <TextField label="Title" value={event.title ?? ""} placeholder="Enter event title" onChange={(title) => updateEvent({ title })} />
              <div>
                <FieldLabel>Notes</FieldLabel>
                <Textarea value={event.notes ?? ""} onChange={(input) => updateEvent({ notes: input.target.value })} placeholder="Add any notes about this event" className="min-h-24 resize-none rounded-lg p-6" />
              </div>
            </div>
          </Panel>

          <Panel>
            <SectionTitle icon={CalendarIcon}>Schedule</SectionTitle>
            <div className="space-y-4">
              <div className="grid items-center gap-3 md:grid-cols-[52px_1fr]">
                <FieldLabel className="mb-0">Date</FieldLabel>
                <IconInput type="date" value={event.startDate ?? ""} icon={CalendarIcon} onChange={(startDate) => updateEvent({ startDate })} />
              </div>
              <div className="grid items-center gap-3 md:grid-cols-[52px_1fr]">
                <FieldLabel className="mb-0">Time</FieldLabel>
                <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
                  <IconInput type="time" value={event.startTime ?? ""} icon={Clock} onChange={(startTime) => updateEvent({ startTime })} />
                  <span className="text-center font-semibold">→</span>
                  <IconInput type="time" value={event.endTime ?? ""} icon={Clock} onChange={(endTime) => updateEvent({ endTime })} />
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <Panel>
          <SectionTitle icon={MapPin}>Event Address</SectionTitle>
          <div className="space-y-5">
            <div>
              <FieldLabel>Address</FieldLabel>
              <MapPreview />
            </div>
            <TextField label="Street Address" value={event.streetAddress ?? ""} placeholder="Street Address" icon={MapPin} onChange={(streetAddress) => updateEvent({ streetAddress })} />
            <TextField label="Unit #" value={event.unit ?? ""} placeholder="Unit #" icon={MapPin} onChange={(unit) => updateEvent({ unit })} />
            <TextField label="City" value={event.city ?? ""} placeholder="City" icon={Building2} onChange={(city) => updateEvent({ city })} />
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <FieldLabel>State</FieldLabel>
                <Select value={event.state || undefined} onValueChange={(state) => updateEvent({ state })}>
                  <SelectTrigger className="h-12 w-full rounded-lg bg-card">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {stateOptions.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <TextField label="ZIP" value={event.zip ?? ""} placeholder="ZIP" icon={MapPin} onChange={(zip) => updateEvent({ zip })} />
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-lg border border-border bg-card p-6 shadow-sm", className)}>{children}</section>;
}

function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="mb-7 flex items-center gap-2 border-b border-border pb-5 text-2xl font-bold">
      <Icon className="size-5" />
      <h2 className="text-2xl font-bold">{children}</h2>
    </div>
  );
}

function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <label className={cn("mb-3 block text-sm font-semibold text-foreground", className)}>{children}</label>;
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
  icon?: LucideIcon;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={cn("h-12 rounded-lg", Icon && "pr-11")} />
        {Icon && <Icon className="absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#8a9180]" />}
      </div>
    </div>
  );
}

function IconInput({
  type,
  value,
  icon: Icon,
  onChange,
}: {
  type: "date" | "time";
  value: string;
  icon: LucideIcon;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-12 rounded-lg pr-11" />
      <Icon className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
    </div>
  );
}

function MapPreview() {
  return (
    <div className="h-[202px] overflow-hidden rounded-lg border border-border bg-[#edf3f7]">
      <div className="relative h-full">
        <div className="absolute inset-0 bg-[linear-gradient(28deg,transparent_0_41%,#cbd8e7_42%,#cbd8e7_44%,transparent_45%),linear-gradient(145deg,transparent_0_35%,#d7e0eb_36%,#d7e0eb_38%,transparent_39%),linear-gradient(86deg,transparent_0_56%,#cbd8e7_57%,#cbd8e7_60%,transparent_61%)]" />
        <div className="absolute left-3 top-3 flex overflow-hidden rounded-md bg-card shadow-sm">
          <span className="bg-card px-5 py-3 font-bold">Map</span>
          <span className="bg-muted px-5 py-3 text-muted-foreground">Satellite</span>
        </div>
        <div className="absolute bottom-2 left-3 font-bold text-[#155e3f]">Google</div>
        <div className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-md bg-card shadow-sm">
          <Plus className="size-5 rotate-45" />
        </div>
        <div className="absolute right-3 top-16 flex size-10 items-center justify-center rounded-full bg-card shadow-sm">
          <UserRound className="size-5 text-amber-500" />
        </div>
      </div>
    </div>
  );
}
