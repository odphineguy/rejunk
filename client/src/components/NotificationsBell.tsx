import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, Bell } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDispatchOperationalCache } from "@/lib/dispatchOperations";
import { getJobs } from "@/lib/jobStorage";
import type { JobIssue } from "@/types/driver";

type ExceptionItem = {
  issue: JobIssue;
  jobId: string;
  customerName: string;
};

function readExceptions(): ExceptionItem[] {
  const jobs = getJobs();
  return getDispatchOperationalCache()
    .issues.filter(
      issue =>
        issue.requiresDispatchResponse && issue.issueStatus !== "resolved"
    )
    .map(issue => {
      const job = jobs.find(j => j.id === issue.jobId);
      return job
        ? { issue, jobId: job.id, customerName: job.customerName }
        : null;
    })
    .filter((entry): entry is ExceptionItem => Boolean(entry));
}

export function NotificationsBell() {
  const [exceptions, setExceptions] = useState<ExceptionItem[]>(() =>
    readExceptions()
  );

  useEffect(() => {
    const refresh = () => setExceptions(readExceptions());
    refresh();
    window.addEventListener("driver-data-updated", refresh);
    window.addEventListener("jobs-updated", refresh);
    return () => {
      window.removeEventListener("driver-data-updated", refresh);
      window.removeEventListener("jobs-updated", refresh);
    };
  }, []);

  const count = exceptions.length;
  const label = useMemo(
    () =>
      count === 0
        ? "Notifications"
        : `Notifications · ${count} open ${count === 1 ? "blocker" : "blockers"}`,
    [count]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex size-11 items-center justify-center rounded-[11px] border border-border bg-card text-muted-foreground transition-colors hover:border-[var(--line-strong)] hover:bg-muted"
          aria-label={label}
        >
          <Bell className="size-[18px]" />
          {count > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full border-2 border-card bg-[var(--amber)] px-1 text-[11px] font-semibold leading-none text-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="size-4 text-[var(--amber)]" />
            Exceptions
          </span>
          <span className="text-xs text-muted-foreground">
            {count} open {count === 1 ? "blocker" : "blockers"}
          </span>
        </div>
        {count === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            No open blockers.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto py-1">
            {exceptions.map(({ issue, jobId, customerName }) => (
              <Link
                key={issue.id}
                href={`/jobs/${jobId}`}
                className="block px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
              >
                <div className="font-semibold text-foreground">
                  {customerName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {issue.issueType.replaceAll("_", " ")} ·{" "}
                  {(issue.issueStatus ?? "awaiting_dispatch").replaceAll(
                    "_",
                    " "
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
