import { Link } from "wouter";

import {
  LEGAL_DISCLOSURE,
  NAV_ITEMS,
  PHONE_DISPLAY,
  PHONE_HREF,
  SERVICE_AREA,
  SMS_HREF,
  YELP_URL,
} from "../content/site";
import { PALETTE } from "../palette";

const P = PALETTE;

/** Marketing footer on pine: services, contact, service area, legal row, staff entrance. */
export function SiteFooter() {
  return (
    <footer style={{ background: P.pine, color: P.paperSoft }}>
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-3 md:px-8 md:py-16">
        <div>
          {/* progressive-logo-footer.png: wordmark on pine field (#052a2b) so it
              blends seamlessly into the dark footer. */}
          <img src="/progressive-logo-footer.png" alt="Progressive Transportation Services" className="h-16 w-auto" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">
            Junk removal, moving, and assembly & handyman across the {SERVICE_AREA} — with
            eco-friendly disposal built into every job.
          </p>
        </div>

        <nav aria-label="Footer services">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider" style={{ color: P.paper }}>
            Services
          </h2>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {NAV_ITEMS.map(item => (
              <li key={item.href}>
                <Link href={item.href} className="transition-opacity hover:opacity-70">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/estimate" className="font-semibold transition-opacity hover:opacity-70" style={{ color: P.lime }}>
                Get a Free Estimate
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="font-display text-sm font-bold uppercase tracking-wider" style={{ color: P.paper }}>
            Talk to us
          </h2>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            <li>
              <a href={PHONE_HREF} className="font-semibold" style={{ color: P.paper }}>
                Call {PHONE_DISPLAY}
              </a>
            </li>
            <li>
              <a href={SMS_HREF} className="transition-opacity hover:opacity-70">
                Text us a photo of the job
              </a>
            </li>
            <li>{SERVICE_AREA}</li>
          </ul>

          <h2 className="font-display mt-6 text-sm font-bold uppercase tracking-wider" style={{ color: P.paper }}>
            Find us on
          </h2>
          <div className="mt-3">
            <a
              href={YELP_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Progressive Transportation Services on Yelp (opens in a new tab)"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: "#ffffff", color: "#d32323" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12.4 2.06c1.2.2 1.34.43 1.32 1.5l-.18 7.07c-.03 1.16-1.5 1.55-2.08.55L7.9 5.9c-.5-.86-.13-1.4.78-1.86A12.4 12.4 0 0 1 12.4 2.06zM6.43 8.3c.66-.1 1.02.27 2.66 2.2 1.1 1.3.62 2.36-.3 2.6L4.6 14.2c-1.04.28-1.56-.1-1.64-1.06a7.7 7.7 0 0 1 .6-3.5c.4-.86.78-1.18 2.86-1.34zm6.9 6.3c.55-.92 2-.6 2.34.27l1.66 4.13c.4 1-.02 1.5-.96 1.7a7.7 7.7 0 0 1-3.46.02c-.95-.2-1.2-.7-.9-1.66zm-2.74.93c.95-.32 1.86.5 1.5 1.55l-1.5 4.34c-.36 1.04-.97 1.16-1.82.62a7.7 7.7 0 0 1-2.3-2.46c-.5-.86-.32-1.44.6-2.04zm9.06-2.9c1 .33 1.16.93.66 1.84a7.7 7.7 0 0 1-2.18 2.4c-.78.56-1.4.42-1.96-.46l-2.32-3.6c-.64-1 .2-2.18 1.36-1.88z"/>
              </svg>
              Review us on Yelp
            </a>
          </div>
        </div>
      </div>

      {/* Legal row (carried over from the V2 footer) + the quiet staff entrance. */}
      <div
        className="flex flex-col items-center gap-1 border-t px-6 py-6 text-center text-xs md:flex-row md:justify-center md:gap-3"
        style={{ borderColor: P.pineLine }}
      >
        <span>Progressive Transportation Services LLC</span>
        <span className="hidden md:inline">·</span>
        <span>Phoenix, AZ</span>
        <span className="hidden md:inline">·</span>
        <span>USDOT 4421119</span>
        <span className="hidden md:inline">·</span>
        <span>MC-1763629</span>
        <span className="hidden md:inline">·</span>
        <span>© {new Date().getFullYear()}</span>
        <span className="hidden md:inline">·</span>
        <Link href="/terms" className="transition-opacity hover:opacity-100">
          Terms
        </Link>
        <span className="hidden md:inline">·</span>
        <Link href="/privacy" className="transition-opacity hover:opacity-100">
          Privacy
        </Link>
        <span className="hidden md:inline">·</span>
        <Link href="/login" className="opacity-60 transition-opacity hover:opacity-100">
          Staff sign-in
        </Link>
      </div>
      <div className="border-t px-6 py-4 text-center text-xs" style={{ borderColor: P.pineLine }}>
        <p>{LEGAL_DISCLOSURE}</p>
      </div>
    </footer>
  );
}
