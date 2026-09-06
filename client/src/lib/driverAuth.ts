/**
 * Driver activation key formatting. Key generation, session tokens, and PIN
 * hashing moved to the server on 2026-09-06 (server/driverAccess.ts) so the
 * browser never handles driver credentials — only this input normalizer stays.
 */

/** Uppercases and re-groups whatever the driver typed/pasted into XXXX-XXXX-XXXX. */
export function normalizeActivationKey(raw: string) {
  const characters = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  const groups = [characters.slice(0, 4), characters.slice(4, 8), characters.slice(8, 12)].filter(Boolean);
  return groups.join("-");
}
