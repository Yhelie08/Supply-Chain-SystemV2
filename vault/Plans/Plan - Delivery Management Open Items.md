---
title: "Plan - Delivery Management Open Items"
tags:
  - plan
  - delivery-management
  - open-items
status: written 2026-11-12 after the grilling and the comparison with Zoho Development; items open until marked done
date: 2026-11-12
---

> [!INFO] Where this fits
> What is still missing or unsure in Delivery Management, who owns it, and what was decided. The build plan and what is ported: [[Plan - Delivery Management]]. What changed, step by step: [[00 - Change Log]]. How the module split works: [[Plan - Module Folders and Team Split]].

# Delivery Management: open items and decisions

## 1. Buod (Tagalog)
- **Tapos na sa code:** 16 sa 16 na workflow at 6 sa 6 na custom API ng Delivery, 357+ na test.
- **Hindi pa tapos o hindi pa tiyak** ay nakalista sa seksyon 4, bawat isa ay may may-ari. Ang pinakamalaki: ang forecast engine (hiwalay na milestone), ang CMS (mananatili sa Zoho, kailangan ng papasok na route), ang mga file (Railway volume), ang mga role, at ang live na pagsubok ng Geoapify at Inventory (hinihintay ang mga susi).
- **Nakumpara na sa Zoho Development** (seksyon 3). Dalawa ang nahanap: (1) sa Zoho, **walang suggestion** na lalabas kapag may oras na ang team sa araw na iyon, dahil sa decimal na paghahati; ang port ay gumagamit ng buong minuto (sinadyang pagkakaiba); (2) ang pagbibilang ng gamit na oras ay **hindi** sinisingil sa lahat ng team sa Zoho; mali ang unang kopya ng port at naitama na.

## 2. Decided (the grilling, 2026-11-12)
| # | Question | Answer |
|---|---|---|
| 1 | CMS (the separate Zoho app that raises DMS Schedule Requests) | **Stays in Zoho.** A core PR adds an inbound route with an API key (`CMS_API_KEY`) that calls the two `integrations` of the module; the push back uses `CMS_STATUS_URL` and `CMS_MESSAGE_URL`. |
| 2 | Test writes on Zoho Development | **Yes, Development only,** own records, listed and deleted. Done, see section 3. |
| 3 | PRs | **One PR** for everything in `feature/delivery-management`. |
| 4 | Forecast engine `fcStampBySoNo` (864 lines, shared by Fulfillment, Procurement, Delivery) | **Separate forecast milestone**; Delivery waits. |
| 5 | Files (photos, signatures, video in 9 forms) | **Railway volume.** Download all old files from Zoho once before go-live; a regular backup of the volume is a separate core job (a Railway volume has no automatic backup and a size limit). |
| 6 | Roles | Dispatcher, scheduler, field team, installer, driver. **Scheduler = "Delivery Officer"** of the Zoho scripts. |
| 7 | Keys | The owner has access and creates the **new Geoapify key** and the **Books OAuth client**, and gives them privately for `.env` (never GitHub). |
| 8 | UAT | **The owner first on `npm run dev:pg`** with the checklist in section 6, then Delivery staff on one UAT day. |
| 9 | An appointment with only a suggestion is refused for Override By? | **No.** Confirmed by the owner and by Zoho Development. The D1 rule stands. |
| 10 | Every team charged for every suggested job of the day? | The owner had seen the effect and asked for a fix. **Zoho Development shows Zoho does not do it,** so the engine matches Zoho; see section 3. |

## 3. Comparison with Zoho Development (2026-11-12)
Done on Development only, with records marked `ZZ-CMP` (availability, appointments, a service request, an initial schedule, a field work). All were deleted and the check found none left. The script is not in the repo; it used `server/zoho/adapter.mjs` and the saved credentials, refused to run unless the environment was Development, and cleaned up by marker and by id.

| What was tested | Zoho Development | Port | Action |
|---|---|---|---|
| Suggestion for a team that already has a confirmed 2-hour job that day (08:00 start) | **Nothing written at all** (no date, time or team). | 10:18 AM | **Deliberate difference.** Zoho's `ctsTotalMin / 60` is decimal ("10.3:00 AM" is not a time) and the script fails. |
| The same with a 07:42 start (total 600 minutes) | 10:00 AM | 10:00 AM | confirms the cause above |
| Suggestion text with a blank driver | "System suggested: John Dave / null on ... (Own Fleet)" | same | none |
| Calendar summary of a confirmed job | "... Time: 08:00:00 AM (2.30 hrs) \| Team: CJ / Judy \| Fleet: null \| Type: Delivery Only \| Location: \| Notes:" | same | none |
| Team A has a suggested job, team B an empty day (both created in either order) | B (the empty team) | B | the engine now charges a team only for its own jobs; the first version of the port copied the Deluge text and was wrong |
| Save an appointment with a suggestion, nothing confirmed, no Override By | Saved | Saved | none (decision 9) |
| Installer with no availability record in an Initial Scheduling | Saved (the alert does not block) | Saved with a log line | none |
| A Service Request inserts an appointment (script insert) | The appointment did **not** get a `Geocode_Status`: its workflows did not run | no hooks on a scripted insert | the "run after-add hooks by hand" step of D3a was removed |
| Edit only the confirmed date and slot of a Pick Up appointment | Saved (the exemption saw `Type_of_Delivery`, so `input` is the whole record) | same | none |
| Which record is "first" in a loop | The record with the smaller id, and ids are not in creation order | `ORDER BY ID` | none, same order |
| Clear a picklist (`Confirmation_Method`) with an empty value on an edit | Ignored by the API | n/a | **not settled**: the test could not clear it |

## 4. Missing or unsure
| # | Item | Owner | Needs | Status |
|---|---|---|---|---|
| 1 | Forecast engine `fcStampBySoNo` (the 4 Delivery `*_Instant_Forecast` copy what Fulfillment already computed; they do not compute a forecast) | forecast milestone, owner to be named | the shared port | waiting |
| 2 | CMS inbound route with an API key (core PR) calling `upsertDmsScheduleRequest` and `addDmsScheduleRequestMessage`; `CMS_STATUS_URL` and `CMS_MESSAGE_URL` values | core owner, with the person who owns the CMS app | route + key + URLs | decided, not built |
| 3 | Live check of Geoapify (geocoding) | the owner | new `GEOAPIFY_API_KEY` | waiting for the key |
| 4 | Live check of Inventory (`create_shipment_order`, `create_sales_return_books`): the Deluge posts a string body, the client posts JSON | the owner | Books OAuth client and the owner's OK for the first live call | waiting |
| 5 | Files: photos, signatures and video in 9 forms (Field_Work 8 fields, Service_Appointment_Form 2, Field_Service_Site_Visit_Form 5, Sales_Returns_Form 3, Daily_Checklist_for_Vehicle 2, Dispatch_Checklist, Evidence_Photos, Site_Visit_Photos, Exception_Control1); one-time download from Zoho; volume backup | core owner | download tool, backup | decided, not built |
| 6 | Roles and per-tab access (section 5): the app has no per-role access yet | core owner | auth feature | needs the matrix confirmed |
| 7 | Production export of the Delivery forms (Development has 5 appointments, 3 field work rows, 17 availability rows); `Shipment_Order_Form` and `Pick_Up_Request_Form` have no readable report | repo owner | export | open |
| 8 | `TZ=Asia/Manila` on the server (Railway variable and `.env`): "today" for the engine is the server's date | repo owner | variable | open |
| 9 | Hard-coded keys that are public in git: the old Geoapify key (in the Deluge and the `.ds`), the Custom API public keys in the Service Appointment, Service Request, Archived, Sales Returns and Schedule Requests widgets, the two CMS public keys in the Deluge; make the repo Private | repo owner | rotate, remove | open |
| 10 | `CODEOWNERS` lines for `/server/modules/delivery-management/` and `/tests/delivery-management/` | the owner | the GitHub username | open |
| 11 | One test file failed once at start-up in a full run (`tests/procurement/books-estimates.test.js`), then passed three times | anyone | watch | no action |
| 12 | Clearing a picklist on an edit through the Zoho API was not testable (item in section 3) | me | a different probe if it ever matters | low |

## 5. Draft role matrix (to confirm)
Not built: the app has no per-role access yet. This is the proposal to confirm with the team. Scheduler is the "Delivery Officer" of the scripts.

| Tab | Scheduler | Dispatcher | Field team (installer, driver) |
|---|:-:|:-:|:-:|
| Delivery Analytics | yes | | |
| Daily Team Availability | yes | | |
| Initial Scheduling | yes | | |
| Service Request | yes | | |
| Service Appointment | yes | yes | |
| Ongoing Service | | yes | yes (own Field Work) |
| Archived | yes | yes (create shipment) | |
| Field Service Site Visits | | | yes |
| Sales Returns | | yes | |
| DMS Exception Queue | yes | | |
| Truck Maintenance | | yes | yes (vehicle checklist, fuel) |
| Schedule Requests | yes | | |
| Policy Settings | yes | | |

Questions to settle: do installers and drivers log in themselves (phones) or does the field team lead enter for them; may a dispatcher resolve exceptions; who may edit Policy Settings.

## 6. UAT click-through (the owner, on `npm run dev:pg`)
Before starting: restart the server (the hooks load at start); open Daily Team Availability and add a record for today and tomorrow for at least two teams (the backup only has August and September).

1. **Service Request to appointment:** create a Service Request in the Fulfillment "To Ship" tab. Expect an appointment in Service Appointment as Queued, site Pending, with the items and one package row.
2. **Site confirmation:** on that appointment set the site to Confirmed. Expect a refusal without Confirmation Method and Notes; with both, a Suggested date, time and team appears.
3. **Approve:** confirm the suggested date and time. Expect a calendar entry, status Scheduled, a summary with "(x.xx hrs)".
4. **Override:** confirm a different time. Expect a refusal without Override By and Reason; with them it saves and the summary says "Override: ...".
5. **Stacking:** a second appointment for the same team and day. Expect it to start after the first one's hours (for example 10:18 AM), not nothing.
6. **Conflict:** fill a team's day, then confirm one more at the suggested time. Expect a Calendar Conflict exception in DMS Exception Queue.
7. **Re-Schedule button** on a Queued appointment. Expect a new suggestion; on a Completed one, "tapos na ang delivery".
8. **Field Work:** set a Field Work to Reschedule Requested without a reason (refused), then with one (an exception appears). Mark another Complete: the appointment becomes Completed with "Actual: ..." in the summary, and a later job of the same team is flagged Schedule Drift if it was planned earlier.
9. **Exception Queue:** resolve an exception with "Revert to System". Expect a fresh suggestion. Resolve a Dispatch exception: expect a Priority copy in the queue and the old appointment Failed.
10. **Sales Returns and Shipment** (after the Books OAuth client is in `.env`): create a Sales Return in Books and a Shipment Order.
11. **Schedule Requests:** needs the CMS route (item 2); until then the tab shows what is in the database.
12. Open every one of the 13 tabs once and check there is no error in the browser console.

## 7. To give privately (not GitHub): `.env` on the PC and Railway variables
`GEOAPIFY_API_KEY`, `ZOHO_BOOKS_CLIENT_ID`, `ZOHO_BOOKS_CLIENT_SECRET`, `ZOHO_BOOKS_REFRESH_TOKEN`, `ZOHO_BOOKS_ORG_ID`, `CMS_STATUS_URL`, `CMS_MESSAGE_URL`, later `CMS_API_KEY`, and `TZ=Asia/Manila`. The names are in `.env.example`.

## 8. UAT run 2026-11-12 (through the server's own API on `npm run dev:pg`)
Run by Claude, not through the browser: the Chrome extension could not open `localhost`, so a script signed in with a throwaway account (created in the local SQLite and removed afterwards) and made the same calls the widgets make. Every record carried `ZZ-UAT` and was deleted (nothing left). **22 of 22 checks pass.** The owner's own click-through of the 13 tabs in the browser (section 6) is still to be done; this run does not replace looking at the screens.

| Checklist item | Result |
|---|---|
| Sign in, availability for today and tomorrow (2 teams) | pass |
| 2 Service Request makes a Queued appointment (site Pending, items, one package row, written back) | pass |
| 3 Site confirmation refused without method and notes; with them a suggestion appears | pass |
| 4 Approve: calendar entry, Scheduled, "(2.30 hrs)" in the summary | pass |
| 5 Second job goes to the other team from 08:00; third job stacks to 10:18 AM | pass |
| 6 Different slot refused without Override By; saves with it, reason in the summary | pass |
| 7 A 4-hour job fits; a second 4-hour job on the same team and day is a Calendar Conflict (Flagged, not Scheduled, one exception) | pass |
| 8 Re-Schedule: new suggestion on Queued; "tapos na" on Completed | pass |
| 9 Field Work: reschedule refused without a reason, with one raises a Dispatch exception; Complete finishes the appointment with "Actual: ..." | pass |
| 10 Exception Queue: Revert to System clears the dates and re-runs the engine; a Dispatch exception requeues a Priority copy once and fails the old appointment | pass |
| 11 Shipment and Sales Return answer "Zoho Books is not configured" | pass (live check waits for the keys) |
| 12 The 18 reports behind the tabs answer | pass |

Two mistakes were in my first test script, not in the port (an 8-hour job is 9.2 hours with the buffer, so it conflicts on its own; the exception was looked up by a display value). Not covered: how the screens look, the Schedule Requests tab (needs the CMS route), geocoding and Inventory (need the keys).

## 9. Go-live blockers raised in the review (not Delivery code)
- **Forecast engine `fcStampBySoNo` and the daily schedule `Forecast_Stamp_Daily`:** no code; there is no schedule runner anywhere in `server/` (no cron or timer). Forecast milestone.
- **CMS inbound route:** the two functions exist as module integrations, nothing calls them.
- **The ported hooks only run with `BACKEND=pg`** (`createHookedStore` is attached only in `server/pg/api.mjs`); the default is `zoho`. On Railway there is no `BACKEND`, `DATABASE_URL` or `TZ`, and the Railway Postgres is empty. Going live means setting them and importing the data, for all modules at once.
- **Check the Railway logs:** `server/zoho-credentials.json` is not in `.railwayignore`, so the cloud app may or may not be reaching Zoho; look for "[Zoho Auth] Access token successfully refreshed".
