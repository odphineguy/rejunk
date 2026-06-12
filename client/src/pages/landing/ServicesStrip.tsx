import { PALETTE } from "./palette";

/**
 * Three text-only service cards under the hero. Deliberately no icons or
 * illustrations — numbered, typography-led cards on raised pine surfaces.
 */

const P = PALETTE;

const SERVICES = [
  {
    title: "Junk Removal",
    blurb: "Full cleanouts or single items, hauled off and gone the same day.",
  },
  {
    title: "Moving & Delivery",
    blurb: "Local moves and big-item deliveries anywhere in the valley.",
  },
  {
    title: "Assembly & Handyman",
    blurb: "Furniture assembly, mounting, and the small fixes done right.",
  },
];

export function ServicesStrip() {
  return (
    <section className="px-6 pb-20 md:pb-28">
      <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
        {SERVICES.map((service, index) => (
          <div
            key={service.title}
            className="rounded-2xl border p-7"
            style={{ background: P.pineRaised, borderColor: P.pineLine }}
          >
            <span className="font-display text-sm font-semibold" style={{ color: P.lime }}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <h2 className="font-display mt-3 text-xl font-bold" style={{ color: P.paper }}>
              {service.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: P.paperSoft }}>
              {service.blurb}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
