---
title: "Change Log"
tags:
  - changelog
  - status
---

# Change log

Newest first. Current picture: [[00 - Current System]]. Deluge porting: [[00 - Port Status]].

## 2026-11-12

**Delivery Management, D2b: the `SA_Scheduling_Engine` workflow (`server/modules/delivery-management/scheduling-engine.mjs`)**
- The four actions of the Zoho workflow, as four "on success" hooks of Service_Appointment_Form, in Zoho's order: (1) a confirmed site with no dates runs `scheduleSlot`; (2) a confirmed date without a calendar entry: Pick Up and 3rd Party confirm at once, otherwise the override flag and stamp, the capacity check against the team's other confirmed jobs (Calendar Conflict exception, or an allowed ASAP override noted in the summary), the calendar summary and `Scheduled`; (3) `[Completed]` / `[Failed]` tag on the summary, once; (4) a Pick Up that still has an installer releases the team. Each action reads the saved input (so Action 2 does not run in the save where Action 1 wrote the dates, as the scripts say) and the record fresh; an error in one action does not skip the others.
- Quirks kept ("mirrors Zoho"): the clean-up resolves the exception when the reason is Calendar Full or Overtime Declined whether or not it is Flagged; Failed is tagged only with a calendar entry; hours print with two decimals; a blank team prints "null".
- **Deliberate difference in D1 found by these tests:** `SA_Scheduling_Override_Va` read literally refuses any save of an appointment that has a suggestion but nothing confirmed (`Confirmed != Suggested` is true when the confirmed date is empty), asking for Override By on every ordinary edit of a queued appointment. It now checks only when a confirmed date or slot is present. To confirm on Zoho Development; if Zoho does refuse, remove the one `return` line in `service-appointment.mjs`.
- Tests: `tests/delivery-management/scheduling-engine.test.js` (14) plus one more in `d1-workflows.test.js`; one D1 test set-up changed because the engine now writes the calendar entry on a save through the hooks. 297 tests. Port Status now: 29 of 109 workflows (Delivery Management 7 of 16).
- Not done yet: `EXC_Resolve_Sync` (D2c); not compared with Zoho Development.

**Delivery Management, D2a: the scheduling engine and the `dms_reschedule` API (`server/modules/delivery-management/scheduling.mjs`)**
- `scheduleSlot(store, recordId, isRerun)` is `dmsScheduleSlot` (521 lines of Deluge) as one function: guards (finished job, Pick Up, Flagged exception), delivery-type spellings, default job length, policies (`traffic_buffer_percent`, `max_days_scheduling_window`, workday start and end), the day-by-day team search, Calendar Full and Overtime Declined flags with one deduplicated exception, the suggestion with the start time plus the hours already used, and the Priority auto-confirm. `dms_reschedule` runs it as a re-run; Custom APIs 4 of 6 ported for Delivery Management (18 left in all).
- Quirks kept ("mirrors Zoho"), for the owner to decide after the comparison with Zoho Development: (1) the criteria that adds up a team's used hours has `Installer == team && Confirmed == day || Suggested == day && ...`, so by precedence every team is charged for every suggested job of the day; (2) the winner test's tie clause skips the SO cap and the fit check; (3) the clock arithmetic `total / 60` is taken as a whole-number division; (4) hours are printed with two decimals ("2.30 hrs") like the rows Zoho wrote, and a blank driver prints "null"; (5) the server must run with `TZ=Asia/Manila` because the search starts at today's date.
- Times are stored as "08:00:00 AM" (the form Zoho's time field keeps and the widgets send back); the summaries keep the engine's "8:00 AM".
- `tests/delivery-management/scheduling.test.js`: 20 tests. The first run found a real bug in the port (no Policy_Settings row made the window 0 days), fixed. Total 282 tests.
- Not done yet: the `SA_Scheduling_Engine` workflow that calls it (D2b), `EXC_Resolve_Sync` (D2c), and the comparison with Zoho Development (needs the owner's OK for test writes).

**Delivery Management, D1: the six small workflows (`server/modules/delivery-management/`, branch `feature/delivery-management`)**
- Ported 6 of the 16 Delivery Management workflows, one file per form: `service-appointment.mjs` (site confirmation check, schedule override check in Zoho's order, sales order display sync; the two `SA_Sync_Sales_Order_Displ` scripts are identical, so one hook covers both), `field-work.mjs` (reschedule reason), `delivery-scheduling.mjs` (installer availability warning). `SA_Site_Confirmation_Init` is inactive in Zoho (listed under `notNeeded`).
- Deliberate difference: `FW_Validate_Reschedule_Re` has `Status == RR && reason == null || reason == ""`; by precedence the second part refuses any empty reason, but in Zoho a blank is null so it never fires. Here a blank is `""`, so a literal port would refuse almost every Field_Work save; only the real rule (Reschedule Requested needs a reason) is ported. The Development backup has Field_Work rows with status Started and reason `""`.
- `DS_Validate_Team_Capacity1` only shows an `alert` and never cancels the save, so it cannot change an API write; it is ported as a warning in the server log. To confirm on Zoho Development that API writes ignore the alert.
- `tests/delivery-management/d1-workflows.test.js`: 13 tests on PGlite. Port Status now: 28 of 109 workflows (Delivery Management 6 of 16).
- Not done yet: the scheduling engine `dmsScheduleSlot` / `SA_Scheduling_Engine` (D2), the requests coming in (D3), the two Inventory APIs (D4), the forecast stamps (D5); not compared with Zoho Development.

**One folder per module (`server/modules/<module>/`), so the team can work without shared-file conflicts**
- `server/modules/` has a folder for each section of the app (Procurement, Tony Fan, Fenteng Lighting, Fulfillment, Delivery Management, Analytic) with `index.mjs` (label, forms, custom API map, APIs), `apis.mjs`, `ported.json` and, for Procurement, `workflows.mjs` plus the Inquiry and Purchase Request ports and the three Books APIs. `server/modules/index.mjs` finds the modules by itself and merges their APIs (a duplicate API name stops the server at start-up).
- `server/custom-apis.mjs` and `server/workflows/all.mjs` became thin; `server/custom-api-helpers.mjs` has `ok`, `fail`, `notPorted` and `withPlaceholders`. The three Delivery APIs moved to `delivery-management/apis.mjs`. `server/workflows/ported.json` is now one `ported.json` per module.
- Port Status and the Port Checklist read the modules instead of regexes and hard-coded lists. Custom APIs went from 6 of 21 to 6 of 25: `approve_po_main`, `approve_po_fenteng`, `approve_po_tony`, `Approve_P_O_H_C` (called by the Create PO button, not known to the server before) are listed as not ported; Create PO now answers "not ported yet" instead of "Unknown custom API".
- Tests moved to `tests/core/` and `tests/procurement/` (`npm test` runs `tests/**/*.test.js`); new `tests/core/modules.test.js` checks that modules load, forms and API names are not shared, and that every API name a widget calls has a handler or placeholder. 249 tests pass. `.github/CODEOWNERS` added.
- Checked on a local Postgres: an inquiry gets its number through the hooks, ported and unported APIs answer as before, and all 65 widget reports still answer.

**Procurement, Purchase Request stage (`server/workflows/purchase-request.mjs`)**
- 14 of the 20 `Purchase_Request1` workflows ported; 5 need no port (native-form only or inactive); 1 not yet: `PR1_Forecast_Stamp`, which only calls the forecast engine `fcPrToPreOrder` -> `fcStampPurchaseRequest` (458 lines, shared by the Fulfillment forecast workflows).
- The "on validate" scripts run as steps of one function in Zoho's order (number, supplier load balancing and recommended supplier, selected supplier, readiness, default status, lock after PO, shipment timeline, shipment mode, priority); "on success" hooks make the Tony and Fenteng copies, keep them in step on edit, stamp `Last_Update`, copy the item photo, and delete the copies with the PR.
- Quirks kept and tested ("mirrors Zoho"): readiness is worked out before the shipment mode is set, so a new PR is ready one save later. Reading `input.Supplier_Target_Date` in the timeline script is taken as the field `supplier_target_date`; Zoho Development has to confirm it. `PR_Export_Selected_Supplier` assigns the final price to a variable it never uses, so that part is a no-op.
- Shared code moved to `server/workflows/suppliers.mjs` (the two supplier portals, `supplierIndex`, `quoteBooksId`) and date helpers added to `deluge.mjs`. Subform numbers written by the workflows are text with two decimals, like the rows exported from Zoho.
- Port Status now: 22 of 165 form workflows.

**Procurement, Inquiry stage on the Postgres backend (Phase 3 of [[Plan - Full Migration Off Zoho Creator]])**
- Branch `feature/postgres-data-layer`, committed locally in groups, not pushed.
- `server/workflows/index.mjs`: workflow hooks (`beforeAdd`, `afterAdd`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete`) around the Postgres store; widget writes through `/api/*` run them, writes made by a hook or a custom API do not. Only "on validate" (before) and "on success" (after) events are ported, because "on load", "field rules" and "on user input" only drive Zoho's own forms.
- `server/workflows/inquiry.mjs`: 8 of the 19 `Inquiry_Form` workflows (numbering, quote rows, readiness checklist and margin, supplier copies and portal notifications, supplier sync, product image, delete cascade); 9 need no port (see `server/workflows/ported.json`). Quirks of the Deluge scripts are kept and marked "mirrors Zoho" in `tests/inquiry-workflows.test.js`.
- `server/books/client.mjs`: Zoho Books v3 / Inventory v1 client with its own OAuth refresh token (`ZOHO_BOOKS_*`), token refresh, 429 backoff, injectable fetch (tests never touch Books).
- Custom APIs ported (`server/books/apis.mjs`, `server/books/estimates.mjs`): `create_books_contact`, `add_item_by_id`, `create_estimate`. They need the Books client configured; until then they answer "Zoho Books is not configured". Two deliberate differences in `create_estimate`: an empty `quote_group` no longer matches unrelated inquiries, and a Books outage no longer clears the project's estimate id (only "not found" does).
- Port Status now: 6 of 21 custom APIs, 5 of 43 functions, 8 of 165 form workflows.
- Not verified against Zoho yet: that Zoho runs these workflows the same way (oracle comparison on Zoho Development), and any live Books call. `TONY_PORTAL_EMAIL`, `FENTENG_PORTAL_EMAIL` and `APP_BASE_URL` must be set for the supplier notifications to reach the portals.

**Postgres data layer and Zoho data export/import (Phase 1-2 of [[Plan - Full Migration Off Zoho Creator]])**
- Direction: the Creator app is no longer used (left in place), data moves to Postgres, module by module.
- `tools/export-zoho-data.mjs`: read-only backup of every form to `data/zoho-backup/` (Development: 88 of 90 forms, 3,663 rows; `Pick_Up_Request_Form` and `Shipment_Order_Form` have no readable report; 34 forms may hide columns).
- `server/model.mjs` and `server/criteria.mjs`: the form/column model and the Zoho criteria compiler, moved out of `db.mjs` so SQLite and Postgres share them (`db.mjs` re-exports them).
- `server/pg/`: `schema.mjs` (tables from the export, `ID` is BIGINT and always a string in JavaScript because Zoho IDs have 19 digits), `store.mjs` (async store: SQL filtering, paging, batched lookups), `criteria-sql.mjs` (Zoho criteria to SQL, falls back to the JS filter), `import.mjs`, `api.mjs`, `pool.mjs`. `BACKEND=pg` selects it; needs `DATABASE_URL`.
- `tools/import-zoho-backup.mjs <backup-dir> [--dry-run] [--replace] [--only=...]`: loads a backup keeping Zoho IDs, checks row counts per form, skips tables that already have rows unless `--replace`.
- `server/custom-apis.mjs` handlers are async and take the data layer as an argument; `server/index.mjs` no longer touches SQLite for file download/upload or table counts.
- Tests: `tests/pg-store.test.js` and `tests/pg-import.test.js` run on PGlite (Postgres in WebAssembly). End to end on a local Postgres through the real `pg` driver: Development backup imported, `tools/smoke-zoho-reports.mjs` 65 reports / 29 tabs with 0 failing, add/update/delete over HTTP, a 1,000-row `Items` page in about 13 ms.
- `npm run dev:pg` (`tools/dev-pg.mjs`) runs the whole app locally on PGlite kept in `data/pglite`, loading the newest `data/zoho-backup` the first time. Checked: 65 reports, 0 failing.
- Not done yet: file and image fields still hold Zoho API paths (`/api/v2.1/...`) and must be downloaded into our storage; the Railway Postgres service exists but is empty and `supply-chain-app` has no Zoho or `DATABASE_URL` variables yet.

**Zoho Backend Hybrid Integration (Option B - Cloud Front Door)**
- Generated and saved permanent OAuth Refresh Token for dedicated Zoho Service Account in `server/zoho-credentials.json` (secured via `.gitignore`).
- **Step 0 Verification PASSED:** Executed full verification in Zoho Development Sandbox:
  - `READ`: Verified reports API (`GET /creator/v2.1/data/homecartel/supply-chain-app/report/All_Suppliers`) returning sandbox data for Tony Fan and Fenteng Lighting.
  - `WRITE`: Created test record in `App_Notifications` form (`POST .../form/App_Notifications`, ID `4662244000017203019`).
  - `READ BY ID`: Retrieved newly inserted record.
  - `DELETE`: Cleaned up and deleted test record.
- **Built Zoho Adapter layer (`server/zoho/`):**
  - `auth.mjs`: Automatic OAuth access token refresh management with IPv4-first DNS configuration.
  - `limits.mjs`: 15s short-TTL cache, in-flight request deduplication, queue enforcing ≤45 req/min and ≤5 concurrent calls, and admin metrics tracker.
  - `adapter.mjs`: Standardized REST v2.1 adapter implementing `getRecords`, `getRecordById`, `addRecords`, `updateRecordById`, `updateRecords`, `deleteRecordById`, and `invokeCustomApi`.
- **Integrated with `server/index.mjs`:**
  - Added backend selector (`BACKEND=zoho` by default, `BACKEND=local` for offline SQLite fallback).
  - Added async dispatching and live `/api/metrics` endpoint.
  - Comprehensive tests in `tests/test-zoho-adapter.mjs` passing with 0ms cached retrieval time.
- **Obsidian Vault Updates:**
  - Added `vault/Actions/00 - Actions Execution & Zoho Adapter Routing.md` documenting how all 80 workflow actions route through the Zoho adapter.
  - Updated `vault/Plans/Plan - Cloud Front Door (Zoho Backend).md` with decisions on Railway users, Development environment targeting, supplier portals inclusion, and verified tests.
- Updated these Obsidian notes: added [[00 - Current System]], [[00 - Design System]], [[00 - Port Status]] (generated) and this log; the two index notes now point to them.

## 2026-11-11

**Login and hosting**
- Added sign-in with user accounts (`server/auth.mjs`) and an admin *Manage users* page. Everything now needs a signed-in user.
- Removed the Local tag, the New/Zoho design toggle and the "Signed in as" box from the header; added an account menu (change password, manage users, sign out).
- Deployed to Railway (`supply-chain-app`, volume at `/data`). Found and fixed a deploy bug: an unanchored `.railwayignore` rule dropped every `index.html`, so the main page and most widgets were missing. Replaced `railway.json` with Railway variables (Railway ends support 2026-12-01).
- Fixed a bug where the file-download route could never be reached.

**Redesign**
- Installed `impeccable`, `ui-ux-pro-max`, `design-taste-frontend`, `huashu-design`; copied `frontend-design` into the repo.
- Wrote `PRODUCT.md`; built "The Rail Network" with Impeccable (rolled direction, two review rounds, detector clean); wrote `DESIGN.md`. See [[00 - Design System]].
- Earlier in the day: a first redesign (Archivo font, brass accent, colour-temperature band) was replaced by the rail network.

**Folders and notes**
- Moved widgets into `modules/<Section>/<Tab>/` to match the section dropdown, with a README per section; copied this Obsidian vault into the repo. Pushed to GitHub as `f320e2a`.
- Deleted 34 unused one-off scripts from `tools/` (tests still 171/171).

**Running outside Zoho**
- Parsed the Zoho `.ds` export (`tools/parse-ds.mjs`): 90 forms, 94 reports, 46 pages, 43 Deluge functions, 187 workflows → `zoho-export/parsed/`.
- Built the local server (`server/`): SQLite tables from the forms, a Zoho SDK stand-in, 3 custom APIs ported (confirm / decline schedule request, CMS push skipped).
- Imported the widget source for all 6 sections and 42 tabs from the widget zips and ran them locally; checked all 45 pages in a browser, no errors.

## Install the design skills on another computer
```
npx skills add pbakaus/impeccable
npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max
npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend
npx -y skills add alchaincyf/huashu-design --skill huashu-design --agent claude-code
```
