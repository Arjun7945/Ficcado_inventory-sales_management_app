# Ficcado Inventory & Sales Management — Part 6 Implementation Prompt
### (Refactors & New Features — for the Antigravity Agent)

> **Additive, not a restart.** Builds on every prior document — the functional spec, base Implementation Spec (Phases 0–8a), `part2_of_implementation_ficcado.md` (9–17), `part3_of_implementation_ficcado.md` (18–24), `WhatsApp-Feature.md` (25–27), `part4_of_implementation_ficcado.md` (28–34), `part5_of_implementation_ficcado.md` (35–44), `mobile_mode_feature.md` (45–52), and `DESIGN.md`. Treat this as **Phase 53 onward**. All standing rules still apply: shared `<LoadingGecko />`, shared validation/error components, zero hardcoded credentials/sheet references, every field-level change logged per Part 5's rules.

> **Note on Refactor 2 (tab-view design issues):** treat this as a full, self-contained audit — go through every page in the application at tablet width and fix whatever's wrong against `DESIGN.md`, without waiting on specific examples.

---

## Part A: Refactors

### A1. Replacement — Progressive Disclosure Gated by Old-Item Selection
On the Replacement Handling page (Part 2, Section 2.4; referenced screenshots in the Part 5 addendum), **Step 2 (choose new replacement item), Step 3 (new stock dispatch location), and Step 4 (old item disposition / restock destination)** should **not be visible at all** until at least one item is selected in **Step 1 (old items to exchange)**.

- Default state (no old item selected yet): only Step 1 is shown.
- The moment at least one checkbox in Step 1 is checked, Steps 2–4 progressively appear.
- If the admin unchecks all Step 1 items again, Steps 2–4 should hide again (and any values already entered in them should be cleared, so a later re-selection doesn't silently resurrect stale data tied to a different old-item choice).
- Step 5 (delivery charge/discount, optional) and the Status Progression control can remain visible regardless, since they aren't logically dependent on old-item selection the way Steps 2–4 are.
- This is purely a display/sequencing change — none of the underlying validation, calculation, or Sales Log logic from Parts 2, 4, and 5 changes.

### A2. Tablet/Tab-Mode Design Audit — Every Page, No Exceptions
The client has observed that at **tablet viewport widths**, some pages violate `DESIGN.md` (spacing, alignment, palette/typography inconsistencies, broken structure) — this is distinct from the mobile-mode work in `mobile_mode_feature.md`, which targeted phone-width screens; tablet is its own breakpoint with its own layout needs (more room than a phone, less than desktop — often closer to desktop's structure but with tighter margins and different column counts).

**Do this as a complete pass across the whole application — don't sample, don't skip pages assumed to be "probably fine":**
1. Define (or confirm, if already defined) the app's tablet breakpoint range explicitly in the shared design tokens/CSS, distinct from both the mobile and desktop breakpoints.
2. Go through **every single page in the application** at that tablet width and check against `DESIGN.md`: correct spacing/padding, correct type scale, correct color usage, no overlapping or cut-off elements, no misaligned grids/columns, no leftover desktop-only assumptions (e.g., fixed pixel widths that don't reflow) or leftover mobile-only assumptions bleeding into tablet.
3. Fix every violation found — this includes every module's Create/Read/Update/List screens, the Dashboard, Setup Wizard, Admin Control Centre (including Sheet Configuration, Email Configuration from Part 6 Section B1, WhatsApp Configuration), Sales Log, Inventory History, Keep Notes, and My Profile. Nothing is out of scope for this pass.
4. Log which pages needed fixes and exactly what was wrong with each in `AGENT_PROGRESS.md`, so there's a clear record of what was found and corrected.

### A3. Confirm Every Page Is Properly Structured in Tab View
Closely related to A2 — once the audit/fix pass is done, do a **final confirmation sweep** specifically checking that **no page was missed**: walk the full site map (every page across Parts 1–6 and the mobile-mode doc's in-scope sections, viewed at tablet width) and confirm each one individually against `DESIGN.md`, one page at a time, rather than assuming the pass in A2 caught everything. If anything is still misaligned or misplaced after A2, fix it here before moving on — this phase isn't done until every page has been individually confirmed correct.

---

## Part B: New Features

### B1. Self-Service Email Configuration Update (Admin Control Centre)
Currently, the Gmail sender address and app password are only ever set once, during onboarding (Implementation Spec Phase 0, Setup Wizard Step 3). Add an **Update Email Configuration** feature so any admin can change these at any time from the Admin Control Centre — not just during initial setup.

**Requirements:**
- Show the current sender email address (not the app password itself — never display a stored secret back to the UI, only confirm one is on file).
- An **Update** action opens a form to enter a **new email address** and **new app password**.
- Before saving, show a clear warning: *"Updating this will permanently delete the current app password. You'll need to generate a new one for the new email address if you haven't already."* — require an explicit confirmation (not just a passive notice) before the old password is overwritten.
- **Include in-app, step-by-step guidance** for generating a Gmail app password, since this isn't something every admin will know how to do. Reuse the same guidance already written for the developer in `Ficcado-Google-Sheets-Credentials-Setup-Guide.md` (Part D), adapted for an in-app audience rather than a setup document:
  1. Sign in to the Gmail account you want to send from.
  2. Go to your Google Account's Security settings and turn on 2-Step Verification if it isn't already on (a phone number is needed to confirm this step).
  3. Once 2-Step Verification is on, go to the App Passwords page (search "App Passwords" in your Google Account settings).
  4. Create a new app password and give it a recognizable name (e.g., "Ficcado App").
  5. Google will show a **16-character password**, shown only once — copy it immediately, since it can't be viewed again later (only regenerated as a new one).
  6. Paste that 16-character password into the app password field here, along with the email address it belongs to.
- Include this guidance directly in the update form (e.g., an expandable "How do I get an app password?" section) — don't just link out to an external document with no explanation in-app.
- On save, test the new credentials (a lightweight send or connection check) before fully committing the change, and surface a specific error via the shared error-messaging component if the test fails (e.g., "Couldn't connect with these credentials — double check the app password was copied correctly").
- Log this action appropriately in the Sales Log/Activity Log conventions already established — e.g., "Admin {name} updated the email sending configuration" (don't log the password itself, obviously — only the fact that it changed and who changed it).

### B2. Add More Items to an Existing Sale
Currently, once a sale is created, its item list is fixed — there's no way to add additional items if a customer wants to expand their purchase after the fact. Add this capability to the Sales edit/view screen.

**Requirements:**
- In the **Purchased Items** section of the Sales view/edit screen, add an **"Add Item"** button positioned at the **top-right** of that section.
- Clicking it opens a new section **above** Purchased Items, titled **"Add more items to sale"**.
- This new section reuses the **same Items & Quantities Selection component** already built for sale creation (Part 2, Section 2.3.1 / the create-sale flow referenced in `mobile_mode_feature.md` Section 2.3) — don't build a second, separate item-picker implementation.
- **Logic:**
  - The existing items already on the sale (item, size, quantity, price per piece, total per line) remain completely untouched.
  - Newly added items get appended as new rows with their own size, quantity, price per piece, and line total.
  - The sale's overall Total Amount recalculates to include the new rows, using the same shared calculation function already fixed in Part 4 (Section A3) — don't introduce a third variant of this math.
  - New items are still sourced the same way as sale creation (Inventory-backed selection with live quantity, Fulfilment Source handler/Take-from-Inventory choice, and the corresponding Inventory/Warehouse deduction and Inventory History Tracker entries — Part 2, Section 2.3.1) — adding items to an existing sale must reduce stock exactly like creating a new sale does, not skip that step.
  - This action should produce its own Sales Log entry (Part 5, Section 3.A conventions) — e.g., an addition to the existing **Sale Updated** template, explicitly calling out which item(s) were newly added, with size/quantity/price, and where they were sourced from, consistent with Part 5's General Rules for log messages.
- **Follow `DESIGN.md` exactly** for this new section's visual treatment — palette, typography, spacing — so it reads as a natural extension of the existing Sales page rather than a bolted-on component.

---

## Part 6.1: Additional Refactors & New Features

### C1 (New Feature) — Two-State Order Confirmation Email Templates
Currently, the Gmail order-confirmation email (Part 3, Section 2.2) always uses the same wording — including "is being prepared for shipment" even for orders that are already fully paid and delivered, which reads wrong. Replace the single fixed message with **two templates**, selected dynamically based on the sale's state **at the moment the "Send Gmail Confirmation" button is clicked** (not fixed at sale-creation time — an admin may click this button again later in the order's lifecycle, and it should pick the correct template each time):

**Template A — "Before Order Complete"**
Used whenever the order does **not yet** satisfy all of Template B's conditions (see the fallback rule below).
> "Thank you for shopping with Ficcado Clothing! 🎉
> We're happy to let you know that we have successfully received your order {invoice number}, and our team is currently preparing it for shipment. 📦
> We can't wait for you to receive your order and enjoy your new Ficcado pieces! We truly appreciate your support and look forward to serving you again. ❤️
> Want to add more items to your order?
> If you'd like to add any additional products before your order is shipped, simply reply to this email or contact us at +91 94971 44795. We'll be happy to assist you with upgrading your order.
> Thank you once again for choosing Ficcado Clothing. We look forward to having you shop with us again!"

**Template B — "After Order Completed"**
Used **only** when **all three** of the following are true at click time: Sale Status = `Purchase Satisfied and Order Completed`, Delivery Status = `Order Delivered Successfully`, and Payment Status = `Paid`.
> "We're delighted to let you know that your order {invoice number} has been successfully delivered and completed! 🎉
> We hope you've received your order safely and are enjoying your new Ficcado Clothing pieces. ❤️
> We also confirm that your payment has been successfully received. Thank you for choosing Ficcado Clothing and for being a valued part of our journey.
> We'd love to see you shop with us again! ✨ If you enjoyed your purchase, we'd truly appreciate your continued support and look forward to bringing you more exciting styles and collections.
> Thank you once again for shopping with Ficcado Clothing. We hope to serve you again soon!"

**Selection logic (fallback rule — flagged since the client's notes define B's trigger precisely but describe A's trigger more loosely):** treat **Template B's three-condition check as the single source of truth**. If all three are true, send Template B. In **every other case** — including partial/mixed states the client's notes didn't explicitly enumerate (e.g., payment marked Paid but delivery not yet marked delivered) — send Template A. This makes the logic exhaustive with no gap, rather than only matching Template A's literal "both conditions false" wording. Confirm this interpretation is correct before relying on it broadly.

**C — Everything else stays identical between templates.** The subject line pattern, the attached invoice PDF (Part 3, Section 2.1's shared generation function), the Purchased Items details, and any other section of the email besides the message body itself are unchanged — only the narrative text block differs between A and B.

*(Not requested this round, but worth flagging: the WhatsApp confirmation feature currently sends one fixed message too. The same before/after split could apply there later — this document does not implement that now, since it wasn't asked for, but note it as a natural, low-risk follow-up.)*

### D1 (Refactor) — Fulfilment Source Dropdown: Only Real Handlers, Not Every Admin
The "Take From" / Fulfilment Source dropdown at sale creation (Part 2, Section 2.3.1) currently lists **every registered admin**, regardless of whether they actually hold any warehouse stock. Fix this: the dropdown should show **`Main Inventory` (Take from Inventory)** plus **only the admins who currently appear as handlers with at least one non-zero Warehouse Management allocation** — an admin with no warehouse history/stock at all should not appear in this list, since selecting them could never actually be fulfilled.

- Filter criterion: an admin is included if they have at least one Warehouse Management row with a held quantity greater than zero for *any* item+size — not specifically the item being sold in this transaction.
- *(Optional future refinement, not required in this phase: an even tighter version could filter to only handlers holding the exact item+size currently being sold, rather than "holds something, somewhere." Flagging this as a natural next step, not building it now since it wasn't requested.)*
- This is a dropdown-population fix only — the existing validation that checks a chosen handler holds enough of the specific item+size (Part 2, Section 2.3.1) stays exactly as already built.

### D2 (Refactor) — Cash Payment Mode Showing "N/A" on Invoice and Email
**Bug:** when a sale's Payment Status is `Paid` and Mode of Payment is `Cash`, both the generated invoice (Part 3, Section 2.1) and the confirmation email (Part 3, Section 2.2 / the templates above) display the payment mode as **"N/A"** instead of **"Cash"**.

**Root cause to check:** this is very likely a leftover of the Return/Refund page's "hide Transaction ID when mode is Cash" logic (Part 4, Section B2.C) being mistakenly applied to the Sales invoice/email's **Mode of Payment** field itself, rather than only to the Transaction ID field. These are two different things: **Mode of Payment should always display the actual selected value** (`Cash`, `UPI`, or `Card`); it's only the **Transaction ID** that's conditionally omitted, and only when Mode is `Cash`.

**Fix required:**
- Correct both the invoice-generation function and the email-template rendering (Templates A and B above, and the existing Gmail confirmation logic) so Mode of Payment always shows the real value.
- Confirm Transaction ID is still correctly hidden/blank specifically for Cash, and still correctly shown for UPI/Card — don't overcorrect and break that half of the existing behavior while fixing this.

---



### Phase 53 — Replacement Progressive Disclosure
- [ ] A1: Hide Steps 2–4 until at least one old item is selected in Step 1; clear their values if selection is fully undone; confirm Step 5 and Status Progression remain unaffected.

### Phase 54 — Tablet Design Audit
- [ ] A2: Define/confirm the tablet breakpoint; audit **every page in the application** at that width against `DESIGN.md`, with no page skipped or assumed fine; fix every violation found; log findings per page in `AGENT_PROGRESS.md`.
- [ ] A3: Final confirmation sweep across the full site map at tablet width, page by page, fixing anything still wrong before moving on.

### Phase 55 — Self-Service Email Configuration
- [ ] B1: Build the Update Email Configuration screen in Admin Control Centre, including the confirmation warning, in-app app-password guidance, credential test-before-save, and the Sales/Activity Log entry.

### Phase 56 — Add More Items to Existing Sale
- [ ] B2: Add the "Add Item" button and "Add more items to sale" section to the Sales edit screen, reusing the existing Items & Quantities Selection component.
- [ ] Implement the append-only logic for existing rows, recalculation via the shared Part 4 function, and the same Inventory/Warehouse/Inventory-History-Tracker effects as sale creation.
- [ ] Implement the Sales Log entry for this action.
- [ ] Confirm the new section matches `DESIGN.md` exactly.

### Phase 57 — Audit
- [ ] Manually verify A1 by selecting and deselecting old items on a real Replacement record and confirming Steps 2–4 appear/disappear/clear correctly.
- [ ] Manually verify B1 by updating the email configuration end-to-end, including an intentionally-wrong app password to confirm the test-before-save failure path shows a specific error.
- [ ] Manually verify B2 by adding two more items to an existing sale — confirm existing rows are untouched, new rows appear correctly, the total recalculates correctly, Inventory/Warehouse update correctly, and the Sales Log entry accurately lists the newly added items.
- [ ] Spot-check several pages at tablet width post-Phase-54 to confirm the fixes hold, cross-referencing the per-page findings logged in `AGENT_PROGRESS.md`.
- [ ] Update `AGENT_PROGRESS.md` with a "PART 6 COMPLETE" entry.

### Phase 58 — Order Confirmation Email Templates
- [ ] C1: Implement Templates A and B exactly as specified, with the click-time state check and the fallback rule (default to A unless all three of B's conditions are met).
- [ ] Confirm invoice attachment, subject line, and Purchased Items details remain identical between the two templates — only the message body differs.

### Phase 59 — Fulfilment Source Dropdown Fix
- [ ] D1: Filter the sale-creation Fulfilment Source dropdown to `Main Inventory` plus only admins with at least one non-zero Warehouse Management allocation; confirm admins with zero warehouse footprint no longer appear.

### Phase 60 — Cash Payment Mode Display Fix
- [ ] D2: Fix both the invoice and the email templates so Mode of Payment always shows the real selected value; re-verify Transaction ID is still correctly hidden only for Cash.

### Phase 61 — Audit (Part 6.1)
- [ ] Manually test Template A vs. B selection across several sale states, including at least one mixed/edge-case state (e.g., Paid but not yet delivered) to confirm it falls back to Template A correctly.
- [ ] Manually confirm the Fulfilment Source dropdown excludes an admin with no warehouse allocations, and includes one that has stock.
- [ ] Manually confirm a Cash-paid sale's invoice and confirmation email both display "Cash" (not "N/A") while still omitting the Transaction ID.
- [ ] Update `AGENT_PROGRESS.md` with a "PART 6.1 COMPLETE" entry.

---

## Definition of Done (Part 6 addendum)

- Replacement Steps 2–4 are never visible with zero old items selected, and never retain stale values from a previous selection after being hidden and re-shown.
- Every page in the application has been individually checked at the defined tablet breakpoint against `DESIGN.md` and confirmed correct — spacing, alignment, typography, and color all match, with no page skipped and no misplaced elements remaining, per the per-page findings logged in `AGENT_PROGRESS.md`.
- Admins can update the Gmail sending email and app password at any time from Admin Control Centre, with clear guidance, an explicit warning before the old password is destroyed, and a pre-save connection test.
- Adding items to an existing sale never touches the original rows, always recalculates the total via the single shared calculation function, and always applies the same stock-deduction and logging rules as creating a brand-new sale.
- Every confirmation email correctly uses Template B only when Sale Status, Delivery Status, and Payment Status all confirm full completion — every other state uses Template A, with no gap in coverage.
- The Fulfilment Source dropdown at sale creation never lists an admin with zero warehouse stock history.
- Cash-paid sales always show "Cash" as the Mode of Payment on both the invoice and confirmation email, while still correctly omitting the Transaction ID.