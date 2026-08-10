import { Suspense, lazy, useEffect } from "react";
import { useLocation } from "wouter";

import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LANDING_BG } from "./pages/landing/palette";
import { isPublicPath } from "./pages/landing/publicPaths";

// Three separate bundles so paid-lead traffic on the landing page never
// downloads the office or driver apps (and none of the Supabase/maps code
// they pull in). Each lazy module owns its own providers and routing.
const Landing = lazy(() => import("./pages/landing/SiteRouter"));
const StaffApp = lazy(() => import("./StaffApp"));
const DriverApp = lazy(() => import("./DriverApp"));

// Full-viewport block in the landing page's background so there's no
// flash while the landing chunk downloads.
function LandingFallback() {
  return <div style={{ minHeight: "100dvh", background: LANDING_BG }} />;
}

function AppFallback() {
  return <div className="min-h-dvh bg-background" />;
}

function App() {
  const [location] = useLocation();
  const isDriverRoute =
    location === "/driver" || location.startsWith("/driver/");
  const isLandingRoute = isPublicPath(location);

  useEffect(() => {
    let robots = document.head.querySelector<HTMLMetaElement>(
      'meta[name="robots"]'
    );
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }

    robots.content = isLandingRoute
      ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
      : "noindex, nofollow, noarchive";

    if (!isLandingRoute) {
      document.head
        .querySelector<HTMLLinkElement>('link[rel="canonical"]')
        ?.remove();
      document.head
        .querySelector<HTMLScriptElement>('script[id="structured-data"]')
        ?.remove();
    }
  }, [isLandingRoute]);

  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        {isLandingRoute ? (
          <Suspense fallback={<LandingFallback />}>
            <Landing />
          </Suspense>
        ) : isDriverRoute ? (
          <Suspense fallback={<AppFallback />}>
            <DriverApp />
          </Suspense>
        ) : (
          <Suspense fallback={<AppFallback />}>
            <StaffApp />
          </Suspense>
        )}
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
