# Ficcado Inventory & Sales Management — Part 5 Implementation Prompt
### (Refactors & New Features — for the Antigravity Agent)

> **Additive, not a restart.** Builds on all prior documents: `Ficcado-Inventory-Sales-Management-Spec.md`, the base Implementation Spec (Phases 0–8a), `part2_of_implementation_ficcado.md` (Phases 9–17), `part3_of_implementation_ficcado.md` (Phases 18–24), `WhatsApp-Feature.md` (Phases 25–27), `part4_of_implementation_ficcado.md` (Phases 28–34), and `DESIGN.md`. Treat this as **Phase 35 onward**. All standing rules still apply without exception.

---

## ⚠️ Critical Addition Not Explicitly Stated in the Client's Notes — Read First

Part A2 below requires **deleting** a Sales row once a full-order Return/Refund ticket is closed and paid out. But Part 4 (Section B2.F) displays the order's items/discount/delivery-charge/total by reading them live from the Sales sheet at the time the Return/Refund page is opened. **If the Sales row is deleted, that live lookup breaks for anyone viewing the closed ticket afterward.**

To prevent data loss, this document adds a requirement the client didn't state explicitly but that's necessary given the delete behavior they asked for: **at the moment a Return/Refund request is first created**, snapshot the relevant original-sale details directly into the Return/Refund Management row (not just displayed dynamically) — customer name/phone/address, each item/size/price, discount, delivery charge, original total amount, and the original sale's Created At/By. See Section 1.1 below. Flag this to the client if anything about this assumption seems wrong before building it — but build it by default, since without it, closed full-order tickets would lose their underlying order details permanently.

---

## Part A: Refactors

### A1. Sale Status & Delivery Status — Specific-Item vs. All-Items Returns
The current single generic "return and refund" sale status isn't granular enough. Replace/extend it:

- **Specific item(s) returned** (not the whole order): Sale Status → **`Return/Refund on Specific Item(s)`**, Delivery Status → **`Specific Item(s) Returning`**.
- **All items returned**: Sale Status → **`Return/Refund on all Items`**, Delivery Status → **`All Items Returning Back`**.

This extends the Sales Management status enum (functional spec Section 3.4) and the Delivery Status enum (base Implementation Spec Phase 1 / Part 3), and replaces the generic "Return and Refund" value used until now with these two more specific ones. Apply this status/delivery-status update at the moment a Return/Refund request is created (so it's visible immediately, not only once closed).

### A2. All-Items Returns: Remove From Sales Sheet on Completion
This is a deliberate **exception** to the existing lock/unlock behavior from Part 2 (Section 2.3) and Part 4:

- **Specific-item returns:** keep the existing behavior unchanged — once the ticket closes, the sale unlocks and remains in Sales Management with its updated status/delivery status from A1.
- **All-items returns:** once the Return/Refund ticket is closed **and** refund payment has actually been recorded (see A3's stricter gate), **do not unlock the Sales row — delete it from Sales Management entirely.** The transaction's permanent record now lives solely in Return/Refund Management (with the full snapshot from the section above, so nothing is lost).
- This delete action must itself produce a Sales Log entry (Section 3, "Sale Deleted" template) explaining why the row was removed (linked to the completed Return/Refund ticket).

### A3. Close Ticket — Stricter Gate for All-Items Returns
Part 4 already built a Close Ticket validation gate (five checks). This adds a **targeted reinforcement, only for the all-items case**:

- When **all items** on an order are being returned/refunded and the Return/Refund status is `Approved`, the ticket **cannot close** until refund payment details are actually filled in — Refund Payment Status, Refund Mode, and (if not Cash) Transaction ID must all be present. The transaction must be kept open/alive until the customer has actually been paid back, not just approved for a refund.
- **Specific-item returns keep the existing Part 4 Close Ticket logic unchanged** — this stricter "must have real payment proof before closing" rule applies **only** to all-items returns.
- Once an all-items ticket does close successfully with payment details recorded, perform the Sales-row deletion from A2 as part of that same close action.

### A4. Closed All-Items Ticket — Locked View with Banner
When an admin opens a Return/Refund details page for a ticket that has already been closed as an **all-items** return:
- Lock every input/action on the page (read-only view).
- Show a banner at the top of the page: *"This sale/order transaction is closed due to the customer requesting a full return and refund, and was verified and approved by {name of the admin who closed the transaction}."*
- Store the closing admin's name (`Closed By`) on the Return/Refund row so this banner can be rendered accurately later — add this field if not already present.

### A5. Cash Payment Mode — Confirm Transaction ID Stays Hidden
Re-verify (this was already specified in Part 4, Section B2.C) that whenever Refund Mode is `Cash`, the Transaction ID field does not appear at all — the client has flagged this again, so treat it as a required verification pass, not just an assumption it already works.

### A6. Dashboard — Overall / Today's Sale Toggle
Add a dropdown directly above the existing "Sales Today" box on the Dashboard, with two options: **Overall Sale** and **Today's Sale**.

- **Today's Sale** (can be the default): show **Revenue Today**, **Total Items** (sold today), **Low Stock Alerts**, **Pending Replacements**, and **Pending Return/Refund** — all scoped to the current day.
- **Overall Sale**: show **Total Revenue** (all-time), **Total Sales Made** (count, all-time), **Total Pending Replacements** (all-time open count), and **Total Pending Return/Refund** (all-time open count).
- Rename the existing "Pending Refunds" label to **"Pending Return/Refund"** in both views, consistent with A1's renamed statuses.

---

## Part B: New Features

### B1. Reason for Return/Refund Request
On the Return/Refund page (Part 4, Section B2), directly below the **Original Purchased Items Summary** section, add a new **"Reason for Return / Refund Request"** section, shown when a new request is created:
- A dropdown of preset reasons: `Wrong Size / Fit`, `Damaged or Defective Product`, `Wrong Product Received`, `Product Doesn't Match Description / Photos`, `Not Satisfied with Quality`, `OTHER` — **defaulting to `OTHER`**.
- When `OTHER` is selected, show a required free-text field for the admin to describe the reason.
- When any preset reason other than `OTHER` is selected, hide the free-text field entirely — don't just disable it.
- Persist the selected reason (and free-text detail, if applicable) on the Return/Refund Management row.

### B2. Detailed Return/Refund Activity Log
Extend the existing enhanced Activity Log (Part 2, Section 2.8) so every Return/Refund action produces a **thorough, fully descriptive** entry — length is not a concern here; clarity for other admins reading it later is the goal. Every create, status change, disposition choice, refund detail entry, and close action on a Return/Refund record should read like a small paragraph explaining exactly what happened, not a short generic line. (This works alongside, not instead of, the richer **Sales Log** in Section 3 below — the Activity Log stays the at-a-glance notification feed; the Sales Log is the full detailed transaction record.)

### B3. New Sheet: Sales Log

A dedicated, narrative-style audit sheet — richer and more detailed than the general Activity Log — capturing every **Create, Update, and Delete** operation across **Sales, Replacement, Return/Refund, and Damaged Products**. Register as module key `sales_log` in Sheet Configuration (spec Section 15).

#### 3.A — Schema
| Field | Notes |
|---|---|
| S.No | |
| Module | `Sales` / `Replacement` / `Return/Refund` / `Damaged Products` |
| Operation | `Create` / `Update` / `Delete` |
| Related Invoice Number | |
| Log Message | The full narrative text (see templates below) |
| Created At | When this log row was written |
| Created By | Admin who performed the action |
| Updated At | Present per the client's request — logs are normally append-only/immutable, so this will typically equal Created At; only populate a real change here if a log entry itself is ever corrected, which should be rare and itself worth a note in the message |
| Updated By | Same caveat as above |

#### Log Message Templates — General Rules (apply to every template below)

1. **Every field-level change gets logged, no matter how small.** If an admin changes a single field (e.g., only the discount, or only one item's disposition), that alone must produce a Sales Log entry — don't batch silent changes or wait for a "bigger" action. This applies to every sheet covered by this document (Sales, Replacement, Return/Refund, Damaged Products).
2. **Every message must name the acting admin**, and wherever items are involved, must list **each item with its size, quantity, and price** — never just an item name alone.
3. **Whenever stock moves, the message must say exactly where it moved from or to** — `Main Inventory (Unassigned Main Stock)` or a named handler's warehouse (e.g., `Arjun's warehouse`). This applies to: where new/replacement items were sourced from (Part 2, Section 2.3.1's Fulfilment Source / the Replacement page's "New Stock Dispatch Location" field shown in the reference screenshots), and where old/returned/replaced items were sent back to (the Item Disposition Path's Restock Destination, Part 2 Sections 2.4/2.6, Part 4 Section B2.C). Pull this directly from the data already captured on the record — never omit it, and never write a vaguer message like "item was restocked" without naming the destination.
4. These rules replace/tighten the earlier, looser wording used for the templates below — treat every template here as the authoritative version, superseding any shorter equivalent implied elsewhere in prior documents.

**Sale Created** *(client-specified wording, used as-is):*
> "Admin {admin name} have created a new sale {invoice number}, for customer {customer name}, on items {item names, comma-separated, each with size and price — e.g., Eternity - Black (M) (Rs: 250), Camera Blue (XL) (Rs: 300)}. The items were taken from {Main Inventory or the warehouse handler's name}. Customer was given a discount of Rs: {amount} (0 if no discount applied), and customer was charged Rs: {delivery charge amount} as delivery charge (if 0 or nil: "customer was not charged delivery charge (FREE DELIVERY)"). The final total amount was {total amount after all calculations}. The sale was created at {date and time}."

**Sale Updated:**
> "Admin {admin name} updated sale {invoice number} for customer {customer name}. Changes made: {plain-language list of each changed field with its old → new value — e.g., delivery charge changed from Rs: 0 to Rs: 50; discount changed from Rs: 0 to Rs: 100; quantity of Eternity - Black (M) changed from 2 to 3}. Items on this sale remain: {full current item list, each with size, quantity, and price}, sourced from {Main Inventory or handler name}. The new total amount is Rs: {total amount}. Updated at {date and time}."

**Sale Deleted:**
> "Admin {admin name} deleted sale {invoice number} for customer {customer name} — originally created at {original created at} with items {item list, each with size/qty/price} totaling Rs: {total amount}. {If deletion was triggered by an all-items Return/Refund closure per Section A2: "This sale was removed because its linked Return/Refund ticket was closed and fully refunded."} Deleted at {date and time}."

**Replacement Created:**
> "Admin {admin name} created a replacement request for invoice {invoice number}, customer {customer name}. Old item(s) selected for replacement: {items with size and quantity}. New item(s) chosen: {items with size, quantity, and price}, sourced from {Main Inventory (Unassigned Main Stock) or the named handler's warehouse}. Status set to Replacement Approved. Created at {date and time}."

**Replacement — Progress Saved** *(distinct from the Completed message below — fires every time the Save Progress button is used, per the reference screenshots' "Replacement Handling" page):*
> "Admin {admin name} saved progress on the replacement for invoice {invoice number} (status remains {current status — e.g., Replacement Approved}). {Include only the fields that actually changed in this save, using the same old → new phrasing as Sale Updated — for example: "Old item(s) to exchange selected: {items with size}"; "New replacement item(s) selected: {items with size, quantity, price}, sourced from {Main Inventory / handler name}"; "Item Disposition Path set to {Return to Inventory / Send to Damaged Products}, restock destination {Main Inventory (Unassigned Main Stock) / handler name}"; "Delivery charge updated from Rs: {old} to Rs: {new}"; "Discount updated from Rs: {old} to Rs: {new}".} This save did not complete the replacement — the transaction remains open. Saved at {date and time}."

**Replacement Completed** *(dedicated message, fires only when the "Replacement Completed" button is used):*
> "Admin {admin name} marked the replacement for invoice {invoice number} as completed. Old item(s) {items with size/quantity} were {sent to Main Inventory (Unassigned Main Stock) / sent to {handler name}'s warehouse / sent to Damaged Products}. New item(s) {items with size, quantity, price} were dispatched from {Main Inventory / handler name}. {If delivery charge or discount were set during this process, state the final values: "Final delivery charge: Rs: {amount}"; "Final discount: Rs: {amount}".} The linked sale's status and delivery status were updated accordingly. Completed at {date and time}."

**Replacement Deleted:**
> "Admin {admin name} deleted the replacement record for invoice {invoice number}, originally created at {original created at}, which had old item(s) {items with size} being replaced with {items with size/quantity/price}. Deleted at {date and time}."

**Return/Refund Created:**
> "Admin {admin name} created a Return/Refund request for invoice {invoice number}, customer {customer name}. Reason for return: {selected preset reason, or the custom text if OTHER}. Item(s) requested for return: {items with size and quantity}. Created at {date and time}."

**Return/Refund — Progress Saved** *(mirrors the Replacement Progress Saved template above, for consistency — fires every time Save Progress is used on a partial return, Part 4 Section B2.G):*
> "Admin {admin name} saved progress on the Return/Refund for invoice {invoice number} (status remains {current status}). {Include only the fields that actually changed — e.g., "Item Verification Status for {item, size} set to {status}"; "Item Disposition Path set to {Return to Inventory / Send to Damaged Products}, restock destination {Main Inventory / handler name}"; "Refund Mode set to {mode}"{, "Transaction ID recorded" if not Cash}; "New Discount Applied: Rs: {amount}".} This save did not close the ticket — the transaction remains open. Saved at {date and time}."

**Return/Refund Closed** *(fires only on a successful Close Ticket action):*
> "Admin {admin name} closed the Return/Refund ticket for invoice {invoice number}. {If all items: "All items ({items with size/quantity}) were returned and refunded; this sale has been removed from Sales Management and now exists only in Return/Refund Management."} {If specific items: "Item(s) {items with size/quantity} were returned and refunded — {sent to Main Inventory (Unassigned Main Stock) / sent to {handler name}'s warehouse / sent to Damaged Products}; the remaining order stays active in Sales Management with status 'Return/Refund on Specific Item(s)'."} A refund of Rs: {refund amount} was issued via {refund mode}{, transaction ID {transaction id}, if not Cash}. Closed at {date and time}."

**Return/Refund Deleted:**
> "Admin {admin name} deleted the Return/Refund record for invoice {invoice number}, originally created at {original created at}, concerning item(s) {items with size/quantity}. Deleted at {date and time}."

**Damaged Product Created:**
> "Admin {admin name} logged {quantity} piece(s) of {item name} (size {size}) as damaged, linked to invoice {invoice number} for customer {customer name}. This item arrived via {the Replacement or Return/Refund disposition step that sent it here, or "direct manual entry" if not linked to either}. Notes: {reason/notes, or "None provided"}. Created at {date and time}."

**Damaged Product Updated:**
> "Admin {admin name} updated the damaged product record for {item name} (size {size}), invoice {invoice number}: {plain-language list of each changed field with old → new value}. Updated at {date and time}."

**Damaged Product Deleted:**
> "Admin {admin name} deleted the damaged product record for {item name} (size {size}), invoice {invoice number}, originally logged at {original created at}. Deleted at {date and time}."

#### 3.B — Sales Log Page & Dashboard Widget
- Build a dedicated, routed **Sales Log page** in the app — a searchable/filterable (by module, operation type, date range, invoice number) list of every entry, newest first.
- On the **Dashboard**, add a professionally styled widget showing the **latest 10** Sales Log entries (per `DESIGN.md`'s layout and palette guidance) — a compact feed, not the full detail view, with a link through to the full Sales Log page.

---

## Part C: Massive Cross-Cutting Update — Professional Sheet Formatting (Do This Last)

Every Google Sheets tab the app writes to currently has bare column headers with plain, unformatted values — functional, but not something a client would want to open and look at directly. Build a shared **sheet-formatting utility** and apply it consistently:

- **Header rows:** bold text, a solid background fill using `DESIGN.md`'s brand palette (primary blue background with white text, or the cream/pale-blue combination — pick one consistent treatment and use it everywhere), frozen so it stays visible while scrolling.
- **Fonts:** a clean, legible font consistent with `DESIGN.md`'s typography direction, applied across header and body cells (Google Sheets' font options are more limited than the web app's — pick the closest available match, e.g. a standard sans like Arial or the closest Google Sheets equivalent to the app's UI font).
- **Column widths:** auto-sized or manually tuned so no column is awkwardly cramped or excessively wide relative to its typical content.
- **Number formatting:** currency columns (prices, totals, discounts, delivery charges, refund amounts) formatted as currency (₹), quantity columns as plain integers, date/time columns in a consistent, readable format.
- **Row banding/borders:** light alternating row shading or subtle borders so rows are easy to read across, without being visually noisy.
- **Apply this to every sheet** created across all prior phases: Items, Inventory, Warehouse, Sales, Replacement, Return/Refund, Admin Information, Keep Notes, Activity Log, Damaged Products, Inventory History Tracker, Customer Information Management, and the new Sales Log.
- Implement this as a reusable function (e.g., `applySheetFormatting(spreadsheetId, tabName, schema)`) driven by each module's schema definition, called once when a sheet/tab is first created or re-registered through Sheet Configuration (base spec Section 15) — not a manual one-off per sheet, so it stays consistent as new sheets get added in future phases too.

---

## Phase Checklist

### Phase 35 — Return/Refund Status Refinement
- [ ] A1: Add the two new Sale Status values and two new Delivery Status values; apply them at Return/Refund creation time.

### Phase 36 — All-Items Return Completion Logic
- [ ] Add the snapshot fields to Return/Refund Management (see the Critical Addition section) and populate them at request-creation time.
- [ ] A2: Implement Sales-row deletion on all-items ticket completion, with the corresponding Sales Log "Sale Deleted" entry.
- [ ] A3: Implement the stricter Close Ticket gate for all-items returns (refund payment details required before close), leaving specific-item Close Ticket logic untouched.

### Phase 37 — Closed Ticket Lock & Banner
- [ ] A4: Implement the read-only locked view and banner for closed all-items tickets, including the `Closed By` field.
- [ ] A5: Re-verify Cash mode hides the Transaction ID field.

### Phase 38 — Dashboard Toggle
- [ ] A6: Build the Overall Sale / Today's Sale dropdown and both metric sets, with the "Pending Return/Refund" label rename applied in both.

### Phase 39 — Reason for Return/Refund
- [ ] B1: Add the reason section (preset dropdown + conditional OTHER free-text field) to Return/Refund creation.

### Phase 40 — Return/Refund Activity Log Detail
- [ ] B2: Extend Activity Log entries for every Return/Refund action to be fully descriptive, per Section B2.

### Phase 41 — Sales Log Sheet & Templates
- [ ] B3.A: Create and register the Sales Log sheet/module (`sales_log`).
- [ ] Implement each log-message template (Section 3.A templates, including the distinct **Replacement — Progress Saved** vs. **Replacement Completed** messages, and the equivalent **Return/Refund — Progress Saved** vs. **Return/Refund Closed** split) as its own generator function, wired into the corresponding Create/Update/Delete/Save-Progress/Complete/Close action across Sales, Replacement, Return/Refund, and Damaged Products.
- [ ] Confirm every generator pulls the acting admin, full item list (size/quantity/price), and stock source/destination (Main Inventory vs. named handler) directly from the record's already-captured data — per the General Rules at the top of the templates section — and that this applies to the Replacement Handling page's full field set (old items, new items, dispatch source, disposition + restock destination, delivery charge, discount, status) exactly as shown in the reference screenshots.
- [ ] Confirm **single-field changes** (e.g., only a discount edited, only one item's disposition set) still produce their own Sales Log entry — test this directly, not just multi-field saves.

### Phase 42 — Sales Log Page & Dashboard Widget
- [ ] B3.B: Build the dedicated Sales Log page with filtering/search.
- [ ] Build the Dashboard's latest-10 Sales Log widget.

### Phase 43 — Professional Sheet Formatting (Do Last)
- [ ] Build the shared `applySheetFormatting` utility per Part C.
- [ ] Apply it to every existing sheet across all prior phases, and confirm it's invoked automatically for any newly registered sheet going forward.

### Phase 44 — Audit
- [ ] Trace a full all-items Return/Refund lifecycle: create with a reason → approve → attempt to close without refund payment details (confirm blocked) → add refund details → close → confirm the Sales row is deleted, the Return/Refund snapshot has everything needed to display the closed ticket correctly, the banner/lock appear on revisit, and matching Sales Log + Activity Log entries exist.
- [ ] Trace a specific-item Return/Refund lifecycle and confirm it still unlocks/updates the Sales row as before (A1's new status labels applied), rather than deleting it.
- [ ] Confirm the Dashboard toggle's two metric sets both compute correctly and both show the renamed "Pending Return/Refund" label.
- [ ] Spot-check several sheets after the Phase 43 formatting pass for visual consistency against `DESIGN.md`.
- [ ] Update `AGENT_PROGRESS.md` with a "PART 5 COMPLETE" entry.

---

## Definition of Done (Part 5 addendum)

- Sale Status and Delivery Status always reflect specific-item vs. all-items returns distinctly, never the old generic "return and refund" value.
- An all-items Return/Refund ticket can never close without recorded refund payment details; a specific-item ticket's close behavior is unaffected by this rule.
- Once an all-items ticket closes, its Sales row no longer exists in Sales Management, and the Return/Refund row alone contains everything needed to display that closed transaction correctly (via the snapshot fields).
- Every Create/Update/Delete on Sales, Replacement, Return/Refund, and Damaged Products produces a Sales Log entry matching the required narrative detail — no operation is silently unlogged, and no single-field change is skipped.
- The Replacement page's **Save Progress** and **Replacement Completed** actions always produce their own distinct, correctly-worded log entries — never the same generic message for both. The same distinction holds for Return/Refund's Save Progress vs. Close Ticket.
- Every log message that involves items always lists each item's size, quantity, and price — never a bare item name.
- Every log message involving stock movement always names the specific source or destination (Main Inventory, or a named handler's warehouse) — never a vague "restocked" or "sourced from inventory" without saying which.
- The Reason for Return/Refund section behaves exactly per B1's conditional logic.
- Every sheet in the application is visually formatted per Part C — no bare, unstyled tabs remain.