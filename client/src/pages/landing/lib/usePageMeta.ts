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

export function usePageMeta(meta: { title: string; description: string }) {
  useEffect(() => {
    document.title = meta.title;
    upsertMeta("name", "description", meta.description);
    upsertMeta("property", "og:title", meta.title);
    upsertMeta("property", "og:description", meta.description);
  }, [meta.title, meta.description]);
}
