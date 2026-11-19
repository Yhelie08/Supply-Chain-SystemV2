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

## Not done yet — 1 item left on the owner's own priority list (updated 2026-11-19)
These were the last 2 of a 4-item list the owner picked from directly. Site Checklist/SR gates and the Delivery Exception Queue widget + backlog calculator were done on 2026-11-18. **Engines 08 (Control Panel) Delivery settings group is done 2026-11-19** (Delivery Settings page, validation, history, preview, editable roster; see the Change Log and checklist item 50). Still not done there: TM-R5's `day_buffer_pct`/`max_jobs` (no spec text in the repo, no code reads them).
1. **Books write-back wiring** — `create_shipment_order`/`create_sales_return_books` exist in `inventory-apis.mjs`
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
- **Delivery Analytics (updated 2026-11-19):** all the code is done: #3 damage rate by category, #7 Ship → Service Request gap, the backlog weekly trend and an editable "days available" are built (see the Change Log, 2026-11-19). Only data/deploy waits remain: on-time % has only 3 measurable jobs on the Production backup (needs 20 real jobs with `Job_Done_At`), and #7 has nothing to measure until the Fulfillment deploy creates `Stage_Events` in Production. The Zoho-era status "Delivered" counts as Completed in Analytics only (owner's call).
- **Done 2026-11-19:** the 12-line Site Checklist, `Site_Hours_Warning`, `Suggested_Crew_Size` and the Job status timeline now show in the Service Request drawer (with a 12-line editor). Nothing else is missing a widget from this list; many other server-side pieces (earliest slot, day plan, load sheet, `dispatch_day`, `suggest_schedule`, truck maintenance) still have no widget calling them.
- **Done 2026-11-19:** `force_close` Confirm / Reopen is applied and shows in the Exception Queue.
- **Done 2026-11-19:** "Book third party" opens the booking form in the Exception Queue widget.
- RT-R2 (sales return field-app flow), RT-R5 (link into Procurement's `Replacement_Request`) and TM-R5 (`day_buffer_pct`/`max_jobs`): not built; no spec text in the repo and the field app was reverted. RT-R4 (Books write should be draft): left as it is (the return is created and received at once, like the old Zoho script); owner said follow the current rule.
- **Done 2026-11-19 (with limits):** pre-delivery gates G1 (job lines vs Fulfillment package), G3 (Books payment; assumed response shape, never run against live Books) and G5 (DR number from the Dispatch checklist). Known limit: the server's `dispatch_day` flow has no step that creates the DR number, so G5 fails there unless the Dispatch checklist exists.
- SR-R1 (auto-SR) carries `Priority_Level`/`Scheduled_by` blank (nobody to ask when it fires automatically — both
  were already optional) and skips the old widget's external SKU/contact lookup fallback (only mattered for
  pre-chain legacy records).
- On-time %: see the Delivery Analytics line above. On the 2026-11-17 Production backup only 3 of 10 Completed jobs can be measured, so the 20-job check is still waiting for data.

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
