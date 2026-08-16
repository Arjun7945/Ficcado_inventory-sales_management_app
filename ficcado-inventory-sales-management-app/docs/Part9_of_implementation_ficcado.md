# Ficcado Inventory & Sales Management — Part 9 Implementation Prompt
### (Refactors & New Feature — for the Antigravity Agent)

> **Additive, not a restart.** Builds on every prior document — the functional spec, base Implementation Spec (Phases 0–8a), `part2_of_implementation_ficcado.md` (9–17), `part3_of_implementation_ficcado.md` (18–24), `WhatsApp-Feature.md` (25–27), `part4_of_implementation_ficcado.md` (28–34), `part5_of_implementation_ficcado.md` (35–44), `mobile_mode_feature.md` (45–52), `part6_of_implementation_ficcado.md` (53–61, plus Part 6.1), `part7_of_implementation_ficcado.md` (62–67), `part8_of_implementation_ficcado.md` (68–83, including Parts A/B/C), and `DESIGN.md`. Treat this as **Phase 84 onward**.

---

## Part A: Refactors

### A1. All Transaction IDs Become Optional
Currently, Transaction ID is treated as conditionally **required** in a couple of places whenever the payment/refund mode isn't Cash: Sales Management's payment info, and the Return/Refund Close Ticket validation gate (Part 4, Section B2.C; tightened further for all-items returns in Part 5, Section A3). **The client wants Transaction ID to be optional everywhere it currently appears — never a blocking/required field, regardless of payment mode.**

- **Sales Management**: the Mode of Payment field still governs whether the Transaction ID *input* is shown at all (still hidden entirely for Cash, per the Part 4/Part 6.1 bug fixes) — but for UPI/Card, the field is now optional. An admin can save a sale with UPI/Card selected and no Transaction ID entered.
- **Return/Refund Close Ticket gate** (Part 4 Section B2.C / Part 5 Section A3): remove Transaction ID from the list of required fields before a ticket can close. The other checks stay exactly as specified — Item Verification Status set, Refund Status = Approved/Completed, Refund Amount not zero, Refund Mode not null (and, for all-items returns specifically, refund payment details still need to be present per Part 5 Section A3) — **only Transaction ID itself is no longer a blocking requirement.**
- Everywhere Transaction ID is displayed (invoices, confirmation emails, the Sales Log/Activity Log message templates from Part 5, and the new Payment Transactions view in Part B below), show a clear placeholder (e.g., `—`) when it's blank, rather than an empty cell or a stray "N/A" (re-checking Part 6.1's D2 fix doesn't regress here — that fix was about Mode of Payment wrongly showing N/A, not about Transaction ID legitimately being blank now).
- This change is scoped to fields that already exist (Sales payment Transaction ID, Return/Refund Transaction ID) — it does not add a new Transaction ID field to Vendor Payments, which never had one specified.

### A2. Vendor Contact Info — Split Into Dedicated Phone (Multiple) and Email Fields
Vendor Management's schema (Part 8, Section B5) currently has a single combined `Contact Details` field. Replace it with two dedicated fields:
- **Contact Number(s)** — supports **more than one number per vendor** (e.g., a main line and a backup/alternate contact). Build this as a repeatable field with an "Add another number" control, the same interaction pattern already established for other repeatable inputs in the app (e.g., the multi-item selection patterns from Part 2/Part 4).
- **Email ID** — a single dedicated field (not repeatable — the client asked for multiple phone numbers specifically, not multiple emails).
- Update the Vendor Management create/edit form, the vendor list table's contact column (now showing phone and email as distinct columns or a combined but clearly-labeled display — pick one and apply it consistently), and the vendor detail view accordingly.
- This is a schema/UI change only — no change to how Vendor Payment Log or the Profitability calculation (Part 8, Section B7/C1) works.

---

## Part B: New Feature — Payment Transactions View in Profitability

The Profitability section currently has the **📦 Product-Level Profitability Breakdown** (per-item/category profit-margin view, building on the Cost Price data from Part 8, Section B7). Add a **second table** the admin can switch to, and confirm the first one's scope while doing so.

### B0. Confirming the Product-Level Profitability Breakdown
Since this was introduced as a suggested extension (Part 8, Section B7's "suggestions") and is now a real, active part of the Profitability section, formalize its scope here: for the selected period, show each item sold with its quantity sold, revenue generated, Cost Price-derived COGS, and resulting profit/margin — sourced the same way as the rest of Profitability (Sales, Items' Cost Price), not manually entered.

### B1. Toggle Between the Two Tables
Add a clear switch/toggle at the top of the Profitability section letting the admin move between **Product-Level Profitability Breakdown** and the new **Payment Transactions** view (Section B2) — one view visible at a time, styled per `DESIGN.md`.

### B2. Payment Transactions Table
Reference: the attached mockup image. Build this as a unified, filterable ledger combining **Sales payments** and **Return/Refund refund transactions** into one chronological list — **excluding the "Recent Activity" panel shown in the reference image**, per the client's explicit instruction.

**Data sourcing (derived, not a manually-entered new sheet):**
- Each **Sales** record with payment info contributes one row: a `PAY-####` entry (auto-generated, sequential, distinct from the invoice's `FIC-####` number).
- Each **completed** Return/Refund transaction contributes one row: a `REF-####` entry, styled distinctly (per the mockup: red-tinted ID and a red "Refunded" status badge), with Payment Method shown as `Refund ({mode})`.

**Two new fields needed to support this view — add them to Sales (and mirror on Return/Refund where relevant):**
- **Received By**: who actually received/recorded the payment. Default it to the admin who marked the payment as Paid, but make it admin-selectable/overridable — in practice, the person handling cash isn't always the person who later data-enters it, so this shouldn't be silently locked to whoever clicked the button.
- **Remarks**: optional free-text notes on that specific payment (e.g., "collected in two rounds," "customer paid via family member's account") — shown in the detail panel, not the main table.

**Table columns** (main list): Payment ID, Invoice No. (linked through to the Sales record), Customer, Order Date, Order Amount, Payment Method, Transaction ID (may show `—` per A1's optional change), Payment Date, Payment Status, and an Action column with a view/detail icon.

**Filters/controls above the table**, matching the reference image: an "All Payments" status filter (All / Paid / Refunded / Pending), a date-range picker, a Payment Method filter, a search box (invoice number or customer name — reuse the fast search infrastructure from `part7_of_implementation_ficcado.md`, Section B2, since this list can grow just as large as Sales itself), a Filter action, and an Export action (reuse the existing PDF/report generation pattern from Part 8, Section B7.1 rather than building a new export pipeline — CSV is an acceptable alternative if simpler, but don't build a third, unrelated export mechanism).

**Detail panel** (opens on the Action icon click): Payment ID, Invoice No. (linked), Customer (linked), Order Date, Order Amount; a **Payment Information** block (Payment Method, Transaction ID, Payment Date, Payment Status, Received By, Remarks); and a **Payment History** mini-table (Date, Amount, Method, Transaction ID, plus a Total Received sum) — for a typical single-payment order this shows one row, but build the structure to hold more than one row without assuming every order only ever has exactly one payment event, since that keeps this reusable if partial/installment payments are ever added later (not required now — just don't hard-code "always exactly one row").

**Summary widgets below the table** (per the reference image, **omitting Recent Activity**):
- **Payment Summary**: a donut chart of order counts by status (Paid / Refunded / Pending), with counts and percentages.
- **Payment Method Summary**: a bar breakdown of total ₹ amount and percentage share per payment method (UPI, Bank Transfer, Cash, etc.).
- Both computed live from the same underlying Sales/Return-Refund data for whatever filter/date-range is currently applied — not a separately maintained figure.

**Performance**: this view aggregates and lists potentially as many rows as Sales itself — apply the same pagination, search-indexing, and caching approach already specified in `part7_of_implementation_ficcado.md` rather than a naive full-scan render.

---

## Phase Checklist

### Phase 84 — Transaction ID Optional
- [ ] A1: Remove Transaction ID from the Sales payment form's required validation (still hidden for Cash, optional for UPI/Card); remove it from the Return/Refund Close Ticket gate (Part 4/Part 5) while leaving every other check in that gate unchanged; confirm blank Transaction ID displays as `—` consistently across invoices, emails, logs, and the new Payment Transactions view.

### Phase 85 — Vendor Contact Info Split
- [ ] A2: Replace Vendor Management's combined Contact Details field with a repeatable Contact Number(s) field ("Add another number") and a dedicated single Email ID field; update the create/edit form and list/detail views accordingly.

### Phase 86 — Product-Level Profitability Breakdown (Formalize)
- [ ] B0: Confirm/complete the per-item breakdown (quantity sold, revenue, COGS, profit/margin) for the selected period, sourced from Sales and Items' Cost Price data.

### Phase 87 — Payment Transactions Table
- [ ] B1: Build the toggle between Product-Level Profitability Breakdown and Payment Transactions.
- [ ] B2: Add `Received By` and `Remarks` fields to Sales payment info; build the derived Payment Transactions ledger (Sales payments + completed Return/Refund transactions as `PAY-####`/`REF-####` rows); build the filter bar, search, and Export action.

### Phase 88 — Payment Detail Panel & Summary Widgets
- [ ] Build the detail side panel (Payment Information block + Payment History mini-table).
- [ ] Build the Payment Summary donut and Payment Method Summary bar widgets, computed live from the currently filtered data.
- [ ] Confirm the Recent Activity panel from the reference image was **not** built, per the client's explicit exclusion.

### Phase 89 — Audit
- [ ] Manually verify a Sales record can be saved with UPI/Card selected and Transaction ID left blank, and that a Return/Refund ticket can close without a Transaction ID (other gate checks still enforced).
- [ ] Manually verify a vendor can have two or more contact numbers saved alongside one email.
- [ ] Manually verify the Payment Transactions view against a small real dataset: correct `PAY-`/`REF-` rows, correct filter/search behavior, correct detail panel contents, and correct Payment Summary/Payment Method Summary figures.
- [ ] Confirm the toggle between the two Profitability tables works cleanly with no leftover state bleeding from one view into the other.
- [ ] Update `AGENT_PROGRESS.md` with a "PART 9 COMPLETE" entry.

---

## Definition of Done

- Transaction ID is never a required field anywhere in the application, while still being correctly hidden for Cash payments specifically.
- A vendor can hold multiple contact numbers and exactly one email, both clearly presented in the UI.
- The Profitability section offers a working toggle between Product-Level Profitability Breakdown and Payment Transactions.
- The Payment Transactions view accurately merges Sales payments and completed refunds into one ledger, with working filters, search, export, a detail panel, and the two summary widgets — and no Recent Activity panel.
- Every figure in the Payment Summary and Payment Method Summary widgets is computed live from real data for the current filter/date range, never hardcoded or stale.