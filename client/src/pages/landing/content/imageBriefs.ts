/**
 * Single source of truth for every photo slot on the public site.
 *
 * Each entry renders as a visible placeholder box (components/ImagePlaceholder)
 * showing its id + brief, so Abe can produce premium branded images per slot
 * and swap them in later. Anything with the Rejunk logo in frame is Abe's to
 * create — these briefs describe the shot, not the branding treatment.
 */

export interface ImageBrief {
  /** What the final photograph should show. */
  brief: string;
  /** CSS aspect-ratio for the placeholder box. */
  aspect: string;
}

export const IMAGE_BRIEFS = {
  "home-hero": {
    brief:
      "Two uniformed Rejunk crew members carrying a sofa from a Phoenix suburban home toward the branded truck, golden-hour light.",
    aspect: "4 / 3",
  },
  "home-svc-junk": {
    brief: "Crew loading garage-cleanout items into the truck, driveway setting.",
    aspect: "3 / 2",
  },
  "home-svc-moving": {
    brief: "Crew wrapping and carrying a dresser with moving blankets.",
    aspect: "3 / 2",
  },
  "home-svc-assembly": {
    brief: "Technician assembling flat-pack furniture in a bright living room, tools laid out neatly.",
    aspect: "3 / 2",
  },
  "home-eco": {
    brief:
      "Sorted materials at a recycling/transfer facility — metal, cardboard, green waste in bays. Documentary feel.",
    aspect: "16 / 9",
  },
  "home-values": {
    brief: "Owner or crew portrait in branded gear, friendly, direct to camera.",
    aspect: "1 / 1",
  },
  "junk-hero": {
    brief: "Before/after split: cluttered garage vs. the same garage cleared out.",
    aspect: "4 / 3",
  },
  "junk-eco": {
    brief:
      "Truck at a Phoenix-area transfer station or donation drop-off, items being sorted — not dumped.",
    aspect: "16 / 9",
  },
  "moving-hero": {
    brief:
      "Crew loading a padded, labeled truck; clean stacked boxes; Phoenix neighborhood backdrop.",
    aspect: "4 / 3",
  },
  "assembly-hero": {
    brief:
      "Technician installing a grab bar or mounting a TV while an older homeowner looks on, relaxed.",
    aspect: "4 / 3",
  },
  "assembly-seniors": {
    brief:
      "Crew member patiently walking an older couple through finished work at their front door — warm, unposed.",
    aspect: "3 / 2",
  },
  "estimate-junk": {
    brief: "Iconic single shot: armchair and boxes on a curb.",
    aspect: "3 / 2",
  },
  "estimate-moving": {
    brief: "Hand truck with stacked moving boxes.",
    aspect: "3 / 2",
  },
  "estimate-assembly": {
    brief: "Drill and hex keys laid out on flat-pack furniture parts.",
    aspect: "3 / 2",
  },
} as const satisfies Record<string, ImageBrief>;

export type ImageBriefId = keyof typeof IMAGE_BRIEFS;
