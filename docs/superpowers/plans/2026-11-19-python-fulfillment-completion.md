# Plan: finish Fulfillment in Python (and prove it with a test suite)

Date: 2026-11-19. Status: plan only, nothing in it has been run yet.
Owner decision behind it (2026-11-19): all backend functions are done in Python from now on, no more Node.js.
Builds on JV's branch `jv-python` (merged into `yhelie-update` as `c2f53c1`): the Python Foundation and the Python port of
Fulfillment + forecast (`docs/superpowers/specs/2026-11-19-python-fulfillment-design.md` and its plan).

## 1. Where we are (checked 2026-11-19 by reading the code, not by running it)

- Node did not change in Fulfillment or forecast after JV's baseline (`b5c45cb`), so the Python port copies today's Node.
- Every Node Fulfillment and forecast file has a Python counterpart with the same functions and the same hook
  registrations (11 Fulfillment files, 6 forecast files).
- Not in Python:
  1. The scheduler runner (`server/schedules.mjs`). Nothing runs the 3 Fulfillment jobs: `Forecast_Stamp_Daily` (01:00),
     `Backfill_PreOrder_Forecas` (01:00), `Recalculate_Fulfillment_Queue` (05:00), all Asia/Manila. The job functions exist.
  2. The custom APIs the Fulfillment widgets call and that need Books: `check_payment_status` (Order Readiness),
     `create_package_ff` (Pre-Order, Sales Order Report), `add_item_by_id` (Transfer Item; it lives in Node's Procurement
     `books-apis.mjs`). Books is on hold, so these stay placeholders for now.
  3. Node-only tools: `tools/fulfillment-sync.mjs` and the mock data in `server/seed-ops.mjs`.
  4. Pieces that belong to other modules: the Delivery forecast stamps (`delivery-management/forecast-stamp.mjs`), the
     Procurement `pr-hooks`. They move with the Delivery and Procurement ports.
- Python tests missing compared with Node (19 for Fulfillment/forecast, listed in section 4) plus the 7 scheduler tests.
- The Python tests have NOT been run by us. They need a local Postgres (see Phase 0).
- The Python app still reads these Node-side folders (data and static files, not code): `server/spec-forms`,
  `server/pages.json`, `server/public`, `zoho-export/parsed`, `modules/`.

## 2. Ground rules

- No new Fulfillment logic in Node. Node is the reference to compare against. A Node bug found on the way is fixed in Python
  and written down.
- Tests first: write the missing test, watch it fail or pass, and only then touch code. A failing test is a gap in the port.
- Python tests never run against the shared Railway Postgres. Local Postgres only.
- Small commits on `yhelie-update`; pull `origin/jv-python` first, because JV is also editing `app/`.
- After each phase: update `vault/Deluge Scripts (Obsidian)/00 - Change Log.md` (what changed, what was checked, what was NOT).
- Plain English in notes, as agreed.

## 3. The phases, in order

### Phase 0: a safe place to run the tests
0.1 Install a local Postgres (or use Docker) on this PC; create `supply_chain_test`. Create a venv, `pip install -e .[dev]`.
0.2 `conftest.py` today only checks that `TEST_DATABASE_URL` is set, and its own comment says the tests run on the shared
    Railway Postgres in a `python_test` schema. Add a guard: refuse any host that is not `localhost` / `127.0.0.1`
    unless an explicit override variable is set. Test the guard.
0.3 Run the whole existing Python suite and write the real pass/fail count into this plan (JV's doc claims 117 for the
    Foundation; the Fulfillment count is unknown). Fix anything red before moving on.
0.4 Add `tzdata` to `pyproject.toml` (Windows has no time-zone database, Phase 3 needs Asia/Manila).
Done when: the suite runs green on this PC against a local database, and the guard test passes.
**Status 2026-11-19: DONE** (a test agent did it; I re-ran 37 of the new tests myself). Real baseline: 273 passed, 0 failed. After Phases 0, 1 and
the Phase 2 files: 316 passed, 0 failed (Python 3.14.5, asyncpg 0.32.0, PostgreSQL 16.2).
- Python 3.14 has no wheel for `pgserver`, so the local Postgres is made from its Python 3.12 Windows wheel, unzipped, using `initdb` and `pg_ctl`
  directly (the binaries do not need Python). Everything lives in the session scratch folder, never in the repo. Commands: `pip download pgserver
  --no-deps --only-binary=:all: --python-version 3.12 --platform win_amd64`, unzip, `initdb -D <dir> -U postgres -A trust -E UTF8`, `pg_ctl -D <dir> -o
  "-p 54329 -c listen_addresses=127.0.0.1" start` (run it in the background, it blocks the shell), `createdb supply_chain_test`, then
  `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/supply_chain_test python -m pytest -q`.
- The suite is slow on Windows (each test builds ~100 tables). The throwaway cluster ran with `fsync`, `synchronous_commit`, `full_page_writes` off;
  never do that on a real database.
- 0.2 done: `conftest.py` refuses any host that is not localhost / 127.0.0.1 / ::1 unless `ALLOW_REMOTE_TEST_DB=1`; 16 tests in
  `tests/test_conftest_guard.py`. Limit: the guard is inside the `db_conn` fixture, so a future test that connects without it would bypass it.
- 0.4 done: `tzdata` added to `pyproject.toml`. Only Python 3.14.5 was tried, not 3.12 or 3.13.

### Phase 1: close the 19 missing tests (prove the port that already exists)
Order: schema, stamp, purchase request, schedule, hooks. For each, copy the Node test's intent, run it on Python.
If it fails, fix `app/` until it passes and note whether it was a real bug or a Node quirk to keep ("null" text mode).
| File (Python) | Node has / Python has | Tests to add |
|---|---|---|
| `tests/fulfillment/test_sorter.py` | 32 / 30 | `Box_Count` + `Box_Count_Source` columns exist; `Capacity_Days` form exists |
| `tests/fulfillment/test_stage_events.py` | 7 / 6 | `Stage_Events` form exists with its columns |
| `tests/forecast/test_stamp.py` | 14 / 10 | shipped order counts from the ship day (shipment found by PR number); delivered shipment = at the warehouse; second run writes nothing (this is what stops the stamp firing itself); blank Shipment_Mode on the SOF is the text "null" |
| `tests/forecast/test_purchase_request.py` | 12 / 8 | prep stage counts days from the earliest Gate/Pick/QC/Crate row; supplier lead time only when the shipment branch is not taken; second run writes nothing; `fcPrToPreOrder` does not wipe a Pre Order date when the PR has no forecast |
| `tests/forecast/test_schedule.py` | 12 forecast tests / 5 | the PR is stamped with its item's forecast and "null" is no PR; shipment of a PR = earliest `Date_Shipped`; a PR with a SOF is not in the second pass; blank Shipment_Mode "null"; `Schedule_Test_Settings` sets a test "today"; second run writes nothing; schedule and on-save stamp give the same forecast |
| `tests/forecast/test_hooks.py` | 7 / 5 | the stamp does not fire itself (saving again changes nothing). The 7th Node test is the Delivery stamp: deferred to the Delivery port |
Already equal and not to be redone: engine 15/15, pipeline 13/13, QC routing 8/8, crate/dispatch 7/7, exception recheck 7/7,
payment approval 5/5, readiness gate 5/5, box-count API 3/3, sorter hooks 7/7. Not counted: `tests/fulfillment.test.js` and
`tests/forecast.test.js` test an old in-memory prototype (`src/domain`), and 2 of the 8 `procurement-forecast-settings` tests
are Procurement's settings page (deferred).
Done when: all 19 pass on Python.
**Status 2026-11-19: DONE.** All 19 were written and pass on the first run, so this phase found no gap in `app/` and no lost Node quirk. Counts now
match Node: sorter 32, stage events 7, stamp 14, purchase request 12, schedule 12, hooks 6 (the 7th Node test is the Delivery stamp, deferred).
Two things found on the way: (1) the existing Python test `test_the_six_queue_columns_exist_on_sales_order_fulfillment_schema` was an empty `pass`;
it now writes and reads the columns like Node's (fixed 2026-11-19). (2) Node's own schedule test "blank Shipment_Mode on the SOF" uses an unescaped
regex that matches any string, so in Node it checks nothing; the Python version checks the text for real.

### Phase 2: prove "same as Node" with more than counts
Equal counts do not prove equal assertions.
Status 2026-11-19 (done by reading and by running Node and plain Python, NOT by running the Python test suite): the Node reference files
exist (2.2 and 2.3 below). The pure model comparison was run directly: 102 forms, every column, the lookup formats and all 92
reports match Node with zero differences. The schema and golden-flow Python tests are written but not run yet (they need the local Postgres of Phase 0).
2.1 (DONE 2026-11-20, `tools/build-parity-matrix.py`) Parity matrix: a script lists every Node Fulfillment/forecast test title next to its Python test (by hand-kept mapping
    file). Output `docs/superpowers/plans/parity-fulfillment.md`. Rule: every Node test is mapped or listed as deferred
    with a reason.
2.2 (reference files made; model checks pass; schema test written, not run) Schema parity: run the Node model once to export the column map of every form Fulfillment touches
    (`tests/fixtures/node_columns.json`, kept in git). A Python test compares `app/model.py` and the generated DDL to it, so
    the `spec-forms` merge cannot drift.
2.3 (script, Node run and Python replay written; Python replay not run) Golden flow: run one scripted Fulfillment flow in Node once (package with a package number, then Readiness, Release,
    Pick, Mark Picked, QC approve and reject, repair and recheck, Crate done, To Ship, Dispatch), snapshot the resulting rows
    with ids and timestamps masked (`tests/fixtures/golden_fulfillment_flow.json`). A Python test replays the same writes
    through the hooked store and compares. After this, Node is no longer needed to run the tests.
Done when: matrix has no unmapped Node test, schema parity and golden flow pass.

**Found while building 2.3 (2026-11-19): a real defect, in Node and therefore in the Python copy.** `Stage_Events` logs only the first stage of a
package. Across a whole flow (Readiness, Picking, Pack & QC, Order Aggregation, For Delivery) the Node run produced ONE event. `advanceStage`,
`reconcileFulfillment` and the QC / crate / dispatch routing write `Fulfillment_Stage` through the RAW store inside a hook, and a raw-store
write never fires the Stage_Events `afterUpdate` hook; the existing tests only save through the hooked store directly, so they did not see it.
Impact: the stage log (spec D13) is incomplete; the Scoreboard and aging-guard slices that read it would be wrong; and Delivery Analytics #7 (Ship to
Service Request gap) needs `package.order_aggregation`, which production would never write. The golden expectation records the current
behavior on purpose (`known_defects` in the file). Fix belongs in Python as step 7.0 below, with the expectation regenerated deliberately.

### Phase 3: the scheduler runner (generic; Fulfillment is its first user, Delivery and Procurement use it later)
3.1 `app/schedules.py`, ported from `server/schedules.mjs` (81 lines): local date and minutes in a time zone (`zoneinfo`);
    table `_schedule_runs`; a schedule is due when local time has reached its `at` and it has not been tried that local day;
    the day is recorded when the run STARTS, so a failing job is logged and not retried until tomorrow; a server that was down at
    the time runs it when it comes back the same day; one Postgres advisory lock per schedule so two instances never run the
    same job; OFF unless `SCHEDULES=on`; jobs get the plain store (no hooks), like a Zoho schedule.
3.2 `SCHEDULES` list in `app/fulfillment/__init__.py` with the 3 jobs, same names and times as Node.
3.3 Start and stop the runner in `app/main.py`'s lifespan, only when `SCHEDULES=on`.
3.4 Tests: the 7 Node runner tests (local time in a zone: 01:00 Manila is 17:00 UTC the day before; once a day and only after its
    time; down at 01:00 then back; a failing job is logged, not retried, does not stop the next one; an instance that cannot get
    the lock skips; off unless `SCHEDULES=on`; the module lists its schedules), with an injectable clock and two connections for
    the lock.
Done when: the 7 tests plus a manifest test pass, and a local run with `SCHEDULES=on` shows the three jobs listed.
**Status 2026-11-20: DONE.** `app/schedules.py`, `SCHEDULES` in `app/fulfillment/__init__.py`, started and stopped in `app/main.py`'s lifespan. 13 tests
(11 in `tests/test_schedules.py`, 2 in `tests/test_main.py`); a local app start with `SCHEDULES=on` listed the three jobs. Not checked: a job firing at its real time
on a running server, two real instances. Time zone: Python uses `zoneinfo` (needs `tzdata` on Windows, already added).

### Phase 4: tools and data
4.1 `python -m app.tools.fulfillment_sync`: the catch-up sweep, replacing `tools/fulfillment-sync.mjs`
    (`reconcile_fulfillment` already exists).
4.2 `python -m app.tools.seed_fulfillment`: the Fulfillment part of `server/seed-ops.mjs` (sample sales orders SO-90001..90005,
    `Added_User = sample-data`), through the hooks; refuses a database that already has rows.
4.3 Make the data and static paths configurable (environment variables with today's defaults) and fail loudly when one is missing.
Done when: both commands run on the local database and a test covers each.
**Status 2026-11-20: DONE** (`app/tools/fulfillment_sync.py`, `app/tools/seed_fulfillment.py`, `app/paths.py`; 16 tests in `tests/test_tools.py`).

### Phase 5: what the Fulfillment widgets need from the API
5.1 Register explicit placeholders for `check_payment_status`, `create_package_ff` and `add_item_by_id` that answer in Node's
    shape ("not ported yet", `status: error`) so the widgets show a clear message; test the shape. The real versions wait for
    Books (on hold).
5.2 Check the reconcile-after-custom-API path has its own test in `tests/test_main.py` (it is wired, not yet proven).
5.3 Widget smoke test: start the Python server on the local database and load each of the 11 Fulfillment widgets in jsdom
    (no console errors); drive one real flow through the widgets' own calls (Release, Mark Picked, QC, Crate, To Ship, Dispatch).
Done when: all 11 widgets load against the Python server and the flow passes.
**Status 2026-11-20: 5.1, 5.2 and 5.3 DONE.** All 11 widgets load with data on the Python server (Chrome, local database) and the flow Release -> Mark Picked -> QC reject -> Exception Control Completed -> To Ship Dispatch was clicked through with 0 server errors. The browser check found 3 real bugs in total (getRecords with extra keys; uploaded file names; an exception with no Status did not block the package), all fixed with tests. 443 tests pass. Update (later the same day): Transfer Item, Kanban, Dashboard, Sales Order Report and Pre-Order were then used too (5 bugs found in the whole browser check; 446 tests pass). Then the Crate photo 404, the stale banner and both Groupings views were checked too (Crate widget fixed). **Phase 5 is closed.** Only what needs Books (Create Package, add item by ID, check payment; on hold), real files and a tablet are left.

### Phase 6: Fulfillment cut-over gate
All of these true: phases 0 to 5 done; parity matrix complete; the owner has clicked through Fulfillment in a browser on the
Python server and says it matches; the scheduler ran its three jobs locally. Then Node's Fulfillment code is marked deprecated
(not deleted: Delivery and Procurement still run on Node until they are ported). Update `CLAUDE.md` (it still describes the
Node workflow: `npm run dev:pg`, `npm test`).
**Status 2026-11-20: PREPARED, NOT CLOSED.** Done: parity matrix (`parity-fulfillment.md`, 192 Node tests, 0 unmapped, 33 deferred with reasons; 2 missing Python tests written), the scheduler ran its three jobs on the real server, `CLAUDE.md` updated. Waiting for the owner: click through Fulfillment on the Python server and say it matches. Only after that: mark the Node Fulfillment code (`server/modules/fulfillment`) deprecated.

### Phase 7: the spec v1.4 gaps, in Python only
7.1 First write "Fulfillment vs Spec v1.4 - para sa review.md": the 6 spec documents in
    `Desktop\HomeCartel Supply Chain System - Specification v1.4\03 Fulfillment` against the Python code, rule by rule, like the
    Delivery and Procurement reviews. Build nothing before it exists.
    **Status 2026-11-20: DONE (the review file is written; nothing built from it).** `Fulfillment vs Spec v1.4 - para sa review.md` at the repo root, with 5 open questions for the owner. Not read: 05/02 Calculators, 05/05, 05/08, JV's slices 6 to 10.
7.0 First fix the Stage_Events defect above: one function that sets `Fulfillment_Stage` and logs the event, used by `advance_stage`,
    `reconcile_fulfillment`, QC routing, crate/dispatch and the two stage hooks (and, when Delivery ports, by anything else that moves a stage).
    Tests first: a test that walks a package to For Delivery and expects one event per stage entered, in order; then regenerate the golden
    expectation. Ask JV first: it is in his Fulfillment slice.
    **Status 2026-11-20: DONE (the owner said go ahead; JV not asked yet, tell him).** `app/fulfillment/stage.py` `set_stage()` is the one place; the 4 raw write
    sites use it. 6 new tests (5 in `test_stage_events.py`, 1 in `test_golden_flow.py`); the golden expectation was regenerated with `REGENERATE_GOLDEN=1` and only its
    Stage_Events rows changed. Full suite 335 passed.
**2026-11-20 part 2 (owner: follow the files, recommend where silent): cut line stops at the package that would exceed, WIP = Picking..Crate, slack with work days, aging opens an Exceptions row, notifications on category change, capacity_summary API + widget figures; 417 tests pass. Not done: Release selected/all, morning list, sales-agent recipient.**
    **2026-11-20 (owner): sorting engine gaps DONE** (blocked contact/items with owner, category-first ranking, sort_primary_key, urgency M1, suggested actions, aging guard as notification, job_runs, stale banner, Recalculate, re-score on stage change and exceptions; 400 tests pass; open: review questions 2, 3, 6, 7).
    **2026-11-20 (owner): QC-R2, QC-R3 and CR-R2 are MANDATORY. DONE** (`app/fulfillment/mandatory.py`, Crate weight/size columns, both widgets upload first; 367 tests pass; browser click-through still to do).
    7.2 Known gaps to expect on it: aging guard and silence alerts (Slice 3), manual urgency (Slice 5; `urgent` is always 0 today),
    Scoreboard medians from `Stage_Events` (Slice 12), the `package.box_counted` stamp, slices 6 to 10 (only in JV's earlier
    conversation, ask JV), the Order Readiness rules (OR-R1 blocking gates, OR-R5 override reasons, OR-R6 notifications, OR-R8
    credit-limit check, crew sizing). Delivery's gates G1/G3/G5 read Fulfillment's package lines, so keep that shape stable.
7.3 Each gap: short design note, tests first, then code, one commit each.

### Phase 8: after Fulfillment (pointers only, to be planned separately)
Delivery port (about 30 files, today's Analytics, Control Panel, gates, rotation and its 6 schedules), then Procurement, then
Books / Akeneo / Shopify, then retire Node: move `spec-forms`, `pages.json`, `public` and the parsed forms to a neutral folder,
remove `server/*.mjs`, update README and scripts.

## 4. Things that need a decision

1. Local Postgres on every PC that runs the Python tests (install or Docker)? Python has no in-memory Postgres like PGlite.
2. May Python tests ever use the shared Railway database? Recommendation: never.
3. Who edits `app/` when: JV and this branch both touch it. Recommendation: pull before each phase, small commits.
4. Slices 6 to 10 of JV's gap list: ask JV for the list (it is not in the repo).
5. When Node's Fulfillment code is deleted: Recommendation: not before the whole app runs on Python.

## 5. What this plan does not cover

Books-dependent APIs (until Books is un-held), SMS and tracking (on hold by the owner), the Delivery and Procurement ports, and
roles (on hold).
