import { useState } from "react";
import { Link, useLocation } from "wouter";

import { NAV_ITEMS, PHONE_DISPLAY, PHONE_HREF } from "../content/site";
import { PALETTE } from "../palette";

const P = PALETTE;

/**
 * Sticky white marketing header: logo, service-line nav, phone, and the lime
 * estimate CTA. Mobile gets a simple disclosure menu (no shadcn Sheet — keeps
 * the chunk light). The staff entrance lives in the footer.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur"
      style={{ background: "rgba(255,255,255,0.92)", borderColor: P.line }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 md:px-8">
        <Link href="/" aria-label="Rejunk home" onClick={() => setOpen(false)}>
          {/* rejunk-whites.png is the dark-on-transparent logo made for white surfaces. */}
          <img src="/rejunk-whites.png" alt="Rejunk" className="h-9 w-auto md:h-10" />
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
            href={PHONE_HREF}
            className="hidden text-sm font-bold lg:block"
            style={{ color: P.pine }}
          >
            {PHONE_DISPLAY}
          </a>
          <Link
            href="/estimate"
            className="rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm transition-transform hover:scale-[1.03]"
            style={{ background: P.lime, color: P.pine }}
          >
            Get a Free Estimate
          </Link>
          <button
            type="button"
            className="rounded-lg border p-2 md:hidden"
            style={{ borderColor: P.line, color: P.ink }}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen(value => !value)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
                href={PHONE_HREF}
                className="block rounded-lg px-3 py-3 text-base font-bold"
                style={{ color: P.pine }}
              >
                Call {PHONE_DISPLAY}
              </a>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
