import type { ProcessStep } from "../content/services";
import { PALETTE } from "../palette";
import { Reveal } from "./Reveal";

const P = PALETTE;

const DEFAULT_STEPS: ProcessStep[] = [
  {
    title: "Tell us what you need",
    body: "Use the online quote form and include any details that help us understand the job.",
  },
  {
    title: "Get a fast, firm quote",
    body: "We review your request and confirm a clear price. The price you approve is the price you pay.",
  },
  {
    title: "We show up and handle it",
    body: "On time, in uniform, and careful with your home. We finish the job before we call it done.",
  },
];

/** Numbered three-step band shared by the service pages. */
export function HowItWorks({
  heading = "One conversation. One clear plan.",
  steps = DEFAULT_STEPS,
}: {
  heading?: string;
  steps?: ProcessStep[];
}) {
  return (
    <section className="px-5 py-14 md:px-8 md:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
        <Reveal>
          <div>
            <h2
              className="font-display max-w-sm text-4xl font-bold tracking-tight md:text-5xl"
              style={{ color: P.pine }}
            >
              {heading}
            </h2>
          </div>
        </Reveal>
        <div className="flex flex-col">
          {steps.map((step, index) => (
            <Reveal key={step.title} delay={index * 0.08}>
              <article
                className="border-t py-6"
                style={{ borderColor: P.line }}
              >
                <div>
                  <h3
                    className="font-display text-xl font-bold"
                    style={{ color: P.ink }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="mt-2 max-w-lg text-[0.95rem] leading-relaxed"
                    style={{ color: P.inkSoft }}
                  >
                    {step.body}
                  </p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
