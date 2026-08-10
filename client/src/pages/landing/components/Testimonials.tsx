import { TESTIMONIALS, type Testimonial } from "../content/testimonials";
import { PALETTE } from "../palette";
import { Reveal } from "./Reveal";
import { ThumbtackReviewWidget } from "./ThumbtackReviewWidget";

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
            <div className="justify-self-start md:justify-self-end">
              <ThumbtackReviewWidget type="star" />
            </div>
          </div>
        </Reveal>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
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
                    <span className="font-bold text-[#f4f7f2]">
                      {item.name}
                    </span>
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

          <Reveal delay={0.18}>
            <div
              className="flex items-start justify-center border-t pt-8 lg:justify-end lg:border-t-0 lg:border-l lg:pt-8 lg:pl-10"
              style={{ borderColor: P.pineLine }}
            >
              <ThumbtackReviewWidget type="one" />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
