# Ficcado Inventory & Sales Management — Part 2 Implementation Prompt
### (New Requirements & Updates — for the Antigravity Agent)

> **This document is additive, not a restart.** It builds directly on top of `Ficcado-Inventory-Sales-Management-Spec.md`, `Ficcado-Inventory-Sales-Management-Implementation-Spec.md` (Phases 0–8a), and `DESIGN.md`. Do not redo completed phases. Everything below refines and extends the Warehouse, Inventory, Sales, Replacement, and Return/Refund modules — including linking Warehouse handlers to real admin accounts and making sales/restocks handler-aware — and introduces two new modules: **Damaged Products Management** and **Inventory History Tracker**. Treat this as **Phase 9 onward**, continuing directly from where Phase 8a left off.

---

## 0. Context & How This Fits

The original build already gave every module basic CRUD. This phase adds the **real operational logic** that was missing: stock-aware dropdowns instead of free selection, quantity constraints that prevent overselling/overallocating, a proper replace/refund workflow that moves an order between sheets and back, delivery tracking, and a disposition path for items that come back damaged.

**All rules from the original Implementation Spec still apply without exception**, most importantly:
- No hardcoded sheet names/IDs/tabs — the two new sheets, **Damaged Products** (`damaged_products`) and **Inventory History Tracker** (`inventory_history`), must each be registered as a module key in the Sheet Configuration layer (spec Section 15) exactly like every other module, resolved through the same `getModuleSheet(moduleKey)` SDK — never a direct reference.
- Every Created/Updated By/At field is the acting admin, auto-filled.
- Every loading state uses the shared `<LoadingGecko />` component (DESIGN.md Section 2). Every new form/validation/error path uses the shared validation layer and error-messaging component (Implementation Spec Phase 8a) — do not build ad-hoc spinners or generic error text for any of the new screens below.
- Keep the looping/self-verification discipline from the original document: work through the phase checklist below in order, re-verify each phase against this document before moving to the next, and update `AGENT_PROGRESS.md` after each phase.

---

## 1. New / Updated Data Schemas

### 1.1 Inventory Management Sheet — updated
- Rename the quantity unit label everywhere in the UI from **"units"** to **"piece(s)"** (e.g., "20 piece(s)", "1 piece"). This is a display/label change only — do not rename the underlying field/column key, only the human-facing text.
- Confirm the **Current Status** column (In Stock / Out of Stock) is present and admin-editable (it already exists in the base schema — this phase makes it a required, first-class part of the Add/Update forms rather than an afterthought).

### 1.2 Sales Management Sheet — two new columns
| New Field | Notes |
|---|---|
| Delivery Status | Enum: `Packed & Ready for Shipment`, `In Transit`, `Order Delivered Successfully`, `Order Missing`, `Order Failed to Deliver & Returning Back`. Defaults to `Packed & Ready for Shipment` on sale creation. |
| Delivery Charge | Toggle (default **off** = "Free Delivery"). When on, a numeric amount field appears and is required. Store both the toggle state and the amount (0/blank when off). |

Also add an internal (not necessarily customer-facing) **Fulfilment/Request Status** flag distinguishing a normal sale from one currently under Replace-Requested or Refund-Requested lock (see Section 2.3 below) — this is what drives the "disabled and dimmed" UI state.

Add one more field, **Fulfilment Source**: the handler (admin) this sale's stock was drawn from, or `Take from Inventory` if drawn directly from unassigned main stock (see Section 2.3.1). This determines whether a linked Warehouse deduction happens alongside the Inventory deduction.

### 1.3 Replacement Management Sheet — status enum updated
Replace the old two-state status with the full progression:
`Replacement Approved` → `Replacement Dispatched` → `Replacement Received` → `Satisfied / Completed Order`

Also add fields to capture:
- The specific old item(s)/size(s) selected for replacement (may be a subset of the original order, not necessarily all items).
- The specific new item(s)/size(s) chosen to replace them.
- Disposition of the old item(s): `Returned to Inventory` or `Sent to Damaged Products`.
- **Restock Destination** (only when disposition is `Returned to Inventory`): the handler (admin) whose warehouse receives the returned stock, or `Inventory Only` if it isn't assigned to a specific handler. Mirrors Fulfilment Source on the Sales sheet (Section 1.2) — see Section 2.4, step 6.

### 1.3a Return/Refund Management Sheet — disposition fields added
The base spec's Return/Refund Management sheet (functional spec Section 3.6) gains the same item-disposition capability Replacement now has:
- Disposition of the returned item(s): `Returned to Inventory` or `Sent to Damaged Products`.
- **Restock Destination** (only when disposition is `Returned to Inventory`): handler (admin) or `Inventory Only`, identical pattern to Section 1.3 above.

See Section 2.6 for the behavior this drives.

### 1.4a Warehouse Management Sheet — Handler field now tied to Admin identity
The **Handler Name** field is no longer free text. It is now a required selection from the **Admin Information sheet** — every handler is a registered admin. This is what makes "choose a handler at sale time" (Section 2.3.1) and "choose a restock destination" (Sections 1.3, 1.3a) meaningful: both dropdowns are populated from the same live admin list, so a handler chosen during a sale or restock always maps back to an actual Warehouse Management record (location + that admin's held stock).

### 1.5 New Sheet: Inventory History Tracker
Every transaction that changes an item+size's quantity anywhere in the system — Inventory total, or a specific handler's Warehouse-held quantity — writes a row here. This is the audit trail that answers "what was deducted and what was added, and why."

| Field | Notes |
|---|---|
| S.No | |
| Item Name | |
| Size | |
| Quantity Change | Signed number, e.g. `-2` or `+5` |
| Affected Sheet | `Inventory` or `Warehouse` (a single sale/replacement/refund action may write **two** rows if it touches both — see Section 2.7) |
| Handler (if Warehouse) | Blank when Affected Sheet is `Inventory` |
| Transaction Type | `Sale Deduction`, `Replacement — Old Item Restock`, `Replacement — New Item Deduction`, `Refund Restock`, `Warehouse Allocation`, `Warehouse Deallocation`, `Damaged Disposal`, `Manual Adjustment` |
| Related Invoice Number | Blank for pure Warehouse-allocation entries unrelated to a sale |
| Resulting Balance | The item+size's total (Inventory) or handler's held quantity (Warehouse) *after* this change — makes the sheet self-verifying without recomputation |
| Created At / Created By | Admin who triggered the action, auto-filled |
| Notes | Optional free text |

Register this as module key `inventory_history` in Sheet Configuration (spec Section 15), added to the Setup Wizard's Step 2 module list alongside `damaged_products`.

### 1.4 New Sheet: Damaged Products Management
| Field | Notes |
|---|---|
| S.No | |
| Invoice Number | Links back to the originating sale/replacement |
| Item Name | |
| Size | |
| Quantity | |
| Customer Name | Carried over from the original sale |
| Reason/Notes | Optional free text (e.g., condition description) |
| Created At / Created By | Admin who logged the damaged item, auto-filled |
| Updated At / Updated By | Auto-filled |

Register this as module key `damaged_products` in Sheet Configuration (spec Section 15), with the same "paste existing ID" / "Create for me" options in the Setup Wizard's Step 2 (Implementation Spec Phase 0) — add it to that step's module list retroactively if Phase 0 is already built.

---

## 2. Behavioral Requirements

### 2.1 Warehouse Management — Inventory-Aware Creation, Admin-Linked Handlers
- Create/Update/Delete/Read all present (Delete was previously implied but confirm it's actually implemented — this phase treats it as required).
- **On create:** Location (required) and **Handler** — now a required dropdown of registered admins (Section 1.4a), not free text — plus item selection. Replace the old "select from Items Management" dropdown with a **multi-select of items+sizes drawn from the Inventory Management sheet** (not the Items sheet) — since Inventory is what actually tracks live stock counts per size.
- For each item+size selected, the admin enters the **quantity to allocate to this handler/location**. This quantity field must be **capped by what's actually still available**:
  - Available = that item+size's `Total Quantity Available` in Inventory, **minus** the sum of quantities already allocated to it across all *existing* Warehouse Management entries (across all handlers).
  - Example from the spec: if Eternity Black size M has 20 pieces in Inventory and no prior warehouse entries have claimed any of it, a new entry can request up to 20. If a previous entry already allocated 8, the next entry can request at most 12.
  - Enforce this as a **hard validation**, not a soft warning — the form must reject (with a specific message: "Only 12 piece(s) of Eternity Black, size M remain unallocated") an attempt to exceed the remaining balance, not just flag it after saving.
- This makes the existing Inventory↔Warehouse reconciliation check from the original spec (Section 6) a **live constraint at entry time**, in addition to the periodic mismatch-detection view already planned — build both; they serve different purposes (prevention vs. audit).
- Every allocation and deallocation writes a row to the **Inventory History Tracker** (Section 1.5, Section 2.7).

### 2.2 Inventory Management — Add/Update Overhaul
- **Add:** item name field becomes a dropdown sourced live from the Items Management sheet (no free typing) — pick the item, then choose its size, then enter the total quantity for that item+size, and set Current Status.
- **Update:** open an existing Inventory row and allow editing item name (re-select from the same dropdown), size, total quantity, and Current Status — all fields visible together in one clear edit view, not split across separate partial forms.
- Apply the "piece(s)" label change (Section 1.1) throughout both Add and Update screens.

### 2.3 Sales Management — Replace/Refund Request Flow
- **Edit** on a Sales record gains two new actions: **Replace Requested** and **Refund Requested**, alongside normal field edits.
- Selecting either shows a confirmation dialog explaining what will happen (wording should follow `DESIGN.md`'s plain, direct voice — no vague language): e.g., *"This sale will be moved to the Replacement section. You'll make further updates there. Continue?"* (mirror the equivalent wording for Refund, pointing at the Return/Refund Management sheet from the original spec, Section 3.6 — the txt only detailed the Replace path in depth, but the same pattern applies: confirm → create a linked record in the Return/Refund Management sheet → lock the sale).
- On confirmation:
  - A new record is created in the corresponding sheet (Replacement Management for "Replace Requested," Return/Refund Management for "Refund Requested"), pre-filled with the order's existing details (per the "reduce admin effort" principle from the base spec, Section 2.2) rather than asked for again.
  - The originating Sales record becomes **locked**: its Edit control is disabled and the row is visually dimmed in any list/table view.
  - If an admin still clicks Edit on a locked record, show a message directing them to the Replacement or Return section instead — do not silently do nothing.
- **This lock must be released automatically** once the linked Replacement record reaches `Satisfied / Completed Order` status (Section 2.4) — at that point the Sales record becomes visible/editable again, its **Delivery Status** is set to `Order Delivered Successfully`, and normal editing resumes.
- **Delivery Charge toggle:** default off (labeled "Free Delivery" when off). Switching it on reveals a required numeric amount field. Store both states as described in Section 1.2.

#### 2.3.1 Handler-Aware Fulfilment at Sale Creation
- **Item selection when creating a new sale** now comes from the **Inventory Management sheet** (item + size + live available quantity), not the Items Management sheet — Inventory is the real stock source of truth.
- Alongside item selection, the admin picks a **Fulfilment Source** from a dropdown listing every registered admin plus a **`Take from Inventory`** option:
  - **`Take from Inventory` selected:** the sale deducts only from the main Inventory total for that item+size. No Warehouse record is touched — this represents stock that isn't currently assigned to any specific handler.
  - **A specific admin/handler selected:** the sale deducts from **both** the main Inventory total **and** that handler's held quantity for that item+size in the Warehouse Management sheet. Validate that the chosen handler actually holds enough of that item+size before allowing the sale to save — reject with a specific message if not (e.g., "Arjun's Cochin warehouse only holds 3 piece(s) of Eternity Black, size M").
- Either path writes the corresponding row(s) to the **Inventory History Tracker** (Section 1.5): always one `Sale Deduction` row against Inventory, plus a second `Sale Deduction` row against the Warehouse-held handler if one was selected.
- This is the mechanism that keeps "the item stays at main inventory if no handler holds it" unambiguous — an item is either sitting in unassigned main stock (`Take from Inventory` is valid, no handler deduction) or it's physically with a specific handler (must be selected explicitly, and validated against what that handler actually holds).

### 2.4 Replacement Management — Full Edit Workflow
When an admin opens a Replacement record for editing:
1. **Show the full order history** for that invoice — all original sale details, not just the replacement fields, so the admin has complete context in one view.
2. **Select old item(s) to replace** via checkboxes/tick-selection — this may be a subset of everything originally purchased, not necessarily the whole order.
3. **Select new item(s)** to replace them with, sourced **only from items currently available in Inventory** (same live-availability dropdown pattern as Sections 2.1/2.3).
4. **Confirmation screen**: show old item(s)/size(s) side-by-side with new item(s)/size(s) before committing — this is a deliberate double-check step, don't skip it or fold it into step 3's form.
5. On confirm, set status to `Replacement Approved` and persist the old→new item mapping (Section 1.3 fields).
6. **Disposition prompt for the old item(s):** ask the admin whether to (a) return them to Inventory or (b) send them to **Damaged Products Management** (writes a new row there per Section 1.4, capturing invoice number, item, size, quantity, customer name, and audit fields). This prompt is mandatory before the edit can be finalized — do not allow skipping it.
   - **If (a) Returned to Inventory is chosen:** also ask for a **Restock Destination** (Section 1.3) — either `Inventory Only`, or a specific admin/handler whose Warehouse-held quantity for that item+size should increase alongside the main Inventory total. This mirrors the Fulfilment Source choice at sale time (Section 2.3.1): stock either goes back to unassigned main inventory, or back into a specific handler's warehouse.
   - Every restock writes a row (or two, if a handler was chosen) to the **Inventory History Tracker**: `Replacement — Old Item Restock` against Inventory, and the same type against Warehouse if a handler destination was chosen.
7. New item(s) chosen in step 3 should reduce the main Inventory quantity by the replacement count (mirroring the sale-creation deduction in Section 2.3.1), writing a `Replacement — New Item Deduction` row to the Inventory History Tracker. Restrict this deduction to the main Inventory total only — Section 2.3.1's handler-aware sourcing is specific to the sale-creation flow and isn't required here unless a future phase asks for it.
8. **Status progression**: the record then moves through `Replacement Dispatched` → `Replacement Received` → `Satisfied / Completed Order` via further edits (simple status updates, not the full step 1–6 flow again). Reaching `Satisfied / Completed Order` triggers the Sales-record unlock described in Section 2.3.

### 2.5 Damaged Products Management — New Module
- Standard full CRUD screen, same pattern as every other module (table view, add/edit/delete, audit fields auto-filled).
- Rows are primarily created **indirectly** via the Replacement disposition step (Section 2.4, step 6) or the Refund disposition step (Section 2.6), but admins should also be able to add/edit/delete entries directly here if needed (e.g., correcting a record, or logging a damaged item that didn't come through either flow).

### 2.6 Return/Refund Management — Disposition Added
Refund records gain the same disposition step Replacement has (Section 2.4, step 6), applied when a refund is finalized:
- Ask the admin whether the returned item(s) should be (a) **Returned to Inventory** — with the same Restock Destination choice (`Inventory Only` or a specific handler) as Section 2.4 — or (b) **Sent to Damaged Products Management**.
- Both paths write the appropriate row(s) to the Inventory History Tracker (`Refund Restock` type), exactly mirroring Section 2.4's pattern.
- This makes the disposition step consistent across every path an item can leave a completed sale through — Replacement and Refund both end the same way for the physical item.

### 2.7 Inventory History Tracker — Write Rules
Every action anywhere in the app that changes an item+size's quantity (in Inventory or in a specific handler's Warehouse-held stock) must write a corresponding Inventory History Tracker row **as part of the same transaction/save operation** — never as an afterthought or a separate manual step. Concretely, this includes:
- Sale creation (Section 2.3.1) — 1 or 2 rows depending on Fulfilment Source.
- Warehouse allocation/deallocation (Section 2.1) — 1 row per allocation change.
- Replacement old-item restock (Section 2.4, step 6) — 1 or 2 rows depending on Restock Destination.
- Replacement new-item deduction (Section 2.4, step 7) — 1 row.
- Refund restock (Section 2.6) — 1 or 2 rows depending on Restock Destination.
- Damaged disposal, whether reached via Replacement, Refund, or a direct manual entry in Damaged Products Management (Section 2.5) — 1 row, `Damaged Disposal` type.
Each row must include a **Resulting Balance** (Section 1.5) computed at write time, so the sheet is self-verifying — an admin should be able to read down the tracker for one item+size and see its running balance without doing their own math.

### 2.8 Enhanced Activity Log
The base spec's activity notification feed (functional spec Section 7.2) must produce **specific, transaction-aware entries** for every sale, replacement, refund, and damaged-product action — not generic "record updated" lines. Each entry should read like the example already established in the base spec, extended with the detail these new flows make possible:
- Sale created: *"Rohith created sale FIC-215 — 2 piece(s) of Eternity Black (size M), fulfilled from Arjun's warehouse."*
- Replace requested: *"Priya marked sale FIC-215 as Replace Requested — moved to Replacement Management."*
- Replacement confirmed: *"Rohith confirmed a replacement on FIC-215: Eternity Black (M) → Camera Blue (L), old item sent to Damaged Products."*
- Status progression: *"Priya updated replacement FIC-215 to Replacement Dispatched."*
- Refund disposition: *"Rohith processed refund FIC-220 — item restocked to Arjun's warehouse."*
- Damaged product logged: *"Priya logged 1 piece of Eternity Black (M) as damaged from invoice FIC-215."*
Build this by having each of the write actions above (Sections 2.3–2.7) push a fully-formed, human-readable log line at the moment of the action — pulling the specific item/quantity/handler/invoice details already in hand, rather than trying to reconstruct a readable sentence later from generic field-diff data.

---

## 3. Phase Checklist (Part 2)

Work in order; verify each phase fully before moving to the next, per the looping discipline from the original Implementation Spec.

### Phase 9 — Schema & Sheet Configuration Updates
- [ ] Add the new Sales columns (Delivery Status, Delivery Charge toggle + amount, internal Fulfilment/Request Status flag, Fulfilment Source) — Section 1.2.
- [ ] Update the Replacement Management schema with the new status enum, old/new item + disposition fields, and Restock Destination — Section 1.3.
- [ ] Add disposition + Restock Destination fields to the Return/Refund Management schema — Section 1.3a.
- [ ] Change the Warehouse Management Handler field from free text to a required dropdown sourced from the Admin Information sheet — Section 1.4a.
- [ ] Create the Damaged Products Management sheet and register it as module key `damaged_products` in Sheet Configuration — Section 1.4. Add it to the Setup Wizard's Step 2 module list.
- [ ] Create the Inventory History Tracker sheet and register it as module key `inventory_history` in Sheet Configuration — Section 1.5. Add it to the Setup Wizard's Step 2 module list.
- [ ] Update the "units" → "piece(s)" label everywhere in Inventory-related UI copy — Section 1.1.

### Phase 10 — Inventory-Aware, Admin-Linked Warehouse Creation
- [ ] Rebuild the Warehouse creation multi-select to pull from Inventory (item + size + live remaining balance), not Items — Section 2.1.
- [ ] Switch the Handler field to the admin dropdown (Section 1.4a) and confirm every existing Warehouse read/write path uses it consistently.
- [ ] Implement the running-allocation calculation (Inventory total minus sum of existing Warehouse allocations for that item+size) and enforce it as a hard validation with a specific error message.
- [ ] Confirm full CRUD (including Delete) works on Warehouse records, and that allocation/deallocation writes Inventory History Tracker rows (Section 2.7).

### Phase 11 — Inventory Add/Update Overhaul
- [ ] Rebuild Inventory Add to use an Items-sourced dropdown instead of free text — Section 2.2.
- [ ] Rebuild Inventory Update to show and allow editing item name, size, total quantity, and Current Status together in one view.

### Phase 12 — Sales: Handler-Aware Fulfilment, Replace/Refund Request Flow, Delivery Fields
- [ ] Add "Replace Requested" and "Refund Requested" actions to Sales Edit, each with a confirmation dialog per Section 2.3.
- [ ] Implement the lock/dim/disabled-edit state on a Sales record once it's moved to Replacement or Return/Refund, including the redirect message if Edit is still clicked.
- [ ] Build the Fulfilment Source dropdown (admins + `Take from Inventory`) at sale creation, and implement the dual Inventory + Warehouse deduction logic with handler-stock validation — Section 2.3.1.
- [ ] Add the Delivery Charge toggle + conditional amount field, defaulting to "Free Delivery."
- [ ] Add the Delivery Status column/field with its five states, defaulting appropriately on creation.
- [ ] Confirm sale creation writes the correct Inventory History Tracker row(s) — Section 2.7.

### Phase 13 — Replacement Management Full Workflow
- [ ] Build the full-order-history view inside the Replacement edit screen — Section 2.4, step 1.
- [ ] Build old-item(s) tick-selection and new-item(s) Inventory-sourced selection — steps 2–3.
- [ ] Build the old-vs-new confirmation screen — step 4.
- [ ] Implement status set to `Replacement Approved` on confirm, persisting the item mapping — step 5.
- [ ] Implement the mandatory disposition prompt (Inventory/handler restock vs. Damaged Products) and its downstream effects on Inventory/Warehouse quantities and the Damaged Products sheet — step 6.
- [ ] Implement the Inventory decrement for the newly-assigned replacement item(s) — step 7.
- [ ] Implement simple status-only edits for the remaining progression (Dispatched → Received → Satisfied/Completed), and the Sales-record unlock + Delivery Status update that fires on reaching Satisfied/Completed — step 8.
- [ ] Confirm every quantity-changing step writes its Inventory History Tracker row(s) — Section 2.7.

### Phase 14 — Damaged Products Module
- [ ] Build standard full-CRUD screens for Damaged Products Management — Section 2.5.
- [ ] Confirm rows created via the Replacement disposition flow (Section 2.4) and the Refund disposition flow (Section 2.6) both appear correctly and match the schema exactly.

### Phase 15 — Refund Disposition
- [ ] Add the disposition step (Inventory/handler restock vs. Damaged Products) to the Return/Refund Management edit flow, mirroring Replacement — Section 2.6.
- [ ] Confirm restock and damaged-disposal paths both write correct Inventory History Tracker rows.

### Phase 16 — Enhanced Activity Log
- [ ] Update the activity-log writer so every sale, replacement, refund, and damaged-product action produces a specific, human-readable entry per the examples in Section 2.8 — pulling item/quantity/handler/invoice details at the moment of the action, not reconstructed later.
- [ ] Confirm the notification feed UI displays these longer, detail-rich entries cleanly (per `DESIGN.md`'s layout guidance for the notification feed).

### Phase 17 — Cross-Module Consistency & Final Audit (Part 2)
- [ ] Trace at least one full lifecycle manually: create a sale with a handler-sourced Fulfilment Source (decrementing both Inventory and that handler's Warehouse stock) → request a replacement → confirm old/new items (further Inventory/Warehouse changes both directions, including a handler-targeted restock) → choose a disposition for the old item → progress status to Satisfied/Completed → confirm the Sales record unlocks with the correct Delivery Status. Every Inventory History Tracker row generated along the way must reconcile against the actual Inventory and Warehouse totals — no quantity should be silently lost or duplicated.
- [ ] Repeat a shorter trace for the Refund path (Section 2.6) to confirm its disposition and restock logic reconcile the same way.
- [ ] Re-run the anti-hallucination and spec-conformance audits from the base Implementation Spec's Phase 8, extended to cover every new field/sheet/flow introduced in this document, including the two new module keys (`damaged_products`, `inventory_history`).
- [ ] Confirm every new screen uses the shared `<LoadingGecko />` component, the shared validation layer, and the shared error-messaging component (base spec Phase 8a) — no exceptions for "just the new stuff."
- [ ] Update `AGENT_PROGRESS.md` with a "PART 2 COMPLETE" entry once all of the above is verified, not just implemented.

---

## 4. Definition of Done (Part 2 addendum)

Part 2 is complete only when, in addition to the base Implementation Spec's Definition of Done:
- Warehouse allocation can never exceed a given item+size's real remaining Inventory balance — verified by attempting an over-allocation and confirming it's rejected with a specific message.
- A sale's items can never be selected from a source that doesn't reflect live stock (Inventory, not Items).
- A sale fulfilled from a specific handler can never deduct more than that handler actually holds — verified by attempting to over-draw a handler's Warehouse stock and confirming it's rejected with a specific message.
- Every quantity-changing action (sale, warehouse allocation/deallocation, replacement restock/deduction, refund restock, damaged disposal) produces a matching Inventory History Tracker row with a correct Resulting Balance — verified by tracing the full lifecycle in Phase 17.
- The Sales ↔ Replacement/Refund lock-and-release cycle works end-to-end, including the Delivery Status update on completion.
- The Damaged Products sheet correctly accumulates entries from both the Replacement and Refund disposition flows, and supports full manual CRUD independently.
- The Activity Log produces specific, transaction-aware entries (per Section 2.8's examples) for sale, replacement, refund, and damaged-product actions — not generic "record updated" text.
- No new hardcoded sheet reference exists anywhere for the `damaged_products` or `inventory_history` modules — both resolve through the same Sheet Configuration SDK as every other module.