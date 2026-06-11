import { useEffect, useState } from "react";
import { Route, Switch } from "wouter";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { DriverSessionGate } from "./components/DriverSessionGate";
import { appDataReady } from "./lib/appHydration";
import DriverActivate from "./pages/driver/DriverActivate";
import DriverHome from "./pages/driver/DriverHome";
import DriverJobDetail from "./pages/driver/DriverJobDetail";
import DriverLogin from "./pages/driver/DriverLogin";
import DriverMessages from "./pages/driver/DriverMessages";
import DriverProfile from "./pages/driver/DriverProfile";

function DriverRouter() {
  // /driver/activate and /driver/login are the only ungated driver routes;
  // everything else requires a stored (and still valid) driver session.
  return (
    <Switch>
      <Route path={"/driver/activate"} component={DriverActivate} />
      <Route path={"/driver/login"} component={DriverLogin} />
      <Route path={"/driver"}>
        <DriverSessionGate>
          <DriverHome />
        </DriverSessionGate>
      </Route>
      <Route path={"/driver/jobs/:jobId"}>
        <DriverSessionGate>
          <DriverJobDetail />
        </DriverSessionGate>
      </Route>
      <Route path={"/driver/messages"}>
        <DriverSessionGate>
          <DriverMessages />
        </DriverSessionGate>
      </Route>
      <Route path={"/driver/profile"}>
        <DriverSessionGate>
          <DriverProfile />
        </DriverSessionGate>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * The mobile driver app, loaded lazily so customers on the landing page never
 * download it. Same hydration wait as the staff app (drivers previously got
 * it from main.tsx) so cached reads behave exactly as before.
 */
export default function DriverApp() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void appDataReady.then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return <div className="min-h-dvh bg-background" />;

  return (
    <TooltipProvider>
      <Toaster />
      <DriverRouter />
    </TooltipProvider>
  );
}
