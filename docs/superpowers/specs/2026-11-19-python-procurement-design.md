# Python Procurement — Design

Date: 2026-11-19
Depends on: Foundation (all 8 tasks) and Fulfillment (all 17 tasks + the post-smoke-test fix commit `dc1fcf4`), both committed on `main`, 273/273 tests passing.
Node reference: `C:\Users\Admin\Desktop\JV\OTHERS\Supply-Chain-SystemV2\server\modules\procurement\*` (36 files, 5018 lines) and `server\workflows\suppliers.mjs` (33 lines, Procurement-only).

## 1. Purpose

Port Procurement's server-side business logic to Python/FastAPI, reproducing `jv-update`'s current behavior exactly — Node parity first, not the fuller HomeCartel spec v1.4, same governing rule as Foundation and Fulfillment. This is Inquiry → Purchase Request → Purchase Order → Shipments → Ship & Track → Receiving, plus Replacement Requests, Exceptions, the Decisions/Approval Queue, Procurement Settings, and the Procurement Dashboard.

## 2. Scope

**In scope** (ported 1:1 from Node, byte-for-byte widget HTML/JS untouched):

- `app/procurement/suppliers.py` — `SUPPLIERS`, `supplier_index`, `quote_books_id`, `portal_of` (config data, not a live Books call — `quote_books_id` just reads a supplier-identifier field)
- `app/procurement/settings_defs.py` — `default_settings()`, `problem_with()` (Control Panel's setting catalogue and validation)
- `app/procurement/plan.py` — the feasibility calculator and planned/forecast chain (spec v1.4 Calculators §3, pure arithmetic, 13 cross-importers in Node — genuinely central, every number comes from a setting)
- `app/procurement/inquiry.py` + `inq_spec.py` — Inquiry Form hooks + `run_inquiry_daily` (no-quote alert)
- `app/procurement/purchase_request.py` + `pr_spec.py` — PR hooks + feasibility/pricing/ranking (spec v1.4)
- `app/procurement/purchase_order.py` + `po_spec.py` — PO hooks + state/events/acknowledgement alert (spec v1.4)
- `app/procurement/po_approval.py` — PO approval, **pure-logic half only** (Node's own comment: "the second half, which books the PO in Zoho Books, is not ported")
- `app/procurement/po_create.py` — "Create PO" button logic (the Purchase Request tab's `callApprovePOApi` target)
- `app/procurement/shipments.py` + `ship_track.py` — Shipment hooks + Ship & Track (stage events, photo gate, planned dates, sorting engine; spec v1.4)
- `app/procurement/clone_shipment.py` — `clone_shipment_for_replacement`
- `app/procurement/receiving.py` + `receiving_spec.py` — Receiving hooks + the four stamped events, readiness, fault origin, Arrivals ranking (spec v1.4)
- `app/procurement/receiving_buttons.py` — `create_receiving_from_shipment`
- `app/procurement/replacement_requests.py` + `replacement_exceptions.py` + `rr_spec.py` — `create_rr_main/tony/fenteng`, RR exception hooks, RR report + `run_rr_daily`
- `app/procurement/decisions.py` + `decisions_core.py` — the Decisions list / Approval Queue (spec v1.4) — confirmed in scope: Node's own `workflows.mjs` imports `decisions.mjs` directly to register its hooks, even though no other Procurement file imports it
- `app/procurement/settings_hooks.py` — Procurement Settings page hooks (preview, recalculate, get-settings custom APIs)
- `app/procurement/dashboard.py` — `get_procurement_dashboard`
- `app/procurement/sorting.py` — Procurement's own sorting-engine piece (distinct from Fulfillment's `app/fulfillment/sorter.py` — different queue, same spec family)
- `app/procurement/events.py` — Procurement's own copy of the shared event-log helper pattern (Node: a form belongs to one module's event log; Procurement writes its own)
- `app/procurement/shipment_schedules.py` — `run_shipment_10_day_check`, `run_shipment_delay_status` (plain callables, no cron)
- `app/procurement/projects.py` — Project hooks
- `app/procurement/supplier_portal_workflows.py` — supplier acknowledgement/approval **hooks** (confirmed distinct from `supplier-portal.mjs` without the `-workflows` suffix, which is Tony Fan/Fenteng's own custom-API functions file — out of scope, see below)
- `app/procurement/production_portal.py` — production-portal hooks (registered by Procurement's `workflows.mjs`; consumed later by Tony Fan/Fenteng's own custom APIs, but the hook registration itself is Procurement's)
- `app/procurement/apis.py` — custom API dispatch table; every non-Books/Akeneo entry from Node's `functions` dict gets a real handler
- `app/procurement/__init__.py` — module manifest, imports every submodule above plus `app.forecast.pr_hooks` (already ported during Fulfillment, deliberately left unwired until now — this is the integration point Fulfillment's own design doc named as "Procurement's own future slice imports it")

**Out of scope** (confirmed with the user):

- `books-apis.mjs`, `akeneo-apis.mjs`, `estimates.mjs` (needs a live Books estimate) — all three need Zoho Books/Akeneo API clients, which Foundation's design explicitly excludes. Their custom API names (`add_item_by_id`, `create_books_contact`, `fetch_customer_from_books`, `search_items_akeneo`, `fetch_item_from_akeneo`, `create_estimate`) stay "not ported yet" placeholders in `app/procurement/apis.py`, matching Node's own `withPlaceholders()` pattern.
- `create_bin_receiving` — genuinely still unimplemented in Node itself (listed in Node's `functions` dict but absent from `withPlaceholders()`'s `implemented` argument). Stays a placeholder.
- `po-approval.mjs`'s second half (the actual Zoho Books booking step) — not ported in Node either.
- `server/modules/procurement/supplier-portal.mjs` (no `-workflows` suffix) — this is Tony Fan's and Fenteng Lighting's own custom-API functions file (`acknowledge_po_tony`/`approve_rr_tony`/`acknowledge_po_fenteng`/`approve_rr_fenteng`), imported by `tony-fan/apis.mjs` and `fenteng-lighting/apis.mjs`, not by Procurement's own `workflows.mjs`. Tony Fan and Fenteng Lighting are their own future sub-projects.
- Actual cron/scheduler wiring — the 5 Node schedules (`Daily_Shipment_10_Day_Che`, `Shipment_Delay_Status_Dai`, `Shipment_Ladder_Daily`, `Inquiry_Quotes_Daily`, `Replacement_Daily`, `Receiving_Silence_Daily`) are ported as plain callable async functions only.
- The fuller HomeCartel spec v1.4 rules beyond what Node's Procurement module already implements today.
- `server/modules/procurement/forecast-settings.mjs` — **already ported** during Fulfillment as `app/forecast/forecast_settings.py`. Not re-ported here.

## 3. Architecture

Each Node file becomes one Python file with the same name (snake_case), same functions, same hook registrations — direct behavioral ports, matching Foundation's and Fulfillment's own stated approach. All hook registrations use Foundation's `app.workflows.register()`. `app/procurement/__init__.py` imports every submodule so hooks register on import, mirroring Node's `workflows.mjs` import list, and is itself imported by `app/procurement/__init__.py`'s own manifest (matching Node's `index.mjs` importing `workflows.mjs`).

The one real cross-slice wiring point: `app/forecast/pr_hooks.py` (ported during Fulfillment, Task 6, deliberately not imported by `app/fulfillment/__init__.py`) gets imported by `app/procurement/__init__.py` here — exactly matching Node's `workflows.mjs` importing `../../forecast/pr-hooks.mjs` as its own last line.

`app/procurement/plan.py` is foundational within this slice: `inquiry.py`, `pr_spec.py`, `po_spec.py`, `ship_track.py`, and others all read feasibility/planned-chain numbers from it, and it in turn reads from `app/forecast/forecast_settings.py` (already ported) so the plan and the forecast engine use the same settings values — this dependency direction is preserved exactly.

## 4. Data flow (unchanged from Node, reproduced exactly)

1. An `Inquiry_Form` record collects supplier quotes; `inq_spec.py`'s daily job flags a supplier who hasn't quoted after `inquiry_quote_days`.
2. A `Purchase_Request1` (PR) is created from a feasible inquiry line; `pr_spec.py` stamps feasibility, pricing status, and ranking using `plan.py`'s calculator.
3. `po_create.py` creates a `Purchase_Order` from an approved PR; `po_approval.py`'s pure-logic half validates state before the (not-ported) Books booking step.
4. `po_spec.py` tracks PO state/events and an acknowledgement alert; never deleted.
5. A PO's `Shipments` record is tracked through `ship_track.py`: stage events, a photo gate, planned dates (from `plan.py`'s chain), and Procurement's own sorting engine (`sorting.py`).
6. `Receiving` records the four physical events (received, counted, binned, ready); `receiving_spec.py` computes readiness (counted AND binned), fault origin, and the Arrivals ranking.
7. A damaged/short shipment creates a `Replacement_Request`; `replacement_exceptions.py` and `rr_spec.py` track it, with a daily alert for an un-acknowledged RR.
8. The Decisions list / Approval Queue (`decisions.py` + `decisions_core.py`) surfaces what needs a human decision across the whole chain.
9. Procurement Settings (`settings_defs.py` + `settings_hooks.py`) is the Control Panel every number above ultimately reads from, validated at save (CP-R6) with a "preview the effect" custom API (CP-R4).

## 5. Testing

One Python test file per Node test file, reusing the same scenarios for direct parity-checking: `tests/procurement/test_inquiry_workflows.py`, `test_pr_workflows.py`, `test_supplier_copies.py` (from `tests/procurement/*.test.js`), plus `tests/test_procurement_dashboard.py`, `test_procurement_decisions.py`, `test_procurement_inq_spec.py`, `test_procurement_po_approval.py`, `test_procurement_po_shipments.py`, `test_procurement_po_spec.py`, `test_procurement_pr_spec.py`, `test_procurement_receiving_buttons.py`, `test_procurement_receiving_spec.py`, `test_procurement_receiving.py`, `test_procurement_rr_spec.py`, `test_procurement_ship_track.py` (from the top-level `tests/procurement-*.test.js` files). `tests/procurement-supplier-portal.test.js` and `tests/procurement-supplier-portal-spec.test.js` ARE in scope despite the name — they test `supplier-portal-workflows.mjs`'s hooks and spec v1.4 supplier-portal rules, not the out-of-scope `supplier-portal.mjs` functions file. `tests/procurement.test.js` tests an unrelated in-memory `src/domain/*` prototype (same trap as Fulfillment's own `tests/fulfillment.test.js`) — excluded. `tests/procurement/books-apis.test.js` and `books-estimates.test.js` are excluded (Books-dependent). `tests/procurement-forecast-settings.test.js` is already covered by Fulfillment's `tests/forecast/test_forecast_settings.py`. The two `tests/e2e/procurement-*.test.js` files are read as reference for real end-to-end behavior but not mirrored 1:1 (they drive a child-process server, a different test shape than this plan's unit/integration style). Tests run against local Postgres (`supply_chain_test` schema via `TEST_DATABASE_URL`), not the Railway tunnel.

## 6. What this slice does NOT change

No widget HTML/JS is touched. `app/main.py` needs no new wiring this slice (Procurement has no equivalent of Fulfillment's `reconcileFulfillment`-after-custom-API catch-up in Node — confirmed by reading `server/pg/api.mjs`, which only special-cases Fulfillment's `functions`). Everything in Foundation's and Fulfillment's own files is untouched.
