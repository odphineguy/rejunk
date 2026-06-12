/**
 * Landing page colors, in one tiny module because App.tsx needs the page
 * background for the Suspense fallback without pulling in the whole page.
 *
 * Brand greens come from the Rejunk logo (pine + lime, see index.css tokens).
 */

export const PALETTE = {
  /** Rejunk pine — dark accent bands and headings. */
  pine: "#052a2b",
  /** A step lighter than pine — cards and raised surfaces on pine. */
  pineRaised: "#0a3b3c",
  /** Hairline borders on pine surfaces. */
  pineLine: "#16494a",
  /** Rejunk lime — CTA fills (always with pine text; lime fails contrast as text on white). */
  lime: "#83e282",
  /** Near-white text on pine. */
  paper: "#f2f7f2",
  /** Muted text on pine. */
  paperSoft: "#9db8ad",

  // V3 light-surface tokens — the site is white-first with pine/lime accents.
  /** Page background. */
  paperBg: "#ffffff",
  /** Soft green-tinted section background, alternates with white. */
  mist: "#f4f8f4",
  /** Body text on white. */
  ink: "#0c1f1d",
  /** Muted text on white. */
  inkSoft: "#52665f",
  /** Hairline borders on white surfaces. */
  line: "#e3ece5",
  /** Pale lime tint for icon chips and selected states on white. */
  limeSoft: "#e6f8e5",
} as const;

/** The color App.tsx paints while the landing chunk downloads. */
export const LANDING_BG = PALETTE.paperBg;
