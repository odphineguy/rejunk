import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { CalendarDays, Calculator, Map, Plus, Search, Settings, TableProperties, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Main Menu",
    items: [
      { href: "/", label: "Facility Map", icon: Map },
      { href: "/estimate-builder", label: "Estimate Builder", icon: Calculator },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/jobs", label: "Jobs", icon: Truck },
      { href: "/schedule", label: "Schedule", icon: CalendarDays },
    ],
  },
  {
    label: "Admin",
    items: [{ href: "/settings", label: "Pricing Settings", icon: Settings }],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-muted/20 md:flex md:h-screen md:overflow-hidden">
      <aside className="hidden w-[248px] shrink-0 border-r border-border bg-card md:flex md:h-screen md:flex-col">
        <Link href="/" className="flex h-20 items-center border-b border-border px-6">
          <img src="/rejunk-whites.png" alt="reJunk" className="h-20 w-auto" />
        </Link>

        <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-2">
              <div className="px-2 text-xs font-medium text-muted-foreground">{group.label}</div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                        active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted",
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:h-screen md:overflow-hidden">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur md:static">
          <div className="flex min-h-20 flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Type to search" className="h-10 bg-card pl-9" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AddNewMenu />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto border-t border-border px-4 py-3 md:hidden">
            {navGroups.flatMap((group) => group.items).map((item) => {
              const Icon = item.icon;
              const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </header>

        <main className="min-w-0 md:flex-1 md:overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export function OperationsShell({ title, eyebrow, actions, children }: { title: string; eyebrow?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="border-b border-border bg-background px-4 py-5 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            {eyebrow && <div className="text-sm font-medium text-muted-foreground">{eyebrow}</div>}
            <h1 className="mt-1 text-2xl font-bold text-foreground md:text-3xl">{title}</h1>
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
      <div className="px-4 py-6 md:px-6">{children}</div>
    </>
  );
}

export function AddNewMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add New
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href="/estimate-builder">
            <Calculator className="size-4" />
            New Estimate
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/jobs/new">
            <TableProperties className="size-4" />
            New Job
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
