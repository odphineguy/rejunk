import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { rememberRequestedPath } from "@/components/StaffSessionGate";
import { isTrustedReturnUrl } from "@/lib/oauthTrust";
import { supabase } from "@/lib/supabase";
import {
  getStoredStaffSession,
  validateStoredStaffSession,
  type StoredStaffSession,
} from "@/lib/staffSession";

/**
 * MCP Phase 2: the Supabase OAuth 2.1 Server sends Claude / ChatGPT users here
 * (`/oauth/consent?authorization_id=…`). A full office sign-in (email account +
 * PIN) is required before anything can be approved, and only AI apps that send
 * the user back to an exactly-listed host (lib/oauthTrust.ts) can be approved.
 */

type Request = {
  id: string;
  appName: string;
  returnUrl: string;
};

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ask"; request: Request; session: StoredStaffSession }
  | { kind: "leaving" };

export default function OAuthConsent() {
  const [, navigate] = useLocation();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  const authorizationId = new URLSearchParams(window.location.search).get("authorization_id");

  const goBack = (redirectUrl: string) => {
    if (!isTrustedReturnUrl(redirectUrl)) {
      setState({ kind: "error", message: "This app isn't recognised, so Rejunk won't send you back to it." });
      return;
    }
    setState({ kind: "leaving" });
    window.location.assign(redirectUrl);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!authorizationId) {
        setState({ kind: "error", message: "This link is missing its request. Start again from the AI app." });
        return;
      }
      if (!supabase) {
        setState({ kind: "error", message: "Rejunk can't reach its database right now. Try again later." });
        return;
      }

      // Full sign-in required: a PIN-minted session tied to a real account.
      const check = getStoredStaffSession() ? await validateStoredStaffSession() : "missing";
      const session = getStoredStaffSession();
      if (cancelled) return;
      if (check === "offline") {
        setState({ kind: "error", message: "Rejunk can't check your sign-in right now. Try again in a minute." });
        return;
      }
      if (check !== "valid" || !session?.authUserId) {
        // The gate only keeps the path; this page needs its ?authorization_id too.
        rememberRequestedPath(window.location.pathname + window.location.search);
        navigate("/login", { replace: true });
        return;
      }

      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (cancelled) return;
      if (error || !data) {
        setState({
          kind: "error",
          message: "This request has expired or was already used. Start again from the AI app.",
        });
        return;
      }
      // Already approved before: Supabase hands back the return link straight away.
      if (!("authorization_id" in data)) {
        goBack(data.redirect_url);
        return;
      }
      if (data.user.id !== session.authUserId) {
        setState({ kind: "error", message: "This request belongs to a different Rejunk account." });
        return;
      }
      setState({
        kind: "ask",
        session,
        request: {
          id: data.authorization_id,
          appName: data.client.name || "An AI app",
          returnUrl: data.redirect_uri,
        },
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = async (approve: boolean) => {
    if (state.kind !== "ask" || !supabase) return;
    setBusy(true);
    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(state.request.id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(state.request.id, { skipBrowserRedirect: true });
    setBusy(false);
    if (error || !data) {
      setState({ kind: "error", message: "That didn't go through. Start again from the AI app." });
      return;
    }
    goBack(data.redirect_url);
  };

  if (state.kind === "loading" || state.kind === "leaving") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/30 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        {state.kind === "loading" ? "Checking your session..." : "Sending you back..."}
      </div>
    );
  }

  const trusted = state.kind === "ask" && isTrustedReturnUrl(state.request.returnUrl);
  const returnHost =
    state.kind === "ask"
      ? (() => {
          try {
            return new URL(state.request.returnUrl).hostname;
          } catch {
            return state.request.returnUrl;
          }
        })()
      : "";

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="border-b border-[var(--pine-line)] bg-[#052a2b] px-4 py-4">
        <div className="mx-auto flex max-w-md items-center justify-center">
          <img src="/rejunk-mark.png" alt="Rejunk" className="h-8 w-auto" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-8">
        <section className="space-y-5 rounded-lg border border-border bg-background p-6 shadow-sm">
          <div className="space-y-2 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#155e3f]/10 text-[#155e3f]">
              <ShieldCheck className="size-6" />
            </span>
            <h1 className="text-xl font-bold">
              {state.kind === "ask" ? `${state.request.appName} wants to connect to Rejunk` : "Can't connect"}
            </h1>
          </div>

          {state.kind === "error" && (
            <p className="text-center text-sm font-medium text-[#052a2b]">{state.message}</p>
          )}

          {state.kind === "ask" && (
            <>
              <div className="space-y-1 text-sm">
                <p>
                  Signed in as <span className="font-medium">{state.session.fullName}</span> ({state.session.email})
                </p>
                <p className="text-muted-foreground">Sends you back to: {returnHost}</p>
              </div>

              <div className="space-y-2 rounded-md bg-muted/50 p-4 text-sm">
                <p className="font-medium">If you approve, it can:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Look up your company's jobs, clients and schedule</li>
                  <li>Only see what you can see in Rejunk</li>
                </ul>
                <p className="font-medium">It can't:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>See money figures unless you're the owner</li>
                  <li>Change anything without asking you first</li>
                </ul>
              </div>

              {!trusted && (
                <p className="text-center text-sm font-medium text-[#052a2b]">
                  This app isn't recognised, so it can't be approved.
                </p>
              )}

              {busy && <p className="text-center text-sm text-muted-foreground">One moment...</p>}

              {trusted && (
                <Button
                  className="h-12 w-full bg-[#155e3f] text-base font-bold text-white hover:bg-[#0c4a30] disabled:opacity-100 disabled:bg-[#155e3f]/30 disabled:text-[#052a2b]/60"
                  disabled={busy}
                  onClick={() => void decide(true)}
                >
                  Approve
                </Button>
              )}
              <div className="flex justify-center text-sm">
                <button
                  type="button"
                  className="text-[#155e3f] underline"
                  disabled={busy}
                  onClick={() => void decide(false)}
                >
                  {trusted ? "Deny" : "Cancel request"}
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
