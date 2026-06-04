import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppShell } from "./components/OperationsShell";
import { ThemeProvider } from "./contexts/ThemeContext";
import ClientsLeads from "./pages/ClientsLeads";
import Dashboard from "./pages/Dashboard";
import EstimateBuilder from "./pages/EstimateBuilder";
import Employees from "./pages/Employees";
import Events from "./pages/Events";
import Home from "./pages/Home";
import Invoices from "./pages/Invoices";
import JobDetail, { NewJob } from "./pages/JobDetail";
import Jobs from "./pages/Jobs";
import Messages from "./pages/Messages";
import PricingSettings from "./pages/PricingSettings";
import Schedule from "./pages/Schedule";
import { PlaceholderPage } from "./pages/PlaceholderPage";


function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Dashboard} />
      <Route path={"/map"} component={Home} />
      <Route path={"/estimate-builder"} component={EstimateBuilder} />
      <Route path={"/jobs/new"} component={NewJob} />
      <Route path={"/jobs/:jobId"} component={JobDetail} />
      <Route path={"/jobs"} component={Jobs} />
      <Route path={"/schedule"} component={Schedule} />
      <Route path={"/messages"} component={Messages} />
      <Route path={"/clients/new"} component={ClientsLeads} />
      <Route path={"/clients/:clientId"} component={ClientsLeads} />
      <Route path={"/clients"} component={ClientsLeads} />
      <Route path={"/employees/new"} component={Employees} />
      <Route path={"/employees/:employeeId"} component={Employees} />
      <Route path={"/employees"} component={Employees} />
      <Route path={"/invoices/new"} component={Invoices} />
      <Route path={"/invoices/:invoiceId"} component={Invoices} />
      <Route path={"/invoices"} component={Invoices} />
      <Route path={"/events/new"} component={Events} />
      <Route path={"/events/:eventId"} component={Events} />
      <Route path={"/events"} component={Events} />
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
