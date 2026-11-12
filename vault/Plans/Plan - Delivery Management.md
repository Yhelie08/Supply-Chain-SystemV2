---
title: "Plan - Delivery Management"
tags:
  - plan
  - delivery-management
status: draft 2026-11-12, nothing started; waits for PR #3 to be merged
date: 2026-11-12
---

> [!INFO] Where this fits
> The Delivery Management part of [[Plan - Module Folders and Team Split]]. Code goes in `server/modules/delivery-management/`, tests in `tests/delivery-management/`. How to port one script: [[00 - Porting a Workflow]]. Counts come from [[00 - Port Checklist]].

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

**D1. Small validations (about 100 lines in all)**, one hook file `validations.mjs`:
- `Delivery_Scheduling`: `DS_Validate_Team_Capacity1` (30)
- `Field_Work`: `FW_Validate_Reschedule_Re` (7)
- `Service_Appointment_Form`: `SA_Scheduling_Override_Va` (24), `SA_Site_Confirmation_Vali` (15), `SA_Sync_Sales_Order_Displ` and `SA_Sync_Sales_Order_Displ1` (7 each)

**D2. The scheduling engine**
- Port `dmsScheduleSlot` as one plain function (`scheduleSlot(...)`) in `scheduling.mjs`, then expose it as the `dms_reschedule` API.
- Then the two workflows that call it: `SA_Scheduling_Engine` (287, two scripts) and `EXC_Resolve_Sync` (69).
- This is where Zoho's quirks matter most: keep them, mark them "mirrors Zoho", and compare with Zoho Development (needs the owner's OK for any write).

**D3. Requests coming in**
- `SR_Created_Make_Appointme` (185), `FW_Completion_Schedule_Sy` (191), `FW_Reschedule_To_Exceptio` (58), and `SA_Geocode_Address` (159, after the key is rotated).

**D4. Inventory APIs**
- `create_shipment_order` and `create_sales_return_books` need the Books/Inventory client (`server/books/client.mjs`, already there) and a **live check** against Books, which needs a Books OAuth client and the owner's OK. Tests use a stand-in Books, like the Procurement ones.

**D5. Wait for the forecast milestone**
- The 5 `*_Instant_Forecast` hooks and `fcStampDelivery` (191).

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
| 6 | The CMS push is skipped; decide later whether it is needed | team |
