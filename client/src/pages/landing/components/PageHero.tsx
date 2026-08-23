import { Link } from "wouter";

import type { ImageBriefId } from "../content/imageBriefs";
import { IMAGE_BRIEFS } from "../content/imageBriefs";
import { bookingUrl, THUMBTACK_PROOF } from "../content/site";
import { Reveal } from "./Reveal";

interface PageHeroProps {
  title: string;
  body: string;
  imageId: ImageBriefId;
  flipImage?: boolean;
  photoEstimate?: boolean;
  pianoQuote?: boolean;
}

function ArrowGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 18 18 6M9 6h9v9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Full-bleed, proof-led marketing hero shared by the home and service pages. */
export function PageHero({
  title,
  body,
  imageId,
  flipImage = false,
  photoEstimate = false,
  pianoQuote = false,
}: PageHeroProps) {
  const image = IMAGE_BRIEFS[imageId];

  return (
    <section className="relative isolate flex min-h-[660px] items-end overflow-hidden bg-[#052a2b] lg:min-h-[740px]">
      {image.src && (
        <img
          src={image.src}
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          className="absolute inset-0 -z-30 h-full w-full object-cover object-center"
          style={{ transform: flipImage ? "scaleX(-1)" : undefined }}
          onError={event => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(90deg, rgba(3,25,26,.70) 0%, rgba(3,25,26,.58) 32%, rgba(3,25,26,.28) 60%, rgba(3,25,26,.06) 88%)",
        }}
      />
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(0deg, rgba(3,25,26,.62) 0%, rgba(3,25,26,.18) 28%, transparent 52%)",
        }}
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 pb-9 pt-24 md:px-8 md:pb-10 lg:gap-16 lg:pb-12">
        <Reveal>
          <div className="max-w-[710px]">
            <h1
              className="max-w-[13ch] font-bold leading-[0.94] tracking-[-0.035em] text-[#f4f7f2]"
              style={{ fontSize: "clamp(3.6rem, 8vw, 7.5rem)" }}
            >
              {title}
            </h1>
            <p className="mt-6 max-w-[620px] text-[1.05rem] leading-relaxed text-[#d6e2db] md:text-xl">
              {body}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {photoEstimate ? (
                <Link
                  href="/instant-estimate"
                  className="group inline-flex min-h-14 items-stretch overflow-hidden rounded-[0.4rem] bg-[#83e282] font-bold text-[#052a2b] shadow-[0_14px_34px_rgba(0,0,0,.24)] transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#83e282]"
                >
                  <span className="flex items-center px-6">
                    Get a photo estimate
                  </span>
                  <span className="flex w-14 items-center justify-center border-l border-[#052a2b]/15 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                    <ArrowGlyph />
                  </span>
                </Link>
              ) : pianoQuote ? (
                <Link
                  href="/estimate?service=piano"
                  className="group inline-flex min-h-14 items-stretch overflow-hidden rounded-[0.4rem] bg-[#83e282] font-bold text-[#052a2b] shadow-[0_14px_34px_rgba(0,0,0,.24)] transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#83e282]"
                >
                  <span className="flex items-center px-6">
                    Request a piano quote
                  </span>
                  <span className="flex w-14 items-center justify-center border-l border-[#052a2b]/15 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                    <ArrowGlyph />
                  </span>
                </Link>
              ) : (
                <a
                  href={bookingUrl("hero")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex min-h-14 items-stretch overflow-hidden rounded-[0.4rem] bg-[#83e282] font-bold text-[#052a2b] shadow-[0_14px_34px_rgba(0,0,0,.24)] transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#83e282]"
                >
                  <span className="flex items-center px-6">
                    Book your service
                  </span>
                  <span className="flex w-14 items-center justify-center border-l border-[#052a2b]/15 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                    <ArrowGlyph />
                  </span>
                </a>
              )}
              {photoEstimate ? (
                <a
                  href={bookingUrl("hero-junk-removal")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-14 items-center justify-center rounded-[0.4rem] border border-[#edf5ee]/35 bg-[#052a2b]/30 px-6 font-bold text-[#f4f7f2] transition-colors hover:border-[#edf5ee]/70 hover:bg-[#052a2b]/55"
                >
                  Book junk removal
                </a>
              ) : pianoQuote ? (
                <a
                  href={bookingUrl("hero-piano")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-14 items-center justify-center rounded-[0.4rem] border border-[#edf5ee]/35 bg-[#052a2b]/30 px-6 font-bold text-[#f4f7f2] transition-colors hover:border-[#edf5ee]/70 hover:bg-[#052a2b]/55"
                >
                  Book online
                </a>
              ) : (
                <Link
                  href="/estimate"
                  className="inline-flex min-h-14 items-center justify-center rounded-[0.4rem] border border-[#edf5ee]/35 bg-[#052a2b]/30 px-6 font-bold text-[#f4f7f2] transition-colors hover:border-[#edf5ee]/70 hover:bg-[#052a2b]/55"
                >
                  Request a quote
                </Link>
              )}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#edf5ee]/25 pt-5 text-sm text-[#edf5ee]">
            <span className="bg-[#1aa67a] px-2.5 py-1 text-[0.66rem] font-extrabold uppercase tracking-[0.16em] text-white">
              {THUMBTACK_PROOF.badge}
            </span>
            <span
              className="font-bold text-[#83e282]"
              aria-label="5 out of 5 stars"
            >
              ★★★★★
            </span>
            <span>{THUMBTACK_PROOF.rating} on Thumbtack</span>
            <span
              className="hidden h-4 w-px bg-[#edf5ee]/30 sm:block"
              aria-hidden="true"
            />
            <span>{THUMBTACK_PROOF.hires}</span>
            <span
              className="hidden h-4 w-px bg-[#edf5ee]/30 sm:block"
              aria-hidden="true"
            />
            <span>Licensed &amp; insured</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
