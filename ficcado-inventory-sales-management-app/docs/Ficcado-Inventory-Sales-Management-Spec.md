# Ficcado Inventory & Sales Management App — Specification

## 1. Overview

Ficcado needs an internal web application to manage **items, inventory, sales, returns, replacements, and warehouse stock**, used simultaneously by **multiple admins**. There is no traditional backend server or database — the entire application is a **Next.js frontend hosted on Netlify**, using **Google Sheets as the live data store** via the Google Sheets API.

> **Note on admin count:** There are currently 3 admins, but this number is expected to grow. Nothing in the app — UI layout, sheet structure, permissions, notification lists, dropdown limits, etc. — should hardcode "3 admins." The admin list is dynamic and driven entirely by the Admin Information Sheet, so adding a 4th, 5th, or Nth admin should require no code changes.

Because there is no dedicated backend, the architecture must compensate for the limitations of using spreadsheets as a database — especially around **speed, concurrency, and conflict resolution** between multiple admins editing data at the same time.

**Planned Netlify domain:** `ficcado-inventory-sales-management.netlify.app` (adjust based on final naming/availability).

---

## 2. Core Architectural Requirements

Since there's no backend/database, these constraints drive every design decision:

| Requirement | Why it matters |
|---|---|
| **No backend, no DB** | Next.js (frontend only) + Google Sheets as the sole data layer |
| **Fast performance with multiple concurrent admins** | Sheets API can be slow/rate-limited; app must feel responsive regardless of how many admins are active (currently 3, but not a fixed number) |
| **Fast multi-sheet fetching** | Several features require pulling and combining data from multiple sheets at once |
| **Full CRUD everywhere** | Every module (including the admin section itself) needs Create, Read, Update, Delete |
| **Login / logout for admins** | Basic auth layer despite no traditional backend |
| **Conflict-safe concurrent editing** | 3 admins working at once must not silently overwrite each other's changes |

### 2.1 Performance Strategy (to solve 4.1 / 4.2)
- Use **client-side caching** (e.g., SWR/React Query) with short TTLs so repeated reads don't hit the Sheets API every time.
- **Batch Google Sheets API calls** — fetch multiple ranges/sheets in a single batched request instead of one call per sheet.
- Consider a **lightweight serverless function layer** (Netlify Functions) purely as a thin proxy/cache in front of the Sheets API — this keeps "no traditional backend/DB" intact while still improving speed and hiding API keys.
- **Debounce and batch writes** where possible, rather than writing on every keystroke.
- Pre-fetch commonly needed sheets (e.g., Items list) on login so dependent dropdowns (like Warehouse item selection) are instant.

### 2.2 Admin-Effort Reduction (Prefill & Smart Defaults)

A guiding design principle across the whole app: **minimize how much an admin has to manually type.** Wherever a value can be reasonably inferred, defaulted, or auto-filled, the app should do it rather than presenting a blank form. Examples:

- **Audit fields** (Created By, Created At, Updated By, Updated At) are always auto-filled from the logged-in admin's session and the system clock — never manual entry.
- **Sequential fields** like S.No or invoice number are auto-generated/incremented, not typed.
- **Repeat-context fields**: e.g., when logging a replacement or refund against an existing invoice, the app should pull in and prefill the customer name, phone, address, and original item/size details from the source Sales record instead of asking the admin to re-enter them.
- **Dropdowns over free text** wherever the value comes from a known list (item names, sizes, warehouse locations, handler names, payment mode, status fields) so admins select instead of type.
- **Smart defaults** for status-type fields (e.g., defaulting Payment Status or Invoice Status to the most common next-state) that the admin can override if needed.
- The overarching goal: an admin should be able to complete most CRUD operations with a handful of clicks/selections rather than filling out a long form from scratch.

---

## 3. Data Model (Google Sheets)

Each of these is its own sheet/tab within the Ficcado Google Sheets account.

> **Note on audit fields:** Every "Created By," "Updated By," "Created At," and "Updated At" field throughout every sheet always refers to the **admin** who performed that action — since admins are the only users who create, read, update, or delete data in this system. These fields should be auto-populated by the app (from the logged-in admin's session and the current timestamp), not manually typed in by the admin.

### 3.1 Items Management Sheet
| Field | Notes |
|---|---|
| S.No | |
| Item Name | |
| Item Type | Shirt, T-shirt, Pants, Trousers, etc. |
| Price of Item | |
| Available Sizes | XS, S, M, L, XL |
| Created By | |
| Created At | |
| Updated By | |
| Updated At | |
| Current Status | In Stock / Out of Stock |

### 3.2 Inventory Management Sheet

**This is the single source of truth for total stock.** It holds the *combined, company-wide* quantity of every item/size, aggregated across **all** warehouses. It answers "how much of Item X, size M, do we own in total, right now, anywhere?" — it does not care which warehouse or handler physically holds it.

| Field | Notes |
|---|---|
| S.No | |
| Item Name | |
| Size | |
| Total Quantity Available | Sum across all warehouses/handlers for this item+size |
| Added By (Admin) | |
| Updated At | |
| Updated By (Admin) | |
| Created At | |

> **Relationship to Warehouse Management (see Section 6):** Inventory = the master total. Warehouse records = the breakdown of *where* that total physically sits and *who* is responsible for it. The Warehouse sheet entries for a given item+size, summed across all warehouses/handlers, should reconcile with the Inventory sheet's total for that same item+size. The app should be able to flag a mismatch (e.g., inventory says 50 units of Item X in size M exist, but warehouse records only account for 45) so admins can investigate the discrepancy.

### 3.3 Warehouse Management Sheet
| Field | Notes |
|---|---|
| S.No | |
| Warehouse Location | |
| Handler Name | |
| Items Available with Handler | |
| Size(s) of Item(s) Available with Handler | |

See **Section 6 (Warehouse Management Handler Logic)** for how items/sizes are actually captured.

### 3.4 Sales Management Sheet
| Field | Notes |
|---|---|
| S.No | |
| Invoice Number | |
| Sale Status | Purchase Satisfied / Return & Refund / Replacement Completed & Purchase Satisfied |
| Customer Name | |
| Customer Phone Number | |
| Customer Address | |
| Total Number of Items Purchased | |
| Item(s) Name(s) | |
| Size(s) Chosen | |
| Total Amount | |
| Payment Status | Paid / Not Paid / Credit |
| Mode of Payment | Cash / UPI / Card |
| Transaction ID | Only for UPI/Card |
| Created At | |
| Created By (Admin) | |
| Updated At | |
| Updated By | |

### 3.5 Replacement Management Sheet
| Field | Notes |
|---|---|
| S.No | |
| Invoice Number | |
| Total Number of Items Purchased | |
| Last Purchased Item(s) | |
| Last Purchased Item(s) Size | |
| New Item(s) | |
| New Item(s) Size | |
| Invoice Status | Replacement Pending / Replacement Completed & Purchase Satisfied |
| Created At | |
| Created By | |
| Updated At | |
| Updated By | |

### 3.6 Return / Refund Management Sheet
| Field | Notes |
|---|---|
| S.No | |
| Invoice Number | |
| Item Verification Status | No Damage / Damage Found on Returned Item(s) |
| Refund Status | |
| Refund Amount | |
| Refund Completed Date & Time | |
| Transaction ID | |
| Mode of Refund | |
| Created At | |
| Created By | |
| Updated At | |
| Updated By | |

### 3.7 Admin Information Sheet
| Field | Notes |
|---|---|
| S.No | |
| Admin Name | |
| Phone Number | |
| Email ID | |
| Notifications | |
| Created At | Set by developer |
| Created By | |
| Updated At | |
| Updated By | |

### 3.8 Keep Notes Sheet (Final Feature)
| Field | Notes |
|---|---|
| S.No | |
| Note Content | |
| Created By (Admin) | |
| Created At | |
| Updated By | |
| Updated At | |

---

## 4. Feature Modules (All Require Full CRUD)

1. **Items Details Management**
2. **Inventory Management**
3. **Sales Management**
4. **Return / Replacement Management**
5. **Admin Control Centre**
6. **Admin Login / Authentication**
7. **Warehouse Management Handler**
8. **Keep Notes** (shared/public notes among admins)

Every module above must support Create, Read, Update, and Delete — including within the Admin Control Centre itself.

---

## 5. Multi-Sheet Data Aggregation

A key requirement (point 3 in the original requirements) is the ability to **pull data from multiple sheets simultaneously and display it together** — for example:

- Viewing a sales record alongside live inventory levels for the items in that sale.
- Cross-referencing an invoice number across Sales, Replacement, and Return sheets to show a full lifecycle view of that order.
- Combining Items + Inventory + Warehouse sheets to show, per item, how much stock exists in total vs. how much is physically held at each warehouse/handler.

**Implementation approach:**
- Use the Sheets API's **batchGet** capability to retrieve multiple ranges/sheets in one network round trip.
- Normalize all fetched sheets into a shared in-memory data structure (keyed by invoice number / item name) so the UI can join/display them together without extra calls.
- Cache combined views client-side and refresh on a timer or on-demand (pull-to-refresh / refresh button), rather than re-fetching on every render.

---

## 6. Warehouse Management Handler — Detailed Logic

**Goal:** Track not just total inventory, but *who* is physically holding *how much stock, of which item, in which sizes, at which warehouse location.*

**How this differs from Inventory (Section 3.2):** Inventory is the aggregated, final-truth total across the whole company. Warehouse records are the per-location, per-handler breakdown that makes up that total. Think of Inventory as the "sum" and Warehouse as the individual "addends" — every warehouse/handler entry for an item+size should roll up into the Inventory sheet's total for that item+size.

**Example scenario:**
> Warehouse: Cochin — Handler: Arjun
> - Item "Camera Blue": XS-5, S-10, M-1, L-15, XL-11
> - Item "Eternity Black": XS-4, S-8, M-11, L-5, XL-24

**UI/UX flow for adding a warehouse record:**
1. Admin selects **Warehouse Location** and **Handler Name**.
2. Admin opens a **multi-select dropdown** populated live from the **Items Management Sheet** (only items that currently exist there).
3. For **each item selected**, a connected sub-component appears prompting the admin to enter the **quantity per available size** (XS, S, M, L, XL) that this specific handler/warehouse holds for that item.
4. On save, this expands into structured warehouse records (one logical entry per item, with a nested size→quantity breakdown) and writes to the Warehouse Management Sheet.

This structure allows the app to answer both:
- "How much total stock of Item X exists across all warehouses?" (roll-up across handlers)
- "Which handler/warehouse currently holds Item X, size M?" (drill-down by location)

---

## 7. Admin Collaboration, Versioning & Conflict Resolution

Because 3 admins can be active at once, the app needs safeguards against two admins overwriting each other's changes on stale data.

### 7.1 Versioning / Conflict Prevention
- Each row/record should carry a **version marker** (e.g., a last-updated timestamp or incrementing version number).
- Before an admin's edit is saved, the app checks whether the record's version matches what was loaded when they opened it.
- If another admin updated the same record in the meantime, the saving admin is warned ("This record was changed by [Admin] at [time] — reload before saving") rather than silently overwriting.

### 7.2 Real-Time Activity Notifications
A dedicated **activity log** (its own sheet or log table) captures every Create/Read/Update/Delete action across the app. When an admin logs in, a **notification icon** shows recent actions by other admins in plain, human-readable form, e.g.:

> "Rohith updated the Sales Management sheet on invoice number 'FIC-215' on 02/08/2026 at 5:14 PM."

This gives every admin instant visibility into what changed while they were away, keeping all three in sync without needing to manually cross-check sheets.

**Implementation notes:**
- Log entries should capture: admin name, action type (C/R/U/D), sheet/section affected, record identifier (e.g., invoice number), and timestamp.
- Read actions may be optional to log (to avoid noise) — Create/Update/Delete are the most important to surface.
- Notifications should be sorted newest-first and support "mark as read"/badge-clear behavior.

---

## 8. Admin Control Centre

- Admins can **create, update, and delete entire Google Sheets** from within the app (not just rows).
- **Sheet IDs and sheet names are fully configurable** — admins can add, change, or update which underlying Google Sheet ID / tab the app points to for each module, at any time, without a code change or redeploy. See **Section 15 (Sheet Configuration Management)** for the full mechanism — this is one of the most important requirements of the whole application.
- Investigate/support **linking or cross-referencing between sheets** (e.g., via shared invoice numbers or item names) so related data can be joined without duplicating it.
- Admins can **generate reports** for any specific date range, per section (Items, Inventory, Sales, Return, Replacement, Warehouse), on demand.

---

## 9. Reporting

### 9.1 Scheduled Daily Reports
- Reports are generated automatically and **emailed to admins at a configurable time** each day.
- The report must contain **full, detailed data** — not indexes, IDs, or relational shorthand. Every relevant field should appear directly in the report so it's readable standalone.
- Delivered as a downloadable/attached **Excel sheet**.

### 9.2 On-Demand Reports
- Any admin can pull a **current status snapshot** (e.g., current inventory levels) at any time.
- Any admin can **download a detailed report** for Inventory, Sales, Return, or Replacement data — same on-demand download capability across all sections.

### 9.3 Report Generation Requirements
- Since data lives in Sheets, exporting to Excel should be a fairly direct transform (Sheets data → formatted `.xlsx`), but must preserve full detail per row per the requirement above.
- Scheduled sends likely require a serverless scheduled function (e.g., Netlify Scheduled Functions) to trigger the export + email at the configured time, since there's no persistent backend server to run a cron job.

### 9.4 Email Sending Configuration
- Reports are sent **from `ficcado@gmail.com`**, using a Gmail **app password** (already available) rather than the account's normal login password — this allows SMTP-based sending (e.g., via Nodemailer in a Netlify Function) without OAuth complexity.
- The app password should be stored securely as an **environment variable** in Netlify (never hardcoded or committed to source), and used only server-side within the scheduled function / serverless email handler.
- Recipient list is dynamic: **all admins currently in the Admin Information Sheet** receive the report — since the admin list can grow, the email step should read recipients from that sheet at send-time rather than a fixed address list.

---

## 10. Sales-Specific Features

Within Sales Management entries, admins additionally need:
- **Generate Invoice** — produce a customer-facing invoice document from the sale record.
- **Generate Courier Slip** — produce a shipping/courier label from the same sale record (pulling customer name, address, items, etc.).

Both should pull directly from the Sales Management record so there's no duplicate manual entry.

---

## 11. Keep Notes (Shared Admin Notes)

- A dedicated **Keep Notes Sheet** stores free-form notes.
- Full CRUD: any admin can create, read, update, or delete a note.
- **Visibility:** Notes are **public to all logged-in admins** — if Admin A adds a note, Admins B and C see it immediately (similar in spirit to the activity-notification feature in Section 7.2).

---

## 12. Authentication

- Admins log in and log out. The number of admin accounts is **not fixed** — currently 3, but the system must support adding more over time without code changes (see Section 14 below).
- Login state gates access to all CRUD actions across every module, including the Admin Control Centre.
- Admin Information Sheet stores each admin's name, phone, email, and notification preferences, with creation/update metadata (initial admin records are seeded by the developer; subsequent admins are added through the in-app "Create New Admin" flow — see Section 14).

---

## 14. Admin Profile & Admin Creation

### 14.1 Admin Profile Section
- Each logged-in admin has their own **Profile section** where they can view and update their own details: name, phone number, email ID, and notification preferences.
- Profile updates write back to the Admin Information Sheet, with Updated At / Updated By auto-filled per the audit-field convention (Section 3, note).
- An admin should only be able to edit their **own** profile through this section (not other admins' profiles) — editing other admins is a separate, elevated action (see 14.2).

### 14.2 Create New Admin Section
- A dedicated section (within the Admin Control Centre) allows an existing admin to **add a new admin** to the system at any time — this is the mechanism that supports growing beyond 3 admins without any code changes.
- Creating a new admin appends a new row to the Admin Information Sheet with the required fields (name, phone, email, initial notification settings) and sets Created At / Created By to the current admin/timestamp.
- Once created, the new admin can log in immediately and appears automatically everywhere the admin list is used dynamically — notification recipient lists, report email recipients, "created/updated by" attribution options, etc.

---

## 15. Sheet Configuration Management (Critical Requirement)

**No sheet name, sheet ID, tab/range reference, or spreadsheet URL may ever be hardcoded anywhere in the application code.** Every module (Items, Inventory, Warehouse, Sales, Replacement, Return/Refund, Admin Information, Keep Notes, Activity Log) must resolve **which physical Google Sheet + tab it reads/writes** from a **runtime configuration**, not from a constant baked into the source.

### 15.1 Why this matters
- Ideas #1 and #2 from the original requirements already call for admins being able to create new Google Sheets and link them to the app, and for sheet IDs to be configurable/changeable at any time.
- This makes the app portable and resilient: if a sheet is recreated, renamed, moved to a new spreadsheet, or a new Ficcado business unit needs its own set of sheets, **no code deployment is required** — an admin simply updates the configuration through the UI.

### 15.2 Sheet Configuration Sheet/Section
A dedicated **Sheet Configuration** area (its own sheet, e.g. `SheetConfig`, plus a matching Admin Control Centre UI page) stores the live mapping used by the whole app:

| Field | Notes |
|---|---|
| Module Key | Stable internal identifier, e.g. `items`, `inventory`, `warehouse`, `sales`, `replacement`, `return_refund`, `admin_info`, `keep_notes`, `activity_log` |
| Display Name | Human-friendly label shown in the UI, e.g. "Sales Management Sheet" |
| Spreadsheet ID | The Google Sheets file ID currently backing this module |
| Tab/Sheet Name | The specific tab/range within that spreadsheet |
| Updated At / Updated By | Standard audit fields (admin + timestamp) |

- On app startup (and on a refresh interval / cache-bust), the app reads this configuration first, then uses the resolved Spreadsheet ID + Tab Name for every subsequent read/write to that module — never a hardcoded constant.
- Admins can **update, add, or repoint** any module's Spreadsheet ID / Tab Name from the Admin Control Centre at any time; changes take effect without a redeploy.
- Because the Sheet Configuration data itself has to live *somewhere* stable, it's the one exception that needs a fixed bootstrap reference (its own Spreadsheet ID/Tab), which should be supplied via an **environment variable** at deploy time rather than hardcoded in application logic — this is the single anchor point the rest of the app dynamically branches from.
- Validate new Spreadsheet ID / Tab Name entries (e.g., test-read on save) before switching the app over, so a typo doesn't silently break a module.

### 15.3 Downstream effect on all other features
- Multi-sheet aggregation (Section 5), the Warehouse↔Inventory relationship (Sections 3.2 & 6), reporting (Section 9), and the activity log (Section 7.2) must all resolve their sheet targets through this configuration layer rather than assuming a fixed ID — meaning the join/reporting logic operates on **module keys**, not literal spreadsheet IDs.

---

## 13. Summary of Key Differentiators

| Challenge | Solution |
|---|---|
| No backend/DB | Google Sheets as data store, accessed via Sheets API from Next.js |
| Slow multi-sheet reads | Batched API calls + client-side caching |
| Multiple admins editing concurrently (count not fixed) | Version-checked writes + conflict warnings, dynamic admin list |
| Staying in sync without polling everything manually | Human-readable activity notification feed |
| Warehouse stock tracking granularity | Item → size → quantity breakdown per handler/warehouse |
| Inventory vs. warehouse confusion | Inventory = aggregated master total; Warehouse = per-location breakdown that rolls up into it |
| Full-detail reporting despite relational data | Flattened, fully-detailed daily & on-demand Excel exports, sent from ficcado@gmail.com via app password |
| Shared admin communication | Public "Keep Notes" feed visible to all admins |
| Reducing admin manual effort | Auto-filled audit fields, auto-generated IDs, prefilled repeat-context data, dropdowns over free text |
| Growing the admin team over time | In-app "Create New Admin" flow + self-service Profile section — no hardcoded admin count anywhere |
| Sheet/spreadsheet reorganization over time | Runtime Sheet Configuration layer — every module resolves its Spreadsheet ID + Tab Name dynamically, editable by admins, zero hardcoded sheet references |

---

*This document consolidates the original raw requirements and ideas into a structured specification intended to guide design and development (including use as an input document for an AI coding agent).*
