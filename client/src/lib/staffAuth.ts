/**
 * Crypto helpers for staff login. Staff PINs use the exact same PBKDF2-SHA256
 * scheme as driver PINs (`lib/driverAuth.ts`), so a hash written for either
 * table verifies with the same code — re-exporting keeps the two from ever
 * drifting apart.
 */

export { generateSessionToken, hashPin, verifyPin } from "@/lib/driverAuth";
