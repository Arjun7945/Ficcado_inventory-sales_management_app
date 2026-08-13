# Ficcado Inventory & Sales Management — Part 7 Implementation Prompt
### (Refactor & New Feature — for the Antigravity Agent)

> **Additive, not a restart.** Builds on every prior document — the functional spec, base Implementation Spec (Phases 0–8a), `part2_of_implementation_ficcado.md` (9–17), `part3_of_implementation_ficcado.md` (18–24), `WhatsApp-Feature.md` (25–27), `part4_of_implementation_ficcado.md` (28–34), `part5_of_implementation_ficcado.md` (35–44), `mobile_mode_feature.md` (45–52), `part6_of_implementation_ficcado.md` (53–61), and `DESIGN.md`. Treat this as **Phase 62 onward**. All standing rules still apply.

---

## Part A: Refactor — Human-Readable Date/Time Formatting

**Bug:** timestamps across the application currently display as raw ISO 8601 strings (e.g., `2026-08-12T16:22:44.873Z`) — not understandable at a glance. Replace this everywhere with a clear, consistent format: **`12 August 2026, 9:52:44 PM`** (full month name, 12-hour clock, AM/PM).

**Important detail the example itself reveals:** `2026-08-12T16:22:44.873Z` is UTC, and `16:22:44 UTC` converts to `21:52:44` in India Standard Time (UTC+5:30) — which is exactly `9:52:44 PM`. So this isn't just a display-formatting fix, it's also a **timezone conversion fix**: timestamps must be converted from however they're stored (UTC) to **IST** before formatting, not just re-formatted in whatever timezone they happen to be stored in. Confirm IST is correct for Ficcado's actual audience before finalizing (Ficcado is based in Kerala, so IST should be right, but confirm rather than assume silently).

**Implementation requirements:**
- Build **one shared date-formatting utility function** (consistent with the project's established pattern of one shared function per concern — see Part 4/6's calculation-consolidation fixes) that takes a raw stored timestamp and returns the `DD Month YYYY, H:MM:SS AM/PM` IST-formatted string. Every single place a date/time is displayed in the UI must call this one function — never a second ad-hoc formatter anywhere.
- Apply this **everywhere** a timestamp appears: every Created At/Updated At/Closed At field across Items, Inventory, Warehouse, Sales, Replacement, Return/Refund, Damaged Products, Admin Information, Keep Notes, Customer Information, Activity Log, Sales Log, and Inventory History Tracker — no exceptions, no page skipped.
- The **underlying stored value** in the Google Sheets themselves should remain in its precise raw/ISO form (for accurate sorting, calculation, and audit integrity) — only the **displayed** value changes. Don't degrade the stored data's precision to match the prettier display format.
- Apply this to mobile mode (`mobile_mode_feature.md`) screens too, not just desktop/tablet.

---

## Part B: New Feature — Production-Grade Scalability & Performance Architecture

The client's concern, stated directly: this app will run live for 8–12+ months, accumulating potentially 10,000+ rows across Sales, Sales Log, Activity Log, Inventory History, Keep Notes, and other growing sheets — with new insertions happening constantly. Loading everything client-side, or scanning entire sheets for a search, will not hold up. This needs to be solved **now**, before production, not retrofitted later.

**This section applies to every list/log view in the application** — the ones explicitly named by the client (Inventory History, Sales/Activity Log, Keep Notes, Sales list) and, by the same reasoning, every other list-style screen already built (Items, Inventory, Warehouse, Replacement, Return/Refund, Damaged Products, Admin list, Customer Information).

### B1. Server-Side Pagination (Never Load a Full Sheet Client-Side)
- No screen may fetch an entire sheet's worth of rows into the browser and paginate/filter it client-side. Every list view must be backed by a **server-side paginated endpoint** (a Netlify Function) that fetches only the requested row range from the Sheets API (using the API's range parameters — e.g., a specific row window per page), not the whole sheet.
- Use a consistent pagination pattern across the app — page-number-based (with a defined page size, e.g., 25–50 rows) or cursor/range-based, whichever proves more efficient against the Sheets API's actual behavior; pick one and apply it uniformly rather than mixing approaches per screen.
- Default views should load the **most recent** data first (append-heavy logs like Sales Log, Activity Log, and Inventory History are read newest-first far more often than oldest-first) — design the range-fetch to grab from the end of the sheet by default, not the beginning.

### B2. Fast Search (Invoice Number, Customer Name, etc.) Without Full-Sheet Scans
Google Sheets has no built-in query engine like a real database — a naive search means reading every row and filtering in code, which gets slow fast at 10,000+ rows. Address this directly:
- **Build and maintain a lightweight index** for the fields admins actually search by (invoice number, customer name/phone for Sales and Customer Information, item name for Inventory/Items) — a small, fast-to-read mapping structure (could be its own compact sheet/tab, or a server-side cache refreshed incrementally on every relevant write) that points a search key to the row(s) it lives in, so a search doesn't have to linearly scan the full sheet.
- **Evaluate Google's Visualization API query mechanism** (the `gviz`/`tq` query endpoint some Sheets expose, which supports SQL-like `SELECT`/`WHERE` filtering server-side against a sheet without pulling the whole thing) as a possible option for filtered reads — this has real caveats around authentication/sheet-sharing requirements that need verifying against Ficcado's private, service-account-authenticated sheets before relying on it; treat it as one candidate technique to test, not an assumed solution.
- Whichever approach is chosen, the important outcome is the same: searching by invoice number or customer name must return quickly regardless of how many total rows exist, without reading the entire sheet into memory to filter it.

### B3. Archival / Rollover Strategy for Ever-Growing, Append-Only Sheets
Sales Log, Activity Log, and Inventory History Tracker are append-only and will grow indefinitely. Beyond pagination and search, this needs a genuine growth strategy:
- Google Sheets has a hard cap (roughly 10 million cells per spreadsheet) — an append-only log at high transaction volume over 8–12+ months could meaningfully approach limits that hurt performance well before that hard cap.
- Implement a **rollover/archival scheme**: periodically (e.g., monthly) move older rows out of the "live" tab into a dated archive tab or spreadsheet, so the tab admins actually browse day-to-day stays small and fast. Keep a defined **rolling window** (e.g., the live view covers the last 90 days) as the default, with a clear way to reach archived data on demand (e.g., an "older entries" option that queries the appropriate archive) rather than losing access to history entirely.
- This must not break Section 15's Sheet Configuration model (base spec) — archive tabs/spreadsheets should be registered and resolved the same way every other module sheet is, never hardcoded.

### B4. Caching Layer Extension
- Extend the caching strategy already established in the base Implementation Spec (Phase 1's batching + client-side caching) with **short-TTL server-side caching** at the Netlify Function layer for frequently-hit, expensive-to-compute reads — especially Dashboard metrics (Part 5, Section A6's Overall/Today toggle) and the Sales Log preview widget — so repeated views by multiple concurrent admins don't each trigger a fresh full computation against the Sheets API.
- Keep cache TTLs short enough that data still feels current (the app's whole premise depends on admins trusting what they see), but long enough to meaningfully cut down redundant API calls under real concurrent usage.

### B5. Rate-Limit Awareness & Backoff
- Google Sheets API enforces per-project/per-minute request quotas. With multiple concurrent admins, plus existing polling features (the Online-admin heartbeat from Part 3, and the Sales Log auto-refresh from `mobile_mode_feature.md`), usage could approach those limits as the team and data volume grow.
- Implement retry-with-backoff handling for any Sheets API call that hits a rate-limit response, rather than surfacing a raw failure to the admin.
- Document the app's realistic request-volume profile (roughly how many calls per admin session, how polling intervals contribute) in `AGENT_PROGRESS.md`, so it's easy to tell later whether a Google Cloud quota increase request is actually warranted.

### B6. Explicit Scale Validation
The client asked for this to be genuinely analyzed, not just theoretically addressed:
- Simulate or reason through the application's behavior with **10,000+ rows** in the largest sheets (Sales, Sales Log, Activity Log, Inventory History) and confirm: list views still load quickly (paginated, not full-scan), search by invoice number/customer name still returns quickly, and the Dashboard's metrics (which likely aggregate across many rows) don't require a full-sheet read on every view.
- Write up this analysis explicitly in `AGENT_PROGRESS.md` — what was tested/reasoned through, what held up, and what (if anything) still needs further work before Ficcado should feel confident going live with heavy production usage.

---

## Phase Checklist

### Phase 62 — Date/Time Formatting
- [ ] Build the single shared date-formatting utility (raw timestamp → IST → `DD Month YYYY, H:MM:SS AM/PM`).
- [ ] Apply it across every screen and every timestamp field listed in Part A, including mobile mode — confirm none were missed.
- [ ] Confirm underlying stored values remain unchanged — only display formatting changed.

### Phase 63 — Server-Side Pagination
- [ ] B1: Build paginated Netlify Function endpoints for every list/log view named in Part B's opening paragraph; remove any remaining full-sheet client-side fetch-and-paginate pattern.

### Phase 64 — Search Performance
- [ ] B2: Build and wire up the search index (or evaluate/implement the `gviz` query approach) for invoice number, customer name/phone, and item name searches; confirm results return quickly without a full-sheet scan.

### Phase 65 — Archival Strategy
- [ ] B3: Implement the rollover/archival scheme for Sales Log, Activity Log, and Inventory History Tracker, with a defined rolling live-window and on-demand access to archived data, registered properly through Sheet Configuration.

### Phase 66 — Caching & Rate-Limit Handling
- [ ] B4: Extend server-side caching for Dashboard metrics and the Sales Log preview widget.
- [ ] B5: Implement retry-with-backoff for Sheets API rate-limit responses; document the app's request-volume profile.

### Phase 67 — Scale Validation & Audit
- [ ] B6: Simulate/reason through 10,000+ row behavior across the largest sheets and document the findings in `AGENT_PROGRESS.md`.
- [ ] Confirm every date/time display across the app (desktop, tablet, mobile) uses the new formatting correctly, including a spot-check of the exact UTC→IST conversion example from Part A.
- [ ] Update `AGENT_PROGRESS.md` with a "PART 7 COMPLETE" entry, including the scale-validation write-up.

---

## Definition of Done

- No raw ISO timestamp is ever shown to an admin anywhere in the application — every date/time uses the single shared formatter, correctly converted to IST.
- No list or log screen ever fetches a full sheet client-side — every one is served through a paginated, server-side endpoint.
- Searching Sales by invoice number or customer name returns quickly regardless of total row count, verified against a large simulated dataset.
- Sales Log, Activity Log, and Inventory History Tracker have a working archival/rollover mechanism, with the live view staying fast as data accumulates over time.
- Dashboard metrics and the Sales Log preview widget are served through the extended caching layer, not recomputed from scratch on every view.
- The application's behavior at 10,000+ rows has been explicitly analyzed and documented, not just assumed to be fine.