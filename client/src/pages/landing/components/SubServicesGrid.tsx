import type { SubService } from "../content/services";
import { PALETTE } from "../palette";
import { Reveal } from "./Reveal";

const P = PALETTE;

/** "Popular jobs" card grid on each service page. */
export function SubServicesGrid({ title, items }: { title: string; items: SubService[] }) {
  return (
    <section className="px-5 py-14 md:px-8 md:py-20" style={{ background: P.mist }}>
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl" style={{ color: P.pine }}>
            {title}
          </h2>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, index) => (
            <Reveal key={item.title} delay={(index % 4) * 0.06}>
              <div className="h-full rounded-2xl border bg-white p-5" style={{ borderColor: P.line }}>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ background: P.limeSoft, color: P.pine }}
                  aria-hidden="true"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <h3 className="font-display mt-3 text-base font-bold" style={{ color: P.ink }}>
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: P.inkSoft }}>
                  {item.blurb}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
