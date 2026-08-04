# Ficcado Inventory & Sales Management App — Implementation Prompt for Antigravity Agent

> **Read this entire document before writing any code.** This is your complete build plan for the project. Do not skip phases, do not invent features not listed here, and do not stop until every phase's checklist is fully checked off.

---

## 0. Mission Statement

You are building the complete application inside the **existing Next.js project named `ficcado-inventory-sales-management-app`**. The project already exists — do **not** re-initialize it, do **not** create a new project, and do **not** rename it. Work inside it, respecting whatever structure already exists (check `package.json`, folder layout, and existing config before writing anything).

Your source of truth for *what* to build is the companion document **`Ficcado-Inventory-Sales-Management-Spec.md`** (the functional/product specification). This document tells you *how* to execute that spec: in what order, how to verify your own work, and how to keep going without drifting, forgetting, or inventing requirements that were never specified.

**Core facts you must never contradict:**
- Frontend-only architecture: **Next.js on Netlify**. No traditional backend server, no SQL/NoSQL database.
- **Google Sheets is the entire data layer**, accessed via the Google Sheets API.
- **Zero hardcoded sheet names, sheet IDs, or tab references anywhere in application code** — every module resolves its target sheet at runtime through the Sheet Configuration layer (spec Section 15). This is the single most important structural rule in this build. If you ever find yourself typing a literal spreadsheet ID or tab name into a component, service file, or API route (other than the one bootstrap Sheet-Config ID supplied via environment variable), stop and fix it before continuing.
- The number of admins is **not fixed** (currently 3, but must support more being added later) — never hardcode a count, a fixed-length array of admins, or admin-specific conditional logic.
- All "Created By / Updated By / Created At / Updated At" fields are **always the acting admin**, auto-filled by the app — never a manual text field.
- The guiding UX principle is **reducing admin effort**: prefill, auto-generate, default, and use dropdowns wherever possible instead of blank free-text forms.

---

## 1. Anti-Hallucination Rules (apply at all times, every phase)

1. **Do not invent fields, sheets, modules, or business rules that are not in the spec.** If something seems ambiguous, implement the most literal, minimal reading of the spec rather than adding creative extras.
2. **Do not silently skip a requirement because it's hard.** If a requirement (e.g., version-conflict detection, batched multi-sheet fetch) is genuinely difficult, implement the simplest correct version of it rather than omitting it — but never omit it outright.
3. **Before starting each phase below, re-read that phase's checklist out loud (in your own reasoning) and re-confirm you are not missing an item from a previous phase.** Treat each phase's checklist as a hard gate — you may not mark a phase complete until every box is genuinely implemented and verified, not just planned.
4. **Never hardcode a Spreadsheet ID, tab name, or sheet-derived constant directly in a component, hook, API route, or utility function**, except the single bootstrap `SHEET_CONFIG_SPREADSHEET_ID` (and its tab name) which is read from an environment variable and used only to fetch the Sheet Configuration mapping itself.
5. **Never hardcode the number or identity of admins.** All admin-driven UI (dropdowns of admin names, notification recipient lists, "who did this" attribution) must be derived live from the Admin Information Sheet at runtime.
6. **After finishing each phase, run a self-check**: grep your own newly written code for suspicious literals (spreadsheet-id-looking strings, hardcoded emails other than `ficcado@gmail.com` as the sender, hardcoded admin names, hardcoded counts like "3 admins"). If found anywhere outside the designated config layer, fix immediately before moving to the next phase.
7. **Do not fabricate Google API responses, field names, or library APIs you are not certain about.** If uncertain about a specific Google Sheets API or Nodemailer call signature, look it up / verify against the actual installed package rather than guessing plausible-looking code.
8. **Keep a running build log file** at the project root: `AGENT_PROGRESS.md`. After completing each phase, append a dated entry summarizing what was implemented, what was verified, and what remains. Re-read this file at the start of every new work session before continuing, so prior context is never lost.

---

## 2. Looping / Continuation Strategy (how to keep working until truly done)

You must treat this build as a **closed-loop task**, not a single pass:

1. Maintain an internal task list mirroring the **Phase Checklist** in Section 3 below. Do not consider the project finished while any checklist item is unchecked.
2. After completing what you believe is the last item in a phase, **re-verify against this document** — re-open this prompt and the linked spec, and confirm every bullet under that phase is actually satisfied in the codebase (not just assumed). If something is missing, implement it before advancing.
3. If you reach what looks like the end of all phases, perform a **final full-repo audit pass**:
   - Re-read `Ficcado-Inventory-Sales-Management-Spec.md` top to bottom.
   - For every feature/module/field mentioned there, locate the corresponding implementation in the codebase and confirm it exists and behaves as described.
   - Any gap found sends you back into the loop to implement and re-verify — do not stop at "mostly done."
4. Only when the full-repo audit pass produces **zero gaps** should you consider the task complete. Update `AGENT_PROGRESS.md` with a final "BUILD COMPLETE — audited against spec on [date]" entry.
5. If you are ever unsure whether something is complete, **default to continuing the loop** rather than declaring completion prematurely.

---

## 3. Phase Checklist

Work through these phases **in order**. Each phase must be fully implemented and self-verified (per Section 2) before moving to the next.

### Phase 1 — Foundation & Sheet Configuration Layer
- [ ] Confirm existing project structure (`ficcado-inventory-sales-management-app`); do not reinitialize.
- [ ] Set up Google Sheets API auth (service account or OAuth, per whatever credentials are provided) as a server-side utility — credentials must come from environment variables, never hardcoded.
- [ ] Build the **Sheet Configuration** data layer: a service/hook that reads the `SheetConfig` sheet (bootstrapped from an env-var Spreadsheet ID + tab name) and returns a live mapping of `moduleKey → { spreadsheetId, tabName, displayName }`.
- [ ] Build the Admin Control Centre UI page for **viewing and editing** this Sheet Configuration mapping (add/update Spreadsheet ID + Tab Name per module key), including a "test connection" action that does a lightweight read before saving.
- [ ] Build a small internal SDK/wrapper (e.g., `getModuleSheet(moduleKey)`) that **every other module in the app must use** to resolve its target sheet — no direct hardcoded reads anywhere else in the codebase.
- [ ] Implement batched multi-sheet fetch utility (Sheets API batchGet) and a client-side caching layer (e.g., SWR/React Query) used by this SDK.

### Phase 2 — Authentication & Admin Management
- [ ] Implement admin login/logout (session-based), backed by the Admin Information Sheet via the module SDK from Phase 1.
- [ ] Build the **Admin Profile** section (self-service edit of own name/phone/email/notification prefs).
- [ ] Build the **Create New Admin** section inside the Admin Control Centre (appends a new row to Admin Information Sheet with proper audit fields).
- [ ] Ensure every place that lists "admins" (dropdowns, notification targets, report recipients) pulls dynamically from this sheet — write an automated check or manual test adding a 4th/5th test admin and confirming it appears everywhere without code changes.

### Phase 3 — Items, Inventory & Warehouse Modules
- [ ] Items Management: full CRUD screen matching the Items schema (spec Section 3.1), with dropdowns for item type and sizes, auto-filled audit fields.
- [ ] Inventory Management: full CRUD screen matching schema (spec Section 3.2) — remember this is the **aggregated master total**, not per-warehouse data.
- [ ] Warehouse Management Handler: implement the multi-select-items → per-size-quantity sub-form flow exactly as described in spec Section 6 (select warehouse + handler, multi-select items from Items sheet, enter size→quantity breakdown per item).
- [ ] Implement the **Inventory ↔ Warehouse reconciliation check**: a view or background check that sums warehouse-held quantities per item+size and flags any mismatch against the Inventory sheet's total for that item+size.
- [ ] Verify multi-sheet aggregation (Items + Inventory + Warehouse combined view) works via the batched fetch utility from Phase 1.

### Phase 4 — Sales, Replacement, Return/Refund Modules
- [ ] Sales Management: full CRUD matching spec Section 3.4, with prefilled/derived fields where possible (e.g., auto invoice numbering).
- [ ] "Generate Invoice" and "Generate Courier Slip" actions on a sales record (spec Section 10) — produce downloadable documents populated from that record.
- [ ] Replacement Management: full CRUD matching spec Section 3.5, with fields prefilled from the originating Sales record (invoice number, last purchased item/size) rather than manual re-entry.
- [ ] Return/Refund Management: full CRUD matching spec Section 3.6, similarly prefilled from the originating Sales/Replacement record where applicable.
- [ ] Cross-reference view: given an invoice number, show its full lifecycle across Sales → Replacement → Return/Refund in one combined screen (multi-sheet join by invoice number).

### Phase 5 — Versioning, Conflict Prevention & Activity Notifications
- [ ] Add a version marker (timestamp or version number) to every editable record type.
- [ ] Implement the conflict check on save: compare the record's version at load-time vs. current version before committing a write; surface a clear warning if changed by someone else in the meantime (spec Section 7.1).
- [ ] Build the **Activity Log** sheet/writer: every Create/Update/Delete action across every module writes a log entry (admin, action type, module, record identifier, timestamp).
- [ ] Build the **notification icon/feed** UI that surfaces recent activity log entries in the human-readable format specified (e.g., "Rohith updated the Sales Management sheet on invoice number 'FIC-215' on 02/08/2026 at 5:14 PM"), with read/unread state.

### Phase 6 — Keep Notes
- [ ] Implement the Keep Notes sheet + full CRUD.
- [ ] Ensure notes are visible to **all** logged-in admins in real time/on-refresh (public feed, not per-admin private).

### Phase 7 — Reporting & Email
- [ ] Build on-demand report generation + Excel (.xlsx) download for each module (Items, Inventory, Sales, Return, Replacement, Warehouse), fully detailed per spec Section 9.1/9.2 (no indexes/IDs-only shorthand — flatten all relevant fields).
- [ ] Build the scheduled daily report job (Netlify Scheduled Function) that runs at a **configurable time** (stored in config, not hardcoded), generates the detailed Excel report(s), and emails them.
- [ ] Configure email sending from `ficcado@gmail.com` using the provided Gmail app password, stored as an environment variable, via a server-side mail utility (e.g., Nodemailer SMTP). Recipient list must be pulled dynamically from the Admin Information Sheet at send-time.
- [ ] Add a UI control (Admin Control Centre) for admins to configure/update the daily report send time.

### Phase 8 — Performance, Resilience & Final Hardening
- [ ] Confirm batching + caching strategy from Phase 1 is applied consistently across all modules (no module doing naive per-field sequential Sheets calls).
- [ ] Load-test / simulate multiple admins acting concurrently (create/update on the same record) and confirm the conflict-detection flow (Phase 5) behaves correctly.
- [ ] Confirm every module correctly re-resolves its target sheet if an admin changes its Spreadsheet ID/Tab Name mid-session (no stale cached sheet reference lingering incorrectly).
- [ ] Full **anti-hallucination self-audit** (Section 1, item 6): search the entire codebase for hardcoded spreadsheet IDs, tab names, admin counts, or admin names outside the config/admin-data layer. Fix any findings.
- [ ] Full **spec-conformance audit** (Section 2, item 3): walk every section of the functional spec and confirm a corresponding, working implementation exists.
- [ ] Update `AGENT_PROGRESS.md` with the final completion entry.

---

## 4. Definition of Done

The task is complete only when **all** of the following are simultaneously true:
- Every checkbox in Section 3 is genuinely implemented and manually verified (not just planned).
- A grep-style search of the codebase turns up **no hardcoded spreadsheet IDs, tab names, or admin counts/names** outside the designated Sheet Configuration and Admin Information data layers.
- The app can have a **new Google Sheet substituted for any module** (by an admin updating Sheet Configuration) and a **new admin added**, both without any code change or redeploy — and the app continues to function correctly afterward.
- `AGENT_PROGRESS.md` contains a final "BUILD COMPLETE" entry referencing a completed audit against the spec.

Do not stop, summarize as "mostly done," or hand back control before this Definition of Done is fully met. If you believe you are done, run the audit in Phase 8 one more time before concluding.
