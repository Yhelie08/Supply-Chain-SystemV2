---
title: "Plan - Cloud Front Door (Zoho Backend)"
tags:
  - plan
  - zoho
  - migration
status: draft - open questions to clarify with the owner and the boss
date: 2026-11-12
---

> [!INFO] Where this fits
> Current state: [[00 - Current System]]. What still only runs in Zoho: [[00 - Port Status]]. History: [[00 - Change Log]]. The table "Open questions" near the end is the agenda for the next conversation.

# Plan: cloud front door for the Zoho Creator Supply Chain App (Zoho stays as the backend)

## Context
The boss wants the supply chain app **no longer deployed only inside Zoho**, while data fetching keeps going through APIs. The owner confirmed **option B (hybrid)**: our website, login and hosting are in the cloud (Railway); **Zoho Creator stays the backend**, so records, all Deluge automation (165 form workflows, 6 schedules, 43 functions) and the Zoho Books/Inventory connections keep running in Zoho. Our server only calls Zoho Creator's REST API (v2.1) and Custom APIs, which is what the widgets already do through Zoho's SDK.

Already built and reused: the 42 original widgets in `modules/`, the Zoho SDK stand-in `server/public/zoho-shim.js`, the redesign (`server/public/theme/`), the login shell and Railway deployment (`server/index.mjs`, `server/auth.mjs`), the parsed export `zoho-export/parsed/`.
Becomes optional: the local SQLite data layer (`server/db.mjs`) and the hand-ported functions (`server/custom-apis.mjs`). Keep them behind a flag (`BACKEND=local`) as a test/offline mode and as the base for moving modules off Zoho later; do not extend them in this plan.

## What B gives and costs
- Gives: real data on every screen immediately (nothing to import or port), automation unchanged, fast to build, Zoho Books connections untouched.
- Costs: Zoho Creator subscription must continue; the app depends on Zoho being up; each call is slower than a local database; **Zoho API limits** apply (daily quota by plan: Standard 250 / Professional 500 / Enterprise 1,000 per user per day; 50 calls per minute per user; 6 at the same time; source: zoho.com/creator/help/api/v2.1/api-limits.html, to confirm for the owner's plan).
- Known catch: all 133 uses of `zoho.loginuser` in Deluge are `Added_User = zoho.loginuser` audit stamps (no permission checks). Through a shared server account they would all show that account.

## Design
```
Browser ─► Cloud app (Railway): sign-in, widgets, theme
              │  per-user Zoho tokens (staff)  /  restricted account (suppliers, if needed)
              ▼
        Zoho adapter ─► cache + queue + usage meter ─► Zoho Creator REST v2.1 + Custom APIs
                                                          (data, workflows, schedules, Books links)
```
1. **Identity:** staff sign in with Zoho (OAuth authorization-code flow, server-side, tokens encrypted at rest). Result: correct `Added_User`, Zoho permission profiles enforced by Zoho, API quotas counted per person. Suppliers (Tony Fan, Fenteng) may not be able to get tokens as portal users; decided by the Step 0 test: otherwise they sign in with our own login and a restricted server account that can only reach their forms.
2. **Zoho adapter** `server/zoho/` (new): translate each shim call to Creator REST and back into the widget SDK shape (`{code:3000,data:[…]}`): getRecords (criteria passed through, pages of 200), getRecordById, addRecords, updateRecordById, updateRecords, deleteRecordById, invokeCustomApi (public keys kept server-side), file upload/download, image fetch for `setImageData`. Keep the "no records" behaviour (codes 9220/9280 the widgets treat as empty). Target environment (Development for testing, Production for real) is a deployment setting.
3. **Limit protection** `server/zoho/limits.mjs` (new): short-TTL cache per user+report+criteria invalidated by our own writes, merge identical in-flight requests, a queue honouring 50/min and 6 concurrent, retry on throttling error 2955, and a per-user/day usage meter shown to admins. If the quota is still tight: background copy of rarely changing reports (teams, policy settings, item catalog) into our database.
4. **Our site's access list:** the existing *Manage users* page becomes an allow-list (who may open the site, with role labels), on top of Zoho's own permissions.
5. **Shim and server wiring:** `server/index.mjs` routes `/api/*` to the adapter when `BACKEND=zoho` (local engine otherwise); `server/public/zoho-shim.js` unchanged in shape.

## Step 0 — Verify before building (go / no-go, about a day, needs the owner)
1. **Plan and API usage:** read the plan name, user count and daily API usage on Zoho's billing page (read-only; the owner either checks it or lets me look in their logged-in Chrome).
2. **API Console:** create a *Server-based Application* client (per-user sign-in) and, for tests, a *Self Client*; scopes limited to Creator report/form/custom-API access.
3. **One real read and one real write against Development:** read a report; add a test record through the API and confirm the form's *on success* workflow runs in Zoho and what `Added_User` and `zoho.loginuser` show.
4. **Portal users:** can a supplier portal user obtain a token? If not, use the restricted-account path.
5. **Custom API list:** open Zoho Creator, Developer Space → API → Custom APIs, to confirm the 21 names, their functions and public keys.
6. **Decision gate:** if the quota or the identity test fails, switch to path C (move modules off Zoho) for the affected area before any more building.

## Phases after Step 0
- **P1 — Adapter + sign-in in staging** against Zoho Development; Delivery Management first (widgets show real data).
- **P2 — Limit protection and usage meter**; measure real calls per screen load and per user per day.
- **P3 — All 45 pages against Zoho:** fix SDK differences (`setImageData`, file download, `getInitParams`, `navigateParentURL`), custom APIs, uploads.
- **P4 — Suppliers, allow-list, roles:** supplier path from Step 0, Manage users as allow-list, per-role landing pages.
- **P5 — Pilot then everyone:** a few staff on Production for a week, then all; Zoho Creator's own screens stay available for weeks as the way back.
- **P6 — Hardening:** error alerts, logs, secrets in Railway variables, rotate the Geoapify key hardcoded in `SA_Geocode_Address`, deploy from GitHub with a staging environment, then commit and push everything done so far.
- **Later (path C, optional):** move modules off Zoho one by one, starting with the 25 functions that touch only our own data, using the local engine and `zoho-export/parsed/`.

## Critical files
`server/index.mjs` (routing, sessions), `server/auth.mjs` (Zoho OAuth added next to the email login), new `server/zoho/*.mjs` (adapter, token store, limits), `server/public/zoho-shim.js`, `server/public/users.html` (allow-list), Railway variables (client id/secret, token encryption key, environment, organization), `zoho-export/parsed/functions.json` and `reports.json` (report and API names the adapter must know).

## Verification
- Step 0 results written down and agreed before building.
- Existing headless check over all 45 pages against Development: no errors, real records visible.
- Same action done in Zoho's own UI and in our site on Development, then compare the records created (workflows ran, `Added_User` correct).
- Usage test: count Zoho API calls for a typical morning of one user and of ten users; must stay under the plan's limits with margin.
- Failure tests: Zoho slow or down, token expired, 429 throttling: the site shows a clear message and recovers.
- `npm test` stays green; sign-in, allow-list and adapter have their own tests.

## Open questions to clarify with the owner (and the boss)
Status: **answered** = decided; **open** = still to clarify; each open item has my recommended answer.

| # | Question | Status | Answer / recommendation |
|---|---|---|---|
| 1 | What does the boss want? | answered | The supply chain app no longer deployed only inside Zoho, with data still fetched through APIs: **option B (hybrid)**. |
| 2 | Hosting | answered | **Railway** is fine; the app stays portable (Node, no Railway-only features) in case the company moves it later. |
| 3 | Zoho Books and Inventory | answered, now automatic | Stay in Zoho; their connections keep running inside Zoho, so we set up nothing for them. |
| 4 | Database | answered, changed | Postgres is no longer needed for data (Zoho keeps the data). SQLite stays only for sign-in accounts. |
| 5 | **How do people sign in to Zoho from our site?** | **open** | Recommend: **staff sign in with their own Zoho account** (correct "Added User", Zoho permissions apply, API limits counted per person); suppliers through our own login and a restricted server account if they can't use Zoho sign-in. Alternative: one shared server account (simplest, but shares one set of API limits and needs the 127 `Added_User` stamps fixed). |
| 6 | **Zoho plan and API usage** (plan name, users, daily calls) | **open** | Owner checks Settings → Billing, or lets me read it (read-only) in the logged-in Chrome. Decides whether the limits are a real problem. |
| 7 | **Which Zoho environment does the site talk to?** | **open** | Zoho keeps two copies of the app: *Development* (testing copy; the owner's screenshots were from here) and *Production* (the live copy staff use). Recommend: build and test against Development, switch the setting to Production at go-live. |
| 8 | **Deadline and reason** | **open** | Not given yet (the owner answered about direction only). Recommend: no fixed date, pilot first. |
| 9 | **How do staff switch over?** | **open** | Means: everyone on the same day, or team by team, or a pilot group first. Recommend: **pilot group (a few trusted users) for about a week, then everyone**, with Zoho's own screens kept as a fallback for a few weeks. |
| 10 | **Do staff use Zoho screens outside the 42 menu pages?** (Zoho's own gray forms and report lists, mobile app, customer portal) | **open** | If no, nothing more to build. If yes, each such screen needs a page in our site. I can list every reachable form and report from the export for the team to confirm. |
| 11 | **Suppliers at launch?** Tony Fan and Fenteng portals | **open** | Recommend: staff screens first, suppliers in a second release unless the boss needs them at launch. |
| 12 | **Will the boss later want Zoho Creator switched off completely?** | **open** | B keeps the Zoho Creator subscription. If yes, plan path C afterwards (move modules off Zoho one by one). Ask the boss now so expectations match. |
| 13 | **Who can create the Zoho API client** (Zoho admin) and give the Production API access? | **open** | Needed for Step 0. |
| 14 | **Custom API list** (21 names, functions, public keys) | **open** | One screen in Zoho (Developer Space → API → Custom APIs); I can't read it from the export. |
| 15 | **Native-code leftovers**: Geoapify key hardcoded in the Zoho script `SA_Geocode_Address` | **open** | Rotate it and move it into a Zoho connection or variable. |
| 16 | **Commit and push the work done so far** to GitHub | **open** | Login, redesign, Railway files, notes are only on this PC and Railway; confirm, then commit (keep `.impeccable/review/` out). |

Notes the owner asked for: this table is the agenda; we go through the open rows together before building. Rows 5, 6, 7 and 14 are Step 0.
