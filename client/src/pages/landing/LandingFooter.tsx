import { PALETTE } from "./palette";

/** Quiet legal footer — single row on desktop, stacked on phones. */
export function LandingFooter() {
  return (
    <footer
      className="flex flex-col items-center gap-1 px-6 py-8 text-center text-xs md:flex-row md:justify-center md:gap-3"
      style={{ background: PALETTE.sand, color: PALETTE.inkSoft }}
    >
      <span>Progressive Transportation Services LLC</span>
      <span className="hidden md:inline">·</span>
      <span>Chandler, AZ</span>
      <span className="hidden md:inline">·</span>
      <span>USDOT 4421119</span>
      <span className="hidden md:inline">·</span>
      <span>MC-1763629</span>
      <span className="hidden md:inline">·</span>
      <span>© {new Date().getFullYear()}</span>
    </footer>
  );
}
