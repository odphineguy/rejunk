import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
  InfoCallout,
  SettingsField,
  SettingsToggleRow,
} from "@/components/SettingsShell";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getPricebook } from "@/lib/pricebookStorage";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "online-booking";

const LEAD_TIMES = ["1 hour", "2 hours", "4 hours", "Next day"] as const;

type OnlineBookingState = {
  enabled: boolean;
  requirePayment: boolean;
  allowSameDay: boolean;
  leadTime: string;
  /** null means "all services enabled" (categories load dynamically). */
  enabledServiceIds: string[] | null;
};

const DEFAULTS: OnlineBookingState = {
  enabled: true,
  requirePayment: false,
  allowSameDay: true,
  leadTime: "2 hours",
  enabledServiceIds: null,
};

export default function OnlineBooking() {
  const [settings, setSettings] = useState<OnlineBookingState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );
  const [categories] = useState(() => getPricebook().categories);

  const update = (patch: Partial<OnlineBookingState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  const isServiceEnabled = (categoryId: string) =>
    settings.enabledServiceIds === null || settings.enabledServiceIds.includes(categoryId);

  const toggleService = (categoryId: string, checked: boolean) => {
    setSettings((prev) => {
      const current =
        prev.enabledServiceIds === null
          ? categories.map((category) => category.id)
          : prev.enabledServiceIds;
      const next = checked
        ? Array.from(new Set([...current, categoryId]))
        : current.filter((id) => id !== categoryId);
      return { ...prev, enabledServiceIds: next };
    });
  };

  return (
    <SettingsShell title="Online Booking" actions={<SettingsSaveButton onClick={save} />}>
      <div className="mx-auto max-w-3xl space-y-5">
        <SettingsCard title="Booking Configuration" icon={CalendarCheck}>
          <div className="divide-y divide-border">
            <SettingsToggleRow
              label="Enable Online Booking"
              help="Let customers book jobs from your booking page."
              control={
                <Switch
                  checked={settings.enabled}
                  onCheckedChange={(checked) => update({ enabled: checked })}
                  aria-label="Enable online booking"
                />
              }
            />
            <SettingsToggleRow
              label="Require Payment on Booking"
              help="Collect a payment method before the booking is confirmed."
              control={
                <Switch
                  checked={settings.requirePayment}
                  onCheckedChange={(checked) => update({ requirePayment: checked })}
                  aria-label="Require payment on booking"
                />
              }
            />
            <SettingsToggleRow
              label="Allow Same-Day Booking"
              help="Customers can grab open slots on today's schedule."
              control={
                <Switch
                  checked={settings.allowSameDay}
                  onCheckedChange={(checked) => update({ allowSameDay: checked })}
                  aria-label="Allow same-day booking"
                />
              }
            />
          </div>

          <div className="mt-5 space-y-5">
            <SettingsField
              label="Booking Lead Time"
              help="Minimum notice you need before a booked job can start."
            >
              <Select
                value={settings.leadTime}
                onValueChange={(value) => update({ leadTime: value })}
              >
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Select lead time" />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_TIMES.map((leadTime) => (
                    <SelectItem key={leadTime} value={leadTime}>
                      {leadTime}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsField>

            <SettingsField
              label="Available Services"
              help="Choose which Pricebook categories customers can book online."
            >
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Pricebook categories found. Add categories on the Pricebook page first.
                </p>
              ) : (
                <div className="space-y-2.5 rounded-lg border border-border p-4">
                  {categories.map((category) => (
                    <label
                      key={category.id}
                      className="flex cursor-pointer items-center gap-3 text-sm text-foreground"
                    >
                      <Checkbox
                        checked={isServiceEnabled(category.id)}
                        onCheckedChange={(checked) =>
                          toggleService(category.id, checked === true)
                        }
                        aria-label={`Offer ${category.name} online`}
                      />
                      {category.name}
                    </label>
                  ))}
                </div>
              )}
            </SettingsField>

            <InfoCallout>
              The customer-facing booking page isn't live yet — these settings will apply as
              soon as it launches.
            </InfoCallout>
          </div>
        </SettingsCard>
      </div>
    </SettingsShell>
  );
}
