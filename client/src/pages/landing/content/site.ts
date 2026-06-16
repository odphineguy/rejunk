/**
 * Site-wide marketing content: contact info, nav, eco stats, page meta.
 * Single source of truth so the real phone number is a one-line swap.
 */

export const PHONE_DISPLAY = "(602) 499-2672";
export const PHONE_HREF = "tel:+16024992672";
export const SMS_HREF = "sms:+16024992672";

export const SERVICE_AREA = "Phoenix metro & East Valley";

export const NAV_ITEMS = [
  { label: "Junk Removal", href: "/junk-removal" },
  { label: "Moving", href: "/moving" },
  { label: "Assembly & Handyman", href: "/assembly-handyman" },
] as const;

/**
 * The eco story is Rejunk's differentiator: the owner spent 17 years on the
 * waste-collection side at Waste Management and the business routes every load
 * to the right Phoenix-metro facility. Facility count mirrors the operations
 * database (client/src/data/facilities.ts — 12 facilities as of 2026-06;
 * hard-coded here so the data file stays out of the marketing bundle).
 */
export const ECO_STATS = [
  { value: "17", unit: "years", label: "in the waste & recycling industry" },
  { value: "12+", unit: "facilities", label: "recycling, donation & disposal sites we route to" },
  { value: "1st", unit: "stop", label: "donate and recycle before anything hits a landfill" },
] as const;

export const ECO_HEADING = "We know where your junk should actually go.";
export const ECO_PARAGRAPH =
  "Before Progressive Transportation Services, our founder spent 17 years in waste collection at Waste Management. " +
  "That means every load we haul gets routed on purpose — metal to the scrap yard, " +
  "usable furniture to donation, green waste to composting, electronics to certified " +
  "recyclers — not just dumped at the nearest landfill.";

export const PAGE_META = {
  home: {
    title: "Progressive Transportation Services — Junk Removal, Moving & Assembly in Phoenix, AZ",
    description:
      "Junk removal, local moving, and assembly & handyman services across the Phoenix valley. Eco-friendly disposal, upfront pricing, usually same-day.",
  },
  junk: {
    title: "Junk Removal in Phoenix, AZ — Same-Day Hauling | Progressive Transportation Services",
    description:
      "Full cleanouts or single items, hauled the same day across Phoenix and the East Valley. We donate and recycle first — 17 years of waste-industry know-how.",
  },
  moving: {
    title: "Local Moving & Delivery in Phoenix, AZ | Progressive Transportation Services",
    description:
      "Local moves, in-home furniture moves, and big-item delivery across the Phoenix valley. Careful crews, upfront pricing.",
  },
  assembly: {
    title: "Assembly & Handyman in Phoenix — Senior-Friendly | Progressive Transportation Services",
    description:
      "Furniture assembly, TV mounting, grab bars, and small repairs across Phoenix. Patient, senior-friendly service — and we help everyone.",
  },
  estimate: {
    title: "Get a Free Estimate | Progressive Transportation Services Phoenix",
    description:
      "Tell us what you need hauled, moved, or built and we'll text or call you back with a quote — usually within the hour.",
  },
} as const;
