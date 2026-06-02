import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppShell } from "./components/OperationsShell";
import { ThemeProvider } from "./contexts/ThemeContext";
import EstimateBuilder from "./pages/EstimateBuilder";
import Home from "./pages/Home";
import JobDetail, { NewJob } from "./pages/JobDetail";
import Jobs from "./pages/Jobs";
import PricingSettings from "./pages/PricingSettings";
import Schedule from "./pages/Schedule";


function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/estimate-builder"} component={EstimateBuilder} />
      <Route path={"/jobs/new"} component={NewJob} />
      <Route path={"/jobs/:jobId"} component={JobDetail} />
      <Route path={"/jobs"} component={Jobs} />
      <Route path={"/schedule"} component={Schedule} />
      <Route path={"/settings"} component={PricingSettings} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <AppShell>
            <Router />
          </AppShell>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
