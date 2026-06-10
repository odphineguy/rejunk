import { useState } from "react";
import { HandCoins, HelpCircle } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
  InfoCallout,
  SettingsToggleRow,
} from "@/components/SettingsShell";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "tips";

type DefaultTip = "none" | "10" | "15" | "20";

type TipSettingsState = {
  tipOptions: [number, number, number];
  defaultTip: DefaultTip;
  allowTips: boolean;
};

const DEFAULTS: TipSettingsState = {
  tipOptions: [10, 15, 20],
  defaultTip: "none",
  allowTips: true,
};

const DEFAULT_TIP_OPTIONS: Array<{ value: DefaultTip; label: string }> = [
  { value: "none", label: "None" },
  { value: "10", label: "10%" },
  { value: "15", label: "15%" },
  { value: "20", label: "20%" },
];

function HelpTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="size-3.5 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

export default function TipSettings() {
  const [settings, setSettings] = useState<TipSettingsState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );

  const update = (patch: Partial<TipSettingsState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const updateTipOption = (index: number, value: number) => {
    setSettings((prev) => {
      const tipOptions = [...prev.tipOptions] as [number, number, number];
      tipOptions[index] = value;
      return { ...prev, tipOptions };
    });
  };

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  return (
    <SettingsShell title="Tip Settings" actions={<SettingsSaveButton onClick={save} />}>
      <SettingsCard title="Tips" icon={HandCoins} className="max-w-3xl">
        <div className="space-y-6">
          <InfoCallout>
            These tip settings control the tip fields shown on the invoice link sent to
            customers and the tip screen when accepting payments through the mobile app.
          </InfoCallout>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              Tip Options (%)
              <HelpTip text="Customers pick from these three preset percentages." />
            </div>
            <div className="flex gap-3">
              {settings.tipOptions.map((option, index) => (
                <Input
                  key={index}
                  type="number"
                  min={0}
                  className="w-24"
                  value={option}
                  onChange={(event) => updateTipOption(index, Number(event.target.value))}
                  aria-label={`Tip option ${index + 1} percent`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              Default Tip (%)
              <HelpTip text="Pre-selected tip when the payment screen opens." />
            </div>
            <Select
              value={settings.defaultTip}
              onValueChange={(value) => update({ defaultTip: value as DefaultTip })}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_TIP_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <SettingsToggleRow
            label="Allow clients to leave a tip"
            help="Clients can leave a tip when paying for a job or invoice"
            control={
              <Switch
                checked={settings.allowTips}
                onCheckedChange={(checked) => update({ allowTips: checked })}
                aria-label="Allow clients to leave a tip"
              />
            }
          />
        </div>
      </SettingsCard>
    </SettingsShell>
  );
}
