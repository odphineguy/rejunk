import { useEffect } from "react";

/**
 * Tiny SPA head manager for the marketing pages: sets document.title and
 * upserts description/og meta tags. (No SSR/prerender — adequate for now;
 * revisit with vite prerendering if organic search becomes a priority.)
 */

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let tag = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", "canonical");
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
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
    }
  }, [meta.title, meta.description]);
}
