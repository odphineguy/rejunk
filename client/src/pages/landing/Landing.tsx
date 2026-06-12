import { Link } from "wouter";

import { LandingFooter } from "./LandingFooter";
import { PALETTE } from "./palette";
import { ServicesStrip } from "./ServicesStrip";

/**
 * The public marketing landing page at "/". Deliberately self-contained:
 * this bundle ships React + wouter and nothing else — no Supabase, no maps,
 * no shadcn — so paid-lead traffic loads fast.
 *
 * V2 placeholder: clean typography on brand pine while real photo/video
 * assets are being produced. No illustrations.
 */

const P = PALETTE;

const TRUST_POINTS = ["Same-day service", "Licensed & insured", "Phoenix metro & East Valley"];

export default function Landing() {
  return (
    <div className="min-h-dvh" style={{ background: P.pine, color: P.paper }}>
      {/* Header: logo left, quiet staff entrance right. */}
      <header className="flex items-center justify-between px-5 py-4 md:px-10 md:py-6">
        <img src="/rejunk-mark.png" alt="Rejunk" className="h-9 w-auto md:h-11" />
        <Link
          href="/login"
          className="text-sm font-medium opacity-60 transition-opacity hover:opacity-100"
          style={{ color: P.paper }}
        >
          Sign in
        </Link>
      </header>

      {/* Hero — static, typography-led. */}
      <section className="mx-auto flex max-w-4xl flex-col items-center px-6 pb-20 pt-16 text-center md:pb-28 md:pt-24">
        <p
          className="text-xs font-semibold uppercase tracking-[0.25em] md:text-sm"
          style={{ color: P.lime }}
        >
          Junk removal · Moving · Assembly
        </p>
        <h1
          className="font-display mt-5 text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl"
          style={{ color: P.paper }}
        >
          Gone by tonight.
        </h1>
        <p className="mt-5 max-w-xl text-base md:text-lg" style={{ color: P.paperSoft }}>
          Full cleanouts, single items, local moves, and assembly — handled across the Phoenix
          valley, usually the same day you call.
        </p>
        {/* TODO: wire to the public estimator route when it exists (phase 2). */}
        <button
          type="button"
          className="mt-9 w-full max-w-xs rounded-xl px-8 py-4 text-lg font-bold shadow-lg transition-transform hover:scale-[1.03] md:w-auto"
          style={{ background: P.lime, color: P.pine }}
        >
          Get my price
        </button>

        {/* Trust line */}
        <ul
          className="mt-12 flex flex-col items-center gap-2 text-sm md:flex-row md:gap-8"
          style={{ color: P.paperSoft }}
        >
          {TRUST_POINTS.map(point => (
            <li key={point} className="flex items-center gap-2">
              <span aria-hidden="true" style={{ color: P.lime }}>
                ✓
              </span>
              {point}
            </li>
          ))}
        </ul>
      </section>

      <ServicesStrip />
      <LandingFooter />
    </div>
  );
}
