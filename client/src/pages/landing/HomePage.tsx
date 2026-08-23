import { CtaBanner } from "./components/CtaBanner";
import { FaqAccordion } from "./components/FaqAccordion";
import { ImagePlaceholder } from "./components/ImagePlaceholder";
import { PageHero } from "./components/PageHero";
import { QuickAnswerCards } from "./components/QuickAnswerCards";
import { Reveal } from "./components/Reveal";
import { ServiceOverviewGrid } from "./components/ServiceOverviewGrid";
import { Testimonials } from "./components/Testimonials";
import { HOME_FAQS, HOME_QUICK_ANSWERS } from "./content/home";
import { PAGE_META } from "./content/site";
import { SiteLayout } from "./layout/SiteLayout";
import { usePageMeta } from "./lib/usePageMeta";
import { PALETTE } from "./palette";

const P = PALETTE;

export default function HomePage() {
  usePageMeta(PAGE_META.home);

  return (
    <SiteLayout>
      <PageHero
        title="The heavy lifting, handled."
        body="Clear a garage, move across town, transport a piano, or get the furniture built. One careful crew, straightforward pricing, and work that feels finished when we leave."
        imageId="home-hero"
      />

      <QuickAnswerCards items={HOME_QUICK_ANSWERS} />
      <ServiceOverviewGrid />
      {/* Values */}
      <section className="px-5 py-14 md:px-8 md:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_minmax(0,420px)]">
          <div>
            <Reveal>
              <h2
                className="font-display text-3xl font-bold tracking-tight md:text-4xl"
                style={{ color: P.pine }}
              >
                Straight answers. Careful work.
              </h2>
            </Reveal>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {[
                {
                  title: "Your price, upfront",
                  body: "You approve a clear number before work begins. If the scope stays the same, the price does too.",
                },
                {
                  title: "Respectful crews",
                  body: "Uniformed, careful in your home, and patient with every customer — seniors especially.",
                },
                {
                  title: "A clean finish",
                  body: "We place, load, or assemble the job completely, then leave the work area ready to use.",
                },
              ].map((value, index) => (
                <Reveal key={value.title} delay={index * 0.08}>
                  <div>
                    <h3
                      className="font-display text-lg font-bold"
                      style={{ color: P.ink }}
                    >
                      {value.title}
                    </h3>
                    <p
                      className="mt-2 text-sm leading-relaxed"
                      style={{ color: P.inkSoft }}
                    >
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
      <CtaBanner
        heading="Ready to get it off your list?"
        imageId="home-values"
      />
    </SiteLayout>
  );
}
