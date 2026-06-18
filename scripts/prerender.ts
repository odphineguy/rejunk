/**
 * Static per-route prerender for the public marketing site.
 *
 * Runs AFTER `vite build`. The SPA only ever ships one index.html, whose <head>
 * carries the HOME page's title/description/canonical/OG. Social scrapers
 * (iMessage, Facebook, WhatsApp, LinkedIn) and non-JS crawlers don't run our
 * usePageMeta() effect, so without this every shared link showed the home meta.
 *
 * This emits one real static HTML file per marketing route — a copy of the
 * built index.html with that route's <head> meta swapped in. The <body> stays
 * the empty SPA mount (Google renders the JS body fine; we deliberately do NOT
 * server-render it, which would bake framer-motion's initial opacity:0 into the
 * static HTML and require a hydration-gate refactor). Vercel serves these files
 * for their paths before the SPA rewrite kicks in; the JS bundle then hydrates
 * exactly as before.
 *
 * Keep the route list in sync with publicPaths.ts / PAGE_META.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PAGE_META } from "../client/src/pages/landing/content/site.ts";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, "../dist/public");
const ORIGIN = "https://www.progressive-junk.xyz";

// Home ("/") is already correct in the built index.html — only sub-routes need files.
const ROUTES: Array<{ path: string; meta: { title: string; description: string } }> = [
  { path: "/junk-removal", meta: PAGE_META.junk },
  { path: "/moving", meta: PAGE_META.moving },
  { path: "/assembly-handyman", meta: PAGE_META.assembly },
  { path: "/estimate", meta: PAGE_META.estimate },
  { path: "/instant-estimate", meta: PAGE_META.instantEstimate },
  { path: "/terms", meta: PAGE_META.terms },
  { path: "/privacy", meta: PAGE_META.privacy },
];

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const template = readFileSync(resolve(DIST, "index.html"), "utf8");

function buildPage(path: string, meta: { title: string; description: string }): string {
  const url = ORIGIN + path;
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);

  const swaps: Array<[RegExp, string]> = [
    [/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`],
    [/(<meta\s+name="description"\s+content=")[\s\S]*?(")/, `$1${description}$2`],
    [/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${url}$2`],
    [/(<meta\s+property="og:title"\s+content=")[\s\S]*?(")/, `$1${title}$2`],
    [/(<meta\s+property="og:description"\s+content=")[\s\S]*?(")/, `$1${description}$2`],
    [/(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${url}$2`],
    [/(<meta\s+name="twitter:title"\s+content=")[\s\S]*?(")/, `$1${title}$2`],
    [/(<meta\s+name="twitter:description"\s+content=")[\s\S]*?(")/, `$1${description}$2`],
  ];

  let html = template;
  for (const [pattern, replacement] of swaps) {
    if (!pattern.test(html)) {
      throw new Error(`prerender: pattern ${pattern} not found in index.html — template changed?`);
    }
    html = html.replace(pattern, replacement);
  }
  return html;
}

let count = 0;
for (const route of ROUTES) {
  const outDir = resolve(DIST, `.${route.path}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "index.html"), buildPage(route.path, route.meta), "utf8");
  count += 1;
}

console.log(`prerender: wrote ${count} static route pages → dist/public/<route>/index.html`);
