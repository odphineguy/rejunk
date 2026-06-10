import { useState } from "react";
import { Pencil, Percent, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsShell,
  SettingsSaveButton,
  SettingsCard,
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

const SECTION = "tax-rates";

type TaxRate = {
  id: string;
  name: string;
  rate: number;
  enabled: boolean;
  isDefault?: boolean;
};

type TaxRatesState = {
  taxRates: TaxRate[];
};

const DEFAULTS: TaxRatesState = {
  taxRates: [
    { id: "non-taxable", name: "Non-Taxable", rate: 0, enabled: true, isDefault: true },
  ],
};

type RateDraft = {
  id: string | null;
  name: string;
  rate: string;
  enabled: boolean;
};

const EMPTY_DRAFT: RateDraft = { id: null, name: "", rate: "0", enabled: true };

function newRateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Date.now().toString();
}

export default function TaxRates() {
  const [settings, setSettings] = useState<TaxRatesState>(() =>
    loadSettingsSection(SECTION, DEFAULTS)
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<RateDraft>(EMPTY_DRAFT);

  const update = (patch: Partial<TaxRatesState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const save = () => {
    saveSettingsSection(SECTION, settings);
    toast.success("Settings saved");
  };

  const openAddDialog = () => {
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  };

  const openEditDialog = (rate: TaxRate) => {
    setDraft({ id: rate.id, name: rate.name, rate: String(rate.rate), enabled: rate.enabled });
    setDialogOpen(true);
  };

  const toggleRate = (id: string, enabled: boolean) => {
    update({
      taxRates: settings.taxRates.map((rate) =>
        rate.id === id ? { ...rate, enabled } : rate
      ),
    });
  };

  const deleteRate = (id: string) => {
    update({ taxRates: settings.taxRates.filter((rate) => rate.id !== id) });
    toast.success("Tax rate removed");
  };

  const saveDraft = () => {
    const name = draft.name.trim();
    if (!name) {
      toast.error("Enter a name for the tax rate");
      return;
    }
    const rate = Number(draft.rate) || 0;
    if (draft.id) {
      update({
        taxRates: settings.taxRates.map((existing) =>
          existing.id === draft.id
            ? { ...existing, name, rate, enabled: draft.enabled }
            : existing
        ),
      });
    } else {
      update({
        taxRates: [
          ...settings.taxRates,
          { id: newRateId(), name, rate, enabled: draft.enabled },
        ],
      });
    }
    setDialogOpen(false);
  };

  return (
    <SettingsShell title="Tax Rates" actions={<SettingsSaveButton onClick={save} />}>
      <SettingsCard
        title="Tax Rates"
        icon={Percent}
        action={
          <Button
            onClick={openAddDialog}
            className="bg-[var(--moss-deep)] text-white hover:bg-[#1a7a4f]"
          >
            <Plus className="size-4" />
            Add Tax Rate
          </Button>
        }
      >
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="h-12 px-5">Name</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {settings.taxRates.map((rate, index) => (
              <TableRow key={rate.id} className={index % 2 === 1 ? "bg-muted/20" : undefined}>
                <TableCell className="px-5 font-medium">
                  <span className="flex items-center gap-2">
                    {rate.name}
                    {rate.isDefault && (
                      <Badge className="bg-[#f0f4ec] text-[#155e3f] border border-[#155e3f]/25">
                        Default
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>{rate.rate.toFixed(3)}</TableCell>
                <TableCell>
                  <Switch
                    checked={rate.enabled}
                    onCheckedChange={(checked) => toggleRate(rate.id, checked)}
                    aria-label={`Toggle ${rate.name}`}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(rate)}
                    aria-label={`Edit ${rate.name}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  {!rate.isDefault && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteRate(rate.id)}
                      aria-label={`Delete ${rate.name}`}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {settings.taxRates.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                  No tax rates yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </SettingsCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit Tax Rate" : "Add Tax Rate"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tax-rate-name">Name</Label>
              <Input
                id="tax-rate-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="e.g. Phoenix City Tax"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax-rate-rate">Rate</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="tax-rate-rate"
                  type="number"
                  step={0.001}
                  min={0}
                  value={draft.rate}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, rate: event.target.value }))
                  }
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="tax-rate-enabled">{draft.enabled ? "ON" : "OFF"}</Label>
              <Switch
                id="tax-rate-enabled"
                checked={draft.enabled}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({ ...prev, enabled: checked }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveDraft}
              className="bg-[var(--moss-deep)] text-white hover:bg-[#1a7a4f]"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsShell>
  );
}
