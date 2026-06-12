import type { ReactNode } from "react";
import { m, useReducedMotion } from "framer-motion";

/**
 * The site's one motion vocabulary: a subtle fade-up when a section scrolls
 * into view. Plays once, respects prefers-reduced-motion, no parallax or
 * bounce. Requires the LazyMotion provider in SiteLayout.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut", delay }}
    >
      {children}
    </m.div>
  );
}
