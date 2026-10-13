# Ficcado Inventory & Sales Management — Part 10 Implementation Prompt
### (Refactors & New Features — for the Antigravity Agent)

> **Additive, not a restart.** Builds on `part2_of_implementation_ficcado.md` (9–17), `part3_of_implementation_ficcado.md` (18–24), `WhatsApp-Feature.md` (25–27), `part4_of_implementation_ficcado.md` (28–34), `part5_of_implementation_ficcado.md` (35–44), `mobile_mode_feature.md` (45–52), `part6_of_implementation_ficcado.md` (53–61, plus Part 6.1), `part7_of_implementation_ficcado.md` (62–67), `part8_of_implementation_ficcado.md` (68–83, including Parts A/B/C), `part9_of_implementation_ficcado.md` (84–89), `Quick_dash_refactor.md` (90–93), and `DESIGN.md`. Treat this as **Phase 97 onward**. The Image Storage Feature (`Image-Storage-Feature.md`) has not been implemented yet and is not a dependency of this document — nothing below relies on it.

---

## Part A: Refactors (Bug Fixes)

### A1. Inventory History Tracker — "Resulting Balance" Shows 0 for Damaged Disposal Entries

**Reported bug** (screenshot attached in the source conversation): every time an old item's disposition is set to "Send to Damaged Products Log" — whether reached via Replacement or via Return/Refund — the corresponding Inventory History Tracker row's **Resulting Balance** shows `0`, every single time, in both flows.

**Root cause is a genuine design gap, not just a coding slip — read before fixing:** per the Inventory History Tracker schema (`part2_of_implementation_ficcado.md`, Section 1.5), Resulting Balance is defined as "the item+size's total (Inventory) or handler's held quantity (Warehouse) *after this change*." But a **Damaged Disposal** transaction, by definition, does **not** touch Inventory or Warehouse at all — the item is explicitly *not* returned to stock, it's logged to Damaged Products instead. There's no real "resulting balance" for Inventory/Warehouse to report, because nothing about Inventory/Warehouse actually changed. The agent's implementation apparently defaulted this to `0` when there was nothing to compute — which is actively **misleading**, since `0` reads as "this item+size's stock is now zero," which isn't true; the real Inventory/Warehouse balance for that item+size is whatever it already was, completely unaffected by this transaction.

**Required fix:**
- For `Damaged Disposal` transaction-type rows specifically, the Resulting Balance field should **not** show `0`. Show a clear, honest label instead — e.g., `N/A — sent to Damaged Products, no Inventory/Warehouse change` — so anyone reading the tracker understands why no number is there, rather than misreading a `0` as a real stock level.
- Apply this fix everywhere `Damaged Disposal` rows are written — both the Replacement disposition path and the Return/Refund disposition path (Part 2, Sections 2.4/2.6; Part 4, Section B2.C) — confirm both write paths are actually going through the same shared logic rather than two separate implementations that happened to both get this wrong independently (worth checking, given how often duplicated logic has been the root cause of bugs like this earlier in the project).
- Every **other** transaction type (Sale Deduction, Warehouse Allocation, Replacement Old-Item Restock, Refund Restock, Replacement New-Item Deduction) should continue showing a real, correct numeric Resulting Balance exactly as already specified — this fix is scoped specifically to the Damaged Disposal case.

### A2. Return/Refund Amount Displays ₹0 in the UI (List View and Profitability) — Frontend Bug

**Reported bug** (screenshots attached): the Returns & Refunds list page's **Amount** column shows `₹0` for every record, even completed ones, and the **Profitability** section's refund figures show `₹0` too. The client confirmed directly by checking the actual Google Sheet: **the real value is correctly stored there** (e.g., the sheet holds the actual refund amount) — this is purely a **frontend display/data-binding bug**, not a data-loss or calculation bug. The value exists; the UI simply isn't reading or rendering it correctly.

**Required fix:**
- Find where the Returns & Refunds list view and the Profitability calculation each read the refund amount, and confirm they're reading the **correct column, by header name** (not a stale positional index or a mistyped field key) — this is the same bug class already fixed once before in `part4_of_implementation_ficcado.md`, Section A2, for Replacement Management; check whether the same category of mistake has resurfaced here independently.
- **Don't stop at fixing just these two spots.** The client explicitly asked that "this mistake is not shown throughout the application" — treat that as a requirement to actively search for the same refund-amount field being read incorrectly anywhere else it's displayed: the Return/Refund detail/management page itself, invoices, Sales Log entries that mention refund amounts, the Dashboard's Pending Return/Refund figures (Part 5, Section A6), and the Payment Transactions view from `part9_of_implementation_ficcado.md` (Section B2), which also surfaces refund records. Confirm every one of these actually shows the real stored amount, not just the two originally reported.
- Add a quick regression check for this specific pattern to the standing `Ficcado-Production-Readiness-Audit-Protocol.md` audit (Section 5's "one shared function" consistency check is the natural home for it) — a bug this specific and this easy to silently reintroduce elsewhere is worth a permanent line item, not just a one-time fix.

---

## Part B: New Features

### B1. Profitability — Combine COGS + Gross Profit, Add "Discounts Provided"

- **Combine into one box**: the currently separate "Cost of Goods Sold (COGS)" and "Gross Profit" cards should be merged into a **single box**, showing both figures together (e.g., stacked or side-by-side within one bordered container) rather than as two separate cards. No calculation changes — this is a layout/grouping change only.
  - For clarity, confirm the formal definition of **Gross Profit** while making this change (it wasn't explicitly defined in `part8_of_implementation_ficcado.md`, only Net Profit was): **Gross Profit = Net Revenue − COGS**, the figure *before* Operational Expenses and Vendor Payments are subtracted. Net Profit (Part 8, Section B7's original formula) remains Gross Profit minus Operational Expenses minus Vendor Payments, as already specified — this addition just names the intermediate step explicitly so both figures are on record.
- **New box: "Discounts Provided"** — shows the total discount amount given across all **completed sales** (Sale Status = `Purchase Satisfied and Order Completed`) in the Sales Management sheet, for the currently selected period. Source this from the `Discount` field already on Sales (Part 8, Section 1.2) — this box is scoped specifically to sale-time discounts, not the separate `New Discount Applied` field from partial returns (Part 4, Section B2.G's Return/Refund schema) — flag this scoping choice for confirmation if a broader "all discounts everywhere" figure turns out to be what's actually wanted later.
- **Apply both changes across all four period views** the Profitability section currently supports: **Today, Last 7 Days, This Month, and Custom Dates** — confirm the new Discounts Provided box and the merged COGS/Gross Profit box both compute correctly and consistently in every one of these four views, not just the default one.

### B2. Search & Filter for Expenses and Vendors

Add the same search-and-filter pattern already established for Inventory (`part9_of_implementation_ficcado.md`, Section B2) to the **Expenses** and **Vendors** sections:
- **Expenses**: a search box (matching against description/admin name) plus a filter dropdown by **Expense Category** (`Vendor Sourcing/Travel`, `Printing`, `Marketing/Promotion`, `Packing`, `Other` — including whatever custom text an admin entered for `Other`, per `part8_of_implementation_ficcado.md`'s clarification).
- **Vendors**: a search box (matching against vendor name) plus a filter dropdown by **Vendor Type** (`Courier Partner`, `Designer`, `Printing`, `Marketing`, `Other` — same custom-text handling).
- Reuse the fast search infrastructure already specified in `part7_of_implementation_ficcado.md`, Section B2, rather than a naive client-side full-list filter — these lists will only grow over time, same reasoning as every other search feature added so far.

---

## Phase Checklist

### Phase 97 — Inventory History Tracker Fix
- [ ] A1: Replace the `0` shown for Damaged Disposal Resulting Balance entries with a clear "N/A — sent to Damaged Products" label; confirm both the Replacement and Return/Refund disposition paths are fixed (ideally via one shared code path, not two independent fixes).

### Phase 98 — Refund Amount Display Fix
- [ ] A2: Fix the Returns & Refunds list view's Amount column and the Profitability section's refund figures to read the correct stored value.
- [ ] Audit every other surface that displays a refund amount (detail page, invoices, Sales Log, Dashboard, Payment Transactions) and confirm each shows the real value.
- [ ] Add this bug pattern as a standing check in `Ficcado-Production-Readiness-Audit-Protocol.md`.

### Phase 99 — Profitability: Combined Box & Discounts Provided
- [ ] B1: Merge the COGS and Gross Profit cards into one box; confirm the Gross Profit definition (Net Revenue − COGS) is correctly applied.
- [ ] Build the new Discounts Provided box, sourced from completed sales' Discount field.
- [ ] Confirm both changes render correctly across Today, Last 7 Days, This Month, and Custom Dates.

### Phase 100 — Expenses & Vendors Search/Filter
- [ ] B2: Add the search box and category/type filter dropdown to both Expenses and Vendors, wired to the Part 7 search infrastructure.

### Phase 101 — Audit
- [ ] Manually reproduce the original A1 bug scenario (send an item to Damaged Products via both Replacement and Return/Refund) and confirm the Inventory History Tracker no longer shows a misleading `0`.
- [ ] Manually reproduce the A2 bug scenario (a completed return with a nonzero refund amount) and confirm the correct amount now shows in every surface listed in Phase 98.
- [ ] Manually verify the Discounts Provided figure against a hand-calculated sum of discounts on a few known completed sales.
- [ ] Manually verify Expenses and Vendors search/filter return correct results quickly against a larger test dataset.
- [ ] Update `AGENT_PROGRESS.md` with a "PART 10 COMPLETE" entry.

---

## Definition of Done

- No Inventory History Tracker entry for a Damaged Disposal transaction ever shows a numeric `0` Resulting Balance — it shows the clear "not applicable" label instead.
- Every surface in the application that displays a Return/Refund amount shows the real, correct value — verified across the list view, detail view, invoices, Sales Log, Dashboard, and Payment Transactions, not just the two originally reported.
- The Profitability section shows one combined COGS/Gross Profit box and a working Discounts Provided box, correct across all four period views.
- Expenses and Vendors both support fast search and category/type filtering, without a full client-side list scan.