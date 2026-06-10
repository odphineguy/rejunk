import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
  InfoCallout,
  SettingsField,
  SettingsToggleRow,
} from "@/components/SettingsShell";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "calendar";

type CalendarSettingsState = {
  calendarColor: string;
  hideCanceledJobs: boolean;
};

const DEFAULTS: CalendarSettingsState = {
  calendarColor: "Color by Job Status",
  hideCanceledJobs: false,
};

const COLOR_OPTIONS = [
  "Color by Job Status",
  "Color by Job Type",
  "Color by Employee",
  "Single Color",
];

export default function CalendarSettings() {
  const [settings, setSettings] = useState<CalendarSettingsState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );

  const update = (patch: Partial<CalendarSettingsState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  return (
    <SettingsShell title="Calendar Settings" actions={<SettingsSaveButton onClick={save} />}>
      <SettingsCard title="Interface" icon={CalendarDays} className="max-w-2xl">
        <div className="space-y-5">
          <SettingsField label="Calendar Color">
            <Select
              value={settings.calendarColor}
              onValueChange={(value) => update({ calendarColor: value })}
            >
              <SelectTrigger className="w-full rounded-lg bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLOR_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsField>

          <InfoCallout>
            Each job on the calendar will be colored according to its status (e.g., pending,
            completed, in progress).
          </InfoCallout>

          <SettingsToggleRow
            label="Hide Canceled Jobs"
            help="Canceled jobs will not appear on the calendar."
            control={
              <Switch
                checked={settings.hideCanceledJobs}
                onCheckedChange={(checked) => update({ hideCanceledJobs: checked })}
                aria-label="Hide canceled jobs"
              />
            }
          />
        </div>
      </SettingsCard>
    </SettingsShell>
  );
}
