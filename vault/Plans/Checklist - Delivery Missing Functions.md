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
| Reports | 18 reports answer (22/22 API UAT) |
| Tests | 118 delivery tests |

---

# 2. Missing / needs checking

## 2.1 Code exists, but inactive without a key or URL

| # | Item | Today | How to check | Owner | Done |
|---|---|---|---|---|---|
| 1 | **Geoapify** (address coordinates) | `GEOAPIFY_API_KEY` is set in `.env`, but the value is still the **example placeholder** `a1b2...c5d6`; Geoapify answers `401 Invalid apiKey`. No latitude, longitude or `Geocode_Status` is written | Put a real key from `myprojects.geoapify.com` in `.env`, restart, save an appointment with an address, then look for lat/long | repo owner | [ ] |
| 2 | **Books/Inventory** (Shipment and Sales Return) | No OAuth client, so the answer is "Zoho Books is not configured" | Archived → **Create Shipment**; Sales Returns → **Send to Books** | repo owner | [ ] |
| 3 | **Books during Confirm** (address and items) | Confirming a Schedule Request leaves **address, contact, email and items blank**, because they should come from Books | Schedule Request with `Books_Sales_Order_ID` → Confirm → check the new appointment | repo owner | [ ] |
| 4 | **CMS push** (status and chat) | No `CMS_STATUS_URL` / `CMS_MESSAGE_URL`, so "CMS sync is off" | Confirm/Decline → `cmsPushStatus: skipped`; chat → nothing arrives | repo owner + CMS owner | [ ] |
| 5 | **Forecast engine** (`fcStampBySoNo`) | On this branch `forecastEngine.stampBySoNo = null`; the 4 Instant Forecast workflows only **copy an existing forecast** | An order with no forecast → `Forecast_Delivery` stays blank | forecast milestone | [ ] |

> [!NOTE] About the forecast
> The engine already exists on `feature/forecast-engine` (F0–F4, with `server/forecast/*` and `server/schedules.mjs`). It is not merged into `main` or `Johncel-Dev`. Once merged, new orders get a real forecast.

> [!WARNING] Geoapify key status on 2026-11-13
> The line in `.env` had been pasted twice (`GEOAPIFY_API_KEY=GEOAPIFY_API_KEY=...`); the duplicate prefix was removed, but the remaining 32-character value is only the example from the setup guide, not a real key. A live call returns `401 Invalid apiKey`. Create a real key at `https://myprojects.geoapify.com/` → project → **API Keys**, then paste only the key after `GEOAPIFY_API_KEY=`.

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
| 14 | **2 forms with no data** | `Pick_Up_Request_Form` and `Shipment_Order_Form` have no readable report | Check row counts and whether they contain data | repo owner | [ ] |
| 15 | **34 forms** | Columns may be missing if the report does not expose them | Spot-check fields against the widgets | core owner | [ ] |
| 16 | **Upstream Fulfillment** | `server/modules/fulfillment/ported.json` is empty; `check_payment_status` and `create_package_ff` are placeholders. The To Ship widget writes a Service Request directly, but the gates before it are not ported | Real SO → To Ship → Service Request; if no SR appears, do it manually for now | Fulfillment owner | [ ] |

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
| 1 | **Merge `feature/forecast-engine`** | So new orders do not silently get a blank forecast | [ ] |
| 2 | **Keys:** Geoapify and Books OAuth | Makes geocoding, shipments, returns, and address/items during Confirm work | [ ] |
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

## Stale comments in the code

Four files still say "NOT ported yet", but the feature is already ported in another file:

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
