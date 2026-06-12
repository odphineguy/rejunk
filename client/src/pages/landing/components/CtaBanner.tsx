import { Link } from "wouter";

import { PHONE_DISPLAY, PHONE_HREF } from "../content/site";
import { PALETTE } from "../palette";
import { Reveal } from "./Reveal";

const P = PALETTE;

/** Final full-width call-to-action at the bottom of every page. */
export function CtaBanner({ heading = "Ready to get it handled?" }: { heading?: string }) {
  return (
    <section className="px-5 py-14 md:px-8 md:py-20">
      <Reveal>
        <div
          className="mx-auto flex max-w-6xl flex-col items-center gap-6 rounded-3xl border px-6 py-12 text-center md:py-16"
          style={{ background: P.limeSoft, borderColor: P.line }}
        >
          <h2 className="font-display max-w-2xl text-3xl font-bold tracking-tight md:text-4xl" style={{ color: P.pine }}>
            {heading}
          </h2>
          <p className="max-w-xl text-base" style={{ color: P.inkSoft }}>
            Tell us what you need and we'll text or call back with a quote — usually within the
            hour during business hours.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/estimate"
              className="rounded-xl px-8 py-4 text-lg font-bold shadow-lg transition-transform hover:scale-[1.03]"
              style={{ background: P.pine, color: P.paper }}
            >
              Get a Free Estimate
            </Link>
            <a href={PHONE_HREF} className="px-4 py-2 text-base font-bold" style={{ color: P.pine }}>
              or call {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
