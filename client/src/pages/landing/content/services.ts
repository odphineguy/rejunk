/**
 * Per-line-of-business content for the three service pages. The page layout
 * lives in ServicePage.tsx; everything page-specific (copy, quick answers,
 * sub-services, FAQs, the extra story section) lives here.
 */

import type { ImageBriefId } from "./imageBriefs";
import { PHONE_DISPLAY } from "./site";

export interface QuickAnswer {
  title: string;
  body: string;
}

export interface SubService {
  title: string;
  blurb: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface ExtraSection {
  kicker: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  imageId: ImageBriefId;
  /** Bumps body copy to text-lg — used on the seniors section. */
  largeType?: boolean;
}

export interface ServiceContent {
  slug: "junk-removal" | "moving" | "assembly-handyman";
  name: string;
  metaKey: "junk" | "moving" | "assembly";
  heroKicker: string;
  heroTitle: string;
  heroSub: string;
  heroImageId: ImageBriefId;
  quickAnswers: QuickAnswer[];
  subServicesTitle: string;
  subServices: SubService[];
  extra?: ExtraSection;
  faqs: Faq[];
}

export const SERVICES: Record<ServiceContent["slug"], ServiceContent> = {
  "junk-removal": {
    slug: "junk-removal",
    name: "Junk Removal",
    metaKey: "junk",
    heroKicker: "Junk removal & hauling",
    heroTitle: "Junk out. Space back.",
    heroSub:
      "Single items or whole-house cleanouts, hauled across the Phoenix valley — usually the same day you call. We do the lifting, the loading, and the sweep-up.",
    heroImageId: "junk-hero",
    quickAnswers: [
      {
        title: "How much does it cost?",
        body: "Pricing is based on how much space your items take in the truck. You get a firm number before we touch anything — no surprises at the curb.",
      },
      {
        title: "What do you take?",
        body: "Furniture, appliances, mattresses, yard debris, garage and estate cleanouts, e-waste, hot tubs — if two people can move it, we can probably haul it.",
      },
      {
        title: "How soon can you come?",
        body: "Usually the same day or next day. Tell us your timing and we'll work around it.",
      },
    ],
    subServicesTitle: "Popular junk removal jobs",
    subServices: [
      { title: "Furniture removal", blurb: "Sofas, sectionals, dressers, desks — gone without a wall scuff." },
      { title: "Appliance haul-away", blurb: "Fridges, washers, dryers, and water heaters, recycled the right way." },
      { title: "Mattress disposal", blurb: "Mattresses and box springs picked up from any room in the house." },
      { title: "Garage cleanouts", blurb: "Years of stacked-up stuff sorted, loaded, and swept out in one visit." },
      { title: "Estate cleanouts", blurb: "Respectful, thorough whole-home cleanouts on your schedule." },
      { title: "Yard debris", blurb: "Branches, palm fronds, rock, and storm cleanup — routed to green-waste sites." },
      { title: "Hot tub removal", blurb: "Cut down, hauled off, and the pad left clean." },
      { title: "E-waste pickup", blurb: "TVs, monitors, and electronics to certified recyclers, never the landfill." },
    ],
    extra: {
      kicker: "Eco-friendly disposal",
      title: "Donate first. Recycle second. Landfill last.",
      paragraphs: [
        "Most haulers drive straight to the dump because it's easy. We don't — our founder spent 17 years in waste collection at Waste Management and knows every recycling, donation, and disposal facility across the Phoenix metro.",
        "Usable furniture goes to donation. Metal goes to the scrap yard. Green waste gets composted, electronics go to certified recyclers, and only what's truly waste goes to the landfill.",
      ],
      imageId: "junk-eco",
    },
    faqs: [
      {
        q: "What can't you take?",
        a: "We can't haul hazardous materials like wet paint, chemicals, asbestos, or fuel. Almost everything else — furniture, appliances, debris, electronics — is fair game. Not sure? Just ask when you call.",
      },
      {
        q: "Do I need to be home?",
        a: "Not necessarily. If the items are accessible — curbside, in the driveway, or in an open garage — we can haul them and send you photos when it's done.",
      },
      {
        q: "What happens to my stuff?",
        a: "We sort every load. Usable items are donated, recyclables go to the right facility, and only the rest is disposed of. It's the part of the job we take most seriously.",
      },
      {
        q: "How is the price decided?",
        a: "Mostly by volume — how much room your items take in the truck — plus extra-heavy materials like concrete or dirt. You approve the price before we start.",
      },
    ],
  },

  moving: {
    slug: "moving",
    name: "Moving",
    metaKey: "moving",
    heroKicker: "Local moving & delivery",
    heroTitle: "Moved like it's ours.",
    heroSub:
      "Local moves, in-home furniture shuffles, and single big-item deliveries across the Phoenix valley. Padded, strapped, and placed where you want it.",
    heroImageId: "moving-hero",
    quickAnswers: [
      {
        title: "What will my move cost?",
        body: "Local moves are priced by crew and hours with a clear minimum, plus mileage when it applies. You'll know the number before moving day.",
      },
      {
        title: "What moves do you do?",
        body: "Apartments, houses, single rooms, offices — plus one-item jobs like getting a sofa across town or a piano down the street.",
      },
      {
        title: "How soon can you move me?",
        body: "Often within a couple of days, sometimes same-day for small jobs. The earlier you book, the more choice you get.",
      },
    ],
    subServicesTitle: "Moving services we offer",
    subServices: [
      { title: "Local moves", blurb: "Apartment and house moves anywhere in the Phoenix metro." },
      { title: "In-home furniture moves", blurb: "Rearranging rooms, swapping floors, staging for sale." },
      { title: "Big-item delivery", blurb: "Bought a couch across town? We'll pick it up and place it." },
      { title: "Loading & unloading", blurb: "Your truck or storage unit, our backs and straps." },
      { title: "Senior downsizing", blurb: "Patient, unhurried moves into smaller homes or communities." },
      { title: "Stairs, no problem", blurb: "Apartment walk-ups and split-levels handled carefully." },
    ],
    faqs: [
      {
        q: "Is there a minimum?",
        a: "Yes — small moving jobs carry a two-hour minimum so we can staff them properly. We'll tell you exactly how the time and crew size affect the price when you book.",
      },
      {
        q: "Do you supply pads and straps?",
        a: "Always. Blankets, straps, and dollies come with every move at no extra charge.",
      },
      {
        q: "Can you move just one item?",
        a: "Absolutely — single-item moves and store-to-door deliveries are some of our most common jobs.",
      },
      {
        q: "Do you do long-distance moves?",
        a: "We focus on the Phoenix metro and East Valley. For moves beyond the valley, call us — depending on the distance we can often still help.",
      },
    ],
  },

  "assembly-handyman": {
    slug: "assembly-handyman",
    name: "Assembly & Handyman",
    metaKey: "assembly",
    heroKicker: "Assembly & handyman",
    heroTitle: "Built, mounted, fixed.",
    heroSub:
      "Furniture assembly, TV mounting, and the small jobs around the house — done patiently and done right. We specialize in serving Phoenix seniors, and we help everyone.",
    heroImageId: "assembly-hero",
    quickAnswers: [
      {
        title: "What does it cost?",
        body: "Straightforward flat rates for common jobs like furniture assembly and TV mounting, quoted before we start. No hourly meter running while we work.",
      },
      {
        title: "Do you work with seniors?",
        body: "It's our specialty. Patient, unhurried visits, clear communication, and booking by phone — no apps required.",
      },
      {
        title: "What jobs do you take?",
        body: "Flat-pack assembly, mounting, grab bars, shelves and pictures, door hardware, and small repairs. If it's a small job done carefully, that's us.",
      },
    ],
    subServicesTitle: "Assembly & handyman services",
    subServices: [
      { title: "Furniture assembly", blurb: "Flat-pack beds, dressers, desks, and shelving built square and solid." },
      { title: "TV mounting", blurb: "Mounted level, anchored right, cables tidied." },
      { title: "Grab bars & safety rails", blurb: "Bathroom and hallway safety installs, anchored into studs." },
      { title: "Pictures & shelves", blurb: "Hung straight the first time, heavy mirrors included." },
      { title: "Door & hardware fixes", blurb: "Sticking doors, loose handles, new locksets." },
      { title: "Small repairs", blurb: "The honey-do list, knocked out in one visit." },
    ],
    extra: {
      kicker: "Senior-friendly service",
      title: "Proudly serving Phoenix seniors.",
      paragraphs: [
        "A lot of our assembly and handyman work is for older adults — and we built the service around that. Our crew takes the time to explain what we're doing, works at your pace, and treats your home with respect.",
        "Book by phone, not an app. We confirm before we arrive, show up when we say we will, and don't leave until you've seen the finished work and you're happy with it. And of course — we do assembly and handyman work for everyone.",
      ],
      bullets: [
        "Patient, unhurried visits — no rushing",
        "Plain-language explanations, no jargon",
        "Phone booking and reminders — no app needed",
        "Grab bars and safety installs are a specialty",
      ],
      imageId: "assembly-seniors",
      largeType: true,
    },
    faqs: [
      {
        q: "Is there a minimum charge?",
        a: `Yes — small jobs start at a flat visit minimum so we can send the right person with the right tools. You'll get the exact price when you call ${PHONE_DISPLAY}.`,
      },
      {
        q: "Can you help my parents if I'm not there?",
        a: "Yes, and we do it often. Adult children book for their parents all the time — we'll coordinate with you by phone and confirm with them before arriving.",
      },
      {
        q: "Do you bring the tools?",
        a: "Everything. Drills, levels, anchors, hardware — you just point at the boxes.",
      },
      {
        q: "Furniture from any store?",
        a: "Any flat-pack brand — IKEA, Amazon, Wayfair, Costco, you name it. Missing or stripped parts happen; we'll tell you straight away if something can't be finished that day.",
      },
    ],
  },
};
