/**
 * Per-line-of-business content for the service pages. The page layout
 * lives in ServicePage.tsx; everything page-specific (copy, quick answers,
 * sub-services, FAQs, the extra story section) lives here.
 */

import type { ImageBriefId } from "./imageBriefs";

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

export interface ProcessStep {
  title: string;
  body: string;
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
  slug:
    | "junk-removal"
    | "moving"
    | "pallet-delivery"
    | "piano-moving"
    | "assembly-handyman";
  name: string;
  metaKey: "junk" | "moving" | "delivery" | "piano" | "assembly";
  heroTitle: string;
  heroSub: string;
  heroImageId: ImageBriefId;
  quickAnswers: QuickAnswer[];
  subServicesTitle: string;
  subServices: SubService[];
  process?: {
    heading: string;
    steps: ProcessStep[];
  };
  extra?: ExtraSection;
  faqs: Faq[];
}

export const SERVICES: Record<ServiceContent["slug"], ServiceContent> = {
  "junk-removal": {
    slug: "junk-removal",
    name: "Junk Removal",
    metaKey: "junk",
    heroTitle: "Clear the clutter. Keep the space.",
    heroSub:
      "From one heavy sofa to a packed garage, our crew lifts, loads, and sweeps up. You approve the price before anything moves.",
    heroImageId: "home-svc-junk",
    quickAnswers: [
      {
        title: "How much does it cost?",
        body: "Pricing is based on how much space your items take in the truck. You get a firm number before we touch anything — no surprises at the curb.",
      },
      {
        title: "What do you take?",
        body: "Furniture, appliances, mattresses, yard debris, garage and estate cleanouts, e-waste, and hot tubs. If two people can move it, we can probably haul it.",
      },
      {
        title: "How soon can you come?",
        body: "Usually the same day or next day. Tell us your timing and we'll work around it.",
      },
    ],
    subServicesTitle: "Popular junk removal jobs",
    subServices: [
      {
        title: "Furniture removal",
        blurb:
          "Sofas, sectionals, dressers, desks — gone without a wall scuff.",
      },
      {
        title: "Appliance haul-away",
        blurb:
          "Fridges, washers, dryers, and water heaters, recycled the right way.",
      },
      {
        title: "Mattress disposal",
        blurb:
          "Mattresses and box springs picked up from any room in the house.",
      },
      {
        title: "Garage cleanouts",
        blurb:
          "Years of stacked-up stuff sorted, loaded, and swept out in one visit.",
      },
      {
        title: "Estate cleanouts",
        blurb: "Respectful, thorough whole-home cleanouts on your schedule.",
      },
      {
        title: "Yard debris",
        blurb:
          "Branches, palm fronds, rock, and storm cleanup — routed to green-waste sites.",
      },
      {
        title: "Hot tub removal",
        blurb: "Cut down, hauled off, and the pad left clean.",
      },
      {
        title: "E-waste pickup",
        blurb:
          "TVs, monitors, and electronics to certified recyclers, never the landfill.",
      },
    ],
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
    heroTitle: "A careful move, without the runaround.",
    heroSub:
      "Apartments, homes, in-home furniture moves, and single-item deliveries. We pad it, secure it, and place it exactly where you want it.",
    heroImageId: "moving-hero",
    quickAnswers: [
      {
        title: "What will my move cost?",
        body: "We give you a clear quote before moving day. The crew, truck, standard pads, straps, and travel are included — no separate mileage line item.",
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
      {
        title: "Local moves",
        blurb: "Apartment and house moves anywhere in the Phoenix metro.",
      },
      {
        title: "In-home furniture moves",
        blurb: "Rearranging rooms, swapping floors, staging for sale.",
      },
      {
        title: "Big-item delivery",
        blurb: "Bought a couch across town? We'll pick it up and place it.",
      },
      {
        title: "Loading & unloading",
        blurb: "Your truck or storage unit, our backs and straps.",
      },
      {
        title: "Senior downsizing",
        blurb: "Patient, unhurried moves into smaller homes or communities.",
      },
      {
        title: "Stairs, no problem",
        blurb: "Apartment walk-ups and split-levels handled carefully.",
      },
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

  "pallet-delivery": {
    slug: "pallet-delivery",
    name: "Pallet & Large Delivery",
    metaKey: "delivery",
    heroTitle: "Big loads. Delivered with the right equipment.",
    heroSub:
      "Pallets of tile, flooring, building materials, and oversized purchases — picked up in our 26-foot box truck and unloaded with a liftgate and pallet jack.",
    heroImageId: "pallet-delivery-hero",
    quickAnswers: [
      {
        title: "How is delivery priced?",
        body: "We quote the complete job based on the route, pallet count, dimensions, weight, and access at delivery. You approve one clear price before pickup.",
      },
      {
        title: "What can you pick up?",
        body: "Palletized tile and flooring, building materials, cabinets, business equipment, oversized furniture, and other store or warehouse purchases that fit safely in the truck.",
      },
      {
        title: "What do you need from me?",
        body: "Send the order details, pallet count and weight, pickup contact, delivery address, and a photo or description of the unloading area.",
      },
    ],
    process: {
      heading: "A planned pickup. A controlled delivery.",
      steps: [
        {
          title: "Share the order and both locations",
          body: "Tell us what is being picked up, how many pallets there are, the total weight, and who we should contact at the store or warehouse.",
        },
        {
          title: "We confirm the truck, access, and quote",
          body: "We review the route and unloading surface, make sure the load fits our equipment, and confirm one price before dispatch.",
        },
        {
          title: "The supplier loads and we secure it",
          body: "The pickup location typically forklift-loads the truck. We check the load, secure it for transport, and head to the delivery address.",
        },
        {
          title: "Liftgate down, pallet jack out",
          body: "We lower the load to ground level and move it to the agreed paved drop-off point, then confirm the delivery is complete.",
        },
      ],
    },
    subServicesTitle: "Loads we pick up and deliver",
    subServices: [
      {
        title: "Tile & flooring pallets",
        blurb:
          "Heavy tile, flooring, and installation materials collected from local suppliers and delivered to the jobsite.",
      },
      {
        title: "Building materials",
        blurb:
          "Cabinets, boxed fixtures, and palletized materials moved from the store or warehouse to your property.",
      },
      {
        title: "Store & warehouse pickup",
        blurb:
          "We coordinate with the pickup counter or dock so your order gets collected without tying up your day.",
      },
      {
        title: "Oversized purchases",
        blurb:
          "Large furniture, appliances, equipment, and other purchases that will not fit in a pickup truck.",
      },
      {
        title: "Business equipment",
        blurb:
          "Fixtures, boxed equipment, and supplies delivered to offices, shops, and commercial locations.",
      },
      {
        title: "Multi-pallet delivery",
        blurb:
          "Several pallets moved together when the combined dimensions and weight fit the truck safely.",
      },
    ],
    extra: {
      kicker: "Liftgate delivery",
      title: "From the loading dock to ground level.",
      paragraphs: [
        "Flooring and building-material orders are often too large for a pickup and too heavy to unload by hand. Our box truck, liftgate, and pallet jack keep the load together and the handoff controlled.",
        "Before pickup, we confirm the weight and the final drop point. A loaded pallet jack needs a firm, reasonably level surface, so access details matter just as much as the drive itself.",
      ],
      bullets: [
        "26-foot enclosed box truck",
        "Hydraulic liftgate and pallet jack",
        "Load securement for transport",
        "Ground-level delivery to an agreed paved area",
      ],
      imageId: "pallet-delivery-equipment",
    },
    faqs: [
      {
        q: "Will you load the pallets at pickup?",
        a: "Most stores and warehouses load palletized orders into the truck with a forklift. We confirm their loading procedure before pickup. If an order needs to be loaded by hand, tell us so we can quote the labor and crew correctly.",
      },
      {
        q: "Where can you place the pallets at delivery?",
        a: "Standard delivery is to an agreed ground-level area that the liftgate and loaded pallet jack can safely reach. Concrete and smooth asphalt are ideal. Gravel, deep cracks, steep slopes, sand, and soft landscaping usually are not pallet-jack accessible.",
      },
      {
        q: "Do you need the pallet weight?",
        a: "Yes. Please provide the supplier's pallet count, dimensions, and weight before we confirm the job. Tile and stone are especially heavy, so we verify the load against the truck and liftgate limits before dispatch.",
      },
      {
        q: "Can you bring the material inside or unpack it?",
        a: "Standard pallet delivery ends at the agreed outdoor or ground-level drop point. Inside placement, hand unloading, unpacking, or assembly can often be added, but it needs to be included in the quote before pickup.",
      },
      {
        q: "How far do you deliver?",
        a: "Most jobs are within Phoenix and the East Valley. For longer Arizona routes, send us the pickup and delivery addresses and we will confirm availability and pricing.",
      },
    ],
  },

  "piano-moving": {
    slug: "piano-moving",
    name: "Piano Moving",
    metaKey: "piano",
    heroTitle: "Your piano, moved with a plan.",
    heroSub:
      "Licensed and insured piano moving anywhere within Arizona. We protect the instrument, plan the access at both homes, and give you one clear quote before moving day.",
    heroImageId: "piano-hero",
    quickAnswers: [
      {
        title: "Where do you go?",
        body: "We handle in-state moves only. Pickup and delivery must both be in Arizona, whether the piano is moving across town or across the state.",
      },
      {
        title: "Which pianos do you move?",
        body: "Spinets, consoles, standard and full-size uprights, baby grands, and grands. We ask for the type and access details before confirming the job.",
      },
      {
        title: "How is the quote set?",
        body: "The piano type, pickup and delivery access, stairs, and route shape the quote. You receive one clear total — no mileage line item or hourly meter.",
      },
    ],
    process: {
      heading: "A controlled move from first photo to final placement.",
      steps: [
        {
          title: "Share the piano and both locations",
          body: "Tell us the piano type, pickup and delivery cities, stairs, tight turns, and any elevator or long-carry details. Photos help us plan accurately.",
        },
        {
          title: "We plan the handling and confirm one quote",
          body: "We review access, choose the crew and equipment, and confirm the move plan and all-in price before the appointment.",
        },
        {
          title: "Protect, prepare, and load",
          body: "The crew protects the instrument with moving pads and secure strapping. Grand components are prepared for transport when the move requires it.",
        },
        {
          title: "Transport and place it where it belongs",
          body: "We secure the piano in the truck, transport it within Arizona, and complete final placement at the delivery address before we leave.",
        },
      ],
    },
    subServicesTitle: "Pianos we handle",
    subServices: [
      {
        title: "Spinet pianos",
        blurb:
          "Compact uprights handled with the same padding, strapping, and access planning as larger instruments.",
      },
      {
        title: "Console pianos",
        blurb:
          "Residential console pianos protected through doorways, hallways, and final room placement.",
      },
      {
        title: "Standard uprights",
        blurb:
          "The most common home piano move, planned around weight, turns, flooring, and both entrances.",
      },
      {
        title: "Full-size uprights",
        blurb:
          "Taller, heavier uprights assigned the crew and equipment needed for controlled handling.",
      },
      {
        title: "Baby grands",
        blurb:
          "Prepared for transport, padded, secured, and placed carefully at the destination.",
      },
      {
        title: "Grand pianos",
        blurb:
          "Grand pianos moved with a route and handling plan built around their size and access needs.",
      },
    ],
    extra: {
      kicker: "Arizona moves only",
      title: "One responsible crew from pickup through placement.",
      paragraphs: [
        "Progressive Transportation Services is licensed and insured for transportation work. Your piano stays with our move plan from the first address to the second — no open marketplace or unknown handoff.",
        "We confirm the scope before moving day, including stairs, tight turns, long carries, and the destination room. If the scope stays the same, the quote stays the same.",
      ],
      bullets: [
        "In-state Arizona pickup and delivery",
        "Licensed and insured — USDOT 4421119 · MC-1763629",
        "One all-in quote with no mileage line item",
        "Pads, straps, secure transport, and final placement",
      ],
      imageId: "piano-route",
    },
    faqs: [
      {
        q: "Do you move pianos outside Arizona?",
        a: "No. We currently accept piano moves only when both pickup and delivery are within Arizona.",
      },
      {
        q: "Do you charge mileage?",
        a: "No separate mileage charge appears on the bill. We review the complete route and scope, then provide one clear quote before the move.",
      },
      {
        q: "Can you handle stairs or an elevator?",
        a: "Often, yes. Include stairs, elevator size, tight turns, and long carries in your request so we can confirm the right crew and plan before booking.",
      },
      {
        q: "Are you licensed and insured?",
        a: "Yes. Progressive Transportation Services LLC is licensed and insured, with USDOT 4421119 and MC-1763629.",
      },
      {
        q: "Will the piano need tuning afterward?",
        a: "A move can affect tuning. Let the piano settle in its new environment, then follow the timing recommended by your piano technician.",
      },
    ],
  },

  "assembly-handyman": {
    slug: "assembly-handyman",
    name: "Assembly",
    metaKey: "assembly",
    heroTitle: "Out of the box. Built to last.",
    heroSub:
      "Beds, dressers, desks, shelving, outdoor sets, and more — assembled carefully, leveled, and ready to use before we leave.",
    heroImageId: "assembly-hero",
    quickAnswers: [
      {
        title: "What does it cost?",
        body: "Common furniture builds are quoted at a straightforward flat rate before we start. No hourly meter running while we work.",
      },
      {
        title: "Do you work with seniors?",
        body: "Yes. Expect a patient visit, clear communication, and help moving the finished piece into place. A family member can book online on their behalf.",
      },
      {
        title: "What jobs do you take?",
        body: "Flat-pack furniture, bed frames, dressers, desks, shelving units, dining sets, patio furniture, and exercise equipment.",
      },
    ],
    subServicesTitle: "What we assemble",
    subServices: [
      {
        title: "Furniture assembly",
        blurb:
          "Flat-pack beds, dressers, desks, and shelving built square and solid.",
      },
      {
        title: "Bedroom furniture",
        blurb:
          "Bed frames, nightstands, wardrobes, and storage beds assembled and leveled.",
      },
      {
        title: "Office furniture",
        blurb:
          "Desks, chairs, filing cabinets, and workstations ready for the workday.",
      },
      {
        title: "Patio furniture",
        blurb:
          "Outdoor dining sets, loungers, benches, and storage boxes built for the Arizona sun.",
      },
      {
        title: "Shelving & storage",
        blurb:
          "Bookcases, cube storage, utility racks, and cabinets assembled securely.",
      },
      {
        title: "Exercise equipment",
        blurb:
          "Benches, racks, bikes, and home-gym equipment assembled from the manual.",
      },
    ],
    extra: {
      kicker: "Senior-friendly service",
      title: "Proudly serving Phoenix seniors.",
      paragraphs: [
        "A lot of our assembly work is for older adults, so patience is part of the service. We explain the plan, work at your pace, and treat your home with respect.",
        "Book online and we’ll confirm before we arrive. We do not leave until the finished piece is stable, placed correctly, and ready to use.",
      ],
      bullets: [
        "Patient, unhurried visits — no rushing",
        "Plain-language explanations, no jargon",
        "Online booking and appointment reminders",
        "Finished furniture placed where you want it",
      ],
      imageId: "assembly-seniors",
      largeType: true,
    },
    faqs: [
      {
        q: "Is there a minimum charge?",
        a: "Yes — small jobs start at a flat visit minimum so we can send the right person with the right tools. You’ll get the exact price before the appointment.",
      },
      {
        q: "Can you help my parents if I'm not there?",
        a: "Yes, and we do it often. Adult children book for their parents all the time — we'll coordinate with you by phone and confirm with them before arriving.",
      },
      {
        q: "Do you bring the tools?",
        a: "Yes. We bring the everyday tools needed for assembly. Keep the manufacturer-supplied parts and hardware with the boxes so we can get straight to work.",
      },
      {
        q: "Furniture from any store?",
        a: "Any flat-pack brand — IKEA, Amazon, Wayfair, Costco, you name it. Missing or stripped parts happen; we'll tell you straight away if something can't be finished that day.",
      },
    ],
  },
};
