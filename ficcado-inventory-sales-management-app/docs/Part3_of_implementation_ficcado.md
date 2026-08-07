# Ficcado Inventory & Sales Management — Part 3 Implementation Prompt
### (New Client Requirements — for the Antigravity Agent)

> **Additive, not a restart.** Builds on `Ficcado-Inventory-Sales-Management-Spec.md`, `Ficcado-Inventory-Sales-Management-Implementation-Spec.md` (Phases 0–8a), `part2_of_implementation_ficcado.md` (Phases 9–17), and `DESIGN.md`. Treat this as **Phase 18 onward**. All standing rules still apply without exception: zero hardcoded sheet references, every module resolved through the Sheet Config SDK, every audit field auto-filled, every loading state using `<LoadingGecko />`, every form/error using the shared validation and error components.

---

## 0. What's New in Part 3

1. **Invoice generation (download)** and **Gmail order-confirmation email** — two new buttons directly on each row of the Sales list.
2. A new **Customer Information Management** sheet, decoupled from Sales, so customer email/history can be tracked without changing the existing Sales schema.
3. **Phone-number lookup + autofill** when creating a sale, backed by that new sheet.
4. An **"Online" admin presence indicator** in the sidebar.
5. A **revised, shorter onboarding flow** using a developer-managed bootstrap sheet instead of an in-app "create a spreadsheet for me" step (see the discussion above — this replaces part of Phase 0).

---

## 1. New / Updated Data Schemas

### 1.1 New Sheet: Customer Information Management
| Field | Notes |
|---|---|
| S.No | |
| Customer Name | |
| Phone Number | Primary lookup key (Section 3.2) |
| Address | |
| Email ID | Optional |
| Total Orders Placed | Running count, incremented on each new sale for this customer |
| Invoice Numbers | Comma-separated list of every invoice tied to this customer |
| Created At / Created By | Admin who logged the *first* sale for this customer, auto-filled |
| Updated At / Updated By | Auto-filled on every subsequent sale that touches this customer |

Register as module key `customer_info` in Sheet Configuration (spec Section 15).

**The Sales Management sheet itself is unchanged** — do not add customer email or history fields there. Every sale still writes its usual row; the app additionally (in the same save operation) either creates a new Customer Information row (first-time phone number) or updates the existing one (append the new invoice number, increment order count, refresh Updated At/By) — see Section 2.3.

### 1.2 Sales Management Sheet — one addition
Add an optional **Discount** field (amount or percentage — pick one consistent representation) captured at sale creation, so the invoice (Section 2.1) can show it when present. Leave blank/zero when no discount applies.

### 1.3 Admin Presence Tracking
No new sheet needed for this — extend the `AppMeta` tab (already used for the setup-completion flag, Implementation Spec Phase 0) with a lightweight presence record per admin: `AdminId`, `LastActiveAt`. See Section 2.5 for how it's written and read.

### 1.4 Developer Control Config Sheet (Onboarding Revision)
A separate spreadsheet, **`developer-control-config-fic`**, created and shared with the service account manually by the developer (exactly like the original `SheetConfig` bootstrap sheet from Part 1) — see Section 2.6 for the full revised flow. This sheet holds only the Superadmin's claim data; it is never one of Ficcado's own operational/client-facing sheets.

---

## 2. Behavioral Requirements

### 2.1 Invoice Generation (Download Button)
- On the Sales list, each row gets a **Download Invoice** button (alongside the existing row actions).
- Clicking it generates a PDF invoice for that specific sale, containing at minimum: customer name, phone number, address, each ordered item with size/quantity/price, the discount if one was applied (Section 1.2), and the final total (including delivery charge, per the base spec's Delivery Charge field).
- **Template note:** no reference design has been supplied yet. Build the invoice using `DESIGN.md`'s palette, wordmark, and typography as the default layout (clean header with the Ficcado gecko mark, itemized table, totals block) so this isn't blocked — swap in the real template once it's provided, without changing the underlying data-population logic.
- Store the generated PDF (or the template used to generate it) under the project's `assets/invoice/` folder as instructed, and keep the generation logic itself in a reusable server-side function — the same function must be reused by the email-attachment flow (Section 2.2), never duplicated.

### 2.2 Gmail Order-Confirmation Email
- Each Sales row also gets a **Send Gmail Confirmation** button.
- Requires the sale to have a customer email on file (via Customer Information Management, Section 1.1/2.3) — if none exists, disable the button and show a specific message (e.g., "No email on file for this customer — add one via phone lookup or edit the customer record") rather than silently failing or sending to nobody.
- Compose and send an email: a clear subject line referencing the order/invoice number, a warm plain-language body that names the customer and thanks them for the purchase (match `DESIGN.md`'s direct-but-warm voice — this is one of the few customer-facing moments in the app, so it should read personally, not like a system notice), and the same invoice PDF from Section 2.1 attached.
- Send via the existing Gmail SMTP configuration already set up in Phase 0/Setup Wizard (`ficcado@gmail.com` + app password) — reuse that mail utility, don't build a second one.
- Show success/failure feedback using the shared error-messaging component (base spec Phase 8a) — e.g., a specific message if the send fails (invalid address, SMTP error), not a generic failure state.

### 2.3 Customer Information Capture on Sale Creation
- When a sale is saved, in the **same transaction**: look up the entered phone number in Customer Information Management.
  - **No match:** create a new row (name, phone, address, email if given, Total Orders Placed = 1, Invoice Numbers = this invoice).
  - **Match found:** update that row — append the new invoice number to the comma-separated list, increment Total Orders Placed, refresh Updated At/By. Do not create a duplicate row.
- This keeps the Sales sheet's structure completely untouched while still building a proper customer history.

### 2.4 Phone-Number Lookup & Autofill at Sale Creation
- On the sale-creation page's customer details section, show a note near the phone number field: *"Enter phone number to look up an existing customer."*
- As the admin types/enters a phone number, look it up against Customer Information Management. If a match exists, surface it (e.g., a small dropdown/suggestion showing the customer's name and phone number).
- Selecting the suggestion **autofills** the rest of the customer details section (name, address, and email if on file) — the admin can still edit any autofilled field before saving.
- Also add the **Email ID (optional)** field to the customer details section itself, per the client's request — this is what feeds Section 2.2's confirmation email and Section 1.1's Customer Information sheet.

### 2.5 "Online" Admin Presence Indicator
- In the sidebar, directly under the Ficcado brand name/mark, add a small **Online** indicator (icon + label).
- **Heartbeat:** while an admin has the app open and is logged in, the client periodically (e.g., every 60 seconds — don't go tighter than that, to avoid hammering the Sheets API per the base spec's performance strategy) writes its own `LastActiveAt` timestamp to the `AppMeta` presence record (Section 1.3).
- **Clicking the indicator** fetches all admins' presence records and shows whichever ones have a `LastActiveAt` within a defined freshness window (e.g., the last 3 minutes) as currently online — with name and, if available, a small avatar/initial per the existing Admin Profile data.
- This is a polling-based approximation of "online," not a true real-time socket connection (consistent with the app's serverless, no-persistent-backend architecture) — the freshness window should be tuned so it feels responsive without over-polling.

### 2.6 Revised Onboarding Flow (replaces part of Implementation Spec Phase 0)

**Decision:** use the developer-managed bootstrap sheet approach (Plan B) rather than an in-app "create a spreadsheet for me" step, for the reasons discussed above (service accounts have no personal Drive storage without a Google Workspace + Shared Drive setup, so true one-click creation would require adding a Google OAuth sign-in flow — out of scope for this phase; revisit later if Ficcado adopts Workspace).

**Updated flow:**
1. The developer manually creates one spreadsheet, `developer-control-config-fic`, and shares it with the service account as Editor (same process as the original `SheetConfig` bootstrap sheet from Part 1's setup guide). Its ID is supplied as the `SHEET_CONFIG_SPREADSHEET_ID` env var, exactly as already specified in the base Implementation Spec — **this env var now points at `developer-control-config-fic` specifically**, not a generically-named sheet.
2. This sheet holds the `AppMeta` tab (setup-completion flag, admin presence records, Superadmin claim data) and the `SheetConfig` tab (module → spreadsheet/tab mapping) — same structure as originally planned, just with a clearer, intentional name reflecting that it's developer-owned infrastructure, separate from any of Ficcado's own operational data.
3. **"Claim This Installation"** works exactly as already specified (Implementation Spec Phase 0) — first visitor sets the Superadmin username/password, hashed and written into this sheet.
4. **Setup Wizard Steps 1–4 continue exactly as already specified** — Step 1 tests the connection to `developer-control-config-fic` (already guaranteed to succeed since the developer pre-shared it), Step 2 still offers "paste existing ID" or "Create for me" per module **but remove or clearly disable the "Create for me" option** for now, since it relies on the same unavailable service-account-storage capability — replace it with "paste an existing Spreadsheet ID + Tab Name" as the only path until/unless a future phase adds the OAuth-based creation flow. Update the Step 2 UI copy accordingly so it doesn't offer a button that will fail.
5. Steps 3 (email config) and 4 (create first admin) are unchanged.

This keeps the onboarding "quick but not too long" as requested — the only difference from the original Part 1 plan is *who* creates the one bootstrap sheet (developer, once, manually) and that per-module sheet creation is "paste an ID you made" rather than a magic button, until OAuth-based creation is worth building.

---

## 3. Phase Checklist (Part 3)

### Phase 18 — Customer Information Management
- [ ] Create and register the `customer_info` sheet/module (Section 1.1).
- [ ] Add the Discount field to Sales creation (Section 1.2).
- [ ] Implement the same-transaction create-or-update logic against Customer Information on every sale save (Section 2.3).

### Phase 19 — Sale Creation: Phone Lookup & Email Field
- [ ] Add the optional Email ID field to the customer details section.
- [ ] Implement phone-number lookup against Customer Information with a suggestion dropdown and autofill on selection (Section 2.4).

### Phase 20 — Invoice Generation
- [ ] Build the reusable server-side invoice-generation function per Section 2.1's field list, using `DESIGN.md` branding as the default layout.
- [ ] Add the Download Invoice button to each Sales row and wire it to that function.
- [ ] Store output/template under `assets/invoice/` as instructed.

### Phase 21 — Gmail Order Confirmation
- [ ] Add the Send Gmail Confirmation button to each Sales row, disabled with a specific message when no customer email is on file.
- [ ] Compose and send the confirmation email (Section 2.2), reusing the existing Gmail SMTP utility and the Phase 20 invoice function for the attachment.
- [ ] Surface send success/failure via the shared error-messaging component.

### Phase 22 — Online Admin Presence
- [ ] Implement the heartbeat write (~60s interval) to the `AppMeta` presence record.
- [ ] Build the sidebar "Online" indicator and its click-to-expand list of currently active admins within the freshness window (Section 2.5).

### Phase 23 — Onboarding Revision
- [ ] Update Setup Wizard Step 2's UI to remove/disable "Create for me" and clarify "paste an existing Spreadsheet ID + Tab Name" as the current path (Section 2.6, step 4).
- [ ] Confirm the bootstrap env var / setup guide language reflects `developer-control-config-fic` as the bootstrap sheet's intended name (documentation-only change if the mechanism is already generic).
- [ ] Re-verify Claim-This-Installation and Steps 1, 3, 4 all still work unchanged against the renamed/re-scoped bootstrap sheet.

### Phase 24 — Cross-Feature Audit (Part 3)
- [ ] Trace one full flow: create a sale for a brand-new phone number (Customer Information row created) → download its invoice → send its Gmail confirmation → create a second sale for the *same* phone number (confirm autofill triggers and the existing Customer Information row updates rather than duplicating).
- [ ] Confirm the Online indicator correctly reflects two admins logged in simultaneously (manually test with two sessions) and correctly drops an admin after the freshness window elapses.
- [ ] Re-run the anti-hallucination and spec-conformance audits from the base Implementation Spec's Phase 8, extended to every new field/sheet/flow in this document.
- [ ] Update `AGENT_PROGRESS.md` with a "PART 3 COMPLETE" entry.

---

## 4. Definition of Done (Part 3 addendum)

- A sale for a new phone number creates exactly one Customer Information row; a sale for a known phone number updates that same row (never a duplicate).
- Every downloaded invoice and every confirmation email reflects the same, single, reused invoice-generation logic — no drift between the two.
- The Send Gmail Confirmation button is never active for a customer with no email on file.
- The Online indicator never shows an admin who hasn't sent a heartbeat within the freshness window.
- The onboarding flow succeeds end-to-end using only the developer-provided `developer-control-config-fic` sheet and the two existing env vars — no in-app spreadsheet-creation step is required or offered for the bootstrap sheet itself.