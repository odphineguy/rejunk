import { useState } from "react";
import { CreditCard, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getInvoice, hydrateInvoices } from "@/lib/invoiceStorage";
import { hydratePayments } from "@/lib/paymentStorage";
import { getStoredStaffSession, isOwner } from "@/lib/staffSession";
import type { InvoiceRecord } from "@/types/invoices";

export function InvoicePaymentPanel({
  invoice,
  enabled,
  isNew,
}: {
  invoice: InvoiceRecord;
  enabled: boolean;
  isNew: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; livemode: boolean } | null>(
    null
  );
  if (!isOwner()) return null;
  const act = async (action: "create" | "refresh" | "cancel") => {
    if (
      action === "create" &&
      (isNew ||
        JSON.stringify(getInvoice(invoice.id)) !== JSON.stringify(invoice))
    ) {
      toast.error("Save your invoice changes before creating a payment link.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          invoiceId: invoice.id,
          token: getStoredStaffSession()?.token,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Could not update payment link.");
      setLink(data.url ? { url: data.url, livemode: data.livemode } : null);
      if (data.paid || action === "refresh") {
        await Promise.all([hydrateInvoices(), hydratePayments()]);
      }
      if (data.paid) {
        toast.success(
          data.livemode
            ? "Payment confirmed. Invoice and Payments updated."
            : "Sandbox payment confirmed. Your live invoice has not changed."
        );
      } else if (action === "cancel") toast.success("Payment link cancelled.");
      else if (action === "refresh" && !data.url)
        toast.info("No active payment link or new payment.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Payment request failed."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <CreditCard className="size-4" /> Card payment
      </h3>
      <p className="text-sm text-muted-foreground">
        Payments are collected by Abe Media for Progressive. Save the invoice
        and mark it sent before creating a link.
      </p>
      {!enabled ? (
        <p className="text-sm">
          Enable Card payments in{" "}
          <a className="underline" href="/settings/invoices">
            Invoice Settings
          </a>
          .
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={
              busy ||
              isNew ||
              ["paid", "void", "draft"].includes(invoice.status)
            }
            onClick={() => void act("create")}
          >
            Create payment link
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || isNew}
            onClick={() => void act("refresh")}
          >
            <RefreshCw className="size-4" /> Check payment
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || isNew}
            onClick={() => void act("cancel")}
          >
            Cancel link
          </Button>
        </div>
      )}
      {link && (
        <div className="space-y-2">
          {!link.livemode && (
            <p className="text-sm font-medium text-amber-700">
              Sandbox link — test cards only. No money will be collected.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            This link locks the invoice amount until it is paid, cancelled or
            expires.
          </p>
          <div className="flex gap-2">
            <Input
              aria-label="Invoice payment link"
              readOnly
              value={link.url}
            />
            <Button
              variant="outline"
              aria-label="Copy payment link"
              onClick={() => {
                void navigator.clipboard
                  .writeText(link.url)
                  .then(() => toast.success("Payment link copied"))
                  .catch(() => toast.error("Select and copy the link above."));
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm underline"
          >
            Open payment page
          </a>
        </div>
      )}
    </section>
  );
}
