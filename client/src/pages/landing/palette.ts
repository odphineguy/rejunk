/**
 * Landing page colors, in one tiny module because App.tsx needs the page
 * background for the Suspense fallback without pulling in the whole page.
 *
 * Brand greens come from the Rejunk logo (pine + lime, see index.css tokens).
 */

export const PALETTE = {
  /** Rejunk pine — the page background. */
  pine: "#052a2b",
  /** A step lighter than pine — cards and raised surfaces. */
  pineRaised: "#0a3b3c",
  /** Hairline borders on pine surfaces. */
  pineLine: "#16494a",
  /** Rejunk lime — CTA, highlights. */
  lime: "#83e282",
  /** Near-white text on pine. */
  paper: "#f2f7f2",
  /** Muted text on pine. */
  paperSoft: "#9db8ad",
} as const;

/** The color App.tsx paints while the landing chunk downloads. */
export const LANDING_BG = PALETTE.pine;
