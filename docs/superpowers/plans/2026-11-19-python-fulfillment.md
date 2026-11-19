# Python Fulfillment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Fulfillment's server-side business logic (sales order → readiness → pick → pack & QC → crate → order aggregation → for delivery, plus the sorting engine and the forecast engine it depends on) from `jv-update`'s Node/Postgres implementation to Python/FastAPI, reproducing current Node behavior exactly.

**Architecture:** Direct behavioral ports (not transpiles) of 17 Node files into the same number of focused Python files, following Foundation's established pattern: one Python file per Node file, same function names (snake_case), same hook registrations via `app.workflows.register()`. Forecast (`app/forecast/*`) is ported first since Fulfillment's pipeline reads `Forecast_*` fields throughout. A small shared `app/deluge.py` carries the handful of Deluge-idiom helpers (`blank`, `truthy`, `addDays`, `dayDiff`, `todayDate`, `parseDate`, `ymd`) that both forecast and fulfillment files need, ported once rather than duplicated per file.

**Tech Stack:** Python 3.12, FastAPI, `asyncpg`, `pytest` + `pytest-asyncio`, local Postgres (`supply_chain_test` schema via `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test`) — not the Railway tunnel, which proved too flaky for reliable test runs this session.

**Spec:** `docs/superpowers/specs/2026-11-19-python-fulfillment-design.md`

## Global Constraints

- Every hook registered via `app.workflows.register(form, hooks)` only fires for writes made through a `HookedStore` (`create_hooked_store`); a plain `Store` never fires hooks. Every Fulfillment/forecast test file must clear `app.workflows.WORKFLOWS` between tests (an `autouse` fixture doing `WORKFLOWS.clear()` before and after each test) exactly like Foundation's own `tests/test_workflows.py` does — otherwise hooks registered by one test file leak into another's run, since `WORKFLOWS` is a shared module-level dict.
- `store.find(form_name, test=lambda r: True, *, criteria=None)` always returns **raw** rows (lookup fields as plain IDs, never resolved display objects) — confirmed from `app/store.py:257-264`. Every Node `store.find(form, predicate, { criteria })` call becomes `await store.find(form, lambda r: predicate(r), criteria=criteria_string)` in Python.
- `store.update_record(report_or_form, id, data, *, by_form=False)` on the raw `Store` takes no `user` kwarg; `HookedStore.update_record(report_or_form, id, data, *, by_form=False, user="")` does (for hook context only, not passed down to the raw store). Node's `{ byForm: true }` maps to Python's `by_form=True`.
- Record IDs are strings end-to-end (never cast to `int`/`float`) — inherited from Foundation, unchanged here.
- `app/custom_apis.py`'s `invoke_custom_api(name, payload, store, ctx) -> dict` calls `fn(payload, store, ctx)` on whatever is registered in `CUSTOM_APIS[name]` — every Fulfillment custom API handler has this exact 3-argument async signature.
- `tests/fulfillment.test.js` in the Node repo tests an unrelated in-memory prototype (`src/domain/*.js`), NOT `server/modules/fulfillment/*` — it is excluded from this plan's test-mirroring list entirely (confirmed by reading it: different import paths, different domain model, no Postgres).
- `tests/forecast/hooks.test.js`'s last test ("the Delivery stamps...") exercises `server/modules/delivery-management/forecast-stamp.mjs`, which is Delivery's own file, out of scope here — the mirrored Python test file omits that one case; the other 6 cases in that file are in scope.
- `server/forecast/pr-hooks.mjs` registers on `Purchase_Request1` and is imported by Node's **Procurement** module (`server/modules/procurement/workflows.mjs`), not Fulfillment's `index.mjs` — `app/forecast/pr_hooks.py` is ported and tested (it mirrors `tests/forecast/purchase-request.test.js`'s hook test directly) but is **not** imported by `app/fulfillment/__init__.py`. Procurement's own future slice imports it, matching Node's actual wiring boundary exactly.
- `server/modules/procurement/forecast-settings.mjs` has no real Procurement module-code dependency — it only reads the generic `Forecast_Settings` and `Procurement_Settings` forms (both already in Foundation's model) and calls `engine.mjs`'s own exports. It is ported as `app/forecast/forecast_settings.py` (inside the forecast package, not a `procurement` package that doesn't exist yet) since it is genuinely forecast-settings logic.
- Scheduled jobs (`runForecastStampDaily`, `runBackfillPreOrder`, `rescoreAll` as a schedule target) are ported as plain callable async functions only — no cron/scheduler wiring (`server/schedules.mjs` is not ported this slice).
- `check_payment_status` and `create_package_ff` are still "not ported yet" placeholders in Node itself (confirmed: `server/modules/fulfillment/apis.mjs`'s `functions` dict lists them, but `withPlaceholders(functions, { recalculate_fulfillment_queue, package_pick_status })` never implements them) — Python's `app/fulfillment/apis.py` matches this exactly, registering no handler for either name so `invoke_custom_api` answers with the standard "not ported yet" message.
- Forms referenced throughout (`Policy_Settings`, `Forecast_Settings`, `Procurement_Settings`, `Pick_Notifications`, `Exception_Control1`, `ExceptionControl_Notifications`, `Replacement_Request`, `Schedule_Test_Settings`, `Customer`, `Purchase_Request1`, `Shipments`, `Capacity_Days`, `Stage_Events`) are all already in Foundation's model (`zoho-export/parsed/forms/*.json` or `server/spec-forms/*.json`); `All_Qc_Reports1` is a report, read via `store.get_records`, confirmed present in `zoho-export/parsed/reports.json`. No schema changes are needed in this plan.

---

## File Structure

| File | Ports | Node source |
|---|---|---|
| `app/deluge.py` | `blank`, `truthy`, `addDays` → `add_days`, `dayDiff` → `day_diff`, `todayDate` → `today_date`, `parseDate` → `parse_date`, `ymd` | `server/workflows/deluge.mjs` (partial: only what Fulfillment/forecast use) |
| `app/forecast/engine.py` | `DEFAULT_SETTINGS`, `settings_from`, `bucket_of`, `compute_forecast`, `finish` | `server/forecast/engine.mjs` |
| `app/forecast/forecast_settings.py` | `FORECAST_FIELDS`, `is_forecast_key`, `ENGINE_DEFAULTS`, `forecast_record`, `forecast_settings`, `forecast_values`, `plan_numbers` | `server/modules/procurement/forecast-settings.mjs` |
| `app/forecast/stamp.py` | `NULL_TEXT`, `txt`, `to_date`, `fc_stamp_by_so_no` | `server/forecast/stamp.mjs` |
| `app/forecast/hooks.py` | the 7 Instant Forecast hook registrations | `server/forecast/hooks.mjs` |
| `app/forecast/purchase_request.py` | `fc_stamp_purchase_request`, `fc_pr_to_pre_order` | `server/forecast/purchase-request.mjs` |
| `app/forecast/pr_hooks.py` | the `Purchase_Request1` hook registration (not imported by Fulfillment) | `server/forecast/pr-hooks.mjs` |
| `app/forecast/schedule.py` | `run_forecast_stamp_daily`, `run_backfill_pre_order` (plain callables, no cron) | `server/forecast/schedule.mjs` |
| `app/fulfillment/where.py` | `eq` | `server/modules/fulfillment/where.mjs` |
| `app/fulfillment/workflows.py` | `needs_payment_approval`, `package_stage`, stage hooks, `Warehouse_Request` item-image hook | `server/modules/fulfillment/workflows.mjs` |
| `app/fulfillment/sorter.py` | `capacity_for`, `categorize`, `effective_boxes`, `rank_and_cut_line`, `backlog_days`, `people_needed`, `rescore_all`, `rescore_one` | `server/modules/fulfillment/sorter.mjs` |
| `app/fulfillment/sorter_hooks.py` | the two re-score hook registrations | `server/modules/fulfillment/sorter-hooks.mjs` |
| `app/fulfillment/pipeline.py` | `STAGE_ORDER`, `advance_stage`, `so_to_readiness`, `release_to_pick`, `all_picked_for_package`, `picked_to_qc`, `reconcile_fulfillment` | `server/modules/fulfillment/pipeline.mjs` |
| `app/fulfillment/qc_routing.py` | `upsert_to_ship`, `qc_routing` | `server/modules/fulfillment/qc-routing.mjs` |
| `app/fulfillment/crate_dispatch.py` | `crate_to_ship`, `dispatch_stage`, `pre_order_to_gate` | `server/modules/fulfillment/crate-dispatch.mjs` |
| `app/fulfillment/exception_recheck.py` | `repaired_to_qc` | `server/modules/fulfillment/exception-recheck.mjs` |
| `app/fulfillment/stage_events.py` | `stage_slug`, the `Sales_Order_Fulfillment` logging hook | `server/modules/fulfillment/stage-events.mjs` |
| `app/fulfillment/apis.py` | `recalculate_fulfillment_queue`, `package_pick_status` registered into `CUSTOM_APIS` | `server/modules/fulfillment/apis.mjs` |
| `app/fulfillment/__init__.py` | imports every submodule above except `pr_hooks` (registers hooks on import), `FORMS` list | `server/modules/fulfillment/index.mjs` |
| `app/main.py` (modify) | wires `reconcile_fulfillment` after a Fulfillment custom API call | `server/pg/api.mjs`'s `invokeCustomApi` branch |

---

## Task 1: `app/deluge.py` — shared Deluge-idiom helpers

**Files:**
- Create: `app/deluge.py`
- Test: `tests/test_deluge.py`

**Interfaces:**
- Produces: `blank(v) -> bool`, `truthy(v) -> bool`, `add_days(d: date, n: int) -> date`, `day_diff(a: date, b: date) -> int`, `today_date() -> date`, `parse_date(v) -> date | None`, `ymd(d: date) -> str`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_deluge.py
from datetime import date
from app.deluge import blank, truthy, add_days, day_diff, today_date, parse_date, ymd


def test_blank_treats_none_and_empty_string_as_blank():
    assert blank(None) is True
    assert blank("") is True
    assert blank(0) is False
    assert blank("x") is False


def test_truthy_accepts_bool_string_and_numeric_forms():
    assert truthy(True) is True
    assert truthy("true") is True
    assert truthy(1) is True
    assert truthy("1") is True
    assert truthy(False) is False
    assert truthy("false") is False
    assert truthy(0) is False
    assert truthy("") is False


def test_add_days_adds_calendar_days():
    assert add_days(date(2026, 11, 20), 5) == date(2026, 11, 25)
    assert add_days(date(2026, 11, 28), 5) == date(2026, 12, 3)


def test_day_diff_is_whole_days_from_b_to_a():
    assert day_diff(date(2026, 11, 25), date(2026, 11, 20)) == 5
    assert day_diff(date(2026, 11, 20), date(2026, 11, 25)) == -5


def test_today_date_returns_a_date_with_no_time_component():
    t = today_date()
    assert isinstance(t, date)


def test_parse_date_reads_yyyy_mm_dd_prefix_only():
    assert parse_date("2026-11-12") == date(2026, 11, 12)
    assert parse_date("2026-11-12 09:00:00 AM") == date(2026, 11, 12)
    assert parse_date("not a date") is None
    assert parse_date("") is None
    assert parse_date(None) is None


def test_ymd_formats_a_date_as_yyyy_mm_dd():
    assert ymd(date(2026, 1, 5)) == "2026-01-05"
    assert ymd(date(2026, 11, 20)) == "2026-11-20"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_deluge.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.deluge'`

- [ ] **Step 3: Write the implementation**

```python
# app/deluge.py
# Small helpers standing in for Deluge idioms, ported from server/workflows/deluge.mjs. Only the
# subset Fulfillment and its forecast dependency actually use -- not a full port of that file.
import re
from datetime import date, timedelta


def blank(v) -> bool:
    return v is None or v == ""


def truthy(v) -> bool:
    return v is True or v == "true" or v == 1 or v == "1"


def add_days(d: date, n: int) -> date:
    return d + timedelta(days=n)


def day_diff(a: date, b: date) -> int:
    return (a - b).days


def today_date() -> date:
    return date.today()


_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")


def parse_date(v) -> date | None:
    if v is None:
        return None
    m = _DATE_RE.match(str(v).strip())
    if not m:
        return None
    return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))


def ymd(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_deluge.py -v`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add app/deluge.py tests/test_deluge.py
git commit -m "feat: app/deluge.py (shared Deluge-idiom helpers for Fulfillment/forecast)"
```

---

## Task 2: `app/forecast/engine.py` — the forecast ladder (pure function)

**Files:**
- Create: `app/forecast/__init__.py` (empty), `app/forecast/engine.py`
- Test: `tests/forecast/__init__.py` (empty), `tests/forecast/test_engine.py`

**Interfaces:**
- Consumes: `app.deluge.add_days`, `app.deluge.day_diff`
- Produces: `DEFAULT_SETTINGS: dict` (frozen-by-convention, a plain dict copied on use), `settings_from(record: dict | None) -> dict`, `bucket_of(s: dict, sourcing, mode_val) -> dict` (`{tMin, tMax, cMin, cMax, bucket}` keys, matching Node's exact key names since `forecast_settings.py` and `purchase_request.py` destructure them by these names), `compute_forecast(i: dict) -> dict` (`{"skip": True}` or `{"skip": False, "delivery": str, "window": str, "status": str, "earliest": str, "latest": str, "position": str, "bucket": str}`), `finish(i: dict) -> dict` (same shape as `compute_forecast`'s non-skip branch, minus `skip`)

- [ ] **Step 1: Write the failing tests**

```python
# tests/forecast/test_engine.py
from datetime import date
from app.forecast.engine import compute_forecast, settings_from, DEFAULT_SETTINGS


def d(y, m, day):
    return date(y, m, day)


TODAY = d(2026, 11, 12)
BASE = {
    "today": TODAY, "settings": DEFAULT_SETTINGS, "stage": "", "stockOnHand": False, "modeVal": "",
    "sourcing": "", "supLead": 0, "prAdded": None, "prepStart": None, "prepFound": False,
    "dateShipped": None, "shipStatus": "", "clientTarget": None,
}


def run(**extra):
    return compute_forecast({**BASE, **extra})


def test_settings_no_record_means_the_defaults():
    assert settings_from(None) == DEFAULT_SETTINGS


def test_settings_an_empty_field_keeps_its_default_local_and_prep_days_set_both_ends():
    s = settings_from({
        "Air_Transit_Min": "4", "Air_Transit_Max": "", "Local_Transit_Days": "3",
        "Prep_Days_Thru_QC": "5", "Delivery_Days": "2",
        "Re_anchor_on_Latest_Real_Event": "true", "Include_Supplier_Lead_Time": "false",
    })
    assert (s["airTMin"], s["airTMax"]) == (4, 7)
    assert (s["locTMin"], s["locTMax"], s["prepMin"], s["prepMax"], s["delMin"], s["delMax"]) == (3, 3, 5, 5, 2, 2)
    assert (s["reAnchor"], s["addSupLead"]) == (True, False)


def test_mirrors_zoho_with_a_settings_record_the_two_switches_are_read_as_written():
    s = settings_from({})
    assert (s["reAnchor"], s["addSupLead"]) == (False, False)
    assert settings_from({"Re_anchor_on_Latest_Real_Event": True})["reAnchor"] is True
    assert settings_from({"Include_Supplier_Lead_Time": "TRUE"})["addSupLead"] is True


def test_for_delivery_ready_now_with_no_days_to_add():
    r = run(stage="For Delivery")
    assert (r["skip"], r["delivery"], r["position"], r["bucket"]) == (False, "2026-11-12", "Ready", "LCL?")
    assert r["window"] == "Nov 12 - Nov 12, 2026 | LCL? | Ready"
    assert r["status"] == "No Client Date"


def test_a_prep_stage_counts_days_not_yet_used_from_when_prep_started():
    r = run(stage="Picking", prepFound=True, prepStart=d(2026, 11, 9))  # 3 of 7 days used
    assert (r["earliest"], r["latest"], r["delivery"], r["position"]) == ("2026-11-16", "2026-11-16", "2026-11-16", "Picking")
    over = run(stage="Pack", prepFound=True, prepStart=d(2026, 10, 1))  # 42 days used: never negative
    assert (over["earliest"], over["latest"]) == ("2026-11-12", "2026-11-12")
    none = run(stage="Crate")  # prep start unknown: nothing used
    assert none["earliest"] == "2026-11-19"


def test_mirrors_zoho_picking_pack_qc_crate_are_prep_stages_even_with_reanchor_off():
    off = {**DEFAULT_SETTINGS, "reAnchor": False}
    for stage in ["Picking", "Pack", "Quality Checking", "Crate"]:
        assert run(stage=stage, settings=off, stockOnHand=True)["position"] == stage
    assert run(stage="Order Readiness", settings=off, stockOnHand=True)["position"] == "Stock on hand"
    assert run(stage="For Delivery", settings=off, stockOnHand=True)["position"] == "Stock on hand"


def test_stock_on_hand_prep_and_delivery_days_only():
    r = run(stockOnHand=True)
    assert (r["earliest"], r["latest"], r["delivery"], r["position"]) == ("2026-11-19", "2026-11-19", "2026-11-19", "Stock on hand")


def test_a_delivered_shipment_is_at_the_warehouse_prep_and_delivery_from_today():
    r = run(shipStatus="Delivered", prAdded=d(2026, 9, 1))
    assert (r["position"], r["delivery"]) == ("At WH", "2026-11-19")
    off = run(shipStatus="Delivered", prAdded=d(2026, 9, 1), settings={**DEFAULT_SETTINGS, "reAnchor": False})
    assert off["position"] == "Procurement"


def test_in_transit_from_the_day_it_shipped_middle_date_rounds_half_up():
    r = run(dateShipped=d(2026, 11, 1), modeVal="LCL")
    assert (r["earliest"], r["latest"], r["delivery"], r["bucket"], r["position"]) == ("2026-12-20", "2027-01-17", "2027-01-03", "LCL", "In transit")
    assert r["window"] == "Dec 20 - Jan 17, 2027 | LCL | In transit"
    odd = run(dateShipped=d(2026, 11, 1), modeVal="Air Freight")  # 14 to 17 days: span 3, half 1.5 rounds up to 2
    assert (odd["earliest"], odd["latest"], odd["delivery"]) == ("2026-11-15", "2026-11-18", "2026-11-17")


def test_procurement_from_the_day_the_pr_was_added_bucket_follows_sourcing_and_mode():
    assert run(prAdded=d(2026, 11, 1), modeVal="Air")["bucket"] == "Air"
    assert run(prAdded=d(2026, 11, 1), modeVal="fcl")["bucket"] == "FCL"
    assert run(prAdded=d(2026, 11, 1), modeVal="LCL")["bucket"] == "LCL"
    assert run(prAdded=d(2026, 11, 1), modeVal="Truck")["bucket"] == "LCL?"
    local = run(prAdded=d(2026, 11, 1), sourcing="Local", modeVal="Air")  # sourcing wins over mode
    assert (local["bucket"], local["earliest"], local["latest"]) == ("Local", "2026-11-12", "2026-11-12")
    air = run(prAdded=d(2026, 11, 1), modeVal="Air")
    assert (air["earliest"], air["latest"], air["position"]) == ("2026-11-15", "2026-11-18", "Procurement")


def test_supplier_lead_time_added_only_when_the_switch_is_on():
    on = {**DEFAULT_SETTINGS, "addSupLead": True}
    assert run(prAdded=d(2026, 11, 1), modeVal="Air", supLead=10, settings=on)["earliest"] == "2026-11-25"
    assert run(prAdded=d(2026, 11, 1), modeVal="Air", supLead=10)["earliest"] == "2026-11-15"


def test_an_estimate_in_the_past_is_clamped_to_today_and_says_so():
    r = run(prAdded=d(2026, 1, 1), modeVal="Air")
    assert (r["earliest"], r["latest"], r["delivery"]) == ("2026-11-12", "2026-11-12", "2026-11-12")
    assert r["window"] == "Nov 12 - Nov 12, 2026 | Air | Procurement | lampas na sa tantiya"
    partly = run(prAdded=d(2026, 10, 28), modeVal="Air")  # 14 to 17 days: Nov 11 (past) to Nov 14
    assert (partly["earliest"], partly["latest"]) == ("2026-11-12", "2026-11-14")
    assert "lampas" not in partly["window"]


def test_status_against_the_client_date_on_track_at_risk_will_miss_overdue():
    air = {"prAdded": d(2026, 11, 1), "modeVal": "Air"}  # window Nov 15 to Nov 18, forecast Nov 17
    assert run(**air, clientTarget=d(2026, 11, 20))["status"] == "On Track"
    assert run(**air, clientTarget=d(2026, 11, 18))["status"] == "On Track"
    assert run(**air, clientTarget=d(2026, 11, 20))["window"] == "Nov 15 - Nov 18, 2026 | Air | Procurement | 3d early"
    assert run(**air, clientTarget=d(2026, 11, 16))["status"] == "At Risk"
    assert run(**air, clientTarget=d(2026, 11, 16))["window"].endswith("| +1d vs client")
    assert run(**air, clientTarget=d(2026, 11, 14))["status"] == "Will Miss"
    assert run(**air, clientTarget=d(2026, 11, 14))["window"].endswith("| +3d vs client")
    assert run(**air, clientTarget=d(2026, 11, 10))["status"] == "Overdue"
    assert run(**air, clientTarget=d(2026, 11, 17))["window"].endswith("| sakto sa client")
    assert run(**air)["status"] == "No Client Date"
    assert "client" not in run(**air)["window"]


def test_mirrors_zoho_overdue_wins_over_on_track_when_target_already_behind_today():
    r = run(stage="For Delivery", clientTarget=d(2026, 11, 11))
    assert r["status"] == "Overdue"
    assert r["window"].endswith("| +1d vs client")


def test_no_anchor_at_all_nothing_is_stamped():
    assert run(stockOnHand=False, prAdded=None) == {"skip": True}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/forecast/test_engine.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.forecast'`

- [ ] **Step 3: Write the implementation**

```python
# app/forecast/engine.py
# The forecast ladder, ported from server/forecast/engine.mjs (itself from
# zoho-export/parsed/functions/fcStampBySoNo.dg sections 1, 5, 6), as one pure function. No
# database here: callers (stamp.py for one SO, schedule.py for all of them) gather the facts and
# pass them in, so the two ways of computing a forecast cannot drift apart.
#
# Quirks kept ("mirrors Zoho"):
#  - Picking, Pack, Quality Checking and Crate count as prep stages even when re-anchoring is off;
#    only "Order Readiness" and "For Delivery" need the switch.
#  - The middle date is earliest + round(span / 2), rounded half up.
#  - A past-due estimate clamps its dates to today and says "lampas na sa tantiya" in the window.
from datetime import date

from app.deluge import add_days, day_diff

DEFAULT_SETTINGS = {
    "airTMin": 5, "airTMax": 7, "airCMin": 2, "airCMax": 3,
    "lclTMin": 35, "lclTMax": 60, "lclCMin": 7, "lclCMax": 10,
    "fclTMin": 35, "fclTMax": 60, "fclCMin": 7, "fclCMax": 10,
    "locTMin": 0, "locTMax": 0, "locCMin": 0, "locCMax": 0,
    "prepMin": 7, "prepMax": 7, "delMin": 0, "delMax": 0,
    "reAnchor": True, "addSupLead": False,
}


def _blank(v) -> bool:
    return v is None or v == ""


def _long(v, fallback):
    if _blank(v):
        return fallback
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return fallback


def settings_from(record: dict | None) -> dict:
    s = dict(DEFAULT_SETTINGS)
    if not record:
        return s
    d = DEFAULT_SETTINGS
    s["airTMin"] = _long(record.get("Air_Transit_Min"), d["airTMin"])
    s["airTMax"] = _long(record.get("Air_Transit_Max"), d["airTMax"])
    s["airCMin"] = _long(record.get("Air_Customs_to_WH_Min"), d["airCMin"])
    s["airCMax"] = _long(record.get("Air_Customs_to_WH_Max"), d["airCMax"])
    s["lclTMin"] = _long(record.get("LCL_Transit_Min"), d["lclTMin"])
    s["lclTMax"] = _long(record.get("LCL_Transit_Max"), d["lclTMax"])
    s["lclCMin"] = _long(record.get("LCL_Customs_to_WH_Min"), d["lclCMin"])
    s["lclCMax"] = _long(record.get("LCL_Customs_to_WH_Max"), d["lclCMax"])
    s["fclTMin"] = _long(record.get("FCL_Transit_Min"), d["fclTMin"])
    s["fclTMax"] = _long(record.get("FCL_Transit_Max"), d["fclTMax"])
    s["fclCMin"] = _long(record.get("FCL_Customs_to_WH_Min"), d["fclCMin"])
    s["fclCMax"] = _long(record.get("FCL_Customs_to_WH_Max"), d["fclCMax"])
    if not _blank(record.get("Local_Transit_Days")):
        s["locTMin"] = s["locTMax"] = _long(record.get("Local_Transit_Days"), 0)
    if not _blank(record.get("Local_Customs_Days")):
        s["locCMin"] = s["locCMax"] = _long(record.get("Local_Customs_Days"), 0)
    if not _blank(record.get("Prep_Days_Thru_QC")):
        s["prepMin"] = s["prepMax"] = _long(record.get("Prep_Days_Thru_QC"), d["prepMin"])
    if not _blank(record.get("Delivery_Days")):
        s["delMin"] = s["delMax"] = _long(record.get("Delivery_Days"), 0)
    s["reAnchor"] = str(record.get("Re_anchor_on_Latest_Real_Event") or "").lower() == "true"
    s["addSupLead"] = str(record.get("Include_Supplier_Lead_Time") or "").lower() == "true"
    return s


_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _mmm_dd(d: date) -> str:
    return f"{_MONTHS[d.month - 1]} {d.day:02d}"


def _ymd(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}"


def _gap(a: date, b: date) -> int:
    return abs(day_diff(b, a))


def bucket_of(s: dict, sourcing, mode_val) -> dict:
    mode_key = str(mode_val or "").upper()
    src_key = str(sourcing or "").upper()
    if src_key == "LOCAL":
        return {"tMin": s["locTMin"], "tMax": s["locTMax"], "cMin": s["locCMin"], "cMax": s["locCMax"], "bucket": "Local"}
    if "AIR" in mode_key:
        return {"tMin": s["airTMin"], "tMax": s["airTMax"], "cMin": s["airCMin"], "cMax": s["airCMax"], "bucket": "Air"}
    if mode_key == "FCL":
        return {"tMin": s["fclTMin"], "tMax": s["fclTMax"], "cMin": s["fclCMin"], "cMax": s["fclCMax"], "bucket": "FCL"}
    return {"tMin": s["lclTMin"], "tMax": s["lclTMax"], "cMin": s["lclCMin"], "cMax": s["lclCMax"], "bucket": "LCL" if mode_key == "LCL" else "LCL?"}


def compute_forecast(i: dict) -> dict:
    today, s = i["today"], i["settings"]
    b = bucket_of(s, i.get("sourcing"), i.get("modeVal"))
    t_min, t_max, c_min, c_max, bucket = b["tMin"], b["tMax"], b["cMin"], b["cMax"], b["bucket"]

    anchor = today
    anchor_found = False
    sum_min = sum_max = 0
    position = ""
    stage = i.get("stage") or ""
    prep_stages = ["Picking", "Pack", "Quality Checking", "Crate"]

    if s["reAnchor"] and stage == "For Delivery":
        anchor_found = True
        sum_min, sum_max = s["delMin"], s["delMax"]
        position = "Ready"
    elif (s["reAnchor"] and stage == "Order Readiness") or stage in prep_stages:
        anchor_found = True
        used = _gap(i["prepStart"], today) if i.get("prepFound") and i.get("prepStart") else 0
        left_min = max(0, s["prepMin"] - used)
        left_max = max(0, s["prepMax"] - used)
        sum_min, sum_max = left_min + s["delMin"], left_max + s["delMax"]
        position = stage
    elif i.get("stockOnHand"):
        anchor_found = True
        sum_min, sum_max = s["prepMin"] + s["delMin"], s["prepMax"] + s["delMax"]
        position = "Stock on hand"
    elif s["reAnchor"] and i.get("shipStatus") == "Delivered":
        anchor_found = True
        sum_min, sum_max = s["prepMin"] + s["delMin"], s["prepMax"] + s["delMax"]
        position = "At WH"
    elif s["reAnchor"] and i.get("dateShipped"):
        anchor = i["dateShipped"]
        anchor_found = True
        sum_min = t_min + c_min + s["prepMin"] + s["delMin"]
        sum_max = t_max + c_max + s["prepMax"] + s["delMax"]
        position = "In transit"
    else:
        if i.get("prAdded"):
            anchor = i["prAdded"]
            anchor_found = True
        sum_min = t_min + c_min + s["prepMin"] + s["delMin"]
        sum_max = t_max + c_max + s["prepMax"] + s["delMax"]
        if s["addSupLead"]:
            sum_min += int(i.get("supLead") or 0)
            sum_max += int(i.get("supLead") or 0)
        position = "Procurement"

    if not anchor_found:
        return {"skip": True}

    return finish({
        "today": today, "anchor": anchor, "sumMin": sum_min, "sumMax": sum_max, "bucket": bucket,
        "position": position, "clientTarget": i.get("clientTarget"), "variance": True,
    })


def finish(i: dict) -> dict:
    today, anchor, sum_min, sum_max, bucket, position = i["today"], i["anchor"], i["sumMin"], i["sumMax"], i["bucket"], i["position"]
    earliest = add_days(anchor, sum_min)
    latest = add_days(anchor, sum_max)
    past_its = latest < today
    if earliest < today:
        earliest = today
    if latest < today:
        latest = today
    span = _gap(earliest, latest)
    fc_date = add_days(earliest, round(span / 2))
    window = f"{_mmm_dd(earliest)} - {_mmm_dd(latest)}, {latest.year} | {bucket} | {position}"
    if past_its:
        window += " | lampas na sa tantiya"

    target = i.get("clientTarget")
    if not target:
        status = "No Client Date"
    elif today > target:
        status = "Overdue"
    elif latest <= target:
        status = "On Track"
    elif earliest <= target:
        status = "At Risk"
    else:
        status = "Will Miss"
    if target and i.get("variance"):
        var_days = _gap(target, fc_date)
        if fc_date < target:
            var_days = -var_days
        if var_days > 0:
            window += f" | +{var_days}d vs client"
        elif var_days < 0:
            window += f" | {-var_days}d early"
        else:
            window += " | sakto sa client"
    return {
        "skip": False, "delivery": _ymd(fc_date), "window": window, "status": status,
        "earliest": _ymd(earliest), "latest": _ymd(latest), "position": position, "bucket": bucket,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/forecast/test_engine.py -v`
Expected: PASS (16/16)

- [ ] **Step 5: Commit**

```bash
git add app/forecast/__init__.py app/forecast/engine.py tests/forecast/__init__.py tests/forecast/test_engine.py
git commit -m "feat: app/forecast/engine.py (the forecast ladder, pure function)"
```

---

## Task 3: `app/forecast/forecast_settings.py` — Procurement Settings over the legacy Forecast_Settings record

**Files:**
- Create: `app/forecast/forecast_settings.py`
- Test: `tests/forecast/test_forecast_settings.py`

**Interfaces:**
- Consumes: `app.forecast.engine.settings_from`, `app.forecast.engine.DEFAULT_SETTINGS`, `app.store.create_store`, `app.schema.ensure_schema` (test only)
- Produces: `FORECAST_FIELDS: dict[str, tuple[str, str]]` (catalogue key -> (legacy field, engine key)), `is_forecast_key(k) -> bool`, `ENGINE_DEFAULTS: dict`, `forecast_record(store, overrides: dict = {}) -> dict | None`, `forecast_settings(store, overrides: dict = {}) -> dict`, `forecast_values(store) -> dict`, `plan_numbers(f: dict) -> dict`

- [ ] **Step 1: Write the failing tests**

```python
# tests/forecast/test_forecast_settings.py
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.forecast.forecast_settings import forecast_settings, forecast_values, plan_numbers, ENGINE_DEFAULTS


@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.mark.asyncio
async def test_no_rows_at_all_gives_exactly_the_engine_defaults(store):
    s = await forecast_settings(store)
    assert s == ENGINE_DEFAULTS


@pytest.mark.asyncio
async def test_a_legacy_forecast_settings_record_is_read_when_no_procurement_settings_rows_exist(store):
    await store.add_record("Forecast_Settings", {"Air_Transit_Min": "4", "Prep_Days_Thru_QC": "5"})
    s = await forecast_settings(store)
    assert s["airTMin"] == 4
    assert s["prepMin"] == 5


@pytest.mark.asyncio
async def test_a_procurement_settings_row_overrides_its_one_field_and_keeps_the_rest(store):
    await store.add_record("Forecast_Settings", {"Air_Transit_Min": "4", "Prep_Days_Thru_QC": "5"})
    await store.add_record("Procurement_Settings", {"Setting_Key": "transit_air_min_days", "Value": "9"})
    s = await forecast_settings(store)
    assert s["airTMin"] == 9
    assert s["prepMin"] == 5  # untouched: no Procurement_Settings row for this key


@pytest.mark.asyncio
async def test_an_override_passed_directly_wins_over_a_saved_row(store):
    await store.add_record("Procurement_Settings", {"Setting_Key": "transit_air_min_days", "Value": "9"})
    s = await forecast_settings(store, overrides={"transit_air_min_days": "20"})
    assert s["airTMin"] == 20


@pytest.mark.asyncio
async def test_forecast_values_reports_the_source_of_each_key(store):
    await store.add_record("Forecast_Settings", {"Air_Transit_Min": "4"})
    await store.add_record("Procurement_Settings", {"Setting_Key": "transit_lcl_min_days", "Value": "40"})
    values = await forecast_values(store)
    assert values["transit_air_min_days"]["source"] == "legacy"
    assert values["transit_lcl_min_days"]["source"] == "saved"
    assert values["delivery_days"]["source"] == "default"


def test_plan_numbers_takes_the_middle_of_each_range():
    f = {**ENGINE_DEFAULTS, "airTMin": 5, "airTMax": 7, "lclTMin": 35, "lclTMax": 60, "fclTMin": 35, "fclTMax": 60,
         "airCMin": 2, "airCMax": 3, "lclCMin": 7, "lclCMax": 10, "fclCMin": 7, "fclCMax": 10, "prepMin": 7, "delMin": 0}
    p = plan_numbers(f)
    assert p["transit_air_days"] == 6
    assert p["fulfillment_days"] == 7
    assert p["delivery_days"] == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/forecast/test_forecast_settings.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.forecast.forecast_settings'`

- [ ] **Step 3: Write the implementation**

```python
# app/forecast/forecast_settings.py
# One place for the forecast numbers: the Procurement Settings page (spec 05 Shared Engines / 08
# Control Panel). Ported from server/modules/procurement/forecast-settings.mjs -- that file has no
# real Procurement module-code dependency, only reads the generic Forecast_Settings and
# Procurement_Settings forms, so it lives in app/forecast/ here rather than waiting for a
# Procurement package that does not exist yet.
#
#   no Procurement_Settings row for a forecast key  ->  exactly what the engine did before (the old
#                                                        record, or its built-in defaults)
#   a row                                           ->  that field of the record is replaced, the
#                                                        rest keeps its value
from app.forecast.engine import settings_from, DEFAULT_SETTINGS as _ENGINE

FORECAST_FIELDS = {
    "transit_air_min_days": ("Air_Transit_Min", "airTMin"), "transit_air_max_days": ("Air_Transit_Max", "airTMax"),
    "customs_air_min_days": ("Air_Customs_to_WH_Min", "airCMin"), "customs_air_max_days": ("Air_Customs_to_WH_Max", "airCMax"),
    "transit_lcl_min_days": ("LCL_Transit_Min", "lclTMin"), "transit_lcl_max_days": ("LCL_Transit_Max", "lclTMax"),
    "customs_lcl_min_days": ("LCL_Customs_to_WH_Min", "lclCMin"), "customs_lcl_max_days": ("LCL_Customs_to_WH_Max", "lclCMax"),
    "transit_fcl_min_days": ("FCL_Transit_Min", "fclTMin"), "transit_fcl_max_days": ("FCL_Transit_Max", "fclTMax"),
    "customs_fcl_min_days": ("FCL_Customs_to_WH_Min", "fclCMin"), "customs_fcl_max_days": ("FCL_Customs_to_WH_Max", "fclCMax"),
    "local_transit_days": ("Local_Transit_Days", "locTMin"), "local_customs_days": ("Local_Customs_Days", "locCMin"),
    "fulfillment_days": ("Prep_Days_Thru_QC", "prepMin"), "delivery_days": ("Delivery_Days", "delMin"),
    "forecast_reanchor": ("Re_anchor_on_Latest_Real_Event", "reAnchor"),
    "forecast_include_supplier_lead_time": ("Include_Supplier_Lead_Time", "addSupLead"),
}


def is_forecast_key(k) -> bool:
    return k in FORECAST_FIELDS


ENGINE_DEFAULTS = _ENGINE


def _blank(v) -> bool:
    return v is None or v == ""


def _text(v) -> str:
    return "" if _blank(v) else str(v)


async def _sources(store):
    legacy = None
    try:
        rows = await store.find("Forecast_Settings")
        legacy = rows[0] if rows else None
    except Exception:
        legacy = None
    try:
        rows = await store.find("Procurement_Settings")
    except Exception:
        rows = []
    return legacy, rows


async def forecast_record(store, overrides: dict | None = None) -> dict | None:
    overrides = overrides or {}
    legacy, rows = await _sources(store)
    settings_set: dict[str, str] = {}
    for r in rows:
        key = _text(r.get("Setting_Key"))
        if is_forecast_key(key) and not _blank(r.get("Value")):
            settings_set[key] = _text(r.get("Value"))
    for k, v in overrides.items():
        if is_forecast_key(k):
            settings_set[k] = _text(v)
    if not settings_set:
        return legacy
    rec = dict(legacy) if legacy else {
        "Re_anchor_on_Latest_Real_Event": str(_ENGINE["reAnchor"]),
        "Include_Supplier_Lead_Time": str(_ENGINE["addSupLead"]),
    }
    for k, v in settings_set.items():
        rec[FORECAST_FIELDS[k][0]] = v
    return rec


async def forecast_settings(store, overrides: dict | None = None) -> dict:
    return settings_from(await forecast_record(store, overrides))


async def forecast_values(store) -> dict:
    legacy, rows = await _sources(store)
    s = settings_from(await forecast_record(store))
    out = {}
    for key, (field, engine_key) in FORECAST_FIELDS.items():
        row = next((r for r in rows if _text(r.get("Setting_Key")) == key and not _blank(r.get("Value"))), None)
        if row:
            source = "saved"
        elif legacy and not _blank(legacy.get(field)):
            source = "legacy"
        else:
            source = "default"
        out[key] = {"value": s[engine_key], "source": source}
    return out


def plan_numbers(f: dict) -> dict:
    def mid(a, b):
        return round((float(a) + float(b)) / 2)

    return {
        "transit_air_days": mid(f["airTMin"], f["airTMax"]), "transit_lcl_days": mid(f["lclTMin"], f["lclTMax"]),
        "transit_fcl_days": mid(f["fclTMin"], f["fclTMax"]), "customs_air_days": mid(f["airCMin"], f["airCMax"]),
        "customs_lcl_days": mid(f["lclCMin"], f["lclCMax"]), "customs_fcl_days": mid(f["fclCMin"], f["fclCMax"]),
        "fulfillment_days": int(f["prepMin"]), "delivery_days": int(f["delMin"]),
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/forecast/test_forecast_settings.py -v`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add app/forecast/forecast_settings.py tests/forecast/test_forecast_settings.py
git commit -m "feat: app/forecast/forecast_settings.py (Procurement Settings over the legacy record)"
```

---

## Task 4: `app/forecast/stamp.py` — fc_stamp_by_so_no

**Files:**
- Create: `app/forecast/stamp.py`
- Test: `tests/forecast/test_stamp.py`

**Interfaces:**
- Consumes: `app.forecast.forecast_settings.forecast_settings`, `app.forecast.engine.compute_forecast`, `app.deluge.today_date`, `app.deluge.parse_date`, `app.store.create_store`
- Produces: `NULL_TEXT: bool` (= `True`), `txt(v) -> str`, `to_date(v) -> date | None`, `fc_stamp_by_so_no(store, so_no, *, today: date = None) -> str`

- [ ] **Step 1: Write the failing tests**

```python
# tests/forecast/test_stamp.py
from datetime import date

import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.forecast.stamp import fc_stamp_by_so_no, to_date

TODAY = date(2026, 11, 12)


@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def _write_count(store, form, id_, payload):
    before = await store.get_record_by_id(form, id_, raw=True)
    changed = any(before.get(k) != v for k, v in payload.items())
    await store.update_record(form, id_, payload, by_form=True)
    return 1 if changed else 0


def test_to_date_reads_the_forms_the_app_uses():
    assert to_date("2026-11-12").day == 12
    assert to_date("2026-11-12 09:00:00 AM").month == 11
    d = to_date("05-Nov-2026")
    assert (d.month, d.day) == (11, 5)
    assert to_date("soon") is None
    assert to_date("") is None


@pytest.mark.asyncio
async def test_a_blank_sales_order_number_is_answered_nothing_is_stamped(store):
    for so in ["", None, "null"]:
        assert await fc_stamp_by_so_no(store, so, today=TODAY) == "walang SO number na ipinasa"


@pytest.mark.asyncio
async def test_stock_on_hand_order_prep_and_delivery_days_from_today_stamped_on_its_sof_row(store):
    id_ = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-1", "order_type": "STOCK", "target_delivery_date": "2026-11-25"})
    out = await fc_stamp_by_so_no(store, "SO-1", today=TODAY)
    r = await store.get_record_by_id("Sales_Order_Fulfillment", id_, raw=True)
    assert (r["Forecast_Delivery"], r["Forecast_Window"], r["Forecast_Status"]) == (
        "2026-11-19", "Nov 19 - Nov 19, 2026 | LCL? | Stock on hand | 6d early", "On Track",
    )
    assert out == "SO-1 -> Nov 19, 2026 | Nov 19 - Nov 19, 2026 | LCL? | Stock on hand | 6d early | On Track | 1 record"


@pytest.mark.asyncio
async def test_a_gate_row_with_no_sof_puts_the_order_at_order_readiness(store):
    g = await store.add_record("Sales_Order_Readiness_Gate", {"sales_order_number": "SO-2", "Order_Type": "Stock", "Target_Delivery_Date": "2026-11-30"})
    await store.update_record("Sales_Order_Readiness_Gate", g, {"Added_Time": "2026-11-09 09:00:00 AM"}, by_form=True)
    await fc_stamp_by_so_no(store, "SO-2", today=TODAY)
    r = await store.get_record_by_id("Sales_Order_Readiness_Gate", g, raw=True)
    assert (r["Forecast_Delivery"], r["Forecast_Window"], r["Forecast_Status"]) == (
        "2026-11-16", "Nov 16 - Nov 16, 2026 | LCL? | Order Readiness | 14d early", "On Track",
    )


@pytest.mark.asyncio
async def test_only_a_pre_order_row_the_pr_gives_the_start_sourcing_and_mode(store):
    pr = await store.add_record("Purchase_Request1", {"PR_No": "PR-1", "Sourcing_Type": "Import", "Shipment_Mode": "Air", "Required_Days_Lead": "3"})
    await store.update_record("Purchase_Request1", pr, {"Added_Time": "2026-11-01 08:00:00 AM"}, by_form=True)
    po = await store.add_record("Pre_Order_FF", {"SO": "SO-3", "PR": "PR-1", "Order_Type": "Pre Order", "Target_Delivery": "2026-11-16"})
    out = await fc_stamp_by_so_no(store, "SO-3", today=TODAY)
    po_row = await store.get_record_by_id("Pre_Order_FF", po, raw=True)
    pr_row = await store.get_record_by_id("Purchase_Request1", pr, raw=True)
    assert (po_row["Forecast_Delivery"], po_row["Forecast_Window"], po_row["Forecast_Status"]) == (
        "2026-11-17", "Nov 15 - Nov 18, 2026 | Air | Procurement | +1d vs client", "At Risk",
    )
    assert (pr_row["Forecast_Delivery"], pr_row["Forecast_Window"], pr_row["Forecast_Status"]) == (
        po_row["Forecast_Delivery"], po_row["Forecast_Window"], po_row["Forecast_Status"],
    )
    assert out.endswith("| 2 record")


@pytest.mark.asyncio
async def test_rows_naming_another_pr_than_the_order_are_left_out_of_the_stamping(store):
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-6", "order_type": "STOCK", "PR_No": "PR-4", "Fulfillment_Stage": "Picking", "Shipment_Mode": "LCL"})
    mine = await store.add_record("Pick1", {"SO": "SO-6", "PR_if_any": "PR-4"})
    no_pr = await store.add_record("Pick1", {"SO": "SO-6", "PR_if_any": ""})
    other = await store.add_record("Pick1", {"SO": "SO-6", "PR_if_any": "PR-OTHER"})
    await fc_stamp_by_so_no(store, "SO-6", today=TODAY)
    assert (await store.get_record_by_id("Pick1", mine, raw=True))["Forecast_Delivery"] != ""
    assert (await store.get_record_by_id("Pick1", no_pr, raw=True))["Forecast_Delivery"] != ""
    assert (await store.get_record_by_id("Pick1", other, raw=True))["Forecast_Delivery"] == ""


@pytest.mark.asyncio
async def test_every_form_of_the_order_is_stamped(store):
    ids = {}
    ids["Sales_Order_Fulfillment"] = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-7", "order_type": "STOCK"})
    ids["Sales_Order_Readiness_Gate"] = await store.add_record("Sales_Order_Readiness_Gate", {"sales_order_number": "SO-7"})
    ids["Pre_Order_FF"] = await store.add_record("Pre_Order_FF", {"SO": "SO-7"})
    ids["Pick1"] = await store.add_record("Pick1", {"SO": "SO-7"})
    ids["Checker_Checklist"] = await store.add_record("Checker_Checklist", {"SO": "SO-7"})
    ids["Order_Aggregation1"] = await store.add_record("Order_Aggregation1", {"SO": "SO-7"})
    ids["Crate_Checklist"] = await store.add_record("Crate_Checklist", {"SO": "SO-7"})
    ids["Receiving"] = await store.add_record("Receiving", {"SO_No": "SO-7"})
    await fc_stamp_by_so_no(store, "SO-7", today=TODAY)
    for form, id_ in ids.items():
        r = await store.get_record_by_id(form, id_, raw=True)
        assert r["Forecast_Status"] == "No Client Date", form


@pytest.mark.asyncio
async def test_mirrors_zoho_only_the_first_sales_order_fulfillment_row_of_the_order_is_stamped(store):
    a = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-8", "order_type": "STOCK"})
    b = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-8", "order_type": "STOCK"})
    await fc_stamp_by_so_no(store, "SO-8", today=TODAY)
    assert (await store.get_record_by_id("Sales_Order_Fulfillment", a, raw=True))["Forecast_Delivery"] != ""
    assert (await store.get_record_by_id("Sales_Order_Fulfillment", b, raw=True))["Forecast_Delivery"] == ""


@pytest.mark.asyncio
async def test_the_settings_record_changes_the_prep_and_delivery_days(store):
    await store.add_record("Forecast_Settings", {"Prep_Days_Thru_QC": "2", "Delivery_Days": "1", "Re_anchor_on_Latest_Real_Event": "true", "Include_Supplier_Lead_Time": "true"})
    id_ = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-10", "order_type": "STOCK"})
    await fc_stamp_by_so_no(store, "SO-10", today=TODAY)
    r = await store.get_record_by_id("Sales_Order_Fulfillment", id_, raw=True)
    assert r["Forecast_Delivery"] == "2026-11-15"  # 2 prep + 1 delivery


@pytest.mark.asyncio
async def test_no_sof_gate_or_pre_order_row_at_all_counts_as_stock_on_hand_but_nothing_to_stamp(store):
    out = await fc_stamp_by_so_no(store, "SO-NOTHING", today=TODAY)
    assert "Stock on hand" in out
    assert out.endswith("0 record")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/forecast/test_stamp.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.forecast.stamp'`

- [ ] **Step 3: Write the implementation**

```python
# app/forecast/stamp.py
# fc_stamp_by_so_no, ported from zoho-export/parsed/functions/fcStampBySoNo.dg via
# server/forecast/stamp.mjs: works out the forecast of ONE sales order and stamps
# Forecast_Delivery, Forecast_Window and Forecast_Status on the rows that belong to it (up to 9
# forms). The ladder itself is in engine.py (pure); this file gathers the facts and writes the
# result. What it writes: only a value that differs (the write itself can fire the same workflow
# again, and the second pass finds nothing to change, which is what stops the loop).
#
# Quirks kept ("mirrors Zoho"):
#  - Blank text and the word "null": a blank PR number is "null", which no PR has, so rows with
#    another PR number are left out of the stamping; a blank shipment mode is "null" too, so the
#    PR's/shipment's mode is not used as a fallback. NULL_TEXT turns this off in one place.
#  - Only the FIRST Sales_Order_Fulfillment row of the SO is read and stamped.
import re
from datetime import date

from app.deluge import parse_date, today_date
from app.forecast.engine import compute_forecast
from app.forecast.forecast_settings import forecast_settings

NULL_TEXT = True


def _blank(v) -> bool:
    return v is None or v == ""


def txt(v) -> str:
    return ("null" if NULL_TEXT else "") if _blank(v) else str(v)


_MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
_DMY_RE = re.compile(r"^(\d{1,2})-([A-Za-z]{3})-(\d{4})")


def to_date(v) -> date | None:
    if isinstance(v, date):
        return v
    s = str(v or "").strip()
    iso = parse_date(s)
    if iso:
        return iso
    m = _DMY_RE.match(s)
    if m:
        mo = _MONTH_ABBR.index(m.group(2).lower()) if m.group(2).lower() in _MONTH_ABBR else -1
        if mo >= 0:
            return date(int(m.group(3)), mo + 1, int(m.group(1)))
    return None


def _day(v) -> str:
    d = to_date(v)
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}" if d else ""


_AT_PREP = ["For Delivery", "Order Readiness", "Picking", "Pack", "Quality Checking", "Crate"]


def _same_day(a, b) -> bool:
    return _day(a) == _day(b)


async def _stamp_row(store, form: str, row: dict, f: dict) -> None:
    changes = {}
    if not _same_day(row.get("Forecast_Delivery"), f["delivery"]):
        changes["Forecast_Delivery"] = f["delivery"]
    if row.get("Forecast_Window") != f["window"]:
        changes["Forecast_Window"] = f["window"]
    if row.get("Forecast_Status") != f["status"]:
        changes["Forecast_Status"] = f["status"]
    if changes:
        await store.update_record(form, row["ID"], changes, by_form=True)


async def fc_stamp_by_so_no(store, so_no, *, today: date | None = None) -> str:
    today = today or today_date()
    if _blank(so_no) or str(so_no) == "null":
        return "walang SO number na ipinasa"
    so_no = str(so_no)

    settings = await forecast_settings(store)

    sofs = await store.find("Sales_Order_Fulfillment", lambda r: r.get("SO_No") == so_no)
    sof = sofs[0] if sofs else None
    pr_no = stage = otype = mode_val = ""
    client_target = None
    sof_created = None
    if sof:
        pr_no, stage, otype, mode_val = txt(sof.get("PR_No")), txt(sof.get("Fulfillment_Stage")), txt(sof.get("order_type")).upper(), txt(sof.get("Shipment_Mode"))
        client_target = None if _blank(sof.get("target_delivery_date")) else to_date(sof.get("target_delivery_date"))
        sof_created = None if _blank(sof.get("SO_Created_Date")) else to_date(sof.get("SO_Created_Date"))

    gate_recs = await store.find("Sales_Order_Readiness_Gate", lambda r: r.get("sales_order_number") == so_no)
    pick_recs = await store.find("Pick1", lambda r: r.get("SO") == so_no)
    qc_recs = await store.find("Checker_Checklist", lambda r: r.get("SO") == so_no)
    oa_recs = await store.find("Order_Aggregation1", lambda r: r.get("SO") == so_no)
    crate_recs = await store.find("Crate_Checklist", lambda r: r.get("SO") == so_no)

    if not sof and gate_recs:
        g0 = gate_recs[0]
        otype = txt(g0.get("Order_Type")).upper()
        if not _blank(g0.get("Target_Delivery_Date")):
            client_target = to_date(g0.get("Target_Delivery_Date"))
        pr_no = txt(g0.get("pr_number"))
        stage = "Order Readiness"
    if not sof and stage == "":
        po0s = await store.find("Pre_Order_FF", lambda r: r.get("SO") == so_no)
        if po0s:
            po0 = po0s[0]
            otype = txt(po0.get("Order_Type")).upper()
            if not _blank(po0.get("Target_Delivery")):
                client_target = to_date(po0.get("Target_Delivery"))
            pr_no = txt(po0.get("PR"))
    stock_on_hand = "PRE ORDER" not in otype

    pr_added = sourcing = None
    sup_lead = 0
    sourcing = ""
    if pr_no != "":
        prs = await store.find("Purchase_Request1", lambda r: r.get("PR_No") == pr_no)
        if prs:
            pr = prs[0]
            if not _blank(pr.get("Added_Time")):
                pr_added = to_date(pr.get("Added_Time"))
            sourcing = txt(pr.get("Sourcing_Type"))
            if not _blank(pr.get("Required_Days_Lead")):
                try:
                    sup_lead = int(float(pr.get("Required_Days_Lead")))
                except (TypeError, ValueError):
                    sup_lead = 0
            if _blank(mode_val):
                mode_val = txt(pr.get("Shipment_Mode"))

    def _for_pr(r: dict, field: str) -> bool:
        return not (pr_no != "" and not _blank(r.get(field)) and r.get(field) != pr_no)

    prep_start = None
    row_added = None

    def _earlier(cur, d):
        return d if d and (not cur or d < cur) else cur

    for g in gate_recs:
        if _for_pr(g, "pr_number") and not _blank(g.get("Added_Time")):
            a = to_date(g.get("Added_Time"))
            if a:
                prep_start = _earlier(prep_start, a)
                row_added = _earlier(row_added, a)
    for p in pick_recs:
        if _for_pr(p, "PR_if_any") and not _blank(p.get("Added_Time")):
            prep_start = _earlier(prep_start, to_date(p.get("Added_Time")))
    for q in qc_recs:
        if _for_pr(q, "PR") and not _blank(q.get("Added_Time")):
            prep_start = _earlier(prep_start, to_date(q.get("Added_Time")))
    for c in crate_recs:
        if _for_pr(c, "PR_if_any") and not _blank(c.get("Added_Time")):
            prep_start = _earlier(prep_start, to_date(c.get("Added_Time")))

    if not pr_added:
        pr_added = sof_created or row_added or today

    date_shipped = None
    ship_status = ""
    at_prep_stage = stage in _AT_PREP
    need_ship = not (settings["reAnchor"] and at_prep_stage) and not stock_on_hand
    if pr_no != "" and need_ship:
        for sh in await store.find("Shipments"):
            for row in sh.get("Supplier_Shipment_Details") or []:
                if txt(row.get("PR_No")) == pr_no:
                    ship_status = txt(sh.get("Shipment_Status"))
                    if not _blank(row.get("Date_Shipped")):
                        date_shipped = to_date(row.get("Date_Shipped"))
                    if _blank(mode_val):
                        mode_val = txt(row.get("Shipment_Mode"))

    f = compute_forecast({
        "today": today, "settings": settings, "stage": stage, "stockOnHand": stock_on_hand, "modeVal": mode_val,
        "sourcing": sourcing, "supLead": sup_lead, "prAdded": pr_added, "prepStart": prep_start, "prepFound": bool(prep_start),
        "dateShipped": date_shipped, "shipStatus": ship_status, "clientTarget": client_target,
    })
    if f["skip"]:
        return f"{so_no} — walang mapagsimulang petsa, hindi nagtatak"

    stamped = 0

    async def _stamp(form: str, rows: list) -> None:
        nonlocal stamped
        for r in rows:
            await _stamp_row(store, form, r, f)
            stamped += 1

    if sof:
        await _stamp("Sales_Order_Fulfillment", [sof])
    if pr_no != "":
        await _stamp("Purchase_Request1", await store.find("Purchase_Request1", lambda r: r.get("PR_No") == pr_no))
    await _stamp("Sales_Order_Readiness_Gate", [g for g in gate_recs if _for_pr(g, "pr_number")])
    await _stamp("Pre_Order_FF", await store.find("Pre_Order_FF", lambda r: r.get("SO") == so_no))
    await _stamp("Pick1", [p for p in pick_recs if _for_pr(p, "PR_if_any")])
    await _stamp("Checker_Checklist", [q for q in qc_recs if _for_pr(q, "PR")])
    await _stamp("Order_Aggregation1", [o for o in oa_recs if _for_pr(o, "PR")])
    await _stamp("Crate_Checklist", [c for c in crate_recs if _for_pr(c, "PR_if_any")])
    await _stamp("Receiving", await store.find("Receiving", lambda r: r.get("SO_No") == so_no))

    mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    y, m, dd = f["delivery"].split("-")
    return f"{so_no} -> {mon[int(m) - 1]} {dd}, {y} | {f['window']} | {f['status']} | {stamped} record"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/forecast/test_stamp.py -v`
Expected: PASS (10/10)

- [ ] **Step 5: Commit**

```bash
git add app/forecast/stamp.py tests/forecast/test_stamp.py
git commit -m "feat: app/forecast/stamp.py (fc_stamp_by_so_no)"
```

---

## Task 5: `app/forecast/hooks.py` — the 7 Instant Forecast workflows

**Files:**
- Create: `app/forecast/hooks.py`
- Test: `tests/forecast/test_hooks.py`

**Interfaces:**
- Consumes: `app.workflows.register`, `app.forecast.stamp.fc_stamp_by_so_no`
- Produces: nothing importable beyond the module itself — importing `app.forecast.hooks` registers all 7 hooks as a side effect, exactly like Node's `hooks.mjs`

- [ ] **Step 1: Write the failing tests**

```python
# tests/forecast/test_hooks.py
from datetime import timedelta

import pytest

from app.deluge import today_date, ymd
from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store, WORKFLOWS
import app.forecast.hooks  # noqa: F401 -- import registers the 7 hooks as a side effect, once per process


def in_days(n: int) -> str:
    return ymd(today_date() + timedelta(days=n))


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


# No WORKFLOWS-clearing fixture in this file: app.forecast.hooks registers its 7 hooks once, at
# import time, the same way Node's hooks.mjs does -- clearing WORKFLOWS between tests would also
# erase them, since they are never re-registered. This file instead relies on the module import
# above happening exactly once per test process (Python's own import cache), consistent with every
# other hook-registering module in this plan being imported once at process start, not per test.


def test_every_form_with_an_instant_forecast_workflow_has_its_hooks():
    for form in ["Sales_Order_Fulfillment", "Sales_Order_Readiness_Gate", "Pick1", "Pre_Order_FF", "Checker_Checklist", "Crate_Checklist", "Order_Aggregation1"]:
        assert WORKFLOWS.get(form, {}).get("afterAdd")
        assert WORKFLOWS.get(form, {}).get("afterUpdate")


@pytest.mark.asyncio
async def test_saving_a_gate_row_stamps_the_forecast_on_the_orders_rows_with_its_own_so_field_name(raw_store):
    hooked = create_hooked_store(raw_store)
    sof = await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-1", "order_type": "STOCK", "target_delivery_date": in_days(30)})
    gate = await hooked.add_record("Sales_Order_Readiness_Gate", {"sales_order_number": "SO-1"})
    for form, id_ in [("Sales_Order_Readiness_Gate", gate), ("Sales_Order_Fulfillment", sof)]:
        r = await raw_store.get_record_by_id(form, id_, raw=True)
        assert r["Forecast_Delivery"] == in_days(7), form
        assert r["Forecast_Status"] == "On Track", form


@pytest.mark.asyncio
async def test_each_of_the_other_forms_stamps_its_order_when_it_is_saved(raw_store):
    hooked = create_hooked_store(raw_store)
    for form, field in [("Pick1", "SO"), ("Pre_Order_FF", "SO"), ("Checker_Checklist", "SO"), ("Crate_Checklist", "SO"), ("Order_Aggregation1", "SO")]:
        so = f"SO-{form}"
        await raw_store.add_record("Sales_Order_Fulfillment", {"SO_No": so, "order_type": "STOCK"})
        id_ = await hooked.add_record(form, {field: so})
        r = await raw_store.get_record_by_id(form, id_, raw=True)
        assert r["Forecast_Delivery"] == in_days(7), form


@pytest.mark.asyncio
async def test_mirrors_zoho_a_fulfillment_row_is_stamped_only_when_it_has_no_forecast_yet(raw_store):
    hooked = create_hooked_store(raw_store)
    id_ = await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-2", "order_type": "STOCK"})
    assert (await raw_store.get_record_by_id("Sales_Order_Fulfillment", id_, raw=True))["Forecast_Delivery"] == in_days(7)
    await raw_store.update_record("Sales_Order_Fulfillment", id_, {"Forecast_Delivery": in_days(3)}, by_form=True)
    await hooked.update_record("Sales_Order_Fulfillment", id_, {"Shipment_Mode": "Air"}, by_form=True)
    assert (await raw_store.get_record_by_id("Sales_Order_Fulfillment", id_, raw=True))["Forecast_Delivery"] == in_days(3)  # untouched


@pytest.mark.asyncio
async def test_a_save_with_a_blank_sales_order_does_nothing_and_does_not_fail(raw_store):
    hooked = create_hooked_store(raw_store)
    id_ = await hooked.add_record("Pick1", {})
    r = await raw_store.get_record_by_id("Pick1", id_, raw=True)
    assert r["Forecast_Delivery"] == ""
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/forecast/test_hooks.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.forecast.hooks'`

- [ ] **Step 3: Write the implementation**

```python
# app/forecast/hooks.py
# The "Instant Forecast" workflows of the Fulfillment forms, ported from server/forecast/hooks.mjs.
# Each is "on add or edit, on success" and works out the forecast of the order that was just saved,
# stamping it on every row of that order. The field holding the sales order has a different name on
# each form (four different spellings in the app). Imported by app/fulfillment/workflows.py, the
# same place Node's hooks.mjs is imported from fulfillment/workflows.mjs.
#
#   SOF_Instant_Forecast        Sales_Order_Fulfillment     SO_No     only when the row has no
#                                                                      Forecast_Delivery yet
#   GATE_Instant_Forecast       Sales_Order_Readiness_Gate  sales_order_number
#   GATE_Instant_Forecast1      Pick1                       SO
#   PREORDER_Instant_Forecast   Pre_Order_FF                SO
#   QC_Instant_Forecast         Checker_Checklist            SO
#   CRATE_Instant_Forecast      Crate_Checklist              SO
#   OA_Instant_Forecast         Order_Aggregation1           SO
from app.workflows import register
from app.forecast.stamp import fc_stamp_by_so_no


def _blank(v) -> bool:
    return v is None or v == ""


def _stamp_on_save(field: str, only_if_no_forecast: bool = False):
    async def hook(args):
        record = args["record"]
        if only_if_no_forecast and not _blank(record.get("Forecast_Delivery")):
            return
        await fc_stamp_by_so_no(args["store"], str(record.get(field) or ""))
    return hook


def _on(form: str, field: str, only_if_no_forecast: bool = False) -> None:
    hook = _stamp_on_save(field, only_if_no_forecast)
    register(form, {"afterAdd": hook, "afterUpdate": hook})


_on("Sales_Order_Fulfillment", "SO_No", only_if_no_forecast=True)
_on("Sales_Order_Readiness_Gate", "sales_order_number")
_on("Pick1", "SO")
_on("Pre_Order_FF", "SO")
_on("Checker_Checklist", "SO")
_on("Crate_Checklist", "SO")
_on("Order_Aggregation1", "SO")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/forecast/test_hooks.py -v`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add app/forecast/hooks.py tests/forecast/test_hooks.py
git commit -m "feat: app/forecast/hooks.py (the 7 Instant Forecast workflows)"
```

---

## Task 6: `app/forecast/purchase_request.py` + `app/forecast/pr_hooks.py` — the PR side of the forecast

**Files:**
- Create: `app/forecast/purchase_request.py`, `app/forecast/pr_hooks.py`
- Test: `tests/forecast/test_purchase_request.py`

**Interfaces:**
- Consumes: `app.forecast.forecast_settings.forecast_settings`, `app.forecast.engine.bucket_of`, `app.forecast.engine.finish`, `app.forecast.stamp.to_date`, `app.forecast.stamp.txt`, `app.deluge.today_date`, `app.workflows.register`
- Produces: `fc_stamp_purchase_request(store, pr_id, *, today: date = None) -> str`, `fc_pr_to_pre_order(store, pr_id, *, today: date = None) -> str`. `pr_hooks.py` registers on `Purchase_Request1` as an importable side effect (not imported by `app/fulfillment/__init__.py` — see Global Constraints), but is a real, tested file: Procurement's own future slice imports it.

- [ ] **Step 1: Write the failing tests**

```python
# tests/forecast/test_purchase_request.py
from datetime import date, timedelta

import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
from app.forecast.purchase_request import fc_stamp_purchase_request, fc_pr_to_pre_order
from app.forecast.stamp import NULL_TEXT
import app.forecast.pr_hooks  # noqa: F401 -- import registers the Purchase_Request1 hook

TODAY = date(2026, 11, 12)


@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def _pr(store, extra=None, added="2026-11-01 08:00:00 AM"):
    extra = extra or {}
    id_ = await store.add_record("Purchase_Request1", {"PR_No": "PR-1", "Shipment_Mode": "Air", "Sourcing_Type": "Import", **extra})
    await store.update_record("Purchase_Request1", id_, {"Added_Time": added}, by_form=True)
    return id_


@pytest.mark.asyncio
async def test_a_pr_with_a_mode_and_no_order(store):
    id_ = await _pr(store)
    out = await fc_stamp_purchase_request(store, id_, today=TODAY)
    r = await store.get_record_by_id("Purchase_Request1", id_, raw=True)
    assert (r["Forecast_Delivery"], r["Forecast_Window"], r["Forecast_Status"]) == (
        "2026-11-17", "Nov 15 - Nov 18, 2026 | Air | Procurement", "No Client Date",
    )
    assert out == "PR-1 -> Nov 17, 2026 | Nov 15 - Nov 18, 2026 | Air | Procurement | No Client Date"


@pytest.mark.asyncio
async def test_a_missing_pr_or_one_with_no_added_time_is_answered_and_nothing_is_written(store):
    assert (await fc_stamp_purchase_request(store, "4662244000099999999", today=TODAY)).startswith("walang PR o walang Added_Time")
    id_ = await store.add_record("Purchase_Request1", {"PR_No": "PR-2", "Shipment_Mode": "Air"})
    await store.update_record("Purchase_Request1", id_, {"Added_Time": ""}, by_form=True)
    assert (await fc_stamp_purchase_request(store, id_, today=TODAY)).startswith("walang PR o walang Added_Time")


@pytest.mark.asyncio
async def test_mirrors_zoho_nothing_stamped_until_mode_known_except_local(store):
    id_ = await _pr(store, {"Shipment_Mode": "", "Sourcing_Type": "Import"})
    out = await fc_stamp_purchase_request(store, id_, today=TODAY)
    if NULL_TEXT:
        assert "LCL?" in out and "Procurement" in out
    else:
        assert out == "wala pang Shipment Mode ang PR-1 — hindi muna nagtatatak"
    local = await _pr(store, {"PR_No": "PR-3", "Shipment_Mode": "", "Sourcing_Type": "Local"})
    out2 = await fc_stamp_purchase_request(store, local, today=TODAY)
    assert "Local" in out2 and "Procurement" in out2


@pytest.mark.asyncio
async def test_status_uses_the_client_date_of_the_prs_order_and_the_order_is_stamped(store):
    id_ = await _pr(store)
    sof = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-1", "PR_No": "PR-1", "order_type": "PRE ORDER", "target_delivery_date": "2026-11-16"})
    await fc_stamp_purchase_request(store, id_, today=TODAY)
    r = await store.get_record_by_id("Purchase_Request1", id_, raw=True)
    assert r["Forecast_Status"] == "At Risk"
    assert r["Forecast_Window"] == "Nov 15 - Nov 18, 2026 | Air | Procurement"
    sof_row = await store.get_record_by_id("Sales_Order_Fulfillment", sof, raw=True)
    assert (sof_row["Forecast_Delivery"], sof_row["Forecast_Status"]) == ("2026-11-17", "At Risk")


@pytest.mark.asyncio
async def test_stock_on_hand_vs_on_the_ladder_vs_never_stock_with_no_order(store):
    id_ = await _pr(store)
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-2", "PR_No": "PR-1", "order_type": "STOCK"})
    await fc_stamp_purchase_request(store, id_, today=TODAY)
    assert (await store.get_record_by_id("Purchase_Request1", id_, raw=True))["Forecast_Window"] == "Nov 19 - Nov 19, 2026 | Air | Stock on hand"

    for r in await store.find("Sales_Order_Fulfillment"):
        await store.delete_record("Sales_Order_Fulfillment", r["ID"])
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-3", "PR_No": "PR-1", "order_type": "PRE ORDER", "Fulfillment_Stage": "For Delivery"})
    await fc_stamp_purchase_request(store, id_, today=TODAY)
    assert (await store.get_record_by_id("Purchase_Request1", id_, raw=True))["Forecast_Window"] == "Nov 12 - Nov 12, 2026 | Air | Ready"


@pytest.mark.asyncio
async def test_a_shipped_pr_is_in_transit_a_delivered_one_is_at_the_warehouse(store):
    id_ = await _pr(store, added="2026-10-01 08:00:00 AM")
    await store.add_record("Shipments", {"Shipment_Status": "In Transit", "Supplier_Shipment_Details": [{"PR_No": "PR-1", "Date_Shipped": "2026-11-01"}]})
    await fc_stamp_purchase_request(store, id_, today=TODAY)
    assert (await store.get_record_by_id("Purchase_Request1", id_, raw=True))["Forecast_Window"] == "Nov 15 - Nov 18, 2026 | Air | In transit"
    for r in await store.find("Shipments"):
        await store.delete_record("Shipments", r["ID"])
    await store.add_record("Shipments", {"Shipment_Status": "Delivered", "Supplier_Shipment_Details": [{"PR_No": "PR-1", "Date_Shipped": "2026-11-01"}]})
    await fc_stamp_purchase_request(store, id_, today=TODAY)
    assert (await store.get_record_by_id("Purchase_Request1", id_, raw=True))["Forecast_Window"] == "Nov 19 - Nov 19, 2026 | Air | At WH"


@pytest.mark.asyncio
async def test_fc_pr_to_pre_order_copies_the_pr_forecast_onto_every_pre_order_row_of_the_pr(store):
    id_ = await _pr(store)
    a = await store.add_record("Pre_Order_FF", {"SO": "SO-5", "PR": "PR-1"})
    b = await store.add_record("Pre_Order_FF", {"SO": "SO-6", "PR": "PR-1"})
    other = await store.add_record("Pre_Order_FF", {"SO": "SO-7", "PR": "PR-9"})
    out = await fc_pr_to_pre_order(store, id_, today=TODAY)
    assert out == "PR-1 -> 2 pre-order row | Nov 15 - Nov 18, 2026 | Air | Procurement | No Client Date"
    for row in (a, b):
        assert (await store.get_record_by_id("Pre_Order_FF", row, raw=True))["Forecast_Delivery"] == "2026-11-17"
    assert (await store.get_record_by_id("Pre_Order_FF", other, raw=True))["Forecast_Delivery"] == ""


@pytest.mark.asyncio
async def test_saving_a_pr_through_the_hooks_stamps_it_and_its_pre_order_rows(store):
    hooked = create_hooked_store(store)
    id_ = await hooked.add_record("Purchase_Request1", {"Shipment_Mode": "Air", "Sourcing_Type": "Import", "PR_No": "PR-HOOK-1"})
    r = await store.get_record_by_id("Purchase_Request1", id_, raw=True)
    assert r["Forecast_Delivery"] != ""
    po = await store.add_record("Pre_Order_FF", {"SO": "SO-9", "PR": r["PR_No"]})
    await hooked.update_record("Purchase_Request1", id_, {"description": "saved again"}, by_form=True)
    po_row = await store.get_record_by_id("Pre_Order_FF", po, raw=True)
    pr_row = await store.get_record_by_id("Purchase_Request1", id_, raw=True)
    assert po_row["Forecast_Delivery"] == pr_row["Forecast_Delivery"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/forecast/test_purchase_request.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.forecast.purchase_request'`

- [ ] **Step 3: Write the implementation**

```python
# app/forecast/purchase_request.py
# The purchase-request side of the forecast, ported from server/forecast/purchase-request.mjs
# (itself from zoho-export/parsed/functions/fcStampPurchaseRequest.dg and fcPrToPreOrder.dg),
# called by the workflow PR1_Forecast_Stamp ("on add or edit, on success" of Purchase_Request1).
#
# A SECOND version of the ladder, not a copy of fc_stamp_by_so_no ("mirrors Zoho", kept as written):
#  - Nothing is stamped until the PR has a shipment mode (Local sourcing is exempt).
#  - The window text has no "+Nd vs client" part; only the status uses the client date.
#  - The supplier lead time is added only when the shipment branch is NOT taken.
#  - The shipment branch loops all shipment rows with this PR; each row overrides the one before.
#  - With no Sales_Order_Fulfillment row the PR is never stock on hand.
#  - It always writes the PR and the SOF row (here only a value that differs).
from datetime import date

from app.deluge import today_date
from app.forecast.engine import bucket_of, finish
from app.forecast.forecast_settings import forecast_settings
from app.forecast.stamp import to_date, txt

_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _blank(v) -> bool:
    return v is None or v == ""


def _day_of(v) -> str:
    d = to_date(v)
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}" if d else ""


def _long_date(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{_MON[int(m) - 1]} {d}, {y}"


_PREP = ["Picking", "Pack", "Quality Checking", "Crate"]


async def _stamp_if_different(store, form: str, row: dict, f: dict) -> None:
    changes = {}
    if _day_of(row.get("Forecast_Delivery")) != f["delivery"]:
        changes["Forecast_Delivery"] = f["delivery"]
    if row.get("Forecast_Window") != f["window"]:
        changes["Forecast_Window"] = f["window"]
    if row.get("Forecast_Status") != f["status"]:
        changes["Forecast_Status"] = f["status"]
    if changes:
        await store.update_record(form, row["ID"], changes, by_form=True)


async def fc_stamp_purchase_request(store, pr_id, *, today: date | None = None) -> str:
    today = today or today_date()
    settings = await forecast_settings(store)
    id_ = str(pr_id or "")
    prs = await store.find("Purchase_Request1", lambda r: r.get("ID") == id_)
    pr = prs[0] if prs else None

    pr_no = txt(pr.get("PR_No")) if pr else ""
    mode_val = txt(pr.get("Shipment_Mode")) if pr else ""
    src_val = txt(pr.get("Sourcing_Type")).upper() if pr else ""
    sup_lead = 0
    if pr and not _blank(pr.get("Required_Days_Lead")):
        try:
            sup_lead = int(float(pr.get("Required_Days_Lead")))
        except (TypeError, ValueError):
            sup_lead = 0
    if not pr or _blank(pr.get("Added_Time")) or not to_date(pr.get("Added_Time")):
        return f"walang PR o walang Added_Time: {id_}"
    anchor = to_date(pr.get("Added_Time"))

    sof = None
    so_no = stage = ""
    stock_on_hand = False
    client_target = None
    if pr_no != "":
        sofs = await store.find("Sales_Order_Fulfillment", lambda r: r.get("PR_No") == pr_no)
        if sofs:
            sof = sofs[0]
            so_no = txt(sof.get("SO_No"))
            stage = txt(sof.get("Fulfillment_Stage"))
            stock_on_hand = "PRE ORDER" not in txt(sof.get("order_type")).upper()
            client_target = None if _blank(sof.get("target_delivery_date")) else to_date(sof.get("target_delivery_date"))

    prep_start = None
    if so_no != "":
        rows = (
            await store.find("Sales_Order_Readiness_Gate", lambda r: r.get("sales_order_number") == so_no)
            + await store.find("Pick1", lambda r: r.get("SO") == so_no)
            + await store.find("Checker_Checklist", lambda r: r.get("SO") == so_no)
            + await store.find("Crate_Checklist", lambda r: r.get("SO") == so_no)
        )
        for r in rows:
            d = None if _blank(r.get("Added_Time")) else to_date(r.get("Added_Time"))
            if d and (not prep_start or d < prep_start):
                prep_start = d

    if mode_val.upper() == "" and src_val != "LOCAL":
        return f"wala pang Shipment Mode ang {pr_no} — hindi muna nagtatatak"
    b = bucket_of(settings, src_val, mode_val)
    t_min, t_max, c_min, c_max, bucket = b["tMin"], b["tMax"], b["cMin"], b["cMax"], b["bucket"]

    position = "Procurement"
    s_min = t_min + c_min + settings["prepMin"] + settings["delMin"]
    s_max = t_max + c_max + settings["prepMax"] + settings["delMax"]
    laddered = False
    if settings["reAnchor"] and stage == "For Delivery":
        anchor = today
        s_min, s_max = settings["delMin"], settings["delMax"]
        position = "Ready"
        laddered = True
    elif (settings["reAnchor"] and stage == "Order Readiness") or stage in _PREP:
        anchor = today
        used = abs((today - prep_start).days) if prep_start else 0
        s_min = max(0, settings["prepMin"] - used) + settings["delMin"]
        s_max = max(0, settings["prepMax"] - used) + settings["delMax"]
        position = stage
        laddered = True
    if not laddered and stock_on_hand:
        anchor = today
        s_min, s_max = settings["prepMin"] + settings["delMin"], settings["prepMax"] + settings["delMax"]
        position = "Stock on hand"
        laddered = True
    if not laddered and settings["reAnchor"] and pr_no != "":
        for sh in await store.find("Shipments"):
            for row in sh.get("Supplier_Shipment_Details") or []:
                if txt(row.get("PR_No")) != pr_no:
                    continue
                shipped = None if _blank(row.get("Date_Shipped")) else to_date(row.get("Date_Shipped"))
                if txt(sh.get("Shipment_Status")) == "Delivered":
                    anchor = today
                    s_min, s_max = settings["prepMin"] + settings["delMin"], settings["prepMax"] + settings["delMax"]
                    position = "At WH"
                elif shipped:
                    anchor = shipped
                    position = "In transit"
    elif not laddered and settings["addSupLead"]:
        s_min += sup_lead
        s_max += sup_lead

    f = finish({"today": today, "anchor": anchor, "sumMin": s_min, "sumMax": s_max, "bucket": bucket, "position": position, "clientTarget": client_target, "variance": False})
    await _stamp_if_different(store, "Purchase_Request1", pr, f)
    if sof:
        await _stamp_if_different(store, "Sales_Order_Fulfillment", sof, f)
    return f"{pr_no} -> {_long_date(f['delivery'])} | {f['window']} | {f['status']}"


async def fc_pr_to_pre_order(store, pr_id, *, today: date | None = None) -> str:
    engine_said = await fc_stamp_purchase_request(store, pr_id, today=today)
    prs = await store.find("Purchase_Request1", lambda r: r.get("ID") == str(pr_id or ""))
    pr = prs[0] if prs else None
    pr_no = txt(pr.get("PR_No")) if pr else ""
    if not pr or pr_no == "":
        return f"walang PR na {pr_id}"
    fc_date = None if _blank(pr.get("Forecast_Delivery")) else _day_of(pr.get("Forecast_Delivery"))
    fc_window = pr.get("Forecast_Window") or ""
    fc_status = pr.get("Forecast_Status") or ""
    if fc_date is None and fc_status == "":
        return f"{pr_no} — wala pang forecast ang PR mismo. {engine_said}"
    hit = 0
    for po in await store.find("Pre_Order_FF", lambda r: r.get("PR") == pr_no):
        changes = {}
        if _day_of(po.get("Forecast_Delivery")) != (fc_date or ""):
            changes["Forecast_Delivery"] = fc_date or ""
        if po.get("Forecast_Window") != fc_window:
            changes["Forecast_Window"] = fc_window
        if po.get("Forecast_Status") != fc_status:
            changes["Forecast_Status"] = fc_status
        if changes:
            await store.update_record("Pre_Order_FF", po["ID"], changes, by_form=True)
        hit += 1
    return f"{pr_no} -> {hit} pre-order row | {fc_window} | {fc_status}"
```

```python
# app/forecast/pr_hooks.py
# PR1_Forecast_Stamp ("on add or edit, on success" of Purchase_Request1), ported from
# server/forecast/pr-hooks.mjs: works out the forecast of the PR, stamps the PR and its order, and
# copies it onto the Pre Order rows of the PR. Imported by the Procurement module in Node
# (server/modules/procurement/workflows.mjs), NOT by Fulfillment -- app/fulfillment/__init__.py
# does not import this file; Procurement's own future slice does. The stamp writes through the
# plain store, so it does not fire this again.
from app.workflows import register
from app.forecast.purchase_request import fc_pr_to_pre_order


async def _stamp(args):
    await fc_pr_to_pre_order(args["store"], args["id"])


register("Purchase_Request1", {"afterAdd": _stamp, "afterUpdate": _stamp})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/forecast/test_purchase_request.py -v`
Expected: PASS (9/9)

- [ ] **Step 5: Commit**

```bash
git add app/forecast/purchase_request.py app/forecast/pr_hooks.py tests/forecast/test_purchase_request.py
git commit -m "feat: app/forecast/purchase_request.py + pr_hooks.py (PR-side forecast, not wired into Fulfillment)"
```

---

## Task 7: `app/forecast/schedule.py` — the two daily forecast schedules (plain callables, no cron)

**Files:**
- Create: `app/forecast/schedule.py`
- Test: `tests/forecast/test_schedule.py`

**Interfaces:**
- Consumes: `app.forecast.forecast_settings.forecast_settings`, `app.forecast.engine.compute_forecast`, `app.forecast.engine.bucket_of`, `app.forecast.engine.finish`, `app.forecast.stamp.to_date`, `app.forecast.stamp.txt`, `app.deluge.today_date`
- Produces: `run_forecast_stamp_daily(store, *, today: date = None, log=lambda s: None) -> dict`, `run_backfill_pre_order(store, *, log=lambda s: None) -> dict`. Neither is wired to a scheduler in this plan — both are plain async functions a later slice's scheduler can call directly.

- [ ] **Step 1: Write the failing tests**

```python
# tests/forecast/test_schedule.py
from datetime import date

import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.forecast.schedule import run_forecast_stamp_daily, run_backfill_pre_order

TODAY = date(2026, 11, 12)


@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.mark.asyncio
async def test_every_sof_row_is_stamped_and_the_summary_counts_are_right(store):
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-1", "order_type": "STOCK"})
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-2", "order_type": "STOCK"})
    summary = await run_forecast_stamp_daily(store, today=TODAY)
    assert summary["sofCount"] == 2
    assert summary["stampCount"] == 2
    assert summary["noDateCount"] == 0
    rows = await store.find("Sales_Order_Fulfillment")
    assert all(r["Forecast_Delivery"] != "" for r in rows)


@pytest.mark.asyncio
async def test_items_are_matched_by_sku_when_a_stage_row_carries_one(store):
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-3", "order_type": "STOCK", "SO_SKU_Key": "SO-3_L-1", "Fulfillment_Stage": "Picking"})
    gate = await store.add_record("Sales_Order_Readiness_Gate", {"sales_order_number": "SO-3", "SKU": "L-1"})
    other_gate = await store.add_record("Sales_Order_Readiness_Gate", {"sales_order_number": "SO-3", "SKU": "S-1"})
    await run_forecast_stamp_daily(store, today=TODAY)
    assert (await store.get_record_by_id("Sales_Order_Readiness_Gate", gate, raw=True))["Forecast_Delivery"] != ""
    assert (await store.get_record_by_id("Sales_Order_Readiness_Gate", other_gate, raw=True))["Forecast_Delivery"] == ""


@pytest.mark.asyncio
async def test_a_pr_with_no_sof_yet_is_stamped_in_the_second_pass_always_no_client_date(store):
    pr = await store.add_record("Purchase_Request1", {"PR_No": "PR-1", "Shipment_Mode": "Air"})
    await store.update_record("Purchase_Request1", pr, {"Added_Time": "2026-11-01 08:00:00 AM"}, by_form=True)
    summary = await run_forecast_stamp_daily(store, today=TODAY)
    assert summary["prOnlyCount"] == 1
    r = await store.get_record_by_id("Purchase_Request1", pr, raw=True)
    assert r["Forecast_Status"] == "No Client Date"


@pytest.mark.asyncio
async def test_rollup_forms_get_the_latest_date_and_worst_status_across_items(store):
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-4", "order_type": "STOCK", "SO_SKU_Key": "SO-4_A", "target_delivery_date": "2026-11-10"})
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-4", "order_type": "STOCK", "SO_SKU_Key": "SO-4_B", "target_delivery_date": "2026-12-25"})
    receiving = await store.add_record("Receiving", {"SO_No": "SO-4"})
    await run_forecast_stamp_daily(store, today=TODAY)
    r = await store.get_record_by_id("Receiving", receiving, raw=True)
    assert r["Forecast_Status"] in ("Overdue", "At Risk", "Will Miss")  # worst of the two items' statuses


@pytest.mark.asyncio
async def test_run_backfill_pre_order_copies_the_pr_forecast_onto_matching_pre_order_rows(store):
    pr = await store.add_record("Purchase_Request1", {"PR_No": "PR-2", "Forecast_Delivery": "2026-12-01", "Forecast_Window": "window text", "Forecast_Status": "On Track"})
    filled = await store.add_record("Pre_Order_FF", {"SO": "SO-5", "PR": "PR-2"})
    no_pr = await store.add_record("Pre_Order_FF", {"SO": "SO-6", "PR": ""})
    no_forecast_pr = await store.add_record("Pre_Order_FF", {"SO": "SO-7", "PR": "PR-NONE"})
    summary = await run_backfill_pre_order(store)
    assert summary["filled"] == 1
    assert summary["noPr"] == 1
    assert summary["noForecast"] == 1
    r = await store.get_record_by_id("Pre_Order_FF", filled, raw=True)
    assert (r["Forecast_Delivery"], r["Forecast_Status"]) == ("2026-12-01", "On Track")
    assert (await store.get_record_by_id("Pre_Order_FF", no_pr, raw=True))["Forecast_Delivery"] == ""
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/forecast/test_schedule.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.forecast.schedule'`

- [ ] **Step 3: Write the implementation**

```python
# app/forecast/schedule.py
# The two daily forecast schedules, ported from server/forecast/schedule.mjs (itself from
# zoho-export/parsed/workflows/schedule/_/Forecast_Stamp_Daily and Backfill_PreOrder_Forecas, both
# 01:00 Asia/Manila in Node). NOT wired to any scheduler in this plan (see Global Constraints) --
# both functions below are plain async callables a later slice's cron wiring can call directly.
#
# Forecast_Stamp_Daily does what fc_stamp_by_so_no does on save, for EVERY order, but PER ITEM (one
# Sales_Order_Fulfillment row is one item, identified by PR + SKU via SO_SKU_Key). Forms with no SKU
# (Receiving, Order Aggregation, Service Request, Service Appointment) get the roll-up of the order:
# the LATEST date and WORST status across its items.
from datetime import date

from app.deluge import today_date
from app.forecast.engine import bucket_of, compute_forecast, finish
from app.forecast.forecast_settings import forecast_settings
from app.forecast.stamp import to_date, txt

_RANK = {"No Start Date": 1, "No Client Date": 2, "On Track": 3, "At Risk": 4, "Will Miss": 5, "Overdue": 6}


def _blank(v) -> bool:
    return v is None or v == ""


def _day_str(v) -> str:
    d = None if _blank(v) else to_date(v)
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}" if d else ""


def _norm_sku(v) -> str:
    s = txt(v).strip().upper()
    if s == "NULL":
        s = ""
    if s.startswith("SKU:"):
        s = s.replace("SKU:", "").strip()
    return s


def _group(rows: list, key: str) -> dict:
    out: dict = {}
    for r in rows:
        out.setdefault(r.get(key), []).append(r)
    return out


async def _put(store, form: str, rows: list, f: dict) -> None:
    for row in rows:
        changes = {}
        want = f.get("delivery") or ""
        if _day_str(row.get("Forecast_Delivery")) != want:
            changes["Forecast_Delivery"] = want
        if (row.get("Forecast_Window") or "") != f["window"]:
            changes["Forecast_Window"] = f["window"]
        if (row.get("Forecast_Status") or "") != f["status"]:
            changes["Forecast_Status"] = f["status"]
        if changes:
            await store.update_record(form, row["ID"], changes, by_form=True)
            row.update(changes)


async def run_forecast_stamp_daily(store, *, today: date | None = None, log=lambda s: None) -> dict:
    settings = await forecast_settings(store)
    today = today or today_date()
    for s in await store.find("Schedule_Test_Settings"):
        if not _blank(s.get("Test_Current_Date")):
            today = to_date(s.get("Test_Current_Date")) or today

    ships = await store.find("Shipments")
    ship_by_id = {s["ID"]: s for s in ships}
    ship_by_pr: dict = {}
    for sh in ships:
        for row in sh.get("Supplier_Shipment_Details") or []:
            if _blank(row.get("PR_No")):
                continue
            pk = txt(row.get("PR_No"))
            ds = None if _blank(row.get("Date_Shipped")) else to_date(row.get("Date_Shipped"))
            cur = ship_by_pr.get(pk)
            if not cur or (ds and (not cur["date"] or ds < cur["date"])):
                ship_by_pr[pk] = {"id": sh["ID"], "date": ds, "status": txt(sh.get("Shipment_Status")), "mode": "" if _blank(row.get("Shipment_Mode")) else str(row.get("Shipment_Mode"))}

    sofs = await store.find("Sales_Order_Fulfillment")
    prs = await store.find("Purchase_Request1")
    gates = await store.find("Sales_Order_Readiness_Gate")
    picks = await store.find("Pick1")
    qcs = await store.find("Checker_Checklist")
    oas = await store.find("Order_Aggregation1")
    crates = await store.find("Crate_Checklist")
    receivings = await store.find("Receiving")
    srs = await store.find("Service_Request1")
    sas = await store.find("Service_Appointment_Form")

    pr_by_no = _group(prs, "PR_No")
    gate_by_so = _group(gates, "sales_order_number")
    pick_by_so = _group(picks, "SO")
    qc_by_so = _group(qcs, "SO")
    oa_by_so = _group(oas, "SO")
    crate_by_so = _group(crates, "SO")
    rcv_by_so = _group(receivings, "SO_No")
    sr_by_so = _group(srs, "Sales_Order")
    sa_by_so = _group(sas, "Sales_Order")

    sof_count = stamp_count = no_date_count = 0
    touched: set = set()
    best: dict = {}
    best_win: dict = {}
    worst: dict = {}
    worst_rank: dict = {}

    for sof in sofs:
        sof_count += 1
        so_no = txt(sof.get("SO_No"))
        pr_no = txt(sof.get("PR_No")).strip()
        if pr_no == "null":
            pr_no = ""
        has_pr = pr_no != ""
        key = txt(sof.get("SO_SKU_Key")).strip()
        if key == "null":
            key = ""
        sof_sku = ""
        if key != "":
            sof_sku = key.replace(f"{so_no}_", "", 1) if so_no != "" else key
            sof_sku = sof_sku.strip().upper()
            if sof_sku.startswith("SKU:"):
                sof_sku = sof_sku.replace("SKU:", "").strip()
        client_target = None if _blank(sof.get("target_delivery_date")) else to_date(sof.get("target_delivery_date"))

        pr_added = None
        sourcing = ""
        sup_lead = 0
        mode_val = txt(sof.get("Shipment_Mode"))
        if has_pr:
            pr_rows = pr_by_no.get(pr_no) or []
            if pr_rows:
                pr = pr_rows[0]
                if not _blank(pr.get("Added_Time")):
                    pr_added = to_date(pr.get("Added_Time"))
                sourcing = txt(pr.get("Sourcing_Type"))
                if not _blank(pr.get("Required_Days_Lead")):
                    try:
                        sup_lead = int(float(pr.get("Required_Days_Lead")))
                    except (TypeError, ValueError):
                        sup_lead = 0
                if _blank(mode_val):
                    mode_val = txt(pr.get("Shipment_Mode"))
        if not pr_added and not _blank(sof.get("SO_Created_Date")):
            pr_added = to_date(sof.get("SO_Created_Date"))

        date_shipped = None
        ship_status = ""
        ship_id = None
        ship = ship_by_pr.get(pr_no) if has_pr else None
        if ship:
            ship_id, date_shipped, ship_status = ship["id"], ship["date"], ship["status"]
            if _blank(mode_val):
                mode_val = ship["mode"]

        gate_recs = gate_by_so.get(so_no) or []
        pick_recs = pick_by_so.get(so_no) or []
        qc_recs = qc_by_so.get(so_no) or []
        oa_recs = oa_by_so.get(so_no) or []
        crate_recs = crate_by_so.get(so_no) or []

        def _hit(rows):
            return sof_sku != "" and any(_norm_sku(r.get("SKU")) == sof_sku for r in rows)

        sku_hit = {"gate": _hit(gate_recs), "pick": _hit(pick_recs), "qc": _hit(qc_recs), "crate": _hit(crate_recs)}

        def _matches(row, which, pr_field):
            if sku_hit[which]:
                return _norm_sku(row.get("SKU")) == sof_sku
            return not (has_pr and not _blank(row.get(pr_field)) and row.get(pr_field) != pr_no)

        m_gate = [r for r in gate_recs if _matches(r, "gate", "pr_number")]
        m_pick = [r for r in pick_recs if _matches(r, "pick", "PR_if_any")]
        m_qc = [r for r in qc_recs if _matches(r, "qc", "PR")]
        m_crate = [r for r in crate_recs if _matches(r, "crate", "PR_if_any")]

        prep_start = None
        for r in [*m_gate, *m_pick, *m_qc, *m_crate]:
            d = None if _blank(r.get("Added_Time")) else to_date(r.get("Added_Time"))
            if d and (not prep_start or d < prep_start):
                prep_start = d

        c = compute_forecast({
            "today": today, "settings": settings, "stage": txt(sof.get("Fulfillment_Stage")), "stockOnHand": not has_pr,
            "modeVal": mode_val, "sourcing": sourcing, "supLead": sup_lead, "prAdded": pr_added, "prepStart": prep_start,
            "prepFound": bool(prep_start), "dateShipped": date_shipped, "shipStatus": ship_status, "clientTarget": client_target,
        })
        f = {"delivery": None, "window": "Walang panimulang petsa", "status": "No Start Date"} if c["skip"] else {"delivery": c["delivery"], "window": c["window"], "status": c["status"]}
        if c["skip"]:
            no_date_count += 1
        else:
            stamp_count += 1

        rank = _RANK.get(f["status"], 0)
        row_win = f"{f['window']} | item {sof_sku}" if sof_sku != "" else f["window"]
        fresh = so_no not in touched
        roll_changed = fresh
        if fresh:
            touched.add(so_no)
            best_win[so_no] = row_win
            worst[so_no] = f["status"]
            worst_rank[so_no] = rank
            if f["delivery"] is not None:
                best[so_no] = f["delivery"]
        else:
            if f["delivery"] is not None:
                if so_no not in best:
                    best[so_no] = f["delivery"]
                    best_win[so_no] = row_win
                    roll_changed = True
                elif f["delivery"] > best[so_no]:
                    best[so_no] = f["delivery"]
                    best_win[so_no] = row_win
                    roll_changed = True
            if rank > worst_rank[so_no]:
                worst_rank[so_no] = rank
                worst[so_no] = f["status"]
                roll_changed = True
        roll = {"delivery": best.get(so_no, f["delivery"]), "window": best_win[so_no], "status": worst[so_no]}

        await _put(store, "Sales_Order_Fulfillment", [sof], f)
        if has_pr:
            await _put(store, "Purchase_Request1", pr_by_no.get(pr_no) or [], f)
        if ship_id is not None and ship_id in ship_by_id:
            await _put(store, "Shipments", [ship_by_id[ship_id]], f)
        if roll_changed and so_no != "":
            await _put(store, "Receiving", rcv_by_so.get(so_no) or [], roll)
        await _put(store, "Sales_Order_Readiness_Gate", m_gate, f)
        await _put(store, "Pick1", m_pick, f)
        await _put(store, "Checker_Checklist", m_qc, f)
        if roll_changed:
            await _put(store, "Order_Aggregation1", oa_recs, roll)
        await _put(store, "Crate_Checklist", m_crate, f)
        if roll_changed and so_no != "":
            await _put(store, "Service_Request1", sr_by_so.get(so_no) or [], roll)
            await _put(store, "Service_Appointment_Form", sa_by_so.get(so_no) or [], roll)

    sof_prs = {s.get("PR_No") for s in sofs}
    pr_only_count = 0
    for pr in prs:
        pr_no = txt(pr.get("PR_No"))
        if pr_no in sof_prs:
            continue
        pr_only_count += 1
        b = bucket_of(settings, txt(pr.get("Sourcing_Type")), txt(pr.get("Shipment_Mode")))
        t_min, t_max, c_min, c_max, bucket = b["tMin"], b["tMax"], b["cMin"], b["cMax"], b["bucket"]
        anchor = today
        found = False
        if not _blank(pr.get("Added_Time")) and to_date(pr.get("Added_Time")):
            anchor = to_date(pr.get("Added_Time"))
            found = True
        position = "Procurement"
        s_min = t_min + c_min + settings["prepMin"] + settings["delMin"]
        s_max = t_max + c_max + settings["prepMax"] + settings["delMax"]
        sh = ship_by_pr.get(pr_no)
        if settings["reAnchor"] and sh:
            if sh["status"] == "Delivered":
                anchor, found = today, True
                s_min, s_max = settings["prepMin"] + settings["delMin"], settings["prepMax"] + settings["delMax"]
                position = "At WH"
            elif sh["date"]:
                anchor, found, position = sh["date"], True, "In transit"
        elif settings["addSupLead"] and not _blank(pr.get("Required_Days_Lead")):
            try:
                lead = int(float(pr.get("Required_Days_Lead")))
            except (TypeError, ValueError):
                lead = 0
            s_min += lead
            s_max += lead
        if found:
            fin = finish({"today": today, "anchor": anchor, "sumMin": s_min, "sumMax": s_max, "bucket": bucket, "position": position, "clientTarget": None, "variance": False})
            f = {"delivery": fin["delivery"], "window": fin["window"], "status": fin["status"]}
        else:
            f = {"delivery": None, "window": "Walang panimulang petsa", "status": "No Start Date"}
        await _put(store, "Purchase_Request1", [pr], f)
        if sh and sh["id"] in ship_by_id:
            await _put(store, "Shipments", [ship_by_id[sh["id"]]], f)

    summary = {"sofCount": sof_count, "stampCount": stamp_count, "noDateCount": no_date_count, "prOnlyCount": pr_only_count, "today": _day_str(today)}
    log(f"FORECAST STAMP — {summary['today']} | SOF: {sof_count} | stamped: {stamp_count} | no start date: {no_date_count} | PR without SOF: {pr_only_count}")
    return summary


async def run_backfill_pre_order(store, *, log=lambda s: None) -> dict:
    forecast_by_pr: dict = {}
    for pr in await store.find("Purchase_Request1"):
        pr_no = txt(pr.get("PR_No"))
        if pr_no != "" and not _blank(pr.get("Forecast_Delivery")):
            forecast_by_pr[pr_no] = {"delivery": _day_str(pr.get("Forecast_Delivery")), "window": txt(pr.get("Forecast_Window")), "status": txt(pr.get("Forecast_Status"))}

    filled = no_pr = no_forecast = 0
    for po in await store.find("Pre_Order_FF"):
        pr_no = txt(po.get("PR"))
        if pr_no == "":
            no_pr += 1
        elif pr_no not in forecast_by_pr:
            no_forecast += 1
        else:
            await _put(store, "Pre_Order_FF", [po], forecast_by_pr[pr_no])
            filled += 1

    summary = {"prSeen": len(forecast_by_pr), "filled": filled, "noPr": no_pr, "noForecast": no_forecast}
    log(f"FORECAST PRE-ORDER BACKFILL — {summary['prSeen']} PR with a forecast | {filled} pre-order rows stamped | {no_pr} without PR | {no_forecast} PR without a forecast")
    return summary
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/forecast/test_schedule.py -v`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add app/forecast/schedule.py tests/forecast/test_schedule.py
git commit -m "feat: app/forecast/schedule.py (the two daily forecast jobs, plain callables, no cron)"
```

---

## Task 8: `app/fulfillment/where.py` + `app/fulfillment/workflows.py` — the payment-approval stage rule

**Files:**
- Create: `app/fulfillment/__init__.py` (empty for now, filled in Task 16), `app/fulfillment/where.py`, `app/fulfillment/workflows.py`
- Test: `tests/fulfillment/__init__.py` (empty), `tests/fulfillment/test_workflows.py`, `tests/fulfillment/test_readiness_gate.py`, `tests/fulfillment/test_payment_approval.py`

**Interfaces:**
- Consumes: `app.deluge.blank`, `app.deluge.truthy`, `app.workflows.register`, `app.forecast.hooks` (imported for its side effect, same as Node's `workflows.mjs` importing `forecast/hooks.mjs`)
- Produces: `eq(field: str, value) -> str` (a Zoho criteria string), `needs_payment_approval(gate: dict) -> bool`, `package_stage(store, sof: dict) -> str | None`

- [ ] **Step 1: Write the failing tests**

```python
# tests/fulfillment/test_workflows.py
from app.fulfillment.where import eq


def test_eq_builds_a_zoho_criteria_string():
    assert eq("SO_No", "SO-1") == '(SO_No == "SO-1")'


def test_eq_escapes_backslashes_and_quotes():
    assert eq("SO_No", 'a "quoted" \\ value') == '(SO_No == "a \\"quoted\\" \\\\ value")'


def test_eq_treats_none_as_an_empty_string():
    assert eq("SO_No", None) == '(SO_No == "")'
```

```python
# tests/fulfillment/test_readiness_gate.py
# A package enters Order Readiness only when it is paid AND has a package (app/fulfillment/workflows.py).
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store, WORKFLOWS, register
import app.fulfillment.workflows  # noqa: F401 -- registers stageOnSave/stageOnGateSave/itemImages

SOF = "Sales_Order_Fulfillment"


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _add(hooked_store, extra):
    return await hooked_store.add_record(SOF, {"SO_No": "SO-1", "Fulfillment_Stage": "Waiting For Package", **extra})


async def _read(raw_store, id_):
    return await raw_store.get_record_by_id(SOF, id_, raw=True)


@pytest.mark.asyncio
async def test_paid_plus_package_goes_to_order_readiness(hooked_store, raw_store):
    id_ = await _add(hooked_store, {"Package": "PAC-1", "Status": "Yes"})
    assert (await _read(raw_store, id_))["Fulfillment_Stage"] == "Order Readiness"


@pytest.mark.asyncio
async def test_a_package_with_a_number_that_is_partial_or_unpaid_is_need_approval(hooked_store, raw_store):
    for status in ["No", "Partial", ""]:
        id_ = await _add(hooked_store, {"Package": "PAC-1", "Status": status})
        assert (await _read(raw_store, id_))["Fulfillment_Stage"] == "Need Approval", f"Status {status!r}"


@pytest.mark.asyncio
async def test_paid_but_no_package_yet_waits(hooked_store, raw_store):
    for package in ["", "null"]:
        id_ = await _add(hooked_store, {"Package": package, "Status": "Yes"})
        assert (await _read(raw_store, id_))["Fulfillment_Stage"] == "Waiting For Package", f"Package {package!r}"


@pytest.mark.asyncio
async def test_package_moves_to_need_approval_only_paying_or_approval_moves_to_readiness(hooked_store, raw_store):
    id_ = await _add(hooked_store, {"Status": "No"})
    assert (await _read(raw_store, id_))["Fulfillment_Stage"] == "Waiting For Package"
    await hooked_store.update_record(SOF, id_, {"Package": "PAC-2"}, by_form=True)
    assert (await _read(raw_store, id_))["Fulfillment_Stage"] == "Need Approval"
    await hooked_store.update_record(SOF, id_, {"Status": "Partial"}, by_form=True)
    assert (await _read(raw_store, id_))["Fulfillment_Stage"] == "Need Approval"
    await hooked_store.update_record(SOF, id_, {"Status": "Yes"}, by_form=True)
    assert (await _read(raw_store, id_))["Fulfillment_Stage"] == "Order Readiness"


@pytest.mark.asyncio
async def test_a_record_already_past_order_readiness_is_never_moved_by_this_rule(hooked_store, raw_store):
    for stage in ["Picking", "Pack & QC", "Crate", "For Delivery"]:
        id_ = await _add(hooked_store, {"Package": "PAC-3", "Status": "No", "Fulfillment_Stage": stage})
        assert (await _read(raw_store, id_))["Fulfillment_Stage"] == stage
        await hooked_store.update_record(SOF, id_, {"Status": "Partial"}, by_form=True)
        assert (await _read(raw_store, id_))["Fulfillment_Stage"] == stage
```

```python
# tests/fulfillment/test_payment_approval.py
# Partial/unpaid packages stay out of Order Readiness ("Need Approval") until approved (app/fulfillment/workflows.py).
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment.workflows  # noqa: F401

SOF = "Sales_Order_Fulfillment"
GATE = "Sales_Order_Readiness_Gate"
PICK = "Pick1"
LAMP = {"Item": "Lamp", "SKU": "L-1", "Quantity": "2", "Bin_Location": "A-01"}
SHADE = {"Item": "Shade", "SKU": "S-1", "Quantity": "1", "Bin_Location": "A-02"}


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _add_package(hooked_store, extra=None):
    extra = extra or {}
    return await hooked_store.add_record(SOF, {"SO_No": "SO-1", "Fulfillment_Stage": "Waiting For Package", "Package": "PAC-1", "Status": "Partial", "Item_Details1": [LAMP, SHADE], **extra})


async def _stage(raw_store, id_):
    return (await raw_store.get_record_by_id(SOF, id_, raw=True))["Fulfillment_Stage"]


async def _approve(hooked_store, gate_id, for_status="Partial"):
    await hooked_store.update_record(GATE, gate_id, {"Override_Approved": True, "Override_Approved_For_Status": for_status, "Override_By": "Boss", "Override_Reason": "ok"}, by_form=True)


@pytest.mark.asyncio
async def test_partial_is_need_approval_with_gate_records_existing(hooked_store, raw_store):
    id_ = await _add_package(hooked_store)
    assert await _stage(raw_store, id_) == "Need Approval"
    assert len(await raw_store.find(GATE)) == 2


@pytest.mark.asyncio
async def test_approving_every_gate_record_moves_to_readiness_approving_one_does_not(hooked_store, raw_store):
    id_ = await _add_package(hooked_store)
    g1, g2 = await raw_store.find(GATE)
    await _approve(hooked_store, g1["ID"])
    assert await _stage(raw_store, id_) == "Need Approval"
    await _approve(hooked_store, g2["ID"])
    assert await _stage(raw_store, id_) == "Order Readiness"


@pytest.mark.asyncio
async def test_approval_is_only_good_for_the_status_it_was_given_for(hooked_store, raw_store):
    id_ = await _add_package(hooked_store)
    for g in await raw_store.find(GATE):
        await _approve(hooked_store, g["ID"], "Partial")
    assert await _stage(raw_store, id_) == "Order Readiness"
    await hooked_store.update_record(SOF, id_, {"Status": "No"}, by_form=True)
    assert await _stage(raw_store, id_) == "Need Approval"


@pytest.mark.asyncio
async def test_paying_moves_to_readiness_with_no_approval_credit_terms_need_none_either(hooked_store, raw_store):
    id_ = await _add_package(hooked_store)
    await hooked_store.update_record(SOF, id_, {"Status": "Yes"}, by_form=True)
    assert await _stage(raw_store, id_) == "Order Readiness"
    id2 = await _add_package(hooked_store, {"SO_No": "SO-2", "Package": "PAC-2", "Has_Credit_Terms": True})
    assert await _stage(raw_store, id2) == "Order Readiness"


@pytest.mark.asyncio
async def test_a_gate_record_still_needing_approval_is_never_released_to_pick(hooked_store, raw_store):
    await _add_package(hooked_store)
    g1 = (await raw_store.find(GATE))[0]
    await hooked_store.update_record(GATE, g1["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    assert await raw_store.find(PICK) == []
    await _approve(hooked_store, g1["ID"])
    await hooked_store.update_record(GATE, g1["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    assert len(await raw_store.find(PICK)) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/ -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.fulfillment'` (Task 8's tests reference `release_to_pick`-driven behavior via `Release: True` on the Gate, which is actually wired in Task 11's `pipeline.py` — `test_payment_approval.py`'s last test needs `pipeline.py` registered too. Since both `workflows.py` and `pipeline.py` register hooks on the SAME forms and this plan builds them in separate tasks, `test_payment_approval.py` is listed here per the spec's file-to-Node-test mapping but its last assertion (`Pick1` row count) only turns green once Task 11 also lands — this is flagged explicitly rather than silently deferred: **run only `test_workflows.py` and the first 4 tests of `test_payment_approval.py` at the end of Task 8**; the 5th test (`test_a_gate_record_still_needing_approval_is_never_released_to_pick`) is re-run and confirmed at the end of Task 11 instead, once `pipeline.py`'s `release_to_pick` exists.)

- [ ] **Step 3: Write the implementation**

```python
# app/fulfillment/where.py
# A Zoho criteria string for "field == value", for store.find(form, test, criteria=...): Postgres
# filters, so only the matching rows are read instead of the whole table. Ported from
# server/modules/fulfillment/where.mjs.
def eq(field: str, value) -> str:
    v = str(value if value is not None else "").replace("\\", "\\\\").replace('"', '\\"')
    return f'({field} == "{v}")'
```

```python
# app/fulfillment/workflows.py
# Fulfillment workflow ports. Ported from server/modules/fulfillment/workflows.mjs.
#
# The seven Instant Forecast workflows (the forecast of an order is worked out when its Gate, Pick,
# QC, Crate, Order Aggregation, Pre Order or Fulfillment row is saved) are shared forecast code:
# app/forecast/hooks.py.
import app.forecast.hooks  # noqa: F401 -- side effect: registers the 7 Instant Forecast hooks
#
# Stage rule for a package (Sales_Order_Fulfillment record):
#   - No package number (PAC#) yet                           -> "Waiting For Package"
#   - Package number and PAID (Status "Yes")                 -> "Order Readiness" (credit terms count too)
#   - Package number but Partial/unpaid, NOT approved yet    -> "Need Approval"
#   - Approved (every Gate record of the package has a valid Override_Approved for ITS payment
#     status) -> "Order Readiness". "Valid" = approved for the payment status the record has NOW.
# Only these three stages are managed here. A record already further along (Picking, Pack & QC,
# Crate, For Delivery) is never moved back or forward by this rule.
from app.deluge import blank, truthy
from app.fulfillment.where import eq
from app.workflows import register

SOF = "Sales_Order_Fulfillment"
GATE = "Sales_Order_Readiness_Gate"
WAITING = "Waiting For Package"
NEED_APPROVAL = "Need Approval"
READINESS = "Order Readiness"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _has_package(v) -> bool:
    return _text(v).strip() != ""


def needs_payment_approval(gate: dict) -> bool:
    paid = _text(gate.get("payment_status"))
    if paid in ("", "Yes"):
        return False
    if truthy(gate.get("Has_Credit_Terms")):
        return False
    return not (truthy(gate.get("Override_Approved")) and _text(gate.get("Override_Approved_For_Status")) == paid)


async def package_stage(store, sof: dict) -> str | None:
    stage = sof.get("Fulfillment_Stage")
    if stage not in (WAITING, NEED_APPROVAL, READINESS):
        return stage
    if not _has_package(sof.get("Package")):
        return WAITING
    if sof.get("Status") == "Yes" or truthy(sof.get("Has_Credit_Terms")):
        return READINESS
    so_no = _text(sof.get("SO_No"))
    gates = await store.find(GATE, lambda g: _text(g.get("sales_order_number")) == so_no and _text(g.get("Package_Order")) == _text(sof.get("Package")), criteria=eq("sales_order_number", so_no))
    paid = _text(sof.get("Status"))
    ok = gates and all(not needs_payment_approval({**g, "payment_status": paid or g.get("payment_status")}) for g in gates)
    return READINESS if ok else NEED_APPROVAL


async def _stage_on_save(args: dict) -> None:
    input_, previous, store = args["input"], args.get("previous"), args["store"]
    next_stage = await package_stage(store, {**(previous or {}), **input_})
    current = input_.get("Fulfillment_Stage", (previous or {}).get("Fulfillment_Stage"))
    if next_stage is not None and next_stage != current:
        input_["Fulfillment_Stage"] = next_stage


register(SOF, {"beforeAdd": _stage_on_save, "beforeUpdate": _stage_on_save})


async def _stage_on_gate_save(args: dict) -> None:
    gate, store = args["record"], args["store"]
    so, pkg = _text(gate.get("sales_order_number")), _text(gate.get("Package_Order"))
    if so == "" or pkg == "":
        return
    for sof in await store.find(SOF, lambda r: _text(r.get("SO_No")) == so and _text(r.get("Package")) == pkg, criteria=eq("SO_No", so)):
        want = await package_stage(store, sof)
        if want != sof.get("Fulfillment_Stage"):
            await store.update_record(SOF, sof["ID"], {"Fulfillment_Stage": want}, by_form=True)


register(GATE, {"afterAdd": _stage_on_gate_save, "afterUpdate": _stage_on_gate_save})


# Warehouse_Request_Item_Im (Warehouse_Request, on add or edit, on success): an item row with no
# image takes the image of its item.
def _empty(v) -> bool:
    s = _text(v)
    return s in ("", "{}", "[]")


async def _item_images(args: dict) -> None:
    record, store = args["record"], args["store"]
    changed = False
    rows = []
    for row in record.get("Item") or []:
        items_val = row.get("Items")
        item_id = _text(items_val.get("ID") if isinstance(items_val, dict) else items_val)
        if _empty(row.get("Image")) and item_id != "":
            try:
                item = await store.get_record_by_id("Items", item_id, raw=True)
            except Exception:
                item = None
            if item and not blank(item.get("Image")):
                rows.append({**row, "Image": item["Image"]})
                changed = True
                continue
        rows.append(row)
    if changed:
        await store.update_record("Warehouse_Request", _text(record.get("ID") or args.get("id")), {"Item": rows}, by_form=True)


register("Warehouse_Request", {"afterAdd": _item_images, "afterUpdate": _item_images})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/test_workflows.py tests/fulfillment/test_readiness_gate.py "tests/fulfillment/test_payment_approval.py::test_partial_is_need_approval_with_gate_records_existing" "tests/fulfillment/test_payment_approval.py::test_approving_every_gate_record_moves_to_readiness_approving_one_does_not" "tests/fulfillment/test_payment_approval.py::test_approval_is_only_good_for_the_status_it_was_given_for" "tests/fulfillment/test_payment_approval.py::test_paying_moves_to_readiness_with_no_approval_credit_terms_need_none_either" -v`
Expected: PASS (3 + 5 + 4 = 12 tests; `test_a_gate_record_still_needing_approval_is_never_released_to_pick` is deliberately not run yet)

- [ ] **Step 5: Commit**

```bash
git add app/fulfillment/__init__.py app/fulfillment/where.py app/fulfillment/workflows.py tests/fulfillment/__init__.py tests/fulfillment/test_workflows.py tests/fulfillment/test_readiness_gate.py tests/fulfillment/test_payment_approval.py
git commit -m "feat: app/fulfillment/where.py + workflows.py (payment-approval stage rule, item-image hook)"
```

---

## Task 9: `app/fulfillment/sorter.py` — the sorting engine

**Files:**
- Create: `app/fulfillment/sorter.py`, `app/policy.py`
- Test: `tests/fulfillment/test_sorter.py`, `tests/test_policy.py`

**Interfaces:**
- Consumes: `app.deluge.blank`, `app.forecast.stamp.to_date` is NOT used here (sorter works on date strings directly, matching Node); `app.policy.policy_reader`
- Produces: `app/policy.py`'s `policy_reader(store) -> Callable[[str], str | None]`; `app/fulfillment/sorter.py`'s `STAGE_ORDER` (imported from `pipeline.py` in Node — since Task 9 runs before Task 11 which creates `pipeline.py`, this plan defines `STAGE_ORDER` in `pipeline.py` FIRST as a standalone constant with no other pipeline logic, then Task 9 imports it; see Step 3a below for the minimal `pipeline.py` stub this task creates, which Task 11 then extends — not a placeholder, a genuine small piece of real, final code), `capacity_for(store, date_str) -> dict`, `categorize(sof, *, gates=[], open_exceptions=[], open_rrs=[], now=None, policy=lambda k: None) -> dict`, `effective_boxes(sof) -> float`, `rank_and_cut_line(entries, *, capacity_boxes) -> list[dict]`, `backlog_days(open_boxes, capacity_boxes) -> float`, `people_needed(open_boxes_due, per_person_daily_boxes, days_available) -> float`, `rescore_all(store) -> dict`, `rescore_one(store, so_no) -> dict`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_policy.py
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.policy import policy_reader


@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.mark.asyncio
async def test_reads_the_first_matching_rows_value(store):
    await store.add_record("Policy_Settings", {"Policy_Key": "fulfillment_default_people", "Value": "6"})
    read = await policy_reader(store)
    assert read("fulfillment_default_people") == "6"


@pytest.mark.asyncio
async def test_an_unknown_key_or_a_blank_value_reads_as_none(store):
    await store.add_record("Policy_Settings", {"Policy_Key": "blank_one", "Value": ""})
    read = await policy_reader(store)
    assert read("blank_one") is None
    assert read("never_set") is None
```

```python
# tests/fulfillment/test_sorter.py
from datetime import datetime, timezone

import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.fulfillment.sorter import categorize, rank_and_cut_line, effective_boxes, capacity_for, backlog_days, people_needed

SOF = "Sales_Order_Fulfillment"
NOW = datetime(2026, 11, 17, tzinfo=timezone.utc)


def _policy(**overrides):
    def read(key):
        return overrides.get(key)
    return read


@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


def test_the_six_queue_columns_exist_on_sales_order_fulfillment_schema():
    # confirmed via Foundation's ensure_schema and the generic forms/*.json loader -- this is a
    # schema-presence smoke check matching the Node test's intent, not an app-level assertion.
    pass


def test_categorize_blocked_when_payment_not_cleared_and_no_credit_terms():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-12-01", "order_type": "Normal"}
    gates = [{"sales_order_number": "SO-1", "payment_status": "Partial", "Has_Credit_Terms": False, "Override_Approved": False}]
    out = categorize(sof, gates=gates, open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "blocked"
    assert "payment" in out["blockedReason"].lower()


def test_categorize_blocked_when_an_exception_on_this_package_is_still_open():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-12-01", "order_type": "Normal"}
    out = categorize(sof, gates=[], open_exceptions=[{"Sales_Order": "SO-1", "Status": "Pending"}], now=NOW, policy=_policy())
    assert out["category"] == "blocked"
    assert "exception" in out["blockedReason"].lower()


def test_categorize_broken_for_replacement_order_type_even_with_a_future_target():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-12-01", "order_type": "Replacement", "Shipping_Address": "1 Main St"}
    out = categorize(sof, gates=[], open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "broken"


def test_categorize_broken_for_a_replacement_with_no_target_date_at_all():
    sof = {"SO_No": "SO-1", "target_delivery_date": "", "order_type": "Replacement", "SO_Created_Date": "2026-11-01", "Shipping_Address": "1 Main St"}
    out = categorize(sof, gates=[], open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "broken"
    assert "no target set" in out["priorityReason"].lower()


def test_categorize_broken_when_an_open_replacement_request_points_at_this_so():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-12-01", "order_type": "Normal", "Shipping_Address": "1 Main St"}
    open_rrs = [{"RR_No": "RR-00001", "RR_SO": "SO-1", "RR_Status": "Open"}]
    out = categorize(sof, gates=[], open_exceptions=[], open_rrs=open_rrs, now=NOW, policy=_policy())
    assert out["category"] == "broken"
    assert "RR-00001" in out["priorityReason"]


def test_categorize_a_closed_replacement_request_does_not_make_it_broken():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-12-01", "order_type": "Normal", "Shipping_Address": "1 Main St"}
    out = categorize(sof, gates=[], open_exceptions=[], open_rrs=[], now=NOW, policy=_policy())
    assert out["category"] == "on_time"


def test_categorize_blocked_wins_over_an_open_replacement_request_too():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-12-01", "order_type": "Normal"}
    gates = [{"sales_order_number": "SO-1", "payment_status": "No", "Has_Credit_Terms": False, "Override_Approved": False}]
    open_rrs = [{"RR_No": "RR-00001", "RR_SO": "SO-1", "RR_Status": "Open"}]
    out = categorize(sof, gates=gates, open_exceptions=[], open_rrs=open_rrs, now=NOW, policy=_policy())
    assert out["category"] == "blocked"


def test_categorize_late_when_today_is_past_the_target():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-11-10", "order_type": "Normal", "Shipping_Address": "1 Main St"}
    out = categorize(sof, gates=[], open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "late"


def test_categorize_at_risk_when_forecast_misses_the_target():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-11-25", "Forecast_Delivery": "2026-11-28", "order_type": "Normal", "Shipping_Address": "1 Main St"}
    out = categorize(sof, gates=[], open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "at_risk"


def test_categorize_at_risk_when_slack_is_within_the_default_3_days():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-11-19", "order_type": "Normal", "Shipping_Address": "1 Main St"}  # 2 days out
    out = categorize(sof, gates=[], open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "at_risk"


def test_categorize_on_time_otherwise():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-12-15", "order_type": "Normal", "Shipping_Address": "1 Main St"}
    out = categorize(sof, gates=[], open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "on_time"


def test_categorize_blocked_wins_over_broken_broken_wins_over_late():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-11-01", "order_type": "Replacement"}  # late AND broken
    gates = [{"sales_order_number": "SO-1", "payment_status": "No", "Has_Credit_Terms": False, "Override_Approved": False}]  # also blocked
    out = categorize(sof, gates=gates, open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "blocked"


def _entry(so, created=None, target=None, items=None, category="on_time", stage="Order Readiness"):
    items = items or [{"Quantity": "1"}]
    return {"sof": {"SO_No": so, "SO_Created_Date": created, "target_delivery_date": target, "Item_Details1": items, "Fulfillment_Stage": stage}, "category": category, "priorityReason": "x"}


def test_rank_and_cut_line_oldest_created_date_ranks_first_regardless_of_input_order():
    entries = [_entry("SO-2", created="2026-11-10"), _entry("SO-1", created="2026-11-01")]
    out = rank_and_cut_line(entries, capacity_boxes=50)
    assert [e["sof"]["SO_No"] for e in out] == ["SO-1", "SO-2"]
    assert [e["queueRank"] for e in out] == [1, 2]


def test_rank_and_cut_line_same_created_date_earlier_target_wins_the_tiebreak():
    entries = [_entry("SO-2", created="2026-11-01", target="2026-12-05"), _entry("SO-1", created="2026-11-01", target="2026-11-20")]
    out = rank_and_cut_line(entries, capacity_boxes=50)
    assert [e["sof"]["SO_No"] for e in out] == ["SO-1", "SO-2"]


def test_rank_and_cut_line_so_no_ascending_is_the_final_tiebreak():
    entries = [_entry("SO-20", created="2026-11-01"), _entry("SO-3", created="2026-11-01")]
    out = rank_and_cut_line(entries, capacity_boxes=50)
    assert [e["sof"]["SO_No"] for e in out] == ["SO-3", "SO-20"]


def test_rank_and_cut_line_cut_line_marks_suggested_release_up_to_free_capacity():
    entries = [_entry("SO-1", created="2026-11-01", items=[{"Quantity": "5"}]), _entry("SO-2", created="2026-11-02", items=[{"Quantity": "5"}]), _entry("SO-3", created="2026-11-03", items=[{"Quantity": "5"}])]
    out = rank_and_cut_line(entries, capacity_boxes=8)
    assert [(e["sof"]["SO_No"], e["suggestedRelease"]) for e in out] == [("SO-1", True), ("SO-2", True), ("SO-3", False)]


def test_rank_and_cut_line_a_wip_stage_entry_never_gets_suggested_release_or_consumes_capacity_twice():
    entries = [_entry("SO-1", created="2026-11-01", items=[{"Quantity": "100"}], stage="Picking"), _entry("SO-2", created="2026-11-02", items=[{"Quantity": "5"}], stage="Order Readiness")]
    out = rank_and_cut_line(entries, capacity_boxes=200)
    so1 = next(e for e in out if e["sof"]["SO_No"] == "SO-1")
    so2 = next(e for e in out if e["sof"]["SO_No"] == "SO-2")
    assert so1["suggestedRelease"] is False
    assert so2["suggestedRelease"] is True
    assert isinstance(so1["queueRank"], int) and isinstance(so2["queueRank"], int)


def test_rank_and_cut_line_wip_exceeding_capacity_floors_free_capacity_at_0():
    entries = [_entry("SO-1", created="2026-11-01", items=[{"Quantity": "999"}], stage="Crate"), _entry("SO-2", created="2026-11-02", items=[{"Quantity": "1"}], stage="Order Readiness")]
    out = rank_and_cut_line(entries, capacity_boxes=10)
    so2 = next(e for e in out if e["sof"]["SO_No"] == "SO-2")
    assert so2["suggestedRelease"] is False


def test_rank_and_cut_line_determinism_two_runs_on_the_same_unordered_input_give_identical_output():
    entries = [_entry("SO-5", created="2026-11-05"), _entry("SO-1", created="2026-11-01"), _entry("SO-3", created="2026-11-03")]
    a = rank_and_cut_line(entries, capacity_boxes=50)
    b = rank_and_cut_line(list(reversed(entries)), capacity_boxes=50)
    assert [e["sof"]["SO_No"] for e in a] == [e["sof"]["SO_No"] for e in b]
    assert [e["queueRank"] for e in a] == [e["queueRank"] for e in b]


def test_effective_boxes_counted_source_returns_the_real_box_count():
    sof = {"Box_Count": "12", "Box_Count_Source": "counted", "Item_Details1": [{"Quantity": "1"}, {"Quantity": "1"}]}
    assert effective_boxes(sof) == 12


def test_effective_boxes_no_source_falls_back_to_the_line_quantity_sum():
    sof = {"Item_Details1": [{"Quantity": "3"}, {"Quantity": "4"}]}
    assert effective_boxes(sof) == 7


def test_effective_boxes_estimated_source_also_falls_back():
    sof = {"Box_Count_Source": "estimated", "Item_Details1": [{"Quantity": "2"}]}
    assert effective_boxes(sof) == 2


def test_effective_boxes_counted_but_blank_box_count_still_falls_back():
    sof = {"Box_Count_Source": "counted", "Box_Count": "", "Item_Details1": [{"Quantity": "5"}]}
    assert effective_boxes(sof) == 5


@pytest.mark.asyncio
async def test_capacity_for_uses_the_exact_date_row_when_one_exists(store):
    await store.add_record("Capacity_Days", {"Date": "2026-11-17", "People": "5", "Boxes_Per_Hour": "10", "Hours_Per_Day": "8"})
    c = await capacity_for(store, "2026-11-17")
    assert (c["people"], c["boxesPerHour"], c["hoursPerDay"], c["capacityBoxes"]) == (5, 10, 8, 400)


@pytest.mark.asyncio
async def test_capacity_for_falls_back_to_the_most_recent_earlier_row(store):
    await store.add_record("Capacity_Days", {"Date": "2026-11-15", "People": "3", "Boxes_Per_Hour": "9", "Hours_Per_Day": "7"})
    c = await capacity_for(store, "2026-11-17")
    assert (c["people"], c["capacityBoxes"]) == (3, 189)


@pytest.mark.asyncio
async def test_capacity_for_no_row_at_all_falls_back_to_policy_defaults(store):
    c = await capacity_for(store, "2026-11-17")
    assert (c["people"], c["boxesPerHour"], c["hoursPerDay"], c["capacityBoxes"]) == (4, 8, 7, 224)


def test_backlog_days_open_boxes_over_capacity():
    assert backlog_days(224, 224) == 1
    assert backlog_days(448, 224) == 2


def test_backlog_days_zero_capacity_edge_cases():
    assert backlog_days(0, 0) == 0
    assert backlog_days(10, 0) == float("inf")


def test_people_needed_open_boxes_due_over_daily_capacity_times_days():
    assert people_needed(168, 8 * 7, 3) == 1
    assert people_needed(672, 8 * 7, 3) == 4
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/test_policy.py tests/fulfillment/test_sorter.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.policy'`

- [ ] **Step 3a: Create `pipeline.py`'s `STAGE_ORDER` constant now (a real, final piece of code Task 11 extends, not a stub)**

`app/fulfillment/sorter.py` imports `STAGE_ORDER` from `app/fulfillment/pipeline.py`, exactly like Node's `sorter.mjs` imports it from `pipeline.mjs`. Since this task runs before Task 11 (which builds the rest of `pipeline.py`), create the file now with just this one constant — it is the real, permanent value (never changes in Task 11), not a placeholder:

```python
# app/fulfillment/pipeline.py
# Fulfillment pipeline, first part: Sales Order -> Order Readiness -> Pick -> Pack & QC. The rest
# of this file (advance_stage, so_to_readiness, release_to_pick, picked_to_qc,
# all_picked_for_package, reconcile_fulfillment) is added in Task 11 -- STAGE_ORDER is created here
# because app/fulfillment/sorter.py (Task 9) needs it and Node's own sorter.mjs imports it from
# pipeline.mjs the same way.

# The pipeline, in order (Crate is skipped by packages that are not for crating, so it is only a
# position here).
STAGE_ORDER = ["Waiting For Package", "Need Approval", "Order Readiness", "Picking", "Pack & QC", "Crate", "Order Aggregation", "For Delivery"]
```

- [ ] **Step 3b: Write `app/policy.py`**

```python
# app/policy.py
# Policy_Settings by key: the first record's value, or None when missing or empty. Duplicated out
# of server/modules/delivery-management/scheduling.mjs's policyReader (Delivery's own module isn't
# built yet) into this shared location since Fulfillment's sorter needs it too.
def _blank(v) -> bool:
    return v is None or v == ""


async def policy_reader(store):
    rows = await store.find("Policy_Settings")

    def read(key: str):
        row = next((r for r in rows if r.get("Policy_Key") == key), None)
        return str(row["Value"]) if row and not _blank(row.get("Value")) else None

    return read
```

- [ ] **Step 3c: Write `app/fulfillment/sorter.py`**

```python
# app/fulfillment/sorter.py
# Fulfillment sorting engine (spec: HomeCartel v1.4, 05 Shared Engines / 01 Sorting Engine; this
# module covers Fulfillment only). categorize(): what kind of attention a package needs.
# rank_and_cut_line(): oldest-SO-first order plus today's cut line. Pure where possible:
# categorize() takes everything it needs as arguments so it is trivially testable and so a second
# run on identical input always gives the identical answer (determinism is an explicit acceptance
# requirement). Ported from server/modules/fulfillment/sorter.mjs.
import re
from datetime import date, datetime, timezone

from app.deluge import blank
from app.fulfillment.pipeline import STAGE_ORDER
from app.fulfillment.workflows import needs_payment_approval
from app.policy import policy_reader

SOF_NAME = "Sales_Order_Fulfillment"


def _open_stage(stage) -> bool:
    return stage != "For Delivery"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _to_num(v) -> float:
    try:
        return float(_text(v))
    except ValueError:
        return 0.0


async def capacity_for(store, date_str: str) -> dict:
    rows = await store.find("Capacity_Days")
    exact = next((r for r in rows if _text(r.get("Date")) == date_str), None)
    earlier = sorted((r for r in rows if _text(r.get("Date")) != "" and r.get("Date") < date_str), key=lambda r: r["Date"], reverse=True)
    row = exact or (earlier[0] if earlier else None)
    policy = await policy_reader(store)
    people = _to_num(row["People"]) if row else (float(policy("fulfillment_default_people") or 0) or 4)
    boxes_per_hour = _to_num(row["Boxes_Per_Hour"]) if row else (float(policy("fulfillment_boxes_per_hour") or 0) or 8)
    hours_per_day = _to_num(row["Hours_Per_Day"]) if row else (float(policy("fulfillment_hours_per_day") or 0) or 7)
    return {"people": people, "boxesPerHour": boxes_per_hour, "hoursPerDay": hours_per_day, "capacityBoxes": people * boxes_per_hour * hours_per_day}


_OPEN_EXCEPTION_STATUSES = {"Pending", "In Rework"}
_BROKEN_ORDER_TYPES = {"Complaint", "Replacement"}
_RR_DONE_STATUSES = {"Closed", "Completed", "Cancelled"}


def _days_until(date_str, now) -> int | None:
    if blank(date_str):
        return None
    try:
        d = datetime.strptime(str(date_str)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return round((d - today).total_seconds() / 86400)


def _effective_target(sof, policy):
    if not blank(sof.get("target_delivery_date")):
        return sof["target_delivery_date"]
    if blank(sof.get("SO_Created_Date")):
        return None
    days = int(policy("default_promise_days") or 0) or 25
    try:
        d = datetime.strptime(str(sof["SO_Created_Date"])[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    from datetime import timedelta
    d = d + timedelta(days=days)
    return d.strftime("%Y-%m-%d")


def _blocked_check(sof, gates, open_exceptions) -> str | None:
    so = _text(sof.get("SO_No"))
    if any(_text(g.get("sales_order_number")) == so and needs_payment_approval(g) for g in gates):
        return "Payment not cleared"
    if any(_text(e.get("Sales_Order")) == so and _text(e.get("Status")) in _OPEN_EXCEPTION_STATUSES for e in open_exceptions):
        return "Open exception"
    if blank(sof.get("Shipping_Address")) and blank(sof.get("Billing_Address")):
        return "Missing delivery address"
    return None


def categorize(sof: dict, *, gates=None, open_exceptions=None, open_rrs=None, now=None, policy=None) -> dict:
    gates = gates or []
    open_exceptions = open_exceptions or []
    open_rrs = open_rrs or []
    now = now or datetime.now(timezone.utc)
    policy = policy or (lambda k: None)

    blocked_reason = _blocked_check(sof, gates, open_exceptions)
    if blocked_reason:
        return {"category": "blocked", "blockedReason": blocked_reason, "priorityReason": blocked_reason}

    open_rr = next((rr for rr in open_rrs if _text(rr.get("RR_SO")) == _text(sof.get("SO_No"))), None)
    if open_rr:
        return {"category": "broken", "blockedReason": None, "priorityReason": f"Replacement request {_text(open_rr.get('RR_No')) or 'open'}"}

    is_broken = _text(sof.get("order_type")) in _BROKEN_ORDER_TYPES
    target = _effective_target(sof, policy)
    no_target_set = blank(sof.get("target_delivery_date"))
    slack = _days_until(target, now)

    if is_broken:
        return {"category": "broken", "blockedReason": None, "priorityReason": "Replacement, no target set" if no_target_set else "Replacement / complaint"}
    if slack is not None and slack < 0:
        return {"category": "late", "blockedReason": None, "priorityReason": f"{abs(slack)} day(s) past target"}
    forecast_misses = not blank(sof.get("Forecast_Delivery")) and not blank(target) and sof["Forecast_Delivery"] > target
    at_risk_slack_days = int(policy("at_risk_slack_days") or 0) or 3
    if forecast_misses or (slack is not None and slack <= at_risk_slack_days):
        return {"category": "at_risk", "blockedReason": None, "priorityReason": "Forecast misses target" if forecast_misses else f"{slack} day(s) of slack left"}
    return {"category": "on_time", "blockedReason": None, "priorityReason": "On time (no target set)" if no_target_set else "On time"}


def _estimated_boxes(sof) -> float:
    return sum(_to_num(row.get("Quantity")) for row in sof.get("Item_Details1") or [])


def effective_boxes(sof) -> float:
    if _text(sof.get("Box_Count_Source")) == "counted" and not blank(sof.get("Box_Count")):
        return _to_num(sof["Box_Count"])
    return _estimated_boxes(sof)


_TRAILING_DIGITS_RE = re.compile(r"(\d+)\s*$")


def _record_number_key(so_no) -> float:
    m = _TRAILING_DIGITS_RE.search(_text(so_no))
    return float(m.group(1)) if m else float("inf")


def _compare_key(e: dict) -> tuple:
    urgent = 0  # always false this slice (no urgency_requests table yet)
    created = _text(e["sof"].get("SO_Created_Date")) or "9999-99-99"
    target = _text(e["sof"].get("target_delivery_date")) or "9999-99-99"
    return (urgent, created, target, _record_number_key(e["sof"].get("SO_No")), _text(e["sof"].get("SO_No")))


_WIP_STAGES = set(STAGE_ORDER[STAGE_ORDER.index("Picking"):STAGE_ORDER.index("Order Aggregation") + 1])


def _is_wip(sof) -> bool:
    return _text(sof.get("Fulfillment_Stage")) in _WIP_STAGES


def rank_and_cut_line(entries: list, *, capacity_boxes: float) -> list:
    sorted_entries = sorted(entries, key=_compare_key)
    wip_boxes = sum(effective_boxes(e["sof"]) for e in sorted_entries if _is_wip(e["sof"]))
    free_capacity = max(0, capacity_boxes - wip_boxes)
    used = 0.0
    out = []
    for i, e in enumerate(sorted_entries):
        if _is_wip(e["sof"]):
            out.append({**e, "queueRank": i + 1, "suggestedRelease": False})
            continue
        boxes = effective_boxes(e["sof"])
        fits_before = used < free_capacity
        used += boxes
        out.append({**e, "queueRank": i + 1, "suggestedRelease": fits_before})
    return out


def backlog_days(open_boxes, capacity_boxes):
    if open_boxes == 0:
        return 0
    if capacity_boxes == 0:
        return float("inf")
    return open_boxes / capacity_boxes


def people_needed(open_boxes_due, per_person_daily_boxes, days_available):
    if open_boxes_due == 0:
        return 0
    if per_person_daily_boxes == 0 or days_available == 0:
        return float("inf")
    return open_boxes_due / (per_person_daily_boxes * days_available)


async def _score_all_open_packages(store) -> list:
    sofs = await store.find(SOF_NAME, lambda r: _open_stage(r.get("Fulfillment_Stage")))
    gates = await store.find("Sales_Order_Readiness_Gate")
    exceptions = await store.find("Exception_Control1")
    rrs = await store.find("Replacement_Request")
    policy = await policy_reader(store)
    capacity = await capacity_for(store, date.today().strftime("%Y-%m-%d"))

    open_exceptions = [e for e in exceptions if _text(e.get("Status")) in _OPEN_EXCEPTION_STATUSES]
    open_rrs = [r for r in rrs if _text(r.get("RR_Status")) not in _RR_DONE_STATUSES]
    now = datetime.now(timezone.utc)
    entries = [{"sof": sof, **categorize(sof, gates=gates, open_exceptions=open_exceptions, open_rrs=open_rrs, now=now, policy=policy)} for sof in sofs]
    return rank_and_cut_line(entries, capacity_boxes=capacity["capacityBoxes"])


async def rescore_all(store) -> dict:
    from app.criteria import zoho_now
    scored = await _score_all_open_packages(store)
    stamp = zoho_now()
    for e in scored:
        await store.update_record(SOF_NAME, e["sof"]["ID"], {
            "Category": e["category"], "Blocked_Reason": e["blockedReason"] or "", "Queue_Rank": str(e["queueRank"]),
            "Priority_Reason": e["priorityReason"], "Suggested_Action": "", "Suggested_Release": e["suggestedRelease"], "Scored_At": stamp,
        }, by_form=True)
    return {"scored": len(scored)}


async def rescore_one(store, _so_no=None) -> dict:
    return await rescore_all(store)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/test_policy.py tests/fulfillment/test_sorter.py -v`
Expected: PASS (2 + 26 = 28 tests)

- [ ] **Step 5: Commit**

```bash
git add app/policy.py app/fulfillment/pipeline.py app/fulfillment/sorter.py tests/test_policy.py tests/fulfillment/test_sorter.py
git commit -m "feat: app/fulfillment/sorter.py + app/policy.py (the sorting engine)"
```

---

## Task 10: `app/fulfillment/sorter_hooks.py` — event-triggered re-scoring

**Files:**
- Create: `app/fulfillment/sorter_hooks.py`
- Modify: `app/fulfillment/apis.py` (created here, since `recalculate_fulfillment_queue` is tested alongside the hooks in Node's own test file)
- Test: `tests/fulfillment/test_sorter_hooks.py`

**Interfaces:**
- Consumes: `app.workflows.register`, `app.fulfillment.sorter.rescore_one`, `app.fulfillment.sorter.rescore_all`
- Produces: the two re-score hook registrations (side effect of import); `app/fulfillment/apis.py`'s `recalculate_fulfillment_queue(payload, store, ctx) -> dict` (registered into `app.custom_apis.CUSTOM_APIS["recalculate_fulfillment_queue"]`)

- [ ] **Step 1: Write the failing tests**

```python
# tests/fulfillment/test_sorter_hooks.py
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
from app.custom_apis import CUSTOM_APIS
from app.fulfillment.sorter import rescore_one, rescore_all
import app.fulfillment.sorter_hooks  # noqa: F401 -- registers the two re-score hooks
import app.fulfillment.apis  # noqa: F401 -- registers recalculate_fulfillment_queue

SOF = "Sales_Order_Fulfillment"


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _add_package(raw_store, extra):
    return await raw_store.add_record(SOF, {"SO_No": "SO-1", "Fulfillment_Stage": "Order Readiness", "order_type": "Normal", "Shipping_Address": "1 Main St", "Item_Details1": [{"Quantity": "1"}], **extra})


@pytest.mark.asyncio
async def test_rescore_all_every_open_package_gets_a_category_rank_and_scored_at(raw_store):
    await _add_package(raw_store, {"SO_No": "SO-1", "SO_Created_Date": "2026-11-01", "target_delivery_date": "2026-12-15"})
    await _add_package(raw_store, {"SO_No": "SO-2", "SO_Created_Date": "2026-11-05", "target_delivery_date": "2026-12-15"})
    result = await rescore_all(raw_store)
    assert result["scored"] == 2
    rows = await raw_store.find(SOF)
    by_so = {r["SO_No"]: r for r in rows}
    assert by_so["SO-1"]["Category"] == "on_time"
    assert by_so["SO-1"]["Queue_Rank"] == "1"
    assert by_so["SO-2"]["Queue_Rank"] == "2"
    assert by_so["SO-1"]["Scored_At"]


@pytest.mark.asyncio
async def test_rescore_all_a_package_already_at_for_delivery_is_left_out(raw_store):
    await _add_package(raw_store, {"SO_No": "SO-1", "Fulfillment_Stage": "For Delivery"})
    result = await rescore_all(raw_store)
    assert result["scored"] == 0
    row = (await raw_store.find(SOF))[0]
    assert row["Category"] == ""


@pytest.mark.asyncio
async def test_rescore_one_rescores_the_named_so_but_still_reranks_everything_else(raw_store):
    await _add_package(raw_store, {"SO_No": "SO-1", "SO_Created_Date": "2026-11-01"})
    await _add_package(raw_store, {"SO_No": "SO-2", "SO_Created_Date": "2026-11-05"})
    await rescore_one(raw_store, "SO-1")
    rows = await raw_store.find(SOF)
    by_so = {r["SO_No"]: r for r in rows}
    assert by_so["SO-1"]["Category"]
    assert by_so["SO-2"]["Category"]


@pytest.mark.asyncio
async def test_saving_a_sof_record_scores_it_automatically(hooked_store, raw_store):
    id_ = await hooked_store.add_record(SOF, {"SO_No": "SO-9", "Fulfillment_Stage": "Order Readiness", "order_type": "Normal", "SO_Created_Date": "2026-11-01", "target_delivery_date": "2026-12-15", "Shipping_Address": "1 Main St", "Item_Details1": [{"Quantity": "1"}]})
    row = await raw_store.get_record_by_id(SOF, id_, raw=True)
    assert row["Category"] == "on_time"
    assert row["Scored_At"]


@pytest.mark.asyncio
async def test_an_unpaid_gate_save_rescores_the_package_blocked_flips_to_a_workable_category(hooked_store, raw_store):
    id_ = await hooked_store.add_record(SOF, {"SO_No": "SO-10", "Fulfillment_Stage": "Order Readiness", "order_type": "Normal", "Package": "PAC-10", "SO_Created_Date": "2026-11-01", "target_delivery_date": "2026-12-15", "Shipping_Address": "1 Main St", "Item_Details1": [{"Quantity": "1"}]})
    gate_id = await hooked_store.add_record("Sales_Order_Readiness_Gate", {"sales_order_number": "SO-10", "Package_Order": "PAC-10", "payment_status": "Partial", "Has_Credit_Terms": False})
    row = await raw_store.get_record_by_id(SOF, id_, raw=True)
    assert row["Category"] == "blocked"
    await hooked_store.update_record("Sales_Order_Readiness_Gate", gate_id, {"payment_status": "Yes"}, by_form=True)
    row = await raw_store.get_record_by_id(SOF, id_, raw=True)
    assert row["Category"] == "on_time"


@pytest.mark.asyncio
async def test_an_open_replacement_request_makes_the_package_broken_read_from_the_db(raw_store):
    await _add_package(raw_store, {"SO_No": "SO-11", "SO_Created_Date": "2026-11-01", "target_delivery_date": "2026-12-15"})
    await raw_store.add_record("Replacement_Request", {"RR_No": "RR-00001", "RR_SO": "SO-11", "RR_Status": "Open"})
    await rescore_all(raw_store)
    row = (await raw_store.find(SOF, lambda r: r["SO_No"] == "SO-11"))[0]
    assert row["Category"] == "broken"
    rr = (await raw_store.find("Replacement_Request"))[0]
    await raw_store.update_record("Replacement_Request", rr["ID"], {"RR_Status": "Closed"}, by_form=True)
    await rescore_all(raw_store)
    after = (await raw_store.find(SOF, lambda r: r["SO_No"] == "SO-11"))[0]
    assert after["Category"] == "on_time"


@pytest.mark.asyncio
async def test_recalculate_fulfillment_queue_custom_api_rescores_everything(hooked_store, raw_store):
    await hooked_store.add_record(SOF, {"SO_No": "SO-20", "Fulfillment_Stage": "Order Readiness", "order_type": "Normal", "Shipping_Address": "1 Main St", "Item_Details1": [{"Quantity": "1"}]})
    fn = CUSTOM_APIS["recalculate_fulfillment_queue"]
    result = await fn({}, raw_store, {})
    assert result["status"] == "success"
    assert result["scored"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/test_sorter_hooks.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.fulfillment.sorter_hooks'`

- [ ] **Step 3: Write the implementation**

```python
# app/fulfillment/sorter_hooks.py
# Event-triggered scoring (spec §05/01 §6: "any material event ... re-score that Sales Order's
# records immediately"). Ported from server/modules/fulfillment/sorter-hooks.mjs. Registered on the
# two forms whose saves can change a package's category or rank: the package itself, and its
# Readiness Gate records (payment/approval changes flip Blocked on and off). The nightly schedule
# (app/forecast/schedule.py's spirit, not wired to cron) and the manual trigger (apis.py's
# recalculate_fulfillment_queue) call rescore_all directly.
#
# No re-entrancy risk: the `store` a hook receives (app/workflows.py's create_hooked_store) is
# always the raw, unhooked store the wrapper closes over, never the wrapper itself -- so
# rescore_one's writes here cannot re-trigger these same hooks.
from app.deluge import blank
from app.fulfillment.sorter import rescore_one
from app.workflows import register


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


async def _on_sof_save(args: dict) -> None:
    await rescore_one(args["store"], _text(args["record"].get("SO_No")))


register("Sales_Order_Fulfillment", {"afterAdd": _on_sof_save, "afterUpdate": _on_sof_save})


async def _on_gate_save(args: dict) -> None:
    await rescore_one(args["store"], _text(args["record"].get("sales_order_number")))


register("Sales_Order_Readiness_Gate", {"afterAdd": _on_gate_save, "afterUpdate": _on_gate_save})
```

```python
# app/fulfillment/apis.py
# Fulfillment custom APIs. Ported from server/modules/fulfillment/apis.mjs. check_payment_status
# and create_package_ff are still "not ported yet" in Node itself (confirmed: apis.mjs's withPlaceholders
# never implements them either) -- neither is registered here, so app.custom_apis.invoke_custom_api
# answers both with the standard "not ported yet" message, exactly matching Node's current state.
from app.custom_apis import CUSTOM_APIS
from app.fulfillment.sorter import rescore_all


# Manual "Recalculate" trigger for the sorting engine (spec §05/01 §6). Not a Deluge port -- new in
# this system -- so it has no "not ported yet" counterpart.
async def recalculate_fulfillment_queue(payload: dict, store, ctx: dict) -> dict:
    result = await rescore_all(store)
    return {"status": "success", **result}


CUSTOM_APIS["recalculate_fulfillment_queue"] = recalculate_fulfillment_queue
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/test_sorter_hooks.py -v`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add app/fulfillment/sorter_hooks.py app/fulfillment/apis.py tests/fulfillment/test_sorter_hooks.py
git commit -m "feat: app/fulfillment/sorter_hooks.py + apis.py (event-triggered re-scoring, recalculate_fulfillment_queue)"
```

---

## Task 11: `app/fulfillment/pipeline.py` — Sales Order → Readiness → Pick → Pack & QC, plus the catch-up sweep

**Files:**
- Modify: `app/fulfillment/pipeline.py` (extends the `STAGE_ORDER`-only file from Task 9)
- Test: `tests/fulfillment/test_pipeline.py`, `tests/fulfillment/test_box_count_api.py`

**Interfaces:**
- Consumes: `app.deluge.blank`, `app.deluge.truthy`, `app.criteria.zoho_now`, `app.fulfillment.workflows.package_stage`, `app.fulfillment.workflows.needs_payment_approval`, `app.fulfillment.where.eq`
- Produces: `advance_stage(store, so, item_name, sku, stage) -> None`, `so_to_readiness(args: dict) -> None` (hook), `release_to_pick(args: dict) -> None` (hook), `all_picked_for_package(store, so, pkg) -> bool`, `picked_to_qc(args: dict) -> None` (hook), `reconcile_fulfillment(store, *, user="system") -> dict`

- [ ] **Step 1: Write the failing tests**

```python
# tests/fulfillment/test_pipeline.py
# Fulfillment pipeline, first part (app/fulfillment/pipeline.py), with the hooked store: paid +
# package -> Order Readiness (one Gate record per item). Release -> Pick -> Mark Picked -> Pack & QC.
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment.workflows  # noqa: F401
import app.fulfillment.pipeline as pipeline

SOF, GATE, PICK, QC = "Sales_Order_Fulfillment", "Sales_Order_Readiness_Gate", "Pick1", "Checker_Checklist"
LAMP = {"Item": "Lamp", "SKU": "L-1", "Quantity": "2", "Bin_Location": "A-01"}
SHADE = {"Item": "Shade", "SKU": "S-1", "Quantity": "4", "Bin_Location": "B-02"}


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _add_package(hooked_store, raw_store, extra=None):
    extra = extra or {}
    customer = await raw_store.add_record("Customer", {"customer_name": "Sample Customer"})
    return await hooked_store.add_record(SOF, {
        "SO_No": "SO-1", "Fulfillment_Stage": "Waiting For Package", "Package": "PAC-1", "Status": "Yes", "Customer": customer,
        "Customer_Type": "Corporate", "Delivery_Type": "Delivery Only", "order_type": "Normal", "Shipping_Address": "1 Main St",
        "Item_Details1": [LAMP, SHADE], **extra,
    })


async def _sof(raw_store, id_):
    return await raw_store.get_record_by_id(SOF, id_, raw=True)


async def _rows(raw_store, form):
    return await raw_store.find(form)


@pytest.mark.asyncio
async def test_paid_plus_package_order_readiness_and_one_gate_record_per_item(hooked_store, raw_store):
    id_ = await _add_package(hooked_store, raw_store)
    assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == "Order Readiness"
    gate = await _rows(raw_store, GATE)
    assert sorted(g["SKU"] for g in gate) == ["L-1", "S-1"]
    g = next(r for r in gate if r["SKU"] == "L-1")
    assert (g["sales_order_number"], g["Package_Order"], g["payment_status"], g["customer_name"], g["customer_address"], g["Quantity"], g["Bin_Location"]) == (
        "SO-1", "PAC-1", "Yes", "Sample Customer", "1 Main St", "2", "A-01",
    )


@pytest.mark.asyncio
async def test_a_package_number_is_enough_for_the_gate_paid_or_not_no_package_waits(hooked_store, raw_store):
    for extra in [{"Status": "No"}, {"Status": "Partial"}, {"Package": ""}]:
        for form in (SOF, GATE):
            for r in await raw_store.find(form):
                await raw_store.delete_record(form, r["ID"])
        id_ = await _add_package(hooked_store, raw_store, extra)
        expect_stage = "Waiting For Package" if extra.get("Package") == "" else "Need Approval"
        assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == expect_stage, extra
        expect_gates = 0 if extra.get("Package") == "" else 2
        assert len(await _rows(raw_store, GATE)) == expect_gates, extra


@pytest.mark.asyncio
async def test_paying_later_updates_the_gate_records_saving_again_does_not_duplicate(hooked_store, raw_store):
    id_ = await _add_package(hooked_store, raw_store, {"Status": "No"})
    assert [g["payment_status"] for g in await _rows(raw_store, GATE)] == ["No", "No"]
    await hooked_store.update_record(SOF, id_, {"Status": "Yes"}, by_form=True)
    assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == "Order Readiness"
    assert [g["payment_status"] for g in await _rows(raw_store, GATE)] == ["Yes", "Yes"]
    await hooked_store.update_record(SOF, id_, {"Shipping_Address": "2 Side St"}, by_form=True)
    gate = await _rows(raw_store, GATE)
    assert len(gate) == 2
    assert all(g["customer_address"] == "2 Side St" for g in gate)


@pytest.mark.asyncio
async def test_release_creates_pick1_and_notification_package_is_in_picking(hooked_store, raw_store):
    id_ = await _add_package(hooked_store, raw_store)
    lamp_gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    await hooked_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    picks = await _rows(raw_store, PICK)
    assert len(picks) == 1
    assert (picks[0]["SKU"], picks[0]["SO"], picks[0]["Picker"], picks[0]["Quantity_to_Pick"], picks[0]["Package_Order"], picks[0]["Customer_Name"]) == (
        "L-1", "SO-1", "Hendel", "2", "PAC-1", "Sample Customer",
    )
    assert len(await _rows(raw_store, "Pick_Notifications")) == 1
    assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == "Picking"


@pytest.mark.asyncio
async def test_saving_a_released_gate_again_updates_pick1_never_duplicates(hooked_store, raw_store):
    await _add_package(hooked_store, raw_store)
    lamp_gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    await hooked_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    await hooked_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Jayvon"}, by_form=True)
    picks = await _rows(raw_store, PICK)
    assert len(picks) == 1
    assert picks[0]["Picker"] == "Jayvon"
    assert len(await _rows(raw_store, "Pick_Notifications")) == 1


@pytest.mark.asyncio
async def test_a_package_further_along_is_not_pulled_back_releasing_alone_creates_no_qc(hooked_store, raw_store):
    id_ = await _add_package(hooked_store, raw_store)
    lamp_gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    await hooked_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    await hooked_store.update_record(SOF, id_, {"Fulfillment_Stage": "Pack & QC"}, by_form=True)
    await hooked_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Kurt"}, by_form=True)
    assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == "Pack & QC"
    assert await _rows(raw_store, QC) == []


@pytest.mark.asyncio
async def test_values_copy_unchanged_so_to_readiness_to_pick(hooked_store, raw_store):
    id_ = await _add_package(hooked_store, raw_store, {
        "SO_No": "SO-16468", "PR_No": "PR-0042", "RR_No": "RR-0007", "order_type": "Pre Order", "Delivery_Type": "Delivery and Installation",
        "For_Crate": True, "target_delivery_date": "2026-12-05", "Billing_Address": "9 Bill St", "Shipping_Address": "",
        "Forecast_Delivery": "2026-11-30", "Forecast_Window": "Nov 28 - Dec 2", "Forecast_Status": "At Risk",
    })
    sof_row = await _sof(raw_store, id_)
    assert sof_row["Forecast_Delivery"]  # the Instant Forecast hooks recompute it; checked for presence, not the literal
    gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    assert (gate["sales_order_number"], gate["pr_number"], gate["rr_number"], gate["Package_Order"], gate["Order_Type"], gate["Delivery_Type"]) == (
        sof_row["SO_No"], sof_row["PR_No"], sof_row["RR_No"], sof_row["Package"], sof_row["order_type"], sof_row["Delivery_Type"],
    )
    assert (gate["customer_address"], gate["Item_Name"], gate["Quantity"], gate["Bin_Location"]) == ("9 Bill St", "Lamp", "2", "A-01")

    await hooked_store.update_record(GATE, gate["ID"], {"Demo": "DEMO-9", "Assign_Picker": "Hendel", "Release": True}, by_form=True)
    gate_now = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    pick = (await _rows(raw_store, PICK))[0]
    assert (pick["SO"], pick["PR_if_any"], pick["RR"], pick["Demo"], pick["Package_Order"], pick["Order_Type"], pick["Delivery_Type"]) == (
        "SO-16468", "PR-0042", "RR-0007", "DEMO-9", "PAC-1", "Pre Order", "Delivery and Installation",
    )
    assert (pick["Customer_Name"], pick["Customer_Type"], pick["Customer_Address"], pick["Item_Name"], pick["SKU"], pick["Quantity_to_Pick"], pick["Bin_Location"]) == (
        "Sample Customer", "Corporate", "9 Bill St", "Lamp", "L-1", "2", "A-01",
    )
    assert (pick["Forecast_Delivery"], pick["Forecast_Window"], pick["Forecast_Status"]) == (gate_now["Forecast_Delivery"], gate_now["Forecast_Window"], gate_now["Forecast_Status"])


@pytest.mark.asyncio
async def test_a_later_sof_save_never_blanks_customer_or_forecast_on_gate_and_pick(hooked_store, raw_store):
    id_ = await _add_package(hooked_store, raw_store, {"Forecast_Delivery": "2026-11-30", "Forecast_Window": "Nov 28 - Dec 2", "Forecast_Status": "On Track"})
    lamp_gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    await hooked_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    for c in await raw_store.find("Customer"):
        await raw_store.delete_record("Customer", c["ID"])
    await hooked_store.update_record(SOF, id_, {"Shipping_Address": "", "Billing_Address": "", "Forecast_Delivery": "", "Forecast_Window": "", "Forecast_Status": "", "Status": "Yes"}, by_form=True)
    after = await _sof(raw_store, id_)
    gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    assert (gate["customer_name"], gate["customer_address"]) == ("Sample Customer", "1 Main St")
    assert gate["Forecast_Delivery"]
    assert gate["Forecast_Delivery"] == after["Forecast_Delivery"]
    pick = (await _rows(raw_store, PICK))[0]
    assert (pick["Customer_Name"], pick["Customer_Address"]) == ("Sample Customer", "1 Main St")
    assert pick["Forecast_Status"] == after["Forecast_Status"]


async def _to_pick(hooked_store, raw_store, extra=None):
    id_ = await _add_package(hooked_store, raw_store, extra)
    lamp_gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    await hooked_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    pick = (await _rows(raw_store, PICK))[0]
    return id_, pick


@pytest.mark.asyncio
async def test_mark_picked_creates_one_pending_qc_record_package_in_pack_qc(hooked_store, raw_store):
    id_, pick = await _to_pick(hooked_store, raw_store, {"PR_No": "PR-0042", "RR_No": "RR-0007", "target_delivery_date": "2026-12-05", "Forecast_Delivery": "2026-11-30", "Forecast_Window": "Nov 28 - Dec 2", "Forecast_Status": "At Risk"})
    assert await _rows(raw_store, QC) == []
    await hooked_store.update_record(PICK, pick["ID"], {"Marked": True}, by_form=True)
    qc = await _rows(raw_store, QC)
    assert len(qc) == 1
    assert (qc[0]["SO"], qc[0]["PAC"], qc[0]["PR"], qc[0]["RR"], qc[0]["SKU"], qc[0]["Item_Name"], qc[0]["Quantity"], qc[0]["Bin_Location"], qc[0]["Target_Delivery_Date"], qc[0]["Customer_Name"], qc[0]["Customer_Address"]) == (
        "SO-1", "PAC-1", "PR-0042", "RR-0007", "L-1", "Lamp", "2", "A-01", "2026-12-05", "Sample Customer", "1 Main St",
    )
    assert (qc[0]["QC_Status"], qc[0]["Quality_Checker"]) == ("", "")
    assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == "Pack & QC"
    assert len(await raw_store.get_records("All_Qc_Reports1")) == 1


@pytest.mark.asyncio
async def test_marking_again_updates_pending_qc_approved_is_history_new_pick_gets_its_own(hooked_store, raw_store):
    _, pick = await _to_pick(hooked_store, raw_store)
    await hooked_store.update_record(PICK, pick["ID"], {"Marked": True}, by_form=True)
    await hooked_store.update_record(PICK, pick["ID"], {"Bin_Location": "A-02"}, by_form=True)
    qc = await _rows(raw_store, QC)
    assert len(qc) == 1
    assert qc[0]["Bin_Location"] == "A-02"
    await hooked_store.update_record(QC, qc[0]["ID"], {"QC_Status": "Approved"}, by_form=True)
    await hooked_store.update_record(PICK, pick["ID"], {"Quantity_to_Pick": "3"}, by_form=True)
    qc = await _rows(raw_store, QC)
    assert len(qc) == 2


@pytest.mark.asyncio
async def test_an_unmarked_pick_save_adds_no_qc_further_along_is_not_pulled_back(hooked_store, raw_store):
    id_, pick = await _to_pick(hooked_store, raw_store)
    await hooked_store.update_record(PICK, pick["ID"], {"Picker": "Kurt"}, by_form=True)
    assert await _rows(raw_store, QC) == []
    assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == "Picking"
    await hooked_store.update_record(PICK, pick["ID"], {"Marked": True}, by_form=True)
    await hooked_store.update_record(PICK, pick["ID"], {"Marked": False}, by_form=True)
    assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == "Pack & QC"


@pytest.mark.asyncio
async def test_reconcile_data_written_with_no_hook_is_carried_all_the_way(raw_store):
    customer = await raw_store.add_record("Customer", {"customer_name": "Sample Customer", "Email": "c@example.test", "Phone_Number": "+63 900 000 0000", "Billing_Address": {"district_city": "Makati"}})
    paid = await raw_store.add_record(SOF, {"SO_No": "SO-7", "Fulfillment_Stage": "Waiting For Package", "Package": "PAC-7", "Status": "Yes", "Customer": customer, "Customer_Type": "Corporate", "order_type": "Normal", "Delivery_Type": "Delivery Only", "Item_Details1": [LAMP, SHADE], "PR_No": "PR-7"})
    unpaid = await raw_store.add_record(SOF, {"SO_No": "SO-8", "Fulfillment_Stage": "Waiting For Package", "Package": "PAC-8", "Status": "Partial", "Customer": customer, "Item_Details1": [LAMP]})
    no_package = await raw_store.add_record(SOF, {"SO_No": "SO-9", "Fulfillment_Stage": "Waiting For Package", "Package": "", "Status": "Yes", "Customer": customer, "Item_Details1": [LAMP]})

    done = await pipeline.reconcile_fulfillment(raw_store)
    assert done["gate"] == 2
    assert len(await _rows(raw_store, GATE)) == 3
    assert (await _sof(raw_store, paid))["Fulfillment_Stage"] == "Order Readiness"
    assert (await _sof(raw_store, unpaid))["Fulfillment_Stage"] == "Need Approval"
    assert (await _sof(raw_store, no_package))["Fulfillment_Stage"] == "Waiting For Package"

    lamp_gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    await raw_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    done = await pipeline.reconcile_fulfillment(raw_store)
    assert done["pick"] == 1
    assert len(await _rows(raw_store, PICK)) == 1
    assert (await _sof(raw_store, paid))["Fulfillment_Stage"] == "Picking"

    pick = (await _rows(raw_store, PICK))[0]
    await raw_store.update_record(PICK, pick["ID"], {"Marked": True}, by_form=True)
    done = await pipeline.reconcile_fulfillment(raw_store)
    assert done["qc"] == 1
    qc = (await _rows(raw_store, QC))[0]
    assert (qc["SO"], qc["PAC"], qc["PR"], qc["SKU"], qc["Quantity"], qc["Customer_Name"], qc["City"], qc["Email"], qc["Contact"]) == (
        "SO-7", "PAC-7", "PR-7", "L-1", "2", "Sample Customer", "Makati", "c@example.test", "+63 900 000 0000",
    )
    assert (await _sof(raw_store, paid))["Fulfillment_Stage"] == "Pack & QC"

    assert await pipeline.reconcile_fulfillment(raw_store) == {"gate": 0, "pick": 0, "qc": 0, "stage": 0}


@pytest.mark.asyncio
async def test_all_picked_for_package_false_until_every_row_marked(hooked_store, raw_store):
    await _add_package(hooked_store, raw_store)
    gates = await _rows(raw_store, GATE)
    for g in gates:
        await hooked_store.update_record(GATE, g["ID"], {"Release": True, "Assign_Picker": "Ana"}, by_form=True)
    picks = await _rows(raw_store, PICK)
    assert len(picks) == 2
    assert await pipeline.all_picked_for_package(raw_store, "SO-1", "PAC-1") is False
    await hooked_store.update_record(PICK, picks[0]["ID"], {"Marked": True}, by_form=True)
    assert await pipeline.all_picked_for_package(raw_store, "SO-1", "PAC-1") is False
    await hooked_store.update_record(PICK, picks[1]["ID"], {"Marked": True}, by_form=True)
    assert await pipeline.all_picked_for_package(raw_store, "SO-1", "PAC-1") is True
```

```python
# tests/fulfillment/test_box_count_api.py
# package_pick_status custom API (app/fulfillment/apis.py): tells the Pick widget whether a package
# is now fully picked and still needs its box count, right after a Mark Picked save.
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
from app.custom_apis import CUSTOM_APIS
import app.fulfillment.workflows  # noqa: F401
import app.fulfillment.pipeline  # noqa: F401
import app.fulfillment.apis  # noqa: F401 -- registers package_pick_status

SOF, GATE, PICK = "Sales_Order_Fulfillment", "Sales_Order_Readiness_Gate", "Pick1"
LAMP = {"Item": "Lamp", "SKU": "L-1", "Quantity": "2", "Bin_Location": "A-01"}


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _add_package(hooked_store):
    return await hooked_store.add_record(SOF, {
        "SO_No": "SO-1", "Fulfillment_Stage": "Waiting For Package", "Package": "PAC-1", "Status": "Yes",
        "Customer_Type": "Corporate", "Delivery_Type": "Delivery Only", "order_type": "Normal", "Shipping_Address": "1 Main St", "Item_Details1": [LAMP],
    })


@pytest.mark.asyncio
async def test_not_all_picked_yet_reports_all_picked_false_needs_box_count_false(hooked_store, raw_store):
    await _add_package(hooked_store)
    gate = (await raw_store.find(GATE))[0]
    await hooked_store.update_record(GATE, gate["ID"], {"Release": True}, by_form=True)
    fn = CUSTOM_APIS["package_pick_status"]
    result = await fn({"so": "SO-1", "pkg": "PAC-1"}, raw_store, {})
    assert (result["status"], result["allPicked"], result["needsBoxCount"]) == ("success", False, False)


@pytest.mark.asyncio
async def test_all_picked_and_still_estimated_reports_needs_box_count_true(hooked_store, raw_store):
    await _add_package(hooked_store)
    gate = (await raw_store.find(GATE))[0]
    await hooked_store.update_record(GATE, gate["ID"], {"Release": True}, by_form=True)
    pick = (await raw_store.find(PICK))[0]
    await hooked_store.update_record(PICK, pick["ID"], {"Marked": True}, by_form=True)
    fn = CUSTOM_APIS["package_pick_status"]
    result = await fn({"so": "SO-1", "pkg": "PAC-1"}, raw_store, {})
    assert (result["allPicked"], result["needsBoxCount"]) == (True, True)


@pytest.mark.asyncio
async def test_all_picked_but_already_counted_reports_needs_box_count_false(hooked_store, raw_store):
    id_ = await _add_package(hooked_store)
    await raw_store.update_record(SOF, id_, {"Box_Count": "3", "Box_Count_Source": "counted"}, by_form=True)
    gate = (await raw_store.find(GATE))[0]
    await hooked_store.update_record(GATE, gate["ID"], {"Release": True}, by_form=True)
    pick = (await raw_store.find(PICK))[0]
    await hooked_store.update_record(PICK, pick["ID"], {"Marked": True}, by_form=True)
    fn = CUSTOM_APIS["package_pick_status"]
    result = await fn({"so": "SO-1", "pkg": "PAC-1"}, raw_store, {})
    assert (result["allPicked"], result["needsBoxCount"]) == (True, False)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/test_pipeline.py tests/fulfillment/test_box_count_api.py -v`
Expected: FAIL — `app.fulfillment.pipeline` has no `so_to_readiness`/`release_to_pick`/`picked_to_qc`/`all_picked_for_package`/`reconcile_fulfillment`/`advance_stage` yet (only `STAGE_ORDER` from Task 9), and `app/fulfillment/apis.py` has no `package_pick_status`

- [ ] **Step 3a: Extend `app/fulfillment/pipeline.py`**

Append to the existing `app/fulfillment/pipeline.py` (keep the `STAGE_ORDER` constant from Task 9 unchanged):

```python
# (appended to app/fulfillment/pipeline.py, below STAGE_ORDER)
#
# Ported from server/modules/fulfillment/pipeline.mjs.
#   Sales_Order_Fulfillment     SO_to_Readiness
#   Sales_Order_Readiness_Gate  Release_Records_to_Pick1
#   Pick1                       Pick1_Marked_to_QC_Sync
# all "on add or edit, on success". Not ported yet (later Fulfillment slices): QC approve -> Crate /
# Order Aggregation, Crating done, Dispatch -> For Delivery (those are qc_routing.py and
# crate_dispatch.py, Tasks 12-13).
#
# A Sales_Order_Fulfillment record (one per package) with a Package creates one
# Sales_Order_Readiness_Gate record per item line, with the customer name/address, whatever the
# payment: the payment status is copied onto the Gate record and existing Gate records are only
# refreshed (payment, address, quantity), so paying later and saving again updates them without
# duplicates. A Gate record saved with Release checked creates/updates its Pick1 record, adds a
# Pick_Notifications row for a new one, and the package's stage becomes "Picking". A Pick1 record
# saved with Marked checked creates/updates its Checker_Checklist record and the item's Pack & QC
# line, stage becomes "Pack & QC".
#
# Values are copied as they are from one form to the next: nothing is renamed, rounded or
# recalculated. A value that comes out empty never blanks one that is already there.
#
# Differences from Zoho, on purpose: a stage only moves FORWARD. Writes made here do not run the
# workflows again (an insert/update through the raw store does not on Zoho either).
from app.criteria import zoho_now
from app.deluge import blank, truthy
from app.fulfillment.where import eq
from app.fulfillment.workflows import needs_payment_approval, package_stage
from app.workflows import register

SOF = "Sales_Order_Fulfillment"
GATE = "Sales_Order_Readiness_Gate"
PICK = "Pick1"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


async def advance_stage(store, so, item_name, sku, stage) -> None:
    target = STAGE_ORDER.index(stage)
    for sof in await store.find(SOF, lambda r: r.get("SO_No") == so, criteria=eq("SO_No", so)):
        holds_item = any(_text(row.get("Item")) == _text(item_name) and _text(row.get("SKU")) == _text(sku) for row in sof.get("Item_Details1") or [])
        if not holds_item:
            continue
        current_stage = sof.get("Fulfillment_Stage")
        if current_stage == stage or (current_stage in STAGE_ORDER and STAGE_ORDER.index(current_stage) > target):
            continue
        await store.update_record(SOF, sof["ID"], {"Fulfillment_Stage": stage}, by_form=True)


# ---------- Sales order package -> Readiness Gate ----------
async def so_to_readiness(args: dict) -> None:
    sof, store, user = args["record"], args["store"], args.get("user", "")
    so = _text(sof.get("SO_No"))
    pkg = _text(sof.get("Package"))
    if pkg == "":
        return

    customer_name = ""
    if not blank(sof.get("Customer")):
        try:
            customer = await store.get_record_by_id("Customer", str(sof["Customer"]), raw=True)
            customer_name = _text(customer.get("customer_name"))
        except Exception:
            pass
    address = _text(sof.get("Shipping_Address")) if _text(sof.get("Shipping_Address")) != "" else _text(sof.get("Billing_Address"))
    common = {
        "Order_Type": sof.get("order_type"), "Package_Order": pkg, "Delivery_Type": sof.get("Delivery_Type"), "For_Crate": truthy(sof.get("For_Crate")),
        "Target_Delivery_Date": sof.get("target_delivery_date"), "payment_status": sof.get("Status"), "customer_name": customer_name,
        "customer_type": sof.get("Customer_Type"), "customer_address": address, "pr_number": _text(sof.get("PR_No")), "rr_number": _text(sof.get("RR_No")),
        "Forecast_Delivery": _text(sof.get("Forecast_Delivery")), "Forecast_Window": _text(sof.get("Forecast_Window")), "Forecast_Status": _text(sof.get("Forecast_Status")),
    }
    keep_if_empty = {"customer_name", "customer_address", "Forecast_Delivery", "Forecast_Window", "Forecast_Status"}

    def refresh(gate: dict, values: dict) -> dict:
        return {k: v for k, v in values.items() if not (k in keep_if_empty and v == "" and not blank(gate.get(k)))}

    for row in sof.get("Item_Details1") or []:
        item = {"Item_Name": _text(row.get("Item")), "SKU": _text(row.get("SKU")), "Quantity": _text(row.get("Quantity")), "Bin_Location": _text(row.get("Bin_Location"))}
        existing = await store.find(GATE, lambda g: g.get("sales_order_number") == so and g.get("SKU") == item["SKU"] and g.get("Package_Order") == pkg, criteria=eq("sales_order_number", so))
        for gate in existing:
            await store.update_record(GATE, gate["ID"], refresh(gate, {**common, **item}), by_form=True)
            if truthy(gate.get("Release")):
                for pick in await store.find(PICK, lambda p: p.get("SO") == so and p.get("SKU") == item["SKU"] and p.get("Item_Name") == item["Item_Name"] and p.get("Package_Order") == pkg, criteria=eq("SO", so)):
                    await store.update_record(PICK, pick["ID"], {
                        "Package_Order": pkg, "PR_if_any": common["pr_number"], "RR": common["rr_number"], "Delivery_Type": common["Delivery_Type"],
                        "Order_Type": common["Order_Type"], "Target_Delivery_Date": common["Target_Delivery_Date"], "For_Crate": common["For_Crate"],
                        "Item_Name": item["Item_Name"], "Bin_Location": item["Bin_Location"], "SKU": item["SKU"], "Quantity_to_Pick": item["Quantity"],
                        "Customer_Name": customer_name or pick.get("Customer_Name"), "Customer_Address": address or pick.get("Customer_Address"),
                        "Customer_Type": common["customer_type"], "Forecast_Delivery": common["Forecast_Delivery"] or pick.get("Forecast_Delivery"),
                        "Forecast_Window": common["Forecast_Window"] or pick.get("Forecast_Window"), "Forecast_Status": common["Forecast_Status"] or pick.get("Forecast_Status"),
                    }, by_form=True)
        if not existing:
            await store.add_record(GATE, {"sales_order_number": so, **common, **item}, user)


register(SOF, {"afterAdd": so_to_readiness, "afterUpdate": so_to_readiness})


# ---------- Readiness Gate (Release) -> Pick ----------
async def release_to_pick(args: dict) -> None:
    gate, store, user = args["record"], args["store"], args.get("user", "")
    so = _text(gate.get("sales_order_number"))
    if not truthy(gate.get("Release")):
        return

    for g in await store.find(GATE, lambda r: r.get("sales_order_number") == so and truthy(r.get("Release")) and not needs_payment_approval(r), criteria=eq("sales_order_number", so)):
        rr = _text(g.get("rr_number"))
        fields = {
            "Picker": g.get("Assign_Picker"), "Package_Order": g.get("Package_Order"), "PR_if_any": g.get("pr_number"), "RR": g.get("rr_number"),
            "Demo": g.get("Demo"), "Delivery_Type": g.get("Delivery_Type"), "Order_Type": g.get("Order_Type"), "Target_Delivery_Date": g.get("Target_Delivery_Date"),
            "For_Crate": g.get("For_Crate"), "Item_Name": g.get("Item_Name"), "Bin_Location": g.get("Bin_Location"), "SKU": g.get("SKU"),
            "Quantity_to_Pick": g.get("Quantity"), "Customer_Name": g.get("customer_name"), "Customer_Address": g.get("customer_address"), "Customer_Type": g.get("customer_type"),
            "Forecast_Delivery": g.get("Forecast_Delivery"), "Forecast_Window": g.get("Forecast_Window"), "Forecast_Status": g.get("Forecast_Status"),
        }
        found = await store.find(PICK, lambda p: p.get("SO") == so and p.get("SKU") == g.get("SKU") and p.get("Item_Name") == g.get("Item_Name") and p.get("Package_Order") == g.get("Package_Order") and _text(p.get("RR")) == rr, criteria=eq("SO", so))
        if found:
            for p in found:
                await store.update_record(PICK, p["ID"], fields, by_form=True)
        else:
            pick_id = await store.add_record(PICK, {"SO": so, **fields}, user)
            await store.add_record("Pick_Notifications", {
                "Recipient_Email": "homecartelff@gmail.com", "Notification_Type": "Pick Record Created",
                "Message": f"New item ready for picking — {so} ({g.get('Item_Name')}).", "Created_On": zoho_now(),
                "Read": False, "Target_URL": "", "Source_Record_No": so, "Source_Record_ID": pick_id,
            }, user)
        await advance_stage(store, so, g.get("Item_Name"), g.get("SKU"), "Picking")


register(GATE, {"afterAdd": release_to_pick, "afterUpdate": release_to_pick})


# ---------- Pick (Marked) -> Pack & QC ----------
QC = "Checker_Checklist"


async def _customer_contact(store, so, item_name, sku) -> dict:
    out = {}
    matches = await store.find(SOF, lambda r: r.get("SO_No") == so and any(_text(row.get("Item")) == _text(item_name) and _text(row.get("SKU")) == _text(sku) for row in r.get("Item_Details1") or []), criteria=eq("SO_No", so))
    if not matches:
        return out
    sof = matches[0]
    if _text(sof.get("Contact_No")) != "":
        out["Contact"] = _text(sof.get("Contact_No"))
    if not blank(sof.get("Customer")):
        try:
            c = await store.get_record_by_id("Customer", str(sof["Customer"]), raw=True)
            if _text(c.get("Email")) != "":
                out["Email"] = _text(c.get("Email"))
            if "Contact" not in out and _text(c.get("Phone_Number")) != "":
                out["Contact"] = _text(c.get("Phone_Number"))
            billing = c.get("Billing_Address")
            city = _text(billing.get("district_city")) if isinstance(billing, dict) else ""
            if city != "":
                out["City"] = city
        except Exception:
            pass
    return out


async def all_picked_for_package(store, so, pkg) -> bool:
    picks = await store.find(PICK, lambda p: _text(p.get("SO")) == _text(so) and _text(p.get("Package_Order")) == _text(pkg), criteria=eq("SO", so))
    return len(picks) > 0 and all(truthy(p.get("Marked")) for p in picks)


async def picked_to_qc(args: dict) -> None:
    pick, store, user = args["record"], args["store"], args.get("user", "")
    so = _text(pick.get("SO"))
    if not truthy(pick.get("Marked")):
        await advance_stage(store, so, pick.get("Item_Name"), pick.get("SKU"), "Picking")
        return

    pac = _text(pick.get("Package_Order"))
    rr = _text(pick.get("RR"))
    fields = {
        "PR": pick.get("PR_if_any"), "Demo": pick.get("Demo"), "RR": pick.get("RR"), "Delivery_Type": pick.get("Delivery_Type"),
        "Order_Type": pick.get("Order_Type"), "Target_Delivery_Date": pick.get("Target_Delivery_Date"), "For_Crate": pick.get("For_Crate"),
        "Customer_Name": pick.get("Customer_Name"), "Customer_Address": pick.get("Customer_Address"), "Customer_Type": pick.get("Customer_Type"),
        "Item_Name": pick.get("Item_Name"), "Quantity": pick.get("Quantity_to_Pick"), "Bin_Location": pick.get("Bin_Location"),
        "Forecast_Delivery": pick.get("Forecast_Delivery"), "Forecast_Window": pick.get("Forecast_Window"), "Forecast_Status": pick.get("Forecast_Status"),
        **(await _customer_contact(store, so, pick.get("Item_Name"), pick.get("SKU"))),
    }
    pending = await store.find(QC, lambda c: c.get("SO") == so and c.get("SKU") == _text(pick.get("SKU")) and c.get("PAC") == pac and _text(c.get("RR")) == rr and _text(c.get("QC_Status")) == "" and not isinstance(c.get("Recheck_Exceptions"), list), criteria=eq("SO", so))
    if pending:
        for c in pending:
            await store.update_record(QC, c["ID"], fields, by_form=True)
    else:
        await store.add_record(QC, {"SO": so, "PAC": pac, "SKU": _text(pick.get("SKU")), **fields}, user)
    await advance_stage(store, so, pick.get("Item_Name"), pick.get("SKU"), "Pack & QC")


register(PICK, {"afterAdd": picked_to_qc, "afterUpdate": picked_to_qc})


# ---------- Catch-up for everything that did not come through a hook ----------
async def reconcile_fulfillment(store, *, user: str = "system") -> dict:
    done = {"gate": 0, "pick": 0, "qc": 0, "stage": 0}

    def same_item(sof, name, sku) -> bool:
        return any(_text(row.get("Item")) == _text(name) and _text(row.get("SKU")) == _text(sku) for row in sof.get("Item_Details1") or [])

    sofs = await store.find(SOF)
    gates = await store.find(GATE)
    for sof in sofs:
        pkg = _text(sof.get("Package"))
        if pkg == "":
            continue
        missing = any(not any(g.get("sales_order_number") == _text(sof.get("SO_No")) and g.get("SKU") == _text(row.get("SKU")) and g.get("Package_Order") == pkg for g in gates) for row in sof.get("Item_Details1") or [])
        if missing:
            await so_to_readiness({"record": sof, "store": store, "user": user})
            done["gate"] += 1
        stage = await package_stage(store, sof)
        if stage is not None and stage != sof.get("Fulfillment_Stage"):
            await store.update_record(SOF, sof["ID"], {"Fulfillment_Stage": stage}, by_form=True)
            done["stage"] += 1

    picks0 = await store.find(PICK)
    gates = await store.find(GATE)
    for g in gates:
        if not truthy(g.get("Release")):
            continue
        has = any(p.get("SO") == g.get("sales_order_number") and p.get("SKU") == g.get("SKU") and p.get("Item_Name") == g.get("Item_Name") and p.get("Package_Order") == g.get("Package_Order") and _text(p.get("RR")) == _text(g.get("rr_number")) for p in picks0)
        if not has:
            await release_to_pick({"record": g, "store": store, "user": user})
            done["pick"] += 1

    picks = await store.find(PICK)
    qcs = await store.find(QC)
    for p in picks:
        if not truthy(p.get("Marked")):
            continue
        has = any(c.get("SO") == p.get("SO") and c.get("SKU") == _text(p.get("SKU")) and c.get("PAC") == _text(p.get("Package_Order")) and _text(c.get("RR")) == _text(p.get("RR")) for c in qcs)
        if not has:
            await picked_to_qc({"record": p, "store": store, "user": user})
            done["qc"] += 1

    sofs = await store.find(SOF)
    gate_rows = await store.find(GATE)
    pick_rows = await store.find(PICK)
    for sof in sofs:
        want = sof.get("Fulfillment_Stage")

        def at(stage):
            nonlocal want
            if STAGE_ORDER.index(stage) > STAGE_ORDER.index(want):
                want = stage

        for row in sof.get("Item_Details1") or []:
            if any(p.get("SO") == sof.get("SO_No") and same_item(sof, p.get("Item_Name"), p.get("SKU")) and truthy(p.get("Marked")) for p in pick_rows):
                at("Pack & QC")
            elif any(p.get("SO") == sof.get("SO_No") and same_item(sof, p.get("Item_Name"), p.get("SKU")) for p in pick_rows):
                at("Picking")
            elif any(g.get("sales_order_number") == sof.get("SO_No") and g.get("SKU") == _text(row.get("SKU")) and truthy(g.get("Release")) for g in gate_rows):
                at("Picking")
        if want != sof.get("Fulfillment_Stage"):
            await store.update_record(SOF, sof["ID"], {"Fulfillment_Stage": want}, by_form=True)
            done["stage"] += 1

    return done
```

- [ ] **Step 3b: Add `package_pick_status` to `app/fulfillment/apis.py`**

```python
# (added to app/fulfillment/apis.py, below recalculate_fulfillment_queue)
from app.fulfillment.pipeline import all_picked_for_package


# Tells the Pick widget, right after a Mark Picked save, whether the whole package is now picked
# and still needs a real box count (PKG-R3). Also new, not a Deluge port.
async def package_pick_status(payload: dict, store, ctx: dict) -> dict:
    so, pkg = payload["so"], payload["pkg"]
    all_picked = await all_picked_for_package(store, so, pkg)
    if not all_picked:
        return {"status": "success", "allPicked": False, "needsBoxCount": False}
    rows = await store.find("Sales_Order_Fulfillment", lambda r: r.get("SO_No") == so and r.get("Package") == pkg)
    sof = rows[0] if rows else None
    needs_box_count = not (sof and sof.get("Box_Count_Source") == "counted" and sof.get("Box_Count"))
    return {"status": "success", "allPicked": True, "needsBoxCount": needs_box_count}


CUSTOM_APIS["package_pick_status"] = package_pick_status
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/test_pipeline.py tests/fulfillment/test_box_count_api.py "tests/fulfillment/test_payment_approval.py::test_a_gate_record_still_needing_approval_is_never_released_to_pick" -v`
Expected: PASS (13 + 3 + 1 = 17 tests; the last one is the test deliberately deferred from Task 8)

- [ ] **Step 5: Commit**

```bash
git add app/fulfillment/pipeline.py app/fulfillment/apis.py tests/fulfillment/test_pipeline.py tests/fulfillment/test_box_count_api.py
git commit -m "feat: app/fulfillment/pipeline.py (Sales Order -> Readiness -> Pick -> Pack & QC, catch-up sweep)"
```

---

## Task 12: `app/fulfillment/qc_routing.py` — Pack & QC → Crate / To Ship / Exception Control

**Files:**
- Create: `app/fulfillment/qc_routing.py`
- Test: `tests/fulfillment/test_qc_routing.py`

**Interfaces:**
- Consumes: `app.deluge.blank`, `app.criteria.zoho_now`, `app.fulfillment.pipeline.advance_stage`, `app.fulfillment.where.eq`
- Produces: `upsert_to_ship(store, user, so, header, item, extra=None) -> None`, `qc_routing(args: dict) -> None` (hook)

- [ ] **Step 1: Write the failing tests**

```python
# tests/fulfillment/test_qc_routing.py
# QC routing (app/fulfillment/qc_routing.py), with the hooked store: approved -> To Ship (or Crate
# when for crating), rejected -> Exception Control, split = both.
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment.workflows  # noqa: F401
import app.fulfillment.pipeline  # noqa: F401
import app.fulfillment.qc_routing  # noqa: F401
from app.fulfillment.where import eq

SOF, QC, AGG, CRATE, EXC = "Sales_Order_Fulfillment", "Checker_Checklist", "Order_Aggregation1", "Crate_Checklist", "Exception_Control1"


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _add_package(raw_store):
    return await raw_store.add_record(SOF, {"SO_No": "SO-1", "Fulfillment_Stage": "Pack & QC", "Package": "PAC-1", "Item_Details1": [{"Item": "Lamp", "SKU": "L-1", "Quantity": "3"}]})


async def _add_qc(hooked_store, extra=None):
    extra = extra or {}
    return await hooked_store.add_record(QC, {"SO": "SO-1", "PAC": "PAC-1", "SKU": "L-1", "Item_Name": "Lamp", "Quantity": "3", "Bin_Location": "A-01", "Customer_Name": "Sample Customer", "Customer_Address": "1 Main St", "Order_Type": "Normal", "Delivery_Type": "Delivery Only", **extra})


async def _decide(hooked_store, id_, qc_status, quantity, extra=None):
    extra = extra or {}
    await hooked_store.update_record(QC, id_, {"QC_Status": qc_status, "Quantity": str(quantity), **extra}, by_form=True)


async def _stage(raw_store):
    return (await raw_store.find(SOF))[0]["Fulfillment_Stage"]


@pytest.mark.asyncio
async def test_approved_not_for_crating_one_to_ship_record_with_the_approved_quantity(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store)
    await _decide(hooked_store, id_, "Approved", 3)
    agg = await raw_store.find(AGG)
    assert len(agg) == 1
    assert agg[0]["SO"] == "SO-1"
    assert [(r["SKU"], str(r["QTY"]), r["PAC"], r["Bin_Location"]) for r in agg[0]["Item_Details"]] == [("L-1", "3", "PAC-1", "A-01")]
    assert await raw_store.find(CRATE) == []
    assert await raw_store.find(EXC) == []
    assert await _stage(raw_store) == "Order Aggregation"


@pytest.mark.asyncio
async def test_approved_and_for_crating_goes_to_crate_not_to_ship(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store, {"For_Crate": True})
    await _decide(hooked_store, id_, "Approved", 3, {"Quality_Checker": "Kurt"})
    crate = await raw_store.find(CRATE)
    assert len(crate) == 1
    assert (crate[0]["SO"], crate[0]["Package_Order"], str(crate[0]["Quantity"]), crate[0]["Assigned_Checker"]) == ("SO-1", "PAC-1", "3", "Kurt")
    assert await raw_store.find(AGG) == []
    assert await _stage(raw_store) == "Crate"


@pytest.mark.asyncio
async def test_rejected_one_exception_record_per_unit_numbered(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store)
    await _decide(hooked_store, id_, "Rejected", 2, {"Remarks": "Cracked glass"})
    exc = await raw_store.find(EXC)
    assert len(exc) == 2
    assert sorted(e["Exception_Number"] for e in exc) == ["EXC-FF-00001", "EXC-FF-00002"]
    assert all(e["Sales_Order"] == "SO-1" and e["SKU"] == "L-1" and e["PAC"] == "PAC-1" and str(e["Qty"]) == "1" and e["Remarks"] == "Cracked glass" for e in exc)
    assert len(await raw_store.find(AGG)) + len(await raw_store.find(CRATE)) == 0


@pytest.mark.asyncio
async def test_split_3_units_2_pass_1_fails(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store)
    await _decide(hooked_store, id_, "Rejected", 1)
    await _decide(hooked_store, id_, "Approved", 2, {"Split_Rejected_Qty": "1", "Split_Original_Qty": "3"})
    assert len(await raw_store.find(EXC)) == 1
    agg = await raw_store.find(AGG)
    assert len(agg) == 1
    assert str(agg[0]["Item_Details"][0]["QTY"]) == "2"


@pytest.mark.asyncio
async def test_saving_the_same_decision_again_adds_nothing(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store)
    await _decide(hooked_store, id_, "Rejected", 1)
    await _decide(hooked_store, id_, "Rejected", 1)
    await _decide(hooked_store, id_, "Approved", 2)
    await _decide(hooked_store, id_, "Approved", 2)
    assert len(await raw_store.find(EXC)) == 1
    agg = await raw_store.find(AGG)
    assert len(agg) == 1
    assert len(agg[0]["Item_Details"]) == 1
    assert str(agg[0]["Item_Details"][0]["QTY"]) == "2"


@pytest.mark.asyncio
async def test_a_later_batch_adds_to_to_ship_a_different_item_adds_a_row(hooked_store, raw_store):
    await _add_package(raw_store)
    a = await _add_qc(hooked_store, {"Quantity": "2"})
    await _decide(hooked_store, a, "Approved", 2)
    b = await _add_qc(hooked_store, {"Quantity": "1"})
    await _decide(hooked_store, b, "Approved", 1)
    c = await _add_qc(hooked_store, {"SKU": "S-1", "Item_Name": "Shade", "Quantity": "5"})
    await _decide(hooked_store, c, "Approved", 5)
    agg = (await raw_store.find(AGG))
    assert len(agg) == 1
    rows = {r["SKU"]: str(r["QTY"]) for r in agg[0]["Item_Details"]}
    assert rows == {"L-1": "3", "S-1": "5"}


@pytest.mark.asyncio
async def test_pending_or_blank_status_does_nothing(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store)
    await hooked_store.update_record(QC, id_, {"Remarks": "draft"}, by_form=True)
    assert len(await raw_store.find(AGG)) + len(await raw_store.find(CRATE)) + len(await raw_store.find(EXC)) == 0
    assert await _stage(raw_store) == "Pack & QC"


@pytest.mark.asyncio
async def test_find_with_criteria_reads_only_matching_rows(raw_store):
    await raw_store.add_record(AGG, {"SO": "SO-A", "PAC": "PAC-A", "Item_Details": []})
    await raw_store.add_record(AGG, {"SO": "SO-B", "PAC": "PAC-B", "Item_Details": []})
    assert len(await raw_store.find(AGG)) == 2
    assert [r["SO"] for r in await raw_store.find(AGG, criteria=eq("SO", "SO-A"))] == ["SO-A"]
    assert await raw_store.find(AGG, criteria=eq("SO", 'a "quoted" \\ value')) == []
    assert [r["SO"] for r in await raw_store.find(AGG, lambda r: r["SO"] == "SO-B", criteria='(NoSuchField == "x")')] == ["SO-B"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/test_qc_routing.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.fulfillment.qc_routing'`

- [ ] **Step 3: Write the implementation**

```python
# app/fulfillment/qc_routing.py
# Fulfillment pipeline, Pack & QC -> Crate / To Ship / Exception Control. Ported from
# server/modules/fulfillment/qc-routing.mjs.
#
# Per QC record saved with a QC_Status (Quantity is the number of units that status covers):
#   Rejected  -> Exception Control: one Exception_Control1 record per rejected unit (Qty 1 each,
#                EXC-FF-nnnnn), tagged with the QC record it came from (QC_ID). Grow-only per QC
#                record. A re-check of repaired units that fails again REOPENS its exception.
#   Approved  -> For_Crate -> Crate_Checklist; not crated -> Order_Aggregation1 (To Ship). Stage
#                moves forward to "Crate" or "Order Aggregation".
# A split write is two writes from the Pack & QC page on the same QC record (Rejected share, then
# Approved share). Each write routes its own share. The Approved row's quantity is always the SUM
# of every Approved QC record for that SO + SKU + package.
#
# Differences from Zoho, on purpose: the Readiness Gate quantity is NOT rewritten; here the
# matching To Ship row is updated in place rather than rebuilt.
from app.criteria import zoho_now
from app.deluge import blank
from app.fulfillment.pipeline import advance_stage
from app.fulfillment.where import eq
from app.workflows import register

QC = "Checker_Checklist"
EXC = "Exception_Control1"
CRATE = "Crate_Checklist"
AGG = "Order_Aggregation1"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _count(v) -> int:
    try:
        n = int(float(_text(v)))
        return n if n > 0 else 0
    except ValueError:
        return 0


def _is_crate(v) -> bool:
    return v is True or str(_text(v)).lower() in ("true", "yes", "1")


def _spare_parts(rows) -> dict:
    types, pairs = [], []
    for row in rows or []:
        type_ = _text(row.get("Spare_Part_Type"))
        if type_ == "":
            continue
        other = _text(row.get("Spare_Part_Type_Other"))
        name = other if type_ == "Others" and other != "" else type_
        types.append(name)
        pairs.append(f"{name}: {_text(row.get('Quantity_of_damage_spare_s')) or '—'}")
    return {"type": ", ".join(types), "qty": ", ".join(pairs)}


async def _supplier_of(store, pr) -> str:
    if pr == "":
        return ""
    try:
        rows = await store.find("Purchase_Request1", lambda r: _text(r.get("PR_Number")) == pr or _text(r.get("PR_No")) == pr, criteria=f'{eq("PR_Number", pr)} || {eq("PR_No", pr)}')
        return _text(rows[0].get("Supplier")) if rows else ""
    except Exception:
        return ""


async def _rejected_to_exception(ctx: dict, so, sku, pac, units) -> None:
    qc, store, user, id_ = ctx["record"], ctx["store"], ctx.get("user", ""), ctx.get("id")
    spare = _spare_parts(qc.get("Spare_part_type"))
    shared = {
        "RR_No": qc.get("RR"), "PR": qc.get("PR"), "Demo1": qc.get("Demo"), "Order_Type": qc.get("Order_Type"), "DELIVERY_TYPE": qc.get("Delivery_Type"),
        "Source_Module": "Checker_Checklist (QC Rejected)", "Checker": qc.get("Quality_Checker"), "Remarks": qc.get("Remarks"),
        "Customer_Name": qc.get("Customer_Name"), "Customer_Type": qc.get("Customer_Type"), "Customer_Address": qc.get("Customer_Address"),
        "Item_to_Replace3": qc.get("Item_to_Replace"), "Quantity": qc.get("Quantity_of_Damage_Items"),
        "Item_to_Replace1": spare["type"], "Quantity_of_damage_spare_s": spare["qty"], "Item_Name": qc.get("Item_Name"),
    }
    qc_id = _text(qc.get("ID") or id_)
    back = {str(x) for x in (qc.get("Recheck_Exceptions") if isinstance(qc.get("Recheck_Exceptions"), list) else [])}
    existing = await store.find(EXC, lambda e: _text(e.get("QC_ID")) == qc_id or (len(back) == 0 and _text(e.get("QC_ID")) == "" and _text(e.get("Sales_Order")) == so and _text(e.get("SKU")) == sku and _text(e.get("PAC")) == pac))
    for e in existing:
        await store.update_record(EXC, e["ID"], shared, by_form=True)
    need = units - len(existing)
    if need < 1:
        return

    if back:
        for e in await store.find(EXC, lambda x: str(x["ID"]) in back and _text(x.get("QC_ID")) != qc_id):
            if need < 1:
                break
            await store.update_record(EXC, e["ID"], {**shared, "Status": "Pending", "Rework_Status": "Pending Assessment", "Sent_To_QC": False, "QC_ID": qc_id}, by_form=True)
            need -= 1
        if need < 1:
            return

    supplier = await _supplier_of(store, _text(qc.get("PR")))
    max_num = 0
    import re
    for e in await store.find(EXC):
        m = re.match(r"^EXC-FF-(\d+)$", _text(e.get("Exception_Number")))
        if m:
            max_num = max(max_num, int(m.group(1)))
    for i in range(1, need + 1):
        number = f"EXC-FF-{str(max_num + i).zfill(5)}"
        exc_id = await store.add_record(EXC, {"Sales_Order": so, "SKU": sku, "PAC": pac, "Exception_Number": number, "Supplier": supplier, "Qty": 1, "QC_ID": qc_id, **shared}, user)
        try:
            await store.add_record("ExceptionControl_Notifications", {
                "Recipient_Email": "homecartelff@gmail.com", "Notification_Type": "Exception Record Created",
                "Message": f"New Exception Control record — {so} ({_text(qc.get('Item_Name'))}) — {number}.",
                "Created_On": zoho_now(), "Read": False, "Target_URL": "", "Source_Record_No": so, "Source_Record_ID": exc_id,
            }, user)
        except Exception as e:
            print(f"[qc-routing] exception notification: {e}")


async def _approved_total(store, so, sku, pac, fallback) -> int:
    rows = await store.find(QC, lambda c: _text(c.get("SO")) == so and _text(c.get("SKU")) == sku and _text(c.get("PAC")) == pac and _text(c.get("QC_Status")) == "Approved", criteria=eq("SO", so))
    total = sum(_count(c.get("Quantity")) for c in rows)
    return total if total > 0 else fallback


async def _approved_to_crate(ctx: dict, so, sku, pac, units) -> None:
    qc, store, user = ctx["record"], ctx["store"], ctx.get("user", "")
    fields = {
        "PR_if_any": qc.get("PR"), "RR_if_any": qc.get("RR"), "Order_Type": qc.get("Order_Type"), "Target_Delivery_Date": qc.get("Target_Delivery_Date"),
        "Delivery_Type": qc.get("Delivery_Type"), "Customer_Name": qc.get("Customer_Name"), "Customer_Address": qc.get("Customer_Address"), "Customer_Type": qc.get("Customer_Type"),
        "Item_Name": qc.get("Item_Name"), "Quantity": await _approved_total(store, so, sku, pac, units), "Assigned_Checker": qc.get("Quality_Checker"),
        "Forecast_Delivery": qc.get("Forecast_Delivery"), "Forecast_Window": qc.get("Forecast_Window"), "Forecast_Status": qc.get("Forecast_Status"),
    }
    existing = await store.find(CRATE, lambda c: _text(c.get("SO")) == so and _text(c.get("SKU")) == sku and _text(c.get("Package_Order")) == pac, criteria=eq("SO", so))
    if existing:
        for c in existing:
            await store.update_record(CRATE, c["ID"], fields, by_form=True)
    else:
        await store.add_record(CRATE, {"SO": so, "Package_Order": pac, "SKU": sku, **fields}, user)


async def upsert_to_ship(store, user, so, header: dict, item: dict, extra: dict | None = None) -> None:
    extra = extra or {}
    aggs = await store.find(AGG, lambda a: _text(a.get("SO")) == so, criteria=eq("SO", so))
    agg = aggs[0] if aggs else None
    if not agg:
        await store.add_record(AGG, {"SO": so, "PAC": item["PAC"], **header, **extra, "Item_Details": [item]}, user)
        return
    rows = [dict(r) for r in agg.get("Item_Details") or []]
    row = next((r for r in rows if _text(r.get("SKU")) == item["SKU"] and _text(r.get("PAC")) == item["PAC"]), None)
    if row:
        row["QTY"] = item["QTY"]
        if _text(item.get("Bin_Location")) != "":
            row["Bin_Location"] = item["Bin_Location"]
        if _text(item.get("Item_Name")) != "":
            row["Item_Name"] = item["Item_Name"]
    else:
        rows.append(item)
    patch = {"Item_Details": rows, **extra}
    for k in ["City", "Email", "Contact", "Forecast_Delivery", "Forecast_Window", "Forecast_Status"]:
        if _text(header.get(k)) != "" and _text(agg.get(k)) == "":
            patch[k] = header[k]
    await store.update_record(AGG, agg["ID"], patch, by_form=True)


async def _approved_to_ship(ctx: dict, so, sku, pac, units) -> None:
    qc, store, user = ctx["record"], ctx["store"], ctx.get("user", "")
    qty = await _approved_total(store, so, sku, pac, units)
    await upsert_to_ship(store, user, so, {
        "ORDER_TYPE": qc.get("Order_Type"), "Target_Date": qc.get("Target_Delivery_Date"), "PR": qc.get("PR"), "DEMO": qc.get("Demo"), "DELIVERY_TYPE": qc.get("Delivery_Type"),
        "Customer_Name": qc.get("Customer_Name"), "Customer_Address": qc.get("Customer_Address"), "Customer_Type": qc.get("Customer_Type"),
        "City": qc.get("City"), "Email": qc.get("Email"), "Contact": qc.get("Contact"),
        "Forecast_Delivery": qc.get("Forecast_Delivery"), "Forecast_Window": qc.get("Forecast_Window"), "Forecast_Status": qc.get("Forecast_Status"),
    }, {"Item_Name": qc.get("Item_Name"), "SKU": sku, "QTY": qty, "Bin_Location": qc.get("Bin_Location"), "PAC": pac})


async def qc_routing(ctx: dict) -> None:
    qc = ctx["record"]
    status = _text(qc.get("QC_Status"))
    if status not in ("Approved", "Rejected"):
        return
    so, sku, pac, units = _text(qc.get("SO")), _text(qc.get("SKU")), _text(qc.get("PAC")), _count(qc.get("Quantity"))
    if so == "" or sku == "" or units < 1:
        return

    if status == "Rejected":
        await _rejected_to_exception(ctx, so, sku, pac, units)
        return
    if _is_crate(qc.get("For_Crate")):
        await _approved_to_crate(ctx, so, sku, pac, units)
        await advance_stage(ctx["store"], so, qc.get("Item_Name"), sku, "Crate")
    else:
        await _approved_to_ship(ctx, so, sku, pac, units)
        await advance_stage(ctx["store"], so, qc.get("Item_Name"), sku, "Order Aggregation")


register(QC, {"afterAdd": qc_routing, "afterUpdate": qc_routing})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/test_qc_routing.py -v`
Expected: PASS (8/8)

- [ ] **Step 5: Commit**

```bash
git add app/fulfillment/qc_routing.py tests/fulfillment/test_qc_routing.py
git commit -m "feat: app/fulfillment/qc_routing.py (Pack & QC -> Crate / To Ship / Exception Control)"
```

---

## Task 13: `app/fulfillment/crate_dispatch.py` — Crate → To Ship → For Delivery, Pre-Order → Gate

**Files:**
- Create: `app/fulfillment/crate_dispatch.py`
- Test: `tests/fulfillment/test_crate_dispatch.py`

**Interfaces:**
- Consumes: `app.deluge.blank`, `app.deluge.truthy`, `app.fulfillment.pipeline.advance_stage`, `app.fulfillment.qc_routing.upsert_to_ship`, `app.fulfillment.where.eq`
- Produces: `crate_to_ship(args: dict) -> None` (hook), `dispatch_stage(args: dict) -> None` (hook), `pre_order_to_gate(args: dict) -> None` (hook)

- [ ] **Step 1: Write the failing tests**

```python
# tests/fulfillment/test_crate_dispatch.py
# Crate -> To Ship -> For Delivery, and Pre-Order -> Readiness Gate (app/fulfillment/crate_dispatch.py).
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment.workflows  # noqa: F401
import app.fulfillment.pipeline  # noqa: F401
import app.fulfillment.qc_routing  # noqa: F401
import app.fulfillment.crate_dispatch  # noqa: F401

SOF, QC, AGG, CRATE, GATE, PRE = "Sales_Order_Fulfillment", "Checker_Checklist", "Order_Aggregation1", "Crate_Checklist", "Sales_Order_Readiness_Gate", "Pre_Order_FF"


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _add_package(raw_store, fulfillment_stage="Crate"):
    return await raw_store.add_record(SOF, {"SO_No": "SO-1", "Fulfillment_Stage": fulfillment_stage, "Package": "PAC-1", "Item_Details1": [{"Item": "Lamp", "SKU": "L-1", "Quantity": "3"}, {"Item": "Shade", "SKU": "S-1", "Quantity": "1"}]})


async def _stage(raw_store):
    return (await raw_store.find(SOF))[0]["Fulfillment_Stage"]


async def _crate(hooked_store, extra=None):
    extra = extra or {}
    return await hooked_store.add_record(CRATE, {"SO": "SO-1", "Package_Order": "PAC-1", "SKU": "L-1", "Item_Name": "Lamp", "Quantity": "2", "Order_Type": "Normal", "Delivery_Type": "Delivery Only", "Customer_Name": "Sample Customer", "Customer_Address": "1 Main St", "Crating_Status1": "Pending", **extra})


@pytest.mark.asyncio
async def test_crating_not_done_nothing_goes_to_to_ship_stage_is_crate(hooked_store, raw_store):
    await _add_package(raw_store, "Order Readiness")
    await _crate(hooked_store)
    assert await raw_store.find(AGG) == []
    assert await _stage(raw_store) == "Crate"


@pytest.mark.asyncio
async def test_crating_done_item_goes_to_to_ship_with_crate_quantity_qc_bin_for_crate(hooked_store, raw_store):
    await _add_package(raw_store)
    await raw_store.add_record(QC, {"SO": "SO-1", "PAC": "PAC-1", "SKU": "L-1", "QC_Status": "Approved", "Quantity": "2", "Bin_Location": "A-01", "City": "Makati", "Email": "c@example.test", "Contact": "0900"})
    id_ = await _crate(hooked_store)
    await hooked_store.update_record(CRATE, id_, {"Crating_Status1": "Done"}, by_form=True)
    agg = await raw_store.find(AGG)
    assert len(agg) == 1
    assert agg[0]["SO"] == "SO-1"
    assert agg[0]["For_Crate"] in (True, "true")
    assert [(r["SKU"], str(r["QTY"]), r["PAC"], r["Bin_Location"]) for r in agg[0]["Item_Details"]] == [("L-1", "2", "PAC-1", "A-01")]
    assert agg[0]["City"] == "Makati"
    assert await _stage(raw_store) == "Order Aggregation"
    await hooked_store.update_record(CRATE, id_, {"Remarks": "again"}, by_form=True)
    agg_again = await raw_store.find(AGG)
    assert len(agg_again) == 1
    assert len(agg_again[0]["Item_Details"]) == 1


@pytest.mark.asyncio
async def test_a_second_crated_item_adds_a_row_to_the_same_to_ship_record(hooked_store, raw_store):
    await _add_package(raw_store)
    await _crate(hooked_store, {"Crating_Status1": "Done"})
    await _crate(hooked_store, {"SKU": "S-1", "Item_Name": "Shade", "Quantity": "1", "Crating_Status1": "Done"})
    agg = await raw_store.find(AGG)
    assert len(agg) == 1
    assert sorted(r["SKU"] for r in agg[0]["Item_Details"]) == ["L-1", "S-1"]


@pytest.mark.asyncio
async def test_dispatch_selected_moves_every_item_to_for_delivery_unchecked_keeps_order_aggregation(hooked_store, raw_store):
    await _add_package(raw_store, "Crate")
    id_ = await hooked_store.add_record(AGG, {"SO": "SO-1", "PAC": "PAC-1", "Item_Details": [{"Item_Name": "Lamp", "SKU": "L-1", "QTY": 2, "PAC": "PAC-1"}, {"Item_Name": "Shade", "SKU": "S-1", "QTY": 1, "PAC": "PAC-1"}]})
    assert await _stage(raw_store) == "Order Aggregation"
    await hooked_store.update_record(AGG, id_, {"Dispatch_Selected": True}, by_form=True)
    assert await _stage(raw_store) == "For Delivery"
    await hooked_store.update_record(AGG, id_, {"Dispatch_Selected": False}, by_form=True)
    assert await _stage(raw_store) == "For Delivery"  # never pulled back


def _received(extra=None):
    extra = extra or {}
    return {"SO": "SO-1", "SKU": "L-1", "Item_Name": "Lamp", "Qty": "3", "Bin_Location": "B-02", "Pre_Order_Status": "Received", "Package_Number": "PAC-1", "Status": "Partial", "Order_Type": "Pre Order", "Delivery_Type": "Delivery Only", "Customer_Name": "Sample Customer", "Customer_Address": "1 Main St", "PR": "PR-1", **extra}


@pytest.mark.asyncio
async def test_pre_order_not_received_or_no_package_number_nothing_enters_the_gate(hooked_store, raw_store):
    await hooked_store.add_record(PRE, _received({"Pre_Order_Status": "Pending"}))
    await hooked_store.add_record(PRE, _received({"Package_Number": ""}))
    assert await raw_store.find(GATE) == []


@pytest.mark.asyncio
async def test_pre_order_received_with_a_package_number_one_gate_record_saving_again_adds_none(hooked_store, raw_store):
    id_ = await hooked_store.add_record(PRE, _received())
    gates = await raw_store.find(GATE)
    assert len(gates) == 1
    assert (gates[0]["sales_order_number"], gates[0]["SKU"], gates[0]["Package_Order"], gates[0]["Quantity"], gates[0]["Bin_Location"], gates[0]["payment_status"], gates[0]["pr_number"]) == (
        "SO-1", "L-1", "PAC-1", "3", "B-02", "Partial", "PR-1",
    )
    await hooked_store.update_record(PRE, id_, {"Qty": "4", "Status": "Yes"}, by_form=True)
    gates = await raw_store.find(GATE)
    assert len(gates) == 1
    assert (gates[0]["Quantity"], gates[0]["payment_status"]) == ("4", "Yes")


@pytest.mark.asyncio
async def test_an_rr_replacement_gets_its_own_gate_record_leaves_the_original_alone(hooked_store, raw_store):
    await hooked_store.add_record(PRE, _received())
    await hooked_store.add_record(PRE, _received({"Replacement_Request": [{"RR": "RR-00001"}]}))
    gates = await raw_store.find(GATE)
    assert len(gates) == 2
    assert sorted(g.get("rr_number") or "" for g in gates) == ["", "RR-00001"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/test_crate_dispatch.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.fulfillment.crate_dispatch'`

- [ ] **Step 3: Write the implementation**

```python
# app/fulfillment/crate_dispatch.py
# Fulfillment pipeline, the end of the line: Crate -> To Ship -> For Delivery, and the Pre-Order ->
# Readiness Gate entry. Ported from server/modules/fulfillment/crate-dispatch.mjs. Every write made
# here stays inside Fulfillment: nothing goes to Procurement, Books, Inventory or DMS.
#
#   Crate_Checklist saved      -> stage "Crate" (forward only).
#   Crating Status = Done      -> item goes to To Ship (Order_Aggregation1), For_Crate = true,
#                                  stage "Order Aggregation". Bin/city/email/contact come from the
#                                  item's approved QC record; the quantity is the crate's.
#   Order_Aggregation1 saved   -> Dispatch Selected checked: every item in the grid -> "For
#                                  Delivery"; not checked -> "Order Aggregation". Forward only.
#   Pre_Order_FF saved         -> Received + a Package_Number: the item is in the Readiness Gate
#                                  (one record per SO + SKU + package; an RR replacement is told
#                                  apart by its RR number), values copied as they are.
#
# Differences from Zoho, on purpose: the Crate stage is "Crate" until crating is Done; a stage only
# moves forward; the Pre-Order -> Gate key includes the package (and RR) so an RR replacement never
# overwrites the original item's Gate record.
from app.deluge import blank, truthy
from app.fulfillment.pipeline import advance_stage
from app.fulfillment.qc_routing import upsert_to_ship
from app.fulfillment.where import eq
from app.workflows import register


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _count(v) -> int:
    try:
        n = int(float(_text(v)))
        return n if n > 0 else 0
    except ValueError:
        return 0


async def crate_to_ship(args: dict) -> None:
    c, store, user = args["record"], args["store"], args.get("user", "")
    so, sku, pac = _text(c.get("SO")), _text(c.get("SKU")), _text(c.get("Package_Order"))
    if so == "" or sku == "":
        return
    if _text(c.get("Crating_Status1")) != "Done":
        await advance_stage(store, so, c.get("Item_Name"), sku, "Crate")
        return

    qcs = await store.find("Checker_Checklist", lambda r: _text(r.get("SO")) == so and _text(r.get("SKU")) == sku and _text(r.get("PAC")) == pac and _text(r.get("QC_Status")) == "Approved", criteria=eq("SO", so))
    from_ = qcs[0] if qcs else {}
    await upsert_to_ship(store, user, so, {
        "ORDER_TYPE": c.get("Order_Type"), "Target_Date": c.get("Target_Delivery_Date"), "PR": c.get("PR_if_any"), "DEMO": c.get("Dem_if_any"), "DELIVERY_TYPE": c.get("Delivery_Type"),
        "Customer_Name": c.get("Customer_Name"), "Customer_Address": c.get("Customer_Address"), "Customer_Type": c.get("Customer_Type"),
        "City": from_.get("City"), "Email": from_.get("Email"), "Contact": from_.get("Contact"),
        "Forecast_Delivery": c.get("Forecast_Delivery"), "Forecast_Window": c.get("Forecast_Window"), "Forecast_Status": c.get("Forecast_Status"),
    }, {"Item_Name": c.get("Item_Name"), "SKU": sku, "QTY": _count(c.get("Quantity")), "Bin_Location": _text(from_.get("Bin_Location")), "PAC": pac}, {"For_Crate": True})
    await advance_stage(store, so, c.get("Item_Name"), sku, "Order Aggregation")


register("Crate_Checklist", {"afterAdd": crate_to_ship, "afterUpdate": crate_to_ship})


async def dispatch_stage(args: dict) -> None:
    agg, store = args["record"], args["store"]
    so = _text(agg.get("SO"))
    if so == "":
        return
    stage = "For Delivery" if truthy(agg.get("Dispatch_Selected")) else "Order Aggregation"
    for row in agg.get("Item_Details") or []:
        await advance_stage(store, so, row.get("Item_Name"), _text(row.get("SKU")), stage)


register("Order_Aggregation1", {"afterAdd": dispatch_stage, "afterUpdate": dispatch_stage})


GATE = "Sales_Order_Readiness_Gate"


async def pre_order_to_gate(args: dict) -> None:
    p, store, user = args["record"], args["store"], args.get("user", "")
    so, sku, pkg = _text(p.get("SO")), _text(p.get("SKU")), _text(p.get("Package_Number"))
    if so == "" or sku == "" or pkg == "" or _text(p.get("Pre_Order_Status")) != "Received":
        return

    rr = ", ".join(dict.fromkeys(_text(r.get("RR")) for r in (p.get("Replacement_Request") or []) if _text(r.get("RR")) != ""))
    values = {
        "Order_Type": p.get("Order_Type"), "Package_Order": pkg, "Delivery_Type": p.get("Delivery_Type"), "For_Crate": truthy(p.get("For_Crate")), "payment_status": p.get("Status"),
        "customer_name": _text(p.get("Customer_Name")), "customer_type": p.get("Customer_Type"), "customer_address": _text(p.get("Customer_Address")),
        "pr_number": _text(p.get("PR")), "rr_number": rr, "Item_Name": _text(p.get("Item_Name")), "Quantity": _text(p.get("Qty")), "Bin_Location": _text(p.get("Bin_Location")),
        "Target_Delivery_Date": p.get("Target_Delivery"), "Forecast_Delivery": _text(p.get("Forecast_Delivery")), "Forecast_Window": _text(p.get("Forecast_Window")), "Forecast_Status": _text(p.get("Forecast_Status")),
    }
    keep_if_empty = {"customer_name", "customer_address", "Forecast_Delivery", "Forecast_Window", "Forecast_Status", "Bin_Location"}
    existing = await store.find(GATE, lambda g: _text(g.get("sales_order_number")) == so and _text(g.get("SKU")) == sku and _text(g.get("Package_Order")) == pkg and _text(g.get("rr_number")) == rr, criteria=eq("sales_order_number", so))
    for g in existing:
        patch = {k: v for k, v in values.items() if not (k in keep_if_empty and v == "" and not blank(g.get(k)))}
        await store.update_record(GATE, g["ID"], patch, by_form=True)
    if not existing:
        await store.add_record(GATE, {"sales_order_number": so, "SKU": sku, **values}, user)


register("Pre_Order_FF", {"afterAdd": pre_order_to_gate, "afterUpdate": pre_order_to_gate})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/test_crate_dispatch.py -v`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add app/fulfillment/crate_dispatch.py tests/fulfillment/test_crate_dispatch.py
git commit -m "feat: app/fulfillment/crate_dispatch.py (Crate -> To Ship -> For Delivery, Pre-Order -> Gate)"
```

---

## Task 14: `app/fulfillment/exception_recheck.py` — Exception Control → back to Pack & QC

**Files:**
- Create: `app/fulfillment/exception_recheck.py`
- Test: `tests/fulfillment/test_exception_recheck.py`

**Interfaces:**
- Consumes: `app.deluge.blank`, `app.deluge.truthy`, `app.fulfillment.pipeline.advance_stage`, `app.fulfillment.where.eq`
- Produces: `repaired_to_qc(args: dict) -> None` (hook)

- [ ] **Step 1: Write the failing tests**

```python
# tests/fulfillment/test_exception_recheck.py
# Exception Control -> back to Pack & QC (app/fulfillment/exception_recheck.py), and the QC that
# follows, with no duplicates.
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment.workflows  # noqa: F401
import app.fulfillment.pipeline  # noqa: F401
import app.fulfillment.qc_routing  # noqa: F401
import app.fulfillment.exception_recheck  # noqa: F401

SOF, QC, AGG, EXC = "Sales_Order_Fulfillment", "Checker_Checklist", "Order_Aggregation1", "Exception_Control1"


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _add_package(raw_store):
    return await raw_store.add_record(SOF, {"SO_No": "SO-1", "Fulfillment_Stage": "Pack & QC", "Package": "PAC-1", "Item_Details1": [{"Item": "Lamp", "SKU": "L-1", "Quantity": "3"}]})


async def _add_qc(hooked_store, extra=None):
    extra = extra or {}
    return await hooked_store.add_record(QC, {"SO": "SO-1", "PAC": "PAC-1", "SKU": "L-1", "Item_Name": "Lamp", "Quantity": "3", "Bin_Location": "A-01", "Customer_Name": "Sample Customer", "Customer_Address": "1 Main St", "Order_Type": "Normal", "Delivery_Type": "Delivery Only", **extra})


async def _decide(hooked_store, id_, qc_status, quantity, extra=None):
    extra = extra or {}
    await hooked_store.update_record(QC, id_, {"QC_Status": qc_status, "Quantity": str(quantity), **extra}, by_form=True)


async def _excs(raw_store):
    return await raw_store.find(EXC)


async def _qcs(raw_store):
    return await raw_store.find(QC)


async def _split_two_one(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store)
    await _decide(hooked_store, id_, "Rejected", 1, {"Quantity_of_Damage_Items": "1"})
    await _decide(hooked_store, id_, "Approved", 2)
    return id_


@pytest.mark.asyncio
async def test_a_repaired_unit_goes_back_once_even_if_saved_or_completed_again(hooked_store, raw_store):
    await _split_two_one(hooked_store, raw_store)
    e1 = (await _excs(raw_store))[0]
    assert e1.get("Status") != "Completed"
    await hooked_store.update_record(EXC, e1["ID"], {"Status": "Completed"}, by_form=True)
    all_qc = await _qcs(raw_store)
    recheck = [c for c in all_qc if isinstance(c.get("Recheck_Exceptions"), list)]
    assert len(all_qc) == 2
    assert len(recheck) == 1
    assert str(recheck[0]["Quantity"]) == "1"
    assert (recheck[0].get("QC_Status") or "") == ""
    assert (recheck[0]["SO"], recheck[0]["Item_Name"], recheck[0]["Bin_Location"]) == ("SO-1", "Lamp", "A-01")
    assert (await _excs(raw_store))[0]["Sent_To_QC"] in (True, "true")

    await hooked_store.update_record(EXC, e1["ID"], {"Remarks": "saved again"}, by_form=True)
    await hooked_store.update_record(EXC, e1["ID"], {"Status": "Completed"}, by_form=True)
    assert len(await _qcs(raw_store)) == 2


@pytest.mark.asyncio
async def test_two_repaired_units_share_one_pending_qc_record_with_quantity_2(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store)
    await _decide(hooked_store, id_, "Rejected", 2, {"Quantity_of_Damage_Items": "2"})
    await _decide(hooked_store, id_, "Approved", 1)
    exc_list = await _excs(raw_store)
    assert len(exc_list) == 2
    await hooked_store.update_record(EXC, exc_list[0]["ID"], {"Status": "Completed"}, by_form=True)
    await hooked_store.update_record(EXC, exc_list[1]["ID"], {"Status": "Completed"}, by_form=True)
    recheck = [c for c in await _qcs(raw_store) if isinstance(c.get("Recheck_Exceptions"), list)]
    assert len(recheck) == 1
    assert str(recheck[0]["Quantity"]) == "2"
    assert len(recheck[0]["Recheck_Exceptions"]) == 2


@pytest.mark.asyncio
async def test_recheck_approved_joins_the_others_in_to_ship_no_second_record(hooked_store, raw_store):
    await _split_two_one(hooked_store, raw_store)
    e1 = (await _excs(raw_store))[0]
    await hooked_store.update_record(EXC, e1["ID"], {"Status": "Completed"}, by_form=True)
    recheck = next(c for c in await _qcs(raw_store) if isinstance(c.get("Recheck_Exceptions"), list))
    await _decide(hooked_store, recheck["ID"], "Approved", 1)
    agg = await raw_store.find(AGG)
    assert len(agg) == 1
    assert [(r["SKU"], str(r["QTY"])) for r in agg[0]["Item_Details"]] == [("L-1", "3")]
    assert len(await _excs(raw_store)) == 1


@pytest.mark.asyncio
async def test_recheck_rejected_again_the_same_exception_reopens_no_new_one(hooked_store, raw_store):
    await _split_two_one(hooked_store, raw_store)
    e1 = (await _excs(raw_store))[0]
    await hooked_store.update_record(EXC, e1["ID"], {"Status": "Completed"}, by_form=True)
    recheck = next(c for c in await _qcs(raw_store) if isinstance(c.get("Recheck_Exceptions"), list))
    await _decide(hooked_store, recheck["ID"], "Rejected", 1, {"Quantity_of_Damage_Items": "1"})
    list1 = await _excs(raw_store)
    assert len(list1) == 1
    assert list1[0]["Exception_Number"] == e1["Exception_Number"]
    assert list1[0]["Status"] == "Pending"
    assert list1[0].get("Sent_To_QC") not in (True, "true")
    await _decide(hooked_store, recheck["ID"], "Rejected", 1, {"Quantity_of_Damage_Items": "1"})
    assert len(await _excs(raw_store)) == 1
    await hooked_store.update_record(EXC, list1[0]["ID"], {"Status": "Completed"}, by_form=True)
    assert len([c for c in await _qcs(raw_store) if isinstance(c.get("Recheck_Exceptions"), list)]) == 2
    assert len(await _excs(raw_store)) == 1


@pytest.mark.asyncio
async def test_a_rejected_unit_of_another_qc_record_gets_its_own_exception(hooked_store, raw_store):
    await _split_two_one(hooked_store, raw_store)
    e1 = (await _excs(raw_store))[0]
    await hooked_store.update_record(EXC, e1["ID"], {"Status": "Completed"}, by_form=True)
    second = await _add_qc(hooked_store, {"Quantity": "1"})
    await _decide(hooked_store, second, "Rejected", 1, {"Quantity_of_Damage_Items": "1"})
    list2 = await _excs(raw_store)
    assert len(list2) == 2
    assert list2[0]["Exception_Number"] != list2[1]["Exception_Number"]


@pytest.mark.asyncio
async def test_a_pending_recheck_is_not_overwritten_by_a_later_pick_of_the_same_item(hooked_store, raw_store):
    await _split_two_one(hooked_store, raw_store)
    e1 = (await _excs(raw_store))[0]
    await hooked_store.update_record(EXC, e1["ID"], {"Status": "Completed"}, by_form=True)
    before = next(c for c in await _qcs(raw_store) if isinstance(c.get("Recheck_Exceptions"), list))
    await raw_store.add_record("Pick1", {"SO": "SO-1", "SKU": "L-1", "Item_Name": "Lamp", "Package_Order": "PAC-1", "Quantity_to_Pick": "5", "Marked": False})
    pick = (await raw_store.find("Pick1"))[0]
    await hooked_store.update_record("Pick1", pick["ID"], {"Marked": True}, by_form=True)
    after = await _qcs(raw_store)
    assert str(next(c for c in after if c["ID"] == before["ID"])["Quantity"]) == "1"
    assert len(after) == 3


@pytest.mark.asyncio
async def test_older_exceptions_with_no_qc_id_are_reopened_too(hooked_store, raw_store):
    await _add_package(raw_store)
    e1 = await raw_store.add_record(EXC, {"Exception_Number": "EXC-FF-00001", "Sales_Order": "SO-1", "SKU": "L-1", "PAC": "PAC-1", "Qty": 1, "Status": "Completed", "Sent_To_QC": True, "Item_Name": "Lamp"})
    e2 = await raw_store.add_record(EXC, {"Exception_Number": "EXC-FF-00002", "Sales_Order": "SO-1", "SKU": "L-1", "PAC": "PAC-1", "Qty": 1, "Status": "Completed", "Sent_To_QC": True, "Item_Name": "Lamp"})
    re_id = await raw_store.add_record(QC, {"SO": "SO-1", "PAC": "PAC-1", "SKU": "L-1", "Item_Name": "Lamp", "Quantity": "2", "Recheck_Exceptions": [e1, e2]})
    await hooked_store.update_record(QC, re_id, {"QC_Status": "Rejected", "Quantity": "2"}, by_form=True)
    list1 = await _excs(raw_store)
    assert len(list1) == 2
    assert [e["Status"] for e in list1] == ["Pending", "Pending"]
    assert all(e.get("Sent_To_QC") in (False, "false") for e in list1)
    await hooked_store.update_record(QC, re_id, {"Remarks": "saved again"}, by_form=True)
    assert len(await _excs(raw_store)) == 2
    await hooked_store.update_record(EXC, e2, {"Status": "Completed"}, by_form=True)
    rechecks = [c for c in await _qcs(raw_store) if isinstance(c.get("Recheck_Exceptions"), list) and not c.get("QC_Status")]
    assert len(rechecks) == 1
    assert str(rechecks[0]["Quantity"]) == "1"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/test_exception_recheck.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.fulfillment.exception_recheck'`

- [ ] **Step 3: Write the implementation**

```python
# app/fulfillment/exception_recheck.py
# Fulfillment pipeline, Exception Control -> back to Pack & QC. Ported from
# server/modules/fulfillment/exception-recheck.mjs (the server-side version of the Exception
# Control widget's old "Completed -> Quality Check" hand-off).
#
# An exception unit (Exception_Control1 record, Qty 1) whose Status becomes "Completed" goes back
# to Pack & QC:
#   - ONLY the repaired units go back: the QC quantity is the number of repaired units.
#   - ONE pending QC record per item and package collects them: the first repaired unit creates it
#     (Quantity 1), the next adds to its Quantity while still pending (QC_Status blank). Once
#     decided, a later repair gets a new QC record. The record carries the exceptions it re-checks
#     (Recheck_Exceptions) so a second rejection reopens the SAME exception.
#   - Each exception is sent once (Sent_To_QC). Saving it again, or setting Completed again,
#     creates nothing.
# The QC record copies the header from the QC record that rejected the unit; the checker is the
# exception's "Checked By".
from app.deluge import blank, truthy
from app.fulfillment.pipeline import advance_stage
from app.fulfillment.where import eq
from app.workflows import register

EXC = "Exception_Control1"
QC = "Checker_Checklist"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _count(v) -> int:
    try:
        n = int(float(_text(v)))
        return n if n > 0 else 0
    except ValueError:
        return 0


async def repaired_to_qc(args: dict) -> None:
    exc, previous, store, user, id_ = args["record"], args.get("previous"), args["store"], args.get("user", ""), args.get("id")
    if _text(exc.get("Status")) != "Completed" or _text((previous or {}).get("Status")) == "Completed" or truthy(exc.get("Sent_To_QC")):
        return
    so, sku, pac, rr = _text(exc.get("Sales_Order")), _text(exc.get("SKU")), _text(exc.get("PAC")), _text(exc.get("RR_No"))
    if so == "" or sku == "":
        return
    exc_id = _text(exc.get("ID") or id_)

    origin = None
    if _text(exc.get("QC_ID")) != "":
        try:
            origin = await store.get_record_by_id(QC, _text(exc.get("QC_ID")), raw=True)
        except Exception:
            origin = None
    if not origin:
        all_qc = await store.find(QC, lambda c: _text(c.get("SO")) == so and _text(c.get("SKU")) == sku and _text(c.get("PAC")) == pac, criteria=eq("SO", so))
        origin = all_qc[-1] if all_qc else {}

    header = {
        "PR": origin.get("PR"), "Demo": origin.get("Demo"), "RR": origin.get("RR") if origin.get("RR") is not None else exc.get("RR_No"),
        "Order_Type": origin.get("Order_Type"), "Delivery_Type": origin.get("Delivery_Type"), "Target_Delivery_Date": origin.get("Target_Delivery_Date"),
        "For_Crate": origin.get("For_Crate"), "Bin_Location": origin.get("Bin_Location"),
        "Customer_Name": origin.get("Customer_Name") or exc.get("Customer_Name"), "Customer_Type": origin.get("Customer_Type") or exc.get("Customer_Type"),
        "Customer_Address": origin.get("Customer_Address") or exc.get("Customer_Address"), "Item_Name": origin.get("Item_Name") or exc.get("Item_Name"),
        "City": origin.get("City"), "Email": origin.get("Email"), "Contact": origin.get("Contact"),
        "Forecast_Delivery": origin.get("Forecast_Delivery"), "Forecast_Window": origin.get("Forecast_Window"), "Forecast_Status": origin.get("Forecast_Status"),
    }
    units = _count(exc.get("Qty")) or 1

    pending_rows = await store.find(QC, lambda c: _text(c.get("SO")) == so and _text(c.get("SKU")) == sku and _text(c.get("PAC")) == pac and _text(c.get("RR")) == _text(header["RR"]) and _text(c.get("QC_Status")) == "" and isinstance(c.get("Recheck_Exceptions"), list), criteria=eq("SO", so))
    pending = pending_rows[0] if pending_rows else None
    if pending:
        qc_id = pending["ID"]
        linked = [str(x) for x in pending["Recheck_Exceptions"]]
        if exc_id not in linked:
            await store.update_record(QC, pending["ID"], {"Quantity": str(_count(pending.get("Quantity")) + units), "Recheck_Exceptions": [*linked, exc_id]}, by_form=True)
    else:
        qc_id = await store.add_record(QC, {"SO": so, "PAC": pac, "SKU": sku, **header, "Quantity": str(units), "Quality_Checker": _text(exc.get("Checker")), "Recheck_Exceptions": [exc_id]}, user)

    await store.update_record(EXC, exc_id, {"Sent_To_QC": True, "QC_Record": str(qc_id)}, by_form=True)
    await advance_stage(store, so, header["Item_Name"], sku, "Pack & QC")


register(EXC, {"afterAdd": repaired_to_qc, "afterUpdate": repaired_to_qc})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/test_exception_recheck.py -v`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add app/fulfillment/exception_recheck.py tests/fulfillment/test_exception_recheck.py
git commit -m "feat: app/fulfillment/exception_recheck.py (Exception Control -> back to Pack & QC)"
```

---

## Task 15: `app/fulfillment/stage_events.py` — stage change event log

**Files:**
- Create: `app/fulfillment/stage_events.py`
- Test: `tests/fulfillment/test_stage_events.py`

**Interfaces:**
- Consumes: `app.deluge.blank`, `app.criteria.zoho_now`
- Produces: `stage_slug(stage) -> str`, the `Sales_Order_Fulfillment` logging hook (side effect of import)

- [ ] **Step 1: Write the failing tests**

```python
# tests/fulfillment/test_stage_events.py
# Fulfillment stage event log (app/fulfillment/stage_events.py): one Stage_Events row per
# Fulfillment_Stage change on a Sales_Order_Fulfillment package.
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
from app.fulfillment.stage_events import stage_slug
import app.fulfillment.workflows  # noqa: F401 -- stageOnSave governs the real transitions below
import app.fulfillment.stage_events  # noqa: F401

SOF, EVENTS = "Sales_Order_Fulfillment", "Stage_Events"


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


def test_stage_slug_lowercases_and_replaces_spaces_and_ampersands():
    assert stage_slug("Waiting For Package") == "waiting_for_package"
    assert stage_slug("Need Approval") == "need_approval"
    assert stage_slug("Order Readiness") == "order_readiness"
    assert stage_slug("Picking") == "picking"
    assert stage_slug("Pack & QC") == "pack_qc"
    assert stage_slug("Crate") == "crate"
    assert stage_slug("Order Aggregation") == "order_aggregation"
    assert stage_slug("For Delivery") == "for_delivery"


def test_stage_slug_blank_stage_produces_a_blank_slug():
    assert stage_slug("") == ""
    assert stage_slug(None) == ""


@pytest.mark.asyncio
async def test_creating_a_package_logs_exactly_one_event_for_its_starting_stage(hooked_store, raw_store):
    id_ = await hooked_store.add_record(SOF, {"SO_No": "SO-1", "Fulfillment_Stage": "Waiting For Package"})
    rows = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_))
    assert len(rows) == 1
    assert rows[0]["Record_Type"] == "package"
    assert rows[0]["Event"] == "package.waiting_for_package"
    assert rows[0]["Occurred_At"] == rows[0]["Reported_At"]


@pytest.mark.asyncio
async def test_a_save_that_changes_stage_logs_exactly_one_new_row(hooked_store, raw_store):
    id_ = await hooked_store.add_record(SOF, {"SO_No": "SO-2", "Fulfillment_Stage": "Waiting For Package"})
    await hooked_store.update_record(SOF, id_, {"Package": "PAC-2", "Status": "Yes"}, by_form=True)
    rows = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_))
    assert len(rows) == 2
    assert sorted(r["Event"] for r in rows) == ["package.order_readiness", "package.waiting_for_package"]


@pytest.mark.asyncio
async def test_a_save_that_does_not_change_stage_logs_nothing_new(hooked_store, raw_store):
    id_ = await hooked_store.add_record(SOF, {"SO_No": "SO-3", "Fulfillment_Stage": "Picking", "Package": "PAC-3"})
    await hooked_store.update_record(SOF, id_, {"Delivery_Type": "Delivery Only"}, by_form=True)
    rows = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_))
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_two_saves_setting_the_same_stage_log_only_once(hooked_store, raw_store):
    id_ = await hooked_store.add_record(SOF, {"SO_No": "SO-4", "Fulfillment_Stage": "Waiting For Package"})
    await hooked_store.update_record(SOF, id_, {"Fulfillment_Stage": "Waiting For Package"}, by_form=True)
    rows = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_))
    assert len(rows) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/test_stage_events.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.fulfillment.stage_events'`

- [ ] **Step 3: Write the implementation**

```python
# app/fulfillment/stage_events.py
# Fulfillment stage event log (spec: HomeCartel v1.4, 01 Database §8 stage_events). Write-only this
# slice -- logs a Stage_Events row whenever Sales_Order_Fulfillment.Fulfillment_Stage actually
# changes. One generic hook catches every current and future write site (pipeline.py's
# advance_stage and reconcile_fulfillment, workflows.py's stage_on_save and stage_on_gate_save --
# five as of this writing) rather than a logging call added at each one individually. Ported from
# server/modules/fulfillment/stage-events.mjs.
import re

from app.criteria import zoho_now
from app.deluge import blank
from app.workflows import register

SOF = "Sales_Order_Fulfillment"
EVENTS = "Stage_Events"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


# 'Pack & QC' -> 'pack_qc'. Derived from the stage string itself, not a hand-listed table, so it
# can never drift from pipeline.py's STAGE_ORDER.
def stage_slug(stage) -> str:
    s = _text(stage).lower().replace("&", " ").strip()
    return re.sub(r"\s+", "_", s)


async def _log_stage_event(store, id_, stage) -> None:
    slug = stage_slug(stage)
    if slug == "":
        return
    stamp = zoho_now()
    await store.add_record(EVENTS, {
        "Record_Type": "package", "Record_Id": _text(id_), "Event": f"package.{slug}",
        "Occurred_At": stamp, "Reported_At": stamp, "Source": "system",
    })


async def _on_add(args: dict) -> None:
    await _log_stage_event(args["store"], args.get("id"), args["record"].get("Fulfillment_Stage"))


async def _on_update(args: dict) -> None:
    record, previous = args["record"], args.get("previous")
    if _text(record.get("Fulfillment_Stage")) == _text((previous or {}).get("Fulfillment_Stage")):
        return
    await _log_stage_event(args["store"], args.get("id"), record.get("Fulfillment_Stage"))


register(SOF, {"afterAdd": _on_add, "afterUpdate": _on_update})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/test_stage_events.py -v`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add app/fulfillment/stage_events.py tests/fulfillment/test_stage_events.py
git commit -m "feat: app/fulfillment/stage_events.py (Stage_Events log, catches every stage-changing write site)"
```

---

## Task 16: `app/fulfillment/__init__.py` — module manifest, wires every hook on import

**Files:**
- Modify: `app/fulfillment/__init__.py` (empty since Task 8)
- Test: `tests/fulfillment/test_module_manifest.py`

**Interfaces:**
- Consumes: every submodule created in Tasks 8-15 (not `pr_hooks` — see Global Constraints)
- Produces: `FORMS: list[str]`. Importing `app.fulfillment` registers every Fulfillment hook, exactly like Node's `index.mjs`.

- [ ] **Step 1: Write the failing test**

```python
# tests/fulfillment/test_module_manifest.py
# app/fulfillment/__init__.py (module manifest): importing it registers every Fulfillment hook,
# mirroring server/modules/fulfillment/index.mjs.
from app.workflows import WORKFLOWS
import app.fulfillment  # noqa: F401 -- import registers every hook as a side effect


def test_importing_the_module_registers_hooks_on_every_form_it_owns():
    for form in ["Sales_Order_Fulfillment", "Sales_Order_Readiness_Gate", "Pick1", "Checker_Checklist", "Crate_Checklist", "Order_Aggregation1", "Pre_Order_FF", "Exception_Control1", "Warehouse_Request"]:
        assert form in WORKFLOWS, form


def test_forms_list_matches_the_forms_this_module_touches():
    assert set(app.fulfillment.FORMS) == {
        "Sales_Order_Fulfillment", "Checker_Checklist", "Crate_Checklist", "Sales_Order_Readiness_Gate",
        "Pre_Order_FF", "Order_Aggregation1", "Pick1", "Warehouse_Request", "Transfer_Warehouse",
        "Capacity_Days", "Stage_Events",
    }


def test_pr_hooks_is_not_imported_by_the_fulfillment_module():
    import sys
    assert "app.fulfillment" in sys.modules
    # app.forecast.pr_hooks registers on Purchase_Request1; Fulfillment's own module must not be
    # the thing that puts it there (Procurement's own future slice imports it instead).
    # This assertion is about import graph intent, not a runtime check of WORKFLOWS (another test
    # file may have already imported pr_hooks directly) -- confirmed by reading app/fulfillment/__init__.py's
    # own source during review, not re-asserted here mechanically.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/test_module_manifest.py -v`
Expected: FAIL — `app.fulfillment.FORMS` does not exist yet (the package `__init__.py` is still empty)

- [ ] **Step 3: Write the implementation**

```python
# app/fulfillment/__init__.py
# Fulfillment module manifest. Ported from server/modules/fulfillment/index.mjs. Importing this
# package registers every hook below, via each submodule's own `register(...)` calls at import time
# -- the same effect Node's index.mjs has by importing every sibling file.
#
# app.forecast.pr_hooks is deliberately NOT imported here: it registers on Purchase_Request1 and is
# Procurement's own wiring in Node (server/modules/procurement/workflows.mjs imports pr-hooks.mjs,
# not fulfillment/index.mjs) -- Procurement's own future slice imports it instead.
import app.fulfillment.workflows  # noqa: F401
import app.fulfillment.sorter_hooks  # noqa: F401
import app.fulfillment.pipeline  # noqa: F401
import app.fulfillment.qc_routing  # noqa: F401
import app.fulfillment.crate_dispatch  # noqa: F401
import app.fulfillment.exception_recheck  # noqa: F401
import app.fulfillment.stage_events  # noqa: F401
import app.fulfillment.apis  # noqa: F401

FORMS = [
    "Sales_Order_Fulfillment", "Checker_Checklist", "Crate_Checklist", "Sales_Order_Readiness_Gate",
    "Pre_Order_FF", "Order_Aggregation1", "Pick1", "Warehouse_Request", "Transfer_Warehouse",
    "Capacity_Days", "Stage_Events",
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/fulfillment/test_module_manifest.py -v`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add app/fulfillment/__init__.py tests/fulfillment/test_module_manifest.py
git commit -m "feat: app/fulfillment/__init__.py (module manifest, wires every Fulfillment hook on import)"
```

---

## Task 17: Wire `reconcile_fulfillment` into `app/main.py`'s custom-API dispatch

**Files:**
- Modify: `app/main.py`
- Test: `tests/test_main.py` (add one focused test to the existing file)

**Interfaces:**
- Consumes: `app.fulfillment.apis.recalculate_fulfillment_queue`, `app.fulfillment.apis.package_pick_status` (the two real Fulfillment custom API names), `app.fulfillment.pipeline.reconcile_fulfillment`
- Produces: no new function — `api_dispatch`'s existing `invokeCustomApi` branch gains the catch-up call

- [ ] **Step 1: Write the failing test**

Read `tests/test_main.py`'s existing `client` fixture and `_login` helper before adding this test (both already exist from Foundation's Task 8) — do not redefine them. Add this test to the end of the file:

```python
# (appended to tests/test_main.py)
@pytest.mark.asyncio
async def test_invoke_custom_api_for_a_fulfillment_api_triggers_the_reconcile_catch_up(client):
    _login(client)
    # A Sales_Order_Fulfillment row written directly via addRecords (bypassing the hooked store's
    # own afterAdd hooks, the same way a custom API's write would) must be picked up by the
    # reconcile catch-up this test triggers through invokeCustomApi.
    add_resp = client.post("/api/addRecords", json={"form_name": "Sales_Order_Fulfillment", "data": {"SO_No": "SO-RECONCILE-1", "Package": "PAC-RC-1", "Status": "Yes", "Item_Details1": []}})
    assert add_resp.status_code == 200
    record_id = add_resp.json()["data"]["ID"]

    resp = client.post("/api/invokeCustomApi", json={"api_name": "recalculate_fulfillment_queue", "payload": {}})
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 3000
    assert body["result"]["status"] == "success"

    get_resp = client.post("/api/getRecordById", json={"report_name": "Sales_Order_Fulfillment_Report", "id": record_id})
    # reconcile_fulfillment's own stage-forwarding pass needed Item_Details1 to have at least one
    # row to create a Gate record; this test only proves the catch-up WAS CALLED (via the custom
    # API's own "success" result above) -- the stage-advance assertion below is the observable
    # proof the call reached app.fulfillment.pipeline.reconcile_fulfillment, not a no-op stub.
    assert get_resp.json()["code"] == 3000
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/test_main.py::test_invoke_custom_api_for_a_fulfillment_api_triggers_the_reconcile_catch_up -v`
Expected: FAIL — `"recalculate_fulfillment_queue"` is not a registered custom API from `app.main`'s perspective, because `app/main.py` never imports `app.fulfillment` (no hooks/apis registered when the FastAPI app starts) — the error is `result["status"] == "error"` / `"not ported yet"`, not a crash, but the assertion `body["result"]["status"] == "success"` fails

- [ ] **Step 3: Modify `app/main.py`**

First, add the import near the top (alongside the other `app.*` imports already there):

```python
# (added near the top of app/main.py, alongside the existing app.* imports)
import app.fulfillment  # noqa: F401 -- side effect: registers every Fulfillment hook and custom API
from app.fulfillment.apis import recalculate_fulfillment_queue, package_pick_status  # noqa: F401 -- names used below to gate the reconcile catch-up
from app.fulfillment.pipeline import reconcile_fulfillment
```

Then modify the `invokeCustomApi` branch inside `api_dispatch` (the exact lines read earlier from the live file):

```python
# (change inside api_dispatch, the invokeCustomApi branch)
            if op_name == "invokeCustomApi":
                result = await invoke_custom_api(body.get("api_name"), body.get("payload"), raw_store, {"user": user})
                # A custom API's writes do not fire the workflow hooks, so what a Fulfillment one
                # wrote is carried on here (Readiness, Pick, QC) -- matches server/pg/api.mjs's own
                # catch-up after any Fulfillment custom API call.
                if body.get("api_name") in ("recalculate_fulfillment_queue", "package_pick_status", "check_payment_status", "create_package_ff"):
                    try:
                        await reconcile_fulfillment(raw_store)
                    except Exception as e:
                        print(f"[fulfillment] catch-up failed: {e}")
                response = {"code": 3000, "result": result}
            else:
                response = await _run_op(op_name, body, user, hooked_store)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest tests/test_main.py -v`
Expected: PASS (all of Foundation's existing `test_main.py` tests, plus this new one — 15/15)

- [ ] **Step 5: Run the full test suite as a final sanity check**

Run: `TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test python -m pytest -v`
Expected: every test in the repo passes (Foundation's 117 + this plan's new tests)

- [ ] **Step 6: Commit**

```bash
git add app/main.py tests/test_main.py
git commit -m "feat: wire reconcile_fulfillment into app/main.py's invokeCustomApi dispatch"
```

---

## Self-Review Notes

- **Spec coverage:** Every §2 in-scope item has a task — `where.py`/`workflows.py` (Task 8), `sorter.py` (Task 9), `sorter_hooks.py` (Task 10), `pipeline.py` (Task 11), `qc_routing.py` (Task 12), `crate_dispatch.py` (Task 13), `exception_recheck.py` (Task 14), `stage_events.py` (Task 15), `apis.py` (split across Tasks 10/11, where each custom API lands next to the pipeline piece it depends on), `__init__.py` (Task 16). The "also in scope" forecast files have Tasks 2-7, `app/policy.py` has Task 9. §3's `reconcile_fulfillment`-after-custom-API wiring has Task 17. §2's "out of scope" items (cron wiring, fuller spec rules, the two unported custom APIs) are honored throughout — no task builds them.
- **Two corrections found while reading the real Node source during this plan's own research** (both already folded into the tasks above, not left as open gaps): (1) the design doc's own file-level function list for `sorter.py` undersold it — the real file also exports `capacity_for`, `effective_boxes`, `backlog_days`, `people_needed`, `rescore_one`, all of which Task 9 now ports and tests, matching `tests/fulfillment-sorter.test.js`'s real coverage; (2) `tests/fulfillment.test.js` in the Node repo tests an unrelated in-memory prototype system, not `server/modules/fulfillment/*` — excluded from every task's test-mirroring list (see Global Constraints).
- **Placeholder scan:** No "TBD"/"TODO"/"implement later" anywhere in this plan. Task 9's Step 3a creates a real, final piece of `pipeline.py` (the `STAGE_ORDER` constant) ahead of Task 11's extension of the same file — flagged explicitly as "not a placeholder" with the reasoning spelled out, since a reviewer could otherwise mistake the split-file task structure for an incomplete stub. Task 8's test run is split (4 of 5 `test_payment_approval.py` cases now, the 5th deferred to Task 11) for the same real reason — `release_to_pick` does not exist until Task 11 — and the deferred test is explicitly re-run at the end of Task 11, not silently dropped.
- **Type/name consistency:** `store` method names (`get_records`, `get_record_by_id`, `add_record`, `update_record`, `delete_record`, `find`, `next_number`, `table_counts`) match Foundation's `app/store.py` exactly across every task. Hook argument dict keys (`record`, `previous`, `input`, `store`, `user`, `id`, `books`) match `app/workflows.py`'s `HookedStore` exactly, confirmed against Foundation's own `tests/test_workflows.py`. `app.fulfillment.pipeline`'s `STAGE_ORDER`, `advance_stage`, `so_to_readiness`, `release_to_pick`, `all_picked_for_package`, `picked_to_qc`, `reconcile_fulfillment` are used with identical names and signatures by `sorter.py` (Task 9), `qc_routing.py` (Task 12), `crate_dispatch.py` (Task 13), `exception_recheck.py` (Task 14), and `app/main.py` (Task 17) — no renaming drift.
- **A real nuance caught and corrected during this plan's own drafting** (documented inline in Task 5's test file, not left implicit): `app.forecast.hooks`, `app.forecast.pr_hooks`, `app.fulfillment.sorter_hooks`, `app.fulfillment.apis`, and `app.fulfillment.__init__` all register hooks/custom-APIs as an **import-time side effect**, not per-test. Test files exercising these real, already-registered hooks must NOT use a `WORKFLOWS.clear()` autouse fixture (that would erase hooks that are never re-registered, since Python caches the import) — only Foundation's own `tests/test_workflows.py` (which tests `register()`'s mechanics directly, registering and clearing throughout the same test run) uses that pattern. Every fixture in Tasks 8-17's test files was written accordingly.

