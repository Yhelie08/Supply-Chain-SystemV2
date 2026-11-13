# Project notes for Claude

## Keep the notes up to date (every change, no reminder needed)
After you change code, config or tools in this repo, in the same session:
1. Add a short entry at the top of the newest date in `vault/Deluge Scripts (Obsidian)/00 - Change Log.md` (newest first): what changed, why, and what was checked. Say what was **not** checked.
2. If the change touches Delivery Management, tick or add the row in `vault/Plans/Checklist - Delivery Missing Functions.md` (date it, say how it was verified).
3. If you ported a Deluge script, also follow `vault/Plans/Plan - Delivery Management.md` ("After each step"): `ported.json`, then `node tools/build-module-readmes.mjs && node tools/build-port-checklist.mjs`.
4. Do not claim something is done in a note unless it was run. Write "not verified" instead.

Notes are written in the same mix of English and Tagalog the existing ones use; keep them short.

## Running and testing
- Delivery Management workflows (scheduling engine, field work, exception queue) only run with `BACKEND=pg`. Test them with `npm run dev:pg` (local PGlite), not `npm run dev`.
- Do not point `.env` at `BACKEND=pg` on a PC: its `DATABASE_URL` may be the shared Railway Postgres.
- `npm run test:all` needs a quiet machine: the PGlite test files can run out of memory when a dev server runs at the same time.

## Git
Commit and push only when the user asks.
