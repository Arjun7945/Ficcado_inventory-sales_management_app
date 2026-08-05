# Ficcado Inventory & Sales Management App — Implementation Prompt for Antigravity Agent

> **Read this entire document before writing any code.** This is your complete build plan for the project. Do not skip phases, do not invent features not listed here, and do not stop until every phase's checklist is fully checked off.

---

## 0. Mission Statement

You are building the complete application inside the **existing Next.js project named `ficcado-inventory-sales-management-app`**. The project already exists — do **not** re-initialize it, do **not** create a new project, and do **not** rename it. Work inside it, respecting whatever structure already exists (check `package.json`, folder layout, and existing config before writing anything).

Your source of truth for *what* to build is the companion document **`Ficcado-Inventory-Sales-Management-Spec.md`** (the functional/product specification). This document tells you *how* to execute that spec: in what order, how to verify your own work, and how to keep going without drifting, forgetting, or inventing requirements that were never specified.

Your source of truth for *how it should look and feel* is **`DESIGN.md`** (brand palette, typography, the loading-animation requirement, and UI copy/validation-messaging voice). Every screen you build must be checked against `DESIGN.md` before you consider it finished — do not ship default/unstyled component library looks. If `DESIGN.md` is missing or its color tokens are still marked "pending logo," pause UI polish work on that item and flag it rather than inventing a palette.

**Core facts you must never contradict:**
- Frontend-only architecture: **Next.js on Netlify**. No traditional backend server, no SQL/NoSQL database.
- **Google Sheets is the entire data layer**, accessed via the Google Sheets API.
- **Only two things are allowed to come from deploy-time environment variables: `GOOGLE_SERVICE_ACCOUNT_KEY` and `SHEET_CONFIG_SPREADSHEET_ID`.** This is irreducible — Netlify Functions have no persistent disk, so the only durable stores available to the app are Google Sheets or environment variables, and the app can't reach a Sheet without first having *some* credential and *some* pointer to reach it with. The developer pre-creates **one** Google Sheet (see `Ficcado-Google-Sheets-Credentials-Setup-Guide.md`), shares it with the service account, and supplies its ID. Everything else the app needs (a fixed, hardcoded tab-name convention is used within that one sheet — not a secret, just a constant — plus the Superadmin's own identity, Gmail sending config, every module's sheet, the admin list, report schedule) is created or entered once through the in-app first-run flow (Phase 0) — never a third required env var.
- **Zero hardcoded sheet names, sheet IDs, or tab references anywhere in application code**, with the single exception of the one bootstrap Spreadsheet ID above (read from its env var) and its fixed internal tab-name constant. Every other module resolves its target sheet at runtime through the Sheet Configuration layer (spec Section 15), which lives inside that one bootstrap sheet. If you ever find yourself typing a literal spreadsheet ID or tab name into a component, service file, or API route anywhere else, stop and fix it before continuing.
- There is exactly **one privileged bootstrap identity**: the **Superadmin**. It is *not* a hardcoded env-var account — it's **self-claimed** the first time anyone reaches a freshly deployed, unconfigured instance of the app (see Phase 0's "Claim This Installation" flow). Once claimed, its hashed credentials live in the bootstrap sheet's config tab, exactly like every other admin's data — just with elevated first-run privileges.
- The number of regular admins is **not fixed** (currently 3, but must support more being added later) — never hardcode a count, a fixed-length array of admins, or admin-specific conditional logic.
- All "Created By / Updated By / Created At / Updated At" fields are **always the acting admin**, auto-filled by the app — never a manual text field.
- The guiding UX principle is **reducing admin effort**: prefill, auto-generate, default, and use dropdowns wherever possible instead of blank free-text forms.
- Every loading state anywhere in the app uses the **same branded lizard loading animation** (see `DESIGN.md`) instead of a generic spinner — this includes login submission and every subsequent async wait in the app.
- Every error, validation failure, or exception must be surfaced to the user in **clear, specific, in-voice language** — never a raw stack trace, a silent failure, or a generic "Something went wrong." See `DESIGN.md`'s error-messaging section and Phase 8a below.

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

Work through these phases **in order, starting with Phase 0**. Each phase must be fully implemented and self-verified (per Section 2) before moving to the next.

### Phase 0 — Bootstrap & Self-Claimed Superadmin Setup (do this before anything else)

**Concept:** The developer provides exactly **one** secret before the first deploy: `GOOGLE_SERVICE_ACCOUNT_KEY` (see the companion `Ficcado-Google-Sheets-Credentials-Setup-Guide.md`). Nothing else is required to deploy. On first boot, the app locates or creates its own configuration spreadsheet by a fixed, well-known name — no ID has to be known or remembered by anyone. The very first person to reach the freshly deployed, unconfigured app **claims** the Superadmin role by setting a username and password right there in the UI — there is no separate pre-set Superadmin credential. From that point, the Superadmin walks through registering the remaining sheets, email config, and the first real admin(s).

- [ ] **Bootstrap sheet discovery.** On any server-side action that needs the Sheet Configuration, first attempt to fetch it from a cached/known ID (see below); if none is cached yet, use the Drive API (via `GOOGLE_SERVICE_ACCOUNT_KEY`) to search for a spreadsheet with a fixed, reserved name — e.g. `Ficcado-System-Config` (constant in code, not a secret, just a convention). If found, use it. If not found, **create it** (with an `AppMeta` tab and a `SheetConfig` tab, headers pre-populated per spec Section 15.2) and share is not needed since the service account created it directly. Cache the resulting Spreadsheet ID in memory per invocation (re-discover on cold starts — this is a cheap Drive search, not a bottleneck).
- [ ] **"Claim This Installation" screen.** If `AppMeta` has no `superadmin_claimed = true` flag, any visitor to the app's root/login route sees a Claim screen instead of a login form: choose a Superadmin username and password (client validates strength; server hashes with bcrypt before writing). On submit, write the hashed credentials and `superadmin_claimed = true` into `AppMeta`. This is a **one-time** screen — once claimed, all future visitors see the normal login form instead, and only someone who authenticates as Superadmin can reach the setup flow below again (via "Reconfigure Setup").
- [ ] **Security note (surface this to the user, don't silently decide):** because anyone who reaches the URL before it's claimed becomes Superadmin, note in `AGENT_PROGRESS.md` that the deploying developer is responsible for keeping the URL private (or unlisted) until claimed. Optionally support an extra `INSTALL_CLAIM_CODE` env var that, if present, must be entered on the Claim screen before it will accept a new Superadmin — implement this as an **optional** extra layer, not a requirement, since the developer explicitly wants to minimize required env vars.
- [ ] **Setup Wizard, Step 1 — Confirm Google access.** Verify the Service Account credentials work (a live test read/write against the auto-discovered/created config spreadsheet). Show a clear pass/fail with the exact error if it fails (see Phase 8a on exception messaging).
- [ ] **Setup Wizard, Step 2 — Register all module sheets.** For each required module (`items`, `inventory`, `warehouse`, `sales`, `replacement`, `return_refund`, `admin_info`, `keep_notes`, `activity_log`), prompt the Superadmin to either (a) paste an existing Spreadsheet ID + Tab Name, or (b) click "Create for me" to auto-create a new Google Sheet + tab via the Sheets/Drive API (pre-populated with the correct header row from the functional spec — no manual sharing needed since the service account creates it directly). Either path writes the result into the `SheetConfig` tab — reusing the exact same mapping mechanism described in spec Section 15, not a separate one.
- [ ] **Setup Wizard, Step 3 — Email configuration.** Collect `GMAIL_SENDER_ADDRESS` (defaults to `ficcado@gmail.com`) and the Gmail app password, entered by the Superadmin. Store the app password **encrypted** (e.g., encrypted at rest within a restricted-access cell/tab, with the encryption key derived from `GOOGLE_SERVICE_ACCOUNT_KEY` or a dedicated `ENCRYPTION_SECRET` — flag whichever approach is chosen in `AGENT_PROGRESS.md`, since storing any secret in a spreadsheet cell, even encrypted, is a real tradeoff worth being explicit about rather than silently picking). Include a "send test email" action before allowing the wizard to proceed.
- [ ] **Setup Wizard, Step 4 — Create the first real admin(s).** Require at least **one** regular admin to be created (name, phone, email — written to the now-configured Admin Information sheet) before the wizard can be marked complete. This is the final mandatory step.
- [ ] On completing Step 4, set `setup_completed = true` in `AppMeta`. From this point on, the Superadmin path becomes a rarely-used fallback/reconfiguration login, and the newly created admin(s) use the normal admin login (Phase 2) for everyday use.
- [ ] Make the wizard **re-enterable**: a "Reconfigure Setup" action available to the Superadmin (and optionally to regular admins in the Admin Control Centre) that reopens Steps 1–3 individually — since Section 15 of the spec already requires sheet IDs to be editable at any time, this wizard should really just be Step 2's UI reused as a guided first-run flow, not a separate one-time-only code path.

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

### Phase 8a — Branded Loading Animation, Validation & Exception Handling (cross-cutting — verify on every screen)

This phase is not a one-time build step; it's a **quality bar every other phase must already meet**. Use it as a final sweep, but the underlying components should exist from early on so later phases can reuse them.

- [ ] Build a single reusable **Loading component** wrapping the branded lizard animation described in `DESIGN.md`. Every async wait in the app — login submission, every CRUD save, every report generation, every sheet fetch, the Setup Wizard's test-connection steps — must use this **one shared component**, never an ad-hoc spinner, skeleton, or "Loading..." text.
- [ ] Confirm the animation respects `prefers-reduced-motion` (show a static branded mark or a simple non-animated indicator instead, per accessibility best practice) — check `DESIGN.md` for the exact fallback treatment.
- [ ] Build a single reusable **form validation layer** (e.g., a shared schema-validation utility) used by every form in the app (Items, Inventory, Warehouse, Sales, Replacement, Return/Refund, Admin Profile, Create Admin, Setup Wizard, Sheet Configuration). Every required field, format constraint (phone, email), and business rule (e.g., quantity ≥ 0) must produce a **specific, field-level message** — never a generic "Invalid input."
- [ ] Build a single reusable **error/exception surface** for anything that fails server-side (Google API errors, network failures, permission errors, conflict-version errors from Phase 5). It must show the user a plain-language explanation of *what* failed and, where possible, *what to do next* (e.g., "Couldn't save — this record was updated by another admin. Reload to see their changes." rather than a raw HTTP status or stack trace). Match the voice/tone rules in `DESIGN.md`.
- [ ] Confirm every phase's screens have been checked against this validation/error/loading standard before Phase 8 is considered complete — this is part of the final full-repo audit from Section 2, item 3.

---

## 4. Definition of Done

The task is complete only when **all** of the following are simultaneously true:
- Every checkbox in Section 3 is genuinely implemented and manually verified (not just planned), **including Phase 0**.
- The app can be deployed to a **fresh environment** with only `GOOGLE_SERVICE_ACCOUNT_KEY` set — no other env var — and a first-time visitor can claim the Superadmin role and complete the full Setup Wizard through the UI to reach a fully working app.
- A grep-style search of the codebase turns up **no hardcoded spreadsheet IDs, tab names, admin counts/names, or Gmail credentials** outside the designated Sheet Configuration, AppMeta, and Admin Information data layers.
- The app can have a **new Google Sheet substituted for any module** (by an admin updating Sheet Configuration) and a **new admin added**, both without any code change or redeploy — and the app continues to function correctly afterward.
- Every screen uses the shared branded loading animation, the shared validation layer, and the shared error-messaging component (Phase 8a) — no bare spinners, no unhandled raw errors.
- Every screen has been checked against `DESIGN.md` for palette, typography, and voice.
- `AGENT_PROGRESS.md` contains a final "BUILD COMPLETE" entry referencing a completed audit against the spec.

Do not stop, summarize as "mostly done," or hand back control before this Definition of Done is fully met. If you believe you are done, run the audit in Phase 8 one more time before concluding.