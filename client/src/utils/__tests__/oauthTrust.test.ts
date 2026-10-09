import { describe, expect, it } from "vitest";

import { isTrustedReturnUrl } from "@/lib/oauthTrust";

describe("isTrustedReturnUrl", () => {
  it("accepts the exact AI callback hosts", () => {
    expect(isTrustedReturnUrl("https://claude.ai/api/mcp/auth_callback?code=x")).toBe(true);
    expect(isTrustedReturnUrl("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true);
    expect(isTrustedReturnUrl("http://localhost:33418/callback")).toBe(true);
    expect(isTrustedReturnUrl("http://127.0.0.1:5000/callback")).toBe(true);
  });

  it("rejects look-alike hosts", () => {
    expect(isTrustedReturnUrl("https://evil-claude.ai/callback")).toBe(false);
    expect(isTrustedReturnUrl("https://claude.ai.evil.com/callback")).toBe(false);
    expect(isTrustedReturnUrl("https://www.claude.ai/callback")).toBe(false);
    expect(isTrustedReturnUrl("https://chatgpt.com@evil.com/callback")).toBe(false);
  });

  it("requires https except on localhost", () => {
    expect(isTrustedReturnUrl("http://claude.ai/callback")).toBe(false);
    expect(isTrustedReturnUrl("javascript:alert(1)")).toBe(false);
    expect(isTrustedReturnUrl("not a url")).toBe(false);
  });
});
