import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import type { Faq } from "../content/services";
import { PALETTE } from "../palette";
import { Reveal } from "./Reveal";

const P = PALETTE;

/**
 * FAQ section. First shadcn import into the marketing chunk (Radix accordion
 * + one lucide icon) — small and worth it for accessible expand/collapse.
 */
export function FaqAccordion({ items }: { items: Faq[] }) {
  return (
    <section className="px-5 py-14 md:px-8 md:py-20" style={{ background: P.mist }}>
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl" style={{ color: P.pine }}>
            Frequently asked questions
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <Accordion type="single" collapsible className="mt-6">
            {items.map(item => (
              <AccordionItem key={item.q} value={item.q} style={{ borderColor: P.line }}>
                <AccordionTrigger
                  className="text-left font-display text-base font-bold hover:no-underline"
                  style={{ color: P.ink }}
                >
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed" style={{ color: P.inkSoft }}>
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
