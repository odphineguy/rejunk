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
import AffiliateSettings from "./pages/settings/AffiliateSettings";
import CalendarSettings from "./pages/settings/CalendarSettings";
import CompanySettings from "./pages/settings/CompanySettings";
import ContactFormSettings from "./pages/settings/ContactFormSettings";
import EmailTemplates from "./pages/settings/EmailTemplates";
import InvoiceSettings from "./pages/settings/InvoiceSettings";
import JobSettings from "./pages/settings/JobSettings";
import OnlineBooking from "./pages/settings/OnlineBooking";
import PhoneNumbers from "./pages/settings/PhoneNumbers";
import PhoneSettings from "./pages/settings/PhoneSettings";
import ProfileSettings from "./pages/settings/ProfileSettings";
import RejunkSubscription from "./pages/settings/RejunkSubscription";
import ReviewSettings from "./pages/settings/ReviewSettings";
import SmsNotifications from "./pages/settings/SmsNotifications";
import TaxRates from "./pages/settings/TaxRates";
import TipSettings from "./pages/settings/TipSettings";
import { DriverSessionGate } from "./components/DriverSessionGate";
import DriverActivate from "./pages/driver/DriverActivate";
import DriverHome from "./pages/driver/DriverHome";
import DriverJobDetail from "./pages/driver/DriverJobDetail";
import DriverLogin from "./pages/driver/DriverLogin";
import DriverMessages from "./pages/driver/DriverMessages";
import DriverProfile from "./pages/driver/DriverProfile";


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
      <Route path={"/settings/company"} component={CompanySettings} />
      <Route path={"/settings/profile"} component={ProfileSettings} />
      <Route path={"/settings/online-booking"} component={OnlineBooking} />
      <Route path={"/settings/invoices"} component={InvoiceSettings} />
      <Route path={"/settings/tips"} component={TipSettings} />
      <Route path={"/settings/tax-rates"} component={TaxRates} />
      <Route path={"/settings/phone"} component={PhoneSettings} />
      <Route path={"/settings/phone-numbers"} component={PhoneNumbers} />
      <Route path={"/settings/jobs"} component={JobSettings} />
      <Route path={"/settings/sms"} component={SmsNotifications} />
      <Route path={"/settings/email-templates"} component={EmailTemplates} />
      <Route path={"/settings/calendar"} component={CalendarSettings} />
      <Route path={"/settings/contact-form"} component={ContactFormSettings} />
      <Route path={"/settings/affiliate"} component={AffiliateSettings} />
      <Route path={"/settings/reviews"} component={ReviewSettings} />
      <Route path={"/settings/subscription"} component={RejunkSubscription} />
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
