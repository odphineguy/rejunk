import { Link } from "wouter";

import {
  LEGAL_DISCLOSURE,
  NAV_ITEMS,
  PHONE_DISPLAY,
  PHONE_HREF,
  SERVICE_AREA,
  SMS_HREF,
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
        </div>
      </div>

      {/* Legal row (carried over from the V2 footer) + the quiet staff entrance. */}
      <div
        className="flex flex-col items-center gap-1 border-t px-6 py-6 text-center text-xs md:flex-row md:justify-center md:gap-3"
        style={{ borderColor: P.pineLine }}
      >
        <span>Progressive Transportation Services LLC</span>
        <span className="hidden md:inline">·</span>
        <span>Chandler, AZ</span>
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
