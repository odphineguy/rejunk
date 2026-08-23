/** Verified five-star Thumbtack reviews supplied by the business owner. */

export interface Testimonial {
  quote: string;
  name: string;
  area: string;
  stars: number;
  tags: Array<"home" | "junk" | "moving" | "piano" | "assembly">;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Working with the company was stress free. Communication was great. My two movers were fantastic — quick, conscientious, and went above and beyond even when it was 113°.",
    name: "Annamarie D.",
    area: "Thumbtack · Local Moving",
    stars: 5,
    tags: ["home", "moving"],
  },
  {
    quote:
      "The guys we had went above and beyond to help with the cleanup of my in-laws' home.",
    name: "Erin J.",
    area: "Thumbtack · Verified hire",
    stars: 5,
    tags: ["home", "junk"],
  },
  {
    quote: "Excellent service, value and quality.",
    name: "Wanda D.",
    area: "Thumbtack · Furniture Assembly",
    stars: 5,
    tags: ["home", "assembly"],
  },
  {
    quote: "Fabulous company. Prompt response and reasonably priced.",
    name: "Tina B.",
    area: "Thumbtack · Local Moving",
    stars: 5,
    tags: ["moving"],
  },
  {
    quote: "Customer service was amazing!",
    name: "Amy D.",
    area: "Thumbtack · Piano Moving",
    stars: 5,
    tags: ["piano"],
  },
  {
    quote:
      "They never slowed down and maintained a positive, professional attitude the entire time.",
    name: "Tami E.",
    area: "Thumbtack · Local Moving",
    stars: 5,
    tags: ["moving"],
  },
  {
    quote: "Great job.",
    name: "Trish D.",
    area: "Thumbtack · Furniture Assembly",
    stars: 5,
    tags: ["assembly"],
  },
  {
    quote:
      "Great service from beginning to end. Fair pricing and great communication.",
    name: "Michael R.",
    area: "Thumbtack · Furniture Assembly",
    stars: 5,
    tags: ["assembly"],
  },
];
