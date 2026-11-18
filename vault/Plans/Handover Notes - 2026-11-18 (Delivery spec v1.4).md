# Handover notes, 2026-11-18: Delivery Management, spec v1.4

For continuing at the office. Written in plain English. Everything described here is committed and pushed on the
branch `yhelie-update` (check the latest commit message for the exact hash).

## Start at the office
1. `git fetch origin` then `git checkout yhelie-update` and `git pull`.
2. `npm install`.
3. Delivery workflows (scheduling engine, field work, exception queue, everything built this round) only run with
   `BACKEND=pg`. Test with `npm run dev:pg` (local PGlite), not `npm run dev`. Do **not** point `.env` at
   `BACKEND=pg` with the shared Railway `DATABASE_URL` on a PC — see `CLAUDE.md`. `.env` and `data/` are not in git.
4. Tests: `npm test` needs a quiet machine (stop any running dev server first, or the PGlite test files can run
   out of memory). Last full result: 1043 run, 1041 pass + 2 pre-existing unrelated Windows CLI failures
   (`TEST-R4-T1-02`, `TEST-R4-T2-04`, both `3221226505 !== 0` — nothing to do with Delivery), 1 skipped.

## Where things are
- The full comparison with the spec, rule by rule, with status and evidence for every row: `Delivery vs Spec v1.4
  - para sa review.md` at the repo root. Read this first — it has the real, current picture, more detailed than
  this note.
- What changed, why, and **what was not checked**, step by step, newest first: `vault/Deluge Scripts (Obsidian)/00
  - Change Log.md`. The 2026-11-18 entries (parts 9 through 17) cover this entire Delivery v1.4 round.
- The numbered punch list with Done/Not-done and how each was verified: `vault/Plans/Checklist - Delivery Missing
  Functions.md`, items 29 through 48.
- The new server code: `server/modules/delivery-management/` — `sorter.mjs`/`sorter-hooks.mjs` (sorting engine),
  `rotation.mjs` (team rotation), `site-checklist.mjs` (12-line checklist + SR-R1/R4/R5/R6 gates),
  `earliest-slot.mjs` (earliest date + soft hold), `confirmation.mjs` (5pm unconfirmed alert), `day-plans.mjs`,
  `load-sheet.mjs`, `dispatch.mjs` (pre-delivery gate), `suggest-schedule.mjs`, `third-party.mjs`,
  `job-status.mjs` (the Job status chain + event log), `failure-redelivery.mjs` + `exception-queue.mjs` +
  `approval-decisions.mjs` (Failure/Redelivery/Exception Queue), `sales-returns.mjs`, `site-visits.mjs`,
  `truck-maintenance.mjs`, `backlog-calculator.mjs`, `auto-handoff.mjs` (SR-R1, last-click-only).
- New fields/tables: `server/spec-forms/*.json` (merged in `server/model.mjs`; `ensureSchema` only adds what is
  missing when the server starts, never destructive).
- Widgets touched: `modules/Delivery Management/DMS Exception Queue/app/index.html` (new "Also waiting on
  someone" panel), `modules/Delivery Management/Delivery Analytics/app/index.html` (new "9 Key Numbers" and
  "Delivery Backlog Calculator" sections), `modules/Delivery Management/Service Appointment/app/index.html`
  (touched earlier in this round, check the Change Log for which part). No other Delivery widget was changed —
  most of this round's work is server-side only, with no UI yet (see "Not done" below).

## Not done yet — the 2 items left on the owner's own priority list
These were the last 2 of a 4-item list the owner picked from directly (the other 2, Site Checklist/SR gates and
the Delivery Exception Queue widget + backlog calculator, are done — see the Change Log):
1. **Engines 08 (Control Panel) Delivery settings group** — no Delivery capacity settings group exists in the
   Control Panel at all (the existing Procurement Settings tab is Procurement-only). Related: TM-R4 (team roster
   is still hardcoded, not an editable setting), TM-R5's `day_buffer_pct`/`max_jobs`.
2. **Books write-back wiring** — `create_shipment_order`/`create_sales_return_books` exist in `inventory-apis.mjs`
   but nothing auto-triggers them when a job is marked done (no "job done" event wired to Books yet), and neither
   has been run against live Books (OAuth not configured — see `Checklist - Delivery Missing Functions.md` item 2).

## On hold by the owner (asked, explicit answer given — not forgotten)
- **SMS / notifications, the tracking page, and CN-R4 (rotate the leaked SMS credentials)** — owner: "wag muna
  yung SMS notification or kahit na anong sms na naka linked," 2026-11-18. They have iTexMo but are not using it
  yet. Everything that needs SMS (customer notifications, remote signature, tracking link) is tabled with this.
- **TK-R1 (vehicle check-in / "left warehouse" stamp)** — needs a field app, which does not exist. A same-day
  attempt to build one (vanilla-JS PWA) was built, then fully reverted the same day at the owner's direction: the
  existing Ongoing Service → Exception Queue path already covers "why did delivery fail, get it resolved." See
  the Change Log, "Field App reverted," for the full reasoning — worth reading before anyone suggests building a
  field app again.
- **SR-R1's literal QC-pass trigger** — the spec wants a Service Request created the instant a package passes QC,
  skipping crating/aggregation entirely. This app's existing chain (To Ship → Initial Scheduling → hand off) has
  the officer review the initial date/time before a Service Request is made. Asked the owner (2026-11-18):
  automate all the way to QC-pass (skipping that review), or just the final manual click? Chose the latter — see
  `server/modules/delivery-management/auto-handoff.mjs`. The literal QC-pass trigger itself is not built.

## Not done, no decision needed yet (smaller gaps, found along the way)
- **Delivery Analytics' 9 Key Numbers**: #3 (damage rate by category) needs per-item quantity data that does not
  exist (same root cause as the Field App gap). #7 (Ship → Service Request gap) needs a Fulfillment-owned
  timestamp (`package.order_aggregation` in the shared Stage_Events log) that is not a field Delivery's own
  report carries — a real cross-module join, not attempted.
- **No widget shows**: the 12-line Site Checklist, `Site_Hours_Warning`, `Suggested_Crew_Size`, the Job status
  chain's own timeline, or the Delivery backlog calculator's weekly trend. All server-side/field-only so far.
- `force_close`'s own "Confirm"/"Reopen" Approval_Queue apply logic (not part of the Exception Queue widget's
  merge, so nothing decides one yet — deciding one today just stamps no Result rather than the wrong one it used
  to get).
- "Book third party" (in the Exception Queue widget's decide buttons) only points the dispatcher at
  `record_third_party_booking` — it does not open that form inline.
- RT-R2 (sales return field-app flow), RT-R4 (Books write should be draft, not posted — a live-Books behavior
  change, owner's call), RT-R5 (replacement/package link into Procurement's `Replacement_Request`).
- Pre-delivery gate G1 (needs Fulfillment's package/line data), G3 (live Books payment re-check — needs OAuth),
  G5 (DR number — no field exists anywhere in this app).
- SR-R1 (auto-SR) carries `Priority_Level`/`Scheduled_by` blank (nobody to ask when it fires automatically — both
  were already optional) and skips the old widget's external SKU/contact lookup fallback (only mattered for
  pre-chain legacy records).
- On-time % (Delivery Analytics #1 and the Delivery 09 acceptance checklist item) is computed and arithmetic-
  verified against synthetic data, but never checked against 20 real jobs — no production data available for that.

## Things worth knowing
- `procurement/decisions.mjs`'s generic `apply()` had a real, already-live bug: it assumed every `Approval_Queue`
  item with `Record_Type !== 'pr'` was a shipment. Deciding any Delivery item (`schedule_shortfall`,
  `third_party_booking`, `force_close`) would have wrongly stamped "The shipment no longer exists." Fixed with a
  `Record_Type` guard; Delivery's own kinds are applied by the new `approval-decisions.mjs`.
- `createRedeliveryJob` used to create a redelivery appointment directly, skipping the Exception Queue for 9 of
  11 failure reason codes. Every code now raises a Dispatch-stage exception instead; the redelivery is only
  created once a dispatcher resolves it — the same mechanism the old, proven `EXC_Resolve_Sync` already used.
- A real BigInt-vs-Number precision bug was found and fixed in `site-visits.mjs`: this app's shared-ID sequence
  produces numbers past JS's safe-integer range, so `Number(a.ID) > Number(b.ID)` can silently compare equal.
- None of this round's new tests are flaky as far as this session saw them — every failure chased down turned out
  to be a real bug (in the new code, or a pre-existing one found along the way), not a timing issue.
- Not in git (not made by the assistant, same note as the prior handover doc): the `image*.png` files and
  `Fulfillment Process (Zoho) - para sa review.md` in the repo root, if they reappear as untracked.
