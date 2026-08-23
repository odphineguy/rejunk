/**
 * The public marketing site's routes, in a dependency-free module (same reason
 * palette.ts exists): App.tsx needs this list to pick the landing bundle
 * without pulling in any page code.
 */

export const PUBLIC_PATHS = [
  "/",
  "/junk-removal",
  "/moving",
  "/piano-moving",
  "/assembly-handyman",
  "/estimate",
  "/instant-estimate",
  "/terms",
  "/privacy",
] as const;

export function isPublicPath(location: string): boolean {
  return (PUBLIC_PATHS as readonly string[]).includes(location);
}
