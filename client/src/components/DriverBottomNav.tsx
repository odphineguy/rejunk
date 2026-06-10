import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, MessageSquare, UserRound } from "lucide-react";

import { DISPATCH_MESSAGES_EVENT, getThreads, getUnreadTotalFromCache, subscribeToMessages } from "@/lib/dispatchMessageStorage";
import { getStoredDriverSession } from "@/lib/driverSession";
import { cn } from "@/lib/utils";

/**
 * Fixed bottom navigation for the driver app (Today / Messages / Profile).
 * Owns the Messages unread badge: hydrates threads once, then tracks updates.
 */
export function DriverBottomNav({ active }: { active: "today" | "messages" | "profile" }) {
  const driverEmployeeId = getStoredDriverSession()?.employeeId;
  const [unread, setUnread] = useState(() => (driverEmployeeId ? getUnreadTotalFromCache(driverEmployeeId) : 0));

  useEffect(() => {
    if (driverEmployeeId) void getThreads(driverEmployeeId).then(() => setUnread(getUnreadTotalFromCache(driverEmployeeId)));
    const updateUnread = () => setUnread(driverEmployeeId ? getUnreadTotalFromCache(driverEmployeeId) : 0);
    window.addEventListener(DISPATCH_MESSAGES_EVENT, updateUnread);
    const unsubscribe = subscribeToMessages(updateUnread);
    return () => {
      window.removeEventListener(DISPATCH_MESSAGES_EVENT, updateUnread);
      unsubscribe();
    };
  }, [driverEmployeeId]);

  const itemClass = (key: "today" | "messages" | "profile") =>
    cn(
      "flex flex-col items-center gap-1 rounded-md py-2",
      active === key ? "bg-primary/10 text-primary" : "text-muted-foreground",
    );

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-3 gap-2 text-xs font-medium">
        <Link href="/driver" className={itemClass("today")}><CheckCircle2 className="size-5" />Today</Link>
        <Link href="/driver/messages" className={itemClass("messages")}>
          <span className="relative">
            <MessageSquare className="size-5" />
            {unread > 0 && (
              <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </span>
          Messages
        </Link>
        <Link href="/driver/profile" className={itemClass("profile")}><UserRound className="size-5" />Profile</Link>
      </div>
    </nav>
  );
}
