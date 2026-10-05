import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import {
  payableInvoice,
  validatePaidSession,
  type CheckoutAttempt,
} from "./core";
import { paymentConfig, paymentWebhook } from "./service";

const invoice = {
  id: "invoice-test",
  invoiceNumber: 101,
  clientName: "Test Customer",
  jobId: "",
  status: "sent",
  total: 108,
  amountDue: 83,
  amountPaid: 25,
  taxRate: 8,
  dueDate: "2026-10-06",
  createdAt: "2026-10-05",
  items: [
    { id: "item", name: "Service", quantity: 1, amount: 100, taxable: true },
  ],
};
const attempt: CheckoutAttempt = {
  id: "attempt",
  invoice_id: invoice.id,
  company_id: "company",
  account_id: "acct_test",
  livemode: false,
  amount_cents: 8300,
  snapshot: invoice,
  state: "open",
  stripe_session_id: "cs_test",
  expires_at: "2026-10-06",
};
const session = {
  id: "cs_test",
  status: "complete",
  payment_status: "paid",
  mode: "payment",
  currency: "usd",
  amount_total: 8300,
  livemode: false,
  payment_intent: "pi_test",
  metadata: {
    attempt_id: "attempt",
    company_id: "company",
    invoice_id: invoice.id,
  },
} as unknown as Stripe.Checkout.Session;

describe("invoice collection boundaries", () => {
  it("collects the saved balance with proportional discount tax", () => {
    expect(payableInvoice(invoice).cents).toBe(8300);
    expect(
      payableInvoice({ ...invoice, discount: 10, total: 97.2, amountDue: 72.2 })
        .cents
    ).toBe(7220);
  });
  it.each(["paid", "void", "draft"])("rejects %s invoices", status =>
    expect(() => payableInvoice({ ...invoice, status })).toThrow()
  );
  it.each([
    { amountDue: 1 },
    { total: 1 },
    { amountPaid: -1 },
    { items: [] },
    { items: [{ id: "a", name: "a", quantity: -1, amount: 100 }] },
  ])("rejects corrupt/stale invoices %j", patch =>
    expect(() => payableInvoice({ ...invoice, ...patch })).toThrow()
  );
  it("requires paid Stripe status and matching account-environment metadata", () => {
    expect(validatePaidSession(session, attempt)).toBe("pi_test");
    for (const patch of [
      { amount_total: 1 },
      { currency: "eur" },
      { livemode: true },
      { id: "other" },
      { payment_status: "unpaid" },
      { status: "open" },
      { metadata: { ...session.metadata, company_id: "other" } },
      { metadata: { ...session.metadata, invoice_id: "other" } },
    ])
      expect(() =>
        validatePaidSession(
          { ...session, ...patch } as Stripe.Checkout.Session,
          attempt
        )
      ).toThrow();
  });
  it("validates signatures over the raw bytes, rejecting modification/replay", () => {
    const stripe = new Stripe("sk_test_fixture");
    const raw = JSON.stringify({
      id: "evt_test",
      type: "checkout.session.completed",
      data: { object: session },
    });
    const secret = "whsec_fixture";
    const header = stripe.webhooks.generateTestHeaderString({
      payload: raw,
      secret,
    });
    expect(
      stripe.webhooks.constructEvent(Buffer.from(raw), header, secret).id
    ).toBe("evt_test");
    expect(() =>
      stripe.webhooks.constructEvent(Buffer.from(raw + " "), header, secret)
    ).toThrow();
    expect(() =>
      stripe.webhooks.constructEvent(
        raw,
        stripe.webhooks.generateTestHeaderString({
          payload: raw,
          secret,
          timestamp: 1,
        }),
        secret
      )
    ).toThrow();
  });
  it("defaults live collection to disabled and requires a verified account", () => {
    const original = { ...process.env };
    try {
      Object.assign(process.env, {
        STRIPE_SECRET_KEY: "sk_live_fixture",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "fixture",
        PAYMENT_BASE_URL: "https://example.com",
        STRIPE_LIVE_ENABLED: "false",
      });
      expect(() => paymentConfig()).toThrow(
        "Live card payments are not enabled"
      );
      process.env.STRIPE_LIVE_ENABLED = "true";
      delete process.env.STRIPE_ACCOUNT_ID;
      expect(() => paymentConfig()).toThrow(
        "Verify the collecting Stripe account"
      );
      process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
      expect(paymentConfig().live).toBe(false);
      process.env.PAYMENT_BASE_URL = "http://untrusted.example";
      expect(() => paymentConfig()).toThrow("HTTPS");
    } finally {
      process.env = original;
    }
  });
  it("rejects unsigned webhook before querying records", async () => {
    const original = { ...process.env };
    try {
      Object.assign(process.env, {
        STRIPE_SECRET_KEY: "sk_test_fixture",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "fixture",
        PAYMENT_BASE_URL: "https://example.com",
        STRIPE_WEBHOOK_SECRET: "whsec_fixture",
      });
      await expect(paymentWebhook(Buffer.from("{}"), "forged")).rejects.toThrow(
        "Invalid Stripe signature"
      );
    } finally {
      process.env = original;
    }
  });
});
