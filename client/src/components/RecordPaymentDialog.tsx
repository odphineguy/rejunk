import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getInvoice } from "@/lib/invoiceStorage";
import {
  ReceivedPaymentError,
  recordReceivedPayment,
} from "@/lib/paymentStorage";
import type { InvoiceRecord } from "@/types/invoices";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function RecordPaymentDialog({
  invoices,
  invoice,
  disabled = false,
}: {
  invoices: InvoiceRecord[];
  invoice?: InvoiceRecord;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState(invoice?.id ?? "");
  const [method, setMethod] = useState("Zelle");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  // Retain the payload after an uncertain result. An explicit 4xx can be edited;
  // a network/503 result must be retried identically before starting another entry.
  const [pending, setPending] = useState<
    Parameters<typeof recordReceivedPayment>[0] | null
  >(null);
  const [uncertain, setUncertain] = useState(false);
  const selected = invoice ?? invoices.find(row => row.id === invoiceId);
  const paid =
    selected?.amountPaid ?? (selected?.status === "paid" ? selected.total : 0);
  const due = Math.max(0, (selected?.total ?? 0) - paid);
  const eligible = invoices.filter(
    row =>
      row.status !== "void" &&
      row.status !== "paid" &&
      row.total > (row.amountPaid ?? 0)
  );
  const start = () => {
    if (
      invoice &&
      JSON.stringify(getInvoice(invoice.id)) !== JSON.stringify(invoice)
    ) {
      toast.error("Save invoice changes before recording a payment.");
      return;
    }
    setOpen(true);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) {
      toast.error("Choose a saved invoice.");
      return;
    }
    const input =
      uncertain && pending
        ? pending
        : {
            requestId: pending?.requestId ?? crypto.randomUUID(),
            invoiceId: selected.id,
            method,
            amount: Number(amount),
            receivedDate: date,
            reference: reference.trim(),
            expectedPaid: paid,
          };
    setPending(input);
    setBusy(true);
    try {
      const result = await recordReceivedPayment(input);
      toast.success(
        result.duplicate
          ? "Payment already recorded. Balance confirmed."
          : "Payment recorded. Invoice balance updated."
      );
      setPending(null);
      setUncertain(false);
      setAmount("");
      setReference("");
      setOpen(false);
    } catch (error) {
      // Keep the same ID on every retry, including validation conflicts.
      setUncertain(
        !(error instanceof ReceivedPaymentError && error.status < 500)
      );
      toast.error(
        error instanceof Error ? error.message : "Could not record payment."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || busy || (!uncertain && eligible.length === 0)}
        onClick={start}
      >
        Record payment received
      </Button>
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record payment received</DialogTitle>
            <DialogDescription>
              Add money the customer has already paid. This updates their
              invoice balance.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={event => void save(event)}>
            <fieldset disabled={busy || uncertain} className="space-y-4">
              {invoice ? (
                <p className="text-sm font-medium">
                  #{invoice.invoiceNumber} · {invoice.clientName}
                </p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="received-invoice">Invoice</Label>
                  <Select value={invoiceId} onValueChange={setInvoiceId}>
                    <SelectTrigger id="received-invoice">
                      <SelectValue placeholder="Choose an invoice" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligible.map(row => (
                        <SelectItem key={row.id} value={row.id}>
                          #{row.invoiceNumber} · {row.clientName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selected && (
                <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Total</dt>
                    <dd>{money.format(selected.total)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Received</dt>
                    <dd>{money.format(paid)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Remaining</dt>
                    <dd className="font-semibold">{money.format(due)}</dd>
                  </div>
                </dl>
              )}
              <div className="space-y-2">
                <Label htmlFor="received-method">Method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger id="received-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "Zelle",
                      "Cash",
                      "Check",
                      "Offline Credit Card",
                      "ACH",
                    ].map(value => (
                      <SelectItem key={value} value={value}>
                        {value === "Offline Credit Card"
                          ? "Card paid outside ReJunk"
                          : value === "ACH"
                            ? "Bank payment already cleared"
                            : value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="received-amount">Amount received</Label>
                  <Input
                    id="received-amount"
                    type="number"
                    inputMode="decimal"
                    required
                    min="0.01"
                    step="0.01"
                    max={due}
                    value={amount}
                    onChange={event => setAmount(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="received-date">Received date</Label>
                  <Input
                    id="received-date"
                    type="date"
                    required
                    min="2000-01-01"
                    max={today()}
                    value={date}
                    onChange={event => setDate(event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="received-reference">
                  Reference or receipt number
                </Label>
                <Input
                  id="received-reference"
                  required
                  maxLength={200}
                  value={reference}
                  onChange={event => setReference(event.target.value)}
                  placeholder={
                    method === "Cash"
                      ? "Your cash receipt number"
                      : "Transaction ID or check number"
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Use the original transaction reference to prevent duplicate
                  entries.
                </p>
              </div>
            </fieldset>
            {paid > 0 && (
              <p className="text-sm text-amber-800 dark:text-amber-300">
                This adds a new payment to the {money.format(paid)} already
                received. Check that this payment is not included in that
                amount.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              A transfer to the company bank is separate from the customer
              payment. Record the customer payment once.
            </p>
            {uncertain && (
              <p
                role="alert"
                className="text-sm text-amber-800 dark:text-amber-300"
              >
                The save result is uncertain. Retry these same details to
                confirm it before creating another entry.
              </p>
            )}
            <Button
              className="w-full"
              type="submit"
              disabled={busy || !selected}
            >
              {busy
                ? "Saving…"
                : uncertain
                  ? "Retry and confirm payment"
                  : "Record payment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
