---
title: "Change Log"
tags:
  - changelog
  - status
---

# Change log

Newest first. Current picture: [[00 - Current System]]. Deluge porting: [[00 - Port Status]].

## 2026-11-12

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
