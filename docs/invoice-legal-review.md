# Progressive invoice and damage-claim review

Reviewed October 2, 2026. Abe confirmed that moves are within Arizona only. This is a research and drafting brief for an Arizona attorney and Progressive's insurer, not an opinion that any proposed limit is enforceable. Insurance terms, endorsements, and claim instructions have not been supplied or verified.

## What the live website currently says

The [live terms](https://www.progressive-junk.xyz/terms) were retrieved directly on October 2. They match the relevant sections in `client/src/pages/landing/content/legal.ts`. They assume a 60-cent-per-pound limit unless other coverage is arranged, equate deposit payment with acceptance, label third-party insurance “Full Value Protection,” allow late claims to be denied after seven days, and exclude several categories of damage. They also promise claim acknowledgement within two business days and resolution within 30 days. These promises and exclusions require review against the actual insurance policy and service agreement. No public terms were changed in this task.

## The main legal findings

**Arizona liability limits require more than invoice fine print.** [A.R.S. 47-7309](https://www.azleg.gov/ars/47/07309.htm) requires reasonable carrier care. A transportation agreement may limit value when rates depend on value and the customer is advised of, and afforded, a higher-value option. Limits do not protect conversion to the carrier's own use; claim timing provisions must be reasonable. The website alone does not demonstrate those conditions. Do not assume a deposit makes the current 60-cent limit effective. Ask counsel how this provision applies to Progressive's particular local services.

**Be accurate about protection.** [A.R.S. 44-1613](https://www.azleg.gov/ars/44/01613.htm) requires accurate representations about insurance, damage coverage, fees, and rates. Identify carrier liability separately from actual insurance, and offer only protection supported by the contract and policy. Moving cargo, building damage, assembly work, and junk removal need different treatment; a cargo weight limit should not be presented as a blanket limit for all of them.

**Before-service paperwork matters.** To qualify for the unloading/payment exemption under [A.R.S. 44-1612](https://www.azleg.gov/ars/44/01612.htm), the mover needs a contract signed and dated by both parties before service or taking possession. It must identify the parties and mover's physical address/phone, schedule, pickup/destination, detailed services/fees, estimate, minimum/payment terms, accepted methods, and damage reimbursement procedure. A separate prescribed signed disclaimer and legible copies are also required. This is an exemption framework, not a universal invoice-format requirement. Have counsel address its cancellation rules alongside the website's deposit-forfeiture policy.

Under [A.R.S. 44-1614](https://www.azleg.gov/ars/44/01614.htm), requested extras require advance written fee acknowledgement and a copy to the customer. Goods cannot be held for those extras; statutory exceptions and payment safeguards apply. An invoice afterwards cannot cure missing advance authorization.

[The Arizona definition](https://www.azleg.gov/ars/44/01611.htm) includes packing/loading/unloading and control of household goods for intrastate moves. Disposal is excluded. Ask counsel about labor-only and retail deliveries rather than treating all work as exempt.

**Federal comparison, for future interstate work only.** [FMCSA](https://www.fmcsa.dot.gov/consumer-protection/protect-your-move/are-you-moving/liability-protection) distinguishes mover-provided Full Value Protection from third-party insurance. Interstate released value requires a specific signed election; otherwise Full Value Protection applies. Its guidance provides nine months for written claims. Those federal rules are not automatically the rules for Abe's Arizona-only work, but the website's borrowed terminology is misleading and would need revision before interstate service.

## What belongs on the invoice

Recommended record fields: legal company name and contact details; invoice number; issue/due dates; customer name and service location; job/service date and agreement reference; clear line descriptions; quantities, hours and rates; separately explained extras; subtotal, discounts and applicable tax; deposit/payments credited; total and remaining balance; accepted payment methods/instructions; and a claim contact. Do not show a deposit as a new charge again on the final invoice: credit the payment received. Verify the actual business address, public billing/claim contact, and applicable tax treatment before issuing customer documents.

Reference the **specific terms version supplied and accepted before service**, preferably with an attached copy. Do not say “payment accepts all terms” on an after-service invoice or imply the customer waived damage claims by signing a receipt. The new signature caption expressly avoids a claim waiver. The current app does not yet capture agreement versions, valuation elections, service dates, or pre-job signatures automatically; the PDF redesign does not supply those controls.

## Proposed short invoice wording — draft for review

> Payment is due on the date shown. This invoice itemizes the listed services and credits recorded payments. Any applicable service agreement and valuation election are those provided and accepted before service; this invoice does not create a new liability limit or waive damage claims.
>
> Please report concerns promptly to the company contact shown, with the invoice/job number, item or property affected, photographs, and the amount claimed with available supporting documentation. Preserve damaged property for reasonable inspection where safe and practical. Take reasonable steps to prevent further damage; document urgent safety repairs. We will review supporting records and reasonable repair or replacement estimates. Applicable legal rights and claim periods remain in effect.

Keep this wording separate from payment instructions. It is not a replacement for a signed pre-service agreement. The PDF's Service terms field defaults to blank; this draft has not been saved to production settings.

## Stronger protection against exaggerated claims

1. **Before work:** timestamped photos of each high-value/fragile item, existing damage, floors, doors and access paths; record item identity and customer-packed boxes. Obtain the customer's acknowledgement of observed conditions without making it a blanket release.
2. **Before risky work:** document the specific access/structural concern and alternatives. Stop or decline unsafe work. A customer request does not excuse careless handling.
3. **Before additions:** written scope/price approval linked to the job, with a copy for the customer.
4. **At completion:** walkthrough, after-photos, and a written list of concerns or “no visible concerns observed.” Preserve the ability to report concealed damage.
5. **When a claim arrives:** request an itemized account, photos, ownership/value evidence if available, age/condition, repair quotes, and requested amount. Missing receipts should not automatically defeat a legitimate claim. Investigate causation and pre-existing damage; avoid automatic payouts based solely on an unsupported demand.
6. **With the insurer:** follow notice deadlines, route claims appropriately, and confirm authority before admitting liability or promising a settlement. Do not promise fixed resolution deadlines the insurer cannot meet.
7. **With counsel:** settle the higher-value option/rates, reasonable local claim timing, narrowly drafted exclusions, repair/value measure, and any consequential-loss limit. Confirm that statutory rights and non-waivable liability are preserved. Retain original evidence and an audit trail under an agreed retention policy.

## Decisions still needed

- Actual cargo/moving and general liability policy, limits, deductibles, exclusions, and insurer claim instructions.
- Whether Progressive can offer a real higher-value transportation option, and its price/terms.
- The existing signed booking agreement and what customers actually receive before loading.
- The approved public billing/claims contact and full business mailing address.

Ask an Arizona attorney familiar with household-goods transportation to review the website, pre-service agreement, valuation election, and invoice together. Updating only the invoice leaves the largest gaps open.
