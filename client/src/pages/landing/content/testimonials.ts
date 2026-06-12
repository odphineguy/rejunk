/**
 * ⚠️ PLACEHOLDER TESTIMONIALS — these are written-for-layout examples, not
 * real customer quotes. Replace with real reviews (Google, word-of-mouth)
 * before this section ships on the live site, or hide the section.
 */

export interface Testimonial {
  quote: string;
  name: string;
  area: string;
  /** Which pages this quote appears on. */
  tags: Array<"home" | "junk" | "moving" | "assembly">;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "They cleared my whole garage in under two hours and told me which pieces were going to donation. You can tell they actually care where it ends up.",
    name: "R. Alvarez",
    area: "Chandler",
    tags: ["home", "junk"],
  },
  {
    quote:
      "Moved my one-bedroom across Mesa without a single scratch. Showed up on time, wrapped everything, done by lunch.",
    name: "K. Tran",
    area: "Mesa",
    tags: ["home", "moving"],
  },
  {
    quote:
      "They put grab bars in my mother's bathroom and walked her through everything they did. Patient and kind — she's already recommended them to her neighbors.",
    name: "D. Whitfield",
    area: "Gilbert",
    tags: ["home", "assembly"],
  },
  {
    quote:
      "Called at 9am about an old fridge and a couch. Gone by 1pm, price exactly what they quoted.",
    name: "M. Okafor",
    area: "Tempe",
    tags: ["junk"],
  },
  {
    quote:
      "Hired them just to load a rental truck. Fast, careful, and they packed it tighter than I ever could have.",
    name: "S. Romero",
    area: "Phoenix",
    tags: ["moving"],
  },
  {
    quote:
      "Two dressers and a bed frame assembled in an afternoon, every drawer square. They even hauled off the boxes.",
    name: "J. Pham",
    area: "Scottsdale",
    tags: ["assembly"],
  },
];
