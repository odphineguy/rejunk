import { Link } from "wouter";

import { CtaBanner } from "./components/CtaBanner";
import { EcoStatsBand } from "./components/EcoStatsBand";
import { FaqAccordion } from "./components/FaqAccordion";
import { ImagePlaceholder } from "./components/ImagePlaceholder";
import { QuickAnswerCards } from "./components/QuickAnswerCards";
import { Reveal } from "./components/Reveal";
import { ServiceOverviewGrid } from "./components/ServiceOverviewGrid";
import { Testimonials } from "./components/Testimonials";
import type { Faq, QuickAnswer } from "./content/services";
import { PAGE_META, PHONE_DISPLAY, PHONE_HREF, SERVICE_AREA } from "./content/site";
import { SiteLayout } from "./layout/SiteLayout";
import { usePageMeta } from "./lib/usePageMeta";
import { PALETTE } from "./palette";

const P = PALETTE;

const TRUST_POINTS = ["Same-day service", "Licensed & insured", SERVICE_AREA];

const HOME_QUICK_ANSWERS: QuickAnswer[] = [
  {
    title: "How much does it cost?",
    body: "Junk is priced by truck space, moving by crew and hours, assembly by flat rates. Every job gets a firm number before we start.",
  },
  {
    title: "What do you handle?",
    body: "Junk removal, local moving and delivery, and assembly & handyman work — one call covers all three.",
  },
  {
    title: "How soon can you come?",
    body: "Usually the same day or next day, anywhere in the Phoenix metro and East Valley.",
  },
];

const HOME_FAQS: Faq[] = [
  {
    q: "What areas do you serve?",
    a: "The Phoenix metro and East Valley — Chandler, Gilbert, Mesa, Tempe, Scottsdale, Phoenix, and surrounding communities.",
  },
  {
    q: "How do I get a price?",
    a: `Use the estimate form, or call or text a photo of the job to ${PHONE_DISPLAY}. We respond with a firm quote, usually within the hour during business hours.`,
  },
  {
    q: "Are you licensed and insured?",
    a: "Yes. Rejunk is operated by Progressive Transportation Services LLC (USDOT 4421119, MC-1763629), licensed and insured.",
  },
  {
    q: "What makes you eco-friendly?",
    a: "Seventeen years in the waste industry taught us where everything should go. Loads are sorted and routed — donation first, recycling second, landfill last.",
  },
];

export default function HomePage() {
  usePageMeta(PAGE_META.home);

  return (
    <SiteLayout>
      {/* Hero */}
      <section className="px-5 pb-14 pt-10 md:px-8 md:pb-20 md:pt-16">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: P.pine }}>
                Junk removal · Moving · Assembly & handyman
              </p>
              <h1
                className="font-display mt-4 text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl"
                style={{ color: P.pine }}
              >
                Gone by tonight.
              </h1>
              <p className="mt-5 max-w-xl text-base md:text-lg" style={{ color: P.inkSoft }}>
                Full cleanouts, single items, local moves, and assembly — handled across the
                Phoenix valley, usually the same day you call. And because we spent 17 years in
                the waste business, your stuff ends up where it should: donated, recycled, and
                only then disposed.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/estimate"
                  className="rounded-xl px-8 py-4 text-center text-lg font-bold shadow-lg transition-transform hover:scale-[1.03]"
                  style={{ background: P.lime, color: P.pine }}
                >
                  Get a Free Estimate
                </Link>
                <a href={PHONE_HREF} className="px-2 py-2 text-center text-base font-bold" style={{ color: P.pine }}>
                  or call {PHONE_DISPLAY}
                </a>
              </div>
              <ul className="mt-8 flex flex-col gap-2 text-sm sm:flex-row sm:gap-6" style={{ color: P.inkSoft }}>
                {TRUST_POINTS.map(point => (
                  <li key={point} className="flex items-center gap-2">
                    <span aria-hidden="true" className="font-bold" style={{ color: P.pine }}>
                      ✓
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <ImagePlaceholder id="home-hero" />
          </Reveal>
        </div>
      </section>

      <QuickAnswerCards items={HOME_QUICK_ANSWERS} />
      <ServiceOverviewGrid />
      <EcoStatsBand full />

      {/* Values */}
      <section className="px-5 py-14 md:px-8 md:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_minmax(0,420px)]">
          <div>
            <Reveal>
              <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl" style={{ color: P.pine }}>
                Small company. High standards.
              </h2>
            </Reveal>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {[
                {
                  title: "Eco-responsible",
                  body: "Every load sorted and routed to the right facility — donation and recycling before landfill.",
                },
                {
                  title: "Respectful crews",
                  body: "Uniformed, careful in your home, and patient with every customer — seniors especially.",
                },
                {
                  title: "Upfront pricing",
                  body: "A firm number before we start, and the number doesn't move once you approve it.",
                },
              ].map((value, index) => (
                <Reveal key={value.title} delay={index * 0.08}>
                  <div>
                    <h3 className="font-display text-lg font-bold" style={{ color: P.ink }}>
                      {value.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: P.inkSoft }}>
                      {value.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
          <Reveal delay={0.1}>
            <ImagePlaceholder id="home-values" />
          </Reveal>
        </div>
      </section>

      <Testimonials tag="home" />
      <FaqAccordion items={HOME_FAQS} />
      <CtaBanner heading="Take back your space — junk, move, or fix-it list." />
    </SiteLayout>
  );
}
