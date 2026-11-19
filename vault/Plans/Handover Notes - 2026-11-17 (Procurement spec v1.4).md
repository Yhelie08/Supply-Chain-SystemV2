# Handover notes, 2026-11-17: Procurement and the supplier portal, spec v1.4

For working on another PC. Written in plain English. Everything described here is committed and pushed on the branch `yhelie-update`
(last commit: the merge of `origin/jv-update`, `3c523bd`).

## Start on the other PC
1. `git fetch origin` then `git checkout yhelie-update` and `git pull`.
2. `npm install`.
3. Do **not** point `.env` at `BACKEND=pg` with the shared Railway `DATABASE_URL` on a PC (see `CLAUDE.md`). `.env` and `data/` are not in git.
4. For a local sample: `npm run dev:pg` (local PGlite, port 4000). The database starts empty: load mock data with `npm run seed`, or use the
   whole-process check below, which makes its own data.
5. Tests: `npm test` (node, about 10 minutes, needs a quiet machine: stop any running dev server first or PGlite tests can run out of
   memory) and `npm run test:ui`. Last full result: node 871 tests, the one failure was fixed (module list), UI 124 of 124.

## Where things are
- The comparison with the spec, the progress of every step and the acceptance check of the 8 Procurement documents:
  `Procurement vs Spec v1.4 - para sa review.md` (and `.pdf`) at the repo root (sections 14 to 22).
- What changed, why, and **what was not checked**, step by step: `vault/Deluge Scripts (Obsidian)/00 - Change Log.md` (newest first).
- The new server code: `server/modules/procurement/` (`ship-track.mjs`, `plan.mjs`, `sorting.mjs`, `events.mjs`, `decisions*.mjs`, `settings-*.mjs`,
  `pr-spec.mjs`, `po-create.mjs`, `po-spec.mjs`, `receiving-spec.mjs`, `inq-spec.mjs`, `rr-spec.mjs`, `dashboard.mjs`, `production-portal.mjs`).
- The new fields and tables are in `server/spec-forms/*.json` (merged in `server/model.mjs`, so `npm run parse-ds` cannot wipe them).
  `ensureSchema` only creates missing tables and columns when the server starts.
- `Stage_Events` is ONE shared table: Fulfillment (JV) writes `package.*` events, Procurement writes `shipment.*`, `inquiry.*`, `po.*`, `rr.*`...
  The column is `Record_Id` (JV's files were changed from `Record_ID`: tell JV).

## The whole-process check
`tools/full-flow-check.mjs` runs the whole Procurement and supplier portal process (69 checks) against a running local server. The first line
of the file says how to start a fresh local database for it. Never run it against a real database.

## Waiting for the owner's go (nothing has ever been written to Railway)
1. **The deploy to Railway** (manual: the app service has no repo). On 2026-11-17 a read-only comparison found 6 new tables and 145 new columns,
   but the merge of `jv-update` added more (`Capacity_Days`, `Box_Count` columns, JV's own `Stage_Events`): count again first.
2. **`tools/railway-rename-suppliers.sql`**: renames the short supplier names "Tony" / "Fenteng" to "Tony Fan" / "Fenteng Lighting". Only 13 message
   rows really matter (the chat asks for the full name). Tried only on a restored local copy of the production backup.
3. A **backup** was made on the first PC at `C:\Users\Enduser\Desktop\Supply-Chain-System-V2-backups\` (outside the repo on purpose: production
   data). It is not on this PC. Make a new one before any write to production.
- Reading production without writing: there is no public TCP proxy and no `psql` on the first PC, so it was done with
  `railway ssh --service Postgres -- sh -c "PGOPTIONS='-c default_transaction_read_only=on' psql ..."` run inside the repo folder (the Railway CLI
  must be logged in and linked to the project: `railway whoami`, `railway status`).
- The project hook blocks `git push` when an AI assistant runs it: push yourself.

## On hold by the owner
- Roles and "what each user sees": hiding prices, deposit and costs, "My inquiries" for the sales agent, the alert to the sales agent, login per
  supplier, the role gate on "Push Estimate".
- Everything that needs Zoho Books: the Estimate, the PO in Books, the Purchase Receive, the Estimate becoming a Sales Order.

## Not done yet (no decision needed)
- Several photos per shipment in the supplier portal (the upload endpoint keeps one file per field), partial quantities, the portal "Today"
  screen, the daily digest.
- Broken (replacement) in Fulfillment and Delivery: left out on purpose, other modules. The data (`Rr_Category`) is ready.
- Shared engines: Dates and Forecast gaps, the sorting engine for the Inquiry and PO lists, timestamps in UTC.
- Auto-priced PRs (the pricing tool is outside the system), supplier photos in the Exception Control detail, RR stock replacement straight to a package.

## Things worth knowing
- Production's LCL transit setting is **48 days**, not 30: the old Forecast Setting record there has its own numbers and they win over the
  engine defaults. The supplier portal's arrival estimate now uses the settings (it was a fixed 12 / 67 / 47 days).
- On production data the Dashboard shows 4 shipments as Broken, because 4 open Replacement Requests point at a cloned shipment.
- The Forecast column of the Shipments and Receiving lists is the old delivery forecast, written only by the 01:00 daily job; until then the
  list shows the Ship & Track "pickable" date.
- Not in git (they were not made by the assistant): the `image*.png` files and `Fulfillment Process (Zoho) - para sa review.md` in the repo root.
