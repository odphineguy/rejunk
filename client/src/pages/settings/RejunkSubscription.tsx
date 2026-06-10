import { useState } from "react";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
} from "@/components/SettingsShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "subscription";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

type SubscriptionStatus = "Free Trial" | "Active" | "Expired";

type RejunkSubscriptionState = {
  status: SubscriptionStatus;
  plan: string;
  monthlyPrice: number;
  nextBillingDate: string | null;
};

const DEFAULTS: RejunkSubscriptionState = {
  status: "Free Trial",
  plan: "No Plan",
  monthlyPrice: 0,
  nextBillingDate: null,
};

export default function RejunkSubscription() {
  const [settings] = useState<RejunkSubscriptionState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  const startSubscription = () => {
    toast.info("Subscription billing is not wired up yet");
  };

  const cancelSubscription = () => {
    toast.info("Subscription billing is not wired up yet");
  };

  return (
    <SettingsShell title="Rejunk Subscription" actions={<SettingsSaveButton onClick={save} />}>
      <SettingsCard title="Subscription" icon={CreditCard} className="max-w-2xl">
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm font-semibold text-foreground">Subscription Status</span>
            <Badge className="bg-[#f0f4ec] text-[#155e3f] border border-[#155e3f]/25">
              {settings.status}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm font-semibold text-foreground">Current Plan</span>
            <span className="text-sm text-foreground">{settings.plan}</span>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm font-semibold text-foreground">Monthly Price</span>
            <span className="text-sm text-foreground">{money.format(settings.monthlyPrice)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm font-semibold text-foreground">Next Billing Date</span>
            <span className="text-sm text-foreground">{settings.nextBillingDate ?? "N/A"}</span>
          </div>
        </div>

        <Separator className="my-5" />

        <h3 className="font-display text-base font-bold text-foreground">Manage Subscription</h3>
        <div className="mt-4 flex gap-3">
          <Button
            onClick={startSubscription}
            className="bg-[var(--moss-deep)] text-white hover:bg-[#1a7a4f]"
          >
            Start Real Subscription
          </Button>
          <Button
            variant="outline"
            onClick={cancelSubscription}
            className="border-destructive text-destructive hover:bg-destructive/10"
          >
            Cancel Subscription
          </Button>
        </div>
      </SettingsCard>
    </SettingsShell>
  );
}
