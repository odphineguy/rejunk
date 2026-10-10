import Stripe from "stripe";
import { receivedPaymentInput } from "./received";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  CheckoutAttempt,
  PaymentError,
  payableInvoice,
  validatePaidSession,
} from "./core";

export function paymentConfig() {
  const key = process.env.STRIPE_SECRET_KEY;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const dbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const origin = process.env.PAYMENT_BASE_URL || process.env.APP_BASE_URL;
  if (!key || !url || !dbKey || !origin)
    throw new PaymentError(
      503,
      "Card payments need server configuration. Contact the owner."
    );
  const live = /^(sk|rk)_live_/.test(key);
  if (
    !/^(sk|rk)_(test|live)_/.test(key) ||
    (live && process.env.STRIPE_LIVE_ENABLED !== "true")
  )
    throw new PaymentError(
      503,
      "Live card payments are not enabled. Use the sandbox first."
    );
  const base = new URL(origin);
  if (
    base.protocol !== "https:" &&
    !(
      base.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(base.hostname)
    )
  )
    throw new PaymentError(503, "Payment return URL must use HTTPS.");
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw new PaymentError(503, "Payment return URL must be a site origin.");
  if (live && !process.env.STRIPE_ACCOUNT_ID)
    throw new PaymentError(
      503,
      "Verify the collecting Stripe account before going live."
    );
  return {
    stripe: new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000 }),
    db: createClient(url, dbKey, { auth: { persistSession: false } }),
    live,
    origin: base.origin,
  };
}

async function checked<T>(
  query: PromiseLike<{ data: T; error: any }>
): Promise<T> {
  const { data, error } = await query;
  if (error)
    throw new PaymentError(
      503,
      "Payment records could not be loaded or saved. Try again."
    );
  return data;
}

async function ownerCompany(db: SupabaseClient, token: unknown) {
  if (typeof token !== "string" || token.length < 16 || token.length > 256)
    throw new PaymentError(401, "Sign in required.");
  const session = await checked(
    db
      .from("staff_sessions")
      .select("staff_id,expires_at")
      .eq("token", token)
      .maybeSingle()
  );
  if (
    !session ||
    !Number.isFinite(Date.parse(session.expires_at)) ||
    Date.parse(session.expires_at) <= Date.now()
  )
    throw new PaymentError(401, "Sign in required.");
  const staff = await checked(
    db
      .from("staff")
      .select("active,role,auth_user_id,tenant_id")
      .eq("id", session.staff_id)
      .maybeSingle()
  );
  if (!staff?.active || staff.role !== "owner" || !staff.auth_user_id)
    throw new PaymentError(403, "Owner access required.");
  // Resolve the company from verified staff, never from request fields or a slug.
  if (!staff.tenant_id)
    throw new PaymentError(403, "Company owner access required.");
  const company = await checked(
    db
      .from("companies")
      .select("id,slug")
      .eq("id", staff.tenant_id)
      .maybeSingle()
  );
  if (!company)
    throw new PaymentError(503, "Company configuration is missing.");
  const membership = await checked(
    db
      .from("memberships")
      .select("id")
      .eq("tenant_id", company.id)
      .eq("user_id", staff.auth_user_id)
      .eq("role", "owner")
      .maybeSingle()
  );
  if (!membership)
    throw new PaymentError(403, "Company owner access required.");
  return company;
}

async function stripeAccount(stripe: Stripe) {
  const account = await stripe.accounts.retrieve(null);
  if (
    process.env.STRIPE_ACCOUNT_ID &&
    account.id !== process.env.STRIPE_ACCOUNT_ID
  )
    throw new PaymentError(
      503,
      "Stripe key belongs to a different collecting account."
    );
  // Fresh sandboxes may not be activated for live payments; allow Stripe's
  // simulated Checkout there. Live collection always requires activation.
  if (
    /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY || "") &&
    !account.charges_enabled
  )
    throw new PaymentError(
      503,
      "The collecting Stripe account is not ready to accept payments."
    );
  return account.id;
}

async function settle(
  db: SupabaseClient,
  session: Stripe.Checkout.Session,
  attempt: CheckoutAttempt,
  eventId: string
) {
  const intent = validatePaidSession(session, attempt);
  return checked(
    db.rpc("settle_invoice_checkout", {
      attempt_id: attempt.id,
      session_id: session.id,
      payment_intent_id: intent,
      stripe_event_id: eventId,
    })
  );
}

function paymentDatabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new PaymentError(503, "Payment storage needs server configuration.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function recordReceivedPayment(body: Record<string, unknown>) {
  const input = receivedPaymentInput.safeParse(body);
  if (!input.success)
    throw new PaymentError(
      400,
      "Choose an invoice, valid amount, received date, method and reference."
    );
  const db = paymentDatabase();
  const company = await ownerCompany(db, body.token);
  const { data, error } = await db.rpc("record_received_invoice_payment", {
    owner_token: body.token,
    target_company: company.id,
    request_id: input.data.requestId,
    target_invoice: input.data.invoiceId,
    received_method: input.data.method,
    amount_cents: Math.round(input.data.amount * 100),
    received_date: input.data.receivedDate,
    payment_reference: input.data.reference,
    expected_paid_cents: Math.round(input.data.expectedPaid * 100),
  });
  if (error) {
    const messages: Record<string, string> = {
      RJP01: "Sign in again with a current company owner account.",
      RJP02: "Invoice not found for this company.",
      RJP03:
        "This payment was already recorded, or its reference is already in use. Check Payments before trying again.",
      RJP04:
        "Invoice balance changed. Refresh and check payments already received before recording another.",
      RJP05:
        "Cancel any active payment link before recording a payment received elsewhere.",
      RJP06:
        "The amount exceeds the saved remaining balance, or this invoice is not available for payment.",
      RJP07:
        "Payment details are invalid. Check the amount, date, method and reference.",
    };
    throw new PaymentError(
      error.code === "RJP01" ? 403 : messages[error.code] ? 409 : 503,
      messages[error.code] ||
        "Could not save payment. Retry with the same details; do not create a second entry."
    );
  }
  return data;
}

export async function invoicePayment(body: Record<string, unknown>) {
  if (body.action === "record-received") return recordReceivedPayment(body);
  const { stripe, db, live, origin } = paymentConfig();
  const company = await ownerCompany(db, body.token);
  if (body.action === "status") {
    await stripeAccount(stripe);
    return { ready: true, livemode: live, collectingBusiness: "Abe Media" };
  }
  if (
    !["create", "refresh", "cancel"].includes(String(body.action)) ||
    typeof body.invoiceId !== "string" ||
    body.invoiceId.length > 200
  )
    throw new PaymentError(400, "Choose an invoice and payment action.");
  const invoiceId = body.invoiceId;
  const ownedInvoice = await checked(
    db
      .from("app_invoices")
      .select("data")
      .eq("id", invoiceId)
      .eq("tenant_id", company.id)
      .maybeSingle()
  );
  if (!ownedInvoice)
    throw new PaymentError(404, "Invoice not found for this company.");
  const binding = await checked(
    db
      .from("invoice_payment_ownership")
      .select("company_id")
      .eq("invoice_id", invoiceId)
      .maybeSingle()
  );
  if (!binding || binding.company_id !== company.id)
    throw new PaymentError(404, "Invoice not found for this company.");
  const accountId = await stripeAccount(stripe);
  const previous = (await checked(
    db
      .from("invoice_checkout_attempts")
      .select("*")
      .eq("invoice_id", invoiceId)
      .eq("company_id", company.id)
      .eq("livemode", live)
      .in("state", ["creating", "open"])
      .maybeSingle()
  )) as CheckoutAttempt | null;
  if (previous) {
    if (previous.account_id !== accountId)
      throw new PaymentError(
        409,
        "Finish or cancel the existing payment link before switching Stripe accounts."
      );
    if (previous.stripe_session_id) {
      const session = await stripe.checkout.sessions.retrieve(
        previous.stripe_session_id
      );
      if (session.payment_status === "paid") {
        await settle(db, session, previous, `reconcile:${session.id}`);
        return { paid: true, livemode: live };
      }
      if (body.action === "cancel" && session.status === "open")
        await stripe.checkout.sessions.expire(session.id);
      if (session.status === "expired" || body.action === "cancel") {
        await checked(
          db
            .from("invoice_checkout_attempts")
            .update({ state: "expired" })
            .eq("id", previous.id)
            .eq("state", "open")
        );
      } else if (session.status === "open") {
        return {
          url: session.url,
          livemode: live,
          collectingBusiness: "Abe Media",
        };
      } else
        throw new PaymentError(
          409,
          "This payment is still processing. Refresh shortly."
        );
    } else if (body.action !== "create")
      throw new PaymentError(
        409,
        "Finish creating the payment link before cancelling it."
      );
  }
  if (body.action !== "create") return { paid: false, livemode: live };
  const invoiceRow = await checked(
    db
      .from("app_invoices")
      .select("data")
      .eq("id", invoiceId)
      .eq("tenant_id", company.id)
      .maybeSingle()
  );
  if (!invoiceRow) throw new PaymentError(404, "Invoice not found.");
  const { invoice, cents } = payableInvoice(invoiceRow.data);
  if (invoice.id !== invoiceId)
    throw new PaymentError(409, "Invoice record is inconsistent.");
  const settings = await checked(
    db
      .from("app_settings")
      .select("value")
      .eq("key", "invoices")
      .eq("tenant_id", company.id)
      .maybeSingle()
  );
  if (settings?.value?.acceptCardPayments !== true)
    throw new PaymentError(
      409,
      "Enable Card payments in Invoice Settings first."
    );
  const attempt = (await checked(
    db.rpc("reserve_invoice_checkout", {
      target_invoice: invoiceId,
      target_company: company.id,
      collecting_account: accountId,
      is_live: live,
      expected_data: invoiceRow.data,
      amount: cents,
    })
  )) as CheckoutAttempt;
  // A creating reservation has a stable Stripe idempotency key and parameters.
  if (Date.parse(attempt.expires_at) < Date.now() + 30 * 60_000)
    throw new PaymentError(
      409,
      "An interrupted payment-link creation needs reconciliation before retrying. Contact the owner."
    );
  const metadata = {
    attempt_id: attempt.id,
    invoice_id: invoiceId,
    company_id: company.id,
  };
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      allowed_payment_method_types: ["card"],
      client_reference_id: attempt.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: attempt.amount_cents,
            product_data: {
              name: `Progressive invoice #${attempt.snapshot.invoiceNumber}`,
              description:
                "Payment collected by Abe Media for Progressive Transportation Services.",
            },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${origin}/payment-result?result=received`,
      cancel_url: `${origin}/payment-result?result=cancelled`,
      expires_at: Math.floor(Date.parse(attempt.expires_at) / 1000),
    },
    { idempotencyKey: `invoice-checkout:${attempt.id}` }
  );
  if (session.livemode !== live || !session.url)
    throw new PaymentError(
      503,
      "Stripe returned an unexpected checkout environment."
    );
  await checked(
    db.rpc("attach_invoice_checkout", {
      attempt_id: attempt.id,
      session_id: session.id,
    })
  );
  return { url: session.url, livemode: live, collectingBusiness: "Abe Media" };
}

export async function paymentWebhook(raw: Buffer, signature: string) {
  const { stripe, db, live } = paymentConfig();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new PaymentError(503, "Webhook is not configured.");
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    throw new PaymentError(400, "Invalid Stripe signature.");
  }
  if (event.livemode !== live || event.account)
    throw new PaymentError(400, "Unexpected Stripe account or environment.");
  if (
    !["checkout.session.completed", "checkout.session.expired"].includes(
      event.type
    )
  )
    return { received: true };
  const session = event.data.object as Stripe.Checkout.Session;
  // Ignore Abe Media payments outside ReJunk; never create records from metadata alone.
  if (!session.metadata?.attempt_id) return { received: true };
  const attempt = (await checked(
    db
      .from("invoice_checkout_attempts")
      .select("*")
      .eq("id", session.metadata.attempt_id)
      .maybeSingle()
  )) as CheckoutAttempt | null;
  if (!attempt)
    throw new PaymentError(
      409,
      "Checkout reservation not found. Retry delivery."
    );
  const accountId = await stripeAccount(stripe);
  if (attempt.account_id !== accountId || attempt.livemode !== live)
    throw new PaymentError(400, "Payment account mismatch.");
  // A webhook may beat the handler's attach response; server-created metadata links it.
  if (!attempt.stripe_session_id) {
    if (
      session.metadata.company_id !== attempt.company_id ||
      session.metadata.invoice_id !== attempt.invoice_id ||
      session.amount_total !== attempt.amount_cents
    )
      throw new PaymentError(400, "Payment metadata mismatch.");
    await checked(
      db.rpc("attach_invoice_checkout", {
        attempt_id: attempt.id,
        session_id: session.id,
      })
    );
    attempt.stripe_session_id = session.id;
  }
  if (event.type === "checkout.session.completed")
    await settle(db, session, attempt, event.id);
  else if (
    session.id === attempt.stripe_session_id &&
    session.status === "expired"
  )
    await checked(
      db
        .from("invoice_checkout_attempts")
        .update({ state: "expired" })
        .eq("id", attempt.id)
        .eq("state", "open")
    );
  return { received: true };
}
