# Ficcado Inventory & Sales Management — Part 8 Implementation Prompt
### (Refactor — for the Antigravity Agent)

> **Additive, not a restart.** Builds on every prior document — the functional spec, base Implementation Spec (Phases 0–8a), `part2_of_implementation_ficcado.md` (9–17), `part3_of_implementation_ficcado.md` (18–24), `WhatsApp-Feature.md` (25–27), `part4_of_implementation_ficcado.md` (28–34), `part5_of_implementation_ficcado.md` (35–44), `mobile_mode_feature.md` (45–52), `part6_of_implementation_ficcado.md` (53–61), `part7_of_implementation_ficcado.md` (62–67), and `DESIGN.md`. Treat this as **Phase 68 onward**. All standing rules still apply.

This part contains a single, interconnected refactor to the **Sheet Configuration** section of the Admin Control Centre (base spec, Section 15; Implementation Spec Phase 0's Setup Wizard Step 2).

> **Two rules that apply to every item below, stated once here so they're not missed:**
> 1. **Follow `DESIGN.md` strictly** for every new element in this refactor — the new "Update Spreadsheet ID" section, the three-option prompt, the loading/progress state, the destructive-action confirmation, and the redesigned read-only table. Palette, typography, spacing, and the shared `<LoadingGecko />` component all apply exactly as specified there — no default/unstyled component-library look anywhere in this section.
> 2. **Remove the old implementation completely — no dead code.** The previous per-row Actions column, its edit/add-new-ID form(s), and any handler functions, API routes, or state management written specifically for that old per-module editing flow must be **deleted outright**, not left in the codebase disabled, commented out, or unreferenced "just in case." Search the codebase for anything tied to the old per-row spreadsheet-ID editing behavior and remove it entirely as part of this work — the goal is a clean replacement, not the new flow sitting alongside old, unused boilerplate.

---

## Part A: Sheet Configuration Section Overhaul

### A1. The Core Insight Driving This Change
Every module's tab lives in the **same single spreadsheet** — in practice, the Spreadsheet ID column has always shown the same value on every row of the Sheet Configuration table. Editing it per-module (the current design, with an Actions column per row) doesn't reflect how the app is actually used and creates confusing, redundant edit surfaces. This refactor replaces per-row spreadsheet editing with a **single, global "update the spreadsheet" action**.

### A2. Remove the Actions Column — and Everything Behind It
Remove the per-row **Actions** column (and whatever edit/add-new-ID controls it currently exposes) from the Sheet Configuration table entirely. This means deleting, not just hiding: the old edit form/modal, its validation logic, its API route(s)/handler functions, and any state tied specifically to per-row editing. The table becomes a **read-only reference view**: Module, Display Name, Spreadsheet ID (now always identical across every row, reflecting the single current global value), Tab Name. Tab names remain fixed per module, defined internally by the app — they are not admin-editable row by row anymore, since the whole editing model below operates at the spreadsheet level, not the individual tab level.

### A3. New Section: Update Spreadsheet ID
Add a new section above the table with a single **Spreadsheet ID** input field and an **"Update and Regenerate"** button. This is the only way to change where the app's data lives going forward — one action for the whole app, not one per module.

### A4. What Happens on Click — Tab Existence Check
When the admin enters a new Spreadsheet ID and clicks **Update and Regenerate**:
1. Test connectivity to that spreadsheet using the service account credentials (reuse the same connection-test pattern already built for Setup Wizard Step 1) — if the service account doesn't have access, fail immediately with a specific message (e.g., "Couldn't access that spreadsheet — make sure it's shared with the service account as Editor first") rather than proceeding.
2. Once access is confirmed, check whether the spreadsheet already contains the tabs required by the app. **This check must be driven by the app's current, live module registry — not a hardcoded list** — so it automatically includes every module that exists at the time the check runs (currently items, inventory, warehouse, sales, replacement, return_refund, admin_info, keep_notes, activity_log, damaged_products, inventory_history, customer_info, sales_log, and whatever the most recently added module is — the client refers to this as "the 14th tab"). Deriving the check dynamically means this never needs manual updating again as future phases add more modules.

### A5. Branch 1 — Fresh/Empty Spreadsheet
If **none** of the required tabs exist yet (a genuinely fresh spreadsheet):
- Show a clear in-progress message using the shared `<LoadingGecko />` component: *"Generating all the tabs — please wait until the new spreadsheet's tabs are ready."*
- Automatically create every required tab, each with the correct header row for its module's schema, with Part 5's professional sheet formatting applied (Section C of that document) — not bare headers.
- Once complete, save the new Spreadsheet ID as the app's single global value (Section A6).

### A6. Branch 2 — Spreadsheet Already Has Tabs
If the spreadsheet **already contains some or all of the required tabs** (i.e., not a blank fresh spreadsheet), **do not auto-decide what to do** — prompt the admin with exactly three options:

1. **"Remove all & regenerate"** — delete every existing tab in that spreadsheet, then create fresh required tabs from scratch (same process as the fresh-spreadsheet path in A5), then save the new ID. **This is destructive and irreversible** — before executing it, require the admin to explicitly confirm a second time (e.g., type the word "REMOVE" or a similar deliberate confirmation step, not just a single click) given that this permanently deletes whatever data currently exists in that spreadsheet.
2. **"Don't remove & use it"** — keep every existing tab and its data completely untouched. Simply update the Spreadsheet ID reference to point at this spreadsheet going forward — no tab creation, no data modification of any kind.
3. **"Cancel operation"** — abort entirely, discard the entered ID, and return to the Sheet Configuration screen with nothing changed.

### A7. Propagating the New ID
Once an update completes (via A5, or via either of the first two options in A6), **replace the old Spreadsheet ID everywhere it's referenced** — the Admin Control Centre's Sheet Configuration data itself, and any other place the app stores or caches that ID (per the client's note: "the admin config sheets and other sheets if exist"). Since every module now shares one global ID (Section A1), consider storing it as a **single value the module registry references**, rather than duplicating an identical string across every module row — this avoids the exact redundancy that made per-row editing confusing in the first place.

### A8. Reconciliation With the Onboarding Design (Part 1/Part 3) — Confirm This Holds
Part 3's onboarding revision removed the "Create for me" *spreadsheet* option because Google service accounts can't create brand-new spreadsheet **files** (no personal Drive storage without Workspace/Shared Drives — see `Ficcado-Google-Sheets-Credentials-Setup-Guide.md`). **This feature doesn't run into that limitation**, because it only creates **tabs within a spreadsheet that already exists** and that the admin has already shared with the service account as Editor — creating a new tab inside an already-accessible file doesn't consume separate storage the way creating a new file does. Confirm this distinction holds during implementation (i.e., the tab-creation calls in A5/A6 target the existing spreadsheet's tab-creation API, never an attempt to create a new spreadsheet file) — if it doesn't, that's a real blocker worth surfacing immediately rather than discovering at runtime.

### A9. Logging
This is a high-impact admin action — log it using the existing Activity Log conventions (base spec, Section 7.2): who performed the update, the old and new Spreadsheet IDs, and which path was taken (fresh generation, remove & regenerate, or reuse existing data) — e.g., *"Admin {name} updated the Sheet Configuration spreadsheet from {old ID} to {new ID} using 'Remove all & regenerate.'"* Given how consequential the "Remove all & regenerate" path is, this log entry matters — don't skip it or make it generic.

---

## Part B: Additional Refactors & New Features (Client-Requested)

### B1 (Refactor) — Dashboard Monthly Selector
Extend the Dashboard's existing Overall Sale / Today's Sale dropdown (Part 5, Section A6) with a third option: **Monthly**. When chosen, show a month picker limited to months that actually have data (no picking a future or data-less month). Selecting a month shows that month's scoped figures, using the same metric set already established for the other two views: Revenue (for that month), Total Sales Made, Total Pending Replacements, and Total Pending Return/Refund — all computed for the selected month only, not all-time or today. Reuse the same calculation/aggregation logic already built for Overall/Today, just with a month-bounded date range instead of all-time or today's date.

### B2 (Refactor) — Inventory Search & Filter
Add a **search box** (by item name) and a **filter control** (e.g., by item type, size, or current status — In Stock/Out of Stock) to the Inventory list page. This should reuse the search-index infrastructure already specified in `part7_of_implementation_ficcado.md`, Section B2 (which already names item name as one of the fields that needs fast, non-full-scan search) — this is the first concrete UI surface for that backend work, not a separate implementation. Search and filter should be usable together (e.g., search "eternity" within items filtered to "Out of Stock").

### B3 (Refactor) — Multiple Saved Addresses per Customer
Currently, Customer Information Management (Part 3, Section 1.1) stores a single Address field. Extend this to support **multiple saved addresses per customer** — phone number and email stay single/fixed as before (per the client's explicit instruction), only address becomes a list.
- **Schema change**: replace the single Address field with a repeatable structure — each saved address gets a label (e.g., Home, Work, Other — admin's choice, free text is fine) and the address text itself.
- **At sale creation** (Part 3, Section 2.4's phone-lookup/autofill flow): when an existing customer is found, show their saved addresses as a selectable list rather than a single autofilled field, with an option to add a new address on the spot (which then gets saved back to that customer's record, growing their address list for next time) or edit an existing one.
- This doesn't change the Sales Management sheet's own Address field (base spec, Section 3.4) — that still records which single address was actually used for that specific order, exactly as before; only the *source* the admin picks it from changes, from a fixed single value to a chosen-from-list value.

---

### B4 (New Feature) — Expense Management
Ficcado's three admins each incur business expenses individually (vendor-sourcing trips, printing, marketing/promotion costs, and similar) and want a shared, transparent record of them — every admin should be able to see every other admin's logged expenses, not just their own.

**New sheet: Expense Management** — register as module key `expenses` in Sheet Configuration.

| Field | Notes |
|---|---|
| S.No | |
| Admin Name | Who incurred/logged the expense — auto-filled from the logged-in admin |
| Expense Category | Preset dropdown: `Vendor Sourcing/Travel`, `Printing`, `Marketing/Promotion`, `Packing`, `Other`. **When `Other` is selected, a required "What type of expense is this?" free-text field appears** so the admin names the actual category themselves — this stored custom text becomes the effective category for that entry (shown as-is everywhere the category is displayed, not just "Other"). For every other preset choice, this field stays hidden — same conditional show/hide pattern as the Reason-for-Return field (Part 5, Section B1). |
| Description | Free text — what the expense was for |
| Amount | |
| Date of Expense | May differ from Created At (an admin might log a trip's expense a day or two after the fact) |
| Created At / Created By | Auto-filled |
| Updated At / Updated By | Auto-filled |

- **Read**: every admin can see every other admin's expense entries — this is a shared, transparent log by design, not a private per-admin list.
- **Create**: any admin can log an expense for themselves.
- **Update/Delete**: limited to the admin who created the entry (consistent with the app's general pattern of attributing and controlling records by their creator) — flag this assumption for confirmation, since the client's notes didn't specify whether other admins should be able to edit each other's expense entries.
- This sheet is a direct input to the Profitability feature (B7) — every expense logged here counts toward that period's total expenses.

### B5 (New Feature) — Vendor Management
Ficcado works with multiple vendor types (courier partners, logo/graphic designers, and others) and wants to track who they are, what they're for, and how much has been paid to them over time.

**New sheet: Vendor Management** — register as module key `vendors` in Sheet Configuration.

| Field | Notes |
|---|---|
| S.No | |
| Vendor Name | |
| Vendor Type | Preset dropdown: `Courier Partner`, `Designer`, `Printing`, `Marketing`, `Other`. **When `Other` is selected, a required "What type of vendor is this?" free-text field appears**, exactly matching the Expense Category pattern above — the admin's typed answer becomes the effective vendor type wherever it's displayed. Hidden for every other preset choice. |
| Contact Details | Phone/email, optional |
| Purpose/Use | Free text — what this vendor is engaged for |
| Total Amount Paid | Running total, auto-computed from the payment log below — not manually typed |
| Created At / Created By | |
| Updated At / Updated By | |

Since a vendor relationship is ongoing (payments happen more than once over time), add a **Vendor Payment Log** as a sub-record of each vendor — same pattern as how Customer Information aggregates invoice numbers (Part 3, Section 1.1):

| Field | Notes |
|---|---|
| Vendor (link) | Which vendor this payment belongs to |
| Amount | |
| Date | |
| Note | What this specific payment was for |
| Created At / Created By | |

Each new payment logged updates that vendor's `Total Amount Paid`. Build a Vendor Management page (list + create/edit vendor, plus a detail view showing that vendor's payment history). Like Expense Management, this feeds the Profitability feature (B7) as another category of expense.

### B6 (New Feature) — Customer Announcements & Personalized Emails
Two related email-sending capabilities, both reusing the existing Gmail sending infrastructure (Part 3, Section 2.2; Part 6, Section B1) and the same branded email-template wrapper already used for order confirmations (Part 6.1's Template A/B pattern) — the admin only ever provides **Subject**, **Content**, and an optional **Attachment**; the app wraps that in the existing branded template automatically.

**Announcements (bulk):** admin composes Subject/Content/Attachment once and sends it to **every customer who has an email on file** in Customer Information Management. Show a confirmation step before sending (e.g., "This will send to {N} customers — continue?") given the scale and irreversibility of a bulk send.

**Personalized emails (targeted):** same composition UI, but the admin selects **one or more specific customers** (by name/phone search, reusing the existing customer-lookup pattern from Part 3, Section 2.4) instead of "everyone." Useful for the "message to Sam specifically" case the client described.

Both actions should produce an Activity Log entry (subject line, recipient count or names, sending admin) — reuse the existing Activity Log conventions (Part 1, Section 7.2 / Part 5's detail standard) rather than building a separate logging mechanism.

**Flag this constraint explicitly rather than assuming it away:** `ficcado@gmail.com` is a standard Gmail account, not Google Workspace, and standard Gmail accounts have a real **daily sending limit** (historically around 500 emails/day for regular Gmail; higher for a paid Workspace account) enforced by Google, not by this app. A bulk Announcement to a large customer list could hit that ceiling and fail partway through, or risk the account being flagged for unusual sending volume. Verify Gmail's current sending limits before relying on Announcements at scale, and if Ficcado's customer base grows large enough for this to matter, consider either a Google Workspace upgrade or a dedicated transactional/bulk email service (e.g., SendGrid, Mailgun) as a future revisit — not required for this phase, but worth knowing about now rather than discovering it mid-send to a large list.

### B7 (New Feature) — Profitability Reporting

**A necessary addition not explicitly in the client's notes, flagged clearly:** the client's own example (₹1.5 lakh for 10,000 T-shirts, plus transport and packing) is describing **cost of goods** — what Ficcado paid to acquire stock — which is different from the **selling price** already tracked on the Items Management sheet (functional spec, Section 3.1). There's currently no field capturing what an item actually *cost* Ficcado to acquire. Without this, "profit" can't actually be calculated, only revenue. **Add a `Cost Price` field to Items Management** (per item, alongside the existing selling price) — this is required for B7 to produce a meaningful number, not optional polish. Confirm this addition is correct before building, since it's inferred from the example rather than stated as an explicit schema request.

**Profitability calculation, for a selected period (Monthly is the primary/default view; support a custom date range, including single-day, as a secondary option):**

```
Net Revenue = Sales Revenue in period − Refunded/Returned Amount in period
Cost of Goods Sold (COGS) = Σ (item Cost Price × quantity sold) in period
Total Expenses = COGS + Expense Management entries in period (B4) + Vendor Payment Log entries in period (B5)
Net Profit = Net Revenue − Total Expenses
```

- **Sales Revenue** and **Refunded/Returned Amount** are pulled from the Sales Management and Return/Refund Management sheets respectively (per the client's explicit instruction to source this from "the sales sheet... or returns or replacement sheet," not re-entered manually).
- Build a dedicated **Profitability** page (Admin Control Centre or Dashboard, whichever fits better alongside the existing reporting surfaces from Part 5/Part 1) showing: Net Revenue, COGS, Operational Expenses, Vendor Payments, Total Expenses, Net Profit, and a simple profit margin percentage, for the selected period.
- This aggregates across several large, growing sheets (Sales, Return/Refund, Expenses, Vendor payments) — route this through the pagination/caching/search infrastructure already specified in `part7_of_implementation_ficcado.md` rather than building a naive full-scan report; a monthly report in particular is a good candidate for the short-TTL server-side caching already planned there (Part 7, Section B4), since the same month's figures will be viewed repeatedly without changing every second.

#### B7.1 — Downloadable PDF Report (Daily / Weekly / Monthly)
The Profitability page needs a **Download Report** action producing a PDF, with the admin choosing the period granularity before generating it:
- **Period selector**: `Daily`, `Weekly`, or `Monthly` — each with its own date/period picker (a specific day, a specific week, or a specific month).
  - **Weekly needs one definition confirmed before building**: which day a week starts on (Monday–Sunday vs. Sunday–Saturday) — pick one, state the assumption clearly in `AGENT_PROGRESS.md`, and make it consistent everywhere a "week" is referenced in this feature.
- **PDF contents**: the same figures shown on-screen (Net Revenue, COGS, Operational Expenses, Vendor Payments, Total Expenses, Net Profit, Margin %) for the selected period, **plus an itemized breakdown** — expenses grouped by category with subtotals, and vendor payments listed by vendor with subtotals — so the PDF is genuinely useful for an accountant or tax filing, not just the summary numbers alone.
- **Reuse the existing PDF-generation infrastructure** already built for invoices (Part 3, Section 2.1) — the same underlying function/library approach, styled per `DESIGN.md` (the report should look like it belongs to the same app as the invoice, not a differently-styled document). Do not build a second, separate PDF pipeline.
- **File naming**: something clear and sortable, e.g. `Ficcado-Profitability-Monthly-2026-08.pdf`, `Ficcado-Profitability-Weekly-2026-W33.pdf`, `Ficcado-Profitability-Daily-2026-08-15.pdf`.
- This reuses the exact same underlying calculation from B7's formula for whichever period is selected — a Daily report is simply that same formula with the period bounds set to one day, not a separate calculation path.

**Suggestions worth considering, not required for this phase but flagged as natural extensions once the above exists:**
- Once a month closes, consider letting admins "lock" that month's profitability snapshot so later edits to old records don't silently change a figure that's already been reported/shared/downloaded — otherwise a correction made in March to a February sale would quietly change a PDF that was already handed to an accountant.
- A per-item or per-category profit-margin breakdown (which products are actually most profitable, not just total profit) would build naturally on the same Cost Price data once it exists.
- A simple expense-by-category breakdown chart (visual, not just the itemized PDF list) gives a clearer at-a-glance picture on the screen itself.

---


### Phase 68 — Sheet Configuration Table Redesign
- [ ] A2: Remove the Actions column and delete every piece of the old per-row edit implementation behind it (form/modal, handlers, API routes, related state) — confirm nothing is left disabled or commented out.
- [ ] A3: Build the new "Update Spreadsheet ID" input + "Update and Regenerate" button section, styled per `DESIGN.md`.

### Phase 69 — Connectivity & Tab-Existence Check
- [ ] A4: Implement the connection test and the dynamic, registry-driven required-tabs check (confirm it automatically reflects the current full module list, not a hardcoded count).

### Phase 70 — Fresh Spreadsheet Path
- [ ] A5: Implement automatic tab generation (with correct schemas and Part 5 formatting) for a genuinely empty spreadsheet, with the `<LoadingGecko />` progress messaging.

### Phase 71 — Existing-Tabs Path
- [ ] A6: Implement the three-option prompt; implement each path exactly as specified, including the extra destructive-action confirmation step for "Remove all & regenerate."

### Phase 72 — ID Propagation & Logging
- [ ] A7: Ensure the new Spreadsheet ID replaces the old one everywhere it's referenced, ideally via a single global value rather than per-row duplication.
- [ ] A8: Confirm tab creation never attempts to create a new spreadsheet file — verify against the onboarding design's known service-account storage limitation.
- [ ] A9: Implement the Activity Log entry for this action, covering all three possible paths.

### Phase 73 — Audit
- [ ] Test all three scenarios end-to-end: a genuinely fresh spreadsheet (confirm auto-generation works and the loading message appears), an existing spreadsheet with unrelated tabs (confirm all three prompt options behave exactly as specified, including that "Don't remove & use it" truly leaves existing data untouched), and a cancel (confirm nothing changes).
- [ ] Confirm the required-tabs check correctly reflects every currently-registered module, including the most recently added one.
- [ ] Confirm the Activity Log entry is accurate for each of the three paths.
- [ ] Search the codebase specifically for leftover references to the old per-row editing flow (unused components, dead imports, orphaned API routes, commented-out blocks) and remove anything found.
- [ ] Visually check every new/changed element in this section against `DESIGN.md` — palette, typography, spacing, and the shared `<LoadingGecko />` usage.
- [ ] Update `AGENT_PROGRESS.md` with a "PART 8 COMPLETE" entry.

### Phase 74 — Dashboard Monthly Selector
- [ ] B1: Add the "Monthly" option to the Dashboard's Overall/Today dropdown, with a month picker limited to months that have data, and the same metric set scoped to the selected month.

### Phase 75 — Inventory Search & Filter
- [ ] B2: Add the search box (item name) and filter control to the Inventory list page, wired to the Part 7 search-index infrastructure rather than a client-side full scan.

### Phase 76 — Multiple Customer Addresses
- [ ] B3: Change Customer Information Management's Address field into a repeatable, labeled list; update the sale-creation phone-lookup/autofill flow to show a selectable address list with an "add new address" option.

### Phase 77 — Expense Management
- [ ] B4: Create and register the `expenses` sheet/module; build the shared, transparent list view (all admins see all entries) and the create/edit flow (own entries only, per the flagged assumption).
- [ ] Implement the conditional "What type of expense is this?" free-text field, shown only when Category = `Other`, and confirm the typed value is what actually displays as the category everywhere (list view, Profitability breakdown) — never a bare "Other."

### Phase 78 — Vendor Management
- [ ] B5: Create and register the `vendors` sheet/module and its Vendor Payment Log; build the Vendor Management list/detail page, including the auto-computed Total Amount Paid.
- [ ] Implement the matching conditional "What type of vendor is this?" free-text field for Vendor Type = `Other`, same behavior as the Expense Category version above.

### Phase 79 — Announcements & Personalized Emails
- [ ] B6: Build the shared Subject/Content/Attachment composition UI; implement the bulk Announcement path (all customers with an email) with its pre-send confirmation, and the targeted Personalized email path (specific customer selection); wire both to the existing Gmail infrastructure and branded template wrapper; add the Activity Log entries.
- [ ] Document Gmail's current daily sending limit for the `ficcado@gmail.com` account in `AGENT_PROGRESS.md`, and confirm the bulk Announcement flow handles a partial-send failure gracefully (clear error state, not a silent stop) if that limit is ever hit.

### Phase 80 — Items Cost Price
- [ ] B7 (prerequisite): Add the `Cost Price` field to Items Management; confirm this addition with the client before relying on it for Phase 81.

### Phase 81 — Profitability Reporting
- [ ] B7: Build the Profitability calculation (Net Revenue, COGS, Total Expenses, Net Profit, margin %) sourced from Sales, Return/Refund, Expense Management, and Vendor Payment Log data; build the dedicated Profitability page with Monthly as the default view and a custom date-range option; apply Part 7's caching for repeated period views.
- [ ] B7.1: Build the Daily/Weekly/Monthly period selector and the Download Report PDF action, reusing the existing invoice PDF infrastructure and `DESIGN.md` styling; confirm the week-start-day assumption is documented; confirm the PDF includes the itemized expense/vendor breakdown, not just summary totals.

### Phase 82 — Audit (Part B)
- [ ] Manually verify the Dashboard's Monthly view against a known month's data.
- [ ] Manually verify Inventory search/filter returns correct results quickly against a large simulated dataset.
- [ ] Manually verify a customer can have multiple addresses, and that sale creation correctly offers the saved list plus an "add new" option.
- [ ] Manually verify an expense logged by one admin is visible to another admin, and not editable by a non-creator (per the flagged assumption).
- [ ] Manually verify a vendor's Total Amount Paid updates correctly after logging two separate payments.
- [ ] Manually verify both a bulk Announcement and a targeted Personalized email send correctly and produce accurate Activity Log entries.
- [ ] Manually verify a full Profitability calculation for one real or test month, cross-checking the Net Profit figure by hand against the underlying Sales/Return/Expense/Vendor data.
- [ ] Manually verify the Download Report PDF for all three period types (a single day, a single week, a single month) matches the on-screen figures exactly and includes the itemized breakdown.
- [ ] Manually verify choosing `Other` for both Expense Category and Vendor Type correctly prompts for and displays the admin's custom text everywhere, including inside the downloaded PDF's itemized breakdown.
- [ ] Update `AGENT_PROGRESS.md` with a "PART 8, PART B COMPLETE" entry.

---

## Definition of Done

- The Sheet Configuration table has no per-row Actions column; Spreadsheet ID is managed exclusively through the single global "Update and Regenerate" action.
- The required-tabs check is always driven by the live module registry, never a hardcoded list, so it stays correct as future modules are added.
- A fresh spreadsheet is auto-populated with every required tab, correctly formatted per Part 5.
- An existing spreadsheet with tabs always prompts the admin with exactly the three specified options, never silently choosing a path.
- "Remove all & regenerate" requires a distinct, deliberate confirmation beyond the initial click, given its destructive/irreversible nature.
- "Don't remove & use it" never modifies any existing tab or its data — only the stored Spreadsheet ID reference changes.
- Tab creation in this feature never attempts to create a new spreadsheet file, staying consistent with the service-account storage limitation already established in the onboarding design.
- Every completed update (any of the three paths) produces a specific Activity Log entry.
- Every new or changed element in this section visually matches `DESIGN.md` — no default/unstyled controls.
- No trace of the old per-row editing implementation remains anywhere in the codebase — no dead components, unused handlers, orphaned routes, or commented-out logic.
- The Dashboard's Monthly view always matches a hand-checked figure for a known month.
- Inventory search/filter never requires a full client-side scan, consistent with Part 7's search-performance work.
- A customer can hold multiple saved addresses, with phone and email remaining single/fixed as specified.
- Every admin can see every other admin's logged expenses; only the creating admin can edit or delete their own entries (pending confirmation of that assumption).
- A vendor's Total Amount Paid is always the accurate sum of its payment log, never manually overridden.
- Bulk Announcements and targeted Personalized emails both reuse the same composition UI and branded template wrapper, and both produce accurate Activity Log entries.
- The Profitability report's Net Profit figure is always traceable back to real Sales, Return/Refund, Expense, and Vendor data for the selected period — never a hardcoded or estimated value.
- The Download Report PDF action works for all three period types (Daily, Weekly, Monthly), always matches the same on-screen figures for that period, includes the itemized expense/vendor breakdown, and reuses the existing invoice PDF infrastructure rather than a second pipeline.