import { TESTIMONIALS, type Testimonial } from "../content/testimonials";
import { PALETTE } from "../palette";
import { Reveal } from "./Reveal";

const P = PALETTE;

/** Quote cards, filtered by page tag. Content is placeholder — see testimonials.ts. */
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
                <blockquote className="text-sm leading-relaxed" style={{ color: P.ink }}>
                  “{item.quote}”
                </blockquote>
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
