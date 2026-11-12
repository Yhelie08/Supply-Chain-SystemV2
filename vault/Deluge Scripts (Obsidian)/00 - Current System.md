---
title: "Current System"
tags:
  - architecture
  - status
  - railway
  - auth
---

# Current system: the app outside Zoho (Option B: Cloud Front Door)

Updated 2026-11-12. The app runs as a **Cloud Front Door (Hybrid Option B)**: our website, redesign, login, and users live in the cloud on **Railway**, while **Zoho Creator remains the live backend engine** (handling data, all 165 Deluge automations, and Zoho Books/Inventory links) via REST API v2.1. See [[00 - Port Status]], [[00 - Change Log]], and [[00 - Actions Execution & Zoho Adapter Routing]].

## How it fits together

```mermaid
flowchart LR
    USER["Browser<br/>signed-in user"] -->|"+ zoho-shim.js<br/>+ theme.css"| SRV["server/index.mjs<br/>Node, Railway"]
    MOD["modules/Section/Tab/app<br/>42 original widgets"] --> SRV
    SRV -->|"BACKEND=zoho (Default)"| ADAPTER["server/zoho/adapter.mjs<br/>Cache + Queue + Rate Limit"]
    ADAPTER -->|"Zoho REST v2.1 + Custom APIs<br/>(via Service Account)"| ZOHO[("Zoho Creator Backend<br/>(Live Data & Deluge Workflows)")]
    SRV -.->|"BACKEND=local (Offline mode)"| DB[("SQLite app.db<br/>90 tables")]
```

- **Widgets are the real Zoho widget source**, one folder per tab: `modules/<Section>/<Tab>/app/`. The server serves them with Zoho's SDK swapped for `server/public/zoho-shim.js`, so every `ZOHO.CREATOR.*` call goes to the server.
- **Zoho Adapter (`server/zoho/`):** Translates all widget shim calls directly to Zoho Creator REST v2.1 endpoints (`/report/*` and `/form/*`). Includes a 15-second cache, automatic token refresher, and queue to protect Zoho rate limits.
- **Database / Offline fallback:** SQLite is actively used for user accounts, credentials, and sessions on Railway. It also serves as an offline fallback (`BACKEND=local`) for local development without internet.
- **Custom APIs:** Live Deluge automations run in Zoho, with fallback implementations in `server/custom-apis.mjs`.
- **Sections and tabs:** 6 sections, 42 tabs + 3 hidden pages listed in `server/pages.json`.

## Sign-in and users

- Everything except `/login`, `/healthz` and the theme files needs a signed-in user.
- Passwords: scrypt hashes. Session: random token in an `HttpOnly` cookie (`hc_session`, 14 days, `Secure` on HTTPS); only its SHA-256 is stored.
- 8 wrong passwords from one address blocks sign-in for 15 minutes.
- Roles: **admin** and **user**. Admins open *Manage users* in the account menu to add users (a temporary password is shown once), reset passwords, make admin, turn off, or delete. New users and reset users must choose their own password at first sign-in.
- The signed-in user's email is what widgets see as the logged-in user (`window.HC_USER`), so the role rules in the widget code (HC Purchasing, HC Systems, HC Damage Officer…) keep working.
- Tables `_users` and `_sessions` sit in the same database. The first admin is created at first start from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Run it on a computer

```
$env:ADMIN_EMAIL='you@example.com'; $env:ADMIN_PASSWORD='a-long-password'; npm start    # PowerShell
```
Opens at `http://localhost:4000`. Data goes in `data/` (git-ignored). Needs Node 24 (built-in SQLite). Environment: `PORT`, `DATA_DIR`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`.

## Hosted on Railway

| | |
|---|---|
| Address | `https://supply-chain-app-production.up.railway.app` |
| Project / service | `supply-chain-app` / `supply-chain-app` |
| Storage | a volume mounted at `/data` holds `app.db` and `uploads/`, so data survives redeploys |
| Variables | `DATA_DIR=/data`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` (used only the first time), `RAILPACK_BUILD_CMD`, `RAILPACK_START_CMD` |
| Deploy | from the project folder: `railway up --detach --service supply-chain-app` (uploads this folder; it does **not** deploy from GitHub) |
| Excluded from upload | `.railwayignore`: old React app, vault, tools, the raw `.ds` (it holds an API key). Every rule starts with `/`, because an unanchored `index.html` once dropped every page |

> [!WARNING] Railway settings to know
> `railway.json` was removed because Railway stops supporting it on 2026-12-01; build and start commands now live in the variables above. The old health-check setting (`/healthz`) was in that file. The server still answers `/healthz`; set the health-check path in the Railway dashboard (Settings → Deploy) if you want it back.

## Open items

> [!NOTE] Next step
> The agreed direction is a cloud front door with Zoho Creator kept as the backend. Full plan and the list of questions still to clarify: [[Plan - Cloud Front Door (Zoho Backend)]].

- **No real data yet.** The live database is empty. Import from Zoho (read-only): the question *Development or Production?* is still unanswered.
- **Port the logic:** 41 Deluge functions, 165 form workflows, 6 schedules and 16 report-button functions ([[00 - Port Status]]). Biggest: the scheduling engine `dmsScheduleSlot`.
- **Integrations:** Zoho Books (addresses, items, estimates, sales returns) and the CMS app are not connected.
- **Secret in the Zoho export:** a Geoapify key is hardcoded in the `SA_Geocode_Address` workflow (and its note). Rotate it and move it into a variable.
- **Check against Zoho:** the *Analytic* tab uses the "Supply Chain Conversion" widget and *Forecast Setting* uses "Delivery Forecast" (matched by name); Forecast Setting looks for a report named differently from `All_Settings` in the `.ds`.
- **Not committed yet:** login, redesign, Railway files and these notes are only on this computer and Railway; GitHub still has commit `f320e2a`.

## Where things are

| Path | What |
|---|---|
| `server/` | the app server, database layer, sign-in, custom APIs, pages |
| `modules/` | widget source per section/tab, plus a README per section |
| `zoho-export/` | the `.ds` file and everything parsed from it |
| `vault/Deluge Scripts (Obsidian)/` | these notes (Deluge scripts per module) |
| `vault/` (other folders) | notes on the earlier React prototype in `src/`, generated by `npm run vault` |
| `PRODUCT.md`, `DESIGN.md`, `.impeccable/` | product and design records |
| `tools/` | `parse-ds`, `import-widgets`, `build-module-readmes`, `build-vault` |

Regenerate after a new `.ds` export or updated widget zips:
```
node tools/parse-ds.mjs
node tools/import-widgets.mjs
node tools/build-module-readmes.mjs     # also rewrites 00 - Port Status.md
```
