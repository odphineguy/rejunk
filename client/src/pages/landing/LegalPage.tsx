import type { ReactNode } from "react";
import { Link } from "wouter";

import {
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
  type LegalSection,
} from "./content/legal";
import { PAGE_META, PHONE_DISPLAY, PHONE_HREF } from "./content/site";
import { SiteLayout } from "./layout/SiteLayout";
import { usePageMeta } from "./lib/usePageMeta";
import { PALETTE } from "./palette";

const P = PALETTE;

type LegalKind = "terms" | "privacy";

/**
 * Render one legal paragraph with the tiny token vocabulary from content/legal.ts:
 * `{PHONE}`, `{PRIVACY_LINK}`, and `**bold**`. Same text is baked into the
 * static HTML by scripts/prerender.ts, so keep the vocabulary in sync there.
 */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\{PHONE\}|\{PRIVACY_LINK\}|\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (part === "{PHONE}") {
          return (
            <a key={index} href={PHONE_HREF} className="font-semibold underline" style={{ color: P.pine }}>
              {PHONE_DISPLAY}
            </a>
          );
        }
        if (part === "{PRIVACY_LINK}") {
          return (
            <Link key={index} href="/privacy" className="font-semibold underline" style={{ color: P.pine }}>
              Privacy Policy
            </Link>
          );
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={index} style={{ color: P.ink }}>
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

function Section({ section, first }: { section: LegalSection; first: boolean }) {
  return (
    <section className={first ? undefined : "border-t pt-8"} style={first ? undefined : { borderColor: P.line }}>
      <h2 className="font-display text-2xl font-bold" style={{ color: P.ink }}>
        {section.title}
      </h2>
      {section.paragraphs?.map((paragraph, index) => (
        <p key={index} className="mt-3">
          <Rich text={paragraph} />
        </p>
      ))}
      {section.bullets && (
        <ul className="mt-3 list-disc space-y-2 pl-6">
          {section.bullets.map((bullet, index) => (
            <li key={index}>
              <Rich text={bullet} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PageShell({
  title,
  children,
}: {
  title: string;
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

function TermsPage() {
  usePageMeta(PAGE_META.terms);
  return (
    <PageShell title="Terms of Service">
      {TERMS_SECTIONS.map((section, index) => (
        <Section key={section.title} section={section} first={index === 0} />
      ))}
    </PageShell>
  );
}

function PrivacyPage() {
  usePageMeta(PAGE_META.privacy);
  return (
    <PageShell title="Privacy Policy">
      {PRIVACY_SECTIONS.map((section, index) => (
        <Section key={section.title} section={section} first={index === 0} />
      ))}
    </PageShell>
  );
}

export default function LegalPage({ kind }: { kind: LegalKind }) {
  return kind === "terms" ? <TermsPage /> : <PrivacyPage />;
}
