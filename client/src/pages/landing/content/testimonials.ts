/**
 * REAL customer reviews (collected 2026-06, screenshots from Abe — he worked
 * all three jobs). Names shortened to first name + last initial since some
 * came through private Housecall Pro threads rather than public review pages.
 * Only 3 so far — each page shows all of them; add more as they come in.
 */

export interface Testimonial {
  quote: string;
  name: string;
  /** Source / location attribution shown after the name. */
  area: string;
  /** Star rating (all 5 so far). */
  stars: number;
  /** Which pages this quote appears on. */
  tags: Array<"home" | "junk" | "moving" | "assembly">;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote: "Great service from beginning to end. Fair pricing and great communication.",
    name: "Michael R.",
    area: "Furniture assembly · Glendale, AZ",
    stars: 5,
    tags: ["home", "junk", "moving", "assembly"],
  },
  {
    quote: "Great service, super friendly and answered all my questions! Highly recommend.",
    name: "Jozlin B.",
    area: "Verified customer review",
    stars: 5,
    tags: ["home", "junk", "moving", "assembly"],
  },
  {
    quote: "Thank you — he was very helpful and friendly.",
    name: "Sandra H.",
    area: "Verified customer",
    stars: 5,
    tags: ["home", "junk", "moving", "assembly"],
  },
];
