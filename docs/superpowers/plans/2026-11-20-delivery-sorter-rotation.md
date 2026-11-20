# Delivery Management Phase 3 (Sorter/Rotation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Delivery Management's sorting engine (category/queue-rank scoring) and team rotation
(the nightly `Daily_Team_Availability` filler) from Node to Python, and resolve the 3 tracked
stubs/duplicates Phases 1 and 2 left pointing at this phase.

**Architecture:** Three new files under `app/delivery/` (`sorter.py`, `sorter_hooks.py`,
`rotation.py`), following the exact conventions Phases 1-2 established. Edits re-point
`suggest_schedule.py` at the real `effective_target` and replace `settings.py`'s two stub branches
(`preview_setting`'s `'ranking'` path, `get_roster`/`seed_roster`) with real logic that was already
sketched as dead code behind those stubs.

**Tech Stack:** Python 3.12+, FastAPI, asyncpg, pytest + pytest-asyncio, local Postgres for tests
(`TEST_DATABASE_URL`).

**Spec:** `docs/superpowers/specs/2026-11-20-delivery-sorter-rotation-design.md`

## Global Constraints

- Reproduce `jv-update`'s (Node) current behavior exactly for parity — port only what real Node
  code implements, confirmed by re-reading the actual `.mjs` source, never from memory.
- No live credentials, no new external dependency.
- Commit after each task. Work directly on `main` in `Supply-Chain-SystemV2-Python` (no feature
  branch), per this port's established governing rule.
- Test with local Postgres via `TEST_DATABASE_URL` — never a Railway tunnel — per CLAUDE.md.
- **Run the full suite SOLO** (confirm no other `pytest` process is running first via `ps aux | grep
  pytest`) before every full-suite regression check in this plan. Two pytest instances racing
  against the same shared local schema corrupted `record_id_seq` during Phase 1 and produced ~230
  unrelated false-positive errors — confirmed root cause, not a code bug. Never run two full-suite
  passes concurrently.
- Every function passed to `register()` must be `async def`, even with no `await` in its body —
  `HookedStore._run` always does `await fn(args)`; a plain `def` hook crashes with "object NoneType
  can't be used in 'await' expression". This bit Phase 2's `time_window.py`; check every new hook
  function in `sorter_hooks.py` against this before finalizing the task.
- Every ported file gets real Python tests derived from reading Node's actual behavior, even though
  no Node test file exists for any of these 3 files.
- `sorter.mjs`'s `isBroken()` does NOT use `BROKEN_FAILURE_CODES` — it checks
  `Complaint`/`Complaint_ID`/`RMA`/`Original_SO`/`Rescheduled_Via_Exception`/`Broken_Redelivery`
  fields directly. `sorter.py` needs no import of `BROKEN_FAILURE_CODES` from `scheduling.py`.

---

### Task 1: `app/delivery/sorter.py`

**Files:**
- Create: `app/delivery/sorter.py`
- Test: `tests/delivery/test_sorter.py`

**Interfaces:**
- Consumes: `app.delivery.scheduling.{SA, day, policy_reader}` (Phase 2); `app.deluge.{blank,
  truthy}`; `app.custom_apis.CUSTOM_APIS`.
- Produces: `effective_target(sa: dict, policy) -> str | None`; `categorize(sa: dict, *, now=None,
  policy=None) -> dict` (`{"category": "blocked"|"broken"|"late"|"at_risk"|"on_time",
  "blockedReason": str | None, "priorityReason": str}`); `rank(entries: list[dict]) -> list[dict]`
  (each entry gets `queueRank: int` added, same dict otherwise); `async def preview_categories(store,
  overrides: dict | None = None) -> list[dict]`; `async def rescore_all(store) -> dict`
  (`{"scored": int, "changed": int}`); `async def rescore_one(store, _appointment_id) -> dict`
  (identical to `rescore_all` — ranks are global). Registers
  `CUSTOM_APIS["recalculate_delivery_queue"]`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/delivery/test_sorter.py
import pytest
from datetime import datetime, timezone


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


def _policy(values: dict):
    return lambda key: values.get(key)


def test_effective_target_prefers_requested_delivery_date():
    from app.delivery.sorter import effective_target
    sa = {"Requested_Delivery_Date": "2026-12-25", "Order_Date": "2026-11-01"}
    assert effective_target(sa, _policy({})) == "2026-12-25"


def test_effective_target_falls_back_to_order_date_plus_default_promise_days():
    from app.delivery.sorter import effective_target
    sa = {"Requested_Delivery_Date": "", "Order_Date": "2026-01-01"}
    assert effective_target(sa, _policy({"default_promise_days": "25"})) == "2026-01-26"


def test_effective_target_uses_25_days_when_policy_missing():
    from app.delivery.sorter import effective_target
    sa = {"Requested_Delivery_Date": "", "Order_Date": "2026-01-01"}
    assert effective_target(sa, _policy({})) == "2026-01-26"


def test_effective_target_none_when_no_order_date_either():
    from app.delivery.sorter import effective_target
    assert effective_target({"Requested_Delivery_Date": "", "Order_Date": ""}, _policy({})) is None


def test_categorize_blocked_open_exception():
    from app.delivery.sorter import categorize
    sa = {"Exception_Status": "Flagged", "Contact": "x", "Customer_Address": "x"}
    out = categorize(sa)
    assert out["category"] == "blocked"
    assert out["blockedReason"] == "Open exception"


def test_categorize_blocked_no_contact():
    from app.delivery.sorter import categorize
    sa = {"Contact": "", "Email": "", "Customer_Address": "x"}
    out = categorize(sa)
    assert out["category"] == "blocked"
    assert out["blockedReason"] == "No contact on file"


def test_categorize_blocked_missing_address():
    from app.delivery.sorter import categorize
    sa = {"Contact": "x", "Customer_Address": "", "Address": ""}
    out = categorize(sa)
    assert out["category"] == "blocked"
    assert out["blockedReason"] == "Missing delivery address"


def test_categorize_broken_from_complaint():
    from app.delivery.sorter import categorize
    sa = {"Contact": "x", "Customer_Address": "x", "Complaint": "damaged"}
    out = categorize(sa)
    assert out["category"] == "broken"


def test_categorize_broken_from_broken_redelivery_flag():
    from app.delivery.sorter import categorize
    sa = {"Contact": "x", "Customer_Address": "x", "Broken_Redelivery": True}
    out = categorize(sa)
    assert out["category"] == "broken"


def test_categorize_late_when_slack_negative():
    from app.delivery.sorter import categorize
    now = datetime(2026, 12, 10, tzinfo=timezone.utc)
    sa = {"Contact": "x", "Customer_Address": "x", "Requested_Delivery_Date": "2026-12-05"}
    out = categorize(sa, now=now, policy=_policy({}))
    assert out["category"] == "late"
    assert "5 day(s) past target" in out["priorityReason"]


def test_categorize_at_risk_within_slack_days():
    from app.delivery.sorter import categorize
    now = datetime(2026, 12, 10, tzinfo=timezone.utc)
    sa = {"Contact": "x", "Customer_Address": "x", "Requested_Delivery_Date": "2026-12-12"}
    out = categorize(sa, now=now, policy=_policy({"at_risk_slack_days": "3"}))
    assert out["category"] == "at_risk"


def test_categorize_at_risk_when_forecast_misses_target():
    from app.delivery.sorter import categorize
    now = datetime(2026, 11, 1, tzinfo=timezone.utc)
    sa = {"Contact": "x", "Customer_Address": "x", "Requested_Delivery_Date": "2026-12-25", "Forecast_Delivery": "2026-12-26"}
    out = categorize(sa, now=now, policy=_policy({}))
    assert out["category"] == "at_risk"
    assert out["priorityReason"] == "Forecast misses target"


def test_categorize_on_time_with_plenty_of_slack():
    from app.delivery.sorter import categorize
    now = datetime(2026, 11, 1, tzinfo=timezone.utc)
    sa = {"Contact": "x", "Customer_Address": "x", "Requested_Delivery_Date": "2026-12-25"}
    out = categorize(sa, now=now, policy=_policy({"at_risk_slack_days": "3"}))
    assert out["category"] == "on_time"


def test_categorize_on_time_no_target_set():
    from app.delivery.sorter import categorize
    sa = {"Contact": "x", "Customer_Address": "x", "Requested_Delivery_Date": "", "Order_Date": ""}
    out = categorize(sa, policy=_policy({}))
    assert out["category"] == "on_time"
    assert out["priorityReason"] == "On time (no target set)"


def test_rank_orders_by_category_then_oldest_order_date_then_priority():
    from app.delivery.sorter import rank
    entries = [
        {"sa": {"ID": "1", "Priority": False, "Order_Date": "2026-02-01", "Requested_Delivery_Date": "", "Sales_Order": "SO-5"}, "category": "on_time"},
        {"sa": {"ID": "2", "Priority": False, "Order_Date": "2026-01-01", "Requested_Delivery_Date": "", "Sales_Order": "SO-1"}, "category": "broken"},
        {"sa": {"ID": "3", "Priority": False, "Order_Date": "2026-01-15", "Requested_Delivery_Date": "", "Sales_Order": "SO-2"}, "category": "late"},
    ]
    out = rank(entries)
    assert [e["category"] for e in out] == ["broken", "late", "on_time"]
    assert [e["queueRank"] for e in out] == [1, 2, 3]


def test_rank_blocked_numbered_separately_from_1():
    from app.delivery.sorter import rank
    entries = [
        {"sa": {"ID": "1", "Priority": False, "Order_Date": "2026-01-01", "Requested_Delivery_Date": "", "Sales_Order": "SO-1"}, "category": "on_time"},
        {"sa": {"ID": "2", "Priority": False, "Order_Date": "2026-01-01", "Requested_Delivery_Date": "", "Sales_Order": "SO-2"}, "category": "blocked"},
        {"sa": {"ID": "3", "Priority": False, "Order_Date": "2026-01-02", "Requested_Delivery_Date": "", "Sales_Order": "SO-3"}, "category": "blocked"},
    ]
    out = rank(entries)
    blocked = [e for e in out if e["category"] == "blocked"]
    assert [e["queueRank"] for e in blocked] == [1, 2]
    on_time = [e for e in out if e["category"] == "on_time"]
    assert on_time[0]["queueRank"] == 1


async def test_preview_categories_writes_nothing(raw):
    from app.delivery.sorter import preview_categories
    id_ = await raw.add_record("Service_Appointment_Form", {"Contact": "x", "Customer_Address": "x", "Order_Date": "2026-01-01"})
    out = await preview_categories(raw)
    assert len(out) == 1
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert blank_or_missing(row.get("Category"))


def blank_or_missing(v):
    return v is None or v == ""


async def test_preview_categories_only_scores_open_jobs(raw):
    from app.delivery.sorter import preview_categories
    await raw.add_record("Service_Appointment_Form", {"Appointment_Status": "Completed", "Contact": "x", "Customer_Address": "x"})
    await raw.add_record("Service_Appointment_Form", {"Appointment_Status": "Failed", "Contact": "x", "Customer_Address": "x"})
    await raw.add_record("Service_Appointment_Form", {"Appointment_Status": "Scheduled", "Contact": "x", "Customer_Address": "x"})
    out = await preview_categories(raw)
    assert len(out) == 1


async def test_rescore_all_writes_category_and_rank_and_only_when_changed(raw):
    from app.delivery.sorter import rescore_all
    id_ = await raw.add_record("Service_Appointment_Form", {"Contact": "x", "Customer_Address": "x", "Order_Date": "2026-01-01"})
    r = await rescore_all(raw)
    assert r["scored"] == 1
    assert r["changed"] == 1
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Category"] == "on_time"
    assert row["Queue_Rank"] == "1"
    assert row["Scored_At"]
    r2 = await rescore_all(raw)
    assert r2["changed"] == 0, "nothing changed on the second run -- no-op write is skipped"


async def test_rescore_one_rescores_everything_ranks_are_global(raw):
    from app.delivery.sorter import rescore_one
    await raw.add_record("Service_Appointment_Form", {"Contact": "x", "Customer_Address": "x", "Order_Date": "2026-01-01"})
    await raw.add_record("Service_Appointment_Form", {"Contact": "x", "Customer_Address": "x", "Order_Date": "2026-01-02"})
    r = await rescore_one(raw, "irrelevant-id")
    assert r["scored"] == 2


async def test_recalculate_delivery_queue_custom_api_is_registered(raw):
    from app.custom_apis import invoke_custom_api
    import app.delivery.sorter  # noqa: F401
    await raw.add_record("Service_Appointment_Form", {"Contact": "x", "Customer_Address": "x", "Order_Date": "2026-01-01"})
    out = await invoke_custom_api("recalculate_delivery_queue", {}, raw, {})
    assert out["status"] == "success"
    assert out["scored"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test
pytest tests/delivery/test_sorter.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.delivery.sorter'`.

- [ ] **Step 3: Write `sorter.py`**

```python
# app/delivery/sorter.py
# Delivery sorting engine (spec: HomeCartel v1.4, 05 Shared Engines / 01 Sorting Engine; Delivery
# 02 §2 "The delivery sorter"). Same four categories and the same sort key as Fulfillment (sorter.py
# there): broken > late > at_risk > on_time, blocked kept apart. Oldest Order Date first inside a
# category.
#
# There is no delivery_jobs table yet. This reads and writes the fields that already exist on
# Service_Appointment_Form instead of waiting for that migration -- the same "overlay onto the
# existing form" approach Procurement and Fulfillment used for their own spec v1.4 work.
#
# Deliberately NOT done here (left for later steps of the Delivery v1.4 roadmap):
#   - the capacity cut line / "Suggested Release" (needs the team-day scheduling engine)
#   - the anti-burial aging alerts (05/01 §5) -- Fulfillment's own sorter doesn't have these yet either
#   - "Broken" sub-rules the current schema cannot see: a failed/partial job's specific reason
#     (damaged_in_transit, refused) has no field; a Dispatch-stage exception requeue
#     (Rescheduled_Via_Exception) is used as the nearest real signal of "redo of a failed job"
#     instead.
# Ported from server/modules/delivery-management/sorter.mjs.
import re
from datetime import datetime, timedelta, timezone

from app.custom_apis import CUSTOM_APIS
from app.deluge import blank, truthy
from app.delivery.scheduling import SA, day, policy_reader

_DONE_STATUSES = {"Completed", "Failed"}


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _open_status(status) -> bool:
    return _text(status) not in _DONE_STATUSES


def _days_until(date_str, now: datetime) -> int | None:
    if blank(date_str):
        return None
    try:
        d = datetime.strptime(day(date_str), "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    today = datetime.strptime(day(now.isoformat()), "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return round((d - today).total_seconds() / 86400)


def effective_target(sa: dict, policy) -> str | None:
    if not blank(sa.get("Requested_Delivery_Date")):
        return sa.get("Requested_Delivery_Date")
    if blank(sa.get("Order_Date")):
        return None
    try:
        days = int(float(policy("default_promise_days"))) if policy("default_promise_days") else 25
    except (TypeError, ValueError):
        days = 25
    try:
        d = datetime.strptime(day(sa.get("Order_Date")), "%Y-%m-%d")
    except ValueError:
        return None
    d = d + timedelta(days=days)
    return d.strftime("%Y-%m-%d")


def _is_broken(sa: dict) -> bool:
    return (not blank(sa.get("Complaint")) or not blank(sa.get("Complaint_ID")) or not blank(sa.get("RMA")) or not blank(sa.get("Original_SO"))
            or not blank(sa.get("Rescheduled_Via_Exception")) or truthy(sa.get("Broken_Redelivery")))


def _blocked_check(sa: dict) -> str | None:
    if _text(sa.get("Exception_Status")) == "Flagged":
        return "Open exception"
    if blank(sa.get("Contact")) and blank(sa.get("Email")):
        return "No contact on file"
    has_address = not blank(sa.get("Customer_Address")) or not blank(sa.get("Address"))
    if not has_address:
        return "Missing delivery address"
    return None


def categorize(sa: dict, *, now=None, policy=None) -> dict:
    now = now or datetime.now(timezone.utc)
    policy = policy or (lambda _key: None)
    blocked_reason = _blocked_check(sa)
    if blocked_reason:
        return {"category": "blocked", "blockedReason": blocked_reason, "priorityReason": blocked_reason}

    target = effective_target(sa, policy)
    no_target_set = blank(sa.get("Requested_Delivery_Date"))
    slack = _days_until(target, now)

    if _is_broken(sa):
        return {"category": "broken", "blockedReason": None, "priorityReason": "Complaint/return, no target set" if no_target_set else "Complaint, return or redo of a failed job"}
    if slack is not None and slack < 0:
        return {"category": "late", "blockedReason": None, "priorityReason": f"{abs(slack)} day(s) past target"}
    forecast_misses = not blank(sa.get("Forecast_Delivery")) and not blank(target) and sa.get("Forecast_Delivery") > target
    try:
        at_risk_slack_days = int(float(policy("at_risk_slack_days"))) if policy("at_risk_slack_days") else 3
    except (TypeError, ValueError):
        at_risk_slack_days = 3
    if forecast_misses or (slack is not None and slack <= at_risk_slack_days):
        return {"category": "at_risk", "blockedReason": None, "priorityReason": "Forecast misses target" if forecast_misses else f"{slack} day(s) of slack left"}
    return {"category": "on_time", "blockedReason": None, "priorityReason": "On time (no target set)" if no_target_set else "On time"}


_NUM_SUFFIX_RE = re.compile(r"(\d+)\s*$")


def _record_number_key(so_no) -> float:
    m = _NUM_SUFFIX_RE.search(_text(so_no))
    return float(m.group(1)) if m else float("inf")


def _compare_key(e: dict) -> tuple:
    urgent = 0 if truthy(e["sa"].get("Priority")) else 1
    created = _text(e["sa"].get("Order_Date")) or "9999-99-99"
    target = _text(e["sa"].get("Requested_Delivery_Date")) or "9999-99-99"
    so_no = _text(e["sa"].get("Sales_Order_Display")) or _text(e["sa"].get("Sales_Order"))
    return (urgent, created, target, _record_number_key(so_no), so_no)


_CATEGORY_ORDER = ["broken", "late", "at_risk", "on_time"]


def rank(entries: list[dict]) -> list[dict]:
    out = []
    n = 0
    for cat in [*_CATEGORY_ORDER, "blocked"]:
        lst = sorted((e for e in entries if e["category"] == cat), key=_compare_key)
        if cat == "blocked":
            n = 0
        for e in lst:
            n += 1
            out.append({**e, "queueRank": n})
    return out


async def _score_all_open_jobs(store, overrides: dict | None = None) -> list[dict]:
    overrides = overrides or {}
    sas = await store.find(SA, lambda r: _open_status(r.get("Appointment_Status")))
    policy = await policy_reader(store, overrides)
    now = datetime.now(timezone.utc)
    entries = [{"sa": sa, **categorize(sa, now=now, policy=policy)} for sa in sas]
    return rank(entries)


async def preview_categories(store, overrides: dict | None = None) -> list[dict]:
    return await _score_all_open_jobs(store, overrides)


async def rescore_all(store) -> dict:
    scored = await _score_all_open_jobs(store)
    stamp = datetime.now(timezone.utc).isoformat()
    changed = 0
    for e in scored:
        want = {"Category": e["category"], "Blocked_Reason": e["blockedReason"] or "", "Queue_Rank": str(e["queueRank"]), "Priority_Reason": e["priorityReason"], "Suggested_Action": ""}
        diff = {k: v for k, v in want.items() if _text(v) != _text(e["sa"].get(k))}
        if not diff:
            continue
        await store.update_record(SA, e["sa"]["ID"], {**diff, "Scored_At": stamp}, by_form=True)
        changed += 1
    return {"scored": len(scored), "changed": changed}


async def rescore_one(store, _appointment_id) -> dict:
    return await rescore_all(store)


async def _recalculate_delivery_queue_api(payload: dict, store, ctx: dict) -> dict:
    return {"status": "success", **(await rescore_all(store))}


CUSTOM_APIS["recalculate_delivery_queue"] = _recalculate_delivery_queue_api
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_sorter.py -v
```

Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/sorter.py tests/delivery/test_sorter.py
git commit -m "feat(delivery): port sorter.mjs (categorize, rank, preview_categories, rescore_all)"
```

---

### Task 2: `app/delivery/sorter_hooks.py`

**Files:**
- Create: `app/delivery/sorter_hooks.py`
- Test: `tests/delivery/test_sorter_hooks.py`

**Interfaces:**
- Consumes: `app.delivery.sorter.rescore_all` (Task 1); `app.workflows.register`.
- Produces: `after_add`/`after_update` hooks on `Service_Appointment_Form` that call
  `rescore_all(store)` unconditionally on every save.

- [ ] **Step 1: Write the failing test**

```python
# tests/delivery/test_sorter_hooks.py
import pytest


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def store(raw):
    from app.workflows import create_hooked_store
    import app.delivery.sorter_hooks  # noqa: F401
    return create_hooked_store(raw)


async def test_adding_an_appointment_rescores_the_queue(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Contact": "x", "Customer_Address": "x", "Order_Date": "2026-01-01"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Category"] == "on_time"
    assert row["Queue_Rank"] == "1"


async def test_updating_an_appointment_rescores_the_whole_queue(raw, store):
    id_1 = await store.add_record("Service_Appointment_Form", {"Contact": "x", "Customer_Address": "x", "Order_Date": "2026-02-01"})
    id_2 = await store.add_record("Service_Appointment_Form", {"Contact": "x", "Customer_Address": "x", "Order_Date": "2026-01-01", "Complaint": "late item"})
    await store.update_record("Service_Appointment_Form", id_1, {"Notes": "touch"})
    row1 = await raw.get_record_by_id("Service_Appointment_Form", id_1, raw=True)
    row2 = await raw.get_record_by_id("Service_Appointment_Form", id_2, raw=True)
    assert row2["Category"] == "broken"
    assert row1["Category"] == "on_time"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/delivery/test_sorter_hooks.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.delivery.sorter_hooks'`.

- [ ] **Step 3: Write `sorter_hooks.py`**

```python
# app/delivery/sorter_hooks.py
# Event-triggered scoring (spec §05/01 §6: "any material event ... re-score that Sales Order's
# records immediately"), for direct widget saves of the appointment. Mirrors
# server/modules/fulfillment/sorter_hooks.py.
#
# Not yet wired: exception_queue.py's EXC_Resolve_Sync and scheduling_engine.py both write
# Exception_Status through the raw store (a hook's own writes do not re-fire hooks), so a resolved
# exception does not re-score immediately yet -- only on the next save of the appointment itself,
# or the nightly run. Next step of the Delivery v1.4 sorting-engine work, not done here on purpose
# (kept small and testable first). Ported from server/modules/delivery-management/sorter-hooks.mjs.
from app.delivery.sorter import rescore_all
from app.workflows import register


async def _on_sa_save(args: dict) -> None:
    await rescore_all(args["store"])


register("Service_Appointment_Form", {"afterAdd": _on_sa_save, "afterUpdate": _on_sa_save})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/delivery/test_sorter_hooks.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/sorter_hooks.py tests/delivery/test_sorter_hooks.py
git commit -m "feat(delivery): port sorter-hooks.mjs (rescore on every Service_Appointment_Form save)"
```

---

### Task 3: `app/delivery/rotation.py`

**Files:**
- Create: `app/delivery/rotation.py`
- Test: `tests/delivery/test_rotation.py`

**Interfaces:**
- Consumes: `app.delivery.scheduling.policy_reader` (Phase 2); `app.deluge.{blank, to_num,
  today_date}`; `app.custom_apis.CUSTOM_APIS`.
- Produces: `ROSTER: dict` (`{"installers": [...], "drivers": [...], "vehicles": [...]}`);
  `AUTO_TAG = "Auto rotation"`; `async def roster_from(store) -> dict` (same shape as `ROSTER`);
  `day_index(date) -> int`; `teams_for_date(date, teams_per_day: int, roster=ROSTER) ->
  list[dict]` (`[{"installer", "driver", "vehicle", "slot"}, ...]`); `planned_rows(from_date,
  days: int, teams_per_day: int, *, work_days=None, roster=ROSTER) -> list[dict]`; `async def
  generate_rotation(store, *, today=None, days=None, teams_per_day=None, hours=None, max_so=None,
  roster=None) -> dict` (`{"planned": int, "added": int}`). Registers
  `CUSTOM_APIS["generate_team_rotation"]`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/delivery/test_rotation.py
import pytest
from datetime import date


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


def test_roster_has_the_exact_built_in_list():
    from app.delivery.rotation import ROSTER
    assert ROSTER["installers"] == ["CJ", "Edmon", "John Dave", "Nherwin", "Norman"]
    assert ROSTER["drivers"] == ["Judy", "Norman", "Patrick", "Petz", "Zaldy"]
    assert ROSTER["vehicles"] == ["Traviz (NIB-3823)", "Hino (NBX-1446)", "Traviz (NKI-4969)"]


async def test_roster_from_falls_back_to_built_in_when_no_rows(raw):
    from app.delivery.rotation import roster_from, ROSTER
    out = await roster_from(raw)
    assert out == ROSTER


async def test_roster_from_uses_active_rows_sorted_by_sort_order(raw):
    from app.delivery.rotation import roster_from
    await raw.add_record("Delivery_Roster", {"Role": "installer", "Name": "Zed", "Active": True, "Sort_Order": 2})
    await raw.add_record("Delivery_Roster", {"Role": "installer", "Name": "Ann", "Active": True, "Sort_Order": 1})
    out = await roster_from(raw)
    assert out["installers"] == ["Ann", "Zed"]


async def test_roster_from_falls_back_per_role_independently(raw):
    from app.delivery.rotation import roster_from, ROSTER
    await raw.add_record("Delivery_Roster", {"Role": "driver", "Name": "Sam", "Active": True, "Sort_Order": 1})
    out = await roster_from(raw)
    assert out["drivers"] == ["Sam"]
    assert out["installers"] == ROSTER["installers"]
    assert out["vehicles"] == ROSTER["vehicles"]


async def test_roster_from_ignores_inactive_rows(raw):
    from app.delivery.rotation import roster_from, ROSTER
    await raw.add_record("Delivery_Roster", {"Role": "installer", "Name": "Ann", "Active": False, "Sort_Order": 1})
    out = await roster_from(raw)
    assert out["installers"] == ROSTER["installers"], "no active rows for installer: falls back to the built-in list"


def test_day_index_year_times_366_plus_day_of_year():
    from app.delivery.rotation import day_index
    assert day_index(date(2026, 1, 1)) == 2026 * 366 + 1
    assert day_index(date(2026, 1, 2)) == 2026 * 366 + 2


def test_teams_for_date_returns_requested_team_count_capped_by_roster_size():
    from app.delivery.rotation import teams_for_date, ROSTER
    out = teams_for_date(date(2026, 1, 1), 3, ROSTER)
    assert len(out) == 3
    for t in out:
        assert t["installer"] in ROSTER["installers"]
        assert t["slot"] in (1, 2, 3)


def test_teams_for_date_never_assigns_the_same_driver_twice_in_one_day():
    from app.delivery.rotation import teams_for_date, ROSTER
    out = teams_for_date(date(2026, 3, 15), 3, ROSTER)
    drivers = [t["driver"] for t in out if t["driver"]]
    assert len(drivers) == len(set(drivers))


def test_teams_for_date_never_assigns_the_same_vehicle_twice_in_one_day():
    from app.delivery.rotation import teams_for_date, ROSTER
    out = teams_for_date(date(2026, 3, 15), 3, ROSTER)
    vehicles = [t["vehicle"] for t in out if t["vehicle"]]
    assert len(vehicles) == len(set(vehicles))


def test_teams_for_date_a_driver_installing_today_is_not_also_the_driver():
    from app.delivery.rotation import teams_for_date, ROSTER
    for d in range(1, 29):
        out = teams_for_date(date(2026, 2, d), 3, ROSTER)
        installers_today = {t["installer"] for t in out}
        for t in out:
            if t["driver"]:
                assert t["driver"] not in installers_today or t["driver"] == t["installer"]


def test_teams_for_date_is_deterministic_same_inputs_same_output():
    from app.delivery.rotation import teams_for_date, ROSTER
    a = teams_for_date(date(2026, 6, 1), 3, ROSTER)
    b = teams_for_date(date(2026, 6, 1), 3, ROSTER)
    assert a == b


def test_planned_rows_skips_non_work_days():
    from app.delivery.rotation import planned_rows, ROSTER
    out = planned_rows(date(2026, 1, 1), 14, 2, roster=ROSTER)  # 2026-01-01 is a Thursday
    dates = {r["date"] for r in out}
    import datetime as dt
    for d_str in dates:
        d = dt.date.fromisoformat(d_str)
        assert d.weekday() != 6, "Sunday must be excluded (WORK_DAYS is Mon-Sat)"


async def test_generate_rotation_fills_the_requested_window(raw):
    from app.delivery.rotation import generate_rotation
    from app.deluge import today_date
    out = await generate_rotation(raw, today=today_date(), days=7, teams_per_day=2, hours=8)
    assert out["planned"] > 0
    assert out["added"] == out["planned"]
    rows = await raw.find("Daily_Team_Availability")
    assert len(rows) == out["added"]
    assert rows[0]["Availability_Status"] == "Full Day"
    assert rows[0]["Max_Capacity_Hours"] == "8"


async def test_generate_rotation_never_overwrites_an_existing_row(raw):
    from app.delivery.rotation import generate_rotation, teams_for_date, ROSTER
    from app.deluge import today_date, ymd
    first_team = teams_for_date(today_date(), 1, ROSTER)[0]
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": ymd(today_date()), "Installer": first_team["installer"], "Notes": "hand-edited", "Max_Capacity_Hours": "4"})
    out = await generate_rotation(raw, today=today_date(), days=1, teams_per_day=1, hours=8)
    assert out["added"] == 0, "the only slot for today was already taken"
    rows = await raw.find("Daily_Team_Availability", lambda r: r.get("Installer") == first_team["installer"])
    assert rows[0]["Notes"] == "hand-edited"
    assert rows[0]["Max_Capacity_Hours"] == "4"


async def test_generate_team_rotation_custom_api_is_registered(raw):
    from app.custom_apis import invoke_custom_api
    import app.delivery.rotation  # noqa: F401
    out = await invoke_custom_api("generate_team_rotation", {}, raw, {})
    assert out["status"] == "success"
    assert "planned" in out
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/delivery/test_rotation.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.delivery.rotation'`.

- [ ] **Step 3: Write `rotation.py`**

```python
# app/delivery/rotation.py
# Team Rotation (spec v1.4, Delivery 02 §1, TM-R1): fills Daily_Team_Availability rows ahead of
# time with a deterministic rotating pairing of drivers, installers and vehicles, so an officer
# never again has to type the day's teams by hand before the Scheduling Engine can run (an empty
# day is silently treated as "no team available").
#
# The rotation formula below is NOT new: it is ported 1:1 from genTeamsForDate() in the Daily Team
# Availability widget's own "Generate Month" button, a proven, owner-verified manual trigger. This
# only automates WHEN it runs (TM-R1: a nightly job, ahead of time -- not a click) and reads/writes
# through the store instead of the widget SDK. The formula itself, including the dIdx % 7 / dIdx %
# 11 offset terms, must not change -- see teams_for_date()'s own comment for why.
#
# TM-R3/TM-R1 together: this never overwrites or deletes an existing row, auto-generated or
# hand-edited -- it only fills a (date, installer) slot that is still empty, the same "Keep" rule
# the widget's own generator uses. TM-R4 (drivers/installers/vehicles edited any time in a Control
# Panel): roster_from() below reads the Delivery_Roster rows (Delivery Settings page), with the
# built-in list as the fallback. Ported from server/modules/delivery-management/rotation.mjs.
from datetime import date, timedelta

from app.custom_apis import CUSTOM_APIS
from app.deluge import blank, to_num, today_date
from app.delivery.scheduling import policy_reader

_FORM = "Daily_Team_Availability"
AUTO_TAG = "Auto rotation"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


# Same roster as the widget's GEN_INSTALLERS/GEN_DRIVERS/GEN_VEHICLES (2026-10-29 decision there,
# kept verbatim: only the 3 field vehicles, never the 3 forms-only ones that never go on a
# delivery; Norman is on both the installer and driver rosters on purpose).
ROSTER = {
    "installers": ["CJ", "Edmon", "John Dave", "Nherwin", "Norman"],
    "drivers": ["Judy", "Norman", "Patrick", "Petz", "Zaldy"],
    "vehicles": ["Traviz (NIB-3823)", "Hino (NBX-1446)", "Traviz (NKI-4969)"],
}


# TM-R4: the roster is editable in the Control Panel (Delivery_Roster rows, settings.py). No rows
# at all, or no active row for a role, = the built-in list above for that role, so the nightly job
# can never run with an empty roster. Rows are walked in Sort_Order, then by ID.
async def roster_from(store) -> dict:
    rows = await store.find("Delivery_Roster", lambda r: not blank(r.get("Name")))
    out = {}
    for key, role in (("installers", "installer"), ("drivers", "driver"), ("vehicles", "vehicle")):
        mine = sorted(
            (r for r in rows if _text(r.get("Role")) == role and str(r.get("Active")) != "false"),
            key=lambda r: (to_num(r.get("Sort_Order")) or 0, int(r["ID"])),
        )
        out[key] = [_text(r.get("Name")) for r in mine] if mine else ROSTER[key]
    return out


_WORK_DAYS = {0, 1, 2, 3, 4, 5}  # Mon-Sat (Python weekday(): Mon=0 ... Sun=6), Sunday excluded


# The day index: year*366 + day-of-year, deliberately not "days since an epoch" -- this has to
# reproduce identically between the widget's JS and this server code. The one jump at New Year
# reshuffles pairings once; harmless (ported comment, unchanged from the widget).
def day_index(d: date) -> int:
    day_of_year = (d - date(d.year, 1, 1)).days + 1
    return d.year * 366 + day_of_year


# Ported 1:1 from genTeamsForDate(). THE (dIdx % 7) AND (dIdx % 11) TERMS ARE LOAD-BEARING -- do not
# simplify them away. Without them the installer and driver indexes cycle on the same period (equal
# roster lengths), so they advance in lock-step and the pairings freeze. Measured over 120 days in
# the widget: 24 of 25 possible installer/driver pairings (the missing one is Norman with himself)
# and 30 of 30 vehicle pairings.
def teams_for_date(d: date, teams_per_day: int, roster: dict = ROSTER) -> list[dict]:
    installers, drivers, vehicles = roster["installers"], roster["drivers"], roster["vehicles"]
    i_count, d_count, v_count = len(installers), len(drivers), len(vehicles)
    t = max(1, min(teams_per_day, i_count, d_count, v_count))
    d_idx = day_index(d)
    day_installers = [installers[(d_idx * t + i) % i_count] for i in range(t)]
    used_drivers: list = []
    used_vehicles: list = []
    out = []
    for s in range(t):
        driver = ""
        for kd in range(d_count):
            cd = drivers[(d_idx * (t + 1) + s + (d_idx % 7) + kd) % d_count]
            if cd not in used_drivers and cd not in day_installers:
                driver = cd
                break
        if driver:
            used_drivers.append(driver)
        vehicle = ""
        for kv in range(v_count):
            cv = vehicles[(d_idx * (t + 2) + s + (d_idx % 11) + kv) % v_count]
            if cv not in used_vehicles:
                vehicle = cv
                break
        if vehicle:
            used_vehicles.append(vehicle)
        out.append({"installer": day_installers[s], "driver": driver, "vehicle": vehicle, "slot": s + 1})
    return out


def _ymd(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}"


# Planned rows for `days` days starting at `from_date` (inclusive), work days only. Pure: no store access.
def planned_rows(from_date: date, days: int, teams_per_day: int, *, work_days=None, roster: dict = ROSTER) -> list[dict]:
    work_days = work_days if work_days is not None else _WORK_DAYS
    rows = []
    for i in range(days):
        d = from_date + timedelta(days=i)
        if d.weekday() not in work_days:
            continue
        for t in teams_for_date(d, teams_per_day, roster):
            rows.append({"date": _ymd(d), **t})
    return rows


# TM-R1: fills team-days ahead of time (rotation_days_ahead, default 14). TM-R3: never touches a row
# that already exists for that (date, installer) slot, auto-generated earlier or hand-edited by the
# dispatcher.
async def generate_rotation(store, *, today=None, days=None, teams_per_day=None, hours=None, max_so=None, roster=None) -> dict:
    today = today or today_date()
    policy = await policy_reader(store)
    ahead_days = days if days is not None else (int(to_num(policy("rotation_days_ahead"))) or 14)
    teams = teams_per_day if teams_per_day is not None else (int(to_num(policy("rotation_teams_per_day"))) or 3)
    max_hours = hours if hours is not None else (to_num(policy("rotation_max_hours")) or 8)
    so_cap = max_so if max_so is not None else to_num(policy("rotation_max_so_capacity"))

    planned = planned_rows(today, ahead_days, teams, roster=roster if roster is not None else await roster_from(store))
    if not planned:
        return {"planned": 0, "added": 0}

    window_end = _ymd(today + timedelta(days=ahead_days))
    today_iso = _ymd(today)
    existing = await store.find(_FORM, lambda r: today_iso <= _text(r.get("Availability_Date")) <= window_end)
    taken = {f"{_text(r.get('Availability_Date'))}|{_text(r.get('Installer'))}" for r in existing}

    added = 0
    for p in planned:
        key = f"{p['date']}|{p['installer']}"
        if key in taken:
            continue
        taken.add(key)
        await store.add_record(_FORM, {
            "Availability_Date": p["date"], "Installer": p["installer"], "Driver": p["driver"], "Vehicle": p["vehicle"],
            "Availability_Status": "Full Day", "Max_Capacity_Hours": max_hours, "Max_SO_Capacity": so_cap,
            "Notes": f"{AUTO_TAG} · {p['date']} · slot {p['slot']}",
        })
        added += 1
    return {"planned": len(planned), "added": added}


async def _generate_team_rotation_api(payload: dict, store, ctx: dict) -> dict:
    return {"status": "success", **(await generate_rotation(store))}


CUSTOM_APIS["generate_team_rotation"] = _generate_team_rotation_api
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_rotation.py -v
```

Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/rotation.py tests/delivery/test_rotation.py
git commit -m "feat(delivery): port rotation.mjs (roster_from, teams_for_date, generate_rotation)"
```

---

### Task 4: Re-point `suggest_schedule.py` at the real `effective_target`

**Files:**
- Modify: `app/delivery/suggest_schedule.py`

**Interfaces:**
- Consumes: `app.delivery.sorter.effective_target` (Task 1).
- Produces: no change to `suggest_schedule`'s own public interface; the existing 8 tests in
  `tests/delivery/test_suggest_schedule.py` must pass unmodified (confirmed this plan's own
  drafting: none of them reference `_effective_target` directly, all call `suggest_schedule`
  through its public signature).

- [ ] **Step 1: Confirm the existing tests don't reference the private function**

```bash
grep -n "_effective_target" tests/delivery/test_suggest_schedule.py
```

Expected: no output (already confirmed during this plan's drafting — if this now shows a match,
stop and investigate before proceeding, since it means a test was added since the plan was written
that this task's edit would break).

- [ ] **Step 2: Edit `suggest_schedule.py`**

Remove the private duplicate and its import line, replacing with an import of the real function:

```python
# Change:
from app.delivery.scheduling import SA, day, policy_reader, to_long

_AQ = "Approval_Queue"
_INSTALL_TYPES = {"With Installation", "Full-Day Install", "Multi-Day Install"}


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


# Tracked duplicate of sorter.mjs's effectiveTarget (Phase 3, not yet ported) -- a small,
# self-contained function with no further sorter.mjs dependency. Re-point this at Phase 3's real
# app.delivery.sorter.effective_target once that phase ships, and delete this copy.
def _effective_target(sa: dict, policy) -> str | None:
    if not blank(sa.get("Requested_Delivery_Date")):
        return sa.get("Requested_Delivery_Date")
    if blank(sa.get("Order_Date")):
        return None
    days = to_num(policy("default_promise_days")) or 25
    d = parse_date(day(sa.get("Order_Date")))
    if d is None:
        return None
    return ymd(add_days(d, int(days)))

# to:
from app.delivery.scheduling import SA, day, policy_reader, to_long
from app.delivery.sorter import effective_target

_AQ = "Approval_Queue"
_INSTALL_TYPES = {"With Installation", "Full-Day Install", "Multi-Day Install"}


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)
```

Then replace both call sites of `_effective_target(sa, policy)` with `effective_target(sa, policy)`
(there are two: once for `target = parse_date(...)`, once for the `payload["target"]` value in the
approval item).

- [ ] **Step 3: Run the existing test file to confirm nothing broke**

```bash
pytest tests/delivery/test_suggest_schedule.py -v
```

Expected: all 8 passed, unmodified from before this task.

- [ ] **Step 4: Commit**

```bash
git add app/delivery/suggest_schedule.py
git commit -m "fix(delivery): re-point suggest_schedule.py at sorter.py's real effective_target, delete duplicate"
```

---

### Task 5: Un-stub `preview_setting`'s `'ranking'` branch

**Files:**
- Modify: `app/delivery/settings.py`
- Modify: `tests/delivery/test_settings.py`

**Interfaces:**
- Consumes: `app.delivery.sorter.{preview_categories, rescore_all}` (Task 1).
- Produces: `preview_setting`'s `'ranking'` branch returns real before/after category tallies
  instead of the Phase-1 stub message.

- [ ] **Step 1: Replace the stub test with a real-behavior test**

In `tests/delivery/test_settings.py`, replace:

```python
async def test_preview_setting_ranking_branch_is_stubbed(raw, store):
    from app.delivery.settings import preview_setting
    out = await preview_setting(raw, "default_promise_days", "30")
    assert out["status"] == "error"
    assert "Phase 3" in out["message"] and "Sorter/Rotation" in out["message"]
```

with:

```python
async def test_preview_setting_ranking_branch_shows_moved_categories_without_writing(raw, store):
    from app.delivery.settings import preview_setting
    await raw.add_record("Service_Appointment_Form", {"Contact": "x", "Customer_Address": "x", "Order_Date": "2026-01-01", "Requested_Delivery_Date": "2026-01-10"})
    out = await preview_setting(raw, "default_promise_days", "1")
    assert out["status"] == "success"
    assert "open job(s) would change category" in out["message"]
    assert "Fulfillment's own ranking reads this number too" in out["message"]
    assert "before" in out and "after" in out
    assert (await raw.find("Policy_Settings")) == [], "preview writes nothing"


async def test_preview_setting_ranking_branch_no_change_message_when_nothing_moves(raw, store):
    from app.delivery.settings import preview_setting
    out = await preview_setting(raw, "default_promise_days", "25")
    assert out["status"] == "success"
    assert "No open job would change category" in out["message"]
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
pytest tests/delivery/test_settings.py -v -k ranking_branch
```

Expected: FAIL — the stub message doesn't contain "open job(s) would change category".

- [ ] **Step 3: Edit `settings.py`'s `preview_setting`**

```python
# Add to the top imports:
from app.delivery.sorter import preview_categories, rescore_all

# Change:
    if d["preview"] == "ranking":
        return {"status": "error", "message": "Ranking preview is not available yet (Phase 3 — Sorter/Rotation — has not been ported)."}

# to:
    if d["preview"] == "ranking":
        before = await preview_categories(store)
        after = await preview_categories(store, {key: str(value)})
        was = {str(e["sa"]["ID"]): e["category"] for e in before}
        moved = [{"no": _text(e["sa"].get("Sales_Order_Display")) or _text(e["sa"].get("Sales_Order")) or f"#{e['sa']['ID']}", "from": was.get(str(e["sa"]["ID"])), "to": e["category"]} for e in after if was.get(str(e["sa"]["ID"])) != e["category"]]
        _count_keys = ["broken", "late", "at_risk", "on_time", "blocked"]

        def _tally(lst):
            return {c: len([e for e in lst if e["category"] == c]) for c in _count_keys}
        message = (f"{len(moved)} open job(s) would change category." if moved else "No open job would change category.") + shared
        return {"status": "success", "message": message, "before": _tally(before), "after": _tally(after), "moved": moved[:15]}
```

Also update `_history`'s comment (it currently says Phase 3 hasn't landed `rescoreAll` yet — update
it to reflect that the engine is now available, and wire the actual re-score call CP-R3 asks for):

```python
# Change:
    effect = ""
    # preview == 'ranking' re-scores the queue right away in Node (CP-R3). sorter.rescoreAll is
    # Phase 3 and not yet ported, so this phase deliberately does NOT call it -- Effect stays blank
    # for a ranking key's history row until Phase 3 lands and this call is added back.
    await store.add_record(HISTORY, {"Setting_Key": key, "Old_Value": old_v, "New_Value": _shown(record.get("Value")), "Changed_By": user or "", "Changed_At": zoho_now(), "Reason": _text(record.get("Change_Reason")), "Effect": effect})

# to:
    effect = ""
    if DEFS[key]["preview"] == "ranking":  # CP-R3: the change takes effect now
        r = await rescore_all(store)
        effect = f"Queue re-scored: {r['changed']} of {r['scored']} open job(s) changed."
    await store.add_record(HISTORY, {"Setting_Key": key, "Old_Value": old_v, "New_Value": _shown(record.get("Value")), "Changed_By": user or "", "Changed_At": zoho_now(), "Reason": _text(record.get("Change_Reason")), "Effect": effect})
```

This means `test_a_ranking_key_change_does_not_crash_even_though_rescoreall_is_not_ported_yet` in
`tests/delivery/test_settings.py` now exercises real behavior — rename it and add an assertion on
`Effect`:

```python
# Change:
async def test_a_ranking_key_change_does_not_crash_even_though_rescoreall_is_not_ported_yet(raw, store):
    # default_promise_days has preview: 'ranking'. Phase 1 has not ported sorter.rescoreAll yet, so
    # this phase's _history hook must not call it -- Effect stays blank for a ranking key's history
    # row until Phase 3 lands and this call is added back.
    id_ = await store.add_record("Policy_Settings", {"Policy_Key": "default_promise_days", "Value": "20"})
    await store.update_record("Policy_Settings", id_, {"Value": "30"})
    h = sorted(await raw.find("Delivery_Settings_History", lambda x: x.get("Setting_Key") == "default_promise_days"), key=lambda x: int(x["ID"]))
    assert len(h) == 2
    assert h[-1]["New_Value"] == "30"

# to:
async def test_a_ranking_key_change_re_scores_the_queue_and_logs_the_effect(raw, store):
    id_ = await store.add_record("Policy_Settings", {"Policy_Key": "default_promise_days", "Value": "20"})
    await store.update_record("Policy_Settings", id_, {"Value": "30"})
    h = sorted(await raw.find("Delivery_Settings_History", lambda x: x.get("Setting_Key") == "default_promise_days"), key=lambda x: int(x["ID"]))
    assert len(h) == 2
    assert h[-1]["New_Value"] == "30"
    assert "re-scored" in h[-1]["Effect"]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_settings.py -v
```

Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/settings.py tests/delivery/test_settings.py
git commit -m "feat(delivery): un-stub preview_setting's ranking branch, wire CP-R3's live re-score into history"
```

---

### Task 6: Un-stub `get_roster`/`seed_roster`

**Files:**
- Modify: `app/delivery/settings.py`
- Modify: `tests/delivery/test_settings.py`

**Interfaces:**
- Consumes: `app.delivery.rotation.{ROSTER, roster_from}` (Task 3).
- Produces: `get_roster(store) -> dict` (`{"installers", "drivers", "vehicles", "editable": bool}`);
  `seed_roster(store, user="") -> dict` (`{"seeded": int}`).

- [ ] **Step 1: Replace the stub test with real-behavior tests**

In `tests/delivery/test_settings.py`, replace:

```python
async def test_get_roster_and_seed_roster_are_stubbed_until_phase_3(raw, store):
    from app.delivery.settings import get_roster, seed_roster
    out = await get_roster(raw)
    assert out["status"] == "error"
    assert "Phase 3" in out["message"] and "Sorter/Rotation" in out["message"]
    out2 = await seed_roster(raw, "admin@x")
    assert out2["status"] == "error"
    assert "Phase 3" in out2["message"]
```

with:

```python
async def test_get_roster_shows_the_built_in_list_when_no_rows_exist_yet(raw, store):
    from app.delivery.settings import get_roster
    from app.delivery.rotation import ROSTER
    out = await get_roster(raw)
    assert out["installers"] == ROSTER["installers"]
    assert out["editable"] is False


async def test_seed_roster_copies_the_built_in_list_once_with_a_single_history_row(raw, store):
    from app.delivery.settings import seed_roster, get_roster
    out = await seed_roster(raw, "admin@x")
    assert out["seeded"] == 13  # 5 installers + 5 drivers + 3 vehicles
    rows = await raw.find("Delivery_Roster")
    assert len(rows) == 13
    hist = await raw.find("Delivery_Settings_History", lambda h: h.get("Setting_Key") == "roster:all")
    assert len(hist) == 1, "seeding 13 rows logs ONE history row, not 13 (the _seeding guard)"

    again = await seed_roster(raw, "admin@x")
    assert again["seeded"] == 0, "does nothing if rows already exist"

    out2 = await get_roster(raw)
    assert out2["editable"] is True
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
pytest tests/delivery/test_settings.py -v -k "roster_shows or seed_roster_copies"
```

Expected: FAIL — `get_roster`/`seed_roster` still return the stub error shape.

- [ ] **Step 3: Edit `settings.py`**

```python
# Add to the top imports:
from app.delivery.rotation import ROSTER, roster_from

# Change:
_ROSTER_NOT_READY = "The roster is not available yet (Phase 3 — Sorter/Rotation — has not been ported)."


async def get_roster(store) -> dict:
    # rosterFrom (rotation.mjs, Phase 3) is not yet ported -- stub the whole read, not a partial one.
    return {"status": "error", "message": _ROSTER_NOT_READY}


async def seed_roster(store, user: str = "") -> dict:
    # ROSTER (rotation.mjs's built-in list, Phase 3) is not yet ported -- stub the whole write.
    return {"status": "error", "message": _ROSTER_NOT_READY}

# to:
async def get_roster(store) -> dict:
    rows = await store.find(ROSTER_FORM)
    return {**(await roster_from(store)), "editable": len(rows) > 0}


async def seed_roster(store, user: str = "") -> dict:
    global _seeding
    rows = await store.find(ROSTER_FORM)
    if rows:
        return {"seeded": 0}
    seeded = 0
    _seeding = True
    try:
        for key, role in (("installers", "installer"), ("drivers", "driver"), ("vehicles", "vehicle")):
            for i, name in enumerate(ROSTER[key]):
                await store.add_record(ROSTER_FORM, {"Role": role, "Name": name, "Active": True, "Sort_Order": i + 1}, user)
                seeded += 1
    finally:
        _seeding = False
    await store.add_record(HISTORY, {"Setting_Key": "roster:all", "Old_Value": "Built-in list", "New_Value": f"{seeded} editable rows", "Changed_By": user or "", "Changed_At": zoho_now(), "Reason": "Made the roster editable", "Effect": "Same people and vehicles as before."})
    return {"seeded": seeded}
```

Note: `_seeding` was declared module-level in Phase 1 (`_seeding = False` near line 163) and is
already read by `_roster_after_add`'s `if not _seeding:` check — this task's `seed_roster` is the
first place that *writes* to it, hence the `global _seeding` declaration.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_settings.py -v
```

Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/settings.py tests/delivery/test_settings.py
git commit -m "feat(delivery): un-stub get_roster/seed_roster using rotation.py's ROSTER/roster_from"
```

---

### Task 7: Wire `sorter_hooks` and `rotation` into `app/delivery/__init__.py`, final regression

**Files:**
- Modify: `app/delivery/__init__.py`

**Interfaces:**
- Produces: importing `app.delivery` registers the sorter-rescore-on-save hook and both of this
  phase's custom APIs (`recalculate_delivery_queue`, `generate_team_rotation`), as a side effect.

- [ ] **Step 1: Update `app/delivery/__init__.py`**

```python
# Delivery Management. Each sub-module registers its own hooks/custom APIs on import; see
# app/procurement/apis.py for the established pattern this package will grow into across later
# phases.
# Phase 1 (Foundation): settings.py (Policy_Settings/Delivery_Roster hooks, 4 custom APIs).
# Phase 2 (Scheduling core): scheduling.py (schedule_slot, dms_reschedule -- no hooks of its own,
# but imported here anyway for the custom-API registration side effect), scheduling_engine.py,
# time_window.py, confirmation.py, delivery_scheduling_hooks.py (hook registration order below
# matches Node's own workflows.mjs import order for the forms this phase touches).
# Phase 3 (Sorter/Rotation): sorter.py (recalculate_delivery_queue -- no hooks of its own),
# sorter_hooks.py (rescores Service_Appointment_Form on every save -- matches Node's real
# workflows.mjs order: after confirmation.mjs/delivery-scheduling.mjs, the last entry here since
# every file between them in Node's own order belongs to a later phase), rotation.py
# (generate_team_rotation -- no hooks of its own).
import app.delivery.settings  # noqa: F401 -- registers Policy_Settings/Delivery_Roster hooks and get_delivery_settings/preview_delivery_setting/get_delivery_roster/seed_delivery_roster
import app.delivery.scheduling  # noqa: F401 -- registers the dms_reschedule custom API
import app.delivery.scheduling_engine  # noqa: F401 -- registers Service_Appointment_Form's 4 scheduling-engine hooks
import app.delivery.time_window  # noqa: F401 -- registers Service_Appointment_Form's Time_Window strip/stamp hooks
import app.delivery.confirmation  # noqa: F401 -- registers Service_Appointment_Form's confirmation-stamp hook
import app.delivery.delivery_scheduling_hooks  # noqa: F401 -- registers Delivery_Scheduling's capacity warning hook
import app.delivery.sorter  # noqa: F401 -- registers the recalculate_delivery_queue custom API
import app.delivery.rotation  # noqa: F401 -- registers the generate_team_rotation custom API
import app.delivery.sorter_hooks  # noqa: F401 -- registers Service_Appointment_Form's rescore-on-save hook
```

- [ ] **Step 2: Verify the app still imports and starts cleanly**

```bash
cd /c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2-Python
python -c "import app.main; print('ok')"
```

Expected: prints `ok`, no import errors.

- [ ] **Step 3: Confirm no other pytest is running, then run the full suite solo**

```bash
ps aux | grep pytest | grep -v grep || echo "clear to proceed"
export TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test
pytest -q
```

Expected: PASS — 668 (end of Phase 2) plus this phase's new tests, minus/plus any net change from
Task 5/6's stub-test replacements (same count or +1 per replaced test, since each stub test became
1-2 real tests). Confirm the printed total rather than asserting an exact number here.

- [ ] **Step 4: Commit**

```bash
git add app/delivery/__init__.py
git commit -m "feat(delivery): wire Phase 3's sorter/rotation modules into app/delivery/__init__.py"
```

---

## Final verification

After Task 7, confirm live behavior against the running local-Postgres dev server (never Railway,
per CLAUDE.md): start uvicorn, log in, and call `recalculate_delivery_queue` and
`generate_team_rotation` on real data to confirm both custom APIs reach their real implementations
end-to-end through the HTTP layer, same smoke-test style used after Phases 1-2.

This phase fully resolves the 3 stubs/duplicates Phases 1-2 deliberately left pointing here. The
only remaining known stub after this phase is `settings.py`'s `preview_setting`'s `'backlog'`
branch, explicitly tracked for Phase 7 (Analytics) — not a gap introduced by this phase.
