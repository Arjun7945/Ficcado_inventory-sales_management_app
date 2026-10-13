# Ficcado — Design System & Brand Guide

Palette extracted directly from the uploaded logo (`20260804_093630000_iOS.jpg`) — these are real brand values, not placeholders.

---

## 1. Brand Foundation

**Mark:** A gecko, rendered as two overlapping blue silhouettes — a saturated royal-blue body/limbs shape with rounded, flower-like toe clusters, layered over a paler periwinkle tail/back curve. The negative space and posture read as a stylized letter **"F"** (for Ficcado) — a nice quiet detail worth preserving at larger sizes but not over-explaining in the UI. Wordmark: `WWW.FICCADO.STORE` set in a bold, tightly-geometric sans with wide letter-spacing, in the same royal blue, on a warm cream field.

**Personality:** Precise but not cold — the gecko's rounded paw shapes keep it approachable, while the confident diagonal posture and tight color palette (two blues + cream, nothing else) keep it feeling controlled and operational. This is the tone the app should carry: a fast, trustworthy internal tool with one small moment of personality (the loading gecko), not a playful consumer app.

### 1.1 Color Palette (extracted from logo)

| Token | Hex | Source | Role |
|---|---|---|---|
| `--color-brand-primary` | `#2B62C6` | Dark gecko body/limbs + wordmark | Primary actions, active nav, links, focus states, primary buttons |
| `--color-brand-secondary` | `#B4D1EF` | Pale gecko tail/back | Secondary accents, selected-row highlight, subtle badges, hover backgrounds |
| `--color-bg` | `#F4F0E5` | Logo background | App shell background |
| `--color-surface` | `#FFFFFF` | — (derived) | Cards, tables, modals, form panels sitting on `--color-bg` |
| `--color-ink` | `#22261E` | — (derived, warm near-black to sit well on cream) | Primary text |
| `--color-ink-muted` | `#6B6A5E` | — (derived) | Secondary text, captions, table metadata |
| `--color-border` | `#E2DCC9` | — (derived, muted cream-neutral) | Table borders, input outlines, dividers |
| `--color-success` | `#2F7D4F` | — (derived, kept outside the blue family so it reads unambiguously as "success," not "brand") | Confirmations, "saved" states |
| `--color-warning` | `#B8862B` | — (derived, warm gold sits naturally against the cream bg) | Non-blocking warnings (e.g., version conflicts, sync mismatches) |
| `--color-error` | `#B0403A` | — (derived) | Validation errors, failed actions |

**Usage notes:**
- Reserve `--color-brand-primary` for things the admin can *act on* (buttons, links, active states) so it stays meaningful rather than decorative.
- `--color-brand-secondary` (the pale blue) is the app's best background-tint color — use it for selected table rows, subtle info banners, or the notification-feed unread indicator, rather than a generic gray.
- Never place primary-blue text directly on the secondary pale-blue — contrast is too low. Pair blue accents with `--color-surface` (white) or `--color-bg` (cream).
- Keep success/warning/error strictly semantic — don't reuse them decoratively, or admins will stop trusting them as status signals.

### 1.2 Typography

- **Display/heading face:** a bold, tight, geometric sans with slightly rounded terminals — something in the family of **General Sans**, **Sora**, or **Space Grotesk** (Bold/Semibold) — to echo the wordmark's confident, tracked-out geometric feel. Use for module titles, the login screen, and the Setup Wizard headers. Set with slightly increased letter-spacing on all-caps labels (mirroring `WWW.FICCADO.STORE`), normal spacing on mixed-case headings.
- **Body/UI face:** a clean, highly legible UI sans for tables, forms, and dense data — **Inter** or **IBM Plex Sans**. This app lives or dies on how fast an admin can scan a row of numbers, so body text prioritizes clarity over character.
- **Numeric/tabular:** use `font-variant-numeric: tabular-nums` for every numeric column (quantities, amounts, invoice totals) so figures align vertically in tables.
- Avoid serif faces entirely — nothing in the mark suggests a classical/editorial register; the geometric, rounded-but-precise gecko calls for a geometric sans throughout.

### 1.3 Layout Direction

- **Data-dense, admin-tool layout** — not a marketing site. Persistent left/side navigation on `--color-surface` or `--color-bg`, clear table-first views for each module, a consistent right-side detail-panel or modal pattern for CRUD forms.
- Use the pale blue (`--color-brand-secondary`) as a quiet "you are here" signal — active nav item background, selected table row — rather than heavy borders or shadows.
- Numbered structural devices are appropriate **only** where content is genuinely sequential — e.g., the Setup Wizard's Steps 1–4, or the Sales → Replacement → Return lifecycle view. Don't apply numbered badges decoratively elsewhere (e.g., not on the Items list).
- Spend visual energy on two screens: the **login/claim screen** (first impression, home for the gecko loading animation, wordmark treatment) and the **notification/activity feed** (the app's "trust" signal — needs to read clearly at a glance, secondary-blue for unread items).

---

## 2. Signature Element: The Gecko Loading Animation

**Requirement:** Every loading state in the entire application — login submission, every CRUD save, every report generation, every sheet fetch — shows the **same branded gecko animation** in place of a generic spinner. This is the app's one clear signature moment (per the "spend your boldness in one place" design principle) — no other screen should compete with it for personality.

### 2.1 Behavior
- **Trigger:** any time the app is waiting on an async operation — Google Sheets read/write, login/claim auth check, report generation, email send confirmation, Setup Wizard test-connection steps.
- **Motion concept:** the two-tone gecko from the logo (royal-blue body over pale-blue tail) walks/scurries across the loading area in a light, quick loop (2–3 steps, seamless loop point) rather than a long narrative animation — it should read as "working," not as entertainment. Keep the loop short (roughly 1–1.5s per cycle) so it doesn't feel sluggish on fast operations. Reuse the exact two-blue palette and rounded paw-cluster silhouette from the logo — don't redesign the creature for the animation.
- **Placement:**
  - **Full-screen/blocking waits** (login/claim submit, initial app load): gecko walks across a horizontal path center-screen on the `--color-bg` cream field, echoing the logo's own composition.
  - **Inline/component waits** (saving a row, loading a table, a modal's own submit button): a small version of the same gecko walking in place (or across a short fixed track) inside the button/component — same animation, scaled down, no full-screen takeover for minor waits.
- **Consistency rule:** build this once as a single shared component (SVG or Lottie-style) with a `size` prop (`inline` / `full`) — never recreate a second loading animation elsewhere in the app.

### 2.2 Accessibility
- Respect `prefers-reduced-motion`: show a static gecko silhouette (no movement, using the logo's exact still artwork) instead of the walking animation when this is set.
- Always pair the animation with an `aria-live="polite"` text equivalent (e.g., "Loading…", "Saving…") for screen readers — the animation is decorative, not the only signal that something is happening.
- Ensure the animation doesn't block perceived responsiveness — if an operation is genuinely fast (<300ms), consider skipping the animation entirely rather than flashing it briefly, since a barely-visible flash reads as jank rather than personality.

### 2.3 Implementation Note for the Build Agent
- Build as a single `<LoadingGecko size="inline" | "full" />` component reused everywhere per Phase 8a of the implementation spec. Do not implement separate spinners for separate modules "to save time" — that defeats the point of a signature element.
- Source the still artwork directly from the uploaded logo file (two-shape SVG: royal-blue body/limbs path + pale-blue tail path) and animate via a simple walk-cycle (leg/limb offset + slight vertical bob), not a full redraw — the goal is brand consistency, not new character design.

---

## 3. Validation & Error/Exception Messaging Voice

Every failure state in the app must tell the admin **exactly what happened and, where possible, what to do about it** — never a raw error code, a silent failure, or a vague "Something went wrong."

### 3.1 Principles
- **Be specific, not generic.** "Phone number must be 10 digits" — not "Invalid input." "Couldn't reach Google Sheets — check your internet connection and try again" — not "Request failed."
- **Name the actual cause when known.** Distinguish between: a validation error (the admin typed something wrong), a permission/auth error (the service account or session lost access), a conflict error (another admin changed this record first — see spec Section 7.1), and a network/API error (Google Sheets API unreachable or rate-limited).
- **Say what to do next**, not just what went wrong, whenever there's a clear next action: "Reload this record to see the latest version" / "Check the Spreadsheet ID in Sheet Configuration" / "Try again in a moment."
- **No stack traces or raw HTTP codes in the UI.** Log the technical detail to the console/server logs for debugging, but the on-screen message is always in plain language.
- **Errors don't apologize and aren't vague.** Match the interface's voice: direct, calm, factual.

### 3.2 Examples

| Situation | Bad message | Good message |
|---|---|---|
| Required field empty | "Invalid input" | "Item name is required" |
| Phone format wrong | "Error" | "Enter a 10-digit phone number" |
| Save conflict (Section 7.1) | "Update failed" | "This invoice was updated by Rohith at 5:14 PM — reload to see the changes before saving yours" |
| Sheets API unreachable | "Network Error: 503" | "Couldn't reach Google Sheets right now. Check your connection and try again." |
| Wrong Spreadsheet ID configured | "Fetch failed" | "Can't find that spreadsheet — double check the Spreadsheet ID in Sheet Configuration for 'Sales'" |
| Email send failure | "SMTP Error" | "Couldn't send the report email — the Gmail app password may be invalid. Check Email Configuration." |

### 3.3 Where this applies
- Every form across every module (Items, Inventory, Warehouse, Sales, Replacement, Return/Refund, Admin Profile, Create Admin).
- The Setup Wizard's connection tests (Google Sheets, email) — this is the **first** thing a Superadmin sees, so it's the most important place to get this right.
- The activity notification feed, if a log entry fails to load.
- Report generation and email sending failures.

---

## 4. Handoff Checklist

- [x] Extract 4–6 real hex values from the logo — done (Section 1.1).
- [ ] Confirm palette contrast passes WCAG AA for text-on-background and button states (primary blue on cream, primary blue on white — verify during build).
- [x] Typography direction confirmed against the mark's geometric, rounded style (Section 1.2).
- [ ] Build the gecko loading component from the logo's actual SVG paths (extract/trace from the uploaded artwork; request a vector/SVG or transparent PNG version from the designer if only this flattened JPG is available, for cleaner extraction).
- [ ] Re-check every screen in the running app against the finalized palette and type scale.