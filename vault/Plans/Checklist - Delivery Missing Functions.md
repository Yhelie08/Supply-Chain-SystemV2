---
title: "Checklist - Delivery Missing Functions"
tags:
  - plan
  - delivery-management
  - checklist
  - open-items
status: open — every item needs a check or a decision
date: 2026-11-13
---

> [!INFO] Where this fits
> The working checklist of what is still missing in Delivery Management: what is only waiting for a key or URL, what has no code yet, what is a data or deployment gap, and what to click on each tab. Built from the code on `Johncel-Dev` (which already includes `feature/delivery-safety`) and from [[00 - Port Status]], [[00 - Current System]], [[Plan - Delivery Management]] and [[Plan - Delivery Management Open Items]]. The decisions still waiting: [[Open Decisions - Delivery Management]]. The one signed decision: [[Decision - Delivery Clock Divergence]]. What was already done: [[Progress - Delivery Safety]].

# Delivery Management — Missing Functionality Checklist

- **Date:** 2026-11-13
- **Branch read:** `Johncel-Dev` (includes `feature/delivery-safety` and the UI redesign)
- **Short answer:** the **logic** is complete (16 of 16 workflows, 6 of 6 custom APIs, 118 delivery tests). What is missing is mostly **connections, permissions and data** — not the flow itself.

## How to use this file

- Every item has a checkbox. Tick it once it has been checked.
- **"Code exists, no key"** is not a bug — it only needs a key or a URL.
- **"No code yet"** is genuinely missing; it needs an owner.
- **"Data and deployment"** is not code; it is setup and migration.

---

# 1. Already complete (verified in code)

| Item | Status |
|---|---|
| 16 workflows | All registered: 7 on Service Appointment, 4 on Field Work, 2 on Service Request, 1 on Exception Queue, 2 on Delivery Scheduling |
| 6 custom APIs | Confirm, Decline, Reschedule, Push message, Shipment, Sales Return |
| Confirm once + scheduling queue | On `feature/delivery-safety` (9 tests) |
| Tabs | 12 visible + 1 hidden (Policy Settings) in `server/pages.json` |
| Reports | 20 reports are read by the tabs; all exist in the parsed model (22/22 API UAT) |
| Tests | 118 delivery tests |

## Verified on 2026-11-13: what is not missing

A deeper pass over the 13 tabs, the widget code and the parsed Zoho export found **no missing Delivery-owned workflow, custom API or report**:

| Check | Result |
|---|---|
| Form workflows | 16/16 registered and covered in `ported.json` |
| Reports read by the tabs | 20/20 exist in `zoho-export/parsed/reports.json` and resolve to a form |
| Forms written by the tabs | 13/13 exist in the parsed model |
| Custom APIs called by the tabs | 6/6 implemented in `server/modules/delivery-management/apis.mjs` |
| Zoho SDK calls used by the widgets | every method used is in `server/public/zoho-shim.js` |
| Criteria strings | all simple criteria used by the widgets compile with `server/criteria.mjs` |
| Report button `Re_Schedule` | 2-line wrapper of `dmsScheduleSlot`; the widget's Re-Schedule button already calls `dms_reschedule`, so no separate port is needed |
| Schedule `DMS_Site_Confirmation_Fol` | inactive in Zoho and skipped by decision A3; only needed if the follow-up is turned back on (needs email + a schedule runner) |
| Schedules `Shipment_Delay_Status_Daily`, `Daily_Shipment_10_Day_Check` | update `Shipments`, not Delivery |
| Forms `Pick_Up_Request_Form`, `Shipment_Order_Form` | not read or written by any Delivery widget — not a Delivery gap |

> The remaining gaps are therefore the cross-module, credential, data and platform items below — not missing Delivery logic.

---

# 2. Missing / needs checking

## 2.1 Code exists, but inactive without a key or URL

| # | Item | Today | How to check | Owner | Done |
|---|---|---|---|---|---|
| 1 | **Geoapify** (address coordinates) | **Working since 2026-11-13.** A live call returns `200`; the geocode hook writes `Delivery_Latitude`, `Delivery_Longitude` and `Geocode_Status: Success` for a Makati address | Save one appointment with an address in the browser and confirm the three fields (the last click-through) | repo owner | [x] |
| 2 | **Books/Inventory** (Shipment and Sales Return) | No OAuth client, so the answer is "Zoho Books is not configured" | Archived → **Create Shipment**; Sales Returns → **Send to Books** | repo owner | [ ] |
| 3 | **Books during Confirm** (address and items) | Confirming a Schedule Request leaves **address, contact, email and items blank**, because they should come from Books | Schedule Request with `Books_Sales_Order_ID` → Confirm → check the new appointment | repo owner | [ ] |
| 4 | **CMS push** (status and chat) | No `CMS_STATUS_URL` / `CMS_MESSAGE_URL`, so "CMS sync is off" | Confirm/Decline → `cmsPushStatus: skipped`; chat → nothing arrives | repo owner + CMS owner | [ ] |
| 5 | **Forecast engine** (`fcStampBySoNo`) | **Merged 2026-11-13.** `forecastEngine.stampBySoNo` now calls `fcStampBySoNo`; new orders get a real forecast instead of staying blank | Save a Delivery row for an SO with no forecast → `Forecast_Delivery` / `Forecast_Window` / `Forecast_Status` are filled | — | [x] |

> [!NOTE] About the forecast
> `feature/forecast-engine` (F0–F4, `server/forecast/*` and `server/schedules.mjs`) is merged into `Johncel-Dev` as `b09d605`. Forecast tests pass **88/88**, Delivery **118/118**, full suite **434/434**. `SCHEDULES` stays off by default, so the daily `Forecast_Stamp_Daily` runner only starts with `SCHEDULES=on`.

> [!NOTE] Geoapify key status on 2026-11-13
> The duplicate prefix was removed and a real key was added. Tested live: `Ayala Avenue, Makati` → `14.5575225, 121.0198889` (`Success`). The key stays in `.env` only; it is not committed or written into this note.

## 2.2 No code yet

| # | Item | Effect | How to check | Owner | Done |
|---|---|---|---|---|---|
| 6 | **CMS → app route** | Nothing receives a new Schedule Request; `upsertDmsScheduleRequest` and `addDmsScheduleRequestMessage` have no caller (they are only listed under `integrations`, with no route) | Create a request in the CMS → nothing should appear in Schedule Requests | core owner | [ ] |
| 7 | **Roles/permissions** | Only admin and user exist. No Scheduler/Dispatcher/Field role. The hidden Policy Settings page is **open by URL** to any signed-in user | Sign in as a normal user → open `/w/Delivery Management/Policy Settings/index.html` | core owner | [ ] |
| 8 | **Files migration** | Old photos, signatures and videos still point at Zoho paths; `readFile` only serves local `/uploads/` | Open an old Field Work photo or signature → 404/blank | core owner | [ ] |
| 9 | **Email/SMS** | No mailer. The site follow-up (`DMS_Site_Confirmation_Fol`) is inactive in Zoho and was skipped by decision | No email after site confirmation | Delivery owner (docs) | [ ] |
| 10 | **Audit trail** | Only `Added_User` and `Added_Time`; no "who edited what" | Edit a record → no change history | core owner | [ ] |
| 11 | **Multi-instance lock** | The queue works inside **one server process** only | With two instances, simultaneous confirms are no longer serialized | core owner | [ ] |

## 2.3 Data and deployment

| # | Item | Today | How to check | Owner | Done |
|---|---|---|---|---|---|
| 12 | **Production export** | Development backup only (test data: 5 appointments, 3 field work) | Compare row counts with Production | repo owner | [ ] |
| 13 | **Railway** | The deployed branch (`main`) defaults to `BACKEND=zoho`; `Johncel-Dev` defaults to `local`. Railway has no `DATABASE_URL`, `TZ` or `SCHEDULES`, so **the live site is still a bridge to Zoho**, not Postgres | Admin account menu → does it say "Data: Postgres"? If not, it is still the bridge | repo owner | [ ] |
| 14 | **`Pick_Up_Request_Form` / `Shipment_Order_Form`** | Not a Delivery gap: no Delivery widget reads or writes these forms. They belong to another module or are unused | Search the Delivery widgets for the names — zero hits | — | [x] |
| 15 | **App-wide column check** | The "34 forms may have missing columns" gap is app-wide, not Delivery-specific; every report and form name used by the Delivery tabs resolves in the parsed model | A spot-check is still useful before the Production import | core owner | [ ] |
| 16 | **Upstream Fulfillment** | `SO_to_Readiness` and `Release_Records_to_Pick1` are active and not ported; `create_package_ff` and `check_payment_status` are still placeholders. The forecast workflows (`GATE_Instant_Forecast`, `SOF_Instant_Forecast`) came with the engine merge. Delivery reads `Sales_Order_Fulfillment_Report`, `Sales_Order_Readiness_Gate_Report` and `Exception_Control_Report` | Real SO → To Ship → Service Request; if the readiness gate data is stale, the Delivery tabs read stale rows | Fulfillment owner | [ ] |

### 2.4 Data gaps in the Development backup

These Delivery forms have **0 rows** in `data/zoho-backup/development-2026-11-12T02-40-55-902Z`, so their tabs open but show an empty list. This is data, not missing code:

| Form | Tab |
|---|---|
| `Daily_Checklist_for_Vehicle` | Truck Maintenance |
| `Fuel_Entries` | Truck Maintenance |
| `Service_Entries` | Truck Maintenance |
| `Dispatch_Checklist` | Service Appointment |
| `Sales_Returns_Form` | Sales Returns |
| `Field_Service_Site_Visit_Form` | Field Service Site Visits |
| `Site_Visit_Photos` | Field Service Site Visits |
| `DMS_Schedule_Request_Messages` | Schedule Requests (chat) |

> The Production export should replace these empty tables. Until then, create a few test rows before clicking through those tabs.

---

# 3. Checklist per tab (13)

| Tab | What to click | Expected | Blocker | Done |
|---|---|---|---|---|
| **Delivery Analytics** | Refresh | Counters come back | Data | [ ] |
| **Daily Team Availability** | Generate Month, Add, toggle | Teams are added | — | [ ] |
| **Initial Scheduling** | Set initial date, Hand off | Moves to Service Request | — | [ ] |
| **Service Request** | New request, Mark site confirmed | Method + notes required; a suggestion appears | — | [ ] |
| **Service Appointment** | Review, Approve, Override, Re-Schedule, Calendar | Suggestion, conflict, override reason | — | [ ] |
| **Ongoing Service** | Save Field Work, Complete, Fail | Completed/Failed, exception created | — | [ ] |
| **Archived** | Create Shipment, Create Sales Return | Shipment/Return in Books | **Books** | [ ] |
| **Field Service Site Visits** | Save Changes | Site ready/notes saved | — | [ ] |
| **Sales Returns** | Send to Books | Return + stock received | **Books** | [ ] |
| **DMS Exception Queue** | Start, Resolve, Dismiss, Revert to System | New suggestion | — | [ ] |
| **Truck Maintenance** | Add Checklist, fuel/service entry, signature | Saved; signature upload works | Files | [ ] |
| **Schedule Requests** | Confirm, Decline, chat | Appointment created; CMS status pushed | **CMS** | [ ] |
| **Policy Settings** (hidden) | Edit the 4 numbers | Engine uses them | **Roles** | [ ] |

## The 4 numbers in Policy Settings

| Key | Used by the engine for |
|---|---|
| `traffic_buffer_percent` | Extra time added to every job |
| `max_days_scheduling_window` | How many days ahead the slot search looks |
| `workday_start_time` | Start of the workday (also the overtime threshold) |
| `workday_end_time` | End of the workday |

---

# 4. Recommended order

| # | Do this | Why | Done |
|---|---|---|---|
| 1 | **Merge `feature/forecast-engine`** | So new orders do not silently get a blank forecast | [x] `b09d605` |
| 2 | **Books OAuth** (Geoapify is done) | Makes shipments, returns, and address/items during Confirm work | [ ] |
| 3 | **CMS decision:** inbound route (core PR) or read-only + banner first | Gives the Schedule Requests tab a purpose | [ ] |
| 4 | **Files migration:** one-time download from Zoho to the volume | Old photos and signatures become readable | [ ] |
| 5 | **Roles:** per-role access (core work) | Covers Policy Settings and the Scheduler/Dispatcher/Field roles | [ ] |
| 6 | **Production export** and **Railway `BACKEND=pg` + `TZ`** | Before the real UAT | [ ] |
| 7 | **Owner click-through of all 13 tabs** | Still not done; the 22/22 was API-level only | [ ] |

---

# 5. Notes about Obsidian

> [!WARNING] The 12 page notes describe the old prototype
> `vault/Modules/Delivery Management/*.md` (Delivery Analytics, Service Appointment, etc.) describes the **old React prototype** in `src/pages/delivery/`, which is why the status says "built, not yet at parity". The real app today is the **original Zoho widgets** in `modules/Delivery Management/*/app/`.

The real sources of truth:

- [[00 - Port Status]] — how many pieces are ported
- [[00 - Current System]] — how the app runs
- [[Plan - Delivery Management Open Items]] — the full open-items list
- This file — the checklist to work through

## Stale comments in the code (fixed 2026-11-13)

Four files used to say "NOT ported yet", but the feature was already ported in another file. The comments now point to the right file:

| File | Comment | Actual status |
|---|---|---|
| `server/modules/delivery-management/service-appointment.mjs` | "NOT ported yet: SA_Scheduling_Engine and SA_Geocode_Address …" | In `scheduling-engine.mjs` and `geocode.mjs` |
| `server/modules/delivery-management/delivery-scheduling.mjs` | "NOT ported yet: ISCHED_Instant_Forecast" | In `forecast-stamp.mjs` |
| `server/modules/delivery-management/field-work.mjs` | "NOT ported yet: FW_Instant_Forecast" | In `forecast-stamp.mjs` |
| `server/modules/delivery-management/service-request.mjs` | "NOT ported yet: SR_Instant_Forecast" | In `forecast-stamp.mjs` |

Small to fix, but confusing for the next reader.

---

# 6. What is not covered here

The decisions still waiting (CMS scope, Schedule Requests display, site follow-up, widget ownership, data contract) are in [[Open Decisions - Delivery Management]]. The clock decision is in [[Decision - Delivery Clock Divergence]].
