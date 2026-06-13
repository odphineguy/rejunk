import { useEffect, useRef, useState, type ChangeEvent } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStaffSession } from "@/hooks/useStaffSession";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";
import { postStaff } from "@/lib/staffApi";
import { patchStoredStaffSession } from "@/lib/staffSession";

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
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  avatarDataUrl: "",
  companyId: "rejunk-0001",
};

export default function ProfileSettings() {
  const { session } = useStaffSession();
  const [settings, setSettings] = useState<ProfileSettingsState>(() => {
    const stored = loadSettingsSection(SECTION, DEFAULTS);
    // Seed name/email from the real signed-in account the first time (before
    // anything's been saved), so this page shows YOU — not sample data.
    if (!stored.firstName && !stored.lastName && session) {
      const [first, ...rest] = (session.fullName ?? "").trim().split(/\s+/);
      return {
        ...stored,
        firstName: first ?? "",
        lastName: rest.join(" "),
        email: session.email ?? "",
      };
    }
    return stored;
  });
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Account email always reflects the real login (source of truth: the server).
  const accountEmail = session?.email ?? settings.email;

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);

  const update = (patch: Partial<ProfileSettingsState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  const initials =
    `${settings.firstName.trim().charAt(0)}${settings.lastName.trim().charAt(0)}`.toUpperCase() ||
    (session?.fullName?.trim().charAt(0) ?? "").toUpperCase();

  const companyName =
    loadSettingsSection<{ companyName?: string }>("company", {}).companyName ||
    "Rejunk";

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
                  <div className="truncate text-sm text-muted-foreground">{accountEmail}</div>
                </div>
                <Button variant="outline" onClick={() => setEmailDialogOpen(true)}>
                  Update Email
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">PIN</div>
                  <div className="text-sm text-muted-foreground">••••</div>
                </div>
                <Button variant="outline" onClick={() => setPinDialogOpen(true)}>
                  Change PIN
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
                You are signed in to{" "}
                <span className="font-semibold text-[#155e3f]">{companyName}</span>
                {session?.role ? ` as ${session.role === "owner" ? "an Owner" : "Office Staff"}` : ""}.
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

      <UpdateEmailDialog
        open={emailDialogOpen}
        currentEmail={accountEmail}
        token={session?.token}
        onOpenChange={setEmailDialogOpen}
      />
      <ChangePinDialog
        open={pinDialogOpen}
        token={session?.token}
        onOpenChange={setPinDialogOpen}
      />
    </SettingsShell>
  );
}

function UpdateEmailDialog({
  open,
  currentEmail,
  token,
  onOpenChange,
}: {
  open: boolean;
  currentEmail: string;
  token?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setNewEmail("");
  }, [open]);

  const submit = async () => {
    if (!token) {
      toast.error("Your session expired. Sign in again.");
      return;
    }
    setBusy(true);
    const res = await postStaff<{ email?: string }>("update-email", { token, newEmail });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't update your email.");
      return;
    }
    patchStoredStaffSession({ email: res.data.email ?? newEmail });
    toast.success("Email updated");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This is the email you sign in with. Current: <strong>{currentEmail}</strong>
          </p>
          <div className="space-y-2">
            <Label htmlFor="new-email">New email</Label>
            <Input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || !newEmail.trim()}
            className="bg-[var(--moss-deep)] text-white hover:bg-[#1a7a4f]"
          >
            {busy ? "Saving…" : "Update Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangePinDialog({
  open,
  token,
  onOpenChange,
}: {
  open: boolean;
  token?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    }
  }, [open]);

  const submit = async () => {
    if (!token) {
      toast.error("Your session expired. Sign in again.");
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      toast.error("Your new PIN must be exactly 4 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      toast.error("The new PINs don't match.");
      return;
    }
    setBusy(true);
    const res = await postStaff("update-pin", { token, currentPin, newPin });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't change your PIN.");
      return;
    }
    toast.success("PIN changed");
    onOpenChange(false);
  };

  const pinInput = (
    value: string,
    setter: (v: string) => void,
    id: string,
    label: string
  ) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        maxLength={4}
        value={value}
        onChange={(event) => setter(event.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="••••"
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change PIN</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {pinInput(currentPin, setCurrentPin, "current-pin", "Current PIN")}
          {pinInput(newPin, setNewPin, "new-pin", "New PIN")}
          {pinInput(confirmPin, setConfirmPin, "confirm-pin", "Confirm new PIN")}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy}
            className="bg-[var(--moss-deep)] text-white hover:bg-[#1a7a4f]"
          >
            {busy ? "Saving…" : "Change PIN"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
