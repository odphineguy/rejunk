/**
 * $50 booking deposit by card — a Stripe Checkout for part of the booking's
 * invoice. Reuses the invoice-checkout ledger (reserve → attach → settle via
 * the signed webhook in server/payments), so a paid deposit lands on the
 * invoice (amountPaid / partial) and in Payments exactly like an owner's
 * payment link. Sandbox keys only touch the private ledger, never the invoice.
 *
 * Collecting account: whatever STRIPE_SECRET_KEY points at (Abe Media today).
 */

import {
  BOOKING_DEPOSIT,
  BOOKING_DEPOSIT_CARD_FEE,
  CARD_FEE_RATE,
} from "../../shared/bookingCatalog";

/** Stable id of the fee line, so a retried checkout never adds it twice. */
const FEE_ITEM_ID = "card-fee-booking-deposit";
import { PaymentError, type CheckoutAttempt } from "../payments/core";
import { paymentConfig, stripeAccount } from "../payments/service";

/** True when the server has working Stripe settings (no network call). */
export function cardDepositConfigured(): boolean {
  try {
    paymentConfig();
    return true;
  } catch {
    return false;
  }
}

export type DepositResult = { url: string } | { paid: true };

export async function depositCheckout(input: {
  invoiceId: string;
  companyId: string;
  jobId: string;
  serviceName: string;
  customerEmail?: string;
}): Promise<DepositResult> {
  const { stripe, db, live, origin } = paymentConfig();
  const accountId = await stripeAccount(stripe);
  const ref = encodeURIComponent(input.jobId);

  const previous = (await rows(
    db
      .from("invoice_checkout_attempts")
      .select("*")
      .eq("invoice_id", input.invoiceId)
      .eq("company_id", input.companyId)
      .eq("livemode", live)
      .in("state", ["creating", "open", "paid"])
      .order("created_at", { ascending: false })
      .limit(1)
  )) as CheckoutAttempt[];
  const last = previous[0];
  if (last?.state === "paid") return { paid: true };
  if (last?.stripe_session_id) {
    const session = await stripe.checkout.sessions.retrieve(last.stripe_session_id);
    if (session.payment_status === "paid") return { paid: true };
    if (session.status === "open" && session.url) return { url: session.url };
    if (session.status === "expired")
      await db.from("invoice_checkout_attempts").update({ state: "expired" }).eq("id", last.id).eq("state", "open");
  }

  let invoiceRow = await single(
    db.from("app_invoices").select("data").eq("id", input.invoiceId).eq("tenant_id", input.companyId).maybeSingle()
  );
  if (!invoiceRow) throw new PaymentError(404, "Booking invoice not found.");
  let data = invoiceRow.data as InvoiceData;
  if ((data.amountPaid ?? 0) >= BOOKING_DEPOSIT) return { paid: true };

  // 3% card fee on the deposit goes on the invoice as its own line, so the
  // $51.50 charge pays $50 toward the job plus the $1.50 fee (settle adds the
  // full charge to amountPaid). Added once, before any checkout freezes it.
  if (!(data.items ?? []).some(item => item.id === FEE_ITEM_ID)) {
    const fee = BOOKING_DEPOSIT_CARD_FEE;
    data = {
      ...data,
      items: [
        ...(data.items ?? []),
        { id: FEE_ITEM_ID, name: `Card processing fee (${CARD_FEE_RATE * 100}% of $${BOOKING_DEPOSIT} deposit)`, quantity: 1, amount: fee },
      ],
      total: round2((data.total ?? 0) + fee),
      amountDue: round2((data.amountDue ?? 0) + fee),
    };
    await single(
      db.from("app_invoices").update({ data, updated_at: new Date().toISOString() }).eq("id", input.invoiceId).eq("tenant_id", input.companyId)
    );
    invoiceRow = { data };
  }
  const cents = Math.min(Math.round((BOOKING_DEPOSIT + BOOKING_DEPOSIT_CARD_FEE) * 100), Math.round((data.amountDue ?? 0) * 100));
  if (cents < 50) return { paid: true };

  const attempt = (await single(
    db.rpc("reserve_invoice_checkout", {
      target_invoice: input.invoiceId,
      target_company: input.companyId,
      collecting_account: accountId,
      is_live: live,
      expected_data: invoiceRow.data,
      amount: cents,
    })
  )) as CheckoutAttempt;
  const metadata = { attempt_id: attempt.id, invoice_id: input.invoiceId, company_id: input.companyId };
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      allowed_payment_method_types: ["card"],
      client_reference_id: attempt.id,
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: attempt.amount_cents,
            product_data: {
              name: "Booking deposit — Progressive Transportation Services",
              description: `$${BOOKING_DEPOSIT} deposit + $${BOOKING_DEPOSIT_CARD_FEE.toFixed(2)} card processing fee (${CARD_FEE_RATE * 100}%). ${input.serviceName}. The $${BOOKING_DEPOSIT} comes off your final bill; refundable if you cancel at least 24 hours ahead.`,
            },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${origin}/book?deposit=paid&ref=${ref}`,
      cancel_url: `${origin}/book?deposit=cancelled&ref=${ref}`,
      expires_at: Math.floor(Date.parse(attempt.expires_at) / 1000),
    },
    { idempotencyKey: `booking-deposit:${attempt.id}` }
  );
  if (session.livemode !== live || !session.url)
    throw new PaymentError(503, "Stripe returned an unexpected checkout environment.");
  await single(db.rpc("attach_invoice_checkout", { attempt_id: attempt.id, session_id: session.id }));
  return { url: session.url };
}

interface InvoiceData {
  amountPaid?: number;
  amountDue?: number;
  total?: number;
  invoiceNumber?: number;
  items?: { id: string; name: string; quantity: number; amount: number }[];
  [key: string]: unknown;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function single<T = any>(query: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new PaymentError(503, error.message || "Payment records could not be saved.");
  return data;
}

async function rows<T = any>(query: PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  return (await single(query)) ?? [];
}

