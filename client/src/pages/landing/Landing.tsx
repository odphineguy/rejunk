import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";

import { GarageScene } from "./GarageScene";
import { LandingFooter } from "./LandingFooter";
import { PALETTE } from "./palette";
import { ServicesStrip } from "./ServicesStrip";
import { useGarageTimeline } from "./useGarageTimeline";

/**
 * The public marketing landing page at "/". Deliberately self-contained:
 * this bundle ships React + wouter + GSAP and nothing else — no Supabase,
 * no maps, no shadcn — so paid-lead traffic loads fast.
 */

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const onChange = () => setMobile(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

export default function Landing() {
  const reducedMotion = usePrefersReducedMotion();
  const mobile = useIsMobile();

  const heroRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subheadRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);

  useGarageTimeline(
    { hero: heroRef, headline: headlineRef, subhead: subheadRef, cta: ctaRef, hint: hintRef },
    !reducedMotion,
  );

  return (
    <div className="min-h-dvh" style={{ background: PALETTE.sand, color: PALETTE.ink }}>
      {/* Header: logo left, quiet staff entrance right. Transparent over the hero. */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4 md:px-10 md:py-6">
        <img src="/rejunk.png" alt="Rejunk" className="h-9 w-auto md:h-11" />
        <Link
          href="/login"
          className="text-sm font-medium opacity-50 transition-opacity hover:opacity-90"
          style={{ color: PALETTE.ink }}
        >
          Sign in
        </Link>
      </header>

      {/* Hero — pinned by ScrollTrigger; with reduced motion it's a static
          final frame (clean garage, truck present, headline visible). */}
      <section ref={heroRef} className="relative flex h-dvh flex-col items-center justify-center overflow-hidden">
        <div className="flex w-full max-w-[1400px] flex-1 items-center justify-center px-2 md:px-8">
          <GarageScene mobileCrop={mobile} staticFinal={reducedMotion} />
        </div>

        {/* Headline + CTA are real DOM elements (not SVG text). They default
            to visible; the timeline hides them and raises them back in over
            the swept-out garage at the end of the scroll. */}
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
          <h1
            ref={headlineRef}
            className="font-display text-5xl font-bold tracking-tight md:text-7xl"
            // Sand-colored glow keeps the pine text readable where it crosses
            // the dark garage interior behind it.
            style={{
              color: PALETTE.pine,
              textShadow: `0 0 10px ${PALETTE.sand}, 0 0 28px ${PALETTE.sand}, 0 2px 44px ${PALETTE.sand}`,
            }}
          >
            Gone by tonight.
          </h1>
          <p
            ref={subheadRef}
            className="mt-4 max-w-xl text-base font-medium md:text-lg"
            style={{
              color: PALETTE.ink,
              textShadow: `0 0 8px ${PALETTE.sand}, 0 0 20px ${PALETTE.sand}`,
            }}
          >
            Junk removal, moving, and assembly across the Phoenix valley.
          </p>
          {/* TODO: wire to the public estimator route when it exists (phase 2). */}
          <button
            ref={ctaRef}
            type="button"
            className="pointer-events-auto mt-8 w-full max-w-xs rounded-xl px-8 py-4 text-lg font-bold shadow-lg transition-transform hover:scale-[1.03] md:w-auto"
            style={{ background: PALETTE.pine, color: PALETTE.lime }}
          >
            Get my price
          </button>
        </div>

        {/* Scroll hint — fades out permanently once scrolling begins. */}
        {!reducedMotion && (
          <div
            ref={hintRef}
            aria-hidden="true"
            className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 animate-bounce"
          >
            <svg width="34" height="20" viewBox="0 0 34 20" fill="none">
              <path d="M3 3 L17 16 L31 3" stroke={PALETTE.pine} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </section>

      <ServicesStrip />
      <LandingFooter />
    </div>
  );
}
