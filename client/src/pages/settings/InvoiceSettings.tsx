import { useState } from "react";
import { FileText, Zap } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
  SettingsToggleRow,
} from "@/components/SettingsShell";
import { Switch } from "@/components/ui/switch";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "invoices";

type InvoiceSettingsState = {
  showCompanyName: boolean;
  showCompanyAddress: boolean;
  showCompanyLogo: boolean;
  invoiceSignature: boolean;
  estimateSignature: boolean;
  acceptCardPayments: boolean;
  autoInvoicing: boolean;
};

const DEFAULTS: InvoiceSettingsState = {
  showCompanyName: true,
  showCompanyAddress: true,
  showCompanyLogo: true,
  invoiceSignature: false,
  estimateSignature: false,
  acceptCardPayments: false,
  autoInvoicing: false,
};

export default function InvoiceSettings() {
  const [settings, setSettings] = useState<InvoiceSettingsState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );

  const update = (patch: Partial<InvoiceSettingsState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  return (
    <SettingsShell title="Invoice Settings" actions={<SettingsSaveButton onClick={save} />}>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <SettingsCard title="Interface" icon={FileText}>
            <div className="divide-y divide-border">
              <SettingsToggleRow
                label="Your Company Name"
                help="Show your company name on invoices and estimates."
                control={
                  <Switch
                    checked={settings.showCompanyName}
                    onCheckedChange={(checked) => update({ showCompanyName: checked })}
                    aria-label="Show company name"
                  />
                }
              />
              <SettingsToggleRow
                label="Your Company Address"
                help="Show your company address on invoices and estimates."
                control={
                  <Switch
                    checked={settings.showCompanyAddress}
                    onCheckedChange={(checked) => update({ showCompanyAddress: checked })}
                    aria-label="Show company address"
                  />
                }
              />
              <SettingsToggleRow
                label="Your Company Logo"
                help="Show your company logo on invoices and estimates."
                control={
                  <Switch
                    checked={settings.showCompanyLogo}
                    onCheckedChange={(checked) => update({ showCompanyLogo: checked })}
                    aria-label="Show company logo"
                  />
                }
              />
              <SettingsToggleRow
                label="Customer Invoice Signature"
                help="Add a signature line for customers on invoices."
                control={
                  <Switch
                    checked={settings.invoiceSignature}
                    onCheckedChange={(checked) => update({ invoiceSignature: checked })}
                    aria-label="Customer invoice signature"
                  />
                }
              />
              <SettingsToggleRow
                label="Customer Estimate Signature"
                help="Add a signature line for customers on estimates."
                control={
                  <Switch
                    checked={settings.estimateSignature}
                    onCheckedChange={(checked) => update({ estimateSignature: checked })}
                    aria-label="Customer estimate signature"
                  />
                }
              />
              <SettingsToggleRow
                label="Accept Payments via Credit Card / Stripe"
                help="This will only show if you have Stripe connected on your Rejunk account"
                control={
                  <Switch
                    checked={settings.acceptCardPayments}
                    onCheckedChange={(checked) => update({ acceptCardPayments: checked })}
                    aria-label="Accept card payments"
                  />
                }
              />
            </div>
          </SettingsCard>
        </div>

        <div className="space-y-5">
          <SettingsCard title="Automation" icon={Zap}>
            <SettingsToggleRow
              label="Auto-invoicing"
              help="Automatically create an invoice when a job is completed (marking a job completed from the mobile app doesn't yet trigger this)"
              control={
                <Switch
                  checked={settings.autoInvoicing}
                  onCheckedChange={(checked) => update({ autoInvoicing: checked })}
                  aria-label="Auto-invoicing"
                />
              }
            />
          </SettingsCard>
        </div>
      </div>
    </SettingsShell>
  );
}
