import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";
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

import { cn } from "@/lib/utils";

type SettingsCard = {
  label: string;
  icon: LucideIcon;
  href: string;
  tone: string;
  iconClassName: string;
};

const settingsCards: SettingsCard[] = [
  {
    label: "Company Settings",
    icon: Building2,
    href: "/settings/company",
    tone: "bg-violet-100",
    iconClassName: "text-violet-600",
  },
  {
    label: "Profile Settings",
    icon: UserCog,
    href: "/settings/profile",
    tone: "bg-sky-100",
    iconClassName: "text-sky-600",
  },
  {
    label: "Online Booking",
    icon: ReceiptText,
    href: "/settings/online-booking",
    tone: "bg-orange-100",
    iconClassName: "text-orange-500",
  },
  {
    label: "Invoice Settings",
    icon: ShieldCheck,
    href: "/settings/invoices",
    tone: "bg-green-100",
    iconClassName: "text-green-600",
  },
  {
    label: "Tip Settings",
    icon: ShieldCheck,
    href: "/settings/tips",
    tone: "bg-green-100",
    iconClassName: "text-green-600",
  },
  {
    label: "Tax Rates",
    icon: Percent,
    href: "/settings/tax-rates",
    tone: "bg-green-100",
    iconClassName: "text-green-600",
  },
  {
    label: "Phone Settings",
    icon: Phone,
    href: "/settings/phone",
    tone: "bg-pink-100",
    iconClassName: "text-pink-500",
  },
  {
    label: "Phone Numbers",
    icon: Phone,
    href: "/settings/phone-numbers",
    tone: "bg-pink-100",
    iconClassName: "text-pink-500",
  },
  {
    label: "Job Settings",
    icon: BriefcaseBusiness,
    href: "/settings/jobs",
    tone: "bg-yellow-100",
    iconClassName: "text-yellow-600",
  },
  {
    label: "SMS Notifications",
    icon: Bell,
    href: "/settings/sms",
    tone: "bg-stone-100",
    iconClassName: "text-amber-600",
  },
  {
    label: "Email Templates",
    icon: Mail,
    href: "/settings/email-templates",
    tone: "bg-stone-100",
    iconClassName: "text-amber-600",
  },
  {
    label: "Calendar Settings",
    icon: CalendarDays,
    href: "/settings/calendar",
    tone: "bg-indigo-100",
    iconClassName: "text-indigo-600",
  },
  {
    label: "Pricebook",
    icon: FileText,
    href: "/pricebook",
    tone: "bg-red-100",
    iconClassName: "text-red-500",
  },
  {
    label: "Contact Form Settings",
    icon: MessageSquareText,
    href: "/settings/contact-form",
    tone: "bg-pink-100",
    iconClassName: "text-pink-600",
  },
  {
    label: "Affiliate Settings",
    icon: BadgePercent,
    href: "/settings/affiliate",
    tone: "bg-orange-100",
    iconClassName: "text-orange-600",
  },
  {
    label: "Review Settings",
    icon: Star,
    href: "/settings/reviews",
    tone: "bg-orange-100",
    iconClassName: "text-orange-600",
  },
  {
    label: "Autopilot Subscription Settings",
    icon: UsersRound,
    href: "/settings/autopilot",
    tone: "bg-orange-100",
    iconClassName: "text-orange-600",
  },
];

export default function Settings() {
  return (
    <>
      <div className="border-b border-border bg-background px-4 py-5 md:px-8">
        <div className="flex items-center gap-2 text-base">
          <SettingsIcon className="size-5 text-foreground" />
          <span className="font-medium text-foreground">Settings</span>
        </div>
      </div>

      <div className="px-4 py-8 md:px-8">
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {settingsCards.map((card) => (
            <SettingsTile key={card.label} card={card} />
          ))}
        </div>
      </div>
    </>
  );
}

function SettingsTile({ card }: { card: SettingsCard }) {
  const Icon = card.icon;
  const disabled = card.href.startsWith("/settings/") && card.href !== "/settings";
  const className =
    "group flex min-h-[98px] items-center gap-4 rounded-lg border border-border bg-card px-6 py-5 text-left shadow-sm transition-colors hover:border-[#2d5016]/40 hover:bg-muted/20";

  const content = (
    <>
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-lg", card.tone)}>
        <Icon className={cn("size-6", card.iconClassName)} />
      </span>
      <span className="text-base font-medium text-foreground">{card.label}</span>
    </>
  );

  if (disabled) {
    return (
      <button type="button" className={className} aria-label={`${card.label} placeholder`}>
        {content}
      </button>
    );
  }

  return (
    <Link href={card.href} className={className}>
      {content}
    </Link>
  );
}
