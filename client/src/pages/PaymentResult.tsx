export default function PaymentResult() {
  const cancelled =
    new URLSearchParams(window.location.search).get("result") === "cancelled";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5">
      <div className="max-w-md space-y-4 rounded-2xl border bg-card p-8">
        <p className="text-sm font-medium text-muted-foreground">
          Progressive Transportation Services
        </p>
        <h1 className="text-2xl font-semibold">
          {cancelled ? "Payment cancelled" : "Thank you"}
        </h1>
        <p className="text-muted-foreground">
          {cancelled
            ? "You left checkout without completing payment. You can return using your original payment link."
            : "Your invoice updates after Stripe confirms your payment. If you used the sandbox, this was a test and no money was collected."}
        </p>
        <p className="text-sm text-muted-foreground">
          Payment collection is handled by Abe Media.
        </p>
      </div>
    </main>
  );
}
