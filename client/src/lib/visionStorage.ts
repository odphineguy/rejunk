// Vision settings persistence + the client-side call into the analysis endpoint.
// Settings ride the existing settingsStorage path (localStorage + Supabase
// app_settings, section "vision"); the analyze call posts compressed photos to
// the server, which holds the OpenAI key.

import { loadSettingsSection, saveSettingsSection } from "@/lib/settingsStorage";
import { defaultVisionSettings } from "@/data/defaultVisionSettings";
import type { VisionAnalysisResult, VisionSettings } from "@/types/vision";

const SECTION = "vision";

export function loadVisionSettings(): VisionSettings {
  return loadSettingsSection<VisionSettings>(SECTION, defaultVisionSettings);
}

export function saveVisionSettings(value: VisionSettings): VisionSettings {
  return saveSettingsSection(SECTION, value);
}

/**
 * Sends the (already compressed) photo data URLs + optional details to the
 * server, which calls OpenAI with the business's System Instructions and
 * returns the structured estimate. Throws with a human-readable message on
 * failure (e.g. the key isn't configured).
 */
export async function analyzePhotos(input: {
  photos: string[];
  details?: string;
  settings: VisionSettings;
}): Promise<VisionAnalysisResult> {
  const response = await fetch("/api/vision-analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      photos: input.photos,
      details: input.details ?? "",
      model: input.settings.model,
      temperature: input.settings.temperature,
      maxTokens: input.settings.maxTokens,
      systemInstructions: input.settings.systemInstructions,
    }),
  });

  const data = (await response.json().catch(() => null)) as
    | (VisionAnalysisResult & { error?: string })
    | { error?: string }
    | null;

  if (!response.ok) {
    const message =
      (data && "error" in data && data.error) ||
      `Analysis failed (${response.status}).`;
    throw new Error(message);
  }
  return data as VisionAnalysisResult;
}
