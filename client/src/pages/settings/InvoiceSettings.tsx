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
import {
  loadSettingsSection,
  saveSettingsSection,
} from "@/lib/settingsStorage";
import {
  DEFAULT_INVOICE_SETTINGS,
  type InvoiceSettingsState,
} from "@/lib/invoiceSettings";

const SECTION = "invoices";

export default function InvoiceSettings() {
  const [settings, setSettings] = useState<InvoiceSettingsState>(() =>
    loadSettingsSection(SECTION, DEFAULT_INVOICE_SETTINGS)
  );

  const update = (patch: Partial<InvoiceSettingsState>) =>
    setSettings(prev => ({ ...prev, ...patch }));

  const save = () => {
    saveSettingsSection(SECTION, {
      ...settings,
      acceptCardPayments: false,
      autoInvoicing: false,
    });
    toast.success("Settings saved");
  };

  return (
    <SettingsShell
      title="Invoice Settings"
      actions={<SettingsSaveButton onClick={save} />}
    >
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
                    onCheckedChange={checked =>
                      update({ showCompanyName: checked })
                    }
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
                    onCheckedChange={checked =>
                      update({ showCompanyAddress: checked })
                    }
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
                    onCheckedChange={checked =>
                      update({ showCompanyLogo: checked })
                    }
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
                    onCheckedChange={checked =>
                      update({ invoiceSignature: checked })
                    }
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
                    onCheckedChange={checked =>
                      update({ estimateSignature: checked })
                    }
                    aria-label="Customer estimate signature"
                  />
                }
              />
              <SettingsToggleRow
                label="Accept Payments via Credit Card / Stripe"
                help="Card collection is unavailable until a Stripe account is connected."
                control={
                  <Switch
                    checked={false}
                    disabled
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
              help="Automatic creation will be available after office and driver job completion are connected to invoices."
              control={
                <Switch checked={false} disabled aria-label="Auto-invoicing" />
              }
            />
          </SettingsCard>
        </div>
      </div>
    </SettingsShell>
  );
}
