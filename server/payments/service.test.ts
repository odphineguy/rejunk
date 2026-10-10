import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  rows: {} as Record<string, any[]>,
  retrieveAccount: vi.fn(),
  createSession: vi.fn(),
  reserve: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    accounts = { retrieve: fixtures.retrieveAccount };
    checkout = { sessions: { create: fixtures.createSession } };
  },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: fixtures.reserve,
    from(table: string) {
      const filters: [string, unknown][] = [];
      let allowedStates: string[] | null = null;
      const resolve = (all = false) => {
        const rows = (fixtures.rows[table] || []).filter(
          row =>
            filters.every(([key, value]) => row[key] === value) &&
            (!allowedStates || allowedStates.includes(row.state))
        );
        return { data: all ? rows : rows[0] || null, error: null };
      };
      const query: any = {
        select: () => query,
        limit: () => query,
        then: (callback: any) => Promise.resolve(resolve(true)).then(callback),
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return query;
        },
        in: (_key: string, values: string[]) => {
          allowedStates = values;
          return query;
        },
        maybeSingle: async () => resolve(),
        single: async () => resolve(),
      };
      return query;
    },
  }),
}));
import { invoicePayment } from "./service";

const originalEnv = { ...process.env };
beforeEach(() => {
  Object.assign(process.env, {
    STRIPE_SECRET_KEY: "sk_test_fixture",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "fixture",
    PAYMENT_BASE_URL: "http://localhost:3000",
  });
  fixtures.retrieveAccount
    .mockReset()
    .mockResolvedValue({ id: "acct_test", charges_enabled: true });
  delete process.env.STRIPE_ACCOUNT_ID;
  fixtures.createSession.mockReset();
  fixtures.reserve
    .mockReset()
    .mockResolvedValue({ data: null, error: { message: "reserve boundary" } });
  fixtures.rows = {
    staff_sessions: [
      {
        token: "valid-owner-token",
        staff_id: "staff",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    ],
    staff: [
      {
        id: "staff",
        active: true,
        role: "owner",
        auth_user_id: "user",
        tenant_id: "progressive-id",
      },
    ],
    companies: [{ id: "progressive-id", slug: "progressive" }],
    memberships: [
      {
        id: "membership",
        tenant_id: "progressive-id",
        user_id: "user",
        role: "owner",
      },
    ],
    app_invoices: [
      {
        id: "invoice",
        tenant_id: "progressive-id",
        data: {
          id: "invoice",
          invoiceNumber: 1,
          clientName: "Test",
          jobId: "",
          status: "sent",
          total: 1,
          amountDue: 1,
          amountPaid: 0,
          taxRate: 0,
          dueDate: "2026-10-06",
          createdAt: "2026-10-05",
          items: [
            {
              id: "item",
              name: "Test",
              quantity: 1,
              amount: 1,
              taxable: false,
            },
          ],
        },
      },
    ],
    invoice_payment_ownership: [
      { invoice_id: "invoice", company_id: "progressive-id" },
    ],
  };
});
afterEach(() => {
  process.env = { ...originalEnv };
});
const request = {
  action: "create",
  invoiceId: "invoice",
  token: "valid-owner-token",
};
describe("server collection authorization", () => {
  it.each([undefined, "forged-owner-token"])(
    "rejects missing/forged tokens before Stripe access",
    async token => {
      await expect(invoicePayment({ ...request, token })).rejects.toThrow(
        "Sign in required"
      );
      expect(fixtures.retrieveAccount).not.toHaveBeenCalled();
    }
  );
  it("rejects expired and malformed expiry sessions", async () => {
    for (const expiry of ["2000-01-01", "invalid"]) {
      fixtures.rows.staff_sessions[0].expires_at = expiry;
      await expect(invoicePayment(request)).rejects.toThrow("Sign in required");
    }
    expect(fixtures.retrieveAccount).not.toHaveBeenCalled();
  });
  it.each(["office", "crew"])(
    "rejects %s and never creates a payment",
    async role => {
      fixtures.rows.staff[0].role = role;
      await expect(invoicePayment(request)).rejects.toThrow(
        "Owner access required"
      );
      expect(fixtures.retrieveAccount).not.toHaveBeenCalled();
    }
  );
  it("checks membership even when the staff role says owner", async () => {
    fixtures.rows.memberships[0].role = "office";
    await expect(invoicePayment(request)).rejects.toThrow(
      "Company owner access required"
    );
    expect(fixtures.retrieveAccount).not.toHaveBeenCalled();
  });
  it("rejects another company's invoice before Stripe access", async () => {
    fixtures.rows.invoice_payment_ownership[0].company_id = "other-company";
    await expect(
      invoicePayment({ ...request, companyId: "other-company", amount: 1 })
    ).rejects.toThrow("Invoice not found for this company");
    expect(fixtures.retrieveAccount).not.toHaveBeenCalled();
  });
  it("rejects an invoice whose tenant disagrees with the ownership bridge", async () => {
    fixtures.rows.app_invoices[0].tenant_id = "other-company";
    await expect(invoicePayment(request)).rejects.toThrow(
      "Invoice not found for this company"
    );
    expect(fixtures.retrieveAccount).not.toHaveBeenCalled();
  });
  it.each([undefined, null, "missing-company"])(
    "fails closed for an absent staff company: %s",
    async tenant_id => {
      fixtures.rows.staff[0].tenant_id = tenant_id;
      await expect(invoicePayment(request)).rejects.toThrow(
        /Company (owner access required|configuration is missing)/
      );
      expect(fixtures.retrieveAccount).not.toHaveBeenCalled();
    }
  );
  it("cannot substitute another membership for the staff company", async () => {
    fixtures.rows.staff[0].tenant_id = "other-company";
    fixtures.rows.companies.push({ id: "other-company", slug: "other" });
    await expect(
      invoicePayment({ ...request, companyId: "progressive-id" })
    ).rejects.toThrow("Company owner access required");
    expect(fixtures.retrieveAccount).not.toHaveBeenCalled();
  });
  it("uses a second company's staff identity, membership, invoice and settings", async () => {
    fixtures.rows.companies.push({ id: "other-company", slug: "other" });
    fixtures.rows.staff[0].tenant_id = "other-company";
    fixtures.rows.memberships[0].tenant_id = "other-company";
    fixtures.rows.app_invoices[0].tenant_id = "other-company";
    fixtures.rows.invoice_payment_ownership[0].company_id = "other-company";
    fixtures.rows.app_settings = [
      {
        key: "invoices",
        tenant_id: "progressive-id",
        value: { acceptCardPayments: false },
      },
      {
        key: "invoices",
        tenant_id: "other-company",
        value: { acceptCardPayments: true },
      },
    ];
    await expect(
      invoicePayment({ ...request, companyId: "progressive-id" })
    ).rejects.toThrow("Payment records could not be loaded or saved");
    expect(fixtures.reserve).toHaveBeenCalledWith(
      "reserve_invoice_checkout",
      expect.objectContaining({ target_company: "other-company" })
    );
  });
  it("rejects a key for the wrong collecting account", async () => {
    process.env.STRIPE_ACCOUNT_ID = "acct_expected";
    await expect(invoicePayment(request)).rejects.toThrow(
      "different collecting account"
    );
    expect(fixtures.createSession).not.toHaveBeenCalled();
  });
});

describe("invoice settings ownership", () => {
  it("uses settings for the verified staff company", async () => {
    fixtures.rows.app_settings = [
      {
        key: "invoices",
        tenant_id: "progressive-id",
        value: { acceptCardPayments: true },
      },
    ];
    await expect(invoicePayment(request)).rejects.toThrow(
      "Payment records could not be loaded or saved"
    );
    expect(fixtures.reserve).toHaveBeenCalledWith(
      "reserve_invoice_checkout",
      expect.objectContaining({ target_company: "progressive-id" })
    );
  });
  it.each([undefined, null, "progressive"])(
    "rejects legacy settings bound by %s even with one company",
    async tenant_id => {
      fixtures.rows.app_settings = [
        { key: "invoices", tenant_id, value: { acceptCardPayments: true } },
      ];
      await expect(invoicePayment(request)).rejects.toThrow(
        "Enable Card payments"
      );
      expect(fixtures.reserve).not.toHaveBeenCalled();
    }
  );
  it("never uses another company's settings", async () => {
    fixtures.rows.app_settings = [
      {
        key: "invoices",
        tenant_id: "other",
        value: { acceptCardPayments: true },
      },
    ];
    await expect(invoicePayment(request)).rejects.toThrow(
      "Enable Card payments"
    );
    expect(fixtures.reserve).not.toHaveBeenCalled();
  });
});

describe("collection setup status", () => {
  it("returns sandbox status for a verified owner without an invoice", async () => {
    await expect(
      invoicePayment({ action: "status", token: request.token })
    ).resolves.toEqual({
      ready: true,
      livemode: false,
      collectingBusiness: "Abe Media",
    });
    expect(fixtures.createSession).not.toHaveBeenCalled();
  });
  it("does not expose setup status to an office account", async () => {
    fixtures.rows.staff[0].role = "office";
    await expect(
      invoicePayment({ action: "status", token: request.token })
    ).rejects.toThrow("Owner access required");
    expect(fixtures.retrieveAccount).not.toHaveBeenCalled();
  });
});

const received = {
  action: "record-received",
  token: request.token,
  invoiceId: "invoice",
  requestId: "00000000-0000-4000-8000-000000000001",
  method: "Zelle",
  amount: 0.5,
  expectedPaid: 0,
  receivedDate: "2026-10-05",
  reference: "zelle-ref",
};
describe("payments already received", () => {
  it("works without Stripe keys and uses only the verified company", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.PAYMENT_BASE_URL;
    fixtures.reserve.mockResolvedValue({
      data: { duplicate: false },
      error: null,
    });
    await expect(
      invoicePayment({ ...received, companyId: "other-company" })
    ).resolves.toEqual({ duplicate: false });
    expect(fixtures.reserve).toHaveBeenCalledWith(
      "record_received_invoice_payment",
      expect.objectContaining({
        target_company: "progressive-id",
        amount_cents: 50,
        owner_token: request.token,
      })
    );
    expect(fixtures.retrieveAccount).not.toHaveBeenCalled();
    expect(fixtures.createSession).not.toHaveBeenCalled();
  });
  it.each(["office", "crew"])("rejects %s recording", async role => {
    fixtures.rows.staff[0].role = role;
    await expect(invoicePayment(received)).rejects.toThrow(
      "Owner access required"
    );
    expect(fixtures.reserve).not.toHaveBeenCalled();
  });
  it("requires a current owner membership", async () => {
    fixtures.rows.memberships[0].role = "office";
    await expect(invoicePayment(received)).rejects.toThrow(
      "Company owner access required"
    );
    expect(fixtures.reserve).not.toHaveBeenCalled();
  });
  it.each([0, -1, 0.001, 1000000, NaN, Infinity])(
    "rejects invalid amount %s",
    async amount => {
      await expect(invoicePayment({ ...received, amount })).rejects.toThrow(
        "valid amount"
      );
      expect(fixtures.reserve).not.toHaveBeenCalled();
    }
  );
  it.each(["2026-02-30", "bad"])(
    "rejects invalid received date %s",
    async receivedDate => {
      await expect(
        invoicePayment({ ...received, receivedDate })
      ).rejects.toThrow("valid amount");
      expect(fixtures.reserve).not.toHaveBeenCalled();
    }
  );
  it("returns a duplicate conflict without leaking DB detail", async () => {
    fixtures.reserve.mockResolvedValue({
      data: null,
      error: { code: "RJP03", message: "private customer data" },
    });
    await expect(invoicePayment(received)).rejects.toThrow("already recorded");
  });
});
