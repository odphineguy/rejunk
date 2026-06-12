import { Link } from "wouter";

import type { ImageBriefId } from "../content/imageBriefs";
import { PALETTE } from "../palette";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { Reveal } from "./Reveal";

const P = PALETTE;

const OVERVIEW: Array<{
  title: string;
  blurb: string;
  href: string;
  imageId: ImageBriefId;
}> = [
  {
    title: "Junk Removal",
    blurb: "Full cleanouts or single items, hauled off the same day — and routed to donation and recycling first.",
    href: "/junk-removal",
    imageId: "home-svc-junk",
  },
  {
    title: "Moving & Delivery",
    blurb: "Local moves and big-item deliveries anywhere in the valley, padded and placed where you want them.",
    href: "/moving",
    imageId: "home-svc-moving",
  },
  {
    title: "Assembly & Handyman",
    blurb: "Furniture assembly, mounting, and small fixes — with patient, senior-friendly service as our specialty.",
    href: "/assembly-handyman",
    imageId: "home-svc-assembly",
  },
];

/** Homepage three-card services grid linking to the dedicated service pages. */
export function ServiceOverviewGrid() {
  return (
    <section className="px-5 py-14 md:px-8 md:py-20">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl" style={{ color: P.pine }}>
            Three crews' worth of help, one call
          </h2>
        </Reveal>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {OVERVIEW.map((service, index) => (
            <Reveal key={service.href} delay={index * 0.08}>
              <Link
                href={service.href}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-lg"
                style={{ borderColor: P.line }}
              >
                <ImagePlaceholder id={service.imageId} className="rounded-none border-0 border-b-2" />
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="font-display text-xl font-bold" style={{ color: P.ink }}>
                    {service.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed" style={{ color: P.inkSoft }}>
                    {service.blurb}
                  </p>
                  <span className="mt-4 text-sm font-bold group-hover:underline" style={{ color: P.pine }}>
                    Learn more →
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
