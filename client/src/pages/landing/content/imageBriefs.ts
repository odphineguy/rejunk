/**
 * Single source of truth for every photo slot on the public site.
 *
 * `src` is a Higgsfield-generated photo (Nano Banana Pro, 2026-06-12) hosted on
 * Higgsfield's CDN — nothing is committed to the repo (Manus deploy-timeout
 * rule) and full-res originals are backed up locally in landing-assets/
 * (git-ignored). If a URL ever dies, components/ImagePlaceholder falls back
 * to the labeled placeholder box automatically. To replace a shot with a
 * premium branded image later, just swap its `src`.
 */

export interface ImageBrief {
  /** What the photograph shows (also the alt text). */
  brief: string;
  /** CSS aspect-ratio for the image/placeholder box. */
  aspect: string;
  /** Hosted image URL; omit to show the labeled placeholder box. */
  src?: string;
}

const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3ExzaXyax9ozCubCJKvOqbDVKlr";

export const IMAGE_BRIEFS = {
  "home-hero": {
    brief:
      "Two uniformed Rejunk crew members carrying a sofa from a Phoenix suburban home toward the truck, golden-hour light.",
    aspect: "4 / 3",
    src: `${CDN}/hf_20260612_223425_d515bbae-382a-4008-8d78-4202dc0af89b_min.webp`,
  },
  "home-svc-junk": {
    brief: "Crew loading garage-cleanout items into the truck, driveway setting.",
    aspect: "3 / 2",
    src: `${CDN}/hf_20260612_223428_41675ed6-9114-4abf-a45c-302f4e75ec73_min.webp`,
  },
  "home-svc-moving": {
    brief: "Crew wrapping and carrying a dresser with moving blankets.",
    aspect: "3 / 2",
    src: `${CDN}/hf_20260612_223432_3f5a5e54-8aa0-4a91-9756-6e03d6583c3d_min.webp`,
  },
  "home-svc-assembly": {
    brief: "Technician assembling flat-pack furniture in a bright living room, tools laid out neatly.",
    aspect: "3 / 2",
    src: `${CDN}/hf_20260612_223435_7fd37ca5-6064-4a7f-8e1c-a146cbd9c1b4_min.webp`,
  },
  "home-eco": {
    brief:
      "Sorted materials at a recycling/transfer facility — metal, cardboard, green waste in bays. Documentary feel.",
    aspect: "16 / 9",
    src: `${CDN}/hf_20260612_223439_07b87242-0934-460e-a02e-f25b5fd6b4b0_min.webp`,
  },
  "home-values": {
    brief: "Crew portrait in front of the truck, friendly, direct to camera.",
    aspect: "1 / 1",
    src: `${CDN}/hf_20260612_223454_b8427407-d800-461a-a1c2-9b98c756b33f_min.webp`,
  },
  "junk-hero": {
    brief: "Before/after split: cluttered garage vs. the same garage cleared out.",
    aspect: "4 / 3",
    src: `${CDN}/hf_20260612_223458_3d4939c6-5d48-452e-8532-82bb89ceb1b2_min.webp`,
  },
  "junk-eco": {
    brief:
      "Truck at a Phoenix-area donation drop-off, items being sorted — not dumped.",
    aspect: "16 / 9",
    src: `${CDN}/hf_20260612_223501_c62e0531-4ecd-4334-b8ae-308e79276dbc_min.webp`,
  },
  "moving-hero": {
    brief:
      "Crew loading a padded, labeled truck; clean stacked boxes; Phoenix neighborhood backdrop.",
    aspect: "4 / 3",
    src: `${CDN}/hf_20260612_223505_6af404f6-1eeb-403c-aabe-302c42464890_min.webp`,
  },
  "assembly-hero": {
    brief:
      "Technician installing a grab bar while an older homeowner looks on, relaxed.",
    aspect: "4 / 3",
    src: `${CDN}/hf_20260612_223607_3f393ce3-2b1b-4360-bc4f-e7a1d518ec53_min.webp`,
  },
  "assembly-seniors": {
    brief:
      "Crew member warmly showing an older couple finished work at their front door — warm, unposed.",
    aspect: "3 / 2",
    src: `${CDN}/hf_20260612_223611_16f65e4a-e179-491d-a6f2-4294e076b6a9_min.webp`,
  },
  "estimate-junk": {
    brief: "Iconic single shot: armchair and boxes on a curb.",
    aspect: "3 / 2",
    src: `${CDN}/hf_20260612_223646_902c81cb-779d-48d7-9f6c-1c5b17bd0131_min.webp`,
  },
  "estimate-moving": {
    brief: "Hand truck with stacked moving boxes.",
    aspect: "3 / 2",
    src: `${CDN}/hf_20260612_223649_7af2fbc8-1f71-4db4-8b01-918b93010e31_min.webp`,
  },
  "estimate-assembly": {
    brief: "Drill and hex keys laid out on flat-pack furniture parts.",
    aspect: "3 / 2",
    src: `${CDN}/hf_20260612_223702_5d441b19-2780-4ceb-b2b8-55591d50484c_min.webp`,
  },
} as const satisfies Record<string, ImageBrief>;

export type ImageBriefId = keyof typeof IMAGE_BRIEFS;
