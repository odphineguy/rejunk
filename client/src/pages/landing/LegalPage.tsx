import type { ReactNode } from "react";
import { Link } from "wouter";

import {
  BRAND_NAME,
  LEGAL_DISCLOSURE,
  LEGAL_OPERATOR,
  PAGE_META,
  PHONE_DISPLAY,
  PHONE_HREF,
  SERVICE_AREA,
} from "./content/site";
import { SiteLayout } from "./layout/SiteLayout";
import { usePageMeta } from "./lib/usePageMeta";
import { PALETTE } from "./palette";

const P = PALETTE;

type LegalKind = "terms" | "privacy";

const sectionClass = "border-t pt-8";

function PageShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <SiteLayout>
      <section className="px-5 py-12 md:px-8 md:py-16">
        <div className="mx-auto max-w-3xl">
          <p
            className="text-xs font-semibold uppercase tracking-[0.22em]"
            style={{ color: P.pine }}
          >
            Legal
          </p>
          <h1
            className="font-display mt-3 text-4xl font-bold tracking-tight md:text-5xl"
            style={{ color: P.pine }}
          >
            {title}
          </h1>
          <p className="mt-3 text-sm" style={{ color: P.inkSoft }}>
            Last updated: {updated}
          </p>
          <div
            className="mt-10 space-y-8 text-base leading-7"
            style={{ color: P.inkSoft }}
          >
            {children}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}

const UPDATED = "September 14, 2026";

function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-2xl font-bold" style={{ color: P.ink }}>
      {children}
    </h2>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-6">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function TermsPage() {
  usePageMeta(PAGE_META.terms);
  const phone = (
    <a href={PHONE_HREF} className="font-semibold underline" style={{ color: P.pine }}>
      {PHONE_DISPLAY}
    </a>
  );

  return (
    <PageShell title="Terms of Service" updated={UPDATED}>
      <section>
        <H2>Company Identity</H2>
        <p className="mt-3">
          {LEGAL_DISCLOSURE} References to "{BRAND_NAME}", "Progressive", "we",
          "us", and "our" mean {LEGAL_OPERATOR}. By booking, paying a deposit, or allowing our crew
          to begin work, you agree to these terms.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <H2>Services</H2>
        <p className="mt-3">
          We provide local moving, delivery, furniture assembly, TV mounting and
          light handyman work, junk removal, cleanouts, and related services
          across the {SERVICE_AREA}. Quotes are based on the information you
          give us and may be updated if the job scope, access conditions,
          stairs, item count, item weight, or disposal requirements change.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <H2>Estimates and Pricing</H2>
        <Bullets
          items={[
            "Estimates are estimates, not fixed prices, unless a flat rate or package price is stated in writing.",
            "Package moves include the on-site hours stated in the quote. Hourly jobs carry a 2-hour minimum and are billed in 15-minute increments after that. Time starts when the crew arrives at the loading address and ends when unloading is complete.",
            "Travel fees and excess mileage are charged as stated in your quote.",
            "Weekend, same-day, Sunday, and evening pricing applies as quoted at booking.",
            "Additional items, stops, or services requested on the day are subject to re-quote and crew capacity. We may decline additions that cannot be safely completed with the crew and equipment assigned.",
          ]}
        />
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <H2>Deposits, Payment, and Cancellation</H2>
        <Bullets
          items={[
            "A $50 deposit is due at booking and is credited to your final invoice. Labor-only jobs and pickups from a seller, store, or other third party are paid in full at booking.",
            "The remaining balance is due at completion, before the crew departs. We accept credit and debit cards, Zelle, Cash App, Apple Pay, Venmo, and cash. We do not accept checks, money orders, or PayPal.",
            "Cancel or reschedule at least 24 hours before your scheduled start for a full deposit refund or transfer. Cancellations inside 24 hours forfeit the deposit.",
            "If we must cancel because of weather, safety, or equipment failure, your deposit is refunded in full.",
            "Unpaid balances may be referred to collections after 30 days.",
          ]}
        />
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <H2>Liability for Loss or Damage to Your Goods</H2>
        <p className="mt-3">
          We are responsible for loss or damage to your goods while they are in
          our care, subject to the coverage level in place before loading.
        </p>
        <p className="mt-3">
          <strong style={{ color: P.ink }}>Released Value Protection (included at no charge).</strong>{" "}
          Unless you arrange other coverage in writing before loading, your
          shipment moves under Released Value Protection. Our maximum liability
          is <strong style={{ color: P.ink }}>$0.60 per pound, per item</strong>.
          Example: a 60-pound dresser is covered up to $36. This is the
          industry-standard minimum. It is not insurance and it does not reflect
          the replacement value of your items.
        </p>
        <p className="mt-3">
          <strong style={{ color: P.ink }}>Full Value Protection (optional).</strong>{" "}
          If you want coverage based on repair or replacement value, arrange
          third-party moving coverage (for example, a moving insurance provider
          such as MovingInsurance.com) before your move date, or ask us about
          available options. Coverage must be in place before loading begins.
        </p>
        <p className="mt-3">
          Your coverage election is shown on your estimate or booking
          confirmation. By paying the deposit and proceeding with the move, you
          confirm the coverage level shown there.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <H2>Damage to the Home or Building</H2>
        <Bullets
          items={[
            "Walk through both locations with the crew lead at completion. Any damage to walls, floors, doors, railings, or fixtures must be pointed out and noted before the crew departs.",
            "Our responsibility for building damage is limited to the reasonable cost of repair. We are not responsible for wear consistent with normal moving through the space.",
            "We are not responsible for damage that results from tight stairwells, doorways, or access paths we warned you about, or from moving an item you asked us to move despite our objection.",
            "Building damage not noted at the walkthrough and reported in writing within 7 days may be denied.",
          ]}
        />
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <H2>Filing a Claim</H2>
        <Bullets
          items={[
            "Report loss or damage in writing (text, email, or Thumbtack message) with photos within 7 days of the service date.",
            "Keep damaged items available for inspection until the claim is resolved. Do not discard, repair, or dispose of them.",
            "We acknowledge claims within 2 business days and resolve them within 30 days by repair, replacement, or cash settlement at our option, up to the applicable liability limit.",
            "Claims filed after 7 days, or for items no longer available for inspection, may be denied.",
          ]}
        />
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <H2>What Is Not Covered</H2>
        <Bullets
          items={[
            "Contents of boxes we did not pack, unless the box itself shows external damage caused by us.",
            "Pre-existing damage noted in our pre-move photos or inventory.",
            "Particle-board or ready-to-assemble furniture (IKEA and similar) moved assembled. These items are not built to be moved and may fail regardless of handling. We move them at your request and at your risk.",
            "Items of extraordinary value (over $100 per pound) not declared to us in writing before the move, including jewelry, cash, documents, collectibles, and artwork.",
            "Electronics and appliances: internal mechanical or electrical failure where no external damage is visible, and electronics not packed in original or equivalent protective packaging.",
            "Damage caused by acts of nature, or by building conditions you were warned about.",
            "Plants, perishables, hazardous materials, and firearms are not accepted for transport.",
            "Indirect losses such as lost wages, hotel costs, missed closings, or storage fees.",
          ]}
        />
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <H2>Junk Removal and Cleanouts</H2>
        <Bullets
          items={[
            "Items you release to us for removal become our property when loaded. We dispose of, recycle, or donate them at our discretion and they cannot be returned.",
            "Confirm what stays and what goes with the crew lead before loading. We are not responsible for items removed at your direction.",
            "Disposal fees depend on the material and facility and are included in your quote as stated. Hazardous materials, tires, and other restricted items may be declined or re-quoted.",
          ]}
        />
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <H2>Assembly, Mounting, and Handyman Work</H2>
        <Bullets
          items={[
            "We assemble and install according to the manufacturer's instructions with the hardware supplied. Missing, damaged, or defective parts are the manufacturer's responsibility.",
            "TV and shelf mounting depends on the wall. We mount into studs or with anchors rated for the load; we are not responsible for failures caused by wall construction you did not disclose or hidden conditions inside the wall.",
            "Tell us the same day if something we assembled or mounted does not work as expected and we will make it right within reason.",
          ]}
        />
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <H2>Your Responsibilities</H2>
        <Bullets
          items={[
            "Disclose all items to be moved when booking. Undisclosed items may be declined or re-quoted on site.",
            "Point out fragile or high-value items to the crew lead before loading.",
            "Have boxes packed, sealed, and labeled before the crew arrives unless you booked packing service.",
            "Provide safe, clear access at both locations. Reserve elevators and parking where required.",
            "You, or an adult you authorize, must be present at each location to direct the crew and complete the walkthrough.",
            "Give notice of any hazardous, unusually heavy, or restricted materials before the crew arrives.",
          ]}
        />
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <H2>Our Standard of Care</H2>
        <p className="mt-3">
          Our crews pad, wrap, and secure furniture for transport as standard
          practice. If you believe an item was not handled to this standard,
          tell the crew lead on site and contact us the same day. In extreme
          heat our crews take safety breaks; this time is not billed on hourly
          jobs.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <H2>SMS/Text Messaging</H2>
        <p className="mt-3">
          By requesting a quote, submitting a form, calling or texting us,
          booking a service, or otherwise providing your mobile number, you
          agree to receive service-related text messages from {LEGAL_OPERATOR}. Messages may include quote
          responses, scheduling, appointment reminders, dispatch updates,
          arrival or ETA updates, service follow-up, invoice or payment
          reminders, and customer support. Service-related text messages may be
          sent from {PHONE_DISPLAY}.
        </p>
        <p className="mt-3">
          Message frequency varies based on your request, typically 1-8 messages
          per service request. Message and data rates may apply. Reply STOP to
          opt out. Reply HELP for help, or contact us at {phone}. Carriers are
          not liable for delayed or undelivered messages.
        </p>
        <p className="mt-3">
          Consent to receive text messages is not a condition of purchase.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <H2>Governing Law and Disputes</H2>
        <p className="mt-3">
          These terms are governed by the laws of the State of Arizona. Any
          dispute will be brought in the state courts located in Maricopa
          County, Arizona. Before filing, contact us at {phone} so we can try
          to resolve it directly. If any part of these terms is found
          unenforceable, the rest remains in effect.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <H2>Privacy</H2>
        <p className="mt-3">
          Our privacy practices are described in our{" "}
          <Link
            href="/privacy"
            className="font-semibold underline"
            style={{ color: P.pine }}
          >
            Privacy Policy
          </Link>
          .
        </p>
      </section>
    </PageShell>
  );
}

function PrivacyPage() {
  usePageMeta(PAGE_META.privacy);

  return (
    <PageShell title="Privacy Policy" updated={UPDATED}>
      <section>
        <h2
          className="font-display text-2xl font-bold"
          style={{ color: P.ink }}
        >
          Company Identity
        </h2>
        <p className="mt-3">
          {LEGAL_DISCLOSURE} References to "{BRAND_NAME}", "Progressive", "we",
          "us", and "our" mean {LEGAL_OPERATOR}.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2
          className="font-display text-2xl font-bold"
          style={{ color: P.ink }}
        >
          Information We Collect
        </h2>
        <p className="mt-3">
          We may collect your name, phone number, email address, service address
          or ZIP code, photos or descriptions of the job, scheduling
          preferences, quote details, payment status, and communication history
          when you request a quote or service.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <H2>Photos and AI Estimates</H2>
        <p className="mt-3">
          Photos you upload for an instant estimate are sent to a third-party AI
          provider (OpenAI) to identify items and produce a ballpark price. They
          are used only to prepare your estimate and to follow up on your
          request.
        </p>
        <p className="mt-3">
          Our crews may take photos on site before, during, and after a job to
          document item condition, access, and completed work. These photos
          are used to resolve claims, train our crews, and improve our service.
          We do not post photos of your home publicly without your permission.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2
          className="font-display text-2xl font-bold"
          style={{ color: P.ink }}
        >
          How We Use Information
        </h2>
        <p className="mt-3">
          We use information to provide quotes, schedule and dispatch crews,
          perform requested services, send appointment and ETA updates, follow
          up on jobs, process invoices, respond to support requests, improve our
          operations, and comply with legal or safety obligations.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2
          className="font-display text-2xl font-bold"
          style={{ color: P.ink }}
        >
          SMS and Mobile Information
        </h2>
        <p className="mt-3">
          If you provide your mobile number, we may use it to send
          service-related text messages about quotes, scheduling, dispatch
          updates, arrival or ETA updates, service follow-up, invoices, and
          customer support. These messages may be sent from {PHONE_DISPLAY}.
        </p>
        <p className="mt-3">
          We do not sell, rent, or share mobile phone numbers, SMS opt-in data,
          or SMS consent status with third parties or affiliates for their
          marketing or promotional purposes.
        </p>
        <p className="mt-3">
          You can opt out of SMS messages at any time by replying STOP. You can
          request help by replying HELP or contacting us at{" "}
          <a
            href={PHONE_HREF}
            className="font-semibold underline"
            style={{ color: P.pine }}
          >
            {PHONE_DISPLAY}
          </a>
          .
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2
          className="font-display text-2xl font-bold"
          style={{ color: P.ink }}
        >
          Sharing
        </h2>
        <p className="mt-3">
          We may share information with service providers who help us operate
          the website, manage communications, schedule jobs, process payments,
          or deliver requested services. We may also share information when
          required by law, to protect safety, or to enforce our terms.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2
          className="font-display text-2xl font-bold"
          style={{ color: P.ink }}
        >
          Your Choices
        </h2>
        <p className="mt-3">
          You may contact us to update your information or ask privacy
          questions. You may also opt out of service-related SMS messages by
          replying STOP, though we may still contact you through non-SMS methods
          when needed to complete a requested service.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2
          className="font-display text-2xl font-bold"
          style={{ color: P.ink }}
        >
          Contact
        </h2>
        <p className="mt-3">
          For privacy questions, call{" "}
          <a
            href={PHONE_HREF}
            className="font-semibold underline"
            style={{ color: P.pine }}
          >
            {PHONE_DISPLAY}
          </a>
          .
        </p>
      </section>
    </PageShell>
  );
}

export default function LegalPage({ kind }: { kind: LegalKind }) {
  return kind === "terms" ? <TermsPage /> : <PrivacyPage />;
}
