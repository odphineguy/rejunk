import { TESTIMONIALS, type Testimonial } from "../content/testimonials";
import { THUMBTACK_PROOF } from "../content/site";
import { PALETTE } from "../palette";
import { Reveal } from "./Reveal";

const P = PALETTE;

/** Real Thumbtack reviews presented as editorial proof rather than card tiles. */
export function Testimonials({ tag }: { tag: Testimonial["tags"][number] }) {
  const items = TESTIMONIALS.filter(testimonial =>
    testimonial.tags.includes(tag)
  ).slice(0, 3);
  if (items.length === 0) return null;

  return (
    <section
      className="px-5 py-16 md:px-8 md:py-24"
      style={{ background: P.pine, color: P.paper }}
    >
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div
            className="grid gap-7 border-b pb-8 md:grid-cols-[1fr_auto] md:items-end"
            style={{ borderColor: P.pineLine }}
          >
            <div>
              <h2 className="font-display max-w-xl text-4xl font-bold tracking-tight md:text-5xl">
                Five stars from people who hired us.
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-3 md:justify-end">
              <span className="bg-[#1aa67a] px-2.5 py-1 text-[0.66rem] font-extrabold uppercase tracking-[0.16em] text-white">
                {THUMBTACK_PROOF.badge}
              </span>
              <span
                className="font-bold"
                style={{ color: P.lime }}
                aria-label="5 out of 5 stars"
              >
                ★★★★★
              </span>
              <span className="text-sm" style={{ color: P.paperSoft }}>
                {THUMBTACK_PROOF.rating} · {THUMBTACK_PROOF.reviews} ·{" "}
                {THUMBTACK_PROOF.hires}
              </span>
            </div>
          </div>
        </Reveal>

        <div
          className={`grid ${items.length > 1 ? "md:grid-cols-3" : "max-w-3xl"}`}
        >
          {items.map((item, index) => (
            <Reveal
              key={`${item.name}-${item.quote}`}
              delay={index * 0.08}
              className="h-full"
            >
              <figure
                className={`flex h-full flex-col py-8 ${index < items.length - 1 ? "border-b md:border-b-0" : ""} ${items.length > 1 && index > 0 ? "md:border-l md:pl-10" : ""} ${items.length > 1 && index < items.length - 1 ? "md:pr-10" : ""}`}
                style={{ borderColor: P.pineLine }}
              >
                <span
                  className="text-sm tracking-[0.12em]"
                  style={{ color: P.lime }}
                  aria-hidden="true"
                >
                  ★★★★★
                </span>
                <blockquote className="mt-5 flex-1 text-lg leading-relaxed text-[#eef4ef]">
                  “{item.quote}”
                </blockquote>
                <figcaption className="mt-6">
                  <span className="font-bold text-[#f4f7f2]">{item.name}</span>
                  <span
                    className="mt-1 block text-sm"
                    style={{ color: P.paperSoft }}
                  >
                    {item.area}
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
