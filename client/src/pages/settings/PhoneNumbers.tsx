import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
} from "@/components/SettingsShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "phone-numbers";

const FORWARDING_BEHAVIORS = ["Forward to device", "Ring in app", "Voicemail"] as const;

type PhoneNumberRow = {
  id: string;
  name: string;
  number: string;
  forwardingBehavior: string;
  forwardTo: string;
  callRecording: boolean;
  status: "Active" | "Inactive";
};

type PhoneNumbersState = {
  numbers: PhoneNumberRow[];
};

const DEFAULTS: PhoneNumbersState = {
  numbers: [
    {
      id: "main-line",
      name: "Main Line",
      number: "(626) 559-1923",
      forwardingBehavior: "Forward to device",
      forwardTo: "(626) 559-1923",
      callRecording: false,
      status: "Active",
    },
  ],
};

type NumberDraft = {
  name: string;
  number: string;
  forwardingBehavior: string;
  forwardTo: string;
  callRecording: boolean;
};

const EMPTY_DRAFT: NumberDraft = {
  name: "",
  number: "",
  forwardingBehavior: "Forward to device",
  forwardTo: "",
  callRecording: false,
};

function newRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Date.now().toString();
}

export default function PhoneNumbers() {
  const [settings, setSettings] = useState<PhoneNumbersState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState("10");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<NumberDraft>(EMPTY_DRAFT);

  const update = (patch: Partial<PhoneNumbersState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  const filteredNumbers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return settings.numbers;
    return settings.numbers.filter((row) =>
      `${row.name} ${row.number}`.toLowerCase().includes(normalizedQuery)
    );
  }, [settings.numbers, query]);

  const size = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredNumbers.length / size));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * size;
  const pagedNumbers = filteredNumbers.slice(pageStart, pageStart + size);

  useEffect(() => {
    setPage(1);
  }, [query, pageSize]);

  const toggleCallRecording = (id: string, callRecording: boolean) => {
    update({
      numbers: settings.numbers.map((row) =>
        row.id === id ? { ...row, callRecording } : row
      ),
    });
  };

  const openAddDialog = () => {
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  };

  const saveDraft = () => {
    const name = draft.name.trim();
    const number = draft.number.trim();
    if (!name || !number) {
      toast.error("Enter a number name and a number");
      return;
    }
    update({
      numbers: [
        ...settings.numbers,
        {
          id: newRowId(),
          name,
          number,
          forwardingBehavior: draft.forwardingBehavior,
          forwardTo: draft.forwardTo.trim(),
          callRecording: draft.callRecording,
          status: "Active",
        },
      ],
    });
    setDialogOpen(false);
  };

  return (
    <SettingsShell
      title="Phone Numbers"
      actions={
        <>
          <Button
            onClick={openAddDialog}
            className="bg-[var(--moss-deep)] text-white hover:bg-[#1a7a4f]"
          >
            <Plus className="size-4" />
            New Phone Number
          </Button>
          <SettingsSaveButton onClick={save} />
        </>
      }
    >
      <div className="space-y-5">
        <SettingsCard>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-[400px]">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search..."
                className="h-12 rounded-lg pl-10 pr-10"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8a9180]"
                  aria-label="Clear phone number search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
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
          </div>

          <div className="mt-6">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="h-14 px-5">Number Name</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Forwarding Behavior</TableHead>
                  <TableHead>Forward Calls To</TableHead>
                  <TableHead>Call Recording</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedNumbers.map((row, index) => (
                  <TableRow key={row.id} className={index % 2 === 1 ? "bg-muted/20" : undefined}>
                    <TableCell className="px-5 font-medium">{row.name}</TableCell>
                    <TableCell>{row.number}</TableCell>
                    <TableCell>{row.forwardingBehavior}</TableCell>
                    <TableCell>{row.forwardTo}</TableCell>
                    <TableCell>
                      <Switch
                        checked={row.callRecording}
                        onCheckedChange={(checked) => toggleCallRecording(row.id, checked)}
                        aria-label={`Toggle call recording for ${row.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          row.status === "Active"
                            ? "bg-[#f0f4ec] text-[#155e3f] border border-[#155e3f]/25"
                            : undefined
                        }
                        variant={row.status === "Active" ? undefined : "secondary"}
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredNumbers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                      No phone numbers found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </SettingsCard>

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 text-sm md:grid md:grid-cols-[1fr_auto_1fr] md:items-center">
          <span>
            {filteredNumbers.length
              ? `Showing ${pageStart + 1}-${pageStart + pagedNumbers.length} of ${filteredNumbers.length} results`
              : "No results."}
          </span>
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" className="size-10 rounded-lg" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Button>
            <span>Page {currentPage} of {totalPages}</span>
            <Button variant="outline" size="icon" className="size-10 rounded-lg" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <span className="hidden md:block" />
        </section>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Phone Number</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone-number-name">Number Name</Label>
              <Input
                id="phone-number-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="e.g. Main Line"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone-number-number">Number</Label>
              <Input
                id="phone-number-number"
                value={draft.number}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, number: event.target.value }))
                }
                placeholder="(602) 555-0123"
              />
            </div>
            <div className="space-y-2">
              <Label>Forwarding Behavior</Label>
              <Select
                value={draft.forwardingBehavior}
                onValueChange={(value) =>
                  setDraft((prev) => ({ ...prev, forwardingBehavior: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORWARDING_BEHAVIORS.map((behavior) => (
                    <SelectItem key={behavior} value={behavior}>
                      {behavior}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone-number-forward-to">Forward Calls To</Label>
              <Input
                id="phone-number-forward-to"
                value={draft.forwardTo}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, forwardTo: event.target.value }))
                }
                placeholder="(602) 555-0123"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="phone-number-recording">Call Recording</Label>
              <Switch
                id="phone-number-recording"
                checked={draft.callRecording}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({ ...prev, callRecording: checked }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveDraft}
              className="bg-[var(--moss-deep)] text-white hover:bg-[#1a7a4f]"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsShell>
  );
}
