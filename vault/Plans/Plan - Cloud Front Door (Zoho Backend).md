---
title: "Plan - Cloud Front Door (Zoho Backend)"
tags:
  - plan
  - zoho
  - migration
status: draft - open questions to clarify with the owner and the boss
date: 2026-11-12
---

> [!WARNING] Direction changed 2026-11-12
> The owner confirmed the supply chain app will be **removed from Zoho Creator**. Zoho as backend (option B, below) is now only a **bridge** and a tool to export the data; the end state is path C: everything runs on our app.
> - Database: **Postgres on Railway** for business data (users and sessions stay as they are for now).
> - Cutover: **module by module**, Procurement chain first, then Fulfillment, then Delivery. Zoho stays the backend of a module until that module is ported.
> - Zoho Books and Inventory: **stay** (confirmed by the owner); only the Creator supply chain app is removed. Our server calls the Books and Inventory APIs directly instead of through Deluge.
> - Known gap: `invokeCustomApi` in `server/zoho/adapter.mjs` does not call Zoho; 18 of 21 custom APIs return "not ported yet". See [[00 - Port Status]].
> - Still to ask: whether the Creator app is ever deleted or just left unused, and the cutover date.
> - The full roadmap is now in [[Plan - Full Migration Off Zoho Creator]].

> [!INFO] Where this fits
> Current state: [[00 - Current System]]. What still only runs in Zoho: [[00 - Port Status]]. History: [[00 - Change Log]]. The table "Open questions" near the end is the agenda for the next conversation.

# Plan: cloud front door for the Zoho Creator Supply Chain App (Zoho stays as the backend)

## Context
The boss wants the supply chain app **no longer deployed only inside Zoho**, while data fetching keeps going through APIs. The team confirmed **option B (hybrid) with Railway-managed users**: our website, user management, login, and hosting are fully hosted in the cloud (**Railway**); **Zoho Creator stays the backend**, so records, all Deluge automation (165 form workflows, 6 schedules, 43 functions) and the Zoho Books/Inventory connections keep running in Zoho. Our server communicates with Zoho Creator's REST API (v2.1) and Custom APIs using a **dedicated Zoho Service Account**, eliminating the need for individual end-users to have or sign in with Zoho accounts.

Already built and reused: the 42 original widgets in `modules/`, the Zoho SDK stand-in `server/public/zoho-shim.js`, the redesign (`server/public/theme/`), the login shell and Railway deployment (`server/index.mjs`, `server/auth.mjs`), the parsed export `zoho-export/parsed/`.
Becomes optional: the local SQLite business data layer (`server/db.mjs`) and the hand-ported functions (`server/custom-apis.mjs`). Keep them behind a flag (`BACKEND=local`) as a test/offline mode and as the base for moving modules off Zoho later; do not extend them in this plan. SQLite on Railway is actively used for our user accounts, roles, and session persistence.

## What B gives and costs (with Railway-hosted users)
- Gives:
  - **No Zoho accounts required for end-users:** Staff and external suppliers (Tony Fan, Fenteng) all log in via Railway with a clean, branded login experience.
  - **Immediate real data:** Every screen reads from Zoho immediately (no big data migration), Zoho automation unchanged, Zoho Books connections untouched.
  - **Full access control on Railway:** User provisioning, password resets, and role assignments (Admin, Staff, Supplier) happen directly in our *Manage users* interface.
- Costs & Mitigations:
  - Zoho Creator subscription must continue as the backend engine.
  - **Single / Shared API Quota:** Since all user actions flow through the server's Zoho Service Account, the API limits (50 calls/min, 6 concurrent, daily calls) apply to that account. **Mitigation:** The limit protection layer (`server/zoho/limits.mjs`) with caching, request queueing, and in-flight request deduplication is a top priority.
  - **Audit Stamps:** All 133 Deluge uses of `Added_User = zoho.loginuser` will stamp the Service Account in Zoho. **Mitigation:** Railway maintains its own detailed application audit log (who performed what action, timestamp, IP), and writes can pass the Railway user's name/ID into custom fields or headers where needed.

## Design
```
Browser ─► Cloud app (Railway): Sign-in (Railway user store / server/auth.mjs), widgets, theme
              │
              ▼
        Railway Auth & Audit Log ─► Zoho Adapter (server/zoho/)
                                         │
                                         ▼ (Aggressive Cache + Request Queue + Usage Meter)
                                    Zoho Creator REST v2.1 + Custom APIs
                                         │ (via dedicated Zoho Service Account OAuth Refresh Token)
                                         ▼
                                    Zoho Creator (data, Deluge workflows, Books/Inventory links)
```
1. **Identity & User Management:** All users (staff and suppliers) sign in directly to the Railway app (`server/auth.mjs`, persistent SQLite storage). Role-based access control (Admin, Warehouse, Logistics, Supplier) is enforced at the Railway layer. The Railway backend uses a dedicated Zoho Service Account (with an encrypted OAuth refresh token) to make API calls to Zoho Creator.
2. **Zoho adapter** `server/zoho/` (new): translate each shim call to Creator REST and back into the widget SDK shape (`{code:3000,data:[…]}`): getRecords (criteria passed through, pages of 200), getRecordById, addRecords, updateRecordById, updateRecords, deleteRecordById, invokeCustomApi (public keys kept server-side), file upload/download, image fetch for `setImageData`. Keep the "no records" behaviour (codes 9220/9280 the widgets treat as empty). Target environment (Development for testing, Production for real) is a deployment setting.
3. **Limit protection** `server/zoho/limits.mjs` (critical for shared service account):
   - Short-to-medium TTL cache for read reports (e.g. catalog, lookups, settings) invalidated by our writes.
   - In-flight request deduplication (merges identical simultaneous calls into one API request).
   - Rate-limiting queue strictly enforcing max 50 calls/minute and max 6 concurrent connections.
   - Auto-retry with exponential backoff on throttling error 2955.
   - Real-time API usage meter shown to administrators on Railway.
4. **Our site's user management:** The existing *Manage users* page (`server/public/users.html`) handles user creation, roles, and status directly in Railway.
5. **Shim and server wiring:** `server/index.mjs` routes `/api/*` to the adapter when `BACKEND=zoho` (local engine otherwise); `server/public/zoho-shim.js` unchanged in shape.

## Step 0 — Verify before building (go / no-go, in progress)
1. **Plan and API usage:** read the plan name, user count and daily API usage on Zoho's billing page (read-only; the owner checks it).
2. **API Console & Service Account: [DONE - VERIFIED 2026-11-12]** Created Self Client, generated offline Refresh Token with `ZohoCreator.report.ALL,ZohoCreator.form.ALL,ZohoCreator.meta.ALL`. Stored securely in `server/zoho-credentials.json` (gitignored).
3. **One real read and write against Development: [READ, WRITE & DELETE FULLY VERIFIED 2026-11-12]**
   - **READ:** Called `GET https://www.zohoapis.com/creator/v2.1/data/homecartel/supply-chain-app/report/All_Suppliers` (verified sandbox isolation with `environment: development`).
   - **WRITE (Add Record):** Successfully created test record in `App_Notifications` (`POST .../form/App_Notifications`), receiving ID `4662244000017203019` with `code: 3000`.
   - **READ BY ID:** Successfully retrieved the created record by ID.
   - **DELETE:** Successfully cleaned up and deleted the test record (`DELETE .../report/App_Notifications_Report/4662244000017203019`).
4. **Supplier access modeling:** confirm role-based boundaries on Railway so supplier logins (Tony Fan, Fenteng) are restricted only to their respective purchase order and delivery screens.
5. **Custom API list:** open Zoho Creator, Developer Space → API → Custom APIs, to confirm the 21 names, their functions and public keys.
6. **Decision gate: [PASSED - 100% GO]** Read, Write, and Delete APIs are completely functional, authenticated, and isolated to Development. Ready to proceed with Phase 1 (Adapter Implementation).

## Phases after Step 0
- **P1 — Adapter + Service Account connection in staging** against Zoho Development; Delivery Management first (widgets show real data).
- **P2 — Limit protection and usage meter:** aggressive caching, request deduplication, queue (50/min, 6 concurrent), and live usage meter.
- **P3 — All 45 pages against Zoho:** fix SDK differences (`setImageData`, file download, `getInitParams`, `navigateParentURL`), custom APIs, uploads.
- **P4 — Suppliers & Railway role-based access:** configure supplier logins in Railway, Manage Users role assignments, and role-specific landing views.
- **P5 — Pilot then everyone:** a few staff on Production for a week, then all; Zoho Creator's own screens stay available for weeks as the way back.
- **P6 — Hardening:** Railway audit logging, error alerts, secrets in Railway environment variables, rotate the Geoapify key hardcoded in `SA_Geocode_Address`, deploy from GitHub with a staging environment, then commit and push everything done so far.
- **Later (path C, optional):** move modules off Zoho one by one, starting with the 25 functions that touch only our own data, using the local engine and `zoho-export/parsed/`.

## Critical files
`server/index.mjs` (routing, sessions), `server/auth.mjs` (Railway user authentication, password hashing, roles), new `server/zoho/*.mjs` (adapter, service account OAuth refresh, limits/caching), `server/public/zoho-shim.js`, `server/public/users.html` (Railway user management), Railway variables (Zoho client id/secret, refresh token, environment, organization), `zoho-export/parsed/functions.json` and `reports.json` (report and API names the adapter must know).

## Verification
- Step 0 results written down and agreed before building.
- Existing headless check over all 45 pages against Development: no errors, real records visible.
- Same action done in Zoho's own UI and in our site on Development, then compare the records created (workflows ran, Railway audit log recorded, Zoho service account record verified).
- Usage test: count Zoho API calls for a typical morning of one user and of ten users; verify caching keeps calls well under the plan's limits.
- Failure tests: Zoho slow or down, token expired, 429 throttling: the site shows a clear message, handles queues gracefully, and recovers.
- `npm test` stays green; sign-in, user management, and adapter have their own tests.

## Open questions to clarify with the owner (and the boss)
Status: **answered** = decided; **open** = still to clarify; each open item has my recommended answer.

| # | Question | Status | Answer / recommendation |
|---|---|---|---|
| 1 | What does the boss want? | answered | The supply chain app no longer deployed only inside Zoho, with data still fetched through APIs: **option B (hybrid)**. |
| 2 | Hosting | answered | **Railway** is fine; the app stays portable (Node, no Railway-only features) in case the company moves it later. |
| 3 | Zoho Books and Inventory | answered, now automatic | Stay in Zoho; their connections keep running inside Zoho, so we set up nothing for them. |
| 4 | Database | answered, changed | Postgres is no longer needed for business data (Zoho keeps the data). SQLite on Railway is actively used for our user accounts, credentials, roles, and session persistence. |
| 5 | **How do people sign in to the site?** | **answered** | **Users are managed directly in Railway** (not in Zoho). All staff and suppliers sign in to Railway (`server/auth.mjs`). The backend talks to Zoho using a dedicated **Zoho Service Account**. Railway handles application audit logging and role restrictions; aggressive caching and queueing in `server/zoho/limits.mjs` protect the shared API quota. |
| 6 | **Zoho plan and API usage** (plan name, users, daily calls) | **open** | Owner checks Settings → Billing, or lets me read it (read-only) in the logged-in Chrome. Decides whether the shared service account limits are sufficient. |
| 7 | **Which Zoho environment does the site talk to?** | **answered** | **Development environment muna**. Dito muna mag-build at mag-test ng reads/writes para ligtas ang live data. May environment setting (e.g. `ZOHO_ENV=development` o `production` sa Railway variables) para madaling ilipat sa Production sa go-live. |
| 8 | **Deadline and reason** | **open** | Not given yet (the owner answered about direction only). Recommend: no fixed date, pilot first. |
| 9 | **How do staff switch over?** | **answered** | **Pilot group muna (1 linggo)**. Mag-uumpisa sa 2-3 trusted staff at 1 supplier para mag-test ng live operations sa Railway app. Kapag 100% verified na walang issues sa data at workflows, ililipat na ang lahat ng staff at suppliers habang nananatiling backup ang Zoho Creator UI sa loob ng ilang linggo. |
| 10 | **Do staff use Zoho screens outside the 42 menu pages?** (Zoho's own gray forms and report lists, mobile app, customer portal) | **answered** | **Hindi, sapat na ang 42 tabs/widgets**. Sakop na ng 42 custom tabs (Analytic, Procurement, Delivery, Fulfillment, Tony Fan, Fenteng) ang lahat ng ginagamit ng staff at suppliers. Walang karagdagang native Zoho screens na kailangang buuin o i-port. |
| 11 | **Suppliers at launch?** Tony Fan and Fenteng portals | **answered** | **Kasama lahat sa unang launch**. Sabay na ilulunsad ang internal staff screens at ang external supplier portals (Tony Fan at Fenteng). Dahil sa Railway na ang user management, madaling i-setup ang role-based routing (hal. `supplier_tonyfan` at `supplier_fenteng` ay diretsong magla-land sa kani-kanilang portal views). |
| 12 | **Will the boss later want Zoho Creator switched off completely?** | **answered 2026-11-12** | Yes: the supply chain app is being removed from Zoho Creator. Path C (port everything, migrate data to Postgres, module by module) is now the goal. Open follow-up: the removal date. |
| 13 | **Who can create the Zoho API client** (Zoho admin) and give the Production API access? | **answered** | **Naka-log in si user/owner at iga-guide step-by-step**. Sabay nating bubuksan ang Zoho API Console para i-click at i-generate ang Client ID, Client Secret, at permanent offline Refresh Token para sa Service Account. |
| 14 | **Custom API list** (21 names, functions, public keys) | **open** | One screen in Zoho (Developer Space → API → Custom APIs); I can't read it from the export. |
| 15 | **Native-code leftovers**: Geoapify key hardcoded in the Zoho script `SA_Geocode_Address` | **open** | Rotate it and move it into a Zoho connection or variable. |
| 16 | **Commit and push the work done so far** to GitHub | **open** | Login, redesign, Railway files, notes are only on this PC and Railway; confirm, then commit (keep `.impeccable/review/` out). |

Notes the owner asked for: this table is the agenda; we go through the open rows together before building. Rows 6, 7 and 14 are Step 0 (Row 5 is now answered).
