import { Route, Switch } from "wouter";

import EstimatePage from "./EstimatePage";
import HomePage from "./HomePage";
import ServicePage from "./ServicePage";

/**
 * Router for the public marketing site (the lazy "Landing" bundle). App.tsx
 * only hands us locations in PUBLIC_PATHS (publicPaths.ts) — keep the two in
 * sync when adding a page. Still deliberately light: React + wouter +
 * framer-motion (LazyMotion) + the one shadcn accordion; no Supabase, no maps.
 */
export default function SiteRouter() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/junk-removal">{() => <ServicePage slug="junk-removal" />}</Route>
      <Route path="/moving">{() => <ServicePage slug="moving" />}</Route>
      <Route path="/assembly-handyman">{() => <ServicePage slug="assembly-handyman" />}</Route>
      <Route path="/estimate" component={EstimatePage} />
      {/* Unreachable while publicPaths is exact-match; safe default anyway. */}
      <Route component={HomePage} />
    </Switch>
  );
}
