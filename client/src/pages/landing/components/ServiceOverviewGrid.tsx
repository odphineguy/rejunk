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
    blurb:
      "Full cleanouts or single items, hauled off the same day — and routed to donation and recycling first.",
    href: "/junk-removal",
    imageId: "home-tile-junk",
  },
  {
    title: "Moving & Delivery",
    blurb:
      "Local moves and big-item deliveries anywhere in the valley, padded and placed where you want them.",
    href: "/moving",
    imageId: "home-tile-moving",
  },
  {
    title: "Pallet Delivery",
    blurb:
      "Tile, flooring, building materials, and oversized purchases picked up by box truck and unloaded by liftgate.",
    href: "/pallet-delivery",
    imageId: "pallet-delivery-hero",
  },
  {
    title: "Piano Moving",
    blurb:
      "Spinets, uprights, baby grands, and grands moved anywhere within Arizona by a licensed and insured crew.",
    href: "/piano-moving",
    imageId: "home-tile-piano",
  },
  {
    title: "Assembly",
    blurb:
      "Furniture, shelving, bed frames, patio sets, and more — built carefully and ready to use.",
    href: "/assembly-handyman",
    imageId: "home-tile-assembly",
  },
];

/** Homepage service grid linking to the dedicated service pages. */
export function ServiceOverviewGrid() {
  return (
    <section className="px-5 py-14 md:px-8 md:py-20">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2
            className="font-display max-w-2xl text-4xl font-bold tracking-tight md:text-5xl"
            style={{ color: P.pine }}
          >
            One local crew for the jobs that take muscle and patience.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {OVERVIEW.map((service, index) => (
            <Reveal key={service.href} delay={index * 0.08} className="h-full">
              <Link
                href={service.href}
                className="group relative flex h-full min-h-[420px] overflow-hidden rounded-[0.65rem]"
              >
                <ImagePlaceholder
                  id={service.imageId}
                  className="absolute inset-0 h-full rounded-none border-0 transition-transform duration-700 group-hover:scale-[1.03]"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(0deg, rgba(3,25,26,.9) 0%, rgba(3,25,26,.12) 72%)",
                  }}
                />
                <div className="relative mt-auto flex w-full flex-col p-6 text-[#f4f7f2] md:p-7">
                  <h3 className="font-display text-3xl font-bold">
                    {service.title}
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#d2e0d8]">
                    {service.blurb}
                  </p>
                  <span className="mt-5 text-sm font-bold text-[#83e282]">
                    Explore service{" "}
                    <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">
                      →
                    </span>
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
