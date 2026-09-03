import { HOME_FAQS } from "./home";
import { SERVICES, type Faq } from "./services";
import {
  bookingUrl,
  BRAND_NAME,
  FACEBOOK_URL,
  GOOGLE_BUSINESS_URL,
  PAGE_META,
  PHONE_HREF,
  THUMBTACK_PROFILE_URL,
  YELP_URL,
} from "./site";

export const SITE_ORIGIN = "https://www.progressive-junk.xyz";

export const SEO_ROUTES = [
  {
    path: "/",
    meta: PAGE_META.home,
    lastModified: "2026-08-10",
    changeFrequency: "weekly",
    priority: "1.0",
  },
  {
    path: "/junk-removal",
    meta: PAGE_META.junk,
    lastModified: "2026-08-10",
    changeFrequency: "monthly",
    priority: "0.8",
  },
  {
    path: "/moving",
    meta: PAGE_META.moving,
    lastModified: "2026-08-10",
    changeFrequency: "monthly",
    priority: "0.8",
  },
  {
    path: "/pallet-delivery",
    meta: PAGE_META.delivery,
    lastModified: "2026-09-03",
    changeFrequency: "monthly",
    priority: "0.9",
  },
  {
    path: "/piano-moving",
    meta: PAGE_META.piano,
    lastModified: "2026-08-23",
    changeFrequency: "monthly",
    priority: "0.9",
  },
  {
    path: "/assembly-handyman",
    meta: PAGE_META.assembly,
    lastModified: "2026-08-10",
    changeFrequency: "monthly",
    priority: "0.8",
  },
  {
    path: "/estimate",
    meta: PAGE_META.estimate,
    lastModified: "2026-06-17",
    changeFrequency: "monthly",
    priority: "0.7",
  },
  {
    path: "/instant-estimate",
    meta: PAGE_META.instantEstimate,
    lastModified: "2026-06-18",
    changeFrequency: "monthly",
    priority: "0.8",
  },
  {
    path: "/terms",
    meta: PAGE_META.terms,
    lastModified: "2026-06-17",
    changeFrequency: "yearly",
    priority: "0.3",
  },
  {
    path: "/privacy",
    meta: PAGE_META.privacy,
    lastModified: "2026-06-17",
    changeFrequency: "yearly",
    priority: "0.3",
  },
] as const;

const BUSINESS_ID = `${SITE_ORIGIN}/#business`;
const WEBSITE_ID = `${SITE_ORIGIN}/#website`;
const PHONE_E164 = PHONE_HREF.replace("tel:", "");

const SERVICE_AREAS = [
  "Phoenix",
  "Chandler",
  "Gilbert",
  "Mesa",
  "Tempe",
  "Scottsdale",
].map(name => ({ "@type": "City", name }));

function absoluteUrl(path: string): string {
  return path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
}

function serviceUrl(slug: keyof typeof SERVICES): string {
  return absoluteUrl(`/${slug}`);
}

function faqSchema(url: string, faqs: Faq[]) {
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: faqs.map(faq => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };
}

function businessSchema() {
  return {
    "@type": "MovingCompany",
    "@id": BUSINESS_ID,
    name: BRAND_NAME,
    url: `${SITE_ORIGIN}/`,
    telephone: PHONE_E164,
    description:
      "Local junk removal, moving and delivery, and furniture assembly for Phoenix and the East Valley, with upfront pricing and careful crews.",
    priceRange: "$$",
    image: {
      "@type": "ImageObject",
      url: `${SITE_ORIGIN}/og-image.jpg`,
      width: 1200,
      height: 630,
    },
    logo: {
      "@type": "ImageObject",
      url: `${SITE_ORIGIN}/progressive-logo.png`,
      width: 600,
      height: 125,
    },
    address: {
      "@type": "PostalAddress",
      addressLocality: "Phoenix",
      addressRegion: "AZ",
      addressCountry: "US",
    },
    areaServed: SERVICE_AREAS,
    contactPoint: {
      "@type": "ContactPoint",
      telephone: PHONE_E164,
      contactType: "customer service",
      areaServed: "US-AZ",
      availableLanguage: "English",
    },
    identifier: [
      {
        "@type": "PropertyValue",
        propertyID: "USDOT",
        value: "4421119",
      },
      {
        "@type": "PropertyValue",
        propertyID: "MC",
        value: "1763629",
      },
    ],
    sameAs: [
      YELP_URL,
      GOOGLE_BUSINESS_URL,
      FACEBOOK_URL,
      THUMBTACK_PROFILE_URL,
    ].filter(Boolean),
    knowsAbout: [
      "Junk removal",
      "Local moving",
      "Furniture delivery",
      "Pallet delivery",
      "Liftgate delivery",
      "Piano moving",
      "Furniture assembly",
      "Garage cleanouts",
      "Estate cleanouts",
    ],
    makesOffer: Object.values(SERVICES).map(service => ({
      "@type": "Offer",
      url: serviceUrl(service.slug),
      itemOffered: {
        "@type": "Service",
        "@id": `${serviceUrl(service.slug)}#service`,
        name: service.name,
      },
    })),
    potentialAction: {
      "@type": "ReserveAction",
      name: "Book a service",
      target: {
        "@type": "EntryPoint",
        urlTemplate: bookingUrl("structured-data"),
      },
    },
  };
}

export function buildStructuredData(
  routePath: string,
  meta: { title: string; description: string }
) {
  const normalizedPath = routePath === "/" ? "/" : routePath.replace(/\/$/, "");
  const url = absoluteUrl(normalizedPath);
  const route = SEO_ROUTES.find(entry => entry.path === normalizedPath);
  const service = Object.values(SERVICES).find(
    entry => `/${entry.slug}` === normalizedPath
  );
  const faqs = normalizedPath === "/" ? HOME_FAQS : service?.faqs;

  const mainEntityIds: Array<{ "@id": string }> = [];
  if (service) mainEntityIds.push({ "@id": `${url}#service` });
  if (faqs) mainEntityIds.push({ "@id": `${url}#faq` });
  if (normalizedPath === "/") mainEntityIds.unshift({ "@id": BUSINESS_ID });

  const webPage: Record<string, unknown> = {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: meta.title,
    description: meta.description,
    inLanguage: "en-US",
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": BUSINESS_ID },
  };
  if (route) webPage.dateModified = route.lastModified;
  if (mainEntityIds.length > 0) webPage.mainEntity = mainEntityIds;

  const graph: Array<Record<string, unknown>> = [
    businessSchema(),
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      url: `${SITE_ORIGIN}/`,
      name: BRAND_NAME,
      description: PAGE_META.home.description,
      inLanguage: "en-US",
      publisher: { "@id": BUSINESS_ID },
    },
    webPage,
  ];

  if (service) {
    graph.push({
      "@type": "Service",
      "@id": `${url}#service`,
      url,
      name: `${service.name} in Phoenix, Arizona`,
      serviceType: service.name,
      description: meta.description,
      provider: { "@id": BUSINESS_ID },
      areaServed:
        service.slug === "piano-moving"
          ? { "@type": "State", name: "Arizona" }
          : SERVICE_AREAS,
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: service.subServicesTitle,
        itemListElement: service.subServices.map(item => ({
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: item.title,
            description: item.blurb,
          },
        })),
      },
    });
  }

  if (faqs) graph.push(faqSchema(url, faqs));

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

export function renderSitemap(): string {
  const urls = SEO_ROUTES.map(
    route => `  <url>
    <loc>${absoluteUrl(route.path)}</loc>
    <lastmod>${route.lastModified}</lastmod>
    <changefreq>${route.changeFrequency}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
