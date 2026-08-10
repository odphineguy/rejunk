import { CtaBanner } from "./components/CtaBanner";
import { FaqAccordion } from "./components/FaqAccordion";
import { ImagePlaceholder } from "./components/ImagePlaceholder";
import { PageHero } from "./components/PageHero";
import { QuickAnswerCards } from "./components/QuickAnswerCards";
import { Reveal } from "./components/Reveal";
import { ServiceOverviewGrid } from "./components/ServiceOverviewGrid";
import { Testimonials } from "./components/Testimonials";
import type { Faq, QuickAnswer } from "./content/services";
import { PAGE_META } from "./content/site";
import { SiteLayout } from "./layout/SiteLayout";
import { usePageMeta } from "./lib/usePageMeta";
import { PALETTE } from "./palette";

const P = PALETTE;

const HOME_QUICK_ANSWERS: QuickAnswer[] = [
  {
    title: "How much does it cost?",
    body: "Junk is priced by truck space, moving by crew and hours, assembly by flat rates. Every job gets a firm number before we start.",
  },
  {
    title: "What do you handle?",
    body: "Junk removal, local moving and delivery, and furniture assembly — one crew can handle the whole list.",
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
    a: "Use the online estimate form. For junk removal, you can upload photos for an instant ballpark estimate. We respond with a clear quote, usually within the hour during business hours.",
  },
  {
    q: "Are you licensed and insured?",
    a: "Yes. Progressive Transportation Services LLC (USDOT 4421119, MC-1763629) is fully licensed and insured.",
  },
  {
    q: "What happens to the items you haul?",
    a: "We sort each load and route usable or recyclable items to the appropriate local facility whenever possible.",
  },
];

export default function HomePage() {
  usePageMeta(PAGE_META.home);

  return (
    <SiteLayout>
      <PageHero
        title="The heavy lifting, handled."
        body="Clear a garage, move across town, or get the furniture built. One local crew, straightforward pricing, and work that feels finished when we leave."
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
