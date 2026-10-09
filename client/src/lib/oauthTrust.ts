/**
 * Where the OAuth consent page (pages/OAuthConsent.tsx) may send a user back to.
 * Dynamic client registration lets anyone register an app, so this list is the
 * only redirect allowlist. Exact host matches only — never "ends with", so
 * evil-claude.ai and claude.ai.evil.com fail. https required except localhost
 * (Claude Code's local callback).
 */
const TRUSTED_HOSTS = ["claude.ai", "chatgpt.com", "localhost", "127.0.0.1"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

export function isTrustedReturnUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!TRUSTED_HOSTS.includes(url.hostname)) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOCAL_HOSTS.includes(url.hostname);
}
