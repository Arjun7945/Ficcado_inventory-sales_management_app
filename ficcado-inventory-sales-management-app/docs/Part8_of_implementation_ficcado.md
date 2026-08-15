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

## Phase Checklist

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