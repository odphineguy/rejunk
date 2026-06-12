import type { ReactNode } from "react";
import { LazyMotion, domAnimation } from "framer-motion";

import { PALETTE } from "../palette";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

const P = PALETTE;

/**
 * Shared shell for every public marketing page: white background, sticky
 * header, footer, skip link. LazyMotion + domAnimation keeps framer-motion's
 * cost in this chunk to the slim `m.*` runtime (used by components/Reveal).
 */
export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <div className="min-h-dvh" style={{ background: P.paperBg, color: P.ink }}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2"
          style={{ background: P.pine, color: P.paper }}
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
      </div>
    </LazyMotion>
  );
}
