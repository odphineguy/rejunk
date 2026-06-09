import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppShell } from "./components/OperationsShell";
import { ThemeProvider } from "./contexts/ThemeContext";
import ClientsLeads from "./pages/ClientsLeads";
import Dashboard from "./pages/Dashboard";
import DispatchCenter from "./pages/DispatchCenter";
import EstimateBuilder from "./pages/EstimateBuilder";
import Employees from "./pages/Employees";
import Events from "./pages/Events";
import Home from "./pages/Home";
import Invoices from "./pages/Invoices";
import JobDetail from "./pages/JobDetail";
import Jobs from "./pages/Jobs";
import Messages from "./pages/Messages";
import NewJob from "./pages/NewJob";
import Payments from "./pages/Payments";
import Pricebook from "./pages/Pricebook";
import Schedule from "./pages/Schedule";
import Settings from "./pages/Settings";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { DriverSessionGate } from "./components/DriverSessionGate";
import DriverActivate from "./pages/driver/DriverActivate";
import DriverHome from "./pages/driver/DriverHome";
import DriverJobDetail from "./pages/driver/DriverJobDetail";
import DriverLogin from "./pages/driver/DriverLogin";


function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Dashboard} />
      <Route path={"/map"} component={Home} />
      <Route path={"/estimate-builder"} component={EstimateBuilder} />
      <Route path={"/jobs/new"} component={NewJob} />
      <Route path={"/jobs/:jobId"} component={JobDetail} />
      <Route path={"/jobs"} component={Jobs} />
      <Route path={"/dispatch"} component={DispatchCenter} />
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
      <Route path={"/payments"} component={Payments} />
      <Route path={"/pricebook"} component={Pricebook} />
      <Route path={"/events/new"} component={Events} />
      <Route path={"/events/:eventId"} component={Events} />
      <Route path={"/events"} component={Events} />
      <Route path={"/settings"} component={Settings} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

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
          <PlaceholderPage title="Driver Messages" />
        </DriverSessionGate>
      </Route>
      <Route path={"/driver/profile"}>
        <DriverSessionGate>
          <PlaceholderPage title="Driver Profile" />
        </DriverSessionGate>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  const [location] = useLocation();
  const isDriverRoute = location === "/driver" || location.startsWith("/driver/");

  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          {isDriverRoute ? (
            <DriverRouter />
          ) : (
            <AppShell>
              <Router />
            </AppShell>
          )}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
