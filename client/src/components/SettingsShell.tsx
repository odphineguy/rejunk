import type { ReactNode } from "react";
import { Link } from "wouter";
import { Info, Settings as SettingsIcon, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared shell for every /settings/* sub-page: breadcrumb header
 * (⚙ Settings / Page Title) with a right-aligned action area, then the
 * content region. Visual language matches OperationsShell + Dashboard.
 */
export function SettingsShell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="border-b border-border bg-background px-4 py-5 md:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <SettingsIcon className="size-5 text-foreground" />
            <Link
              href="/settings"
              className="font-display text-xl font-bold tracking-tight text-muted-foreground transition-colors hover:text-[var(--moss-deep)]"
            >
              Settings
            </Link>
            <span className="font-display text-xl font-bold tracking-tight text-muted-foreground">
              /
            </span>
            <span className="font-display text-xl font-bold tracking-tight text-foreground">
              {title}
            </span>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
      <div className="px-4 py-8 md:px-8">{children}</div>
    </>
  );
}

/** Primary Save button in Rejunk green, used in every settings header. */
export function SettingsSaveButton({
  onClick,
  children = "Save",
}: {
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <Button
      onClick={onClick}
      className="rounded-lg bg-[var(--moss-deep)] px-6 text-white hover:bg-[#1a7a4f]"
    >
      {children}
    </Button>
  );
}

/** Content card with an icon + bold section heading and a rule below it. */
export function SettingsCard({
  title,
  icon: Icon,
  action,
  className,
  children,
}: {
  title?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card p-6 shadow-sm", className)}>
      {title && (
        <div className="mb-5 border-b border-border pb-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2.5 font-display text-lg font-bold text-foreground">
              {Icon && <Icon className="size-5 text-[var(--moss-deep)]" />}
              {title}
            </h2>
            {action}
          </div>
        </div>
      )}
      {children}
    </section>
  );
}

/** Light Rejunk-green info callout (never blue). */
export function InfoCallout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border border-[var(--moss-deep)]/25 bg-[#f0f4ec] p-4 text-sm leading-6 text-foreground",
        className
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0 text-[var(--moss-deep)]" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Stacked label + control field wrapper used across the settings forms. */
export function SettingsField({
  label,
  help,
  children,
  className,
}: {
  label: string;
  help?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-sm font-semibold text-foreground">{label}</div>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

/** Toggle row: label + optional helper text on the left, Switch on the right. */
export function SettingsToggleRow({
  label,
  help,
  control,
}: {
  label: string;
  help?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        {help && <p className="mt-1 text-xs leading-5 text-muted-foreground">{help}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}
