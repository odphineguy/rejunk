import { PALETTE } from "./palette";

/**
 * Three flat service cards under the hero. Icons are simple geometric inline
 * SVGs matching the garage-scene art style — no icon library in this bundle.
 */

const P = PALETTE;

function JunkIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      {/* trash bin with a lifted lid */}
      <rect x="10" y="14" width="24" height="24" rx="3" fill={P.pine} />
      <line x1="17" y1="20" x2="17" y2="32" stroke={P.lime} strokeWidth="3" strokeLinecap="round" />
      <line x1="27" y1="20" x2="27" y2="32" stroke={P.lime} strokeWidth="3" strokeLinecap="round" />
      <rect x="7" y="8" width="30" height="5" rx="2.5" fill={P.terracotta} transform="rotate(-7 22 10)" />
    </svg>
  );
}

function MovingIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      {/* little box truck */}
      <rect x="4" y="12" width="22" height="18" rx="2" fill={P.pine} />
      <path d="M26 18 L34 18 L38 24 L38 30 L26 30 Z" fill={P.moss} />
      <circle cx="12" cy="32" r="4" fill={P.charcoal} />
      <circle cx="32" cy="32" r="4" fill={P.charcoal} />
      <rect x="8" y="17" width="9" height="6" rx="1" fill={P.lime} />
    </svg>
  );
}

function AssemblyIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      {/* wrench over a bolt */}
      <circle cx="16" cy="28" r="7" fill={P.amber} />
      <circle cx="16" cy="28" r="3" fill={P.sand} />
      <path d="M24 26 L34 12" stroke={P.pine} strokeWidth="6" strokeLinecap="round" />
      <path d="M30 7 L39 9 L37 16" fill="none" stroke={P.pine} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const SERVICES = [
  {
    title: "Junk Removal",
    blurb: "Full cleanouts or single items, hauled off and gone the same day.",
    icon: <JunkIcon />,
  },
  {
    title: "Moving & Delivery",
    blurb: "Local moves and big-item deliveries anywhere in the valley.",
    icon: <MovingIcon />,
  },
  {
    title: "Assembly & Handyman",
    blurb: "Furniture assembly, mounting, and the small fixes done right.",
    icon: <AssemblyIcon />,
  },
];

export function ServicesStrip() {
  return (
    <section className="px-6 py-16 md:py-24" style={{ background: P.sand }}>
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
        {SERVICES.map(service => (
          <div
            key={service.title}
            className="rounded-2xl border p-7"
            style={{ background: P.sky, borderColor: P.sandDeep }}
          >
            {service.icon}
            <h2 className="font-display mt-4 text-xl font-bold" style={{ color: P.pine }}>
              {service.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: P.inkSoft }}>
              {service.blurb}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
