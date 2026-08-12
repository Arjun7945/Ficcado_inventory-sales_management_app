# Ficcado Inventory & Sales Management — Mobile Mode Feature
### (New Requirement — for the Antigravity Agent)

> **Additive, not a restart.** Builds on every prior document — the functional spec, base Implementation Spec (Phases 0–8a), `part2_of_implementation_ficcado.md` (9–17), `part3_of_implementation_ficcado.md` (18–24), `WhatsApp-Feature.md` (25–27), `part4_of_implementation_ficcado.md` (28–34), `part5_of_implementation_ficcado.md` (35–44), and `DESIGN.md`. Treat this as **Phase 45 onward**. All standing rules still apply: shared `<LoadingGecko />`, shared validation/error components, zero hardcoded sheet references, every field-level change logged per Part 5's rules.

---

## 0. Scope — What "Mobile Mode" Actually Covers

This is a deliberately **scoped** mobile experience, not a shrink-wrapped copy of the entire desktop app. Based on how admins actually intend to use their phones for this app — quick sale entry, moving an order into Replacement or Return/Refund, updating those in-progress tickets, checking what other admins have done, and glancing at today's numbers — mobile mode covers exactly these sections and nothing else:

| Section | Access Level on Mobile |
|---|---|
| Login | Full (entry point) |
| Dashboard | Full — navigation hub + reports |
| Sales | Create, Read, Update |
| Replacement | Create, Read, Update |
| Return/Refund | Create, Read, Update |
| Sales Log | Read only |
| Inventory History Tracker | Read only |
| My Profile | Read own info + Logout |

**Everything else — Items, Inventory add/edit, Warehouse, Damaged Products, Admin Control Centre, Setup Wizard, Sheet Configuration, Keep Notes, Email/WhatsApp Configuration, Create New Admin — is intentionally out of scope for mobile mode.** These stay desktop/tablet-only for now (the responsive web app still technically renders them if navigated to directly, but they are **not part of the mobile navigation** and get no mobile-specific design pass in this phase). If any of these turn out to be needed on mobile later, that's a clean follow-up phase — flag it rather than silently expanding scope now.

**Delete is intentionally excluded from mobile** for Sales, Replacement, and Return/Refund — only Create, Read, and Update are in scope, matching what was actually requested. Deletion stays a desktop-only action for this phase.

---

## 1. Navigation Architecture

- **Dashboard is the single home/hub.** Every other in-scope section is reached by navigating *from* the Dashboard — there is no separate bottom tab bar duplicating every section; keep the navigation model simple and centered on the Dashboard, per the requirement that "all navigation can be started from the dashboard."
- **Persistent Back control**: every non-Dashboard screen shows a clearly visible Back action (consistent placement, e.g., top-left) that returns to the previous screen in the app's own navigation stack — not a raw browser-back dependency. Use the router's own history/back mechanism so this behaves predictably even after deep interactions (e.g., back from a Replacement detail page returns to wherever the admin came from — Dashboard, Sales list, or the Sales Log — not always straight to Dashboard).
- **Logout is available in two places** for convenience: a small, always-reachable icon in the mobile header (so an admin can log out without hunting for it), and the dedicated Logout button on the My Profile page (the primary, explicit place for it, per the requirement).
- **Header**: keep it minimal — the Ficcado mark/name, the logout icon, and (per Part 3, Section 2.5, simplified by Part 5, Section B1) a compact version of the Online indicator, since knowing who else is active is directly relevant to the "don't miss what other admins changed" goal below.

---

## 2. Per-Section Mobile Requirements

### 2.1 Login
- A clean, single-column login screen using `DESIGN.md`'s branding (gecko mark, palette, the shared `<LoadingGecko />` loading state on submit). No desktop-only elements (e.g., the Setup Wizard/Claim flow is out of scope here — mobile login assumes the app is already set up).

### 2.2 Dashboard
- Full mobile treatment of the **Overall Sale / Today's Sale** toggle and both metric sets from Part 5, Section A6 — stacked as clear cards rather than a wide row, since phone width won't fit the desktop layout.
- Include **Inventory History** visibility here too — either a summary card (e.g., "3 stock changes in the last hour") linking through to the full read-only Inventory History screen (Section 2.6), or a direct nav entry — pick whichever keeps the Dashboard from feeling cluttered, but make sure it's reachable from here.
- Include a compact **Sales Log preview** (e.g., latest 3–5 entries, per Part 5 Section B3.B's dashboard widget, scaled for mobile) with a clear link through to the full Sales Log (Section 2.5) — this is the admin's first read on opening the app, given they want to catch changes made by other admins as soon as they log in.
- From the Dashboard, provide clear navigation entries into: Sales, Replacement, Return/Refund, Sales Log, Inventory History, and My Profile.

### 2.3 Sales — Create, Read, Update
- **Create**: adapt the dedicated sale-creation page (Part 2, Section 2.3.1) into a mobile-friendly step flow rather than a dense single-screen form — e.g., step through item selection + quantity (repeatable "add another item"), then Fulfilment Source, then customer details (with the phone-number lookup/autofill from Part 3, Section 2.4, and the optional email/WhatsApp fields), then delivery charge/discount, then a final review-and-submit step. Reuse all existing validation, calculation, and Inventory-decrement logic exactly as already specified — this is a layout change, not a logic change.
- **Read**: a scannable list of sales (card-per-sale rather than a dense table), with the Download Invoice / Send Gmail Confirmation / Send WhatsApp Confirmation actions (Part 3, WhatsApp Feature doc) reachable per card without requiring horizontal scrolling.
- **Update**: the existing edit flow (Part 4, Section A3's recalculation fix applies identically here), plus the **Replace Requested** / **Return/Refund Requested** actions from Part 2 Section 2.3 / Part 5 Section A1, laid out as clear, tappable actions rather than a crowded button row.

### 2.4 Replacement — Create, Read, Update
- Adapt the Replacement Handling page's existing step structure (Step 1 old items → Step 2 new items → Step 3 dispatch source → Step 4 disposition → Step 5 delivery/discount → status) into a vertical, mobile-friendly stepper — this page's existing design is already close to step-based, which suits mobile well; the main work is spacing, touch-target sizing, and making sure dropdowns/checkboxes are comfortably tappable rather than shrunk desktop controls.
- **Save Progress** and **Replacement Completed** remain distinct, clearly separated actions (per Part 5's logging split) — don't visually conflate them on the smaller screen.
- Reuse the same Sales Log message templates (Part 5) — no separate mobile-only logging logic.

### 2.5 Return/Refund — Create, Read, Update
- Same treatment as Replacement (Section 2.4): the existing page structure (Purchased Items Summary → Reason for Return → item selection/verification status/disposition → refund mode → Close Ticket) becomes a mobile-friendly vertical flow.
- The Close Ticket validation gate (Part 4 Section B2.C, tightened for all-items returns in Part 5 Section A3) and the "Missing Information" inline section both need to render cleanly on a narrow screen — a simple stacked list of what's missing works well here.
- The closed-ticket lock/banner (Part 5, Section A4) must render clearly on mobile too — the banner shouldn't get visually lost above the fold.

### 2.6 Sales Log — Read Only, Kept Fresh
This is explicitly the section the admin wants **available at all times while logged in**, since other admins may make changes they don't want to miss. Beyond a standard read-only list (filterable/searchable per Part 5, Section B3.B):
- **Auto-refresh / polling**: periodically re-check for new Sales Log entries while this screen (or the Dashboard's preview widget) is open, similar in spirit to the Online-admin heartbeat polling (Part 3, Section 2.5) — don't build a second, unrelated polling mechanism; reuse the same lightweight polling pattern and interval philosophy (frequent enough to feel current, not so frequent it hammers the Sheets API).
- **Unread indicator**: show a simple badge/count of new entries since the admin last viewed the Sales Log (e.g., on the Dashboard's Sales Log preview, or the nav entry itself) so it's obvious at a glance that something changed, without forcing the admin to keep the screen open and stare at it.

### 2.7 Inventory History Tracker — Read Only
- A simple, filterable (by item, date range, transaction type) read-only list, reusing the schema from Part 2, Section 1.5 — same reasoning as Sales Log: admins want to see what changed without needing to reconstruct it themselves.

### 2.8 My Profile
- Show the logged-in admin's own profile information (name, phone, email — per the base spec's Admin Profile section, Part 1 Section 14.1), read-only or lightly editable consistent with whatever the desktop Profile page already allows — this phase doesn't need to add new profile-editing capability, just make the existing page mobile-friendly.
- The **dedicated Logout button** lives here as the primary, explicit place to log out (Section 1's header icon is the convenience shortcut; this is the definitive one).

---

## 3. Phase Checklist

### Phase 45 — Mobile Navigation Shell
- [ ] Build the mobile header (brand mark, logout icon, compact Online indicator) and the Dashboard-centered navigation model (Section 1).
- [ ] Implement the persistent, history-aware Back control used across every mobile screen.

### Phase 46 — Mobile Login & Dashboard
- [ ] Build the mobile Login screen (Section 2.1).
- [ ] Build the mobile Dashboard: Overall/Today toggle + metric cards, Inventory History summary/link, Sales Log preview + link, and navigation entries into every in-scope section (Section 2.2).

### Phase 47 — Mobile Sales (Create/Read/Update)
- [ ] Build the mobile sale-creation step flow, reusing all existing logic (Section 2.3).
- [ ] Build the mobile Sales list (card layout) with per-sale actions (Invoice/Gmail/WhatsApp).
- [ ] Build the mobile Sales edit flow, including Replace Requested / Return/Refund Requested actions.

### Phase 48 — Mobile Replacement (Create/Read/Update)
- [ ] Build the mobile Replacement Handling stepper (Section 2.4), preserving the Save Progress / Replacement Completed distinction and all existing calculation/logging logic.

### Phase 49 — Mobile Return/Refund (Create/Read/Update)
- [ ] Build the mobile Return/Refund flow (Section 2.5), including the Reason section, item verification/disposition steps, Close Ticket validation gate and inline missing-info list, and the closed-ticket banner/lock state.

### Phase 50 — Mobile Sales Log & Inventory History (Read Only)
- [ ] Build the mobile Sales Log screen with polling-based refresh and an unread indicator (Section 2.6).
- [ ] Build the mobile Inventory History screen (Section 2.7).

### Phase 51 — Mobile Profile
- [ ] Build the mobile My Profile screen with the dedicated Logout button (Section 2.8).

### Phase 52 — Audit
- [ ] Walk through the full mobile flow end-to-end on an actual narrow viewport (not just a resized desktop browser window): login → Dashboard → create a sale → mark it Return/Refund Requested → complete the Return/Refund flow → confirm the Sales Log reflects every step accurately and the unread indicator behaves correctly → check Inventory History reflects the resulting stock changes → log out from both the header icon and the Profile page.
- [ ] Confirm every out-of-scope section (Section 0's table) is genuinely unreachable from mobile navigation, while still being reachable if the app is viewed on a larger screen.
- [ ] Confirm all shared components (`<LoadingGecko />`, validation, error messaging) render correctly at mobile widths — no cut-off text, no overlapping elements.
- [ ] Update `AGENT_PROGRESS.md` with a "MOBILE MODE COMPLETE" entry.

---

## 4. Definition of Done

- All seven in-scope sections (Login, Dashboard, Sales, Replacement, Return/Refund, Sales Log, Inventory History, Profile) are fully usable on a phone-width viewport, reachable entirely through Dashboard-based navigation with a working Back control everywhere.
- Sales, Replacement, and Return/Refund support Create/Read/Update on mobile with identical underlying logic to desktop — no duplicated or diverging business rules.
- Sales Log and Inventory History are read-only on mobile, with Sales Log specifically offering a fresh, auto-updating view with an unread indicator.
- No out-of-scope section (Items, Inventory add/edit, Warehouse, Damaged Products, Admin Control Centre, Setup Wizard, Sheet Configuration, Keep Notes, Email/WhatsApp Configuration, Create New Admin) appears in mobile navigation.
- Logout is reachable from both the header icon and the dedicated Profile page button.