import { useState } from "react";
import { BellRing, ExternalLink, MessageSquareText, Star } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
  InfoCallout,
  SettingsField,
  SettingsToggleRow,
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
import { Switch } from "@/components/ui/switch";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "reviews";

type MinimumStars = "3" | "4" | "5";

type ReviewSettingsState = {
  minimumStars: MinimumStars;
  reviewLink: string;
  generatedUrl: string;
  preReviewText: string;
  postPositiveReviewText: string;
  postNegativeReviewText: string;
  emailNotifications: boolean;
  smsNotifications: boolean;
};

const DEFAULTS: ReviewSettingsState = {
  minimumStars: "4",
  reviewLink: "",
  generatedUrl: "",
  preReviewText: "How was your experience with us?",
  postPositiveReviewText: "Thank you! Would you mind sharing your experience publicly?",
  postNegativeReviewText:
    "We're sorry we missed the mark. Tell us what happened so we can make it right.",
  emailNotifications: true,
  smsNotifications: false,
};

const STAR_OPTIONS: Array<{ value: MinimumStars; label: string }> = [
  { value: "3", label: "3 Stars" },
  { value: "4", label: "4 Stars" },
  { value: "5", label: "5 Stars" },
];

export default function ReviewSettings() {
  const [settings, setSettings] = useState<ReviewSettingsState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );

  const update = (patch: Partial<ReviewSettingsState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  const viewDemo = () => {
    toast.info("Demo opens after your review link is generated");
  };

  return (
    <SettingsShell
      title="Review Settings"
      actions={
        <>
          <Button variant="outline" onClick={viewDemo}>
            <ExternalLink className="size-4" />
            View Live Demo
          </Button>
          <SettingsSaveButton onClick={save} />
        </>
      }
    >
      <InfoCallout className="mb-5">
        <p className="font-bold">Set up your review funnel</p>
        <p>
          Send customers one review link. Happy customers (at or above your star threshold) are
          routed straight to your public review page; unhappy ones are routed to a private
          feedback form so you hear about problems first.
        </p>
      </InfoCallout>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <SettingsCard title="Review Funnel" icon={Star}>
            <div className="space-y-6">
              <SettingsField label="Minimum Stars for Review Link">
                <Select
                  value={settings.minimumStars}
                  onValueChange={(value) => update({ minimumStars: value as MinimumStars })}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAR_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsField>

              <SettingsField label="Review Link">
                <div className="flex gap-2">
                  <Input
                    value={settings.reviewLink}
                    onChange={(event) => update({ reviewLink: event.target.value })}
                    placeholder="https://g.page/r/your-business/review"
                  />
                  <Button
                    size="sm"
                    onClick={save}
                    className="bg-[var(--moss-deep)] text-white hover:bg-[#1a7a4f]"
                  >
                    Save
                  </Button>
                </div>
              </SettingsField>

              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground">Your Review URL</div>
                {settings.generatedUrl ? (
                  <p className="text-sm text-foreground">{settings.generatedUrl}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Not generated yet</p>
                )}
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title="Negative Review Notifications" icon={BellRing}>
            <SettingsToggleRow
              label="Email Notifications"
              help="Get an email whenever a customer leaves a below-threshold rating."
              control={
                <Switch
                  checked={settings.emailNotifications}
                  onCheckedChange={(checked) => update({ emailNotifications: checked })}
                  aria-label="Email notifications"
                />
              }
            />
            <SettingsToggleRow
              label="SMS Notifications"
              help="Get a text whenever a customer leaves a below-threshold rating. (Requires A2P messaging approval)"
              control={
                <Switch
                  checked={settings.smsNotifications}
                  onCheckedChange={(checked) => update({ smsNotifications: checked })}
                  aria-label="SMS notifications"
                />
              }
            />
            <InfoCallout>
              This sends from your primary SMS number. So do not enter your primary SMS number as
              the recipient.
            </InfoCallout>
          </SettingsCard>
        </div>

        <div className="space-y-5">
          <SettingsCard title="Review Messages" icon={MessageSquareText}>
            <div className="space-y-6">
              <SettingsField label="Pre-Review Text">
                <Input
                  value={settings.preReviewText}
                  onChange={(event) => update({ preReviewText: event.target.value })}
                />
              </SettingsField>
              <SettingsField label="Post Positive Review Text">
                <Input
                  value={settings.postPositiveReviewText}
                  onChange={(event) => update({ postPositiveReviewText: event.target.value })}
                />
              </SettingsField>
              <SettingsField label="Post Negative Review Text">
                <Input
                  value={settings.postNegativeReviewText}
                  onChange={(event) => update({ postNegativeReviewText: event.target.value })}
                />
              </SettingsField>
            </div>
          </SettingsCard>
        </div>
      </div>
    </SettingsShell>
  );
}
