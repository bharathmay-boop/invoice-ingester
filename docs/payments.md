# The payments layer, and the rules that come with taking money

Researched 7 October 2026. Epic: [#172](https://github.com/bharathmay-boop/invoice-ingester/issues/172). Companion documents: [compliance.md](compliance.md), [currency.md](currency.md).

Not legal or tax advice. It is the work taking money implies, and the decisions that have to be made before any of it is written.

## 1. The decision that comes before the code

Everything below branches on one question: **who is the legal seller of record.**

**We are.** With Stripe or Razorpay as a plain processor, we are the merchant of record. We register for tax wherever we cross a threshold, charge the right rate, file the returns, and remit. Stripe Tax will calculate for us; it does not file or remit, and it does not take the liability.

**Someone else is.** Under a merchant of record, the provider buys the licence from us and resells it to the customer. They are the seller, they own the tax liability, they file and remit, and they handle the invoice to the end customer.

### What our own obligations would actually be

This is the part worth looking at squarely before choosing the cheaper option.

- **United States.** As of January 2026, **35 states plus DC tax SaaS**, up from 28 in 2020. Economic nexus is commonly **$100,000 in gross sales or 200 transactions**, used by 38 states; California and Texas set $500,000. Illinois dropped its transaction threshold on 1 January 2026 and is revenue-only now. Marketplace facilitator laws almost never cover SaaS sold directly, so there is no relief there.
- **European Union.** B2C digital services are taxed at **the customer's** local rate, declared through the One Stop Shop. B2B sales to a VAT-registered buyer are **reverse charge** at 0%, which requires validating their VAT number through **VIES** at checkout, and treating the sale as B2C if it does not validate.
- **India.** 18% GST domestically under SAC 9983. Exports zero-rated, but only with the paperwork in section 3.
- **Elsewhere.** The UK, Australia, Canada, Singapore, UAE, Japan, Switzerland, Norway and others all have digital services registration thresholds, several of them at zero.

Each registration is a filing cadence forever, not a one-off.

### The recommendation

**A merchant of record for everything except India, and an Indian payment aggregator for domestic rupee payments.**

The fee comparison is roughly 2.9% + 30¢ against about 5%. The two percent is not the number to optimise. For a one person company, the alternative is registering and filing in a growing list of jurisdictions, and the first mistake costs more than a year of the difference. Paddle covers 200+ markets as full MoR. Stripe launched **Stripe Managed Payments** in February 2026, its own MoR product, enabled by a single parameter in Checkout and covering 80+ countries; Lemon Squeezy is a Stripe company since 2024.

India is carved out because a global MoR handles Indian payments badly. UPI is how Indian businesses actually pay, RuPay cards are common, and the RBI's recurring-payment rules in section 3 are specific enough that a provider has to be built for them. Razorpay or Cashfree domestically, both of which hold the relevant RBI authorisation.

The cost of the split is two integrations and two reconciliation paths. The alternative is either bad Indian payments or a tax obligation we cannot discharge.

**Revisit when** either annual revenue makes two percent a real number, or an enterprise customer needs to be invoiced and pay by bank transfer against a purchase order, which MoRs handle poorly.

## 2. What has to be built either way

**Before any of this: there is nothing to attach a subscription to.** The product is single user with one shared password, per `docs/spec.md` and `lib/auth.ts`. Accounts and tenancy come first; see [compliance.md](compliance.md) section 0. Everything below assumes an account exists.


### Data model

```
plan              what is sold: code, name, limits, active
price             plan + currency + interval + amount, one row per currency
subscription      customer, plan, status, period start/end, cancel_at,
                  provider id, provider customer id
payment_event     every webhook, raw, with provider id unique.
                  the idempotency ledger, and the audit trail
tax_identity      customer's GSTIN / VAT number / nothing, validated_at,
                  and the country it was validated against
billing_profile   legal name, address, country, whether business or consumer
```

Two rules on this model worth stating because both are easy to get wrong.

**The provider is the source of truth for subscription state, and the webhook is the only writer.** Not the checkout redirect, which the customer can close. A success page that grants access is a success page that grants access to anyone who can guess the URL.

**`payment_event` is written before it is acted on, keyed on the provider's event id with a unique constraint.** Webhooks arrive twice, out of order, and after a replay. Idempotency is not an optimisation here; a double-charge or a double-grant is the failure mode.

### Entitlement

One function that answers "what may this account do right now", reading from subscription state, with a single grace period for a failed payment. Everything else calls it. The temptation is to check `subscription.status` at each call site, which produces five answers to one question.

A free tier needs a limit that is cheap to enforce and honest to explain. For this product the natural one is documents read per month, because that is what costs money: each read is a paid model call, and `extraction_event` already records the cost of every one. Pricing that tracks the actual unit cost is pricing that cannot be gamed into a loss.

### The screens

- Pricing, with the display rules in section 6.
- Checkout, hosted by the provider. No card field ever rendered by us.
- Billing, in the account: current plan, next charge, payment method, invoice history, upgrade, downgrade, cancel.
- Cancellation, which has legal shape. Section 5.
- Dunning: a failed payment, what happens next, how long until access stops.

## 3. India

### GST

SaaS is a service under **SAC 9983** (998314 or 998315) at **18%** for Indian customers. Registration threshold for an OIDAR-style service is effectively zero: a day-one startup selling to overseas users needs to be registered.

### Export of services

Sales to customers outside India are **zero-rated exports**, but only on paper that exists:

- A **Letter of Undertaking** filed on the GST portal, annually, **before** the financial year begins, and before raising any export invoice. Miss it and IGST is payable upfront and reclaimed later.
- The export invoice must carry the words **"Supply meant for export under LUT without payment of integrated tax."**
- Place of supply for an overseas customer is the recipient's location.
- Foreign currency receipt evidenced by a **FIRC**, which is what proves the export actually was one.

### Collecting from abroad

Receiving foreign payments needs an **RBI-authorised cross-border payment aggregator (PA-CB)**, framework introduced by master circular on 31 October 2023, in three categories: export only, import only, or both. An authorised PA-CB gives multi-currency collection, FEMA compliance, automatic FIRC, and settlement into an Indian or EEFC account. Razorpay holds a cross-border licence; Xflow holds both export and import authorisation as of February 2026. Only a handful do.

**This interacts with the MoR decision.** Under a merchant of record, the MoR collects from the customer and pays us, which is one inbound remittance from one counterparty rather than thousands. That is dramatically simpler for FEMA, FIRC and reconciliation, and it is a second reason to prefer the MoR route that has nothing to do with tax.

### Recurring payments: the e-Mandate Framework 2026

The RBI released the **Digital Payments e-Mandate Framework, 2026** on 21 April 2026, consolidating eight earlier circulars into one set of rules for recurring domestic and international collections on cards, prepaid instruments and UPI.

What it requires:

- **No per-cycle authentication below Rs 15,000.** Above it, additional factor authentication every cycle, which in practice means the customer approves each charge. The Rs 1,00,000 exemption is only for insurance premiums, mutual fund subscriptions and credit card bills, and does not extend to SaaS.
- **A pre-debit notification at least 24 hours before every charge**, with the full transaction details and a means to opt out.
- **A confirmation alert after every successful collection.**
- **No storage of card details.** Tokenisation through a compliant token requestor is mandatory.

Consequences for pricing, which are product decisions and not implementation details:

Annual plans priced above Rs 15,000 will ask the customer to authenticate at every renewal, and a meaningful share will fail. Monthly pricing under Rs 15,000 renews silently. That is an argument for keeping the monthly price well under the threshold and treating annual plans as invoice-and-transfer rather than card autopay.

**UPI AutoPay** is the mechanism Indian customers will expect, and it runs under the same mandate rules.

The 24 hour pre-debit notification is a build item: a scheduled job, a template, an opt-out link, and a record that it was sent.

## 4. European Union and United Kingdom

### VAT

- **B2C**: the customer's local rate, declared via the **One Stop Shop**. A non-EU business uses the non-Union OSS scheme: register in one member state, file one quarterly return covering all B2C digital sales.
- **B2B**: **reverse charge** at 0%, if and only if the buyer has a valid VAT number. Validate through **VIES** at checkout. No valid number means treat it as B2C and charge VAT.
- The invoice must carry both parties' details, the VAT number, and for reverse charge a statement that the reverse charge applies.
- The UK is separate: its own registration, its own return, no OSS.

Under a merchant of record all of this is theirs. We still have to **collect the VAT number and the country**, because it determines the price shown and what the invoice says.

### Strong Customer Authentication

PSD2 SCA applies to EEA and UK cards: two factors, in practice 3D Secure 2. Subsequent merchant-initiated charges on an established mandate are usually exempt, which is why the initial authentication has to be set up as a mandate rather than a one-off charge. Any provider handles this; the thing to get right is not accidentally taking the first payment outside the mandate flow.

### E-invoicing

Member state B2B e-invoicing mandates are already live and spreading: Belgium mandatory since January 2026, Poland's KSeF from 1 February 2026 for the largest filers and 1 April 2026 for the rest. ViDA brings mandatory structured e-invoicing and digital reporting for cross-border intra-EU B2B from **1 July 2030**, with invoices issued within 10 days of supply.

Two separate reasons this matters, and they should not be conflated. For **our own billing** to EU business customers it is an eventual obligation, mostly the MoR's problem, and 2030 is far away. For **the product** it is a roadmap item, because a customer in Belgium or Poland is already receiving structured e-invoices rather than PDFs, and a tool that only reads PDFs will quietly become less useful to them. Worth its own issue, not this epic.

### Consumer protection

If we ever sell to consumers or sole traders:

- **14 day right of withdrawal** from the day the contract is concluded.
- From **19 June 2026**, Directive 2023/2673 requires an easy-to-find electronic **withdrawal button** on the site for consumer online contracts. Traders operating solely B2B are exempt.

A clean B2B-only position, stated in the terms and enforced at signup by requiring a business name and country, avoids this entire surface. That is the recommendation, and it should be a deliberate statement rather than an accident of not having thought about it.

## 5. United States

### Sales tax

Covered in section 1. Under a merchant of record it is theirs.

### Automatic renewal

Around **thirty states** have auto-renewal or negative-option statutes, several stricter than the federal rule. The federal position is unsettled: the FTC's 2024 click-to-cancel rule was **vacated in full in July 2025** on procedural grounds, reinstating the narrow 1973 rule, and the FTC reopened rulemaking with an ANPRM on **11 March 2026**. Nothing has replaced it. What binds today is **ROSCA**, section 5 of the FTC Act, and the state statutes.

Build to **California's amended Automatic Renewal Law**, effective 1 July 2025, which matches or exceeds the vacated federal rule and is the strictest in practice:

- **Express affirmative consent** to the renewal terms, separate from accepting the terms of service.
- **Proof of that consent retained at least three years.**
- **Annual renewal reminders.**
- **Click to quit**: online cancellation for anyone who signed up online, no phone call, no retention gauntlet, and at least as easy as signing up was and in the same medium.

Cancellation should be a button in the billing screen that cancels. An offer to stay may be shown, once, after the cancellation is already effective.

## 6. Pricing display and invoicing

- **B2C in the EU**: prices shown must include VAT, so the displayed price varies by country.
- **B2B in the EU**: show excluding VAT, say so, and apply reverse charge once the VAT number validates.
- **India**: show including GST for Indian customers.
- Never silently change the price between the pricing page and the checkout. Show the tax line before payment, not after.
- Our own invoices need the fields each jurisdiction requires: our legal name and address, our GSTIN, the customer's details and tax number, invoice number and date, a description, the tax rate and amount or the reverse-charge statement, and the total.

There is something fitting about an invoice product having to get its own invoices right, and it is worth doing properly for that reason alone. It is also the best possible test data: our own invoices, through our own reader.

## 7. PCI DSS

**Card data never touches this application.** Hosted fields or a hosted checkout from a compliant provider, which keeps us on **SAQ A** under PCI DSS 4.0.1.

SAQ A eligibility changed on **31 March 2025**: requirements 6.4.3 (authorising and inventorying browser-loaded scripts) and 11.6.1 (weekly tamper detection on payment page content and HTTP headers) were removed from SAQ A and replaced by an eligibility criterion that the site is not susceptible to script-based attacks against the ecommerce systems. That is satisfied either by implementing script protections ourselves or by **getting written confirmation from the provider** that their embedded solution includes them. Get the letter; it is an email, and it is the difference between SAQ A and a much longer questionnaire.

Also required: annual self-assessment, treating the provider as a managed third party, and securing anything of ours that can affect the payment page. The security headers already shipped help here.

## 8. What can go wrong, and the guard for each

| Failure | Guard |
| --- | --- |
| Webhook replayed, customer charged or granted twice | `payment_event` unique on provider event id, written before acting |
| Checkout abandoned after payment, access never granted | State comes from the webhook, never the redirect |
| Subscription cancelled at the provider, access continues | Reconciliation job comparing provider state to ours, daily |
| Price changed, existing subscribers silently repriced | Price is a row, subscriptions reference the row they were sold at |
| Refund issued, access stays | Refund and dispute webhooks handled, not just payment success |
| Tax charged in the wrong currency or at the wrong rate | Currency and tax jurisdiction are separate fields. See [currency.md](currency.md) |
| Customer deleted, billing records deleted with them | Billing records retained 8 years as controller. See [compliance.md](compliance.md) section 7 |
| Indian annual renewal fails on authentication | Monthly price under Rs 15,000; annual by invoice |

## 9. Build order

1. Decide merchant of record. Nothing else can start.
2. Plans, prices, entitlement, free tier limit tied to documents read.
3. Checkout, webhook ingestion with idempotency, subscription state.
4. Billing screen, invoice history, payment method update.
5. Cancellation to the California standard.
6. Tax identity capture and VIES validation.
7. Dunning and the grace period.
8. India: domestic aggregator, UPI AutoPay, the 24 hour pre-debit notification job.
9. Reconciliation job.
10. Our own invoice generation, with the per-jurisdiction fields.

Steps 1 to 5 are launch. 6 and 7 are launch if selling to the EU. 8 is launch if selling in India, which it is.

## Sources

Merchant of record: [Stripe vs Paddle vs Lemon Squeezy vs Polar for B2B SaaS](https://fintechspecs.com/blog/stripe-vs-paddle-vs-lemon-squeezy-vs-polar-merchant-of-record-b2b-saas/), [Stripe vs Paddle 2026](https://www.buildmvpfast.com/compare/stripe-vs-paddle), [processor comparison](https://appstackbuilder.com/blog/stripe-vs-lemon-squeezy-vs-paddle)

US tax: [SaaS sales tax state by state](https://www.numeral.com/blog/sales-tax-on-saas), [economic nexus handbook](https://www.numeral.com/blog/economic-nexus), [2026 sales tax changes](https://taxcloud.com/blog/sales-tax-changes-2026/), [marketplace facilitator laws](https://www.numeral.com/blog/marketplace-facilitator)

EU VAT: [EU VAT for B2B SaaS 2026](https://www.scalemetrics.ai/eu-vat-for-b2b-saas-in-2026-oss-reverse-charge-invoices-common-mistakes/), [OSS and reverse charge](https://aliteq.com/eu-vat-for-saas-sellers), [ViDA work programme](https://edicomgroup.com/blog/vida-the-european-union-promotes-b2b-electronic-invoicing), [European e-invoicing roadmap 2026](https://www.fiskaly.com/blog/e-invoicing-mandates-in-europe-2026)

India: [GST on software services and SAC codes](https://www.xflowpay.com/blog/gst-on-software-services), [GST on SaaS exports](https://tallysolutions.com/gst/gst-software-saas-exports-international-clients/), [place of supply and export rules](https://www.incorpx.io/blog/saas-company-gst-billing-place-of-supply-export), [RBI e-Mandate Framework 2026](https://taxguru.in/rbi/rbi-issues-consolidated-directions-digital-payments-e-mandate-framework-2026.html), [e-mandate thresholds](https://rocketpay.co.in/blog/rbi-e-mandate-recurring-payments-15000), [recurring payments under RBI rules](https://business.phonepe.com/articles/how-recurring-payments-on-cards-work-under-rbi-guidelines), [PA-CB framework](https://enterslice.com/learning/cross-border-payment-aggregators-rbi-regulations-and-business-use-cases/), [global payments for Indian SaaS](https://www.cashfree.com/blog/indian-saas-global-payments-guide/), [Razorpay cross-border licence](https://razorpay.com/blog/razorpay-rbi-cross-border-licence-global-payments/)

Consumer rules: [FTC click-to-cancel status](https://www.jonesday.com/en/insights/2026/05/ftc-revives-clicktocancel-rule-new-risks-for-subscription-businesses), [FTC restarts rulemaking](https://www.kirkland.com/publications/kirkland-alert/2026/03/ftc-restarts-subscription-rulemaking), [state auto-renewal laws 2026](https://www.purchy.ai/blog/state-automatic-renewal-laws-2026), [EU withdrawal button](https://www.crowell.com/en/insights/client-alerts/from-checkout-to-opt-out-the-eu-withdrawal-button-is-here-what-e-commerce-businesses-need-to-know), [withdrawal button compliance risk](https://www.taylorwessing.com/en/insights-and-events/insights/2026/02/withdrawal-button-as-compliance-risk-for-eu-and-non-eu-businesses)

PCI: [SAQ A changes under 4.0.1](https://www.akamai.com/blog/security/pci-dss-v4-0-1-changes-qualify-saq-a), [SAQ A eligibility](https://docs.adyen.com/development-resources/pci-dss-compliance-guide/saq-a-eligibility), [small merchant guide 2026](https://beancount.io/blog/2026/05/13/pci-dss-4-0-1-small-merchants-2026-saq-a-script-tampering-mfa-12-character-passwords-compliance-guide)
