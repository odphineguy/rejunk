import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";
import { OperationsShell } from "@/components/OperationsShell";
import {
  BadgePercent,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  FileText,
  Mail,
  MessageSquareText,
  Percent,
  Phone,
  ReceiptText,
  Settings as SettingsIcon,
  ShieldCheck,
  Star,
  UserCog,
  UsersRound,
} from "lucide-react";

type SettingsCard = {
  label: string;
  icon: LucideIcon;
  href: string;
};

const settingsCards: SettingsCard[] = [
  { label: "Company Settings", icon: Building2, href: "/settings/company" },
  { label: "Profile Settings", icon: UserCog, href: "/settings/profile" },
  { label: "Online Booking", icon: ReceiptText, href: "/settings/online-booking" },
  { label: "Invoice Settings", icon: ShieldCheck, href: "/settings/invoices" },
  { label: "Tip Settings", icon: ShieldCheck, href: "/settings/tips" },
  { label: "Tax Rates", icon: Percent, href: "/settings/tax-rates" },
  { label: "Phone Settings", icon: Phone, href: "/settings/phone" },
  { label: "Phone Numbers", icon: Phone, href: "/settings/phone-numbers" },
  { label: "Job Settings", icon: BriefcaseBusiness, href: "/settings/jobs" },
  { label: "SMS Notifications", icon: Bell, href: "/settings/sms" },
  { label: "Email Templates", icon: Mail, href: "/settings/email-templates" },
  { label: "Calendar Settings", icon: CalendarDays, href: "/settings/calendar" },
  { label: "Pricebook", icon: FileText, href: "/pricebook" },
  { label: "Contact Form Settings", icon: MessageSquareText, href: "/settings/contact-form" },
  { label: "Affiliate Settings", icon: BadgePercent, href: "/settings/affiliate" },
  { label: "Review Settings", icon: Star, href: "/settings/reviews" },
  { label: "Rejunk Subscription", icon: UsersRound, href: "/settings/subscription" },
];

export default function Settings() {
  return (
    <OperationsShell title="Settings" icon={SettingsIcon}>
      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {settingsCards.map((card) => (
          <SettingsTile key={card.label} card={card} />
        ))}
      </div>
    </OperationsShell>
  );
}

function SettingsTile({ card }: { card: SettingsCard }) {
  const Icon = card.icon;
  return (
    <Link
      href={card.href}
      className="group flex min-h-[98px] items-center gap-4 rounded-lg border border-border bg-card px-6 py-5 text-left shadow-sm transition-colors hover:border-[#155e3f]/40 hover:bg-muted/20"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-[10px] border border-border bg-[#edebde] text-[var(--moss-deep)]">
        <Icon className="size-6" />
      </span>
      <span className="text-base font-medium text-foreground">{card.label}</span>
    </Link>
  );
}
