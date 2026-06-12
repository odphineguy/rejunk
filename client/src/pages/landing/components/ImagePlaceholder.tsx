import { IMAGE_BRIEFS, type ImageBriefId } from "../content/imageBriefs";
import { PALETTE } from "../palette";

const P = PALETTE;

/**
 * Visible stand-in for every photo slot on the public site. Shows the slot id
 * and the shot description so Abe can produce the premium branded image for
 * each slot and we swap a real <img> in later (hosted via /manus-storage —
 * never committed into client/public, per the deploy-timeout rule).
 */
export function ImagePlaceholder({ id, className = "" }: { id: ImageBriefId; className?: string }) {
  const { brief, aspect } = IMAGE_BRIEFS[id];
  return (
    <div
      role="img"
      aria-label={brief}
      className={`flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed p-5 text-center ${className}`}
      style={{ aspectRatio: aspect, background: P.mist, borderColor: "rgba(5,42,43,0.25)" }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: P.inkSoft }}>
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="9" cy="10" r="1.7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 17l4.5-4.5 3 3L17 11l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-mono text-[11px] font-bold uppercase tracking-wider" style={{ color: P.pine }}>
        photo · {id}
      </span>
      <span className="max-w-sm text-xs leading-relaxed" style={{ color: P.inkSoft }}>
        {brief}
      </span>
    </div>
  );
}
