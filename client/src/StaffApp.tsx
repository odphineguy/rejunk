import { useEffect, useState } from "react";
import { Route, Switch } from "wouter";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { AppShell } from "./components/OperationsShell";
import { StaffSessionGate } from "./components/StaffSessionGate";
import { appDataReady } from "./lib/appHydration";
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
import StaffLogin from "./pages/StaffLogin";
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

function StaffRouter() {
  return (
    <Switch>
      <Route path={"/dashboard"} component={Dashboard} />
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

/**
 * The whole internal office app, loaded lazily so the public landing page
 * never downloads it. Waits for the Supabase cache hydration race (max 2.5s,
 * same as the old main.tsx behavior) so pages mount with fresh data, then
 * gates everything except /login behind a staff session.
 */
export default function StaffApp() {
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
      <Switch>
        <Route path={"/login"} component={StaffLogin} />
        <Route>
          <StaffSessionGate>
            <AppShell>
              <StaffRouter />
            </AppShell>
          </StaffSessionGate>
        </Route>
      </Switch>
    </TooltipProvider>
  );
}
