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
> The working checklist of what is still missing in Delivery Management: what is only waiting for a key or URL, what has no code yet, what is a data or deployment gap, and what to click on each tab. Built from the code on `Johncel-Dev` (which already includes `feature/delivery-safety`) and from [[00 - Port Status]], [[00 - Current System]], [[Plan - Delivery Management]] and [[Plan - Delivery Management Open Items]]. The decisions still waiting: [[Open Decisions - Delivery Management]]. The one signed decision: [[Decision - Delivery Clock Divergence]]. What was already done: [[Progress - Delivery Safety]], [[Progress - Policy Settings Admin Only]].

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
| 6 | **CMS → app route** | **Implemented 2026-11-13.** `server/integrations/cms.mjs` provides `/api/integrations/cms/schedule-request` and `/message` with `CMS_API_KEY` header verification (`x-api-key` / `Bearer`). Wired before session cookies in `server/index.mjs`. Tested with unit and store integration tests (`tests/core/cms-route.test.js`) | Send `POST /api/integrations/cms/schedule-request` with `x-api-key` → record created in `DMS_Schedule_Request` | core owner | [x] 2026-11-13 |
| 7 | **Roles/permissions** | **Phase 1 done 2026-11-13:** Policy Settings (page, menu entry and every write to `Policy_Settings`) is admin-only. Checked with unit tests and 15 HTTP checks on a temp server; not clicked in a browser. **Phase 2 still open:** only admin and user exist; no Scheduler/Dispatcher/Field role or per-tab access (matrix in [[Plan - Delivery Management Open Items]] section 5 is not confirmed) | Sign in as a normal user → open `/w/Delivery Management/Policy Settings/index.html` → redirected to `/` | core owner | [ ] Phase 1 done. Phase 2 (field team account with `team_name`) tested in the browser 2026-11-14: menu, widget access and the row filter on appointments and field work work; the API is not deny-by-default, see item 26. The Scheduler/Dispatcher roles and the matrix are still open |
| 8 | **Files migration** | Old photos, signatures and videos still point at Zoho paths; `readFile` only serves local `/uploads/` | Open an old Field Work photo or signature → 404/blank | core owner | [ ] partly 2026-11-14: the tool `tools/migrate-zoho-files.mjs` (written by an agent, not git-tracked yet) had two real bugs, now fixed and tested: a download that failed was not counted as an error (the run could say "Errors: 0" and exit 0), and a dry run counted "Files Migrated" and "Records Updated" and had no `dryRun` in its summary (it now reports `filesToMigrate` / `recordsToUpdate`). New photo and signature uploads already work (Truck Maintenance). Dry run on the Development backup (no network, nothing written): the 13 Delivery forms hold 15 records with 5 files to download; all 88 forms hold 3663 records with 2644 files. The real download from Zoho is **not** done yet (item 27 is solved; the 5 Delivery files would be the first test, waiting for the owner's OK). Note: without `--dry-run` the backup-folder mode rewrites the JSON files of that backup, so run it on a copy. 2026-11-14 Production dry-run: the 13 Delivery forms hold 234 records with **168 files** to download (12 forms scanned; Pick_Up_Request_Form has no data file); all 88 forms hold 38,845 records with **21,345 files** (vs 2,644 in Development). On Railway the tool must run inside the container (`railway ssh`) so files land on the `/data/uploads` volume — see docs/shared-postgres-setup.md Step 4b. 2026-11-14: the real download was rehearsed on a Development copy and **succeeded** — 5 Delivery files (3 screenshots + 2 signatures) downloaded as valid PNGs, 5 records updated to `/uploads/`, 0 errors; the mechanism is proven before Production. **2026-11-14 Step 5B DONE (Delivery only, owner's go):** ran inside the Railway container (`railway ssh`, `--backend=pg`, reads live Postgres directly). `.railwayignore` changed `/tools/` → `/tools/*` + `!/tools/migrate-zoho-files.mjs` + `!/tools/zoho/`; ZOHO vars set (`ZOHO_ENV=production` critical — default is `development`, Production rejects the `environment` header 404/2930; creds from `server/zoho-credentials.json` since blank in `.env`); redeploy `c6379920`. Dry-run 168 files/234 records/167 to update/0 err → batch `--limit=5` 3 files/2 records → full `--concurrency=2 --delay=300` 165 files/165 records/0 err. **Total 168 files / 167 records / 0 errors.** Verified: `/data/uploads` = 168 files, 88 MB (163 images + 5 videos); Field_Work API records carry `/uploads/` paths; authenticated fetch → 200 image/jpeg 89761 bytes (valid `ff d8 ff`), rendered in browser 900×1600. **`/uploads/` is auth-gated** (302→/login without a session), not public; attachments show in the record **detail view**, not the list view. Throwaway QA admin used for the browser check, deleted after. Reversible via `import-zoho-backup.mjs <production-dir> --replace`. **App-wide (`--all`, 21,345 files) still deferred** to a future / real-migration-day run |
| 9 | **Email/SMS** | No mailer. The site follow-up (`DMS_Site_Confirmation_Fol`) is inactive in Zoho and was skipped by decision | No email after site confirmation | Delivery owner (docs) | [ ] |
| 10 | **Audit trail** | Only `Added_User` and `Added_Time`; no "who edited what" | Edit a record → no change history | core owner | [ ] |
| 11 | **Multi-instance lock** | The queue works inside **one server process** only | With two instances, simultaneous confirms are no longer serialized | core owner | [ ] |

## 2.3 Data and deployment

| # | Item | Today | How to check | Owner | Done |
|---|---|---|---|---|---|
| 12 | **Production export** | Done 2026-11-14 (rehearsal): `data/zoho-backup/production-2026-11-14T04-40-59Z`, 88/90 forms, 0 failed, **38,845 rows** vs 3,663 in Development. All 88 JSON files valid, 0 bad IDs. Delivery forms now have real data (Service Appointment 27, Field Work 9, Daily Team Availability 98, Exception Queue 20). The export tool had been blocked in Production by a wrong `environment` header (404, code 2930); fixed the same day with a new test | Compare row counts with Production (manifest.json) — done; repeat the export on the real migration day while Zoho changes are frozen | repo owner | [x] 2026-11-14: rehearsal export done and verified. On the real migration day, re-run it (and the import with `--replace`) while Zoho is frozen |
| 13 | **Railway** | Fresh look on 2026-11-14: project `supply-chain-app` (production) has 2 services — the app and `Postgres` (image `postgres-ssl:18`) — a volume at `/data`, and it is deployed from the PC with `railway up --detach` (last deploy 2026-11-11, before Delivery existed). Variables: `ADMIN_*`, `DATA_DIR=/data`, `RAILPACK_BUILD_CMD`, `RAILPACK_START_CMD=node server/index.mjs`. As of the step-7 deploy (2026-11-14): `BACKEND=pg`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `TZ=Asia/Manila`, `SCHEDULES=on`, `PG_POOL_MAX=10`, `GEOAPIFY_API_KEY` are set and the **live site reads Postgres** (`/api/me` → `Data: Postgres`). Still missing: `CMS_API_KEY` (CMS admin pending) | Admin account menu → does it say "Data: Postgres"? If not, it is still the bridge | repo owner | [ ] 2026-11-14: rehearsal steps 1–4 done. Variables added with `--skip-deploys` (no redeploy): `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `TZ=Asia/Manila`, `SCHEDULES=on`, `PG_POOL_MAX=10`, `GEOAPIFY_API_KEY`; `ADMIN_*` kept; `BACKEND=pg` deferred to the step-7 deploy (owner's choice) so the live site never runs on an empty Postgres. Read-only `railway ssh`: the live SQLite has **2 active admins** (corrected at step 7; the step-4 note said 1) — `kahit-anong-email@example.com` and `homecartelmarketing@gmail.com`; no staff accounts. At step 7 both were copied into Postgres by hash (the Postgres `_users` had only `hcadmin`, so `ADMIN_*` did not auto-seed). Step 6 done: the Postgres was **not** empty (old Nov-13 test import, `hcadmin`), so it was backed up first (`data/_pg-backup-before-import.sql`, 92 tables) and then imported with `--replace` (owner's go) — **38,845 rows, 0 mismatch vs manifest**, `_users` untouched. Step 7 done 2026-11-14: `BACKEND=pg` set (`--skip-deploys`) + `railway up --detach` (deployment `84a2a10c`); deploy logs `[pg] connected; schema ready`, schedules on Asia/Manila, Delivery Management 13 pages. Playwright (throwaway QA admin, deleted after): login OK, `/api/me` → `dataSource: Postgres`, Delivery Analytics shows Production data (Service Requests this month 8 / last month 3; Scheduled 6 / Dispatched 1 / Completed 1; Flor 4; Edmon 3 / Nherwin 3 / John Dave 2), Geoapify geocode from inside the container → HTTP 200 (Manila 14.59, 120.98). Cosmetic pending: sidebar label hardcoded "Local database" (`server/public/index.html:189`) even on Postgres. Rollback = remove `BACKEND` + redeploy `6623d5ca`, or restore the Postgres backup. Step 5B done 2026-11-14 (Delivery only, owner's go): 168 files / 167 records / 0 errors migrated into `/data/uploads` inside the container (redeploy `c6379920`); see item 8. App-wide files (`--all`, 21,345) remain deferred to a future / real-migration-day run |
| 14 | **`Pick_Up_Request_Form` / `Shipment_Order_Form`** | Not a Delivery gap: no Delivery widget reads or writes these forms. They belong to another module or are unused | Search the Delivery widgets for the names — zero hits | — | [x] |
| 15 | **App-wide column check** | The "34 forms may have missing columns" gap is app-wide, not Delivery-specific; every report and form name used by the Delivery tabs resolves in the parsed model | A spot-check is still useful before the Production import | core owner | [ ] 2026-11-14: the Production export flags **47 forms** with "fewer fields than the form" (the report hides columns) — evidence for this check, not the check itself. The column spot-check before the real Production import is still pending |
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
| `DMS_Schedule_Request_Messages` | Schedule Requests (chat) — tab removed 2026-11-14, CMS → Service Request |

> The Production export should replace these empty tables. Until then, create a few test rows before clicking through those tabs.

## 2.5 Found after merging jv's UI (2026-11-13)

Checked in the code of `Johncel-Dev`, not in the Zoho export. These are not Zoho features; they are things that stop the ported Delivery logic from running or being proven.

| # | Item | Today | How to check | Owner | Done |
|---|---|---|---|---|---|
| 17 | **Workflows only run with `BACKEND=pg`** | `createHookedStore` is attached only in `server/pg/api.mjs:53`. `server/index.mjs:68` defaults to `local` (SQLite, no hooks), so the 16 workflows (scheduling engine, field work, exception queue) do not run on a plain `npm run dev` | Start with `npm run dev`, confirm a site on a Service Appointment → no suggestion appears. Same step on `npm run dev:pg` → it appears | repo owner | [x] 2026-11-13: not changed on purpose (`local` stays the default); the server now prints a warning on any non-`pg` start, README and `.env.example` say so, and `dev:pg` is the way to test Delivery |
| 18 | **`.env` says `BACKEND=zoho`** | There is no Zoho branch any more, so the value silently falls back to local SQLite (item 17). Admin menu says "Data: Local SQLite" | Change to `BACKEND=pg` (or use `npm run dev:pg`) and check the menu says "Data: Postgres" | repo owner | [x] 2026-11-13: `.env` and `.env.example` now say `BACKEND=local`; any other value (like `zoho`) prints "not supported, running on local SQLite". `.env` was **not** pointed at `pg` because it holds a `DATABASE_URL` that may be the shared Railway Postgres |
| 19 | **`tools/export-zoho-data.mjs` is broken** | It still imports `server/zoho/adapter.mjs`, which jv's branch removed. The Production export (item 12) cannot run until the tool is fixed. The adapter code is in `main` (`eea7cac`) and `feature/zoho-backend-adapter` | Run `node tools/export-zoho-data.mjs` → import error | repo owner | [x] 2026-11-13: the tool now uses `tools/zoho/` (token refresh, throttle, and a **GET-only** reader; no write methods exist). `--dry-run` lists 90 forms; a real read of `Service_Appointment_Form` on Development returned the 5 known rows. The Production export itself is **not** run yet (item 12) |
| 20 | **Delivery forms under the new UI** | `views.js` replaces the native `<select>` popup. Tests pass (367 node, 5 UI files), but nobody has opened the Delivery tabs in a browser since the merge | Pick and submit a value in Schedule Requests, Service Request, Service Appointment and Truck Maintenance | repo owner | [ ] partly 2026-11-14: all 13 tabs opened with no console or page error (Playwright, `dev:pg`, test database; the Schedule Requests entry file is `dms-schedule-request.html`), and forms were submitted in Service Request, Initial Scheduling, Truck Maintenance, Exception Queue, Policy Settings, Schedule Requests. Later the same day all 13 tabs were also opened at 390 px wide: no sideways scroll on any, the menu bar scrolls, the cards stack (a few small tap targets: Archived 2, Sales Returns 1, Schedule Requests 5). Ongoing Service, Field Service Site Visits, Archived, Sales Returns and Exception Queue were then clicked too (see section 3). `npm run test:ui` 124 of 124 pass. Not done: the real Books calls and the old Zoho files |
| 21 | **6 npm audit vulnerabilities** | Reported by `npm install` after the merge, not investigated | `npm audit` | repo owner | [ ] |
| 22 | **Keys public in git** | Old Geoapify key (Deluge + `.ds`), Custom API public keys in the Service Appointment, Service Request, Archived, Sales Returns and Schedule Requests widgets, and two CMS public keys in the Deluge. Plan: make the repo Private and rotate (Clarifications C7). Listed in [[Plan - Delivery Management Open Items]] item 9, not here until now | Search the widgets and `zoho-export/` for the keys | repo owner | [ ] |
| 23 | **`npm run dev:pg` crashed at start** | jv's `server/auth.mjs` opens its own Postgres pool next to the data layer's pool. `dev:pg` serves PGlite through a socket that takes **one** connection, so the second pool was reset: `Error: read ECONNRESET` at `ensureSchema`. Found on 2026-11-13 and reproduced three times (fresh and already-imported database) | `npm run dev:pg` starts and `/healthz` answers | repo owner | [x] 2026-11-13: `server/pg/pool.mjs` now keeps one pool per URL, shared by sign-in and the data layer. Checked on loopback only. Not yet clicked through in the browser |
| 24 | **Service Request tab hides new requests** | The widget reads `pageSize: 200` and the pg store sorts by `ID` ascending (`server/pg/store.mjs`, `ORDER BY t."ID"`), so only the 200 oldest of the 620 rows show. A request made by Hand off is saved (checked through the API) but is not in the tab, so site confirmation cannot be done in the screen | Hand off a schedule, open Service Request, search for its SO → not there. Through `/api/getRecords` with a criteria → it exists | core owner | [x] 2026-11-14: `getRecords` now sorts by ID descending in `server/pg/store.mjs` and `server/db.mjs`. Checked on Zoho Development with a read-only GET: `Service_Request` comes back highest ID first (SR 620 down to 172). Rechecked in the browser: SR 621 shows in the tab. `find` (Deluge loops) stays oldest first. Tests: `pg-store.test.js` 10 of 10 (2 changed, 1 added); full node suite 560 of 562, the 2 failures are `tier2-boundary-corner` R2-T2-02 and 04 (media migration) and fail the same without this change. Other reports' default order on Zoho not checked; `npm run test:ui` 124 of 124 pass (run later the same day) |
| 25 | **A Priority copy has no screen of its own** | After Resolve with "Revert to system" on a Dispatch exception, the old appointment is Failed and a Priority copy is made (Queued, no site confirmation; it keeps the Service Request id and number of the old one, exactly as the Deluge `EXC_Resolve_Sync` does). The Service Request row still points to the old, Failed appointment and keeps showing "Suggestion ready" with Approve, and no tab lists the Queued copy, so its site cannot be confirmed in the screens. The widgets are the original Zoho ones, and the port copies the Deluge line by line (`server/modules/delivery-management/exception-queue.mjs`), so Zoho most likely behaves the same. This is a question for the Delivery team (where is the site of the copy confirmed?), not a code fix. Corrected 2026-11-14: the first version of this note wrongly said the copy has no Service Request id | Raise a Dispatch exception (Ongoing Service: Reschedule Requested + reason), Resolve it in the Exception Queue, then look for the Priority copy in Service Request and Service Appointment | Delivery owner | [ ] open question for the Delivery team, 2026-11-14 |
| 26 | **Field team accounts can still read and write outside their 3 tabs** | Phase 2 (`server/access.mjs`) hides the menu and the widget files and filters only `Service_Appointment` and `Field_Work` by team. Everything else is open through `/api/*`: a field account (team CJ) read `Service_Request`, `DMS_Schedule_Request_Report`, `All_Daily_Team_Availability` and `Delivery_Scheduling_Report`, and added (then deleted) a `Daily_Team_Availability` record. Other modules were not tried but use the same calls. The 3 tabs use these reports and forms, which a deny-by-default list for field accounts would be built from (not built): Field_Work, Field_Work_Report, Service_Appointment, Evidence_Photos, All_Evidence_Photos, Field_Service_Site_Visit_Form_Report, Site_Visit_Photos, All_Site_Visit_Photos, Daily_Checklist_for_Vehicle, Daily_Checklist_for_Vehicle_Report, Fuel_Entries, All_Fuel_Entries, Service_Entries, All_Service_Entries | Sign in as the field account, then call `/api/getRecords` for any other report | core owner | [ ] found 2026-11-14, needs a decision on the allowlist |
| 27 | **Zoho Creator credentials were overwritten (my mistake) and must be made again** | `tools/zoho/auth.mjs` saved the new access token into `server/zoho-credentials.json` after every refresh even when the credentials came from the environment. When I pointed the e2e export tests at a local mock on 2026-11-14 (env `ZOHO_CLIENT_ID=mock` ...), the real file was overwritten at 12:01 with `client_id: mock` and a mock token. The real client id, secret and refresh token of the Creator are gone from that file (it is gitignored, no copy found). Fixed in the tool (it now saves only into the file the credentials came from; `ZOHO_CREDENTIALS_FILE` lets a test use its own file) and guarded by `tests/core/zoho-auth.test.js`. **Still to do:** in the API Console (Self Client) make a new code with scopes `ZohoCreator.report.ALL,ZohoCreator.form.ALL,ZohoCreator.meta.ALL` (10 minutes), then the file is rebuilt from the code; the client id and secret are already in `.env` as `ZOHO_BOOKS_*` (the same Self Client, to be confirmed by the first refresh). Until then the export tool, the files migration against Zoho and any read of Zoho Creator fail with "invalid_client" / "Access Denied". Railway, the test server and the Books keys are not affected | Run `node tools/export-zoho-data.mjs --only=Policy_Settings --out=<a temp folder>` → it should refresh the token and write `Policy_Settings.json` | repo owner (the code) + me (the rebuild) | [x] 2026-11-14, later the same day: the file was rebuilt from a new code (scopes `ZohoCreator.report.ALL`, `form.ALL`, `meta.ALL`). The client id is the same Self Client as the Books one (confirmed). `node tools/export-zoho-data.mjs --only=Policy_Settings` refreshed the token and exported 31 rows, exit 0, and the file kept the real client id and refresh token after the refresh (so the fix works). The Self Client JSON with the secret and the code was pasted in the chat and sits in Downloads: delete that file, and rotate the client secret before go-live (item 22) |

---

# 3. Checklist per tab (13)

| Tab | What to click | Expected | Blocker | Done |
|---|---|---|---|---|
| **Delivery Analytics** | Refresh | Counters come back | Data | [x] 2026-11-14 (browser, `dev:pg`, test database): the counters followed the test records (1 request this month, Scheduled 1, Flor 1, CJ 1) |
| **Daily Team Availability** | Generate Month, Add, toggle | Teams are added | — | [ ] partly 2026-11-14: Add worked (4 records, shown with the right status and capacity). Generate Month for 2026-12 with 2 teams made 54 records (27 Mon-Sat days, no Sundays, teams rotated, no duplicates after running it twice in Keep mode). No toggle control found on the rows, so that item is not tested |
| **Initial Scheduling** | Set initial date, Hand off | Moves to Service Request | — | [x] 2026-11-14: browser (Playwright) on `dev:pg`, test database; New schedule + Hand off made a Service Request and a Queued appointment (checked through the API). Item 24 (the Service Request tab hid new requests) is fixed; after that, site confirmation and Approve worked in the browser (see Service Request row) |
| **Service Request** | New request, Mark site confirmed | Method + notes required; a suggestion appears | — | [ ] partly 2026-11-14 (browser, `dev:pg`, test database): Mark site confirmed refused when empty ("2 required fields missing"), then showed a suggestion (CJ, 08:00 AM); Approve gave a Scheduled appointment with a calendar entry. Not clicked: New request, Override, Re-run. Geocode not checked (test had no address) |
| **Service Appointment** | Review, Approve, Override, Re-Schedule, Calendar | Suggestion, conflict, override reason | — | [ ] partly 2026-11-14: Calendar day view showed both approved jobs in the right team lane at 8:00 AM; the Approve button of the Service Request tab asks a confirm first and then gives Scheduled. Review: a different time showed Override By + Reason and was refused without them ("Override by and override reason are both required."); with them it saved: Scheduled, `Override_Applied` true, 10:00 AM, summary "... Notes: Override: ...". Re-run (the Re-Schedule button) gave "Suggested: CJ / Judy - 2026-11-15 8:00 AM". Not clicked: the dispatch gate (the test orders have no packages) |
| **Ongoing Service** | Save Field Work, Complete, Fail | Completed/Failed, exception created | — | [ ] partly 2026-11-14 (browser, `dev:pg`, test database): the tab lists scheduled appointments; Status Started made the Field Work (start time recorded, appointment In Transit); Installation Status Complete finished it (appointment Delivered, summary "... Actual: Nov 14, 2026 10:49 AM - 10:49 AM"); Reschedule Requested is refused when the reason is empty, and with a reason it raised one Dispatch exception (not a second one on later saves). Fail not clicked; the signature and photo parts of this form were not used |
| **Archived** | Create Shipment, Create Sales Return | Shipment/Return in Books | **Books** | [ ] partly 2026-11-14: Create Shipment (click the order, then the package's own Create Shipment, fill, submit) answered "Zoho Books is not configured: set ZOHO_BOOKS_CLIENT_ID, ... and ZOHO_BOOKS_ORG_ID." and made nothing. Create Sales Return, inside the app, goes to the Sales Returns page with the form pre-filled from the archived order. Opening the widget alone (no shell) sends it to Zoho; that is only because there is no parent page. Nothing was sent to Books |
| **Field Service Site Visits** | Save Changes | Site ready/notes saved | — | [x] 2026-11-14: the tab has no add button (the native form made the records), so one record was added through the SDK; opening it, changing the remark and Save Changes stored the new text. Photo upload and the other checklist fields not tried |
| **Sales Returns** | Send to Books | Return + stock received | **Books** | [ ] partly 2026-11-14: a return created from Archived is saved as Pending (counters 1/1). "Send to Books" stays disabled until the return has a documentation image, a signature, and a Shipment Order for the SO (which needs Books). Sending to Books not tested |
| **DMS Exception Queue** | Start, Resolve, Dismiss, Revert to System | New suggestion | — | [ ] partly 2026-11-14: Resolve was refused without an action; with one it closed the exception (the "Revert to system" box is ticked by default in the widget, so the order went back to the engine and got a fresh suggestion). Dismiss was refused without a reason, then closed. Start moved a Dispatch exception to In Progress; Resolve with "Revert to system" made the old appointment Failed and a new Priority copy (Queued) while the exception counters followed. Edit not clicked. See item 25 for what the Priority copy looks like in the tabs |
| **Truck Maintenance** | Add Checklist, fuel/service entry, signature | Saved; signature upload works | Files | [x] 2026-11-14: checklist (it needs an odometer photo and the checker's signature), fuel entry and service entry were saved and are still there after a reload; the photo and signature came back from `/uploads` (200). New uploads only; old Zoho files are item 8 |
| **Schedule Requests** (tab REMOVED 2026-11-14: CMS → Service Request; CMS route retarget pending) | Confirm, Decline, chat | Appointment created; CMS status pushed | **CMS** | [ ] partly 2026-11-14 (test key, test server only): the CMS route refused no key and a wrong key (401), took the right key (200), did not double a repeated id, refused a missing `cmsRecordId` (400); the request showed as Pending Review, the CMS chat message appeared, and Confirm (after "Yes") made an appointment and set the request to Confirmed. The appointment has no status, address, contact, email or items (the Deluge sets none of them; address and items need Books). With a local stand-in that receives the push (no real CMS): Decline sent `{"cmsRecordId","newStatus":"Declined"}`, Confirm sent `"Confirmed"`, and a chat message sent `{cmsRecordId, senderEmail, senderName, message, sentOn}`, all as JSON. Resync has no effect on the server and sends nothing; what it is for is not clear. The real CMS URLs and a real CMS are not tested |
| **Policy Settings** (hidden) | Edit the 4 numbers (as admin; a normal user is redirected) | Engine uses them | Admin-only done; browser click-through not done | [x] 2026-11-14: as admin the 4 policies show and Edit saved 15 → 20 (kept after reload); the next approved job then showed "(2.40 hrs)" instead of "(2.30 hrs)", so the engine reads it (restored to 15). As a normal user: opening the page goes to `/`, adding a policy gives 403, reading is allowed, and it is not in the menu |

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
| 6 | **Production export** and **Railway `BACKEND=pg` + `TZ`** | Before the real UAT | [ ] 2026-11-14: rehearsal steps 1–4 + 6 done (header fix; Production export 38,845 rows; variables set; Postgres backed up then imported with `--replace`, 0 mismatch). Remaining: step 5B (files in container) + step 7 (deploy `BACKEND=pg` + browser check) |
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
