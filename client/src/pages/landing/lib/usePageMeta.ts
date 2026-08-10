import { useEffect } from "react";

import { buildStructuredData } from "../content/seo";

/**
 * SPA head manager for marketing-page navigation. Production routes are also
 * prerendered with the same metadata and JSON-LD for non-JavaScript crawlers.
 */

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`
  );
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let tag = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]'
  );
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", "canonical");
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
}

function upsertStructuredData(data: ReturnType<typeof buildStructuredData>) {
  let tag = document.head.querySelector<HTMLScriptElement>(
    'script[id="structured-data"]'
  );
  if (!tag) {
    tag = document.createElement("script");
    tag.id = "structured-data";
    tag.type = "application/ld+json";
    document.head.appendChild(tag);
  }
  tag.textContent = JSON.stringify(data);
}

export function usePageMeta(meta: { title: string; description: string }) {
  useEffect(() => {
    document.title = meta.title;
    upsertMeta("name", "description", meta.description);
    upsertMeta("property", "og:title", meta.title);
    upsertMeta("property", "og:description", meta.description);

    // Per-page canonical + og:url. The static index.html canonical points at the
    // home page, so without this every route would claim "/" as its canonical
    // and the service pages could be dropped from the index. Strip any query/
    // hash so duplicate-param URLs collapse to one canonical.
    if (typeof window !== "undefined") {
      const url = window.location.origin + window.location.pathname;
      upsertCanonical(url);
      upsertMeta("property", "og:url", url);
      upsertStructuredData(buildStructuredData(window.location.pathname, meta));
    }
  }, [meta.title, meta.description]);
}
