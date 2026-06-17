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
          <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: P.pine }}>
            Legal
          </p>
          <h1 className="font-display mt-3 text-4xl font-bold tracking-tight md:text-5xl" style={{ color: P.pine }}>
            {title}
          </h1>
          <p className="mt-3 text-sm" style={{ color: P.inkSoft }}>
            Last updated: {updated}
          </p>
          <div className="mt-10 space-y-8 text-base leading-7" style={{ color: P.inkSoft }}>
            {children}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}

function TermsPage() {
  usePageMeta(PAGE_META.terms);

  return (
    <PageShell title="Terms of Service" updated="June 16, 2026">
      <section>
        <h2 className="font-display text-2xl font-bold" style={{ color: P.ink }}>
          Company Identity
        </h2>
        <p className="mt-3">
          {LEGAL_DISCLOSURE} References to "{BRAND_NAME}", "Progressive", "we", "us", and
          "our" mean {LEGAL_OPERATOR} doing business through the {BRAND_NAME} brand.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2 className="font-display text-2xl font-bold" style={{ color: P.ink }}>
          Services
        </h2>
        <p className="mt-3">
          We provide junk removal, local moving, delivery, assembly, handyman, cleanout, and
          related services across the {SERVICE_AREA}. Quotes are based on the information you
          provide and may be updated if the job scope, access conditions, stairs, item count, item
          weight, or disposal requirements change.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2 className="font-display text-2xl font-bold" style={{ color: P.ink }}>
          Estimates, Scheduling, and Payment
        </h2>
        <p className="mt-3">
          We aim to provide clear pricing before work begins. A scheduled appointment is not
          confirmed until we accept the job and provide a service window. Payment is due when the
          service is completed unless we agree otherwise in writing.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2 className="font-display text-2xl font-bold" style={{ color: P.ink }}>
          SMS/Text Messaging
        </h2>
        <p className="mt-3">
          By requesting a quote, submitting a form, calling or texting us, booking a service, or
          otherwise providing your mobile number, you agree to receive service-related text
          messages from {BRAND_NAME}, a service brand operated by {LEGAL_OPERATOR}. Messages may
          include quote responses, scheduling, appointment reminders, dispatch updates, arrival or
          ETA updates, service follow-up, invoice or payment reminders, and customer support.
          Service-related text messages may be sent from {PHONE_DISPLAY}.
        </p>
        <p className="mt-3">
          Message frequency varies based on your request, typically 1-8 messages per service
          request. Message and data rates may apply. Reply STOP to opt out. Reply HELP for help,
          or contact us at{" "}
          <a href={PHONE_HREF} className="font-semibold underline" style={{ color: P.pine }}>
            {PHONE_DISPLAY}
          </a>
          . Carriers are not liable for delayed or undelivered messages.
        </p>
        <p className="mt-3">Consent to receive text messages is not a condition of purchase.</p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2 className="font-display text-2xl font-bold" style={{ color: P.ink }}>
          Customer Responsibilities
        </h2>
        <p className="mt-3">
          You are responsible for providing accurate job details, safe access to the work area,
          parking or loading access when needed, and notice of any hazardous, unusually heavy, or
          restricted materials before the crew arrives.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2 className="font-display text-2xl font-bold" style={{ color: P.ink }}>
          Privacy
        </h2>
        <p className="mt-3">
          Our privacy practices are described in our{" "}
          <Link href="/privacy" className="font-semibold underline" style={{ color: P.pine }}>
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
    <PageShell title="Privacy Policy" updated="June 16, 2026">
      <section>
        <h2 className="font-display text-2xl font-bold" style={{ color: P.ink }}>
          Company Identity
        </h2>
        <p className="mt-3">
          {LEGAL_DISCLOSURE} References to "{BRAND_NAME}", "Progressive", "we", "us", and
          "our" mean {LEGAL_OPERATOR} doing business through the {BRAND_NAME} brand.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2 className="font-display text-2xl font-bold" style={{ color: P.ink }}>
          Information We Collect
        </h2>
        <p className="mt-3">
          We may collect your name, phone number, email address, service address or ZIP code,
          photos or descriptions of the job, scheduling preferences, quote details, payment status,
          and communication history when you request a quote or service.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2 className="font-display text-2xl font-bold" style={{ color: P.ink }}>
          How We Use Information
        </h2>
        <p className="mt-3">
          We use information to provide quotes, schedule and dispatch crews, perform requested
          services, send appointment and ETA updates, follow up on jobs, process invoices, respond
          to support requests, improve our operations, and comply with legal or safety obligations.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2 className="font-display text-2xl font-bold" style={{ color: P.ink }}>
          SMS and Mobile Information
        </h2>
        <p className="mt-3">
          If you provide your mobile number, we may use it to send service-related text messages
          about quotes, scheduling, dispatch updates, arrival or ETA updates, service follow-up,
          invoices, and customer support. These messages may be sent from {PHONE_DISPLAY}.
        </p>
        <p className="mt-3">
          We do not sell, rent, or share mobile phone numbers, SMS opt-in data, or SMS consent
          status with third parties or affiliates for their marketing or promotional purposes.
        </p>
        <p className="mt-3">
          You can opt out of SMS messages at any time by replying STOP. You can request help by
          replying HELP or contacting us at{" "}
          <a href={PHONE_HREF} className="font-semibold underline" style={{ color: P.pine }}>
            {PHONE_DISPLAY}
          </a>
          .
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2 className="font-display text-2xl font-bold" style={{ color: P.ink }}>
          Sharing
        </h2>
        <p className="mt-3">
          We may share information with service providers who help us operate the website, manage
          communications, schedule jobs, process payments, or deliver requested services. We may
          also share information when required by law, to protect safety, or to enforce our terms.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2 className="font-display text-2xl font-bold" style={{ color: P.ink }}>
          Your Choices
        </h2>
        <p className="mt-3">
          You may contact us to update your information or ask privacy questions. You may also
          opt out of service-related SMS messages by replying STOP, though we may still contact you
          through non-SMS methods when needed to complete a requested service.
        </p>
      </section>

      <section className={sectionClass} style={{ borderColor: P.line }}>
        <h2 className="font-display text-2xl font-bold" style={{ color: P.ink }}>
          Contact
        </h2>
        <p className="mt-3">
          For privacy questions, call{" "}
          <a href={PHONE_HREF} className="font-semibold underline" style={{ color: P.pine }}>
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
