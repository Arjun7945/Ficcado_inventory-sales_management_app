# Ficcado — DPDP Act (India) Compliance Implementation
### (For the Antigravity Agent)

> **This is not legal advice, and this document doesn't substitute for a lawyer.** I've structured the developer's original audit prompt into a detailed, Ficcado-specific implementation plan, but every piece of legal copy (Privacy Notice wording, Terms clause, consent language, grievance-officer designation) **must be reviewed and approved by a qualified lawyer before Ficcado relies on it or publishes it.** The agent should build the mechanics and clearly mark every piece of legal text with a `[LAWYER REVIEW REQUIRED]` tag rather than treating any of this as final.

> **Where this sits regarding other documents:** builds on every prior document — the functional spec, base Implementation Spec, Parts 2–6.1, `WhatsApp-Feature.md`, `mobile_mode_feature.md`, and `DESIGN.md`. Work on branch `compliance/dpdp` — **do not push** — and log every decision in `DPDP_PROGRESS.md` (separate from `AGENT_PROGRESS.md`, since this is its own audit trail). Treat this as its own workstream rather than a sequential phase number, since it can run in parallel with feature work, but it should be scoped and checklist-driven the same way every other part of this project has been.

---

## 0. Regulatory Context (current as of this writing — verify before relying on it)

India's Digital Personal Data Protection Act, 2023 (DPDP Act) and its Rules (notified November 2025) are being enforced in **three phases**: Phase I took effect November 2025 (Data Protection Board established, core obligations begin applying); Phase II (Consent Manager framework) takes effect around November 2026; full "hard enforcement," including the penalty regime, begins **May 2027**. Practically, this means **2026 is the implementation/testing window** — exactly the right time for Ficcado to be doing this work, ahead of full enforcement rather than scrambling at the deadline. This section is a snapshot, not a guarantee of the current legal position — confirm the current timeline before treating any date here as authoritative, since rules and enforcement schedules can shift.

**Ficcado-specific framing that changes how the developer's generic prompt should be read:** the original prompt assumes a customer-facing website with trackers, cookie banners, and customers filling in their own forms. **Ficcado's app is different** — it's an internal, admin-only tool. Customers never log into it or fill in a web form themselves; an **admin enters a customer's personal data on their behalf** during an in-person or phone sale. This changes several items below meaningfully (especially consent capture and the data-rights request channel) — flagged explicitly at each relevant section rather than blindly copying the generic prompt's assumptions.

---

## 1. Data Collection Points — Known Inventory (Confirm & Extend)

Based on everything specified across the prior documents, here is the known personal-data footprint the agent should confirm against the actual codebase (and extend if anything was missed):

| Data | Where It Lives | Personal Data? | Subject |
|---|---|---|---|
| Customer name, phone, address, email, WhatsApp number, order history | Customer Information Management sheet (Part 3, Section 1.1; WhatsApp Feature, Section 1.2) | Yes | Customer |
| Customer name, phone, address, items, amounts | Sales Management sheet | Yes | Customer |
| Customer name, items, refund details | Replacement Management, Return/Refund Management sheets (incl. Part 5's snapshot fields) | Yes | Customer |
| Customer name (linked) | Damaged Products Management sheet | Yes | Customer |
| Admin name, phone, email | Admin Information sheet | Yes | Admin/employee |
| Admin name (attribution) | Every Created/Updated By field across every sheet, Activity Log, Sales Log | Yes (minimal) | Admin/employee |
| Gmail app password, WhatsApp access token | Encrypted config storage (Implementation Spec Phase 0 security note; WhatsApp Feature Section 1.1) | No (not personal data, but sensitive credential — still in scope for the security-gap review in Section 8) | N/A |

**Third parties/processors already in the architecture:** Google (Sheets/Drive API — the entire data store; Gmail SMTP — sending emails containing customer names/order details), Meta/WhatsApp (if the Business API path is ever activated per `WhatsApp-Feature.md` Section 5; the Click-to-Chat path, Section 0 Option A, sends data through an individual admin's personal WhatsApp session, which is its own thing to disclose), Netlify (hosting).

**Agent's task:** treat the table above as a starting point, not the final answer. Search the actual codebase for every place personal data is read, written, transmitted, or logged, and confirm nothing here was missed — including anything added in phases after this document was written.

---

## 2. Privacy Notice Page

Build a **Privacy Notice** page, publicly reachable (not behind admin login, since data subjects — customers — never log in), covering:
- **What data is collected** — drawn directly from the Section 1 table, in plain language, not technical field names.
- **Why it's collected** — purpose limitation is a core DPDP principle: tie each data category to a specific purpose (e.g., phone number → order fulfillment and delivery communication; email → order confirmation and invoices; WhatsApp number → order confirmation, only if opted in).
- **Retention** — how long each category is kept, and what happens to it after (see Section 9's retention policy, which this page must accurately reflect once defined).
- **Third parties** — Google, and Meta/WhatsApp if/when that path is active, named plainly, with a short explanation of what each one does with the data (e.g., "Google Sheets stores your order records; Google's Gmail service sends you order confirmation emails").
- **Rights** — access, correction, erasure, and consent withdrawal, each explained in plain language with a link to the data-rights request form (Section 6).
- **Grievance contact** — name/role and contact details of Ficcado's designated grievance contact (Section 5).

Mark the entire body of this page `[LAWYER REVIEW REQUIRED]` — the agent should write a complete, sensible draft grounded in what the app actually does, but this is exactly the kind of legal copy that needs sign-off before publishing.

---

## 3. Consent Capture at Data Entry Points

**Reframed for Ficcado's actual flow:** since the customer doesn't fill in their own data, consent can't be a checkbox the customer ticks in a web form. Instead:
- At sale creation (and anywhere else new customer personal data is first captured — e.g., the phone-lookup/autofill flow from Part 3, Section 2.4), add a clear **admin-facing consent capture step**: the admin confirms, on the customer's behalf and at the point of collection, that the customer has been informed and consents to their data being collected/used for order processing. This should be a deliberate, unticked-by-default action the admin takes each time — not a pre-checked box.
- **Reuse the WhatsApp opt-in pattern already built** (`WhatsApp-Feature.md`, Section 1.2/2.3) as the template for this — it's already per-purpose, unticked by default, and stored on the customer record. Extend that same pattern to cover the broader "customer consents to data collection for order processing" case, and to email use specifically (since Gmail confirmations are also a distinct purpose).
- **Store consent records**, not just a boolean: capture which purpose was consented to, when, and by which admin (on the customer's behalf) — add this to the Customer Information Management sheet (Part 3, Section 1.1) as structured fields, following the same pattern as `WhatsApp Opt-In`.
- **Per-purpose, not blanket**: separate consent flags for (at minimum) order-processing data collection, email communications, and WhatsApp communications — a customer declining WhatsApp shouldn't block the sale itself, exactly as already designed for WhatsApp opt-in.

---

## 4. Non-Essential Trackers & Consent Banner

**Check before building anything here.** The developer's original prompt assumes trackers (analytics, ads, third-party embeds) exist on a customer-facing site. Based on everything specified so far, **Ficcado's app has no customer-facing pages and no analytics/ad trackers described anywhere in this project** — it's an internal admin tool. 

**Agent's task:** actually audit the codebase for any tracking scripts, analytics SDKs, or third-party embeds that load in the browser. If none exist, **do not build a consent banner** — document in `DPDP_PROGRESS.md` that this item was checked and found not applicable, rather than building an unnecessary UI element for a problem that doesn't exist. If any tracker *is* found (e.g., something added later without going through this compliance review), gate it behind a proper consent banner before it loads, and flag it clearly as a finding.

---

## 5. Grievance Contact

- Designate a grievance contact (name/role, email, and/or phone) — this is a real business decision Ficcado needs to make, not something the agent should invent; use a placeholder (e.g., `[Ficcado Grievance Officer — contact TBD]`) clearly marked for the client to fill in.
- Publish this contact in **two places**: the site footer (visible on every page, not just admin-only screens) and the Privacy Notice page (Section 2).

---

## 6. Data-Rights Request Form

**Reframed for Ficcado's actual flow:** since customers don't have accounts, this can't be a "manage my data" dashboard behind a login. Instead:
- A simple, publicly reachable **request form** (name, contact info to verify identity, phone number used on their order(s), and the type of request: Access / Correct / Erase / Withdraw Consent) — reachable from the Privacy Notice page and the footer.
- Submitted requests need an **internal admin-side workflow** to actually fulfill them — this is the harder part given the architecture:
  - **Access**: an admin needs a way to look up everything tied to a given phone number across Customer Information, Sales, Replacement, Return/Refund, Damaged Products, Sales Log, and Activity Log, and compile it for the requester. Build a lookup tool for this (could extend the existing phone-lookup pattern from Part 3, Section 2.4) rather than expecting an admin to manually search every sheet.
  - **Correction**: point to the existing Customer Information edit capability (Part 3) — already covers this for most fields.
  - **Erasure**: this is the hardest one given the app's design so far — Sales/Replacement/Return-Refund records are also **business records** (invoicing, tax, dispute history) that Ficcado likely has legitimate reasons and legal obligations to retain for a period, even after an erasure request. Don't build blind hard-deletion. Instead: build a way to anonymize/redact the *personal identifiers* (name, phone, address, email) on a customer's historical records while preserving the transactional/financial data Ficcado is legally required to keep, once retention requirements are confirmed (Section 9) — flag this specific tension to the client/lawyer explicitly, since "erase everything" and "keep records for tax/audit purposes" can genuinely conflict, and the correct balance is a legal judgment call, not an engineering one.
  - **Consent withdrawal**: straightforward — update the relevant opt-in flags (Section 3) to withdrawn; this should immediately stop future WhatsApp/email sends for that purpose.
- Log every request and its resolution somewhere durable (a new small sheet or an extension of the Sales Log conventions) — Ficcado will need to demonstrate it actually handles these requests, not just that a form exists.

---

## 7. Terms — Data Protection Clause

Add a data-protection clause to Ficcado's Terms (or create a Terms page if one doesn't exist), covering, at minimum: what the Privacy Notice governs, that using Ficcado's services implies data will be processed as described there, and a reference to the grievance/rights-request channels. Mark this `[LAWYER REVIEW REQUIRED]` like the Privacy Notice.

---

## 8. Breach Runbook

Create `BREACH_RUNBOOK.md` at the project root (not user-facing — an internal operational document) covering:
- **Detection**: what counts as a suspected breach for this specific architecture (e.g., unauthorized access to the Google service account credentials, unauthorized access to the Gmail app password or WhatsApp token, evidence of unauthorized reads/writes to any Sheet, a compromised admin account).
- **72-hour Board notice template**: a draft notification template addressed to the Data Protection Board, with placeholders for incident details, scope (which data categories/how many people affected), and remediation steps taken — marked `[LAWYER REVIEW REQUIRED]`.
- **User notice template**: a draft plain-language notice to affected customers/admins, marked `[LAWYER REVIEW REQUIRED]`.
- **Internal response steps**: who does what — rotate the compromised credential first (reusing the existing Sheet Configuration/Admin Control Centre re-issuance flows already built), assess scope using the Sales Log/Activity Log/Inventory History audit trails already built (these turn out to be genuinely useful here — they're exactly the kind of "what happened and when" record a breach investigation needs), and document the timeline.

---

## 9. Retention Policy

Not explicitly requested in the developer's original prompt, but implied by both the Privacy Notice (Section 2) and the Erasure workflow (Section 6) needing a real answer to "how long do we keep this?" rather than "forever, in a spreadsheet, by default." Define (with the client, not invented unilaterally):
- How long customer personal data is retained after their last order, and why (e.g., tax/audit requirements under Indian law may set a floor).
- How long admin data is retained after an admin leaves.
- Whether/how old data gets anonymized or purged on a schedule, versus only on an explicit request.
Document the decision in `DPDP_PROGRESS.md` and reflect it accurately in the Privacy Notice — don't let the two drift out of sync.

---

## 10. Security Gap Review

Audit the codebase for:
- **HTTPS**: confirm Netlify's default HTTPS is actually enforced everywhere (no mixed content, no HTTP fallback).
- **Encryption at rest for secrets**: the Gmail app password and WhatsApp access token were already specified to be stored encrypted (Implementation Spec Phase 0's security note, WhatsApp Feature Section 1.1) — verify this was actually implemented as specified, not left as plaintext "for now."
- **Fail-open patterns**: check that any encryption/auth check fails **closed** (denies access) on error, not open (allows access) — a common real-world bug worth explicitly testing for.
- **Login protections**: since there's no CAPTCHA anywhere in this app's design (it's admin-only, not a public signup form), confirm there's at least reasonable brute-force protection on the login/claim flows (rate limiting, lockout after repeated failures) — flag if this doesn't exist yet, since it wasn't explicitly specified in earlier phases.
- **Session handling**: confirm the JWT/httpOnly cookie session approach (Implementation Spec Phase 0) doesn't have any obvious weaknesses (missing `Secure`/`SameSite` flags, overly long expiry with no re-auth).

Document every finding in `DPDP_PROGRESS.md`, whether fixed immediately or flagged for follow-up.

---

## Phase Checklist

### Phase A — Audit & Inventory
- [ ] Confirm/extend the Section 1 data-collection table against the actual codebase.
- [ ] Confirm/refute the presence of any trackers (Section 4) — document either way.

### Phase B — Notices & Consent
- [ ] Build the Privacy Notice page (Section 2), marked for lawyer review.
- [ ] Build the admin-facing, per-purpose consent capture flow and consent-record schema (Section 3), reusing the WhatsApp opt-in pattern.
- [ ] Build the consent banner only if Phase A found real trackers requiring one.

### Phase C — Rights & Grievance
- [ ] Publish the grievance contact in the footer and Privacy Notice (Section 5).
- [ ] Build the data-rights request form and its internal fulfillment workflow — access lookup, correction (existing), erasure/anonymization (flagged tension), consent withdrawal (Section 6).
- [ ] Add the Terms data-protection clause (Section 7), marked for lawyer review.

### Phase D — Breach Readiness
- [ ] Create `BREACH_RUNBOOK.md` (Section 8), with both notice templates marked for lawyer review.

### Phase E — Retention & Security
- [ ] Document the retention policy decision (Section 9) once confirmed with the client, and reflect it in the Privacy Notice.
- [ ] Complete the security gap review (Section 10) and document findings/fixes.

### Phase F — Wrap-Up
- [ ] Summarize in `DPDP_PROGRESS.md`: what was built, what specifically needs lawyer review (list every `[LAWYER REVIEW REQUIRED]` item explicitly), and what remains open (e.g., retention policy decision pending client input, grievance contact pending client input).
- [ ] Confirm work stayed on `compliance/dpdp` and was not pushed.

---

## Definition of Done

- Every personal-data collection point in the app is documented, consented-to per-purpose, and traceable back to a specific, disclosed reason.
- The Privacy Notice, Terms clause, and both breach-notice templates exist as complete drafts, every one clearly marked `[LAWYER REVIEW REQUIRED]` — none silently treated as final.
- The data-rights request form exists and routes to a real internal workflow for each of access, correction, erasure, and withdrawal — with the erasure/retention tension explicitly flagged for a legal decision, not quietly resolved in code.
- The grievance contact is visible in the footer and Privacy Notice (even if the actual contact details are still a placeholder pending client input).
- `BREACH_RUNBOOK.md` exists and reuses the app's existing audit trails (Sales Log, Activity Log, Inventory History) as part of its response procedure.
- `DPDP_PROGRESS.md` gives a clear, honest account of what's done, what's pending legal review, and what's pending client decisions — this document's job is to make the compliance status legible, not to claim the app is "DPDP compliant" outright, which is a legal determination, not an engineering one.