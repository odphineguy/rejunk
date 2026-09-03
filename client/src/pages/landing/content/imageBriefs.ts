/**
 * Single source of truth for every photo slot on the public site.
 *
 * Hosted photos use Higgsfield's CDN. Local working copies remain in the
 * git-ignored landing-assets/ + client/public/landing-preview/ directories.
 * If a URL ever dies, components/ImagePlaceholder falls back to a labeled
 * placeholder automatically.
 */

export interface ImageBrief {
  /** What the photograph shows (also the alt text). */
  brief: string;
  /** CSS aspect-ratio for the image/placeholder box. */
  aspect: string;
  /** Hosted image URL; omit to show the labeled placeholder box. */
  src?: string;
}

const CDN =
  "https://d8j0ntlcm91z4.cloudfront.net/user_3ExzaXyax9ozCubCJKvOqbDVKlr";
const UPLOAD_CDN =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_3ExzaXyax9ozCubCJKvOqbDVKlr";

export const IMAGE_BRIEFS = {
  "home-hero": {
    brief:
      "Two uniformed crew members carrying a sofa beside a white moving truck in a Phoenix neighborhood.",
    aspect: "16 / 9",
    src: "/images/home-hero.webp",
  },
  "home-svc-junk": {
    brief:
      "Crew loading garage-cleanout items into the truck, driveway setting.",
    aspect: "3 / 2",
    src: `${CDN}/hf_20260612_223428_41675ed6-9114-4abf-a45c-302f4e75ec73_min.webp`,
  },
  "home-svc-moving": {
    brief: "Crew wrapping and carrying a dresser with moving blankets.",
    aspect: "3 / 2",
    src: `${CDN}/hf_20260612_223432_3f5a5e54-8aa0-4a91-9756-6e03d6583c3d_min.webp`,
  },
  "home-svc-assembly": {
    brief:
      "Technician assembling flat-pack furniture in a bright living room, tools laid out neatly.",
    aspect: "3 / 2",
    src: `${CDN}/hf_20260612_223435_7fd37ca5-6064-4a7f-8e1c-a146cbd9c1b4_min.webp`,
  },
  "home-tile-junk": {
    brief:
      "Two uniformed crew members carrying an old chair and boxes out of a Phoenix garage.",
    aspect: "4 / 5",
    src: `${UPLOAD_CDN}/6bbefb67-f3ec-4291-9ea1-1b0e5dcb0788.png`,
  },
  "home-tile-moving": {
    brief:
      "Two uniformed movers carefully guiding a wrapped dresser through a home's front door.",
    aspect: "4 / 5",
    src: `${UPLOAD_CDN}/6feb7b95-adcb-4dae-ae0f-1dbbb7970595.png`,
  },
  "home-tile-piano": {
    brief:
      "Two uniformed movers padding and securing an upright piano inside an Arizona home.",
    aspect: "4 / 5",
    src: `${CDN}/hf_20260612_223432_3f5a5e54-8aa0-4a91-9756-6e03d6583c3d_min.webp`,
  },
  "home-tile-assembly": {
    brief:
      "Uniformed furniture assembler tightening the final fastener on a modern wood bed frame.",
    aspect: "4 / 5",
    src: `${UPLOAD_CDN}/11230ab0-70d4-4d1d-ac12-4c60999c15c3.png`,
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
    brief:
      "Before/after split: cluttered garage vs. the same garage cleared out.",
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
  "pallet-delivery-hero": {
    brief:
      "Progressive Transportation box truck being forklift-loaded with wrapped pallets at a local building-material supplier.",
    aspect: "4 / 3",
    src: "/images/truck-pallet.webp",
  },
  "pallet-delivery-equipment": {
    brief:
      "Wrapped building-material pallet on the lowered liftgate of a 26-foot box truck, with the pallet jack visible.",
    aspect: "3 / 2",
    src: "/images/big-pallet.webp",
  },
  "piano-hero": {
    brief:
      "Two uniformed movers wrapping and strapping an upright piano before transport.",
    aspect: "4 / 3",
    src: "/images/piano-hero.webp",
  },
  "piano-route": {
    brief:
      "Two uniformed movers guiding a fully protected upright piano through a home's front door.",
    aspect: "3 / 2",
    src: "/images/piano-move.webp",
  },
  "assembly-hero": {
    brief:
      "Professional furniture assembler building a shelving unit in a bright living room.",
    aspect: "4 / 3",
    src: `${CDN}/hf_20260612_223435_7fd37ca5-6064-4a7f-8e1c-a146cbd9c1b4_min.webp`,
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
  "estimate-delivery": {
    brief: "Wrapped pallet ready for box-truck liftgate delivery.",
    aspect: "3 / 2",
    src: "/images/big-pallet.webp",
  },
  "estimate-piano": {
    brief:
      "A padded upright piano being secured by a professional moving crew.",
    aspect: "3 / 2",
    src: `${CDN}/hf_20260612_223432_3f5a5e54-8aa0-4a91-9756-6e03d6583c3d_min.webp`,
  },
  "estimate-assembly": {
    brief: "Drill and hex keys laid out on flat-pack furniture parts.",
    aspect: "3 / 2",
    src: `${CDN}/hf_20260612_223702_5d441b19-2780-4ceb-b2b8-55591d50484c_min.webp`,
  },
} as const satisfies Record<string, ImageBrief>;

export type ImageBriefId = keyof typeof IMAGE_BRIEFS;
