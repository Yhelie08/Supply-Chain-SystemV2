# Project notes for Claude

## Keep the notes up to date (every change, no reminder needed)
After you change code, config or tools in this repo, in the same session:
1. Add a short entry at the top of the newest date in `vault/Deluge Scripts (Obsidian)/00 - Change Log.md` (newest first): what changed, why, and what was checked. Say what was **not** checked.
2. If the change touches Delivery Management, tick or add the row in `vault/Plans/Checklist - Delivery Missing Functions.md` (date it, say how it was verified).
3. If you ported a Deluge script, also follow `vault/Plans/Plan - Delivery Management.md` ("After each step"): `ported.json`, then `node tools/build-module-readmes.mjs && node tools/build-port-checklist.mjs`.
4. Do not claim something is done in a note unless it was run. Write "not verified" instead.

Notes are written in plain English (owner decision, 2026-11-17); keep them short. The Deluge script copies under `vault/Deluge Scripts (Obsidian)/**/Deluge/` keep their original comments as they are.

## Backend language (owner decision, 2026-11-19)
All backend work is **Python** (`app/`, FastAPI + asyncpg). The Node server (`server/`) is the frozen reference to port from; do not add features there.
Fulfillment is ported to Python and waits only for the owner's click-through sign-off (Phase 6; plan: `docs/superpowers/plans/2026-11-19-python-fulfillment-completion.md`). Delivery Management and Procurement are
not ported yet and still run on Node (see the Node notes below). Zoho Books-connected work (`check_payment_status`, `create_package_ff`, `add_item_by_id`) and roles are on hold.

### Python: running and testing
- Tests: `python -m pytest -q` with `TEST_DATABASE_URL` set to a LOCAL Postgres (the test setup refuses any non-local host; never point it at the shared Railway database).
- Run the app: set `DATABASE_URL` (a local database), `PGSSL=disable`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` (first start creates the admin), then `python -m uvicorn app.main:app --port 8123`.
- Scheduled jobs (forecast stamp 01:00, pre-order backfill 01:00, queue recalculation 05:00, Asia/Manila) run only when `SCHEDULES=on`.
- Sample data: `python -m app.tools.seed_fulfillment` (7 sample orders, refuses a non-empty or non-local database). Catch-up sweep: `python -m app.tools.fulfillment_sync`.
- The folders for forms, spec-forms and widgets can be moved with `HC_PARSED_DIR`, `HC_SPEC_FORMS_DIR`, `HC_MODULES_DIR`, `HC_PUBLIC_DIR`, `HC_PAGES_JSON` (`app/paths.py`).
- Parity with Node: `python tools/build-parity-matrix.py` rewrites `docs/superpowers/plans/parity-fulfillment.md` (every Node Fulfillment/forecast test next to its Python test); it exits 1 if one is unmapped.

### Node (Delivery Management and Procurement until they are ported)
- Delivery Management workflows (scheduling engine, field work, exception queue) only run with `BACKEND=pg`. Test them with `npm run dev:pg` (local PGlite), not `npm run dev`.
- Do not point `.env` at `BACKEND=pg` on a PC: its `DATABASE_URL` may be the shared Railway Postgres.
- `npm run test:all` needs a quiet machine: the PGlite test files can run out of memory when a dev server runs at the same time.

## Git
Commit and push only when the user asks.
