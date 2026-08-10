import { Link } from "wouter";

import type { ImageBriefId } from "../content/imageBriefs";
import { IMAGE_BRIEFS } from "../content/imageBriefs";
import { BOOKING_URL } from "../content/site";
import { Reveal } from "./Reveal";

/** Photo-led closing action shared by the home and service pages. */
export function CtaBanner({
  heading = "Ready to get it handled?",
  imageId,
  flipImage = false,
  photoEstimate = false,
}: {
  heading?: string;
  imageId: ImageBriefId;
  flipImage?: boolean;
  photoEstimate?: boolean;
}) {
  const image = IMAGE_BRIEFS[imageId];

  return (
    <section className="relative isolate flex min-h-[520px] items-end overflow-hidden bg-[#052a2b]">
      {image.src && (
        <img
          src={image.src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
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
            "linear-gradient(90deg, rgba(3,25,26,.94) 0%, rgba(3,25,26,.72) 48%, rgba(3,25,26,.26) 100%), linear-gradient(0deg, rgba(3,25,26,.72), transparent 52%)",
        }}
      />

      <div className="mx-auto w-full max-w-6xl px-5 py-14 md:px-8 md:py-20">
        <Reveal>
          <div className="max-w-3xl">
            <h2
              className="max-w-[13ch] font-bold leading-[0.98] tracking-[-0.03em] text-[#f4f7f2]"
              style={{ fontSize: "clamp(3rem, 6vw, 5.75rem)" }}
            >
              {heading}
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#d6e2db]">
              Choose a time online or send us the job details. We’ll confirm
              everything before the crew heads your way.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={photoEstimate ? "/instant-estimate" : BOOKING_URL}
                target={photoEstimate ? undefined : "_blank"}
                rel={photoEstimate ? undefined : "noopener noreferrer"}
                className="group inline-flex min-h-14 items-stretch overflow-hidden rounded-[0.4rem] bg-[#83e282] font-bold text-[#052a2b] shadow-[0_14px_34px_rgba(0,0,0,.24)] transition-transform duration-300 hover:-translate-y-0.5"
              >
                <span className="flex items-center px-6">
                  {photoEstimate ? "Get a photo estimate" : "Book online"}
                </span>
                <span
                  className="flex w-14 items-center justify-center border-l border-[#052a2b]/15 text-lg transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden="true"
                >
                  ↗
                </span>
              </Link>
              {photoEstimate ? (
                <a
                  href={BOOKING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-14 items-center justify-center rounded-[0.4rem] border border-[#edf5ee]/35 bg-[#052a2b]/35 px-6 font-bold text-[#f4f7f2] transition-colors hover:border-[#edf5ee]/70"
                >
                  Book junk removal
                </a>
              ) : (
                <Link
                  href="/estimate"
                  className="inline-flex min-h-14 items-center justify-center rounded-[0.4rem] border border-[#edf5ee]/35 bg-[#052a2b]/35 px-6 font-bold text-[#f4f7f2] transition-colors hover:border-[#edf5ee]/70"
                >
                  Request a quote
                </Link>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
