import { useState } from "react";
import { BadgePercent, Building2 } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
  SettingsField,
} from "@/components/SettingsShell";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "affiliate";

type AffiliateCompany = {
  id: string;
  name: string;
  subscriptionStatus: string;
};

type AffiliateSettingsState = {
  code: string;
  codeLocked: boolean;
  companies: AffiliateCompany[];
};

const DEFAULTS: AffiliateSettingsState = {
  code: "",
  codeLocked: false,
  companies: [],
};

export default function AffiliateSettings() {
  const [settings, setSettings] = useState<AffiliateSettingsState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );

  const update = (patch: Partial<AffiliateSettingsState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const save = () => {
    const next = {
      ...settings,
      codeLocked: settings.codeLocked || settings.code.trim().length > 0,
    };
    setSettings(next);
    saveSettingsSection(SECTION, next);
    toast.success("Settings saved");
  };

  return (
    <SettingsShell title="Affiliate Settings" actions={<SettingsSaveButton onClick={save} />}>
      <div className="max-w-3xl space-y-5">
        <SettingsCard title="Code" icon={BadgePercent}>
          <SettingsField
            label="Affiliate Code"
            help="Pick a code that will be easy to remember and type! Once you save this code, it will not be editable."
          >
            <Input
              value={settings.code}
              onChange={(event) => update({ code: event.target.value })}
              disabled={settings.codeLocked}
              placeholder="e.g. REJUNK-PHX"
            />
          </SettingsField>
        </SettingsCard>

        <SettingsCard title="Affiliated Companies" icon={Building2}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company Name</TableHead>
                <TableHead>Subscription Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.companies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                    No affiliate companies found
                  </TableCell>
                </TableRow>
              ) : (
                settings.companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell className="font-medium">{company.name}</TableCell>
                    <TableCell>{company.subscriptionStatus}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </SettingsCard>
      </div>
    </SettingsShell>
  );
}
