---
title: "Change Log"
tags:
  - changelog
  - status
---

# Change log

Newest first. Current picture: [[00 - Current System]]. Deluge porting: [[00 - Port Status]].

## 2026-11-12

**Delivery Management, UAT through the API (2026-11-12):** 22 of 22 checks of the Delivery checklist pass on `npm run dev:pg` (script with a throwaway account, all test records deleted). The owner's click-through in the browser is still to do, and the go-live blockers raised in the review are listed in [[Plan - Delivery Management Open Items]] section 9.

**Delivery Management, comparison with Zoho Development and the decisions of the grilling (2026-11-12)**
- Done on Zoho Creator **Development only**, with test records marked `ZZ-CMP` that were deleted afterwards (and checked: none left). Results, and what changed in the port:
  - **Clock.** In Zoho the engine fails and writes **nothing** when the chosen team already has hours that day, unless the total comes out as whole hours: the division `ctsTotalMin / 60` is decimal ("10.3:00 AM" is not a time). Seen with 08:00 + one 2-hour job (nothing written) against 07:42 + the same job (suggestion 10:00 AM). The port uses whole minutes (10:18 AM): **a deliberate difference, and Zoho's bug.**
  - **Used hours.** The Deluge text would charge every team for every suggested job of the day; **Zoho does not** (a team with an empty day was preferred over a team with a suggested job, whichever team was created first). The first version of this port copied the text; the engine now charges a team only for its own jobs, which is what Zoho does.
  - **Scripted insert.** A record inserted by a script (the Service Request's new appointment) did **not** run its form's workflows (no `Geocode_Status`). The "run the after-add hooks by hand" step in D3a was removed.
  - **Suggestion-only edit.** Zoho accepts saving an appointment that has a suggestion but nothing confirmed (decided by the owner and confirmed by the test): the D1 rule stands.
  - **`input` on an edit** is the whole record (an edit of only the confirmed date and slot passed the Pick Up exemption), as the port assumes.
  - Hours print as "2.30 hrs", and a blank driver or fleet prints "null" ("System suggested: John Dave / null on ..."), as the port does. The capacity alert (an installer without availability) does not block a save.
  - Order: Zoho loops in ID order and its ids are not in creation order (a newer record had a smaller id); the port loops in ID order too, so ties and "first" agree.
  - Not settled: a blank value sent for a picklist on an edit is ignored by the API (the test could not clear `Confirmation_Method`).
- Decisions from the grilling (CMS stays in Zoho, files on the Railway volume, roles, one PR, forecast engine apart, who creates the keys, UAT by the owner first) are in [[Plan - Delivery Management Open Items]], which also lists everything that is still missing or unsure.
- Port Status: a module can now declare the Deluge functions it ports without a custom API (`portedFunctions` in its `index.mjs`), so the function table no longer shows `fcStampDelivery`, `upsertDmsScheduleRequest`, `addDmsScheduleRequestMessage`, `pushDmsStatusToCms`, `pushDmsMessageToCms` and `reScheduleDelivery` as not ported (14 of 43 functions). This touches `tools/` (core): for `@Yhelie08` to review.

**Delivery Management, D4 to D6: Inventory APIs, forecast stamps, the CMS link (`inventory-apis.mjs`, `forecast-stamp.mjs`, `cms-sync.mjs`)**
- **D4 `create_shipment_order`, `create_sales_return_books`:** through `ctx.books.inventory`, answering like the Deluge (`status`, `message`, `shipmentorder_no`, `salesreturn_no`, `receive_status`, `unmatched_skus`). Shipment: finds the Inventory package by sales order and package number, creates the shipment order with the 7 custom fields, marks the `Package_Shipments` row. Sales return: matches each returned SKU to an unused order line, creates the return, writes the Books ids and `SR_CREATION_STATUS = "CREATED"` back, then receives the stock; a failed receive is reported without undoing the return. The Deluge posts a string body with `invokeurl`; the client posts JSON with the ids as query parameters (to check on the live Inventory). 8 tests with a stand-in; **not run against the live Inventory**: it needs the Books OAuth client and the owner's OK. All 6 Delivery custom APIs are ported now.
- **D5 `fcStampDelivery` and the 4 `*_Instant_Forecast` workflows:** the latest forecast date of all items of all the orders in a row's sales order text is copied (with window and status; "Will Miss" wins) onto the rows of Delivery_Scheduling, Service_Request1, Service_Appointment_Form and Field_Work whose text is exactly the saved one, only when a value differs. **The forecast engine `fcStampBySoNo` (864 lines, shared) is not ported**: `forecastEngine.stampBySoNo` is empty and is skipped with one warning in the log, so these four hooks copy whatever forecast Sales_Order_Fulfillment already has. They count as ported in Port Status but depend on the forecast milestone. 9 tests.
- **D6 the CMS link:** `upsertDmsScheduleRequest` and `addDmsScheduleRequestMessage` (the CMS -> DMS direction; no caller inside Creator) are functions listed as the module's `integrations`, not custom APIs (no widget calls them and they must not be open to every signed-in user). `pushDmsStatusToCms` and `pushDmsMessageToCms` post to `CMS_STATUS_URL` / `CMS_MESSAGE_URL` from `.env` (the Creator public keys typed into the Deluge are public in git and not copied); unset means skipped, the answer the app gives today. Confirm and decline report the push status. 9 tests. **Decision for the team:** does the CMS stay? If yes, a small core PR adds an inbound route with an API key that calls the two functions.
- 357 tests in all. Port Status now: 38 of 109 workflows, **Delivery Management 16 of 16 workflows and 6 of 6 custom APIs**.
- One test file failed once at start-up during a full run (`tests/procurement/books-estimates.test.js`, 203 ms) and passed alone and in the next two full runs; it looks like a start-up race between the many PGlite instances that run in parallel, not a code problem.
- Left for Delivery Management: the click-through of the 13 tabs on `dev:pg`, the live checks (Geoapify key, Books OAuth), the files migration (core), the CMS inbound route (core). The list with owners: [[Plan - Delivery Management Open Items]].

**Delivery Management, D3: requests coming in (`service-request.mjs`, `field-work.mjs`, `geocode.mjs`)**
- **D3a `SR_Created_Make_Appointme`:** a new Service Request (the Fulfillment "To Ship" widget is the only writer) creates the Service Appointment (Queued, site Pending), keeping `Delivery_Type` only when it is one of the 8 picklist values, copies the items with PAC, adds one `Package_Shipments` row per distinct PAC (or the header split on commas), and writes `Service_Appointment_ID` and `SR_Status = "Scheduling"` back last, so a retry never doubles it. Written with the raw store, which runs no hooks. Checked on Zoho Development: a record inserted by a script does not run its form's workflows there either (the new appointment got no `Geocode_Status`), so it is geocoded at its next save. (An earlier version ran the appointment's "after add" hooks by hand; removed.)
- **D3b `FW_Reschedule_To_Exceptio`:** Reschedule Requested raises one Dispatch exception for the first appointment of that sales order and sets `Reschedule_Processed` (also when no appointment is found, as in the script).
- **D3c `FW_Completion_Schedule_Sy`:** Installation Complete completes the appointment, adds " | Actual: <start> - <end>" to its calendar summary, makes the team's pending suggestions that day start at the real end, and flags later confirmed jobs of the team as "Schedule Drift" (one exception each). An appointment of another sales order is flagged High and nothing is applied. As in the script, these exceptions are not deduplicated. The appointment gets the note but not the `[Completed]` tag, because its own workflows do not run on these writes.
- **D3d `SA_Geocode_Address`:** Geoapify lookup into `Delivery_Latitude`, `Delivery_Longitude`, `Geocode_Status`. **The Geoapify key that is typed into the Deluge (public in git) is not copied**: `GEOAPIFY_API_KEY` in `.env` (new line in `.env.example`); unset means no call and no write. Deliberate differences: the condition is read as "address set and latitude empty" (a blank is `""` here and null in Zoho), a result with no city never matches the city, and a failed call writes nothing so the next save retries. Not tested live: it waits for the rotated key.
- Tests: `service-request.test.js` (9), `field-work.test.js` (9), `geocode.test.js` (8). 331 tests in all. Port Status now: 34 of 109 workflows (Delivery Management 12 of 16).
- Left: D4 (the two Inventory APIs), D5 (forecast stamps), D6 (CMS link), then the comparison with Zoho Development.

**Delivery Management, D2c: `EXC_Resolve_Sync` (`server/modules/delivery-management/exception-queue.mjs`), which completes D2**
- After a DMS exception is saved as Resolved (or Dismissed with an appointment attached): stamps `Resolution_Date` on a Resolved one that has none; marks the appointment's `Exception_Status` Resolved; with "Revert to System" clears its suggested and confirmed dates and runs `scheduleSlot` again as a manual re-run (if there is still no room, it is flagged again and a new exception is raised); a Resolved exception of the Dispatch stage is requeued once (`Requeue_Processed`): a Priority copy of the appointment with its items goes back to Queued, the failed attempt is marked Failed.
- Kept as written ("mirrors Zoho"): the condition `Resolved || Dismissed && ref != null`, so a Resolved exception with no appointment still gets the stamp, and a Dismissed one is never requeued.
- Checked on Zoho Development: a scripted `insert into` does not run the form's workflows, so the requeue copy is written without hooks, like Zoho.
- `tests/delivery-management/exception-queue.test.js`: 8 tests. 305 tests in all. Port Status now: 30 of 109 workflows (Delivery Management 8 of 16, Custom APIs 4 of 6).
- D2 is complete. Left for Delivery Management: D3 (`SR_Created_Make_Appointme`, `FW_Completion_Schedule_Sy`, `FW_Reschedule_To_Exceptio`, `SA_Geocode_Address`), D4 (the two Inventory APIs), D5 (the forecast stamps, with the forecast milestone).

**Delivery Management, D2b: the `SA_Scheduling_Engine` workflow (`server/modules/delivery-management/scheduling-engine.mjs`)**
- The four actions of the Zoho workflow, as four "on success" hooks of Service_Appointment_Form, in Zoho's order: (1) a confirmed site with no dates runs `scheduleSlot`; (2) a confirmed date without a calendar entry: Pick Up and 3rd Party confirm at once, otherwise the override flag and stamp, the capacity check against the team's other confirmed jobs (Calendar Conflict exception, or an allowed ASAP override noted in the summary), the calendar summary and `Scheduled`; (3) `[Completed]` / `[Failed]` tag on the summary, once; (4) a Pick Up that still has an installer releases the team. Each action reads the saved input (so Action 2 does not run in the save where Action 1 wrote the dates, as the scripts say) and the record fresh; an error in one action does not skip the others.
- Quirks kept ("mirrors Zoho"): the clean-up resolves the exception when the reason is Calendar Full or Overtime Declined whether or not it is Flagged; Failed is tagged only with a calendar entry; hours print with two decimals; a blank team prints "null".
- **Deliberate difference in D1 found by these tests:** `SA_Scheduling_Override_Va` read literally refuses any save of an appointment that has a suggestion but nothing confirmed (`Confirmed != Suggested` is true when the confirmed date is empty), asking for Override By on every ordinary edit of a queued appointment. It now checks only when a confirmed date or slot is present. **Confirmed on Zoho Development: Zoho accepts such a save**, so this is the rule.
- Tests: `tests/delivery-management/scheduling-engine.test.js` (14) plus one more in `d1-workflows.test.js`; one D1 test set-up changed because the engine now writes the calendar entry on a save through the hooks. 297 tests. Port Status now: 29 of 109 workflows (Delivery Management 7 of 16).
- Not done yet: `EXC_Resolve_Sync` (D2c); not compared with Zoho Development.

**Delivery Management, D2a: the scheduling engine and the `dms_reschedule` API (`server/modules/delivery-management/scheduling.mjs`)**
- `scheduleSlot(store, recordId, isRerun)` is `dmsScheduleSlot` (521 lines of Deluge) as one function: guards (finished job, Pick Up, Flagged exception), delivery-type spellings, default job length, policies (`traffic_buffer_percent`, `max_days_scheduling_window`, workday start and end), the day-by-day team search, Calendar Full and Overtime Declined flags with one deduplicated exception, the suggestion with the start time plus the hours already used, and the Priority auto-confirm. `dms_reschedule` runs it as a re-run; Custom APIs 4 of 6 ported for Delivery Management (18 left in all).
- Quirks kept ("mirrors Zoho"): the winner test's tie clause skips the SO cap and the fit check; hours are printed with two decimals ("2.30 hrs") and a blank driver or fleet prints "null"; the server must run with `TZ=Asia/Manila` because the search starts at today's date. **Corrected after the comparison with Zoho Development (see the entry above): the used-hours criteria is NOT charged to every team in Zoho, and the clock division in Zoho is a decimal one, which this port deliberately does not copy.**
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
