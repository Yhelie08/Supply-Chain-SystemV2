# PostgreSQL Deployment & Shared Database Architecture

This document is the definitive guide for deploying **Supply-Chain-SystemV2** to **Railway** with PostgreSQL, managing connection pooling and SSL rules, configuring persistent storage volumes, and executing production Zoho Creator database migrations.

---

## 1. Production Architecture Overview

The production system runs on **Railway** (`supply-chain-app` project) with two core services:
1. **`supply-chain-app`** (Node.js 24 Nixpacks Web Service):
   - Serves ported Zoho Creator widgets from `/modules/` and static assets from `/server/public/`.
   - Executes backend APIs, Deluge-ported workflows, and background schedule runners.
   - Persistent volume attached at `/data` for user file uploads (`/data/uploads`).
2. **`Postgres`** (Railway Managed PostgreSQL 16+ Service with `postgres-volume`):
   - Stores user authentication and session tables (`_users`, `_sessions`).
   - Stores all 88 business domain tables mapped dynamically from Zoho forms (Pack and Pack_Notifications were merged into Pack & QC and removed 2026-11-14).
   - Generates 64-bit integer IDs from `record_id_seq` starting at `4900000000000000000` (exceeding all 19-digit Zoho Creator IDs).

---

## 2. Railway Production Service Configuration

In the Railway Dashboard under the **`supply-chain-app`** service, configure the following settings:

### 2.1 Required Environment Variables

| Variable | Recommended Production Value | Purpose |
|---|---|---|
| `BACKEND` | `pg` | Activates PostgreSQL storage adapter and enables all 16 Delivery Management workflows. |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Railway Variable Reference to the internal Postgres service (resolves to private DNS `postgres.railway.internal`). |
| `TZ` | `Asia/Manila` | Enforces Philippine Standard Time (UTC+8) for all date formatting, Delivery schedules, and audit stamps. |
| `SCHEDULES` | `on` | Enables automated background jobs (`server/schedules.mjs`) protected by PostgreSQL advisory locks. |
| `DATA_DIR` | `/data` | Directs local file storage to the mounted persistent volume. |
| `CMS_API_KEY` | `<strong-random-key>` | Secret API token for authenticating incoming webhooks from Zoho Creator CMS (`/api/integrations/cms/*`). |
| `GEOAPIFY_API_KEY` | `<geoapify-key>` | Required for address geocoding in delivery scheduling. |
| `PG_POOL_MAX` | `10` | Maximum connection pool size (default: 10). |

*Note: For the initial admin setup on an empty `_users` table, optionally supply `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD`. Once the admin account is seeded, remove these variables from Railway.*

### 2.2 Persistent Volume Mounting (`/data`)

Widgets and users upload files (e.g. Proof of Delivery photos, vehicle inspection reports, dispatch checklists). In a containerized environment, local disk changes are ephemeral.
1. In the Railway Dashboard, go to **`supply-chain-app`** -> **Settings** -> **Volumes**.
2. Attach a volume named `supply-chain-app-volume`.
3. Set the **Mount Path** to `/data`.
4. Uploaded media is saved to `/data/uploads` and served publicly via `/uploads/*`. The volume preserves uploads across container rebuilds and deployments.

### 2.3 Nixpacks Build Command Override

- **The Problem:** `package.json` contains a `"build": "vite build"` script. However, `.railwayignore` explicitly excludes `/src/`, `/index.html`, and `/vite.config.js` because the production application directly serves native widget modules and static assets via `server/index.mjs`. If Nixpacks runs `npm run build`, the deployment fails with missing file errors.
- **The Fix:**
  1. In the Railway Dashboard, go to **`supply-chain-app`** -> **Settings** -> **Build**.
  2. Set **Build Command** to empty (or configure variable `RAILPACK_BUILD_CMD=""`).
  3. Railway will skip the Vite build step and proceed directly to `npm start` (`node --env-file-if-exists=.env server/index.mjs`).

---

## 3. Connection Pooling & SSL Architecture

Database connection management is centralized in `server/pg/pool.mjs` via `createPool(url)` and its exported alias `getPool(url)`:

### 3.1 Singleton Registry
```javascript
const pools = new Map();
export function createPool(url = process.env.DATABASE_URL) { ... }
export const getPool = createPool;
```
- Both authentication (`server/auth.mjs`) and data operations (`server/pg/api.mjs`) call `createPool()` without arguments.
- The pool is cached by URL string. This guarantees a single connection pool per process, preventing connection exhaustion in production and avoiding `ECONNRESET` errors in single-connection dev environments (such as PGlite socket proxy).

### 3.2 Dynamic SSL Configuration
Railway supports two networking models:
1. **Internal Private Network (`.railway.internal`):**
   - Connections between `supply-chain-app` and `Postgres` stay inside Railway's isolated internal network.
   - Hostnames matching `localhost`, `127.0.0.1`, or ending in `.railway.internal` automatically set `ssl: false`.
2. **External Public TCP Proxy (`*.proxy.rlwy.net`):**
   - Used when connecting from local developer machines via Railway tunnels or public TCP proxies.
   - Hostnames matching external proxies automatically configure `ssl: { rejectUnauthorized: false }` to accommodate self-signed and proxy TLS certificates.
3. **Manual Override:**
   - Setting `PGSSL=disable` forces `ssl: false` for all hosts.

### 3.3 Dynamic Schema Synchronization & Sequence Offsets
- **Schema Auto-Provisioning:** On server boot under `BACKEND=pg`, `server/pg/schema.mjs` executes `ensureSchema(db)`. It dynamically inspects all 88 form definitions from `server/model.mjs`, creating missing tables and issuing `ALTER TABLE ADD COLUMN` for newly added fields.
- **19-Digit ID Protection:** Zoho Creator IDs are 19-digit integers (e.g. `4662244000013843323`). In PostgreSQL, IDs are stored as 64-bit `BIGINT` columns. In JavaScript, IDs are strictly handled as strings to eliminate IEEE 754 precision loss.
- **Collision-Safe Sequence:** New records receive IDs from `record_id_seq`, initialized at `4900000000000000000` (well above Zoho's current ~4.66E18 IDs). `syncSequence(db)` queries the maximum ID across all 88 tables and advances the sequence if imported data exceeds the starting value.

---

## 4. Production Zoho Creator Data Migration Runbook

Follow these steps to export business data from Zoho Creator and import it into PostgreSQL:

### Step 1: Pre-Flight Export Verification (Dry Run)
Verify that all 88 forms and reports are cleanly parsed without making network calls:
```powershell
node tools/export-zoho-data.mjs --dry-run
```
- Expected output: Scans all 88 forms.
- Notes:
  - 86 forms map to valid list reports.
  - `Pick_Up_Request_Form` and `Shipment_Order_Form` report `-- no report: cannot export` (these forms have no reports in Zoho Creator and are not used by Delivery widgets).
  - `Pre_Order_FF` flags `Pre_Order1_Report [FILTERED]` (Zoho report filters out packaged-out records).
- Dry-run exits with code `0`.

### Step 2: Export Data from Zoho Creator
Set your Zoho environment credentials (or ensure valid `.env` with `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`):
```powershell
$env:ZOHO_ENV = "production"
node tools/export-zoho-data.mjs --out=data/zoho-backup/production-latest
```
- Creates `data/zoho-backup/production-latest/` containing 86 `<Form>.json` files and `manifest.json`.
- The export script logs progress, skips reportless forms cleanly, and exits with code `0` unless an unhandled API error occurs.
- **Environment header rule:** Zoho Creator v2.1 answers `404` (code `2930`) when the `environment: production` header is sent. The export tool therefore sends the header only for `development`/`stage`; for `production` it calls the API without it. Do not add the header manually. (Verified by `tests/core/zoho-environment-header.test.js`.)

### Step 3: Open Secure Railway Database Tunnel
Open a dedicated terminal (Terminal A) to tunnel into Railway PostgreSQL:
```powershell
railway connect Postgres --tunnel-only
```
Keep this terminal running. It will output connection parameters:
```
Host:     127.0.0.1
Port:     59122
User:     postgres
Password: <tunnel-password>
Database: railway
URL:      postgresql://postgres:<password>@127.0.0.1:59122/railway
```

### Step 4: Import Backup into PostgreSQL
In a second terminal (Terminal B), set the environment variables for this session only and run the import:

```powershell
cd C:\Users\User\Supply-Chain-SystemV2
$env:BACKEND = "pg"
$env:DATABASE_URL = "<PASTE_TUNNEL_URL_FROM_STEP_3>"

# 1. Test import in dry-run mode first:
node tools/import-zoho-backup.mjs data/zoho-backup/production-latest --dry-run

# 2. Execute live transactional import:
node tools/import-zoho-backup.mjs data/zoho-backup/production-latest

# Note: If reloading a previously populated database, pass --replace:
# node tools/import-zoho-backup.mjs data/zoho-backup/production-latest --replace
```

**Import Safety Features:**
- Pre-import validation verifies 19-digit regex on all IDs and checks row counts against `manifest.json`.
- Batched inserts limit parameters to 30,000 per query chunk (well under PostgreSQL's 65,535 parameter ceiling).
- Atomic transaction (`withTx`) wraps each form's import; any error triggers full rollback for that form.
- `syncSequence(db)` automatically executes at completion to advance `record_id_seq` above the highest imported ID.

### Step 4b: Migrate Zoho Files (Photos and Signatures) on Railway

The record import above does not download file attachments. `tools/migrate-zoho-files.mjs` downloads Zoho file URLs (Proof of Delivery photos, signatures) into `DATA_DIR/uploads` — on the machine where the tool runs. On Railway that directory is the container's mounted volume at `/data/uploads`, so the tool must run **inside the container**, not on the local PC:

1. `.railwayignore` must allow `tools/migrate-zoho-files.mjs` and `tools/zoho/*` to be deployed (they are not needed by the web app itself, but the tool must exist in the container). gitignore negation cannot re-include a file under a fully-excluded parent, so exclude the children, not the directory:
   ```
   /tools/*
   !/tools/migrate-zoho-files.mjs
   !/tools/zoho/
   ```
2. Set `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` as Railway variables so the tool can authenticate (these are blank in the local `.env`; the real values live in `server/zoho-credentials.json`, which is gitignored and must not be uploaded). Also set **`ZOHO_ENV=production`** explicitly — it defaults to `development`, and Production rejects the `environment` header (404, code 2930). `ZOHO_OWNER`, `ZOHO_APP`, `ZOHO_API_DOMAIN`, `ZOHO_ACCOUNTS_URL` default correctly for `.com` Production.
3. After deploy: `railway ssh` into the service, then run `node tools/migrate-zoho-files.mjs --backend=pg` (with `--dry-run` first). `--backend=pg` reads the **live Postgres** directly, so no backup JSON is needed in the container (`data/` is gitignored and never uploaded).
4. Files download directly into the mounted `/data/uploads` volume, so they persist across redeploys. The run is idempotent: records already pointing at `/uploads/` are skipped, so an interrupted run can simply be resumed.

**Scope.** By default the tool migrates only the **13 Delivery Management forms** (`DEFAULT_FORMS`) — on the 2026-11-14 Production data that is **168 files / 234 records / 167 to update**. Pass `--all` to migrate every form: that is **21,345 files** across all 88 forms of that export (38,845 records; counts from the 2026-11-14 Production backup, before the Pack removal) and is a much larger, separate run. Do not confuse the two numbers. The Delivery-only run was completed on 2026-11-14 (168 files / 167 records / 0 errors, deployment `c6379920`); app-wide remains deferred.

**Serving.** `/uploads/*` is **auth-gated**, not public: an unauthenticated request is redirected to `/login` (302). With a valid session the file is served (e.g. `200 image/jpeg`). Attachments therefore appear in a record's **detail view**, not inline in list views. This is expected, not a bug.

The environment header rule from Step 2 applies here too: the tool sends the `environment` header only for `development`/`stage`.

---

## 5. Local Developer Tunnel Access

For local PC debugging against the shared Railway database without deploying:

1. **Prerequisites:**
   - Install Railway CLI: `npm install -g @railway/cli`
   - Authenticate: `railway login`
   - Link project: `railway link --project "supply-chain-app"` (select `production` environment).
2. **Start Tunnel:**
   ```powershell
   railway connect Postgres --tunnel-only
   ```
3. **Launch Local Server with Tunnel:**
   In a separate terminal:
   ```powershell
   $env:BACKEND = "pg"
   $env:DATABASE_URL = "<PASTE_TUNNEL_URL>"
   $env:PORT = "4001"
   npm run dev
   ```
4. **Login:**
   - Open `http://localhost:4001`.
   - Admin menu should display `Data: Postgres`.
   - Sign in using existing user credentials (e.g. `HCADMIN`).

---

## 6. Security & Troubleshooting Guide

| Issue | Root Cause | Solution |
|---|---|---|
| `DATABASE_URL is not set` | `BACKEND=pg` was specified but `DATABASE_URL` is missing | Check Railway service variables or supply `$env:DATABASE_URL` in local session. |
| `column "id" does not exist` on login | `RETURNING id` attempted on `_sessions` table | Ensure `server/auth.mjs` restricts `RETURNING id` to `_users` table only (fixed in `Johncel-Dev`). |
| Vite build failure during Railway deploy | Nixpacks executing default `npm run build` | Set Railway Build Command to empty in service settings. |
| Uploaded images missing after deployment | Uploads stored on ephemeral container filesystem | Attach Railway volume `supply-chain-app-volume` mounted at `/data`. |
| Handshake / SSL Error on external proxy | Node PG rejecting untrusted certificate | External proxy URLs automatically enforce `{ rejectUnauthorized: false }`. Verify `server/pg/pool.mjs` is used. |
| Schedule jobs firing repeatedly across replicas | Multiple containers running uncoordinated schedules | Ensure `SCHEDULES=on` is backed by `server/schedules.mjs` PostgreSQL advisory locks (`pg_try_advisory_lock`). |

First run with `ADMIN_EMAIL`/`ADMIN_PASSWORD` set creates the admin account automatically.
Forces a password change on first login.

### "No account" / login fails even though the admin account definitely exists

This means your `localhost` is reading from your own **local SQLite** database, not the shared
Postgres — a completely separate, usually-empty `_users` table. Happens when `BACKEND` isn't set
to `pg`, or the tunnel from step 1 above isn't running. Check your `.env` has:

```
BACKEND=pg
DATABASE_URL=postgresql://postgres:...@127.0.0.1:<port>/railway   (current tunnel session's port/password)
```

If `BACKEND=local` or missing, or `DATABASE_URL` is stale/not set, the app silently falls back to
SQLite (`data/app.db`) instead of erroring — so the server still starts fine, it's just reading
the wrong account list. Re-run `railway connect Postgres --tunnel-only`, copy its fresh `URL:`
line into `DATABASE_URL`, confirm `BACKEND=pg`, and restart `npm run dev`. The startup log line
`[pg] connected; schema ready (...)` only appears when it's actually using Postgres — if you don't
see that line, you're on local SQLite.

## Notes

- Railway's tunnel password and port are session-specific — don't hardcode them anywhere shared, re-copy each session.
- `.env` is gitignored, never commit it.
- The shared Postgres now holds **Production data** (38,845 rows imported 2026-11-14, rehearsal). **Do not run `npm run seed` against it** — seed is for a fresh, empty database only.
- Zoho Creator backend/adapter was removed in this branch (`yhelie-update`'s commit). Only `local` (SQLite)
  and `pg` (Postgres) backends exist now, via `BACKEND` env var.
- First person to run the app with `BACKEND=pg` and `ADMIN_EMAIL`/`ADMIN_PASSWORD` set creates the shared
  admin account. Don't set those two vars again after that (they only act on an empty `_users` table) —
  everyone else just signs in with whatever account an admin made for them via **Manage users**.
- Admin accounts: the two active admins copied from the live SQLite during the 2026-11-14 rehearsal (see Change Log); `HCADMIN` is an old Nov-13 test account. Passwords are never written here.
