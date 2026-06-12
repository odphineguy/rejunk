import { Link } from "wouter";

import { CtaBanner } from "./components/CtaBanner";
import { EcoStatsBand } from "./components/EcoStatsBand";
import { FaqAccordion } from "./components/FaqAccordion";
import { HowItWorks } from "./components/HowItWorks";
import { ImagePlaceholder } from "./components/ImagePlaceholder";
import { QuickAnswerCards } from "./components/QuickAnswerCards";
import { Reveal } from "./components/Reveal";
import { SubServicesGrid } from "./components/SubServicesGrid";
import { Testimonials } from "./components/Testimonials";
import { SERVICES, type ServiceContent } from "./content/services";
import { PAGE_META, PHONE_DISPLAY, PHONE_HREF } from "./content/site";
import { SiteLayout } from "./layout/SiteLayout";
import { usePageMeta } from "./lib/usePageMeta";
import { PALETTE } from "./palette";

const P = PALETTE;

/** One template renders all three lines of business off content/services.ts. */
export default function ServicePage({ slug }: { slug: ServiceContent["slug"] }) {
  const service = SERVICES[slug];
  usePageMeta(PAGE_META[service.metaKey]);

  return (
    <SiteLayout>
      {/* Hero */}
      <section className="px-5 pb-14 pt-10 md:px-8 md:pb-20 md:pt-16">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: P.pine }}>
                {service.heroKicker}
              </p>
              <h1
                className="font-display mt-4 text-4xl font-bold leading-[1.08] tracking-tight md:text-6xl"
                style={{ color: P.pine }}
              >
                {service.heroTitle}
              </h1>
              <p className="mt-5 max-w-xl text-base md:text-lg" style={{ color: P.inkSoft }}>
                {service.heroSub}
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
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <ImagePlaceholder id={service.heroImageId} />
          </Reveal>
        </div>
      </section>

      <QuickAnswerCards items={service.quickAnswers} />
      <HowItWorks />
      <SubServicesGrid title={service.subServicesTitle} items={service.subServices} />

      {/* Page-specific story section: seniors on Assembly, deep-eco on Junk. */}
      {service.extra && (
        <section className="px-5 py-14 md:px-8 md:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
            <Reveal>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: P.pine }}>
                  {service.extra.kicker}
                </p>
                <h2
                  className="font-display mt-3 text-3xl font-bold tracking-tight md:text-4xl"
                  style={{ color: P.pine }}
                >
                  {service.extra.title}
                </h2>
                {service.extra.paragraphs.map(paragraph => (
                  <p
                    key={paragraph.slice(0, 32)}
                    className={`mt-4 leading-relaxed ${service.extra?.largeType ? "text-lg" : "text-base"}`}
                    style={{ color: P.inkSoft }}
                  >
                    {paragraph}
                  </p>
                ))}
                {service.extra.bullets && (
                  <ul className={`mt-5 flex flex-col gap-2.5 ${service.extra.largeType ? "text-lg" : "text-base"}`}>
                    {service.extra.bullets.map(bullet => (
                      <li key={bullet} className="flex items-start gap-3" style={{ color: P.ink }}>
                        <span aria-hidden="true" className="mt-0.5 font-bold" style={{ color: P.pine }}>
                          ✓
                        </span>
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <ImagePlaceholder id={service.extra.imageId} />
            </Reveal>
          </div>
        </section>
      )}

      <EcoStatsBand />
      <Testimonials tag={service.metaKey} />
      <FaqAccordion items={service.faqs} />
      <CtaBanner heading={`Ready for ${service.name.toLowerCase()} done right?`} />
    </SiteLayout>
  );
}
