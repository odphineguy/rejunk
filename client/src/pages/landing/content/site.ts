/**
 * Site-wide marketing content: contact info, navigation, proof, and page meta.
 * Single source of truth so the real phone number is a one-line swap.
 */

export const PHONE_DISPLAY = "(480) 351-0291";
export const PHONE_HREF = "tel:+14803510291";
/**
 * Housecall Pro online-booking link.
 *
 * The `utm_*` tags are how we tell OUR website's bookings apart from bookings
 * that came from Housecall Pro's own emails, Thumbtack, Yelp, etc. Every
 * booking button on the public site must carry them — use `bookingUrl()` below
 * so each button also says WHICH button it was.
 */
const BOOKING_BASE =
  "https://book.housecallpro.com/book/Progressive-Transportation-Services-LLC/5802285459dc4b5cbf8914e1135d262f?v2=true";

export const BOOKING_URL = `${BOOKING_BASE}&utm_source=website&utm_medium=referral&utm_campaign=book_online`;

/**
 * Booking link tagged with the specific button it came from, e.g.
 * `bookingUrl("header")` → …&utm_content=header
 */
export function bookingUrl(placement: string): string {
  return `${BOOKING_URL}&utm_content=${encodeURIComponent(placement)}`;
}

export const SERVICE_AREA = "Phoenix metro & East Valley";

// Public social profiles (customer-facing). Leave a URL empty to hide its icon.
// Yelp: NOT the biz.yelp.com owner portal — this is the public listing.
export const YELP_URL =
  "https://www.yelp.com/biz/progressive-transportation-services-phoenix";
export const GOOGLE_BUSINESS_URL = "";
export const FACEBOOK_URL =
  "https://www.facebook.com/profile.php?id=61590042523931";
export const THUMBTACK_PROFILE_URL =
  "https://www.thumbtack.com/az/chandler/moving-companies/progressive-transportation-services/service/580274029751476226";
export const BRAND_NAME = "Progressive Transportation Services";
export const LEGAL_OPERATOR = "Saguaro Transportation Services";
export const LEGAL_DISCLOSURE = `${BRAND_NAME} is a service brand operated by ${LEGAL_OPERATOR}.`;

export const NAV_ITEMS = [
  { label: "Junk Removal", href: "/junk-removal" },
  { label: "Moving", href: "/moving" },
  { label: "Pallet Delivery", href: "/pallet-delivery" },
  { label: "Piano Moving", href: "/piano-moving" },
  { label: "Assembly", href: "/assembly-handyman" },
] as const;

export const THUMBTACK_PROOF = {
  rating: "5.0",
  reviews: "30 reviews",
  hires: "78 times hired",
  badge: "Top Pro",
} as const;

export const PAGE_META = {
  home: {
    title:
      "Progressive Transportation Services — Junk Removal, Moving & Assembly in Phoenix, AZ",
    description:
      "Junk removal, local moving, and furniture assembly across the Phoenix valley. Upfront pricing, careful crews, and same-day availability.",
  },
  junk: {
    title:
      "Junk Removal in Phoenix, AZ — Same-Day Hauling | Progressive Transportation Services",
    description:
      "Full cleanouts or single items hauled across Phoenix and the East Valley. Upfront pricing, full-service lifting, and same-day availability.",
  },
  moving: {
    title:
      "Local Moving & Delivery in Phoenix, AZ | Progressive Transportation Services",
    description:
      "Local moves, in-home furniture moves, and big-item delivery across the Phoenix valley. Careful crews, upfront pricing.",
  },
  delivery: {
    title: "Pallet Delivery in Phoenix, AZ | Liftgate Delivery Service",
    description:
      "Palletized tile, flooring, building materials, oversized purchases, and warehouse pickups delivered by 26-foot box truck with liftgate and pallet jack.",
  },
  piano: {
    title: "Piano Movers in Arizona | Progressive Transportation Services",
    description:
      "Licensed and insured in-state Arizona piano moving for spinets, consoles, uprights, baby grands, and grands. One clear quote with no mileage line item.",
  },
  assembly: {
    title:
      "Furniture Assembly in Phoenix — Senior-Friendly | Progressive Transportation Services",
    description:
      "Furniture, shelving, bed frame, desk, and outdoor furniture assembly across Phoenix. Patient, careful, senior-friendly service.",
  },
  estimate: {
    title: "Get a Free Estimate | Progressive Transportation Services Phoenix",
    description:
      "Tell us what you need hauled, moved, assembled, or transported—including pianos—and we'll text or call you back with a clear quote.",
  },
  instantEstimate: {
    title:
      "AI Instant Estimate — Junk Removal Price from a Photo | Progressive Transportation Services",
    description:
      "Upload a few photos of your junk and our AI gives you a ballpark price in seconds. Free, no obligation — a real person follows up to confirm.",
  },
  terms: {
    title: "Terms of Service | Progressive Transportation Services",
    description:
      "Terms for Progressive Transportation Services junk removal, moving, assembly, and text messaging services.",
  },
  privacy: {
    title: "Privacy Policy | Progressive Transportation Services",
    description:
      "Privacy practices for Progressive Transportation Services, including website leads, service communication, and SMS information.",
  },
} as const;
