import { TESTIMONIALS, type Testimonial } from "../content/testimonials";
import { PALETTE } from "../palette";
import { Reveal } from "./Reveal";

const P = PALETTE;

/** Real customer review cards, filtered by page tag — see testimonials.ts. */
export function Testimonials({ tag }: { tag: Testimonial["tags"][number] }) {
  const items = TESTIMONIALS.filter(t => t.tags.includes(tag)).slice(0, 3);
  if (items.length === 0) return null;

  return (
    <section className="px-5 py-14 md:px-8 md:py-20">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl" style={{ color: P.pine }}>
            What neighbors say
          </h2>
        </Reveal>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {items.map((item, index) => (
            <Reveal key={item.name} delay={index * 0.08}>
              <figure
                className="flex h-full flex-col justify-between rounded-2xl border p-6"
                style={{ borderColor: P.line, background: P.mist }}
              >
                <div>
                  <div
                    className="flex gap-0.5"
                    role="img"
                    aria-label={`${item.stars} out of 5 stars`}
                  >
                    {Array.from({ length: item.stars }, (_, starIndex) => (
                      <svg
                        key={starIndex}
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        style={{ color: P.pine }}
                      >
                        <path
                          fill="currentColor"
                          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                        />
                      </svg>
                    ))}
                  </div>
                  <blockquote className="mt-3 text-sm leading-relaxed" style={{ color: P.ink }}>
                    “{item.quote}”
                  </blockquote>
                </div>
                <figcaption className="mt-4 text-sm font-semibold" style={{ color: P.pine }}>
                  {item.name} <span style={{ color: P.inkSoft }}>· {item.area}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
