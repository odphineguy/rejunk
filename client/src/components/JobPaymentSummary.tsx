import { useEffect, useState } from "react";
import { Link } from "wouter";
import { getInvoices } from "@/lib/invoiceStorage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
export function JobPaymentSummary({ jobId }: { jobId: string }) {
  const [invoices, setInvoices] = useState(getInvoices);
  useEffect(() => {
    const refresh = () => setInvoices(getInvoices());
    window.addEventListener("invoices-updated", refresh);
    return () => window.removeEventListener("invoices-updated", refresh);
  }, []);
  const linked = invoices.filter(
    row => row.jobId === jobId && row.status !== "void"
  );
  const total =
    linked.reduce((sum, row) => sum + Math.round(row.total * 100), 0) / 100;
  const paid =
    linked.reduce(
      (sum, row) =>
        sum +
        Math.round(
          (row.amountPaid ?? (row.status === "paid" ? row.total : 0)) * 100
        ),
      0
    ) / 100;
  const due =
    linked.reduce(
      (sum, row) =>
        sum +
        Math.max(
          0,
          Math.round(
            (row.total -
              (row.amountPaid ?? (row.status === "paid" ? row.total : 0))) *
              100
          )
        ),
      0
    ) / 100;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice balance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {linked.length ? (
          <>
            <dl className="space-y-2 text-sm">
              {[
                ["Total invoiced", total],
                ["Payments received", paid],
                ["Remaining balance", due],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt>{label}</dt>
                  <dd className="font-semibold">
                    {money.format(Number(value))}
                  </dd>
                </div>
              ))}
            </dl>
            {linked.map(row => (
              <Button key={row.id} variant="outline" className="w-full" asChild>
                <Link href={`/invoices/${row.id}`}>
                  Invoice #{row.invoiceNumber} · {row.status}
                </Link>
              </Button>
            ))}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Create and save an invoice for this job to record payments and track
            its remaining balance.
          </p>
        )}
        {!linked.length && (
          <Button variant="outline" className="w-full" asChild>
            <Link href={`/invoices/new?jobId=${encodeURIComponent(jobId)}`}>
              Create invoice
            </Link>
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Customer payments are separate from transfers or payouts to the
          company bank.
        </p>
      </CardContent>
    </Card>
  );
}
