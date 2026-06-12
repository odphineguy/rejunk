import type { QuickAnswer } from "../content/services";
import { PALETTE } from "../palette";
import { Reveal } from "./Reveal";

const P = PALETTE;

/** The "cost? / what? / how soon?" answer strip that sits under each hero. */
export function QuickAnswerCards({ items }: { items: QuickAnswer[] }) {
  return (
    <section className="px-5 py-12 md:px-8 md:py-16" style={{ background: P.mist }}>
      <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
        {items.map((item, index) => (
          <Reveal key={item.title} delay={index * 0.08}>
            <div
              className="h-full rounded-2xl border bg-white p-6"
              style={{ borderColor: P.line }}
            >
              <h3 className="font-display text-lg font-bold" style={{ color: P.pine }}>
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: P.inkSoft }}>
                {item.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
