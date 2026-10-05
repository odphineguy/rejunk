import { useEffect, useState } from "react";
import { FileText, Zap } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
  SettingsToggleRow,
} from "@/components/SettingsShell";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  loadSettingsSection,
  saveSettingsSectionConfirmed,
} from "@/lib/settingsStorage";
import {
  DEFAULT_INVOICE_SETTINGS,
  type InvoiceSettingsState,
} from "@/lib/invoiceSettings";

import { getStoredStaffSession } from "@/lib/staffSession";

const SECTION = "invoices";

export default function InvoiceSettings() {
  const [settings, setSettings] = useState<InvoiceSettingsState>(() =>
    loadSettingsSection(SECTION, DEFAULT_INVOICE_SETTINGS)
  );

  const update = (patch: Partial<InvoiceSettingsState>) =>
    setSettings(prev => ({ ...prev, ...patch }));

  const [payment, setPayment] = useState<{
    ready: boolean;
    livemode?: boolean;
    collectingBusiness?: string;
    error?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "status",
        token: getStoredStaffSession()?.token,
      }),
    })
      .then(async response => {
        const data = await response.json();
        if (active)
          setPayment(response.ok ? data : { ready: false, error: data.error });
      })
      .catch(() => {
        if (active)
          setPayment({
            ready: false,
            error: "Could not check card payment setup. Reload to retry.",
          });
      });
    return () => {
      active = false;
    };
  }, []);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveSettingsSectionConfirmed(SECTION, {
        ...settings,
        autoInvoicing: false,
      });
      toast.success("Settings saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Settings could not be saved."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsShell
      title="Invoice Settings"
      actions={<SettingsSaveButton onClick={() => void save()} />}
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
                help="Use the logo saved in Company Settings on invoice PDFs."
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
                help={
                  !payment
                    ? "Checking card payment setup…"
                    : payment.ready
                      ? payment.livemode
                        ? `Card payments are collected by ${payment.collectingBusiness} for Progressive.`
                        : `Sandbox ready through ${payment.collectingBusiness}. Test cards only; no real money is collected.`
                      : payment.error || "Card payments are not configured."
                }
                control={
                  <Switch
                    checked={settings.acceptCardPayments}
                    disabled={!payment?.ready || saving}
                    onCheckedChange={checked =>
                      update({ acceptCardPayments: checked })
                    }
                    aria-label="Accept card payments"
                  />
                }
              />
            </div>
          </SettingsCard>
        </div>

        <div className="space-y-5">
          <SettingsCard title="PDF wording" icon={FileText}>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="invoice-payment">Payment instructions</Label>
                <Textarea
                  id="invoice-payment"
                  rows={3}
                  value={settings.paymentInstructions}
                  onChange={event =>
                    update({ paymentInstructions: event.target.value })
                  }
                  placeholder="Add accepted payment methods and how to pay."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice-terms">Service terms</Label>
                <Textarea
                  id="invoice-terms"
                  rows={7}
                  value={settings.invoiceTerms}
                  onChange={event =>
                    update({ invoiceTerms: event.target.value })
                  }
                  placeholder="Add your approved invoice terms."
                />
                <p className="text-sm text-muted-foreground">
                  Appears in downloaded PDFs. Agree liability limits and
                  coverage with the customer before service; an invoice does not
                  replace a signed service agreement.
                </p>
              </div>
            </div>
          </SettingsCard>
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
