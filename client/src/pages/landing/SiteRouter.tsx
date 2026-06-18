import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";

import EstimatePage from "./EstimatePage";
import HomePage from "./HomePage";
import LegalPage from "./LegalPage";
import ServicePage from "./ServicePage";

// Lazy-loaded on purpose: the AI estimator pulls in the heavier deps (the
// Supabase-backed pricing/settings cache, the OpenAI call, jsPDF) that the rest
// of the marketing site avoids — keep them out of the home-page chunk.
const InstantEstimatePage = lazy(() => import("./InstantEstimatePage"));

/**
 * Router for the public marketing site (the lazy "Landing" bundle). App.tsx
 * only hands us locations in PUBLIC_PATHS (publicPaths.ts) — keep the two in
 * sync when adding a page. Still deliberately light: React + wouter +
 * framer-motion (LazyMotion) + the one shadcn accordion; no Supabase, no maps
 * (except the lazily-loaded AI estimator below).
 */
export default function SiteRouter() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/junk-removal">{() => <ServicePage slug="junk-removal" />}</Route>
      <Route path="/moving">{() => <ServicePage slug="moving" />}</Route>
      <Route path="/assembly-handyman">{() => <ServicePage slug="assembly-handyman" />}</Route>
      <Route path="/estimate" component={EstimatePage} />
      <Route path="/instant-estimate">
        {() => (
          <Suspense fallback={null}>
            <InstantEstimatePage />
          </Suspense>
        )}
      </Route>
      <Route path="/terms">{() => <LegalPage kind="terms" />}</Route>
      <Route path="/privacy">{() => <LegalPage kind="privacy" />}</Route>
      {/* Unreachable while publicPaths is exact-match; safe default anyway. */}
      <Route component={HomePage} />
    </Switch>
  );
}
