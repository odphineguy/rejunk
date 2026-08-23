import { CtaBanner } from "./components/CtaBanner";
import { FaqAccordion } from "./components/FaqAccordion";
import { HowItWorks } from "./components/HowItWorks";
import { ImagePlaceholder } from "./components/ImagePlaceholder";
import { PageHero } from "./components/PageHero";
import { QuickAnswerCards } from "./components/QuickAnswerCards";
import { Reveal } from "./components/Reveal";
import { SubServicesGrid } from "./components/SubServicesGrid";
import { Testimonials } from "./components/Testimonials";
import { SERVICES, type ServiceContent } from "./content/services";
import { PAGE_META } from "./content/site";
import { SiteLayout } from "./layout/SiteLayout";
import { usePageMeta } from "./lib/usePageMeta";
import { PALETTE } from "./palette";

const P = PALETTE;

/** One template renders all three lines of business off content/services.ts. */
export default function ServicePage({
  slug,
}: {
  slug: ServiceContent["slug"];
}) {
  const service = SERVICES[slug];
  usePageMeta(PAGE_META[service.metaKey]);

  return (
    <SiteLayout>
      <PageHero
        title={service.heroTitle}
        body={service.heroSub}
        imageId={service.heroImageId}
        flipImage={slug === "assembly-handyman"}
        photoEstimate={slug === "junk-removal"}
        pianoQuote={slug === "piano-moving"}
      />

      <QuickAnswerCards items={service.quickAnswers} />
      <HowItWorks
        heading={service.process?.heading}
        steps={service.process?.steps}
      />
      <SubServicesGrid
        title={service.subServicesTitle}
        items={service.subServices}
      />

      {/* Page-specific story section: senior-friendly assembly service. */}
      {service.extra && (
        <section className="px-5 py-14 md:px-8 md:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
            <Reveal>
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-[0.25em]"
                  style={{ color: P.pine }}
                >
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
                  <ul
                    className={`mt-5 flex flex-col ${service.extra.largeType ? "text-lg" : "text-base"}`}
                  >
                    {service.extra.bullets.map(bullet => (
                      <li
                        key={bullet}
                        className="border-t py-3"
                        style={{ color: P.ink, borderColor: P.line }}
                      >
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

      <Testimonials tag={service.metaKey} />
      <FaqAccordion items={service.faqs} />
      <CtaBanner
        heading={
          slug === "junk-removal"
            ? "Ready to clear it out?"
            : slug === "moving"
              ? "Ready for a smoother move?"
              : slug === "piano-moving"
                ? "Tell us about your piano."
                : "Ready to skip the instruction manual?"
        }
        imageId={service.heroImageId}
        flipImage={slug === "assembly-handyman"}
        photoEstimate={slug === "junk-removal"}
        pianoQuote={slug === "piano-moving"}
      />
    </SiteLayout>
  );
}
