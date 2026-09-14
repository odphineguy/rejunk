/**
 * Static per-route prerender for the public marketing site.
 *
 * Runs AFTER `vite build`. The SPA only ever ships one index.html, whose <head>
 * carries the HOME page's title/description/canonical/OG. Social scrapers
 * (iMessage, Facebook, WhatsApp, LinkedIn) and non-JS crawlers don't run our
 * usePageMeta() effect, so without this every shared link showed the home meta.
 *
 * This emits one real static HTML file per marketing route — a copy of the
 * built index.html with that route's <head> meta and JSON-LD swapped in. The <body> stays
 * the empty SPA mount (Google renders the JS body fine; we deliberately do NOT
 * server-render it, which would bake framer-motion's initial opacity:0 into the
 * static HTML and require a hydration-gate refactor). Vercel serves these files
 * for their paths before the SPA rewrite kicks in; the JS bundle then hydrates
 * exactly as before.
 *
 * SEO_ROUTES is also the source of truth for the generated sitemap.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LEGAL_UPDATED,
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
  type LegalSection,
} from "../client/src/pages/landing/content/legal.ts";
import {
  buildStructuredData,
  renderSitemap,
  SEO_ROUTES,
  SITE_ORIGIN,
} from "../client/src/pages/landing/content/seo.ts";
import {
  PHONE_DISPLAY,
  PHONE_HREF,
} from "../client/src/pages/landing/content/site.ts";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, "../dist/public");
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const template = readFileSync(resolve(DIST, "index.html"), "utf8");

/**
 * The legal pages are plain text with no motion, so they ARE server-rendered:
 * the same content the React page shows is written into <div id="root"> as
 * static HTML. Search engines, AI crawlers, and link previews get the full
 * Terms / Privacy text without JavaScript; React's createRoot() then replaces
 * it with the live page on load. Token vocabulary mirrors LegalPage.tsx.
 */
function richHtml(text: string): string {
  return text
    .split(/(\{PHONE\}|\{PRIVACY_LINK\}|\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map(part => {
      if (part === "{PHONE}") return `<a href="${PHONE_HREF}">${escapeHtml(PHONE_DISPLAY)}</a>`;
      if (part === "{PRIVACY_LINK}") return `<a href="/privacy">Privacy Policy</a>`;
      if (part.startsWith("**") && part.endsWith("**")) return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
      return escapeHtml(part);
    })
    .join("");
}

function legalBody(title: string, sections: LegalSection[]): string {
  const body = sections
    .map(section => {
      const paragraphs = (section.paragraphs ?? []).map(p => `<p>${richHtml(p)}</p>`).join("\n");
      const bullets = section.bullets
        ? `<ul>${section.bullets.map(b => `<li>${richHtml(b)}</li>`).join("\n")}</ul>`
        : "";
      return `<section><h2>${escapeHtml(section.title)}</h2>\n${paragraphs}\n${bullets}</section>`;
    })
    .join("\n");
  return `<main style="max-width:48rem;margin:0 auto;padding:3rem 1.25rem;font-family:system-ui,sans-serif;line-height:1.75;color:#334155"><article><h1>${escapeHtml(title)}</h1><p>Last updated: ${escapeHtml(LEGAL_UPDATED)}</p>\n${body}</article></main>`;
}

const STATIC_BODIES: Record<string, string> = {
  "/terms": legalBody("Terms of Service", TERMS_SECTIONS),
  "/privacy": legalBody("Privacy Policy", PRIVACY_SECTIONS),
};

function buildPage(
  path: string,
  meta: { title: string; description: string }
): string {
  const url = path === "/" ? `${SITE_ORIGIN}/` : SITE_ORIGIN + path;
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const structuredData = JSON.stringify(
    buildStructuredData(path, meta),
    null,
    2
  ).replace(/</g, "\\u003c");

  const swaps: Array<[RegExp, string]> = [
    [/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`],
    [
      /(<meta\s+name="description"\s+content=")[\s\S]*?(")/,
      `$1${description}$2`,
    ],
    [/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${url}$2`],
    [/(<meta\s+property="og:title"\s+content=")[\s\S]*?(")/, `$1${title}$2`],
    [
      /(<meta\s+property="og:description"\s+content=")[\s\S]*?(")/,
      `$1${description}$2`,
    ],
    [/(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${url}$2`],
    [/(<meta\s+name="twitter:title"\s+content=")[\s\S]*?(")/, `$1${title}$2`],
    [
      /(<meta\s+name="twitter:description"\s+content=")[\s\S]*?(")/,
      `$1${description}$2`,
    ],
    [
      /<script\s+id="structured-data"\s+type="application\/ld\+json">[\s\S]*?<\/script>/,
      `<script id="structured-data" type="application/ld+json">\n${structuredData}\n    </script>`,
    ],
  ];

  let html = template;
  for (const [pattern, replacement] of swaps) {
    if (!pattern.test(html)) {
      throw new Error(
        `prerender: pattern ${pattern} not found in index.html — template changed?`
      );
    }
    html = html.replace(pattern, replacement);
  }
  const staticBody = STATIC_BODIES[path];
  if (staticBody) {
    if (!/<div id="root"><\/div>/.test(html)) {
      throw new Error("prerender: empty <div id=\"root\"></div> not found — template changed?");
    }
    html = html.replace('<div id="root"></div>', `<div id="root">${staticBody}</div>`);
  }
  return html;
}

let count = 0;
for (const route of SEO_ROUTES) {
  const outDir = resolve(DIST, `.${route.path}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, "index.html"),
    buildPage(route.path, route.meta),
    "utf8"
  );
  count += 1;
}

writeFileSync(resolve(DIST, "sitemap.xml"), renderSitemap(), "utf8");

console.log(
  `prerender: wrote ${count} static route pages + sitemap → dist/public`
);
