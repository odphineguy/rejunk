import type { QuickAnswer } from "../content/services";
import { PALETTE } from "../palette";
import { Reveal } from "./Reveal";

const P = PALETTE;

/** The "cost? / what? / how soon?" answer strip that sits under each hero. */
export function QuickAnswerCards({ items }: { items: QuickAnswer[] }) {
  return (
    <section
      className="px-5 py-14 md:px-8 md:py-20"
      style={{ background: P.mist }}
    >
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-3 md:gap-0">
        {items.map((item, index) => (
          <Reveal key={item.title} delay={index * 0.08}>
            <div
              className={`h-full border-t-2 pt-5 md:px-7 ${index === 0 ? "md:pl-0" : ""} ${index === items.length - 1 ? "md:pr-0" : ""}`}
              style={{ borderColor: index === 0 ? P.lime : P.line }}
            >
              <h3
                className="font-display text-xl font-bold"
                style={{ color: P.pine }}
              >
                {item.title}
              </h3>
              <p
                className="mt-3 max-w-sm text-[0.95rem] leading-relaxed"
                style={{ color: P.inkSoft }}
              >
                {item.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
