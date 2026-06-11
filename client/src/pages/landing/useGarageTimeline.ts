import { useEffect, type RefObject } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { JUNK_ITEMS, OPENING, TRUCK_BED, type JunkWeight } from "./GarageScene";

gsap.registerPlugin(ScrollTrigger);

/** How far past the opening the door travels so the trim is fully clear. */
const DOOR_TRAVEL = OPENING.height + 12;
/** Initial door-crack: 8% open, enough to show a sliver of clutter. */
const DOOR_CRACK = -Math.round(OPENING.height * 0.08);

/** Weight rule: heavy items travel slower with low flat arcs, light items pop. */
const FLIGHT: Record<JunkWeight, { duration: number; arc: number; spin: number }> = {
  light: { duration: 0.06, arc: 150, spin: 22 },
  medium: { duration: 0.085, arc: 95, spin: 14 },
  heavy: { duration: 0.115, arc: 42, spin: 6 },
};

export type GarageTimelineRefs = {
  hero: RefObject<HTMLElement | null>;
  headline: RefObject<HTMLElement | null>;
  subhead: RefObject<HTMLElement | null>;
  cta: RefObject<HTMLElement | null>;
  hint: RefObject<HTMLElement | null>;
};

/**
 * Pins the hero and maps the whole garage sequence onto scroll progress
 * (scrub: 1, so scrolling backwards reverses it — intentional). The only
 * non-scroll motion is the one-time door-crack settle on load, killed the
 * moment real scrolling starts. No-ops entirely when `enabled` is false
 * (prefers-reduced-motion renders the static final scene instead).
 */
export function useGarageTimeline(refs: GarageTimelineRefs, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const hero = refs.hero.current;
    const headline = refs.headline.current;
    const subhead = refs.subhead.current;
    const cta = refs.cta.current;
    const hint = refs.hint.current;
    if (!hero || !headline || !subhead || !cta) return;

    const mm = gsap.matchMedia();

    // One-time hint fade + settle-kill on first scroll, outside matchMedia so
    // resizes don't re-arm it.
    let settleTween: gsap.core.Tween | null = null;
    let hintFaded = false;
    const onFirstScroll = () => {
      if (hintFaded) return;
      hintFaded = true;
      settleTween?.kill();
      if (hint) gsap.to(hint, { autoAlpha: 0, duration: 0.35, overwrite: true });
      window.removeEventListener("scroll", onFirstScroll);
    };
    window.addEventListener("scroll", onFirstScroll, { passive: true });

    mm.add(
      {
        desktop: "(min-width: 768px)",
        mobile: "(max-width: 767px)",
      },
      context => {
        const { mobile } = context.conditions as { mobile: boolean };

        // Headline block starts hidden; without JS (or with the timeline
        // disabled) the DOM defaults keep it visible.
        gsap.set([headline, subhead, cta], { autoAlpha: 0, y: 26 });
        gsap.set("#scene-door", { y: DOOR_CRACK });

        // The crack of visible clutter signals that scrolling does something.
        settleTween = gsap.fromTo(
          "#scene-door",
          { y: 0 },
          { y: DOOR_CRACK, duration: 0.9, delay: 0.35, ease: "back.out(2.2)" },
        );

        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: hero,
            start: "top top",
            // ~300vh of pinned scroll on desktop, ~200vh on phones.
            end: mobile ? "+=200%" : "+=300%",
            pin: true,
            scrub: 1,
            anticipatePin: 1,
          },
        });

        // ── 0.00–0.15 · door rolls up with two tiny mechanical stutters ──
        tl.to("#scene-door", { y: -DOOR_TRAVEL * 0.45, duration: 0.058, ease: "power1.in" }, 0)
          .to("#scene-door", { y: -DOOR_TRAVEL * 0.43, duration: 0.014 }, 0.058)
          .to("#scene-door", { y: -DOOR_TRAVEL * 0.82, duration: 0.044, ease: "power1.inOut" }, 0.072)
          .to("#scene-door", { y: -DOOR_TRAVEL * 0.8, duration: 0.012 }, 0.116)
          .to("#scene-door", { y: -DOOR_TRAVEL, duration: 0.022, ease: "power1.out" }, 0.128);

        // ── 0.15–0.75 · items fly to the truck bed, staggered by weight ──
        const FIRST_LAUNCH = 0.16;
        const LAST_LAUNCH = 0.62;
        const step = (LAST_LAUNCH - FIRST_LAUNCH) / (JUNK_ITEMS.length - 1);

        JUNK_ITEMS.forEach((item, index) => {
          const sel = `#${item.id}`;
          const { duration, arc, spin } = FLIGHT[item.weight];
          const t0 = FIRST_LAUNCH + index * step;
          const dx = TRUCK_BED.x - item.cx;
          const dy = TRUCK_BED.y - item.cy;
          const rotation = index % 2 === 0 ? spin : -spin;

          // Arc = linear x + two-part eased y (lift, then fall past the bed).
          tl.to(sel, { x: dx, duration }, t0)
            .to(sel, { y: dy - arc, duration: duration * 0.45, ease: "power2.out" }, t0)
            .to(sel, { y: dy, duration: duration * 0.55, ease: "power2.in" }, t0 + duration * 0.45)
            .to(sel, { rotation, scale: 0.7, duration, ease: "power1.inOut", transformOrigin: "50% 50%" }, t0)
            // It is already painting behind the truck box; the fade just keeps
            // the bed from visually filling up.
            .to(sel, { autoAlpha: 0, duration: duration * 0.22 }, t0 + duration * 0.78);

          // Dust puff at the launch point.
          tl.fromTo(
            `#dust-${item.id} circle`,
            { opacity: 0, scale: 0.5, transformOrigin: "50% 50%" },
            { opacity: 0.4, scale: 1.1, duration: 0.014, stagger: 0.004 },
            t0,
          ).to(`#dust-${item.id} circle`, { opacity: 0, scale: 1.9, duration: 0.03 }, t0 + 0.018);
        });

        // ── 0.75–0.90 · liftgate up, truck drives off-frame right ────────
        tl.to("#scene-liftgate", { rotation: 90, svgOrigin: "850 530", duration: 0.045, ease: "power1.inOut" }, 0.755)
          .to("#scene-truck", { x: 460, duration: 0.095, ease: "power1.in" }, 0.805)
          .to("#scene-truck", {
            keyframes: [
              { y: -5, duration: 0.025 },
              { y: 2, duration: 0.025 },
              { y: 0, duration: 0.02 },
            ],
          }, 0.81);

        // ── 0.90–1.00 · headline + CTA rise in over the swept garage ─────
        tl.to(headline, { autoAlpha: 1, y: 0, duration: 0.05, ease: "power2.out" }, 0.89)
          .to(subhead, { autoAlpha: 1, y: 0, duration: 0.045, ease: "power2.out" }, 0.925)
          .to(cta, { autoAlpha: 1, y: 0, duration: 0.045, ease: "power2.out" }, 0.95);

        return () => {
          settleTween?.kill();
        };
      },
    );

    return () => {
      window.removeEventListener("scroll", onFirstScroll);
      mm.revert();
    };
  }, [enabled, refs.hero, refs.headline, refs.subhead, refs.cta, refs.hint]);
}
