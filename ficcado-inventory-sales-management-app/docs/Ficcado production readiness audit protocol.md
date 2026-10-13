# Ficcado — Production Readiness & Code Quality Audit Protocol
### (Reusable Standing Prompt for the Antigravity Agent — Run on Every Update)

> **This is not a one-time phase.** Unlike the numbered Parts (1–9, plus WhatsApp/Mobile/Quick Dash), this document is a **standing protocol** — run it in full before every production deployment, and re-run the relevant sections after any significant update, not just once before go-live. Its job is to catch exactly what the client asked for: dead code, boilerplate, unwanted lines, mistakes, slow requests, data loss risk, and broken CRUD — before a real customer ever sees them.

> **Output requirement:** every run produces a written entry in `CODE_AUDIT_LOG.md` (create it if it doesn't exist) — dated, listing what was checked, what was found, what was fixed, and what's confirmed clean. "Nothing found" is a valid, useful entry — don't skip logging a category just because it passed. This creates a visible audit trail over time, the same way `AGENT_PROGRESS.md` tracks feature work.

---

## 1. Known Historical Replacements — Verify Every One Actually Happened

Across Parts 1–9 and the standalone feature docs, several instructions explicitly said "replace/remove the old implementation." These are the **highest-confidence places dead code actually exists**, because iterative additive development across this many documents is exactly how old implementations get left behind instead of properly deleted. Check every one of these specifically — don't just do a generic sweep and assume it would have caught them:

| # | What was supposed to be removed/replaced | Where |
|---|---|---|
| 1 | The "Create for me" spreadsheet-creation option in Setup Wizard Step 2 (removed due to service-account storage limits) | Onboarding / Setup Wizard |
| 2 | The old component/modal-based Return/Refund implementation, replaced by a dedicated page | Return/Refund |
| 3 | Positional-index-based sheet writes, replaced by header-name-based resolution | Replacement (and re-checked across Sales, Return/Refund, Warehouse, Inventory) |
| 4 | The unfiltered "every admin" Fulfilment Source dropdown, replaced by the real-handlers-only filtered version | Sales creation |
| 5 | Whatever leftover logic was causing Cash payments to display "N/A" instead of "Cash" (likely misapplied Return/Refund hide-logic) | Sales invoice/email |
| 6 | Any archival/rollover code for Sales Log, Activity Log, or Inventory History (this feature was explicitly cancelled — confirm nothing from the cancelled design was left in place) | Logs |
| 7 | The old per-row Sheet Configuration edit form, its handlers, and its API routes, replaced by the single global "Update and Regenerate" flow | Admin Control Centre |
| 8 | Required-field validation on Transaction ID (Sales and Return/Refund), now optional everywhere | Sales, Return/Refund |
| 9 | The combined "Contact Details" field on Vendors, replaced by separate Contact Number(s) and Email ID | Vendor Management |
| 10 | The old flat, ungrouped sidebar navigation and its mismatched icon set, replaced by the grouped/collapsible structure with one consistent icon set | Sidebar |

For each row: confirm the **new** implementation is the only one present, and that the **old** one is fully gone — not commented out, not behind a dead feature flag, not sitting in an unused file still imported somewhere.

---

## 2. Dead Code & Boilerplate — General Sweep

Beyond the specific list above, do a full-codebase pass for:
- Unused components, functions, hooks, and API routes/Netlify Functions with zero remaining references.
- Commented-out code blocks left in place "just in case" — remove them; version control is what "just in case" is for, not comments.
- Duplicate implementations of the same concern (see Section 5 — this is where most duplication hides).
- Console logs, debug statements, or placeholder/TODO code left over from earlier development that shouldn't ship to production.
- Unused imports, unused variables, and dependencies listed in `package.json` that nothing in the code actually uses.
- Leftover scaffolding from the project's initial Next.js setup that was never customized or removed (default example pages/components, boilerplate README content, starter CSS that got fully overridden elsewhere).

---

## 3. Data Integrity & No-Data-Loss Verification

Given every action ultimately writes to Google Sheets with no traditional database transaction guarantees, this deserves specific, deliberate attention — not just a general "does it work" check:

- **Destructive actions get extra scrutiny.** Specifically re-verify: the Sheet Configuration "Remove all & regenerate" flow's confirmation step actually blocks accidental execution; the all-items Return/Refund flow's Sales-row deletion only fires after the stricter Close Ticket gate genuinely passes (refund payment details actually present, not just approved); any other Delete action anywhere in the app asks for confirmation before executing.
- **Version conflict handling** (base spec, Section 7.1) — confirm this genuinely still works: two admins editing the same record, second save gets a real conflict warning, not a silent overwrite.
- **Partial-write failure handling** — for any action that writes to more than one sheet in sequence (e.g., a sale that deducts Inventory *and* a handler's Warehouse stock, or a Replacement that touches Replacement Management, Inventory, and the Sales Log all at once), confirm a failure partway through doesn't leave the data in a half-updated, inconsistent state — or at minimum, that such a failure is clearly surfaced to the admin rather than silently swallowed.
- **Every write that should log to the Inventory History Tracker or Sales Log actually does** — spot-check several transaction types (sale, replacement, refund, damaged disposal, warehouse allocation) and confirm none of them silently skip their logging step.

---

## 4. CRUD Correctness — Full Matrix Sweep

Walk every module and confirm Create, Read, Update, and Delete (where applicable) all genuinely work — not just "the button exists," but that data actually persists correctly, reloads correctly after a refresh, and reflects accurately across every screen that displays it:

Items, Inventory, Warehouse, Sales, Replacement, Return/Refund, Damaged Products, Admin Information, Keep Notes, Customer Information, Expense Management, Vendor Management (+ Payment Log), Activity Log, Sales Log, Inventory History Tracker, Sheet Configuration.

For each: confirm the operation writes to the correct sheet/columns (per Section 1, item 3's header-based resolution), triggers whatever downstream effects it's supposed to (stock changes, log entries, status updates), and that the UI reflects the change without requiring a manual full page reload to see it.

---

## 5. Consistency Audit — "One Shared Function" Rules

This project has repeatedly established a rule of **one shared implementation per concern**, specifically to prevent the kind of subtle bugs that come from two slightly-different copies of the same logic drifting apart. Verify each of these is genuinely singular, not duplicated:

- **One** Total Amount calculation function, used identically by sale creation, sale update, and the "Add more items to sale" flow.
- **One** date/time formatting function (raw timestamp → IST → `DD Month YYYY, H:MM:SS AM/PM`), used everywhere a date displays, including mobile.
- **One** invoice/PDF generation function, reused by the downloadable invoice, the Gmail attachment, the WhatsApp flow, and the Profitability report export.
- **One** Sheet Configuration SDK (`getModuleSheet(moduleKey)`-style resolver), used by every module — no direct/hardcoded sheet reads anywhere else.
- **One** loading component (`<LoadingGecko />`), one shared validation layer, and one shared error-messaging component, used by every form and every async action across the entire app, including every feature added in Parts 2 through 9.
- **One** Activity Log/Sales Log writer per event type, not separate ad-hoc logging logic scattered per module.
- **One** shared header-mapped `Refund Amount` reader/parser across Returns & Refunds list view, detail view, invoices, Sales Log, Dashboard, and Payment Transactions ledger — verifying position-independent header lookups and safe numeric cleaning so `₹0` display bugs never resurface.

If any of these turn out to have a second, slightly different implementation somewhere, that's exactly the kind of "mistake" the client asked this audit to catch — consolidate into the one correct version and remove the duplicate.

---

## 6. Performance — Fast Request/Response Verification

Re-verify the scalability architecture is actually intact, not just specified once and forgotten as newer features got added on top:

- No screen fetches a full sheet client-side — confirm this holds true for every list view added in later parts too (Expense Management, Vendor Management, Payment Transactions, Announcements' customer list), not just the original set from when this rule was first written.
- Search (invoice number, customer name, item name) returns quickly without a full-sheet scan.
- Dashboard metrics and any other frequently-viewed aggregate (Profitability, Payment Summary widgets) are served through caching, not recomputed from a full scan on every view.
- Confirm nothing introduced in later parts silently reverted to a naive full-fetch pattern — this is a realistic risk specifically because later features were built by extending earlier ones, and it's easy to copy an old pattern without checking whether a faster one had since been established.

---

## 7. Security Spot-Check

- Confirm every secret (Google service account key, Gmail app password, WhatsApp credentials if in use) is stored encrypted/via environment variables — never plaintext in a sheet cell or committed to source.
- Confirm authentication/authorization checks fail **closed** (deny access) on error, never open.
- Confirm session cookies use appropriate security flags and reasonable expiry.
- Confirm there's reasonable protection against brute-force login attempts (rate limiting/lockout), given there's no CAPTCHA anywhere in this app's design.
- Confirm no API route trusts client-supplied data it shouldn't (e.g., an admin's own identity/role should be derived from their authenticated session server-side, never taken from a client-submitted field).

---

## 8. Final Pre-Deployment Sign-Off Checklist

Before telling the client this is ready for Netlify:
- [ ] Every item in Section 1's historical-replacement table confirmed clean.
- [ ] Section 2's general dead-code sweep complete, findings logged.
- [ ] Section 3's data-integrity checks pass, especially the destructive-action confirmations.
- [ ] Section 4's full CRUD matrix confirmed across every module.
- [ ] Section 5's shared-function consistency confirmed — no duplicate implementations found (or duplicates found and consolidated).
- [ ] Section 6's performance checks confirmed, including for the most recently added list views.
- [ ] Section 7's security spot-check complete.
- [ ] `CODE_AUDIT_LOG.md` updated with this run's full findings — including categories where nothing was found, stated explicitly rather than omitted.
- [ ] Any unresolved finding is either fixed, or explicitly flagged to the client as a known issue before deployment — nothing silently deferred without saying so.

**This checklist doesn't get skipped or shortened because "it was probably fine last time."** Each run should genuinely re-verify, since every part added since the last audit is a new opportunity for one of these categories to regress.