import { useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/SettingsShell";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "sms";

type TemplateKey = "jobScheduled" | "jobReminder" | "onMyWay" | "jobComplete";

type SmsTemplate = {
  enabled: boolean;
  message: string;
};

type SmsSettingsState = {
  templates: Record<TemplateKey, SmsTemplate>;
};

const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  jobScheduled: "Job Scheduled",
  jobReminder: "Job Reminder",
  onMyWay: "On My Way",
  jobComplete: "Job Complete",
};

const TEMPLATE_KEYS: TemplateKey[] = [
  "jobScheduled",
  "jobReminder",
  "onMyWay",
  "jobComplete",
];

const VARIABLE_OPTIONS: Array<{ label: string; token: string }> = [
  { label: "Customer name", token: "{{CUSTOMER_NAME}}" },
  { label: "Job date", token: "{{JOB_DATE}}" },
  { label: "Arrival window", token: "{{ARRIVAL_WINDOW}}" },
  { label: "Company name", token: "{{COMPANY_NAME}}" },
  { label: "Company phone", token: "{{COMPANY_PHONE}}" },
];

const DEFAULTS: SmsSettingsState = {
  templates: {
    jobScheduled: {
      enabled: true,
      message:
        "Hi {{CUSTOMER_NAME}}, your job with {{COMPANY_NAME}} is scheduled for {{JOB_DATE}}. We'll arrive {{ARRIVAL_WINDOW}}. Questions? Call us at {{COMPANY_PHONE}}.",
    },
    jobReminder: {
      enabled: true,
      message:
        "Reminder from {{COMPANY_NAME}}: your job is tomorrow, {{JOB_DATE}}, arriving {{ARRIVAL_WINDOW}}. Reply or call {{COMPANY_PHONE}} if anything changed.",
    },
    onMyWay: {
      enabled: true,
      message:
        "{{COMPANY_NAME}} is on the way! Our crew will arrive {{ARRIVAL_WINDOW}}. See you soon, {{CUSTOMER_NAME}}!",
    },
    jobComplete: {
      enabled: true,
      message:
        "Thanks {{CUSTOMER_NAME}}! Your job with {{COMPANY_NAME}} is complete. We appreciate your business — call {{COMPANY_PHONE}} anytime.",
    },
  },
};

export default function SmsNotifications() {
  const [settings, setSettings] = useState<SmsSettingsState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );

  const updateTemplate = (key: TemplateKey, patch: Partial<SmsTemplate>) =>
    setSettings((prev) => ({
      ...prev,
      templates: {
        ...prev.templates,
        [key]: { ...prev.templates[key], ...patch },
      },
    }));

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  const insertVariable = (key: TemplateKey, token: string) => {
    const current = settings.templates[key].message;
    const separator = current.length === 0 || current.endsWith(" ") ? "" : " ";
    updateTemplate(key, { message: `${current}${separator}${token}` });
  };

  return (
    <SettingsShell title="SMS Notifications" actions={<SettingsSaveButton onClick={save} />}>
      <SettingsCard title="Notification Templates" icon={Bell}>
        <div className="divide-y divide-border">
          {TEMPLATE_KEYS.map((key) => {
            const template = settings.templates[key];
            return (
              <div key={key} className="space-y-3 py-5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="font-display text-base font-bold text-foreground">
                    {TEMPLATE_LABELS[key]}
                  </div>
                  <Switch
                    checked={template.enabled}
                    onCheckedChange={(checked) => updateTemplate(key, { enabled: checked })}
                    aria-label={`Toggle ${TEMPLATE_LABELS[key]} notification`}
                  />
                </div>
                <div className="flex justify-end">
                  <Select
                    value=""
                    onValueChange={(token) => insertVariable(key, token)}
                  >
                    <SelectTrigger className="h-9 w-48 rounded-lg bg-card text-sm">
                      <SelectValue placeholder="Add a variable" />
                    </SelectTrigger>
                    <SelectContent>
                      {VARIABLE_OPTIONS.map((option) => (
                        <SelectItem key={option.token} value={option.token}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={template.message}
                  onChange={(event) => updateTemplate(key, { message: event.target.value })}
                  className="min-h-[90px] rounded-lg"
                  aria-label={`${TEMPLATE_LABELS[key]} message`}
                />
              </div>
            );
          })}
        </div>
      </SettingsCard>
    </SettingsShell>
  );
}
