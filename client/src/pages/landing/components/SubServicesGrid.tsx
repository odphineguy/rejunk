import type { SubService } from "../content/services";
import { PALETTE } from "../palette";
import { Reveal } from "./Reveal";

const P = PALETTE;

/** "Popular jobs" card grid on each service page. */
export function SubServicesGrid({
  title,
  items,
}: {
  title: string;
  items: SubService[];
}) {
  return (
    <section
      className="px-5 py-14 md:px-8 md:py-20"
      style={{ background: P.mist }}
    >
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2
            className="font-display text-3xl font-bold tracking-tight md:text-4xl"
            style={{ color: P.pine }}
          >
            {title}
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-x-12 sm:grid-cols-2">
          {items.map((item, index) => (
            <Reveal key={item.title} delay={(index % 2) * 0.06}>
              <div
                className="group grid h-full grid-cols-[1fr_auto] gap-5 border-t py-6"
                style={{ borderColor: P.line }}
              >
                <div>
                  <h3
                    className="font-display text-xl font-bold"
                    style={{ color: P.ink }}
                  >
                    {item.title}
                  </h3>
                  <p
                    className="mt-2 max-w-md text-sm leading-relaxed"
                    style={{ color: P.inkSoft }}
                  >
                    {item.blurb}
                  </p>
                </div>
                <span
                  className="pt-1 text-xl transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                  style={{ color: P.pine }}
                >
                  →
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
