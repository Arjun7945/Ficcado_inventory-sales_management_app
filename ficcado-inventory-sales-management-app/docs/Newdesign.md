# Ficcado — NEWDESIGN.md
### Design System (Supersedes `DESIGN.md`)

> **Status: this file replaces `DESIGN.md` as the canonical design reference.** Everything from `DESIGN.md` that was working — brand palette, typography direction, the gecko loading animation, the error/validation voice — is carried forward unchanged below, so nothing is lost. What's new is a much more rigorous **responsive system**: explicit breakpoints, a real spacing/sizing scale, and per-component specifications for how every recurring UI pattern (buttons, tables, cards, badges, forms) should behave at mobile, tablet, and desktop widths. The root cause of "some sections/buttons/boxes/columns/borders don't look perfect across screen sizes" is almost always the *absence* of a system like the one below — ad-hoc spacing and sizing values scattered across screens instead of one shared scale everyone pulls from. This document is that scale.

---

## 1. Brand Foundation *(unchanged from `DESIGN.md`)*

**Mark:** A gecko, rendered as two overlapping blue silhouettes — a saturated royal-blue body/limbs shape with rounded, flower-like toe clusters, layered over a paler periwinkle tail/back curve, forming a stylized letter **"F"** in its negative space. Wordmark: `WWW.FICCADO.STORE` in a bold, tightly-geometric sans with wide letter-spacing.

**Personality:** Precise but not cold — a fast, trustworthy internal tool with one small moment of personality (the loading gecko), not a playful consumer app.

## 2. Color Palette *(unchanged — real values extracted from the logo)*

| Token | Hex | Role |
|---|---|---|
| `--color-brand-primary` | `#2B62C6` | Primary actions, active nav, links, focus states |
| `--color-brand-secondary` | `#B4D1EF` | Secondary accents, selected-row highlight, hover backgrounds |
| `--color-bg` | `#F4F0E5` | App shell background |
| `--color-surface` | `#FFFFFF` | Cards, tables, modals, form panels |
| `--color-ink` | `#22261E` | Primary text |
| `--color-ink-muted` | `#6B6A5E` | Secondary text, captions |
| `--color-border` | `#E2DCC9` | Table borders, input outlines, dividers — the **only** border color used anywhere in the app |
| `--color-success` | `#2F7D4F` | Confirmations, "saved" states, positive status pills |
| `--color-warning` | `#B8862B` | Non-blocking warnings, pending-state pills |
| `--color-error` | `#B0403A` | Validation errors, failed actions, destructive-state pills |

## 3. Typography *(direction unchanged, now with an explicit responsive scale)*

- **Display/heading**: geometric sans with rounded terminals (General Sans / Sora / Space Grotesk, Bold/Semibold).
- **Body/UI**: Inter or IBM Plex Sans.
- **Numeric/tabular**: `font-variant-numeric: tabular-nums` on every numeric column, everywhere, on every breakpoint.

**Type scale** (one shared scale — every screen pulls from this, never a bespoke font-size):

| Token | Desktop | Tablet | Mobile | Use |
|---|---|---|---|---|
| `--text-h1` | 24px | 22px | 20px | Page titles |
| `--text-h2` | 18px | 17px | 16px | Section headers |
| `--text-body` | 14px | 13.5px | 13px | Default body/table text |
| `--text-caption` | 12px | 12px | 11.5px | Muted captions, timestamps, helper text |
| `--text-label` | 11px, uppercase, 0.07em tracking | same | same | Section/group labels (e.g., sidebar group labels, table column headers) |

Line-height: 1.5 for body text, 1.2 for headings, at every breakpoint.

---

## 4. Spacing & Sizing System *(new)*

**Spacing scale** — an 8px base unit, used for every margin, padding, and gap in the application. No arbitrary pixel values (e.g., no stray `13px` or `22px` padding) — always one of these:

`--space-1: 4px` · `--space-2: 8px` · `--space-3: 12px` · `--space-4: 16px` · `--space-5: 20px` · `--space-6: 24px` · `--space-8: 32px` · `--space-10: 40px` · `--space-12: 48px`

**Border radius scale**:

`--radius-sm: 6px` (inputs, small buttons, badges' inner elements) · `--radius-md: 10px` (buttons, form fields) · `--radius-lg: 14px` (cards, modals, panels) · `--radius-full: 999px` (status pills, avatars)

**Border width**: `1px` everywhere, always `--color-border` (Section 2), except the deliberate `2px` **focus ring** on interactive elements (input focus, button focus) using `--color-brand-primary` at 40% opacity — this is the *only* place border width or color deviates from the default.

**Elevation (shadow) scale** — used instead of heavier borders to indicate "this sits above the page":

| Token | Value | Use |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(34,38,30,0.06)` | Cards resting on the page |
| `--shadow-md` | `0 4px 12px rgba(34,38,30,0.10)` | Dropdowns, popovers |
| `--shadow-lg` | `0 12px 32px rgba(34,38,30,0.16)` | Modals, the mobile detail-panel sheet |

---

## 5. Breakpoints *(new — the definitions every other document in this project has been assuming; now made explicit)*

| Breakpoint | Range | Notes |
|---|---|---|
| **Mobile** | `< 768px` | Matches `mobile_mode_feature.md`'s scope exactly — only the sections defined there appear here |
| **Tablet** | `768px – 1199px` | The breakpoint `part6_of_implementation_ficcado.md`'s audit targeted — full feature set, adapted layout |
| **Desktop** | `≥ 1200px` | Full layout, full sidebar (per `Quick_dash_refactor.md`) |

Every component specification below states its behavior at all three explicitly — "looks fine on desktop, untested on tablet" is exactly the gap that caused the original complaint.

---

## 6. Responsive Layout Rules

- **Sidebar** (desktop/tablet only, per `Quick_dash_refactor.md`): fixed 250px width on desktop; on tablet, either the same width if space allows or a collapsible icon-only rail (pick one, apply consistently) — never let it consume more than ~30% of a tablet viewport's width.
- **Content container**: max-width `1400px` on desktop (centered, with `--space-8` side padding beyond that), fluid with `--space-6` side padding on tablet, fluid with `--space-4` side padding on mobile.
- **Grid/column layouts** (e.g., Dashboard's metric cards, Profitability's summary boxes): 4 columns on desktop, 2 columns on tablet, 1 column (stacked) on mobile — as a default pattern; a component spec below may override this where noted.

---

## 7. Component Specifications

### 7.1 Buttons
| Property | Desktop | Tablet | Mobile |
|---|---|---|---|
| Height | 36px | 38px | 44px (minimum touch target) |
| Padding | `--space-2` `--space-4` | same | `--space-3` `--space-4` |
| Radius | `--radius-md` | same | same |
| Icon + label gap | `--space-2` | same | same |

Variants: **Primary** (`--color-brand-primary` fill, white text), **Secondary** (white fill, `--color-border` outline, `--color-ink` text), **Destructive** (`--color-error` fill or outline, per context), **Ghost** (no fill/border, used for low-emphasis actions like "Cancel"). Every button in the app maps to exactly one of these four — no bespoke one-off button styles.

### 7.2 Form Inputs (text fields, selects, textareas)
- Height: 36px desktop/tablet, 44px mobile (matching button touch targets).
- Padding: `--space-2` `--space-3`.
- Border: `1px solid var(--color-border)`, radius `--radius-md`.
- Focus state: the 2px brand-primary focus ring (Section 4) — consistent everywhere, no browser-default focus outline leaking through anywhere.
- Label: `--text-caption`, `--color-ink-muted`, positioned above the field with `--space-1` gap — never inline/floating labels, for consistency across this many forms.

### 7.3 Cards / Panels
- Background `--color-surface`, radius `--radius-lg`, shadow `--shadow-sm`, padding `--space-4` mobile / `--space-5` tablet / `--space-6` desktop.
- No border by default (shadow alone implies elevation) — only add a `1px --color-border` outline where a card sits directly against another white surface with no background contrast to separate them (e.g., a card inside a modal).

### 7.4 Status Badges/Pills
Used constantly across this app (In Stock/Out of Stock, Paid/Refunded/Pending, every Replacement/Return status, Delivery Status, etc.) — this is very likely one of the "boxes that don't look perfect" the client meant, since a dozen features each introduced their own badge over time.
- Fixed height 22px, `--radius-full`, padding `--space-1` `--space-3`, `--text-caption` weight 600.
- Color mapping, no exceptions: green family (`--color-success` text on a light tint of the same) for positive/completed states, gold family (`--color-warning`) for pending/in-progress states, red family (`--color-error`) for failed/blocked/refunded states, brand-blue-tint (`--color-brand-secondary` background, `--color-brand-primary` text) for neutral/informational states (e.g., "Not Received — In Transit").
- Every status enum across every module (Sales Status, Delivery Status, Payment Status, Refund Status, Item Verification Status, Replacement/Return status progressions) maps its values to this same four-family system — audit every existing badge against this mapping, since badges built at different points in the project (Parts 1 through 10) were not necessarily using the same rule.

### 7.5 Tables — the Core Fix

Tables are the single hardest thing to get right across three breakpoints, and this app has many of them (Sales, Items, Inventory, Warehouse, Replacement, Return/Refund, Damaged Products, Expenses, Vendors, Customers, Activity Log, Sales Log, Inventory History, Payment Transactions). One consistent strategy, applied everywhere:

- **Desktop**: full table, every column visible, `1px --color-border` row dividers only (no vertical column borders — a cleaner, less noisy look), header row in `--text-label` style with a `--color-bg`-tinted background, sticky header on scroll for long lists.
- **Tablet**: assign every column a priority tier when the table is built — **P1** (always visible: the 2–3 columns that identify the row, e.g., Invoice #, Customer, Amount), **P2** (hidden at tablet width, revealed via a row-expand or a "view details" action), **P3** (desktop-only, e.g., audit metadata like Created By). This is a judgment call per table — the point is every table author makes this call *deliberately*, not "whatever fits by accident."
- **Mobile**: switch to a **card-per-row layout** (already established for Sales in `mobile_mode_feature.md`, Section 2.3 — apply the same pattern to every other in-scope mobile table) — each row becomes a compact card showing its P1 fields prominently, with a tap-through to full detail for everything else. Never render a literal `<table>` element squeezed into a mobile viewport with horizontal scroll — that's the exact pattern that reads as "not perfect."

### 7.6 Modals / Detail Panels
- Desktop/tablet: centered modal, max-width 560px (small forms) or 800px (detail panels like the Payment Transactions detail view), `--shadow-lg`, `--radius-lg`.
- Mobile: full-screen or bottom-sheet-style panel (slides up, occupies full width, rounded top corners only) rather than a small centered modal that would feel cramped — matches the "detail panel" pattern already used in `mobile_mode_feature.md`.

### 7.7 Toasts / Inline Error & Success Messages
Follow `DESIGN.md`'s existing voice rules (Section 10 below) for *wording*; visually: `--radius-md`, `--space-3` padding, left-edge 3px color bar (not full-background fill) in the relevant semantic color, positioned top-right on desktop/tablet and full-width-anchored-to-top on mobile.

---

## 8. Icon System

One consistent icon library across the **entire application**, not just the sidebar (`Quick_dash_refactor.md`'s Section 3 already established this rule for navigation — this extends it everywhere: table action icons, form field icons, status icons, empty-state illustrations). Uniform stroke width, uniform corner treatment, uniform sizing per context: 16px inline-with-text, 20px standalone buttons, 24px empty states/large illustrations.

---

## 9. Gecko Loading Animation *(unchanged from `DESIGN.md`)*

Every loading state uses the shared `<LoadingGecko size="inline" | "full" />` component — full-screen for page-level waits, inline/scaled-down for component-level waits (a button's own loading state, a table refreshing). Respects `prefers-reduced-motion` (static mark instead of the walk-cycle). See `DESIGN.md`'s original Section 2 for the full animation-behavior spec — carried forward unchanged.

## 10. Validation & Error Messaging Voice *(unchanged from `DESIGN.md`)*

Specific, plain-language, names the actual cause, says what to do next, never a raw error code or a vague "Something went wrong." See `DESIGN.md`'s original Section 3 for the full bad-vs-good examples table — carried forward unchanged.

---

## 11. Component Audit Checklist

Use this to check any existing screen against this system — a screen is "perfect" per this document only when every applicable line below is true for it:

- [ ] Every spacing value on the screen is one of the Section 4 spacing tokens — no arbitrary pixel values.
- [ ] Every border is `1px solid var(--color-border)` except the brand-primary focus ring.
- [ ] Every button matches one of the four variants in Section 7.1, at the correct height for the current breakpoint.
- [ ] Every form input matches Section 7.2 exactly, including the focus ring.
- [ ] Every card/panel uses shadow-based elevation (Section 7.3), not a heavy border.
- [ ] Every status badge maps to the four-family color system in Section 7.4 — no one-off badge colors.
- [ ] Every table follows the P1/P2/P3 tablet strategy and the card-per-row mobile strategy (Section 7.5) — no horizontally-scrolling cramped tables on mobile.
- [ ] Every modal/panel follows the correct desktop vs. mobile treatment (Section 7.6).
- [ ] Every icon on the screen comes from the one chosen library, at the correct size for its context (Section 8).
- [ ] Loading and error states use the shared components (Sections 9–10), not ad-hoc equivalents.

---

## 12. Migration & Implementation

This supersedes `DESIGN.md` immediately — treat this as **Phase 102 onward**, continuing from `part10_of_implementation_ficcado.md`.

### Phase 102 — Design Tokens
- [ ] Implement every token from Sections 2–4 (color, type scale, spacing, radius, shadow) as shared CSS variables/design tokens, replacing any hardcoded equivalent values already in the codebase.

### Phase 103 — Component Library Pass
- [ ] Rebuild (or refactor in place) the shared Button, Input, Card, Badge, Modal/Panel, and Toast components to exactly match Sections 7.1–7.7 — these should be the *only* implementations of each, reused everywhere, per this project's long-standing "one shared component" principle.

### Phase 104 — Table Strategy Rollout
- [ ] Apply Section 7.5's P1/P2/P3 tablet strategy and card-per-row mobile strategy to every table in the application, module by module — this is the single highest-effort item in this document and the most likely source of the original complaint, given how many tables this app has accumulated across ten parts.

### Phase 105 — Full-Application Audit
- [ ] Walk every screen in the application, at all three breakpoints, against the Section 11 checklist — not a sample, every screen, the same discipline already established in `part6_of_implementation_ficcado.md`'s tablet audit and `Ficcado-Production-Readiness-Audit-Protocol.md`.
- [ ] Log findings per screen in `AGENT_PROGRESS.md`, and fix every violation found.
- [ ] Update `AGENT_PROGRESS.md` with a "NEWDESIGN.MD MIGRATION COMPLETE" entry once every screen passes.

---

## Definition of Done

- `DESIGN.md`'s original content (palette, typography direction, gecko animation, error voice) is fully preserved and still accurate — nothing was lost in the transition to this file.
- No spacing, border, radius, or shadow value in the codebase falls outside the tokens defined in Section 4.
- Every table in the application follows the same tablet column-priority and mobile card-per-row strategy — no table is a special case left behind.
- Every status badge across every module uses the same four-family color mapping.
- Every screen has been checked against the Section 11 checklist at all three breakpoints, with results logged.