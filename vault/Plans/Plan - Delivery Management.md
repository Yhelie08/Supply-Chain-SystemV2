---
title: "Plan - Delivery Management"
tags:
  - plan
  - delivery-management
status: D1 to D6 built and compared with Zoho Development 2026-11-12 on branch feature/delivery-management (16 of 16 workflows, 6 of 6 APIs); one PR to open; open items in Plan - Delivery Management Open Items
date: 2026-11-12
---

> [!INFO] Where this fits
> The Delivery Management part of [[Plan - Module Folders and Team Split]]. **What is still missing or unsure, decisions and the Zoho Development comparison: [[Plan - Delivery Management Open Items]].** Code goes in `server/modules/delivery-management/`, tests in `tests/delivery-management/`. How to port one script: [[00 - Porting a Workflow]]. Counts come from [[00 - Port Checklist]].

# Plan: Delivery Management

## 1. Buod (Tagalog)
- 16 na workflow at 3 custom API ang kulang (0 sa 16 ang tapos; 3 sa 6 ng API ang tapos na: confirm, decline, push to CMS).
- Ang **puso ay ang scheduling engine**: `dmsScheduleSlot` (521 linya). Tatlong bagay ang tumatawag dito: ang API na `dms_reschedule`, ang `SA_Scheduling_Engine` at ang `EXC_Resolve_Sync`. Kaya ito ang unang malaking port.
- Una ang maliliit na validation (madali, mabilis makita na gumagana), saka ang engine, saka ang pagpasok ng request, saka ang dalawang Inventory API.
- Ang 5 `*_Instant_Forecast` ay tumatawag lang sa `fcStampDelivery` (forecast engine). **Hindi ito kasama dito**; hihintayin ang forecast milestone.
- Bago mag-umpisa: i-merge muna ang PR #3, saka mag-branch ng `feature/delivery-management`.

## 2. What is in scope

| Piece | Lines | Needs | Notes |
|---|---:|---|---|
| 16 form workflows on 5 forms | see section 3 | mostly Creator data | 0 ported |
| `dms_reschedule` -> `dmsScheduleSlot` | 521 | Creator data | also used by Analytic and Fulfillment; owner is Delivery Management |
| `create_shipment_order` | 198 | Inventory | form `Shipment_Order_Form` has no readable report, so it is not in the data backup |
| `create_sales_return_books` | 261 | Inventory | `Sales_Returns_Form` has 0 rows in the Development backup |
| `SA_Geocode_Address` | 159 | Geoapify | needs the **new** key (the old one is public, see section 6) |
| 5 `*_Instant_Forecast` | 4 to 6 each | forecast engine | wait for the forecast milestone |

Already ported (in `apis.mjs`): `confirm_dms_schedule_request`, `decline_dms_schedule_request`, `push_dms_message_to_cms` (CMS push is skipped, as before).

No schedule belongs to Delivery Management except the forecast jobs; `DMS_Site_Confirmation_Fol` is inactive in Zoho (and needs email).

## 3. Order of work

**D0. Setup**
- PR #3 merged, then `git checkout main && git pull && git checkout -b feature/delivery-management`.
- Read the Deluge in `zoho-export/parsed/workflows/form/<Form>/` and `zoho-export/parsed/functions/dmsScheduleSlot.dg`.

**D1. Small validations (about 100 lines in all): DONE 2026-11-12**, one hook file per form (later pieces attach to the same forms):
- `delivery-scheduling.mjs`: `DS_Validate_Team_Capacity1` (30). Only an alert in Zoho, so it is a log-only warning.
- `field-work.mjs`: `FW_Validate_Reschedule_Re` (7). The real rule only; the empty-string part of the Deluge condition never fires in Zoho (blank is null there) and would refuse almost every save here.
- `service-appointment.mjs`: `SA_Site_Confirmation_Vali` (15), `SA_Scheduling_Override_Va` (24) in that order, and `SA_Sync_Sales_Order_Displ` / `SA_Sync_Sales_Order_Displ1` (7 each, identical, one hook).
- Tests: `tests/delivery-management/d1-workflows.test.js` (13). Result: Delivery Management 6 of 16 workflows.

**D2. The scheduling engine**
- **D2a DONE 2026-11-12:** `dmsScheduleSlot` is `scheduleSlot(...)` in `scheduling.mjs`, exposed as the `dms_reschedule` API (20 tests). The quirks it keeps are listed in the Change Log and in the header of the file.
- **D2b DONE 2026-11-12** (`scheduling-engine.mjs`, 14 tests; see the Change Log for the deliberate difference it found in D1): `SA_Scheduling_Engine`, four scripts in one workflow, on success of Service_Appointment_Form: (1) site confirmed and no dates yet: run the engine; (2) a confirmed date without a calendar entry: Pick Up and 3rd Party confirm at once, otherwise override flag, capacity check against the team's other confirmed jobs, Calendar Conflict exception or the calendar write; (3) tag the summary `[Completed]` / `[Failed]`; (4) a Pick Up with an installer is converted. It reads the saved `input`, so Action 2 does not run in the same save as Action 1 (the script says so).
- **D2c DONE 2026-11-12** (`exception-queue.mjs`, 8 tests): `EXC_Resolve_Sync` (69): resolve or dismiss syncs the appointment, "Revert to System" clears the dates and re-runs the engine, a Dispatch-stage exception requeues a copy of the appointment (with `Item_Details`) and marks the old one Failed.
- To check on Zoho Development with the owner's OK: whole-number division in the clock, the printed decimals, and whether `insert into` fires the form's workflows.
- This is where Zoho's quirks matter most: keep them, mark them "mirrors Zoho", and compare with Zoho Development (needs the owner's OK for any write).

**The rest, approved 2026-11-12 as one plan** (each piece: one file in `server/modules/delivery-management/`, tests in `tests/delivery-management/`, one commit; pushes and PRs wait for the owner's OK):

**D3a. `SR_Created_Make_Appointme` (185)**, `service-request.mjs`: the bridge from Fulfillment (the "To Ship" widget is the only writer of Service Requests). Only when `Service_Appointment_ID` is blank: creates the Service Appointment (Queued, site Pending), keeps `Delivery_Type` only if it is one of the 8 valid types, copies the items with PAC, one `Package_Shipments` row per package, writes the appointment id and `SR_Status = "Scheduling"` back (a retry never doubles it). Agree the fields with the Fulfillment owner.
**D3b. `FW_Reschedule_To_Exceptio` (58)**, `field-work.mjs`: Reschedule Requested raises a Dispatch exception for the first appointment with that sales order and sets `Reschedule_Processed`.
**D3c. `FW_Completion_Schedule_Sy` (191)**, `field-work.mjs`: Installation Complete marks the appointment Completed, appends the actual times, re-times the team's pending suggestions that day, flags later jobs as "Schedule Drift" and an SO mismatch as an exception.
**D3d. `SA_Geocode_Address` (159)**, `geocode.mjs`: Geoapify. The old key is public in git and is **not copied**; the key is `GEOAPIFY_API_KEY` in `.env`; unset means no call and no write. Live check waits for the rotated key.
**D4. Inventory APIs**, `inventory-apis.mjs`: `create_shipment_order` (198) and `create_sales_return_books` (261) through `ctx.books.inventory`; "Zoho Books is not configured" when it is off; tests use a stand-in Books; the live check needs the Books OAuth client and the owner's OK.
**D5. Forecast stamps (the delivery half)**, `forecast-stamp.mjs`: `fcStampDelivery` (192) and the 4 `*_Instant_Forecast` hooks. The engine `fcStampBySoNo` (864, shared) belongs to the forecast milestone and is an injected dependency, skipped and logged until it exists.
**D6. The CMS link (module side)**, `cms-sync.mjs`: `upsertDmsScheduleRequest` (55) and `addDmsScheduleRequestMessage` (28) as functions and custom APIs, `pushDmsStatusToCms` (13) as an outbound call to `CMS_STATUS_URL` (skipped when unset). An inbound route with an API key for the external CMS is a core PR, started only if the team decides the CMS stays.

PRs: PR 1 for D1 to D2c, PR 2 after D3, PR 3 after D4 to D6.

**Click-through checklist (on `npm run dev:pg`, with Daily Team Availability rows for the coming days):** site confirmation; the suggestion appears; approve it; override with a different slot; a conflict on a full day; Re-Schedule; complete a Field Work; resolve an exception with Revert to System; Sales Returns; Schedule Requests.

After each step: names into `server/modules/delivery-management/ported.json`, a line in [[00 - Change Log]], run `node tools/build-module-readmes.mjs && node tools/build-port-checklist.mjs`.

## 4. How we know it works
- Tests on PGlite for every hook and for `scheduleSlot` (capacity full, slot picked, reschedule, exception queue).
- The Development backup has very little Delivery data (Service_Appointment_Form 5 rows, Field_Work 3, Delivery_Scheduling 53, Service_Request1 620, DMS_Exception_Queue 3), so the engine tests need rows built by the test itself.
- Compare with Zoho Development: create the same appointment in both and compare the derived fields (see [[00 - Porting a Workflow]] section 7).
- Widgets check: open the 13 tabs on `npm run dev:pg` and use the buttons that call these APIs.

## 5. Touch points with other modules
- **Fulfillment** feeds the delivery queue (sales order data, readiness); agree on which records and fields cross the line before D3.
- **`dms_reschedule`** is also called from the Analytic and Fulfillment widgets.
- **Shared forms** `Items`, `Customer`, `Sales_Order`, `Projects`: do not change how they are stored without the core owner.
- **Books -> app sync** (sales orders and payments) is a separate piece of work, see [[Plan - Finish Procurement]].

## 6. Open items (not decided by one person)
| # | Item | Who |
|---|---|---|
| 1 | Geoapify key was public in git; needs a new key in `.env` before `SA_Geocode_Address` can be tested | repo owner |
| 2 | Books OAuth client for the live check of the two Inventory APIs | repo owner |
| 3 | OK to make test writes on Zoho Development for the engine comparison | repo owner |
| 4 | Production data for the Delivery forms (the Development rows are mostly test data) | repo owner |
| 5 | `Shipment_Order_Form` and `Pick_Up_Request_Form` have no readable report, so no backup | team |
| 6 | The CMS push is skipped; does the CMS stay, and how does it reach the new app (inbound route with an API key, a core PR)? | team |
| 7 | Files: photos, signatures and video in 9 Delivery forms (Field_Work, Service_Appointment_Form, Field_Service_Site_Visit_Form, Sales_Returns_Form, Daily_Checklist_for_Vehicle, Dispatch_Checklist, Evidence_Photos, Site_Visit_Photos, Exception_Control1) still hold Zoho paths | core owner |
| 8 | `TZ=Asia/Manila` on the server; the Custom API public key hard-coded in the Service Appointment and Service Request widgets; `CODEOWNERS` lines (needs a GitHub username) | repo owner |
| 9 | Zoho Development comparison pass (clock division, decimals, the D1 override difference, blank reason, capacity alert, `insert into` firing workflows, whole-record `input` on edit) | repo owner's OK |
