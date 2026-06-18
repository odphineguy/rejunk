import { useState } from "react";
import { Calculator, Camera } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  InfoCallout,
  SettingsField,
} from "@/components/SettingsShell";
import {
  loadPricingSettings,
  savePricingSettings,
} from "@/utils/pricingStorage";
import { loadVisionSettings, saveVisionSettings } from "@/lib/visionStorage";
import { defaultPricingSettings } from "@/data/defaultPricing";
import { defaultVisionSettings } from "@/data/defaultVisionSettings";
import type { PricingSettings } from "@/types/pricing";
import type { VisionSettings } from "@/types/vision";

/**
 * Estimate Settings — owns the business-level operating-cost defaults that the
 * Estimate Builder reads at mount. These change rarely, so they live here
 * instead of being re-entered on every estimate. Persists into
 * PricingSettings.defaults via the existing pricingStorage path (localStorage +
 * Supabase), which fires `pricing-settings-updated` so any open builder reloads.
 */

// The form keeps every value as a string so inputs can be cleared while editing.
// Target margin is shown as a whole-number percentage (70) but stored as a
// decimal (0.7).
type DefaultsForm = {
  hourlyLaborCost: string;
  fuelPricePerGallon: string;
  targetMarginPercent: string;
  minimumProfitDollars: string;
  workers: string;
  estimatedHours: string;
  defaultFacilityRatePerTon: string;
};

function toForm(defaults: PricingSettings["defaults"]): DefaultsForm {
  return {
    hourlyLaborCost: String(defaults.hourlyLaborCost),
    fuelPricePerGallon: String(defaults.fuelPricePerGallon),
    targetMarginPercent: String(Math.round(defaults.targetMarginDecimal * 100)),
    minimumProfitDollars: String(defaults.minimumProfitDollars),
    workers: String(defaults.workers),
    estimatedHours: String(defaults.estimatedHours),
    defaultFacilityRatePerTon: String(defaults.defaultFacilityRatePerTon),
  };
}

const num = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

// Vision settings, as strings for editable inputs.
type VisionForm = {
  model: string;
  temperature: string;
  maxTokens: string;
  systemInstructions: string;
  visualBreakdownInstructions: string;
};

function toVisionForm(value: VisionSettings): VisionForm {
  return {
    model: value.model,
    temperature: String(value.temperature),
    maxTokens: String(value.maxTokens),
    systemInstructions: value.systemInstructions,
    visualBreakdownInstructions: value.visualBreakdownInstructions,
  };
}

export default function EstimateSettings() {
  const [form, setForm] = useState<DefaultsForm>(() =>
    toForm(loadPricingSettings().defaults)
  );

  const update = (patch: Partial<DefaultsForm>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const [vision, setVision] = useState<VisionForm>(() =>
    toVisionForm(loadVisionSettings())
  );

  const updateVision = (patch: Partial<VisionForm>) =>
    setVision((prev) => ({ ...prev, ...patch }));

  const save = () => {
    // Re-read at save time so we never clobber concurrent changes to
    // facilities / vehicles / materials made elsewhere in the app.
    const current = loadPricingSettings();
    savePricingSettings({
      ...current,
      defaults: {
        ...current.defaults,
        hourlyLaborCost: num(form.hourlyLaborCost),
        fuelPricePerGallon: num(form.fuelPricePerGallon),
        targetMarginDecimal: num(form.targetMarginPercent) / 100,
        minimumProfitDollars: num(form.minimumProfitDollars),
        workers: Math.max(1, Math.round(num(form.workers))),
        estimatedHours: num(form.estimatedHours),
        defaultFacilityRatePerTon: num(form.defaultFacilityRatePerTon),
      },
    });
    saveVisionSettings({
      model: vision.model,
      temperature: clamp(num(vision.temperature), 0, 1),
      maxTokens: clamp(Math.round(num(vision.maxTokens)), 500, 16000),
      systemInstructions: vision.systemInstructions,
      visualBreakdownInstructions: vision.visualBreakdownInstructions,
    });
    toast.success("Estimate settings saved");
  };

  const resetDefaults = () => {
    setForm(toForm(defaultPricingSettings.defaults));
    toast("Reset to the original defaults — click Save to apply.");
  };

  return (
    <SettingsShell
      title="Estimate Settings"
      actions={<SettingsSaveButton onClick={save} />}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <InfoCallout>
          These defaults are used as starting values for every new estimate. You
          can still override them on individual estimates when a job needs
          different assumptions.
        </InfoCallout>

        <SettingsCard
          title="Default Operating Costs"
          icon={Calculator}
          action={
            <Button
              variant="link"
              className="h-auto p-0 text-sm text-muted-foreground hover:text-[var(--moss-deep)]"
              onClick={resetDefaults}
            >
              Reset to Defaults
            </Button>
          }
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <SettingsField
              label="Hourly labor cost"
              help="What you pay one worker per hour."
            >
              <Input
                type="number"
                min="0"
                step="1"
                value={form.hourlyLaborCost}
                onChange={(event) => update({ hourlyLaborCost: event.target.value })}
                className="rounded-lg"
              />
            </SettingsField>

            <SettingsField
              label="Gas price per gallon"
              help="Current pump price, used to figure fuel cost."
            >
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.fuelPricePerGallon}
                onChange={(event) =>
                  update({ fuelPricePerGallon: event.target.value })
                }
                className="rounded-lg"
              />
            </SettingsField>

            <SettingsField
              label="Target margin %"
              help="Minimum acceptable gross margin. Quotes are raised when calculated margin falls below this."
            >
              <Input
                type="number"
                min="0"
                max="95"
                step="1"
                value={form.targetMarginPercent}
                onChange={(event) =>
                  update({ targetMarginPercent: event.target.value })
                }
                className="rounded-lg"
              />
            </SettingsField>

            <SettingsField
              label="Minimum profit"
              help="Floor profit per job. Quotes are raised to guarantee at least this much gross profit."
            >
              <Input
                type="number"
                min="0"
                step="25"
                value={form.minimumProfitDollars}
                onChange={(event) =>
                  update({ minimumProfitDollars: event.target.value })
                }
                className="rounded-lg"
              />
            </SettingsField>

            <SettingsField
              label="Default workers"
              help="Crew size pre-filled on a new estimate."
            >
              <Input
                type="number"
                min="1"
                step="1"
                value={form.workers}
                onChange={(event) => update({ workers: event.target.value })}
                className="rounded-lg"
              />
            </SettingsField>

            <SettingsField
              label="Default labor hours"
              help="Hours per job pre-filled on a new estimate."
            >
              <Input
                type="number"
                min="0"
                step="0.25"
                value={form.estimatedHours}
                onChange={(event) =>
                  update({ estimatedHours: event.target.value })
                }
                className="rounded-lg"
              />
            </SettingsField>

            <SettingsField
              label="Default facility rate (per ton)"
              help="Fallback disposal rate used when a facility has no verified rate."
            >
              <Input
                type="number"
                min="0"
                step="1"
                value={form.defaultFacilityRatePerTon}
                onChange={(event) =>
                  update({ defaultFacilityRatePerTon: event.target.value })
                }
                className="rounded-lg"
              />
            </SettingsField>
          </div>
        </SettingsCard>

        <SettingsCard title="Vision AI" icon={Camera}>
          <p className="mb-5 text-sm text-muted-foreground">
            Settings for the photo-based estimator (the Vision tab in the
            Estimate Builder). The AI reads junk photos and returns an item
            breakdown using these.
          </p>
          <div className="space-y-5">
            <SettingsField
              label="Vision model"
              help="GPT-4.1 Mini matches GPT-4o accuracy at much lower cost and latency, with a 1M-token context for multi-angle photo sets. GPT-4.1 is the most accurate; GPT-4o is the older model."
            >
              <Select
                value={vision.model}
                onValueChange={(value) => updateVision({ model: value })}
              >
                <SelectTrigger className="w-full rounded-lg bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4.1-mini">GPT-4.1 Mini (Recommended)</SelectItem>
                  <SelectItem value="gpt-4.1">GPT-4.1 (highest accuracy)</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o (older)</SelectItem>
                </SelectContent>
              </Select>
            </SettingsField>

            <div className="grid gap-5 sm:grid-cols-2">
              <SettingsField
                label="Temperature"
                help="Lower = more consistent. Higher = more variation. 0.3 is a good default."
              >
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={vision.temperature}
                  onChange={(event) => updateVision({ temperature: event.target.value })}
                  className="rounded-lg"
                />
              </SettingsField>

              <SettingsField
                label="Max response tokens"
                help="500-16,000. 1,500 is usually enough; raise it for very detailed breakdowns."
              >
                <Input
                  type="number"
                  min="500"
                  max="16000"
                  step="100"
                  value={vision.maxTokens}
                  onChange={(event) => updateVision({ maxTokens: event.target.value })}
                  className="rounded-lg"
                />
              </SettingsField>
            </div>

            <SettingsField
              label="System instructions"
              help="The exact prompt sent to the AI for every photo analysis."
            >
              <Textarea
                value={vision.systemInstructions}
                onChange={(event) =>
                  updateVision({ systemInstructions: event.target.value })
                }
                className="min-h-[200px] rounded-lg font-mono text-xs leading-5"
              />
              <Button
                variant="link"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-[var(--moss-deep)]"
                onClick={() =>
                  updateVision({
                    systemInstructions: defaultVisionSettings.systemInstructions,
                  })
                }
              >
                Reset to default prompt
              </Button>
            </SettingsField>

            <SettingsField
              label="Visual breakdown instructions"
              help="Prompt for the upcoming truck-packing visual (Pack Smarter / Tetris Mode). Saved now, used later."
            >
              <Textarea
                value={vision.visualBreakdownInstructions}
                onChange={(event) =>
                  updateVision({ visualBreakdownInstructions: event.target.value })
                }
                className="min-h-[160px] rounded-lg font-mono text-xs leading-5"
              />
              <Button
                variant="link"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-[var(--moss-deep)]"
                onClick={() =>
                  updateVision({
                    visualBreakdownInstructions:
                      defaultVisionSettings.visualBreakdownInstructions,
                  })
                }
              >
                Reset to default prompt
              </Button>
            </SettingsField>
          </div>
        </SettingsCard>
      </div>
    </SettingsShell>
  );
}
