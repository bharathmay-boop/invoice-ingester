# Legal and compliance before launch

What has to be true before someone outside this house can sign up. Researched 7 October 2026. Epic: [#171](https://github.com/bharathmay-boop/invoice-ingester/issues/171).

This is not legal advice. It is the engineering and product work that compliance implies, written so a lawyer can be asked narrow questions instead of broad ones. Everything with a date on it is dated because the date is already fixed.

## 0. The prerequisite that makes the rest of this meaningful

There are no users. There is one.

`docs/spec.md` records the decision plainly: hosted, single user, one password, which rules out "sign up, accounts, per tenant queries". `lib/auth.ts` holds it up: `isCorrectPassword` compares a candidate against one `ADMIN_PASSWORD`, and the session is an HMAC over an expiry and that same password. Every row in the database belongs to whoever knows it.

So every obligation in this document that turns on *whose* data something is currently has one answer, and launching to outside customers changes that answer before it changes anything else. Specifically:

- **A DPA names a controller.** With one shared password there is no controller to name other than us, and we cannot be the processor of our own data.
- **Tenant isolation is the central promise of the DPA** and there is nothing to isolate yet. Section 11's isolation tests are tests of a thing that does not exist.
- **Erasure, export and access requests** are requests about one person's data. With shared access they would return everyone's.
- **A subscription implies an account.** See [payments.md](payments.md); there is nothing to attach a subscription to.

This is not a reason to defer the research, which is why it was done. It is a reason the first launch issue is accounts and tenancy, and the compliance work either lands with it or immediately after it. Any date in this document is a date measured from there.

The sizing is not small: a tenant column on every table that holds customer data, a scope on every query that reads one, real sign-up with per-user credentials, password reset, and the isolation tests. The security audit already pushed sessions in the right direction (#123, revocable sessions), so the auth work is not starting from nothing.

## 1. The two roles, which is the thing to get right first

The product holds two kinds of data and the rules for them are different.

**Account data.** Email, password hash, session, usage, the saved API key, billing details once there is billing. We decide why we hold it. Under GDPR that makes us a **controller**; under India's DPDP Act a **Data Fiduciary**. Our own privacy notice and our own lawful basis.

**Uploaded content.** The invoices and the contracts, and everything read out of them: supplier names, addresses, GSTINs and VAT numbers, contact details printed on a letterhead, line items, agreed rates, signatures. We hold this only because a customer put it there, and only to do what they asked. That makes us a **processor** and a **Data Processor**.

The second role is the one that constrains the build, for three reasons.

A supplier whose name and GSTIN sit in our database never agreed to anything with us. We have no relationship with them and cannot obtain their consent. Our lawful ground is our customer's, and our job is to process on documented instructions and nothing else. Training a model on it, mining it across tenants, or using it to build a benchmark are all outside those instructions unless the customer agreed separately and specifically.

A contract is commercially sensitive in a way an invoice is not. It is the document a buyer would least like a competitor or their own supplier to see, and it is frequently covered by an NDA between our customer and their supplier. Holding it raises the confidentiality bar above anything the privacy statutes require.

Under DPDP the processor's obligations are **purely contractual**: a Data Processor has no direct statutory duty to the Data Protection Board, and section 8(2) says a Data Fiduciary may only engage a processor under a valid contract. So an Indian business customer cannot lawfully use this product until we offer them that contract. The practical effect: **a Data Processing Agreement is not an enterprise upsell, it is a launch blocker.** Without one, a compliant customer's own legal team should stop them signing up.

### What this means concretely

- Two separate documents, not one. A privacy notice for account data, where we are the controller. A DPA for uploaded content, where we are the processor. A single "privacy policy" covering both will be wrong about one of them.
- The DPA has to be available without a sales conversation, because the customers most likely to need it are the ones self-serving.
- Tenant isolation is a contractual promise, so it needs to be an architectural one. Every query that reads invoice or contract data must be scoped, and that scoping must be tested rather than assumed.

## 2. Which laws apply, and why

| Regime | Why it reaches us | What it is about this product |
| --- | --- | --- |
| **India DPDP Act 2023 + Rules 2025** | Indian company, Indian customers, data processed in India | Both roles. Notice, consent, erasure, breach reporting, one year of logs |
| **EU/UK GDPR** | One EU or UK customer is enough; no establishment needed | Both roles. Also Article 28 processor terms and transfers out of the EEA |
| **US state privacy laws** | A customer in any of nineteen states with a comprehensive law | Mostly thresholds we are under, but opt-out signals and notice apply regardless |
| **EU AI Act** | We deploy an AI system that reads documents for EU users | Article 50 transparency from 2 August 2026 |
| **EU Data Act** | We are a SaaS provider with EU customers | Switching and export rights, already in force |
| **ePrivacy (cookie rules)** | Any EU visitor to the site | Prior consent for anything non-essential, which includes our analytics |
| **Tax and company law** | We hold accounting records | Retention floors that override deletion requests |

Three that are worth naming as *not yet* applicable, so they are not worried about prematurely: NIS2 (we are not in scope at this size), DORA (financial entities only), SOC 2 (not law, but the first enterprise customer will ask).

## 3. India: DPDP Act and the Rules

### The dates

The Rules were notified 13 to 14 November 2025, with an eighteen month phase-in.

| When | What begins |
| --- | --- |
| 14 November 2025 | Data Protection Board constituted; foundational provisions live |
| 13 November 2026 | Consent Manager registration framework operative |
| **14 May 2027** | Every substantive obligation: notice, consent, security, breach reporting, data principal rights |

May 2027 is the hard date, and it is far enough away that building to it now is cheap and retrofitting later is not.

### Rule 3: what the notice must contain

The notice has to stand on its own. A paragraph inside the terms of service does not satisfy Rule 3. It must be understandable without reference to anything else, in clear plain language, and it must contain:

- an **itemised** description of the personal data collected, item by item, not "your information"
- the specific purpose for **each** item, so purposes are not bundled
- a specific description of the goods, services or uses the processing enables
- a link and a means to **withdraw consent**, as easy as giving it was
- a means to exercise rights: access, correction, erasure
- a working link to complain to the Data Protection Board
- availability in English and the Eighth Schedule languages

The itemisation requirement is the one that bites a product like this, because the honest list is longer than people expect. It has to say that uploaded documents are sent to a third party model provider, and name what that means.

### Erasure and the 48 hour notice

Rule 8 requires the Data Principal to be told **at least 48 hours before** their data is erased, giving them a last chance to act. That is not a nicety: it is a scheduled job, a notification, and a grace window in the data model. It cannot be bolted onto a delete button.

Data must be erased once consent is withdrawn, or as soon as it is reasonable to assume the purpose is no longer served, **unless retention is legally required**. See section 7.

### Logs

Personal data and logs relevant to detecting and investigating unauthorised access must be kept for a **minimum of one year**. So log retention has a floor as well as a ceiling, and the floor is a compliance obligation rather than an operational preference.

### Breach

The Data Protection Board must be notified within **72 hours**, and affected users informed without delay. A Significant Data Fiduciary gives an initial intimation immediately with the nature, extent, timing, location and likely impact, then a detailed report within 72 hours covering circumstances, mitigation and confirmation that users were told. Penalties run to Rs 250 crore.

We are not a Significant Data Fiduciary at this size, but the 72 hour clock and the user notification apply regardless, and the runbook is the same either way.

### Children

Anyone under 18 needs verifiable parental consent, and no behavioural advertising or tracking. The clean answer for a B2B accounts-payable tool is to state in the terms that it is not for under-18s and not to collect age data, rather than to build verification.

## 4. EU and UK GDPR

### As controller, for account data

- **Lawful basis** per purpose, written down. Contract performance for the account itself. Legitimate interests for security logging and fraud prevention, with a balancing test on file. Consent for analytics and for marketing email, and consent only.
- **Articles 13 and 14 notice**: identity, purposes and bases, recipients, transfers and their safeguard, retention periods or the criteria, the rights including objection and portability, the right to complain to a supervisory authority, and whether provision is mandatory.
- **Records of processing (Article 30)**. A table, not a product. Ours is small and it needs to exist.
- **Data subject requests**: access, rectification, erasure, restriction, portability, objection. One month, extendable to three with a reason. Identity verification without demanding more data than necessary.
- **Breach**: 72 hours to the supervisory authority where there is a risk, and to the individuals where the risk is high.

### As processor, for uploaded content

Article 28 requires a written contract with specific terms. The DPA must say: process only on documented instructions; confidentiality of personnel; Article 32 security measures; subprocessors only with authorisation, with a change mechanism and an objection right; assistance with data subject requests; assistance with breach notification; delete or return on termination; audit and information rights.

**Subprocessors are the sharp edge.** Today the chain is: us, then Vercel (hosting and Blob storage), then Neon (Postgres), then OpenRouter, then whichever model provider served the request. The last link is the hardest to disclose honestly, because OpenRouter routes dynamically. The options are to pin a provider, to constrain routing, or to disclose the set of possible providers and keep it current. Doing nothing is not an option: Article 28(2) forbids engaging a processor without the controller's authorisation.

### Transfers out of the EEA

**India has no EU adequacy decision.** No partial recognition, no sectoral carve-out. An assessment may begin in 2026 to 2027 off the back of DPDP, but it has not. So every transfer of EU personal data to India needs a transfer tool, in practice the 2021 **Standard Contractual Clauses** plus a **Transfer Impact Assessment**, and a TIA against Indian law is likely to surface problems that need supplementary measures.

That is a real constraint on where this runs. Three honest paths:

1. **Keep EU customer data in the EU.** Neon and Vercel both offer EU regions; Blob storage region needs checking. Operate it from India under SCCs covering our own access, which is a much narrower transfer than storing it there.
2. **Transfer under SCCs with a documented TIA** and supplementary measures: encryption at rest and in transit, access controls, a government-access response policy, transparency reporting.
3. **Decline EU customers at launch** and say so plainly. Defensible for a v1, and reversible.

Path 1 is the one that ages best, and the decision belongs before the first EU signup, not after.

### DPIA

A Data Protection Impact Assessment is needed for processing likely to result in high risk, which includes systematic large-scale processing and new technologies. Sending customers' commercial documents to a third-party LLM is new technology processing data the customer cannot easily re-obtain. It is close enough to the line that doing a short DPIA is cheaper than arguing we did not need one.

## 5. United States

Nineteen states have comprehensive consumer privacy laws in force in 2026, with Kentucky, Indiana and Rhode Island joining on 1 January 2026. Most have thresholds, commonly 100,000 consumers, that a product at this stage is far below, so the substantive obligations mostly do not bite yet.

Three things apply or should be built anyway.

**Universal opt-out signals.** Eleven or more states now require honouring the Global Privacy Control. It is a browser signal and respecting it is a few lines: read `Sec-GPC`, treat it as a refusal of analytics, and do not set the cookie. Cheaper to build now than to retrofit, and it makes the EU banner logic simpler rather than harder.

**Notice.** State notice requirements apply at low or no threshold in several states. One honest privacy notice covers it.

**Do not sell or share.** We do not sell data and should say so explicitly, because "sale" is defined broadly enough that some analytics and ad integrations count. If an advertising pixel is ever added, this changes and a "Your Privacy Choices" link becomes necessary.

## 6. Cookies, analytics, and the consent that is actually required

The site ships **PostHog**, gated on `NEXT_PUBLIC_POSTHOG_KEY`. A `phc_` key is public by design, which is a separate question from whether the tracking is lawful.

PostHog is **not** strictly necessary to deliver the service. Under ePrivacy Article 5(3) that means **prior consent** before anything is stored on the device and before any event is sent. Not legitimate interests, and not an opt-out.

What a compliant banner looks like, from EDPB guidance and recent enforcement:

- Nothing non-essential fires **before** a choice is made. The common failure is loading the script and asking afterwards.
- **Reject All** as prominent as Accept All, on the first layer, same visual weight, same number of clicks.
- Every non-essential toggle **off** by default. No pre-ticked boxes.
- **No cookie wall.** Conditioning access on consent makes it not freely given. A consent-or-pay model does not fix this; EDPB Opinion 08/2024 says such models usually fail.
- Withdrawal as easy as giving, reachable at any time.
- A cookie policy listing each cookie, its purpose, its duration and who sets it.

Enforcement is not theoretical: in 2025 the CNIL fined Google €325m and Shein €150m on the same day over cookie practice, including a "Reject all" that did not always work.

**The lazy and correct answer for this product**: the session cookie is strictly necessary and needs no consent. Everything else is one vendor. Either drop PostHog, or put it behind a real consent gate that defaults to off, honours GPC, and loads nothing until accepted. Dropping it is a legitimate choice and removes an entire compliance surface; if it stays, it earns its banner.

The signed-in app is not exempt. Consent is still consent inside a logged-in product.

## 7. Data retention, which is the hard part

Two rules point in opposite directions and both apply.

Deletion rights say: erase when the purpose is served, and on withdrawal of consent.

Tax and company law says: keep the invoice.

| Jurisdiction | Floor on accounting records |
| --- | --- |
| India, Companies Act 2013 | **8 years** for books of account and vouchers |
| India, GST | **72 months** from the due date of the annual return |
| EU, VAT | 6 years typically, up to 10 for capital goods schemes |
| UK, VAT | 6 years |
| US, IRS | 3 to 7 years depending on circumstances, states may be longer |

Both regimes are satisfied by the same mechanism: **a written retention schedule, per data category, with a named basis and a named trigger.** A legal obligation to retain is a lawful refusal of an erasure request, and in practice invoices and tax records are the most common legitimate refusal a business makes.

One subtlety worth writing down because it is easy to get wrong: **GDPR only recognises legal obligations imposed by EU or Member State law.** India's Companies Act is not a GDPR legal obligation. For an EU customer's data, "we must keep this for eight years under Indian law" is not by itself an answer; the defensible framing is the customer's own retention obligation, which is theirs to assert, which is another reason the retention period belongs in the DPA as a customer-configurable term rather than a constant in our code.

### Proposed schedule

| Category | Retention | Basis and trigger |
| --- | --- | --- |
| Account record, email, password hash | Life of account + 30 days | Contract; deletion on closure after the grace window |
| Session tokens | Until expiry | Necessity |
| Uploaded invoices and contracts, and extracted data | **Customer-configurable, default life of account + 30 days**, with an option to set a longer statutory period | Processor; customer's instruction. Theirs to decide, not ours |
| Stored original documents in Blob | Same as the row that points at them | Must not outlive the row; orphans are a finding in their own right |
| Access and security logs | **12 months minimum**, 13 months maximum | DPDP Rule; security legitimate interest |
| `extraction_event` cost and token telemetry | 24 months | Legitimate interest in cost control. Contains no document content, which is what makes the longer period defensible |
| Billing records and our own invoices | 8 years | Indian Companies Act; we are the controller here |
| Consent and withdrawal records | 7 years | DPDP Consent Manager audit trail standard |
| Backups | 35 days rolling | Documented as a known lag on erasure, which is accepted practice if disclosed |

Three things have to be built for this to be real: the **48 hour pre-erasure notice** DPDP requires, a **scheduled job** that actually deletes on the schedule, and a **deletion that reaches the blob store**, which the recent demo cleanup showed is easy to miss.

## 8. The model provider chain, and the EU AI Act

### What actually happens today

A customer uploads a PDF. The bytes go to Vercel Blob. A worker downloads them, extracts text, and sends the document content to **OpenRouter**, which routes to a provider for the configured model, by default `google/gemini-2.5-flash`. The response comes back and is stored whole in `contract.extraction`.

So document content leaves our infrastructure and reaches at least two other companies. Nothing in the product says so.

### What has to be true

- **Disclosed.** A published subprocessor list naming OpenRouter and the model providers in use, with a notice mechanism for changes and a right to object.
- **Contracted.** A DPA with OpenRouter. Theirs is available to enterprise-tier customers through their trust portal, so the tier may be a compliance cost rather than a capacity one.
- **Not trained on.** OpenRouter does not train and by default does not log prompts or completions, but the downstream provider's policy also applies. The fix is to **enforce Zero Data Retention routing**, which restricts to provider endpoints that do not retain prompts or completions, and to say so in the notice. Metadata still flows: token counts, latency, model name. That is disclosable and harmless.
- **Regionally constrained, if we take the EU-in-EU path.** OpenRouter offers in-region routing, which matters for section 4's transfer question.
- **Switchable.** A hard dependency on one router is a single point of compliance failure. The provider layer already abstracts this; it should stay that way.

### EU AI Act Article 50

Transparency obligations apply from **2 August 2026**, with fines to €15m or 3% of turnover. For a document-reading product the relevant duty is to make clear to the user that they are interacting with an AI system and that output is machine generated. Article 50(2)'s machine-readable marking duty is aimed at generative content and systems placed on the market before 2 August 2026 have until 2 December 2026 for that part.

The product already does the right thing in substance: every screen that shows a read figure shows it as something to review, with the page and quote behind it, and nothing counts until a person confirms. That is better than a disclaimer. What is missing is saying plainly, where the reading happens, that a model produced the number and which model it was. The `extraction_meta` is already stored; surfacing it is a small change with a real compliance return.

## 9. EU Data Act: export and switching

Applicable since **12 September 2025**, and directly relevant.

- Customers must be able to switch away without commercial, technical, contractual or organisational obstruction.
- The contract must set out the switching process, a maximum notice period of **two months**, and a **detailed list of the categories of data and digital assets that can be ported**.
- Porting must complete within a **30 day** transitional period after the notice.
- Reasonable assistance, business continuity, and security during the move.
- A transparency notice about available methods and formats.
- **Switching charges end entirely on 12 January 2027**; until then only cost recovery.

This turns the CSV export in #19 from a nice-to-have into a legal requirement for EU customers, and it sets its shape: the export has to cover everything the customer put in and everything derived from it, in a documented format, including the stored original documents, not just a summary table.

## 10. The documents to publish

| Document | Covers | Blocking? |
| --- | --- | --- |
| Privacy notice | Account data, as controller. Article 13/14 and DPDP Rule 3 content | Yes |
| Data Processing Agreement | Uploaded content, as processor. Article 28 terms | Yes |
| Subprocessor list | Vercel, Neon, OpenRouter, model providers, payment provider | Yes |
| Terms of service | The contract: licence, acceptable use, liability, termination, governing law | Yes |
| Cookie policy | Each cookie, purpose, duration, who sets it | Yes, if PostHog stays |
| Retention schedule | Section 7, published or at least referenced | Yes |
| Security overview | Encryption, access control, key sealing, tenant isolation, how to report a vulnerability | Not blocking, first enterprise ask |
| AI disclosure | What the model sees, which model, what is not done with it | Yes |
| DPIA | Internal, not published | Before EU customers |
| Records of processing | Internal, not published | Before EU customers |
| Breach runbook | Internal. 72 hour clock, who decides, templates | Yes |

Plain language throughout, the same standard the rest of the repo is held to. A notice nobody can read is a notice that has not been given, and both DPDP Rule 3 and GDPR Article 12 say so in their own words.

## 11. What to build, as opposed to write

1. **Consent gate** for analytics: nothing fires before a choice, Reject as prominent as Accept, off by default, GPC honoured, withdrawable, and a record of what was consented to and when.
2. **Account deletion** that reaches every table and the blob store, with the DPDP 48 hour pre-erasure notice and a grace window.
3. **Export** for portability and for the Data Act: everything the customer put in plus everything derived, documented format, originals included.
4. **Retention job** that enforces the schedule per category rather than relying on anyone remembering.
5. **Data subject request intake**, logged, with a clock and a response template.
6. **AI disclosure in the interface**, reading from `extraction_meta`, at the point a read figure is shown.
7. **Zero Data Retention routing** enforced at the provider layer, and a test that it is.
8. **Tenant isolation tests.** Every query that reads customer content, asserted to be scoped. This is the one that turns a contractual promise into a verified one.
9. **Audit log** for security events, with the 12 month floor.
10. **Region decision** for EU data, taken deliberately and written down.

## 12. Order

**Before any outside signup:** privacy notice, terms, DPA, subprocessor list, AI disclosure, cookie consent or PostHog removed, account deletion, breach runbook, retention schedule written down.

**Before the first EU customer:** region decision, SCCs, Transfer Impact Assessment, DPIA, records of processing, Data Act switching terms and the export that backs them.

**Before 2 August 2026:** AI Act Article 50 transparency, which the AI disclosure above mostly covers.

**Before 14 May 2027:** full DPDP build, which the notice, consent, erasure and logging work above mostly covers.

**When an enterprise customer asks:** security overview, SOC 2 readiness, audit rights, uptime commitment.

## Sources

India DPDP: [PIB notification](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf), [India Briefing](https://www.india-briefing.com/news/dpdp-rules-2025-india-data-protection-law-compliance-40769.html/), [Scrut implementation checklist](https://www.scrut.io/post/dpdp-rules), [EY analysis](https://www.ey.com/en_in/insights/cybersecurity/transforming-data-privacy-digital-personal-data-protection-rules-2025), [Rule 3 notice requirements](https://inamdarlegal.com/resources/consent-notices-dpdp-rules-2025-requirements), [consent manager deadline](https://www.maheshwariandco.com/blog/dpdp-consent-manager-framework-november-2026/), [breach notification](https://www.matters.ai/article/dpdp-breach-notification), [processor obligations](https://www.complydp.com/articles/dpdp-data-processor-obligations-india), [fiduciary and processor both](https://consentos.in/learn/dpdp-for-saas/)

GDPR and transfers: [DLA Piper India](https://www.dlapiperdataprotection.com/?t=law&c=IN), [India EU adequacy status](https://www.legiscope.com/blog/india-eu-data-transfers.html), [SCC guide](https://www.legiscope.com/blog/standard-contractual-clauses-gdpr.html), [SaaS DPA requirements](https://blog.promise.legal/startup-central/saas-dpa-requirements-enterprise/), [AI subprocessor disclosure](https://accordshield.com/blog-ai-subprocessor-customer-contract-obligations)

Cookies: [EDPB banner guidelines](https://www.onetrust.com/resources/5-gdpr-compliant-cookie-banner-guidelines-from-the-edpb-infographic/), [cookie walls](https://www.cookiebot.com/en/edpb-guidelines/), [consent or pay](https://en.wikipedia.org/wiki/Consent_or_pay), [2026 requirements](https://www.consenteo.com/knowledge-hub/GDPR/gdpr_cookie_consent_2026), [CNIL enforcement](https://cookie-script.com/news/gdpr-updates/amp)

US states: [2026 developments and universal opt-out](https://www.gunster.com/newsroom/publications/2026-data-privacy-laws-state-changes-universal-opt-out-compliance), [state tracker](https://secureprivacy.ai/blog/us-state-privacy-law-tracker-2026), [laws effective 2026](https://www.bakerdonelson.com/privacy-laws-ring-in-the-new-year-state-requirements-expand-across-the-us-in-2026)

Retention: [global e-invoice retention rules](https://vatit.com/blog/e-invoicing-data-retention/), [India financial records](https://www.aiaccountant.com/blog/financial-records-management-india), [US invoice retention](https://www.avalara.com/blog/en/europe/2025/09/us-invoice-storage-retention-rules.html), [retention versus erasure](https://heydata.eu/en/magazine/gdpr-data-retention-periods-overview-requirements-best-practices/), [the US-GDPR collision](https://www.kyl.com/wp-content/uploads/2018/06/2018.05-law.com-U.S.-Records-Retention-Requirements-Collision-Course-with-the-GDPR%E2%80%99s-Right-to-Erasure.pdf)

AI: [OpenRouter zero data retention](https://openrouter.ai/blog/insights/zero-data-retention/), [OpenRouter data collection](https://openrouter.ai/docs/guides/privacy/data-collection), [OpenRouter DPA](https://openrouter.zendesk.com/hc/en-us/articles/47828437697051-How-do-I-get-OpenRouter-s-Data-Processing-Agreement-DPA-for-GDPR-compliance), [in-region routing](https://openrouter.ai/docs/guides/features/sovereign-ai), [AI Act Article 50](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act), [Article 50 practical guide](https://artificialintelligenceact.eu/transparency-rules-article-50/), [August 2026 deadline](https://datamatters.sidley.com/2026/06/24/eu-ai-act-transparency-obligations-preparing-for-compliance-by-2-august-2026/)

EU Data Act: [Morgan Lewis](https://www.morganlewis.com/blogs/sourcingatmorganlewis/2025/09/eu-data-act-begins-september-12-impacting-cloud-services-connected-products-and-other-data-industries), [SaaS contracts](https://www.addleshawgoddard.com/en/insights/insights-briefings/2025/data-protection/eu-data-act-gamechanger-saas-contracts/), [switching requirements](https://www.alston.com/en/insights/publications/2025/09/eu-data-act-switching-requirements-cloud-services)
