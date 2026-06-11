/**
 * Every color in the landing scene, in one place. Kept in its own tiny module
 * (rather than inside GarageScene) because App.tsx needs DOOR_COLOR for the
 * Suspense fallback — the closed door — without pulling in the whole scene.
 *
 * Brand greens come from the Rejunk logo (pine + lime, see index.css tokens);
 * everything else is the warm desert-neutral family.
 */

export const PALETTE = {
  /** Rejunk pine — truck box, wordmarks, dark accents. */
  pine: "#052a2b",
  /** Rejunk lime — CTA, highlights. */
  lime: "#83e282",
  /** Deeper green for CTA hover / icon strokes. */
  moss: "#1f7a4a",

  /** Warm sand page + scene background. */
  sand: "#f3ead9",
  /** Slightly deeper sand for the driveway / ground band. */
  sandDeep: "#e6d8bf",
  /** Warm sky band behind the house. */
  sky: "#fdf6e8",
  /** Stucco house wall. */
  stucco: "#efe2c8",
  /** Stucco shadow / trim. */
  stuccoShade: "#dcc9a5",
  /** Roof line + wheels + outlines. */
  charcoal: "#3d3a34",
  /** Soft charcoal for text. */
  ink: "#2b2925",
  /** Muted text. */
  inkSoft: "#6b675e",

  /** The garage door panels — also the Suspense fallback color. */
  door: "#e9dcc3",
  doorLine: "#cdbb97",
  /** Dark garage interior revealed behind the door. */
  garageDark: "#2e2b26",

  /** Terracotta — secondary accent for select junk items. */
  terracotta: "#c96f4a",
  /** Amber — paint cans, lamp shade. */
  amber: "#dba84d",
  /** Saguaro green (desaturated, not a brand green). */
  cactus: "#7d9d6a",
} as const;

/** The closed-door color App.tsx paints while the landing chunk downloads. */
export const DOOR_COLOR = PALETTE.door;
