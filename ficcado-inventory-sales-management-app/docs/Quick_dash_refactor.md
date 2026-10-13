# Ficcado — Quick Side Dash (Sidebar Navigation) Refactor
### (For the Antigravity Agent)

> **Additive, not a restart.** Builds on every prior document — the functional spec, base Implementation Spec, `part2`–`part9_of_implementation_ficcado.md`, `mobile_mode_feature.md`, and `DESIGN.md`. Treat this as **Phase 90 onward**. This refactor touches the desktop/tablet sidebar only — mobile mode already uses a completely different, Dashboard-centered navigation model (`mobile_mode_feature.md`, Section 1) and is out of scope here.

---

## 0. The Problem (from the attached screenshots)

The current sidebar has grown to roughly 20 destinations, listed flat under six section labels (Overview, Modules, Management, Reports, Records, Admin), with no grouping/collapsing — the client's own screenshots show it running well past the viewport, requiring a scrollbar just to reach items like Activity Log, Sales Log, Inventory History, Keep Notes, Admin Control, and My Profile. On top of the length problem, the icon set is inconsistent — mismatched shapes (diamonds, plain circles, generic outlines) that don't clearly signal what each item does and don't read as a cohesive, professional set.

This is a real, valid complaint, not a subjective nitpick to argue away: **a 20-item flat list is genuinely hard to scan**, and the fix isn't to remove destinations (every one of them was built for a reason across Parts 1–9) — it's to organize and present them better.

---

## 1. Design Principles for the Fix

1. **Reduce visible height without removing anything.** Every current destination stays reachable — the fix is presentation, not deletion.
2. **One consistent icon set, strictly.** Pick a single icon library/style (consistent stroke width, consistent corner treatment, consistent visual weight) and use it for every nav item — no mixing outline icons with filled ones, no icons that don't semantically match their destination.
3. **Follow `DESIGN.md` exactly** for color, spacing, and typography — active-state and hover-state treatment should use the established palette (primary blue `#2B62C6` for active/selected, pale blue `#B4D1EF` for hover/subtle highlight, the cream/ink neutrals for everything else) rather than inventing new colors for the sidebar.
4. **Keep the things admins need constantly always visible** — brand mark, Online indicator, and the account/logout footer should never require scrolling to reach, regardless of how long the middle section gets.

---

## 2. Proposed Structure — Grouped & Collapsible

Reorganize the flat list into **collapsible groups**, so only one or two groups need to be open at once instead of all 20 items being visible simultaneously:

| Group | Contains |
|---|---|
| *(ungrouped, always visible)* | Dashboard |
| **Sales & Orders** | Sales, Replacements, Returns & Refunds, Damaged Products |
| **Inventory** | Items, Inventory, Warehouse, Reconciliation |
| **Finance** | Expenses, Vendors, Profitability |
| **Customers & Comms** | Customers, Announcements |
| **Records** | Activity Log, Sales Log, Inventory History, Keep Notes |
| **Admin** | Admin Control, My Profile |

This exact grouping is a starting proposal, not a mandate carved in stone — the important requirement is the *mechanism* (collapsible groups that meaningfully shorten the default view), not this precise split. Adjust grouping if a cleaner logical split emerges during implementation, but keep every existing destination accounted for somewhere.

- Groups collapse/expand independently (accordion-style, or all-independent — either is fine, but pick one behavior and apply it consistently).
- Remember each admin's open/collapsed group state between sessions (a small per-admin UI preference, not a business-data concern — fine to store client-side/locally rather than round-tripping to Sheets for this).
- Whichever group contains the admin's **current page** should auto-expand on load, so navigating directly to, say, Profitability doesn't leave the admin looking at a collapsed "Finance" group with no visible indication of where they are.

---

## 3. Icon Requirements

- **Choose one professional, consistent icon library** (e.g., a clean outline/line-style set with uniform stroke width) and use it for literally every sidebar item — this is non-negotiable given it's one of the two specific complaints raised.
- Each icon should be **semantically obvious** — a shape that hints at the destination's function, not an abstract geometric placeholder. Suggested pairings (adjust to whatever's actually available in the chosen library, but keep the semantic intent):

| Item | Suggested Icon Concept |
|---|---|
| Dashboard | Grid/layout |
| Items | Tag or box |
| Inventory | Stacked boxes/shelf |
| Warehouse | Building/warehouse |
| Reconciliation | Balance/scale or check-matching |
| Sales | Shopping bag or receipt |
| Replacements | Swap/refresh arrows |
| Returns & Refunds | Return/undo arrow |
| Damaged Products | Warning triangle |
| Expenses | Wallet or card |
| Vendors | Handshake or people |
| Announcements | Megaphone |
| Profitability | Trending-up chart |
| Customers | People/contacts |
| Activity Log | Pulse/history clock |
| Sales Log | Receipt list |
| Inventory History | Bar chart with clock |
| Keep Notes | Note or pin |
| Admin Control | Gear or shield |
| My Profile | Person in circle |

- The notification bell and its unread-count badge (currently shown top-right of the brand header) should also be restyled to match — the badge color should come from `DESIGN.md`'s defined semantic palette (not an arbitrary red/orange that doesn't match anything else in the app).

---

## 4. Pinned Header & Footer

- **Header (always visible, never scrolls away)**: Ficcado brand mark/name, the Online indicator (Part 3/Part 5's simplified who's-online feature).
- **Footer (always visible, never scrolls away)**: logged-in admin's avatar/name/role, and the Logout button — already positioned reasonably in the current design, keep this pattern.
- Only the **middle group list** scrolls, if it ever needs to (it shouldn't, once collapsed groups shorten it enough on typical screen heights, but don't assume every admin has a tall viewport).

---

## 5. Optional but Worth Considering: Quick-Jump Search

With ~20 destinations, a simple **type-to-jump search** (a small search affordance at the top of the sidebar, or a keyboard shortcut like Ctrl/Cmd+K opening a command-palette-style search) would let an admin who already knows the app skip the group-browsing entirely and jump straight to, say, "Vendors" by typing a few letters. This is not required for this phase, but flagged as a strong candidate next step once the grouped structure above is in place, since the underlying fast-search infrastructure already exists from `part7_of_implementation_ficcado.md`.

---

## Phase Checklist

### Phase 90 — Sidebar Restructure
- [ ] Implement the collapsible group structure (Section 2), with auto-expand-on-current-page and per-admin remembered state.
- [ ] Confirm every one of the ~20 existing destinations is still reachable somewhere in the new structure — nothing silently dropped.

### Phase 91 — Icon System
- [ ] Select and apply one consistent icon library across every sidebar item (Section 3), replacing the current mismatched set.
- [ ] Restyle the notification badge to use a `DESIGN.md`-consistent color.

### Phase 92 — Pinned Header/Footer
- [ ] Confirm brand mark, Online indicator, admin footer, and Logout never scroll out of view regardless of group state or viewport height.

### Phase 93 — Audit
- [ ] Test on a shorter/laptop-height viewport specifically (the case most likely to still show scrolling) and confirm the collapsed-by-default state keeps the sidebar comfortably within view.
- [ ] Click through all ~20 destinations and confirm each correctly auto-expands its group and highlights as active.
- [ ] Confirm hover/active states use `DESIGN.md`'s palette exactly, not ad-hoc colors.
- [ ] Update `AGENT_PROGRESS.md` with a "QUICK DASH REFACTOR COMPLETE" entry.

---

## Definition of Done

- No sidebar destination was removed — every existing page from Parts 1–9 remains reachable.
- The sidebar no longer requires scrolling to reach any item on a typical laptop-height viewport, once groups are in their default (mostly collapsed) state.
- Every sidebar icon comes from one consistent, professional icon set — no mixed styles, no semantically unclear shapes.
- Brand header, Online indicator, admin footer, and Logout are always visible regardless of scroll position or group state.
- Active-page detection correctly auto-expands the relevant group and highlights the current item.