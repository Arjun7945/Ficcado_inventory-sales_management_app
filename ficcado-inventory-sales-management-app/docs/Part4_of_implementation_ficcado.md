# Ficcado Inventory & Sales Management — Part 4 Implementation Prompt
### (Refactors & New Features — for the Antigravity Agent)

> **Additive, not a restart.** Builds on `Ficcado-Inventory-Sales-Management-Spec.md`, the base Implementation Spec (Phases 0–8a), `part2_of_implementation_ficcado.md` (Phases 9–17), `part3_of_implementation_ficcado.md` (Phases 18–24), `WhatsApp-Feature.md` (Phases 25–27), and `DESIGN.md`. Treat this as **Phase 28 onward**. All standing rules still apply: zero hardcoded sheet references, every module resolved through the Sheet Config SDK, every audit field auto-filled, shared `<LoadingGecko />` / validation / error components used everywhere, and every quantity-changing action still writes to the Inventory History Tracker (Part 2, Section 2.7).

This document has two parts: **Part A — Refactors** (fixes to existing behavior) and **Part B — New Features** (the Online indicator simplification, and a full overhaul of Return/Refund into its own dedicated page).

---

## Part A: Refactors

### A1. Rename "Refund Requested" → "Return/Refund Requested"
On the Sales view/edit screen, rename the **Refund Requested** button/label to **Return/Refund Requested**. This is a label-only change — the underlying flow (locks the sale, creates a linked record in the Return/Refund Management sheet, per base spec/Part 2) is unchanged, and now matches the sheet's own name for consistency.

### A2. Replacement Sheet — Column-Mapping Audit & Fix
**Bug:** earlier updates inserted new columns into the Sales Management sheet, which shifted column *positions*. Somewhere in the Replacement Management write logic, data is still being written by **positional index** rather than by **column name/header lookup**, so values are landing in the wrong columns after that shift.

**Fix required:**
1. Audit every place in the codebase that reads from or writes to the Replacement Management sheet (and re-check Sales, Return/Refund, Warehouse, and Inventory while at it, in case the same positional-write pattern exists elsewhere — this bug class is easy to have repeated).
2. For each write, confirm the code resolves the target column by **header name**, not by a hardcoded column letter/index (e.g., resolve "Invoice Number" → whichever column currently has that header, rather than assuming it's always column C).
3. Once fixed, manually validate a handful of existing Replacement rows against what they *should* contain (cross-check against the linked Sales record) and correct any rows where data has already landed in the wrong column from before the fix.
4. This is a good moment to add a lightweight safeguard: on each sheet's first read per session, verify the actual header row matches the expected schema (per the functional spec) and warn loudly (shared error-messaging component) if a column has been renamed/reordered/removed unexpectedly, rather than silently writing to a guessed position.

### A3. Sale Update — Total Amount Recalculation Bug
**Bug:** when editing an *existing* sale, adding a delivery charge doesn't update the Total Amount, and removing a discount also doesn't update it — the calculation only appears to run correctly on initial sale *creation*, not on update.

**Fix required:**
- Ensure the Total Amount calculation is a single shared function used identically by both the sale-creation path and the sale-update path — if these are currently two separate code paths (likely root cause), consolidate them into one.
- That shared function must recompute whenever **any** amount-affecting field changes: item selection/quantity, per-item price, discount (Part 2, Section 1.2), and delivery charge (base spec, Section 10/Part 1). Trigger recalculation on every relevant field change in the edit form, not just on initial load.
- Add a test case to your own verification pass for each of the two bugs named explicitly: (1) add a delivery charge to an existing sale with none → Total Amount increases correctly; (2) remove a discount from an existing sale that had one → Total Amount increases back to the pre-discount figure correctly.

---

## Part B: New Features

### B1. Online Indicator — Remove Duration Display
Per Part 3, Section 2.5, the sidebar "Online" indicator's expanded list currently shows (or was heading toward showing) how long each admin has been online / "just now" style relative timestamps. **Remove this entirely.** The feature should only ever show **who** is currently online — a name (and avatar/initial if available) per active admin, nothing about session length or last-active phrasing. Simplify the click-to-expand list accordingly; the underlying heartbeat/freshness-window mechanism (Part 3, Section 2.5) stays the same, only the displayed information changes.

---

### B2. Return & Refund — Full Overhaul

This replaces the simpler Return/Refund disposition step from Part 2 (Section 2.6) with a dedicated, fully-featured page. Everything below is the new, authoritative behavior for this module.

#### B2.A — Dedicated Page (Remove Old Component)
Build Return/Refund editing as its **own routed page** (matching the Replacement Management edit experience, base spec Section 3 / Part 2 Section 2.4), not a modal or inline component. **Delete the old component-based implementation** — don't leave it as unused dead code alongside the new page.

#### B2.B — Partial Returns Must Be Supported
The current implementation apparently only supports returning an entire order. Fix this: an admin must be able to select **specific items and specific quantities** out of a multi-item order to return, leaving the rest of the order intact. Example from the client: an order of Eternity-Black (M) ×2, Maharajas-Black (M) ×1, Camera-White (L) ×2 — customer wants to return only **one** Camera-White (L), keeping Eternity-Black (M) ×2, Maharajas-Black (M) ×1, and Camera-White (L) ×1.

#### B2.C — Item Selection & Per-Item Verification Status
- Show the order's purchased items with **no pre-selected checkboxes** (mirroring the Replacement section's selection pattern, Part 2 Section 2.4 step 2) — the admin actively selects which item(s)/quantities are being returned.
- For each selected item, the admin sets an **Item Verification Status** (extends the base spec's existing field, functional spec Section 3.6, from two values to three):
  - `Good — Accepted for Return`
  - `Damaged — Cannot Accept Return`
  - `Not Received — In Transit` *(item is still in transit back / pending physical check)*
- **Conditional disposition logic:**
  - If status is `Damaged — Cannot Accept Return`: **do not show** the Item Disposition Path step for that item at all — there's nothing to place into Inventory or Damaged Products since the return itself isn't being accepted.
  - For either other status (`Good — Accepted for Return` or `Not Received — In Transit`): **show** the Item Disposition Path step — admin chooses `Returned to Inventory` (with the same Restock Destination choice — `Inventory Only` or a specific handler — as Part 2, Sections 1.3/2.6) or `Sent to Damaged Products`.

#### Refund Mode
- After disposition, the admin selects a **Refund Mode**. If `Cash`, no transaction ID is requested. If anything other than Cash, a **Transaction ID** field becomes required.

#### Close Ticket — Validation Gate
Add a **Close Ticket** button (equivalent in spirit to Replacement's status-completion action). On click, validate **all** of the following before allowing the ticket to close:
1. Every selected returned item has a non-null **Item Verification Status**.
2. **Refund Status** is `Approved` or `Completed` (not left at an earlier/pending state).
3. **Refund Amount** is not zero.
4. **Refund Mode** is not null.
5. If Refund Mode is not `Cash`, a **Transaction ID** is present.

If any check fails, **do not close the ticket** — instead render a clearly labeled "Missing Information" section directly on the same page, listing exactly which of the above are still incomplete, so the admin can fill them in without leaving the page or hunting for what's wrong (use the shared error-messaging component's plain-language style, itemized per missing field — not one generic error).

#### B2.D & B2.E — Full-Order Returns: Refund Amount Sourcing
When the customer is returning **every** item in the order (not a partial return) and at least one item's status is not `Damaged — Cannot Accept Return`:
- Prompt the admin to set the Item Disposition Path (as above).
- **Do not calculate the refund amount by summing individual item prices.** Instead, look up the order's **Total Amount directly from the Sales Management sheet** and use that as the Total Refund Amount. This is deliberate: a per-item price sum would ignore any discount or delivery-charge adjustment already applied to the original sale, and the Sales sheet's Total Amount is the one figure that already accounts for those correctly.
- When all items are selected for return, also **display the original sale's discount/benefit details** (if any were applied) to the admin on this page, so they can see why the refund total is what it is rather than a plain sum of listed item prices.

#### B2.F — Purchased Items Summary Table
At the **top** of the Return/Refund page (before any of the return-selection workflow below it), show a clear table of the order's current purchased items: item name, size, quantity, unit price, plus the order's discount and delivery charge (if either was applied), and the order's Total Amount. The return/refund workflow (item selection, verification status, disposition, refund mode, Close Ticket) follows underneath this summary, not interleaved with it.

#### B2.G — Partial Returns: Save Progress & New Schema Fields
For **partial** returns (not all items), add a **Save Progress** button (matching the Replacement section's equivalent, Part 2 Section 2.4) that writes the current state to the **Return/Refund Management sheet only** — no other sheet (Inventory, Warehouse, Damaged Products, Inventory History Tracker) is touched until **Close Ticket** is clicked and passes validation (Section B2.C above).

**New Return/Refund Management schema fields** (add to the functional spec Section 3.6 / Part 2 Section 1.3a schema):

| New Field | Notes |
|---|---|
| Returned Item(s) | Name(s) of the item(s) selected for return |
| Returned Item Size(s) | Corresponding size(s) |
| Returned Item Quantity(ies) | Corresponding quantity(ies) being returned per item |
| Price Charged (Returned Items) | Per-item price(s), looked up from the Sales Management sheet's item-price data — comma-separated if multiple items |
| New Final Items Selected | The items **remaining** on the order after removing the returned item(s)/quantities |
| New Final Items Sizes | Sizes of the remaining items, comma-separated, same order as above |
| Number of New Final Items | Quantities of each remaining item, comma-separated, same order |
| New Final Items Prices Each | Per-item prices of the remaining items, looked up from the Sales Management sheet, comma-separated, same order |
| New Discount Applied | A discount the admin may additionally apply to the remaining items at this stage (see below) — separate from any discount already on the original sale |
| New Final Items Total Amount | Computed total for the remaining items, incorporating **New Discount Applied** if set |

**Calculation logic** (mirrors the old-item/new-item pattern already built for Replacement, Part 2 Section 2.4, but applied to "what's left of the order" rather than "a swapped-in item"):
- `New Final Items Selected/Sizes/Number/Prices Each` = the original order's item list **minus** whatever was selected as Returned Item(s)/Size(s)/Quantity(ies) — computed automatically, not manually re-entered by the admin.
- Add an **Add Discount** button on the page (next to the New Final Items summary) letting the admin apply a **New Discount Applied** value to the remaining items — since the client may offer a discount on what's kept, independent of any discount on the original sale.
- `New Final Items Total Amount` = sum of the remaining items' prices, with **New Discount Applied** subtracted/applied, computed the same way the base Total Amount calculation works (reuse the shared calculation function fixed in Part A3 — don't write a third variant of this math).
- Saving progress at this stage writes all of the above into the Return/Refund Management row **only** — Sales, Inventory, Warehouse, and Damaged Products remain untouched until Close Ticket succeeds, exactly as B2.G's opening rule states.

---

## Phase Checklist

### Phase 28 — Refactors
- [ ] A1: Rename the Sales section's "Refund Requested" button/label to "Return/Refund Requested."
- [ ] A2: Audit and fix positional-vs-header-name writes across Replacement (and re-check Sales, Return/Refund, Warehouse, Inventory) — correct any already-misplaced data, and add the header-verification safeguard.
- [ ] A3: Consolidate sale create/update Total Amount calculation into one shared function that recomputes on every amount-affecting field change; verify the two named bug cases (add delivery charge, remove discount) explicitly.

### Phase 29 — Online Indicator Simplification
- [ ] B1: Remove all duration/"just now"/last-active phrasing from the Online indicator's expanded list; show only names/avatars of currently online admins.

### Phase 30 — Return & Refund Page Foundation
- [ ] B2.A: Build the dedicated Return/Refund page; delete the old component implementation entirely.
- [ ] B2.F: Build the purchased-items summary table at the top of the page.

### Phase 31 — Return & Refund Selection, Verification, Disposition
- [ ] B2.B: Implement partial-item, partial-quantity selection (not all-or-nothing).
- [ ] B2.C: Implement unchecked-by-default item selection, the three-value Item Verification Status, and the conditional Item Disposition Path logic (skip when Damaged — Cannot Accept Return; show otherwise, reusing the Inventory/handler restock-destination pattern from Part 2).
- [ ] Implement Refund Mode selection with conditional Transaction ID requirement.

### Phase 32 — Close Ticket & Full-Order Refund Logic
- [ ] Implement the Close Ticket validation gate (all five checks from B2.C) and the inline "Missing Information" section for failures.
- [ ] B2.D/B2.E: Implement full-order-return refund-amount sourcing from the Sales sheet's Total Amount (not summed item prices), and the discount/benefit display when all items are selected.

### Phase 33 — Partial Returns: Save Progress & New Schema
- [ ] Add the new Return/Refund Management schema fields from B2.G.
- [ ] Implement the Save Progress button (partial returns only) that writes only to Return/Refund Management.
- [ ] Implement the automatic "remaining items" computation (New Final Items fields) and the Add Discount button + New Discount Applied → New Final Items Total Amount calculation, reusing the shared amount-calculation function from Phase 28/A3.

### Phase 34 — Audit
- [ ] Trace a partial return end-to-end: select one item from a multi-item order → set its verification status → (if applicable) set disposition → Save Progress → confirm only the Return/Refund sheet changed → later Close Ticket → confirm validation gate behaves correctly for both a complete and an incomplete case → confirm Inventory/Warehouse/Damaged Products only update at Close Ticket, not at Save Progress.
- [ ] Trace a full-order return end-to-end: confirm the refund amount matches the Sales sheet's Total Amount exactly, including a case where the original sale had a discount applied.
- [ ] Re-verify the two Part A3 bug-fix cases (delivery charge added on update, discount removed on update) produce correct Total Amount every time, across several sample edits.
- [ ] Spot-check several existing Replacement Management rows post-A2-fix to confirm no lingering misplaced data remains.
- [ ] Update `AGENT_PROGRESS.md` with a "PART 4 COMPLETE" entry.

---

## Definition of Done (Part 4 addendum)

- The Sales section shows "Return/Refund Requested," not "Refund Requested," everywhere the label appears.
- No Replacement (or other module) write uses a positional column index anywhere in the codebase — all resolved by header name.
- Editing an existing sale's delivery charge or discount always produces a correct, immediately-visible Total Amount.
- A partial return can be saved via Save Progress without touching any sheet other than Return/Refund Management.
- Close Ticket never succeeds while any of the five validation conditions is unmet, and always tells the admin specifically what's missing on the same page.
- A full-order return's refund amount always equals the Sales sheet's Total Amount, never a recomputed sum of item prices.
- The New Final Items fields are always computed automatically from "original order minus returned items," never manually re-entered.
- The Online indicator shows no duration or relative-time text anywhere.