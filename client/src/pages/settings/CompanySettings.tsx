import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Building2, Clock, ImagePlus } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
  SettingsField,
} from "@/components/SettingsShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "company";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type Day = (typeof DAYS)[number];

type DayHours = { open: boolean; start: string; end: string };

type CompanySettingsState = {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  logoDataUrl: string;
  timeZone: string;
  businessHours: Record<Day, DayHours>;
};

const TIME_ZONES = [
  { value: "America/Phoenix", label: "Arizona (America/Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (America/Los_Angeles)" },
  { value: "America/Denver", label: "Mountain (America/Denver)" },
  { value: "America/Chicago", label: "Central (America/Chicago)" },
  { value: "America/New_York", label: "Eastern (America/New_York)" },
];

const defaultHours = (): Record<Day, DayHours> =>
  Object.fromEntries(
    DAYS.map((day) => [
      day,
      { open: day !== "Saturday" && day !== "Sunday", start: "08:00", end: "18:00" },
    ])
  ) as Record<Day, DayHours>;

const DEFAULTS: CompanySettingsState = {
  companyName: "Rejunk",
  companyAddress: "",
  companyPhone: "(626) 559-1923",
  companyEmail: "abel.morales196487@gmail.com",
  logoDataUrl: "",
  timeZone: "America/Phoenix",
  businessHours: defaultHours(),
};

export default function CompanySettings() {
  const [settings, setSettings] = useState<CompanySettingsState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );
  const logoInputRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<CompanySettingsState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const updateDay = (day: Day, patch: Partial<DayHours>) =>
    setSettings((prev) => ({
      ...prev,
      businessHours: {
        ...prev.businessHours,
        [day]: { ...prev.businessHours[day], ...patch },
      },
    }));

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  const readLogoFile = (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      toast.error("Please choose a PNG or JPEG image");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") update({ logoDataUrl: reader.result });
    };
    reader.readAsDataURL(file);
  };

  const handleLogoInput = (event: ChangeEvent<HTMLInputElement>) => {
    readLogoFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleLogoDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    readLogoFile(event.dataTransfer.files?.[0]);
  };

  return (
    <SettingsShell title="Company Settings" actions={<SettingsSaveButton onClick={save} />}>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <SettingsCard title="Company Information" icon={Building2}>
            <div className="space-y-5">
              <SettingsField label="Company Name">
                <Input
                  value={settings.companyName}
                  onChange={(event) => update({ companyName: event.target.value })}
                  placeholder="Company name"
                />
              </SettingsField>
              <SettingsField label="Company Address">
                <Input
                  value={settings.companyAddress}
                  onChange={(event) => update({ companyAddress: event.target.value })}
                  placeholder="Street, City, State ZIP"
                />
              </SettingsField>
              <SettingsField label="Company Phone">
                <Input
                  type="tel"
                  value={settings.companyPhone}
                  onChange={(event) => update({ companyPhone: event.target.value })}
                  placeholder="(555) 555-5555"
                />
              </SettingsField>
              <SettingsField label="Company Email">
                <Input
                  type="email"
                  value={settings.companyEmail}
                  onChange={(event) => update({ companyEmail: event.target.value })}
                  placeholder="you@example.com"
                />
              </SettingsField>

              <SettingsField
                label="Company Logo"
                help="Shows on quotes and invoices. PNG or JPEG."
              >
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={handleLogoInput}
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => logoInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      logoInputRef.current?.click();
                    }
                  }}
                  onDrop={handleLogoDrop}
                  onDragOver={(event) => event.preventDefault()}
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-[var(--moss-deep)]/60 hover:bg-[#f0f4ec]"
                >
                  {settings.logoDataUrl ? (
                    <>
                      <img
                        src={settings.logoDataUrl}
                        alt="Company logo preview"
                        className="max-h-24 object-contain"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          update({ logoDataUrl: "" });
                        }}
                      >
                        Remove
                      </Button>
                    </>
                  ) : (
                    <>
                      <ImagePlus className="size-6 text-[var(--moss-deep)]" />
                      <span className="text-sm font-semibold text-foreground">
                        Click to upload or drag a logo here
                      </span>
                      <span className="text-xs text-muted-foreground">PNG or JPEG</span>
                    </>
                  )}
                </div>
              </SettingsField>

              <SettingsField label="Time Zone">
                <Select
                  value={settings.timeZone}
                  onValueChange={(value) => update({ timeZone: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a time zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_ZONES.map((zone) => (
                      <SelectItem key={zone.value} value={zone.value}>
                        {zone.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsField>
            </div>
          </SettingsCard>
        </div>

        <div className="space-y-5">
          <SettingsCard title="Business Hours" icon={Clock}>
            <div className="divide-y divide-border">
              {DAYS.map((day) => {
                const hours = settings.businessHours[day];
                return (
                  <div key={day} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="w-24 text-sm font-semibold text-foreground">{day}</div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={hours.open}
                        onCheckedChange={(checked) => updateDay(day, { open: checked })}
                        aria-label={`${day} open`}
                      />
                      <span className="w-12 text-xs text-muted-foreground">
                        {hours.open ? "Open" : "Closed"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={hours.start}
                        disabled={!hours.open}
                        onChange={(event) => updateDay(day, { start: event.target.value })}
                        className="w-28"
                        aria-label={`${day} opening time`}
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={hours.end}
                        disabled={!hours.open}
                        onChange={(event) => updateDay(day, { end: event.target.value })}
                        className="w-28"
                        aria-label={`${day} closing time`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </SettingsCard>
        </div>
      </div>
    </SettingsShell>
  );
}
