import { useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
  SettingsField,
} from "@/components/SettingsShell";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "email-templates";

type TabKey = "invitation" | "invoice" | "estimate" | "receipt" | "booking";

type EmailTemplate = {
  header: string;
  message: string;
};

type EmailTemplatesState = {
  templates: Record<TabKey, EmailTemplate>;
};

const TAB_META: Record<TabKey, { label: string; title: string; cta: string }> = {
  invitation: { label: "Employee Invitation", title: "Employee Invitation", cta: "Accept Invitation" },
  invoice: { label: "Invoice", title: "Invoice", cta: "View Invoice" },
  estimate: { label: "Estimate", title: "Estimate", cta: "View Estimate" },
  receipt: { label: "Receipt", title: "Receipt", cta: "View Receipt" },
  booking: { label: "Booking Confirmation", title: "Booking Confirmation", cta: "Confirm Booking" },
};

const TAB_KEYS: TabKey[] = ["invitation", "invoice", "estimate", "receipt", "booking"];

const VARIABLE_OPTIONS = ["{{CUSTOMER_NAME}}", "{{COMPANY_NAME}}", "{{COMPANY_PHONE_NUMBER}}"];

const PREVIEW_VALUES: Record<string, string> = {
  "{{CUSTOMER_NAME}}": "John Doe",
  "{{COMPANY_NAME}}": "Progressive Transportation Services",
  "{{COMPANY_PHONE_NUMBER}}": "(626) 559-1923",
};

const DEFAULTS: EmailTemplatesState = {
  templates: {
    invitation: {
      header: "You're invited to join {{COMPANY_NAME}}",
      message:
        "Hi,\n\nYou've been invited to join the {{COMPANY_NAME}} team on Rejunk. Accept the invitation below to set up your account and start receiving job assignments.\n\nQuestions? Call us at {{COMPANY_PHONE_NUMBER}}.\n\nWelcome aboard!",
    },
    invoice: {
      header: "Invoice from {{COMPANY_NAME}}",
      message:
        "Hi {{CUSTOMER_NAME}},\n\nYour invoice from {{COMPANY_NAME}} is ready. Please review it and submit payment at your earliest convenience.\n\nQuestions? Call us at {{COMPANY_PHONE_NUMBER}}.\n\nThank you for your business!",
    },
    estimate: {
      header: "Your estimate from {{COMPANY_NAME}}",
      message:
        "Hi {{CUSTOMER_NAME}},\n\nYour estimate from {{COMPANY_NAME}} is ready for review. Take a look at the details and approve it when you're ready — we'll take care of the rest.\n\nQuestions? Call us at {{COMPANY_PHONE_NUMBER}}.\n\nWe look forward to working with you!",
    },
    receipt: {
      header: "Receipt from {{COMPANY_NAME}}",
      message:
        "Hi {{CUSTOMER_NAME}},\n\nThank you for your payment! Your receipt from {{COMPANY_NAME}} is attached for your records.\n\nQuestions? Call us at {{COMPANY_PHONE_NUMBER}}.\n\nWe appreciate your business!",
    },
    booking: {
      header: "Confirm your booking with {{COMPANY_NAME}}",
      message:
        "Hi {{CUSTOMER_NAME}},\n\nThanks for booking with {{COMPANY_NAME}}! Please confirm your appointment below so we can lock in your spot on the schedule.\n\nNeed to make a change? Call us at {{COMPANY_PHONE_NUMBER}}.\n\nSee you soon!",
    },
  },
};

function renderPreview(text: string) {
  return Object.entries(PREVIEW_VALUES).reduce(
    (result, [token, value]) => result.split(token).join(value),
    text
  );
}

export default function EmailTemplates() {
  const [settings, setSettings] = useState<EmailTemplatesState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );
  const [activeTab, setActiveTab] = useState<TabKey>("invitation");

  const template = settings.templates[activeTab];

  const updateTemplate = (patch: Partial<EmailTemplate>) =>
    setSettings((prev) => ({
      ...prev,
      templates: {
        ...prev.templates,
        [activeTab]: { ...prev.templates[activeTab], ...patch },
      },
    }));

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  const insertVariable = (token: string) => {
    const separator =
      template.message.length === 0 || template.message.endsWith(" ") ? "" : " ";
    updateTemplate({ message: `${template.message}${separator}${token}` });
  };

  return (
    <SettingsShell title="Email Templates" actions={<SettingsSaveButton onClick={save} />}>
      <SettingsCard>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)}>
          <TabsList className="mb-6 flex h-auto w-full flex-wrap justify-start">
            {TAB_KEYS.map((key) => (
              <TabsTrigger key={key} value={key}>
                {TAB_META[key].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <SettingsField label="Header">
              <Input
                value={template.header}
                onChange={(event) => updateTemplate({ header: event.target.value })}
                className="rounded-lg"
              />
            </SettingsField>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-semibold text-foreground">Message</div>
                <Select value="" onValueChange={insertVariable}>
                  <SelectTrigger className="h-9 w-56 rounded-lg bg-card text-sm">
                    <SelectValue placeholder="Add a variable" />
                  </SelectTrigger>
                  <SelectContent>
                    {VARIABLE_OPTIONS.map((token) => (
                      <SelectItem key={token} value={token}>
                        {token}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                value={template.message}
                onChange={(event) => updateTemplate({ message: event.target.value })}
                className="min-h-[180px] rounded-lg"
                aria-label={`${TAB_META[activeTab].label} message`}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <div className="bg-[var(--moss-deep)] px-6 py-4">
              <div className="font-display font-bold text-white">
                {renderPreview(template.header)}
              </div>
            </div>
            <div className="space-y-4 bg-white p-6">
              <div className="font-display text-lg font-bold text-foreground">
                {TAB_META[activeTab].title}
              </div>
              <div className="whitespace-pre-line text-sm leading-6 text-foreground">
                {renderPreview(template.message)}
              </div>
              <div className="inline-block rounded-lg bg-[var(--moss-deep)] px-5 py-2.5 text-sm font-bold text-white">
                {TAB_META[activeTab].cta}
              </div>
              <div className="border-t border-border pt-4 text-xs text-muted-foreground">
                or copy and paste this URL into your browser: https://rejunk.vercel.app
              </div>
            </div>
          </div>
        </div>
      </SettingsCard>
    </SettingsShell>
  );
}
