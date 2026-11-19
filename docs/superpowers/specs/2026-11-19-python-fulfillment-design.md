# Python Fulfillment — Design

Date: 2026-11-19
Depends on: Foundation (`docs/superpowers/specs/2026-11-19-python-foundation-design.md`), all 8 tasks committed, 117/117 tests passing.
Node reference: `C:\Users\Admin\Desktop\JV\OTHERS\Supply-Chain-SystemV2\server\modules\fulfillment\*` (958 lines, 11 files) and `server\forecast\*` (690 lines, shared).

## 1. Purpose

Port Fulfillment's server-side business logic to Python/FastAPI, reproducing `jv-update`'s current behavior exactly — not the fuller HomeCartel spec v1.4 (confirmed explicitly with the user: Node parity first, spec gaps are a later slice, same governing rule as Foundation). This is the pipeline that moves a package through Sales Order → Order Readiness → Pick → Pack & QC → Crate → Order Aggregation → For Delivery, plus the sorting engine that ranks what to work on first.

## 2. Scope

**In scope** (ported 1:1 from Node, byte-for-byte widget HTML/JS untouched):

- `where.py` — `eq()` criteria-string builder
- `workflows.py` — `needs_payment_approval`, `package_stage`, the two stage-rule hooks (`stageOnSave`/`stageOnGateSave`), the `Warehouse_Request` item-image hook
- `sorter.py` — `categorize`, `rank_and_cut_line`, `rescore_all`
- `sorter_hooks.py` — event-triggered re-score on package/Gate save
- `pipeline.py` — `advance_stage`, `so_to_readiness`, `release_to_pick`, `picked_to_qc`, `all_picked_for_package`, `reconcile_fulfillment`
- `qc_routing.py` — Pack & QC → Crate / Order Aggregation / Exception Control
- `crate_dispatch.py` — Crate → To Ship → For Delivery, Pre-Order → Readiness Gate
- `exception_recheck.py` — Exception Control → back to Pack & QC
- `stage_events.py` — generic `Stage_Events` logger hook (catches every stage-changing write site)
- `apis.py` — custom API dispatch: `recalculate_fulfillment_queue`, `package_pick_status` real; `check_payment_status`, `create_package_ff` stay "not ported yet" placeholders (confirmed with the user: match Node's own actual incompleteness, not invent new behavior Node doesn't have)
- `__init__.py` — module manifest: forms list, imports that register every hook

**Also in scope** (confirmed with the user as shared infrastructure, not Fulfillment-exclusive, but ported now since Fulfillment is the first real consumer):

- `app/forecast/engine.py`, `hooks.py`, `pr_hooks.py`, `purchase_request.py`, `schedule.py`, `stamp.py` — ports of `server/forecast/*`
- `app/policy.py` — `policy_reader(store)`, duplicated out of `delivery-management/scheduling.mjs` (3 lines, reads `Policy_Settings` by key) into a shared location since Delivery isn't built yet

**Out of scope** (confirmed with the user):

- Actual cron/scheduler wiring (`server/schedules.mjs`). The three Node schedules (`Forecast_Stamp_Daily`, `Backfill_PreOrder_Forecas`, `Recalculate_Fulfillment_Queue`) are ported as plain callable functions only — no automatic nightly trigger yet.
- The fuller HomeCartel spec v1.4 Order Readiness rules (OR-R1 blocking gates, OR-R5 override reasons, OR-R6 notifications, OR-R8 credit limit check, crew sizing) beyond what Node's `sorter.mjs`/`workflows.mjs` already implement today.
- `check_payment_status` / `create_package_ff` real implementations (Node hasn't built these either).
- Delivery Management's own `scheduling.mjs` (only the one `policy_reader` helper is borrowed from it).

## 3. Architecture

Each Node file becomes one Python file with the same name (snake_case), same functions, same hook registrations — direct behavioral ports, not transpiles, matching Foundation's own stated approach. All hook registrations use Foundation's `app.workflows.register()`; `app/fulfillment/__init__.py` imports every submodule so hooks register on import, mirroring Node's `index.mjs`.

`reconcile_fulfillment(store, user="system")` is the catch-up sweep for writes that bypass hooks (custom APIs, imports). Node's `server/pg/api.mjs` calls it after any Fulfillment custom API — this integration point was explicitly deferred out of Foundation's `app/main.py` and is wired here: `api_dispatch`'s `invokeCustomApi` branch calls `reconcile_fulfillment(raw_store)` after the custom API returns, only when `api_name` is one of Fulfillment's own `functions`/`apis` keys.

## 4. Data flow (unchanged from Node, reproduced exactly)

1. `Sales_Order_Fulfillment` (one row per package) saved with a package number → `so_to_readiness` creates/refreshes one `Sales_Order_Readiness_Gate` row per item line.
2. A Gate row saved with `Release` checked → `release_to_pick` creates/updates its `Pick1` row, adds a `Pick_Notifications` row, advances the package's `Fulfillment_Stage` to "Picking". Gate rows still needing payment approval (`needs_payment_approval`) never reach Pick.
3. A `Pick1` row saved with `Marked` checked → `picked_to_qc` creates/updates its `Checker_Checklist` (QC) row, advances the stage to "Pack & QC".
4. QC approved/rejected → `qc_routing` routes to Crate, Order Aggregation, or Exception Control (one `Exception_Control1` row per rejected unit).
5. Exception Control "Completed" → `exception_recheck` sends repaired units back to a pending QC row (or creates one).
6. Crate done → `crate_dispatch` advances to Order Aggregation → For Delivery.
7. Every `Fulfillment_Stage` change is logged to `Stage_Events` by one generic hook (`stage_events.py`), catching all five write sites without a logging call at each one.

Stage moves are forward-only (`STAGE_ORDER` list) — a record already further along is never pulled back, matching Node's explicit, documented deviation from the original Zoho script.

## 5. Testing

One Python test file per Node test file (11 total: `fulfillment-pipeline`, `fulfillment-sorter`, `fulfillment-sorter-hooks`, `fulfillment-qc-routing`, `fulfillment-crate-dispatch`, `fulfillment-exception-recheck`, `fulfillment-stage-events`, `fulfillment-box-count-api`, `fulfillment-payment-approval`, `fulfillment-readiness-gate`, `fulfillment`), reusing the same scenarios for direct parity-checking against Node's own test suite. Forecast gets its own test files mirroring Node's existing ones: `tests/forecast.test.js`, `tests/forecast/engine.test.js`, `hooks.test.js`, `purchase-request.test.js`, `stamp.test.js` (`schedule.test.js` covers cron wiring, out of scope per §2 — its underlying job functions are still tested through the other forecast test files and through Fulfillment's own tests). Tests run against local Postgres (`supply_chain_test` schema), matching Foundation's settled, non-flaky test setup — not the Railway tunnel.

## 6. What this slice does NOT change

No widget HTML/JS is touched. `app/main.py`'s only change is the `reconcileFulfillment`-after-custom-API wiring described in §3 — everything else in Foundation's HTTP layer, store, access, and auth is untouched.
