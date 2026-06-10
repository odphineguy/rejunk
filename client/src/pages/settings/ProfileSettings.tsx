import { useRef, useState, type ChangeEvent } from "react";
import { Copy, ShieldCheck, Upload, UserCog } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
  SettingsField,
} from "@/components/SettingsShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "profile";

type ProfileSettingsState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatarDataUrl: string;
  companyId: string;
};

const DEFAULTS: ProfileSettingsState = {
  firstName: "Abel",
  lastName: "Morales",
  email: "abel.morales196487@gmail.com",
  phone: "(626) 559-1923",
  avatarDataUrl: "",
  companyId: "rejunk-0001",
};

export default function ProfileSettings() {
  const [settings, setSettings] = useState<ProfileSettingsState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<ProfileSettingsState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  const initials =
    `${settings.firstName.trim().charAt(0)}${settings.lastName.trim().charAt(0)}`.toUpperCase();

  const handleAvatarInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") update({ avatarDataUrl: reader.result });
    };
    reader.readAsDataURL(file);
  };

  const copyCompanyId = async () => {
    await navigator.clipboard.writeText(settings.companyId);
    toast.success("Copied");
  };

  return (
    <SettingsShell title="Profile Settings" actions={<SettingsSaveButton onClick={save} />}>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <SettingsCard title="Profile Settings" icon={UserCog}>
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#1f7a4a] to-[#052a2b]">
                  {settings.avatarDataUrl ? (
                    <img
                      src={settings.avatarDataUrl}
                      alt="Profile picture"
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="font-display text-xl font-bold text-white">{initials}</span>
                  )}
                </div>
                <div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={handleAvatarInput}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <Upload className="size-4" />
                    Upload
                  </Button>
                  <p className="mt-1.5 text-xs text-muted-foreground">PNG or JPEG</p>
                </div>
              </div>

              <SettingsField label="First Name">
                <Input
                  value={settings.firstName}
                  onChange={(event) => update({ firstName: event.target.value })}
                />
              </SettingsField>
              <SettingsField label="Last Name">
                <Input
                  value={settings.lastName}
                  onChange={(event) => update({ lastName: event.target.value })}
                />
              </SettingsField>
              <SettingsField label="Email">
                <div className="flex items-center gap-2">
                  <Input
                    type="email"
                    value={settings.email}
                    onChange={(event) => update({ email: event.target.value })}
                  />
                  <Badge className="shrink-0 bg-[#f0f4ec] text-[#155e3f] border border-[#155e3f]/25">
                    Verified
                  </Badge>
                </div>
              </SettingsField>
              <SettingsField label="Phone">
                <Input
                  type="tel"
                  value={settings.phone}
                  onChange={(event) => update({ phone: event.target.value })}
                />
              </SettingsField>
            </div>
          </SettingsCard>
        </div>

        <div className="space-y-5">
          <SettingsCard title="Account Settings" icon={ShieldCheck}>
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">Email</div>
                  <div className="truncate text-sm text-muted-foreground">{settings.email}</div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => toast("Email update coming soon")}
                >
                  Update Email
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Password</div>
                  <div className="text-sm text-muted-foreground">••••••••</div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => toast("Password update coming soon")}
                >
                  Update Password
                </Button>
              </div>

              <SettingsField
                label="Company ID"
                help="Share this with support if you ever need help with your account."
              >
                <div className="flex items-center gap-2">
                  <Input value={settings.companyId} readOnly />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyCompanyId}
                    aria-label="Copy company ID"
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </SettingsField>

              <p className="text-sm text-foreground">
                You are the owner of{" "}
                <span className="text-[#155e3f] underline underline-offset-2">
                  Progressive Transportation Services
                </span>
                .
              </p>

              <div className="border-t border-border pt-5">
                <h3 className="font-display text-base font-bold text-foreground">
                  Delete Account and Unsubscribe
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  If you no longer wish to use Rejunk, you can permanently delete your account.
                </p>
                <Button
                  variant="outline"
                  className="mt-4 border-destructive text-destructive hover:bg-destructive/10"
                  onClick={() => toast.error("Account deletion is disabled in this build")}
                >
                  Delete My Account
                </Button>
              </div>
            </div>
          </SettingsCard>
        </div>
      </div>
    </SettingsShell>
  );
}
