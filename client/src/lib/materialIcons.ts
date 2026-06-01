import type { Facility, MaterialCategory } from "@/types/pricing";

export interface MaterialIcon {
  src: string;
  label: string;
}

// Each material maps to a broad "bucket" icon (PNGs in client/public/icons/).
// Several materials can share one icon — brick/tile/C&D all show the C&D icon,
// concrete/rock both show the concrete icon. Recycling shows when a site takes
// cardboard/mixed recyclables.
export const CATEGORY_ICON: Partial<Record<MaterialCategory, MaterialIcon>> = {
  household_junk: { src: "/icons/msw.png", label: "Household / general trash" },
  cardboard: { src: "/icons/recycle.png", label: "Recycling" },
  clean_concrete: { src: "/icons/concrete.png", label: "Clean concrete" },
  rock: { src: "/icons/concrete.png", label: "Clean concrete / rock" },
  mixed_c_and_d: { src: "/icons/c-and-d.png", label: "C&D / demo (brick, tile, wood)" },
  brick: { src: "/icons/c-and-d.png", label: "C&D / demo (brick, tile, wood)" },
  clean_tile: { src: "/icons/c-and-d.png", label: "C&D / demo (brick, tile, wood)" },
  metal: { src: "/icons/metal.png", label: "Metal" },
  appliances: { src: "/icons/appliances.png", label: "Appliances" },
  furniture: { src: "/icons/furniture.png", label: "Furniture" },
  mattresses: { src: "/icons/furniture.png", label: "Furniture" },
  tires: { src: "/icons/tires.png", label: "Tires" },
  green_waste: { src: "/icons/green-waste.png", label: "Green waste" },
  dirt: { src: "/icons/dirt.png", label: "Dirt" },
  hazardous_excluded: { src: "/icons/hazardous.png", label: "Hazardous" },
};

// Fixed order so the most useful icons (trash, recycle, concrete) come first.
const ICON_ORDER: MaterialCategory[] = [
  "household_junk", "cardboard", "clean_concrete", "rock", "mixed_c_and_d", "brick", "clean_tile",
  "metal", "appliances", "furniture", "mattresses", "tires", "green_waste", "dirt", "hazardous_excluded",
];

/** The bucket icon for a single material category (used in the Estimate Builder picker). */
export function materialIcon(category: MaterialCategory): MaterialIcon | undefined {
  return CATEGORY_ICON[category];
}

/** Deduped, ordered icons for everything a facility accepts (used on the facility cards). */
export function acceptedIcons(facility: Facility): MaterialIcon[] {
  const seen = new Set<string>();
  const icons: MaterialIcon[] = [];
  for (const category of ICON_ORDER) {
    if (!facility.acceptedMaterials.includes(category)) continue;
    const icon = CATEGORY_ICON[category];
    if (icon && !seen.has(icon.src)) {
      seen.add(icon.src);
      icons.push(icon);
    }
  }
  return icons;
}
