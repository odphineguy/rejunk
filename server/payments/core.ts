import type Stripe from "stripe";
import { z } from "zod";
import { invoiceTotals } from "../../shared/invoiceTotals";

export class PaymentError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

const invoiceSchema = z.object({
  id: z.string().min(1),
  invoiceNumber: z.number().int().positive(),
  clientName: z.string().min(1),
  clientEmail: z.string().optional(),
  jobId: z.string(),
  status: z.enum(["draft", "sent", "partial", "overdue", "paid", "void"]),
  total: z.number().finite().nonnegative(),
  amountPaid: z.number().finite().nonnegative().optional(),
  discount: z.number().finite().nonnegative().optional(),
  taxRate: z.number().finite().min(0).max(100).optional(),
  dueDate: z.string(),
  createdAt: z.string(),
  amountDue: z.number().finite().nonnegative(),
  items: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        quantity: z.number().finite().positive(),
        amount: z.number().finite().nonnegative(),
        taxable: z.boolean().optional(),
      })
    )
    .min(1)
    .max(200),
});

export function payableInvoice(raw: unknown) {
  const parsed = invoiceSchema.safeParse(raw);
  if (!parsed.success)
    throw new PaymentError(
      409,
      "Check and save the invoice before collecting payment."
    );
  const invoice = parsed.data;
  if (["paid", "void", "draft"].includes(invoice.status))
    throw new PaymentError(
      409,
      "Mark this invoice sent before creating a payment link. Paid and void invoices cannot be collected."
    );
  const totals = invoiceTotals(invoice);
  const cents = Math.round(totals.amountDue * 100);
  if (!Number.isSafeInteger(cents) || cents < 50 || cents > 99_999_999)
    throw new PaymentError(
      409,
      "Invoice balance must be between $0.50 and $999,999.99."
    );
  if (
    Math.round(invoice.total * 100) !== Math.round(totals.total * 100) ||
    Math.round(invoice.amountDue * 100) !== cents
  )
    throw new PaymentError(
      409,
      "Save the invoice totals before creating a payment link."
    );
  return { invoice, cents };
}

export interface CheckoutAttempt {
  id: string;
  invoice_id: string;
  company_id: string;
  account_id: string;
  livemode: boolean;
  amount_cents: number;
  snapshot: Record<string, unknown>;
  state: "creating" | "open" | "paid" | "expired";
  stripe_session_id: string | null;
  expires_at: string;
}

/** Both webhook and owner reconciliation use the same Stripe-object validation. */
export function validatePaidSession(
  session: Stripe.Checkout.Session,
  attempt: CheckoutAttempt
) {
  if (
    session.payment_status !== "paid" ||
    session.status !== "complete" ||
    session.mode !== "payment"
  )
    throw new PaymentError(409, "Stripe has not confirmed payment.");
  if (
    session.id !== attempt.stripe_session_id ||
    session.currency !== "usd" ||
    session.amount_total !== attempt.amount_cents ||
    session.livemode !== attempt.livemode ||
    session.metadata?.attempt_id !== attempt.id ||
    session.metadata?.company_id !== attempt.company_id ||
    session.metadata?.invoice_id !== attempt.invoice_id ||
    typeof session.payment_intent !== "string"
  )
    throw new PaymentError(
      409,
      "Stripe payment does not match the saved invoice collection."
    );
  return session.payment_intent;
}
