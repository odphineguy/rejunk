/**
 * Crypto helpers for driver activation: activation keys, session tokens, and
 * PIN hashing. PINs are hashed with PBKDF2-SHA256 via WebCrypto using the exact
 * same parameters as the server-side helpers in `server/driverAuth.ts`, so a
 * hash written by either side verifies on the other. Format:
 *   pbkdf2-sha256$<iterations>$<saltBase64>$<hashBase64>
 */

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_BYTES = 32;

// No 0/O or 1/I — drivers type these keys on a phone.
const KEY_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomChars(length: number) {
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => KEY_CHARSET[value % KEY_CHARSET.length]).join("");
}

/** XXXX-XXXX-XXXX activation key. */
export function generateActivationKey() {
  return `${randomChars(4)}-${randomChars(4)}-${randomChars(4)}`;
}

/** Uppercases and re-groups whatever the driver typed/pasted into XXXX-XXXX-XXXX. */
export function normalizeActivationKey(raw: string) {
  const characters = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  const groups = [characters.slice(0, 4), characters.slice(4, 8), characters.slice(8, 12)].filter(Boolean);
  return groups.join("-");
}

export function generateSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(pin, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  const [scheme, iterationsRaw, saltB64, hashB64] = storedHash.split("$");
  if (scheme !== "pbkdf2-sha256" || !iterationsRaw || !saltB64 || !hashB64) return false;
  const iterations = Number.parseInt(iterationsRaw, 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const hash = await pbkdf2(pin, fromBase64(saltB64), iterations);
  return timingSafeEqual(hash, fromBase64(hashB64));
}

async function pbkdf2(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    keyMaterial,
    PBKDF2_KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

function toBase64(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function toBase64Url(bytes: Uint8Array) {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64(value: string) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
