import { useState } from "react";
import { Link, useLocation } from "wouter";

import { BOOKING_URL, NAV_ITEMS } from "../content/site";
import { PALETTE } from "../palette";

const P = PALETTE;

/**
 * Sticky white marketing header: logo, service-line nav, and one booking CTA.
 * Mobile gets a simple disclosure menu (no shadcn Sheet — keeps
 * the chunk light). The staff entrance lives in the footer.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  return (
    <header
      className="sticky top-0 z-40 border-b bg-[#f8faf7]/95 backdrop-blur"
      style={{ borderColor: P.line }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 md:px-8">
        <Link
          href="/"
          aria-label="Progressive Transportation Services home"
          onClick={() => setOpen(false)}
        >
          {/* progressive-logo.png: cropped wordmark (swoosh + road underline) on white,
              for the white marketing header. */}
          <img
            src="/progressive-logo.png"
            alt="Progressive Transportation Services"
            className="h-12 w-auto md:h-14"
          />
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-semibold transition-opacity hover:opacity-70"
              style={{
                color: P.ink,
                textDecoration: location === item.href ? "underline" : "none",
                textDecorationColor: P.lime,
                textDecorationThickness: 3,
                textUnderlineOffset: 6,
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={BOOKING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex min-h-11 items-stretch overflow-hidden rounded-[0.35rem] text-sm font-bold shadow-sm transition-transform hover:-translate-y-0.5"
            style={{ background: P.lime, color: P.pine }}
          >
            <span className="flex items-center px-4">Book online</span>
            <span
              className="hidden w-10 items-center justify-center border-l border-[#052a2b]/15 transition-transform group-hover:translate-x-0.5 sm:flex"
              aria-hidden="true"
            >
              ↗
            </span>
          </a>
          <button
            type="button"
            className="rounded-lg border p-2 md:hidden"
            style={{ borderColor: P.line, color: P.ink }}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen(value => !value)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              {open ? (
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav
          className="border-t px-5 py-4 md:hidden"
          style={{ background: P.paperBg, borderColor: P.line }}
          aria-label="Main mobile"
        >
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map(item => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-lg px-3 py-3 text-base font-semibold"
                  style={{ color: P.ink }}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={BOOKING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center justify-between rounded-[0.35rem] px-4 py-3 text-base font-bold"
                style={{ background: P.lime, color: P.pine }}
              >
                <span>Book online</span>
                <span aria-hidden="true">↗</span>
              </a>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
