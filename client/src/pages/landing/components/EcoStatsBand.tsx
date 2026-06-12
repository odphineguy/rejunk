import { ECO_HEADING, ECO_PARAGRAPH, ECO_STATS } from "../content/site";
import { PALETTE } from "../palette";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { Reveal } from "./Reveal";

const P = PALETTE;

/**
 * The pine eco band — the one dark section per page and the Rejunk
 * differentiator (17 years in waste collection, facility-routed disposal).
 * `full` adds the story paragraph + photo; service pages use the short form.
 */
export function EcoStatsBand({ full = false }: { full?: boolean }) {
  return (
    <section className="px-5 py-14 md:px-8 md:py-20" style={{ background: P.pine, color: P.paper }}>
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: P.lime }}>
            Eco-friendly by experience
          </p>
          <h2 className="font-display mt-3 max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">
            {ECO_HEADING}
          </h2>
        </Reveal>

        <div className={`mt-10 grid gap-10 ${full ? "lg:grid-cols-2" : ""}`}>
          <div className="grid gap-6 sm:grid-cols-3">
            {ECO_STATS.map((stat, index) => (
              <Reveal key={stat.label} delay={index * 0.08}>
                <div>
                  <p className="font-display text-5xl font-bold leading-none" style={{ color: P.lime }}>
                    {stat.value}
                  </p>
                  <p className="font-display mt-1 text-sm font-semibold uppercase tracking-wider">
                    {stat.unit}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: P.paperSoft }}>
                    {stat.label}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          {full && (
            <Reveal delay={0.1}>
              <div className="flex flex-col gap-6">
                <p className="text-base leading-relaxed" style={{ color: P.paperSoft }}>
                  {ECO_PARAGRAPH}
                </p>
                <ImagePlaceholder id="home-eco" />
              </div>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}
