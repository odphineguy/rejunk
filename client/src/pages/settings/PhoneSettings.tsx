import { useState } from "react";
import { Link } from "wouter";
import { ExternalLink, HelpCircle, MessageSquareText, PhoneCall, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
  InfoCallout,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "phone";

type PhoneSettingsState = {
  defaultSmsNumber: string;
  minInboundCallSeconds: number;
};

const DEFAULTS: PhoneSettingsState = {
  defaultSmsNumber: "(626) 559-1923",
  minInboundCallSeconds: 10,
};

const SMS_NUMBER_OPTIONS = ["(626) 559-1923", "No numbers connected"];

export default function PhoneSettings() {
  const [settings, setSettings] = useState<PhoneSettingsState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );

  const update = (patch: Partial<PhoneSettingsState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  return (
    <SettingsShell title="Phone Settings" actions={<SettingsSaveButton onClick={save} />}>
      <div className="grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          <SettingsCard title="Set Your Primary SMS Number" icon={MessageSquareText}>
            <SettingsField label="Default Phone Number to Send SMS From">
              <Select
                value={settings.defaultSmsNumber}
                onValueChange={(value) => update({ defaultSmsNumber: value })}
              >
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SMS_NUMBER_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsField>
          </SettingsCard>

          <SettingsCard title="Call Settings" icon={PhoneCall}>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                Minimum Inbound Call Duration (seconds)
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="size-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Calls shorter than this are not logged as leads.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                type="number"
                min={0}
                className="w-32"
                value={settings.minInboundCallSeconds}
                onChange={(event) =>
                  update({ minInboundCallSeconds: Number(event.target.value) })
                }
                aria-label="Minimum inbound call duration in seconds"
              />
            </div>
          </SettingsCard>

          <SettingsCard title='Clear "Scam Likely" Labeling' icon={ShieldCheck}>
            <p className="text-sm text-muted-foreground leading-6">
              Registering your business phone numbers with the Free Caller Registry helps
              prevent carriers from labeling your outbound calls as &quot;Scam Likely&quot;,
              which improves the chances customers actually answer when you call.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <a
                href="https://www.freecallerregistry.com/fcr/"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-4" />
                Register now
              </a>
            </Button>
          </SettingsCard>
        </div>

        <InfoCallout>
          Additional phone settings are specified on a number by number basis.
          <Button asChild variant="outline" className="mt-3 w-full">
            <Link href="/settings/phone-numbers">View Phone Numbers</Link>
          </Button>
        </InfoCallout>
      </div>
    </SettingsShell>
  );
}
