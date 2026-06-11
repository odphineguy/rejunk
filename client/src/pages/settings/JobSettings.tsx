import { useState } from "react";
import { CalendarClock, Megaphone, Pencil, Search, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
  InfoCallout,
  SettingsField,
} from "@/components/SettingsShell";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "jobs";

type LeadCategory = "Paid" | "Organic" | "Unknown";

type LeadSource = {
  id: string;
  name: string;
  category: LeadCategory;
};

type JobType = {
  id: string;
  name: string;
};

type JobSettingsState = {
  defaultJobDuration: string;
  arrivalWindow: string;
  leadSources: LeadSource[];
  jobTypes: JobType[];
};

const makeId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : String(Date.now());

const seedLeadSources: Array<[string, LeadCategory]> = [
  ["Thumbtack", "Paid"],
  ["Google Local Services", "Paid"],
  ["Google Maps", "Organic"],
  ["Referral", "Organic"],
  ["Repeat", "Organic"],
  ["Online Booking", "Organic"],
  ["Craigslist", "Paid"],
  ["Facebook Ads", "Paid"],
  ["Google Ads", "Paid"],
  ["Bing Ads", "Paid"],
  ["Angies", "Paid"],
  ["Door Hangers", "Paid"],
  ["EDDM", "Paid"],
  ["Unknown", "Unknown"],
  ["Website", "Organic"],
  ["Yard Signs", "Paid"],
  ["Yelp Ads", "Paid"],
];

const seedJobTypes = [
  "Cleanout",
  "Delivery / Pickup",
  "Demolition",
  "Junk Removal",
  "Junk Removal & Demolition",
  "Moving / Labor Only",
  "Odd Jobs",
  "Assembly",
  "Handyman",
  "Appliance",
];

const DEFAULTS: JobSettingsState = {
  defaultJobDuration: "1 hour",
  arrivalWindow: "2 hours",
  leadSources: seedLeadSources.map(([name, category], index) => ({
    id: `lead-${index}`,
    name,
    category,
  })),
  jobTypes: seedJobTypes.map((name, index) => ({ id: `type-${index}`, name })),
};

const DURATION_OPTIONS = ["30 minutes", "1 hour", "2 hours", "3 hours", "4 hours"];
const ARRIVAL_OPTIONS = ["Exact time", "1 hour", "2 hours", "4 hours"];

function categoryBadgeClass(category: LeadCategory) {
  if (category === "Paid") return "bg-[#edebde] text-foreground border-border";
  if (category === "Organic") return "bg-[#f0f4ec] text-[#155e3f] border-[#155e3f]/25";
  return "bg-muted text-muted-foreground border-border";
}

export default function JobSettings() {
  const [settings, setSettings] = useState<JobSettingsState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadCategory, setNewLeadCategory] = useState<LeadCategory>("Paid");
  const [leadQuery, setLeadQuery] = useState("");
  const [newJobType, setNewJobType] = useState("");
  const [jobTypeQuery, setJobTypeQuery] = useState("");

  const update = (patch: Partial<JobSettingsState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  const addLeadSource = () => {
    const name = newLeadName.trim();
    if (!name) return;
    update({
      leadSources: [
        ...settings.leadSources,
        { id: makeId(), name, category: newLeadCategory },
      ],
    });
    setNewLeadName("");
  };

  const editLeadSource = (source: LeadSource) => {
    setNewLeadName(source.name);
    setNewLeadCategory(source.category);
    update({ leadSources: settings.leadSources.filter((item) => item.id !== source.id) });
  };

  const deleteLeadSource = (id: string) => {
    update({ leadSources: settings.leadSources.filter((item) => item.id !== id) });
  };

  const addJobType = () => {
    const name = newJobType.trim();
    if (!name) return;
    update({ jobTypes: [...settings.jobTypes, { id: makeId(), name }] });
    setNewJobType("");
  };

  const deleteJobType = (id: string) => {
    update({ jobTypes: settings.jobTypes.filter((item) => item.id !== id) });
  };

  const visibleLeadSources = settings.leadSources.filter((source) =>
    source.name.toLowerCase().includes(leadQuery.trim().toLowerCase())
  );

  const visibleJobTypes = settings.jobTypes.filter((type) =>
    type.name.toLowerCase().includes(jobTypeQuery.trim().toLowerCase())
  );

  return (
    <SettingsShell title="Job Settings" actions={<SettingsSaveButton onClick={save} />}>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <SettingsCard title="Availability" icon={CalendarClock}>
            <div className="space-y-5">
              <SettingsField label="Default Job Duration">
                <Select
                  value={settings.defaultJobDuration}
                  onValueChange={(value) => update({ defaultJobDuration: value })}
                >
                  <SelectTrigger className="w-full rounded-lg bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsField>

              <SettingsField label="Arrival Window">
                <Select
                  value={settings.arrivalWindow}
                  onValueChange={(value) => update({ arrivalWindow: value })}
                >
                  <SelectTrigger className="w-full rounded-lg bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ARRIVAL_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsField>

              <InfoCallout>
                The arrival window is shown to customers in SMS notifications — e.g. "between
                9:00 AM and 11:00 AM" instead of an exact time.
              </InfoCallout>
            </div>
          </SettingsCard>

          <SettingsCard title="Lead Sources" icon={Megaphone}>
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newLeadName}
                  onChange={(event) => setNewLeadName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addLeadSource();
                  }}
                  placeholder="New lead source"
                  className="rounded-lg"
                />
                <Select
                  value={newLeadCategory}
                  onValueChange={(value) => setNewLeadCategory(value as LeadCategory)}
                >
                  <SelectTrigger className="w-full rounded-lg bg-card sm:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Organic">Organic</SelectItem>
                    <SelectItem value="Unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={addLeadSource}
                  className="rounded-lg bg-[var(--moss-deep)] text-white hover:bg-[#1a7a4f]"
                >
                  Add
                </Button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={leadQuery}
                  onChange={(event) => setLeadQuery(event.target.value)}
                  placeholder="Search lead sources..."
                  className="rounded-lg pl-9"
                />
              </div>

              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleLeadSources.map((source) => (
                    <TableRow key={source.id}>
                      <TableCell className="font-medium">{source.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={categoryBadgeClass(source.category)}>
                          {source.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => editLeadSource(source)}
                          aria-label={`Edit ${source.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteLeadSource(source.id)}
                          aria-label={`Delete ${source.name}`}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {visibleLeadSources.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                        No lead sources found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </SettingsCard>
        </div>

        <div className="space-y-5">
          <SettingsCard title="Job Types" icon={Wrench}>
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newJobType}
                  onChange={(event) => setNewJobType(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addJobType();
                  }}
                  placeholder="New job type"
                  className="rounded-lg"
                />
                <Button
                  onClick={addJobType}
                  className="rounded-lg bg-[var(--moss-deep)] text-white hover:bg-[#1a7a4f]"
                >
                  Add
                </Button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={jobTypeQuery}
                  onChange={(event) => setJobTypeQuery(event.target.value)}
                  placeholder="Search job types..."
                  className="rounded-lg pl-9"
                />
              </div>

              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleJobTypes.map((type) => (
                    <TableRow key={type.id}>
                      <TableCell className="font-medium">{type.name}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteJobType(type.id)}
                          aria-label={`Delete ${type.name}`}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {visibleJobTypes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="py-6 text-center text-muted-foreground">
                        No job types found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </SettingsCard>
        </div>
      </div>
    </SettingsShell>
  );
}
