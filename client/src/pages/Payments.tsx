import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Banknote, ChevronLeft, ChevronRight, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deletePayment, getPayments } from "@/lib/paymentStorage";
import type { PaymentRecord } from "@/types/payments";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatPaymentDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function paymentTotal(payment: Pick<PaymentRecord, "baseAmount" | "tip">) {
  return payment.baseAmount + payment.tip;
}

export default function Payments() {
  const [payments, setPayments] = useState<PaymentRecord[]>(() => getPayments());
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState("10");

  useEffect(() => {
    const refresh = () => setPayments(getPayments());
    window.addEventListener("payments-updated", refresh);
    return () => window.removeEventListener("payments-updated", refresh);
  }, []);

  const filteredPayments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return payments.filter((payment) => {
      const searchable = [
        payment.customerName,
        payment.method,
        payment.baseAmount,
        payment.tip,
        paymentTotal(payment),
        payment.jobId,
        payment.invoiceId,
        formatPaymentDate(payment.paidAt),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return !normalizedQuery || searchable.includes(normalizedQuery);
    });
  }, [payments, query]);

  const removePayment = (paymentId: string) => {
    setPayments(deletePayment(paymentId));
    toast.success("Payment deleted");
  };

  return (
    <>
      <div className="border-b border-border bg-background px-4 py-5 md:px-8">
        <div className="flex items-center gap-2 text-base">
          <Banknote className="size-5 text-foreground" />
          <span className="font-medium text-foreground">Payments</span>
        </div>
      </div>

      <div className="space-y-5 px-4 py-8 md:px-8">
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-[400px]">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." className="h-12 rounded-lg pl-10 pr-10" />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7180a8]" aria-label="Clear payment search">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Select value={pageSize} onValueChange={setPageSize}>
              <SelectTrigger className="h-10 w-20 rounded-lg bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["10", "25", "50"].map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-6">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="h-14 px-5">Customer Name</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Base Amount</TableHead>
                  <TableHead>Tip</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Job ID</TableHead>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((payment, index) => (
                  <TableRow key={payment.id} className={index % 2 === 1 ? "bg-muted/20" : undefined}>
                    <TableCell className="px-5 font-medium">
                      <span className="text-[#2d5016] underline underline-offset-2">{payment.customerName}</span>
                    </TableCell>
                    <TableCell>{payment.method}</TableCell>
                    <TableCell>{money.format(payment.baseAmount)}</TableCell>
                    <TableCell>{money.format(payment.tip)}</TableCell>
                    <TableCell>{money.format(paymentTotal(payment))}</TableCell>
                    <TableCell>{formatPaymentDate(payment.paidAt)}</TableCell>
                    <TableCell>
                      {payment.jobId ? (
                        <Link href={`/jobs/${payment.jobId}`} className="text-[#2d5016] underline underline-offset-2">
                          {payment.jobId}
                        </Link>
                      ) : (
                        ""
                      )}
                    </TableCell>
                    <TableCell>
                      {payment.invoiceId ? (
                        <Link href={`/invoices/${payment.invoiceId}`} className="text-[#2d5016] underline underline-offset-2">
                          {payment.invoiceId}
                        </Link>
                      ) : (
                        ""
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => removePayment(payment.id)} aria-label={`Delete ${payment.customerName} payment`}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredPayments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">
                      No payments found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 text-sm md:grid md:grid-cols-[1fr_auto_1fr] md:items-center">
          <span>{filteredPayments.length ? `Showing 1-${filteredPayments.length} of ${filteredPayments.length} results` : "No results."}</span>
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" className="size-10 rounded-lg">
              <ChevronLeft className="size-4" />
            </Button>
            <span>Page 1 of 1</span>
            <Button variant="outline" size="icon" className="size-10 rounded-lg">
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <span className="hidden md:block" />
        </section>
      </div>
    </>
  );
}
