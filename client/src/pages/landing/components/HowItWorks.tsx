import { PALETTE } from "../palette";
import { Reveal } from "./Reveal";

const P = PALETTE;

const STEPS = [
  {
    title: "Tell us what you need",
    body: "Call, text a photo, or use the estimate form — whatever's easiest.",
  },
  {
    title: "Get a fast, firm quote",
    body: "We quote by call or text, usually within the hour. The price you approve is the price you pay.",
  },
  {
    title: "We show up and handle it",
    body: "On time, in uniform, done carefully — and everything routed to the right facility.",
  },
];

/** Numbered three-step band shared by the service pages. */
export function HowItWorks() {
  return (
    <section className="px-5 py-14 md:px-8 md:py-20">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl" style={{ color: P.pine }}>
            How it works
          </h2>
        </Reveal>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <Reveal key={step.title} delay={index * 0.08}>
              <li className="flex h-full flex-col rounded-2xl border p-6" style={{ borderColor: P.line }}>
                <span
                  className="font-display flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold"
                  style={{ background: P.lime, color: P.pine }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <h3 className="font-display mt-4 text-lg font-bold" style={{ color: P.ink }}>
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: P.inkSoft }}>
                  {step.body}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
