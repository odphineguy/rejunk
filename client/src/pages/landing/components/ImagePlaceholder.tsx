import { useState } from "react";

import { IMAGE_BRIEFS, type ImageBriefId } from "../content/imageBriefs";
import { PALETTE } from "../palette";

const P = PALETTE;

/**
 * Photo slot for the public site. Renders the hosted image from
 * content/imageBriefs.ts when one exists; if the slot has no `src` or the
 * image fails to load (CDN gone, offline), it degrades to a labeled
 * placeholder box showing the slot id + shot description.
 */
export function ImagePlaceholder({ id, className = "" }: { id: ImageBriefId; className?: string }) {
  const { brief, aspect, src } = IMAGE_BRIEFS[id] as { brief: string; aspect: string; src?: string };
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={brief}
        loading="lazy"
        className={`w-full rounded-2xl object-cover ${className}`}
        style={{ aspectRatio: aspect, background: P.mist }}
        onError={() => setFailed(true)}
      />
    );
  }

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
