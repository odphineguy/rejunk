# Record customer payments already received

Prepared locally from the October 8 payment handoff. This feature records money
already received; it does not charge a card, debit a bank account, or transfer
money. Production migration and deployment are pending.

## Use

1. Create and save an invoice, linking its job. A saved draft can receive a deposit.
2. In Payments or the invoice, choose **Record payment received**.
3. Select the invoice, method, amount, Phoenix received date and original reference.
   Zelle, cash receipts, checks, externally collected cards and cleared bank payments
   are supported. Only record confirmed received funds, not pending bank payments.
4. Check the amount already received before adding another payment. Older manually
   entered invoice totals are retained as a baseline, not silently converted to
   invented transaction records. Do not record those same payments again.
5. After server confirmation, the payment appears in Payments with its reference;
   the invoice and linked job show received and remaining amounts. Transfers/payouts
   to the company bank are separate and never count as another customer payment.

An invoice is required for this first recording workflow. For a job deposit, save
its invoice first. Job balance summaries use linked non-void invoice totals rather
than guessing a final price from an estimate. Jobs with no invoice keep their legacy
status badge and explain that an invoice is needed for balance tracking.

## Safety and correction boundaries

- Owner login plus current owner membership are verified server-side and again in
  the atomic database transaction. The verified staff company determines scope.
- Payment and invoice balance update commit together. No optimistic paid state.
- A retained request UUID makes an identical retry return the existing payment.
  Method/reference uniqueness is company-scoped and case-insensitive. References
  matching existing Stripe intent records are also rejected.
- Stale paid balances, overpayments, future dates, void/paid invoices and active
  Stripe links are rejected. Cancel/reconcile links before recording other funds.
- Every payment insert explicitly stamps the company UUID.
- Recorded payments cannot be edited or deleted. Invoice details are locked after
  recording; notes remain editable. Corrections, refunds and disputes need the
  reconciliation workflow before this is suitable for unattended live collection.
- No real customer payment was recorded or moved during development. Juan Molano
  and Jackie/Jacqueline Gilliam still need an explicitly confirmed invoice/job match.
- Zelle recipient information and bank eligibility are not assumed or changed.

## Rollout

Review/apply ONLY `supabase/migrations/20261010024211_manual_invoice_payments.sql`
after confirming the company UUID, memberships, staff session and invoice-checkout
foundation in the target project. Do not push all historical migrations. Apply the
additive migration before deploying the UI/API, then verify using an approved
company owner and explicitly identified recording fixture. The action uses `/api/pay`
but needs only the existing server Supabase URL/service key, not Stripe credentials.
Both generated Vercel API files come from the shared payment source.

Deployment/push requires Abe's explicit request under AGENTS.md. Live collection
remains gated; ACH collection, refund/dispute reconciliation and Progressive Connect
are the next stages, not implemented by this increment.

## Validation

`pnpm check`, `pnpm test`, `pnpm build` and `git diff --check`.

Database assertions use an empty disposable PostgreSQL database:

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/security/test-received-payments.sql
```

The script creates fixture roles/tables. Never point it at production. Assertions
cover retained legacy amounts, partial/final balance updates, retry idempotency,
reference duplicates, tenant/owner/session isolation, stale balances, overpayment,
active Checkout conflicts, future dates, immutable history and editable notes.
Desktop/390px UI checks use isolated sample data with all payment calls mocked.
