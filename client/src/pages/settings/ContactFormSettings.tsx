import { useState } from "react";
import { Code, Inbox, Link as LinkIcon, UsersRound } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
  SettingsField,
} from "@/components/SettingsShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";

const SECTION = "contact-form";

const CONTACT_FORM_URL = "https://rejunk.vercel.app/contact";
const EMBED_CODE = `<iframe src="${CONTACT_FORM_URL}" width="100%" height="640" frameborder="0"></iframe>`;

type SubmitAs = "client" | "lead";

type FieldKey = "firstName" | "lastName" | "phone" | "email" | "address" | "message";

type FieldState = { active: boolean; required: boolean };

type ContactFormSettingsState = {
  submitAs: SubmitAs;
  replyToEmail: string;
  fields: Record<FieldKey, FieldState>;
};

const DEFAULTS: ContactFormSettingsState = {
  submitAs: "lead",
  replyToEmail: "",
  fields: {
    firstName: { active: true, required: true },
    lastName: { active: true, required: false },
    phone: { active: true, required: false },
    email: { active: true, required: false },
    address: { active: true, required: false },
    message: { active: true, required: true },
  },
};

const FIELD_ROWS: Array<{ key: FieldKey; label: string; locked: boolean }> = [
  { key: "firstName", label: "First Name", locked: true },
  { key: "lastName", label: "Last Name", locked: false },
  { key: "phone", label: "Phone Number", locked: false },
  { key: "email", label: "Email", locked: false },
  { key: "address", label: "Address", locked: false },
  { key: "message", label: "Message", locked: true },
];

export default function ContactFormSettings() {
  const [settings, setSettings] = useState<ContactFormSettingsState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );

  const update = (patch: Partial<ContactFormSettingsState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const updateField = (key: FieldKey, patch: Partial<FieldState>) =>
    setSettings((prev) => ({
      ...prev,
      fields: { ...prev.fields, [key]: { ...prev.fields[key], ...patch } },
    }));

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(CONTACT_FORM_URL);
    toast.success("Link copied");
  };

  const copyEmbedCode = () => {
    navigator.clipboard.writeText(EMBED_CODE);
    toast.success("Embed code copied");
  };

  return (
    <SettingsShell
      title="Contact Form Settings"
      actions={
        <>
          <Button variant="outline" onClick={copyLink}>
            <LinkIcon className="size-4" />
            Copy Link
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Code className="size-4" />
                Get Embed Code
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Embed Code</DialogTitle>
                <DialogDescription>
                  Paste this snippet into your website to embed the contact form.
                </DialogDescription>
              </DialogHeader>
              <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{EMBED_CODE}</pre>
              <Button
                onClick={copyEmbedCode}
                className="bg-[var(--moss-deep)] text-white hover:bg-[#1a7a4f]"
              >
                Copy Code
              </Button>
            </DialogContent>
          </Dialog>
          <SettingsSaveButton onClick={save} />
        </>
      }
    >
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <SettingsCard title="Submission Settings" icon={Inbox}>
            <div className="space-y-6">
              <SettingsField label="Submit As">
                <Select
                  value={settings.submitAs}
                  onValueChange={(value) => update({ submitAs: value as SubmitAs })}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                  </SelectContent>
                </Select>
              </SettingsField>

              <SettingsField
                label="Default 'Reply To' Email"
                help="Replies to contact-form notifications go to this address."
              >
                <Input
                  type="email"
                  value={settings.replyToEmail}
                  onChange={(event) => update({ replyToEmail: event.target.value })}
                  placeholder="you@rejunk.com"
                />
              </SettingsField>
            </div>
          </SettingsCard>
        </div>

        <div className="space-y-5">
          <SettingsCard title="Customer Details" icon={UsersRound}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Required</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {FIELD_ROWS.map((row) => {
                  const field = settings.fields[row.key];
                  return (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">
                        {row.label}
                        {row.locked && (
                          <span className="ml-1.5 text-xs text-muted-foreground">(required)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.locked ? true : field.active}
                          disabled={row.locked}
                          onCheckedChange={(checked) => updateField(row.key, { active: checked })}
                          aria-label={`${row.label} active`}
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.locked ? true : field.required}
                          disabled={row.locked}
                          onCheckedChange={(checked) =>
                            updateField(row.key, { required: checked })
                          }
                          aria-label={`${row.label} required`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </SettingsCard>
        </div>
      </div>
    </SettingsShell>
  );
}
