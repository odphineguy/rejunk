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
import { BOOKING_DEPOSIT, BOOKING_REFUND_HOURS, BOOKING_SERVICES } from "@shared/bookingCatalog";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "online-booking";

const LEAD_TIMES = ["1 hour", "2 hours", "4 hours", "Next day"] as const;

/** Read by /api/book (server/booking/handler.ts) — keep the field names in sync. */
type OnlineBookingState = {
  enabled: boolean;
  allowSameDay: boolean;
  leadTime: string;
  /** Booking catalog ids (shared/bookingCatalog.ts); null = every service. */
  bookableServiceIds: string[] | null;
};

const DEFAULTS: OnlineBookingState = {
  enabled: true,
  allowSameDay: true,
  leadTime: "2 hours",
  bookableServiceIds: null,
};

export default function OnlineBooking() {
  const [settings, setSettings] = useState<OnlineBookingState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );

  const update = (patch: Partial<OnlineBookingState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  const isServiceEnabled = (serviceId: string) =>
    !settings.bookableServiceIds || settings.bookableServiceIds.includes(serviceId);

  const toggleService = (serviceId: string, checked: boolean) => {
    setSettings((prev) => {
      const current = prev.bookableServiceIds ?? BOOKING_SERVICES.map((service) => service.id);
      const next = checked
        ? Array.from(new Set([...current, serviceId]))
        : current.filter((id) => id !== serviceId);
      return { ...prev, bookableServiceIds: next };
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
              help="Choose which services customers can book on the website's booking page."
            >
              <div className="space-y-2.5 rounded-lg border border-border p-4">
                {BOOKING_SERVICES.map((service) => (
                  <label
                    key={service.id}
                    className="flex cursor-pointer items-center gap-3 text-sm text-foreground"
                  >
                    <Checkbox
                      checked={isServiceEnabled(service.id)}
                      onCheckedChange={(checked) => toggleService(service.id, checked === true)}
                      aria-label={`Offer ${service.name} online`}
                    />
                    {service.name}
                  </label>
                ))}
              </div>
            </SettingsField>

            <InfoCallout>
              The booking page is at /book. Arrival windows are 8–10am and 12–2pm, and open times
              count Rejunk jobs and Housecall Pro appointments. Customers are told a ${BOOKING_DEPOSIT}{" "}
              deposit holds the spot (refundable {BOOKING_REFUND_HOURS}+ hours ahead) — no card is taken
              online yet, so collect it and use Record payment received on the booking's invoice.
            </InfoCallout>
          </div>
        </SettingsCard>
      </div>
    </SettingsShell>
  );
}
