# Delivery Management Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Delivery Management module's foundation pieces — the settings catalogue,
validation/history/roster, the once-only lock helper, and team scoping — from Node to Python,
exactly reproducing current behavior (with two explicitly stubbed preview branches that depend on
later phases).

**Architecture:** Four new files under a new `app/delivery/` package
(`settings_defs.py`, `settings.py`, `locks.py`, `scoping.py`), following the exact structural
conventions `app/procurement/settings_defs.py` and `app/procurement/settings_hooks.py` already
established (catalogue list → `DEFS`/`GROUPS` derived dicts → validation functions; `register()`
hooks on a shared table; `CUSTOM_APIS` self-registration). Three spec-form JSON files get copied
from the Node repo so the three forms this phase touches (`Policy_Settings`,
`Delivery_Settings_History`, `Delivery_Roster`) exist in the Python schema at all.

**Tech Stack:** Python 3.12+, FastAPI, asyncpg, pytest + pytest-asyncio, PGlite-equivalent local
Postgres for tests (`TEST_DATABASE_URL`).

**Spec:** `docs/superpowers/specs/2026-11-20-delivery-foundation-design.md`

## Global Constraints

- Reproduce `jv-update`'s (Node) current behavior exactly for parity — port only what real Node
  code implements, confirmed by re-reading the actual `.mjs` source, never from memory or summary.
- No live credentials, no new external dependency — this phase introduces none (settings, locks
  and scoping are pure in-process/DB logic).
- Commit after each task. Work directly on `main` in `Supply-Chain-SystemV2-Python` (no feature
  branch), per this port's established governing rule.
- Test with local Postgres via `TEST_DATABASE_URL` — never a Railway tunnel — per CLAUDE.md.
- Every ported file gets real Python tests derived from reading Node's actual behavior, even
  though no Node test file exists for any of these four files (owner's explicit decision).
- `workflows.mjs` (the hook-registration import manifest) is explicitly OUT of scope this phase.

---

### Task 1: Copy the three missing spec-form JSON files

Python's `app/model.py` loads form definitions from `server/spec-forms/*.json` dynamically
(confirmed by reading `app/model.py`: `SPEC_FORMS = ROOT / "server" / "spec-forms"`, globbed at
import time into `FORMS`). A `diff` of the two repos' `server/spec-forms/` directories this
session found exactly three files present in Node but missing in Python: `Policy_Settings.json`,
`Delivery_Settings_History.json`, `Delivery_Roster.json`. Without them, `form_by_name("Policy_Settings")`
etc. raise, and `app/schema.py`'s `ensure_schema` (which derives Postgres tables from
`app.model.COLUMNS`, itself built from these same JSON files) never creates the tables this phase
needs.

**Files:**
- Copy: `C:\Users\Admin\Desktop\JV\OTHERS\Supply-Chain-SystemV2\server\spec-forms\Policy_Settings.json` → `server/spec-forms/Policy_Settings.json`
- Copy: `C:\Users\Admin\Desktop\JV\OTHERS\Supply-Chain-SystemV2\server\spec-forms\Delivery_Settings_History.json` → `server/spec-forms/Delivery_Settings_History.json`
- Copy: `C:\Users\Admin\Desktop\JV\OTHERS\Supply-Chain-SystemV2\server\spec-forms\Delivery_Roster.json` → `server/spec-forms/Delivery_Roster.json`

**Interfaces:**
- Produces: `app.model.form_by_name("Policy_Settings")`, `form_by_name("Delivery_Settings_History")`,
  `form_by_name("Delivery_Roster")` all resolve without raising; `app.schema.ensure_schema(conn)`
  creates/migrates all three tables when run against a fresh test database.

- [ ] **Step 1: Copy the three JSON files**

```bash
cp "/c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2/server/spec-forms/Policy_Settings.json" \
   "/c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2-Python/server/spec-forms/Policy_Settings.json"
cp "/c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2/server/spec-forms/Delivery_Settings_History.json" \
   "/c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2-Python/server/spec-forms/Delivery_Settings_History.json"
cp "/c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2/server/spec-forms/Delivery_Roster.json" \
   "/c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2-Python/server/spec-forms/Delivery_Roster.json"
```

- [ ] **Step 2: Verify the three forms load and the diff is now empty**

```bash
cd /c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2-Python
python -c "
from app.model import form_by_name
for f in ['Policy_Settings', 'Delivery_Settings_History', 'Delivery_Roster']:
    print(f, '->', form_by_name(f))
"
diff <(ls /c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2/server/spec-forms/ | sort) <(ls server/spec-forms/ | sort)
```

Expected: the Python script prints all three form names with no traceback; the `diff` prints
nothing (both directories now match exactly).

- [ ] **Step 3: Run the full existing test suite to confirm nothing broke**

```bash
export TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test
pytest -q
```

Expected: PASS, same count as before this task (adding form definitions is additive; no existing
code references these forms yet).

- [ ] **Step 4: Commit**

```bash
git add server/spec-forms/Policy_Settings.json server/spec-forms/Delivery_Settings_History.json server/spec-forms/Delivery_Roster.json
git commit -m "feat(delivery): add missing spec-form JSON for Policy_Settings/Delivery_Settings_History/Delivery_Roster"
```

---

### Task 2: `app/delivery/__init__.py` package marker

**Files:**
- Create: `app/delivery/__init__.py`

**Interfaces:**
- Produces: `app.delivery` importable as a package. Empty for this phase — later phases add their
  own self-registering imports here, same pattern as `app/procurement/apis.py`'s growing import
  list (confirmed: `import app.procurement.books_apis`, etc., each with a `# noqa: F401` comment).

- [ ] **Step 1: Create the empty package file**

```python
# Delivery Management. Each sub-module registers its own hooks/custom APIs on import; see
# app/procurement/apis.py for the established pattern this package will grow into across later
# phases. Phase 1 (Foundation) ships settings_defs.py, settings.py, locks.py, scoping.py.
```

- [ ] **Step 2: Verify it imports cleanly**

```bash
cd /c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2-Python
python -c "import app.delivery; print('ok')"
```

Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add app/delivery/__init__.py
git commit -m "feat(delivery): create app/delivery package"
```

---

### Task 3: `app/delivery/locks.py`

Port of `locks.mjs`'s `withLock(key, fn)`: a per-key serial queue so two near-simultaneous calls
with the same key never interleave their read-then-write — the second starts only after the first
has fully settled (resolved or rejected). Node uses a `Map` of promise tails; Python uses a
`dict[str, asyncio.Task]` of task tails, same semantics, same documented in-process-only
limitation (no cross-instance Postgres advisory lock — matching Node, which doesn't have one
either, confirmed from its own header comment).

**Files:**
- Create: `app/delivery/locks.py`
- Test: `tests/delivery/test_locks.py`

**Interfaces:**
- Produces: `async def with_lock(key: str, fn: Callable[[], Awaitable[T]]) -> T` — runs `fn()`,
  serialized per `key`; a second call with the same `key` while the first is still running waits
  for the first to settle (success or exception) before starting, then runs independently (its
  own exception, if any, does not propagate to or block a third caller).

- [ ] **Step 1: Write the failing tests**

```python
# tests/delivery/test_locks.py
import asyncio
import pytest

from app.delivery.locks import with_lock


async def test_runs_immediately_with_no_contention():
    async def fn():
        return "done"
    assert await with_lock("k1", fn) == "done"


async def test_second_call_with_same_key_waits_for_the_first():
    order = []

    async def slow():
        order.append("slow-start")
        await asyncio.sleep(0.05)
        order.append("slow-end")
        return "slow"

    async def fast():
        order.append("fast-start")
        order.append("fast-end")
        return "fast"

    first = asyncio.ensure_future(with_lock("same-key", slow))
    await asyncio.sleep(0)  # let `first` actually start before queuing `second`
    second = asyncio.ensure_future(with_lock("same-key", fast))
    results = await asyncio.gather(first, second)

    assert results == ["slow", "fast"]
    assert order == ["slow-start", "slow-end", "fast-start", "fast-end"], \
        "fast must not start until slow has fully finished, even though fast itself is instant"


async def test_different_keys_run_independently_not_serialized():
    order = []

    async def slow():
        order.append("slow-start")
        await asyncio.sleep(0.05)
        order.append("slow-end")
        return "slow"

    async def fast():
        order.append("fast-start")
        order.append("fast-end")
        return "fast"

    first = asyncio.ensure_future(with_lock("key-a", slow))
    await asyncio.sleep(0)
    second = asyncio.ensure_future(with_lock("key-b", fast))
    await asyncio.gather(first, second)

    # fast (key-b) finishes before slow (key-a) because they are NOT serialized against each other
    assert order.index("fast-end") < order.index("slow-end")


async def test_a_failed_first_call_does_not_block_the_second():
    async def boom():
        raise ValueError("boom")

    async def ok_fn():
        return "ok"

    first = asyncio.ensure_future(with_lock("fail-key", boom))
    await asyncio.sleep(0)
    second = asyncio.ensure_future(with_lock("fail-key", ok_fn))

    with pytest.raises(ValueError, match="boom"):
        await first
    assert await second == "ok"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2-Python
export TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test
pytest tests/delivery/test_locks.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.delivery.locks'` (and/or
`ModuleNotFoundError: No module named 'app.delivery'` if `tests/delivery/__init__.py` doesn't
exist yet — create an empty one alongside the test file so pytest discovers it the same way
`tests/procurement/__init__.py` does, confirmed that pattern exists there).

- [ ] **Step 3: Write the implementation**

```python
# app/delivery/locks.py
# A queue per key: work with the same key runs one after the other, never at the same time.
#
# Why: two people can press the same button at the same moment (two dispatchers confirming the
# same slot, one person double-clicking Confirm). Each request reads the database, decides, and
# then writes; with two at once, both can read the old picture and both write, so the second one
# overwrites or doubles the first. With a queue the second one starts only after the first has
# written, so it reads the new picture.
#
# Limit, on purpose: this is inside ONE server process. It is enough while the app runs as one
# instance (as on Railway today). If the app is ever run as several instances, the same idea needs
# a database lock (a Postgres advisory lock), as the schedule runner does in Node
# (server/schedules.mjs). A callback that waits on another callback of the same key would wait
# forever, so do not nest the same key. Ported from server/modules/delivery-management/locks.mjs.
import asyncio
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")

_tails: dict[str, asyncio.Task] = {}


async def with_lock(key: str, fn: Callable[[], Awaitable[T]]) -> T:
    previous = _tails.get(key)

    async def run() -> T:
        if previous is not None:
            try:
                await previous
            except Exception:
                pass
        return await fn()

    task = asyncio.ensure_future(run())
    _tails[key] = task

    def _cleanup(_task):
        if _tails.get(key) is task:
            del _tails[key]
    task.add_done_callback(_cleanup)

    return await task
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_locks.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/locks.py tests/delivery/__init__.py tests/delivery/test_locks.py
git commit -m "feat(delivery): port locks.mjs's withLock to with_lock"
```

---

### Task 4: `app/delivery/scoping.py` and wiring into `app/main.py`

Port of `scoping.mjs`'s `teamScoping` export — pure data, byte-identical to Node's. Wired into
`app/main.py`'s existing `create_access(SECTIONS, str(WIDGETS))` call (confirmed at
`app/main.py:57`, currently 2 args) as an explicit third argument, rather than silently relying on
`app/access.py`'s own already-identical hardcoded default (confirmed by reading `app/access.py` in
full this session: `_DEFAULT_SCOPING` already matches `teamScoping` exactly). No behavior change —
this makes the dependency explicit and is what later phases' own scoping additions, if any, will
build on.

**Files:**
- Create: `app/delivery/scoping.py`
- Modify: `app/main.py:18` (import), `app/main.py:57` (the `create_access` call)
- Test: `tests/delivery/test_scoping.py`

**Interfaces:**
- Produces: `app.delivery.scoping.TEAM_SCOPING: dict` with keys `rules` (list of
  `{"form": str, "report": str, "field": str}`), `allowedTabs` (list of str),
  `allowedWidgets` (list of str).

- [ ] **Step 1: Write the failing test**

```python
# tests/delivery/test_scoping.py
from app.delivery.scoping import TEAM_SCOPING


def test_team_scoping_matches_the_node_source_exactly():
    assert TEAM_SCOPING["rules"] == [
        {"form": "Service_Appointment_Form", "report": "Service_Appointment", "field": "Installer"},
        {"form": "Field_Work", "report": "Field_Work_Report", "field": "Assigned_to_Installer"},
    ]
    assert TEAM_SCOPING["allowedTabs"] == ["Ongoing_Service1", "Field_Service_Site_Visits1", "Truck_Maintenance"]
    assert TEAM_SCOPING["allowedWidgets"] == [
        "Delivery Management/Ongoing Service",
        "Delivery Management/Field Service Site Visits",
        "Delivery Management/Truck Maintenance",
    ]


def test_create_access_uses_the_real_scoping_not_just_its_own_default():
    # Regression guard: app/access.py's _DEFAULT_SCOPING happens to be byte-identical to
    # TEAM_SCOPING today, so a test that only checks behavior would pass even if main.py never
    # passed TEAM_SCOPING at all. This asserts the actual wiring, not just the coincidental match.
    import inspect
    from app import main
    src = inspect.getsource(main)
    assert "TEAM_SCOPING" in src, "app/main.py must pass TEAM_SCOPING to create_access explicitly"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/delivery/test_scoping.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.delivery.scoping'`.

- [ ] **Step 3: Write `scoping.py`**

```python
# app/delivery/scoping.py
# Team scoping configuration for Delivery Management. Ported from
# server/modules/delivery-management/scoping.mjs. Consumed by app/main.py's create_access() call
# (app/access.py's Phase 2: row-level team scoping for field installer teams).
TEAM_SCOPING = {
    "rules": [
        {"form": "Service_Appointment_Form", "report": "Service_Appointment", "field": "Installer"},
        {"form": "Field_Work", "report": "Field_Work_Report", "field": "Assigned_to_Installer"},
    ],
    "allowedTabs": ["Ongoing_Service1", "Field_Service_Site_Visits1", "Truck_Maintenance"],
    "allowedWidgets": [
        "Delivery Management/Ongoing Service",
        "Delivery Management/Field Service Site Visits",
        "Delivery Management/Truck Maintenance",
    ],
}
```

- [ ] **Step 4: Wire it into `app/main.py`**

Add the import near the other `app.*` imports (after `from app.books.client import create_zoho_api`,
alphabetically before `from app.criteria import ZohoError`):

```python
from app.delivery.scoping import TEAM_SCOPING
```

Change line 57 from:

```python
access = create_access(SECTIONS, str(WIDGETS))
```

to:

```python
access = create_access(SECTIONS, str(WIDGETS), TEAM_SCOPING)
```

- [ ] **Step 5: Run tests to verify they pass, plus the full suite for a regression check**

```bash
pytest tests/delivery/test_scoping.py -v
pytest -q
```

Expected: 2 passed for the new file; full suite count unchanged otherwise (passing the same data
`app/access.py` already defaulted to is a no-op for every existing test).

- [ ] **Step 6: Commit**

```bash
git add app/delivery/scoping.py app/main.py tests/delivery/test_scoping.py
git commit -m "feat(delivery): port scoping.mjs's teamScoping, wire explicitly into create_access"
```

---

### Task 5: `app/delivery/settings_defs.py`

Direct, mechanical port of `settings-defs.mjs`'s `SETTING_DEFS` (19 keys), `DEFS`, `GROUPS`,
`is_delivery_key` (Node: `isDeliveryKey`), `TYPE_FIELD`, `typed()`, `problem_with()` (Node:
`problemWith`), `workday_problem()` (Node: `workdayProblem`). Structurally identical to
`app/procurement/settings_defs.py` (confirmed by reading it in full this session), adapted for
Delivery's own keys and its one real difference: a `time`-type setting, which Node validates via
`clock()` imported from `scheduling.mjs` (not yet ported — Phase 2). This phase provides its own
private `_clock(value)` helper, the same regex Node already validates the format with inline
(`^(1[0-2]|0?[1-9]):([0-5]\d)\s(AM|PM)$`, confirmed from the source) before calling `clock()`, so
this phase is not blocked on Phase 2. **Tracked follow-up, not done here:** when Phase 2 lands
`scheduling.py`'s own `clock()`, re-point `settings_defs.py` at it and delete `_clock`.

**Files:**
- Create: `app/delivery/settings_defs.py`
- Test: `tests/delivery/test_settings_defs.py`

**Interfaces:**
- Produces:
  - `SETTING_DEFS: list[dict]` — 19 entries, each with at least `key`, `label`, `type`, `default`,
    `group`, `affects`, `preview` (`'none' | 'ranking' | 'backlog'`); numeric types also have
    `min`/`max`; `rotation_max_so_capacity` additionally has `"optional": True`;
    `default_promise_days` and `at_risk_slack_days` additionally have `"shared": "Fulfillment"`.
  - `DEFS: dict[str, dict]` — `SETTING_DEFS` keyed by `key`.
  - `GROUPS: list[str]` — unique groups in first-seen order: `["Scheduling window and workday",
    "Ranking", "Capacity", "Team rotation", "Alerts and archive"]`.
  - `is_delivery_key(key: str) -> bool`.
  - `TYPE_FIELD: dict[str, str]` — `{"percent": "Percentage", "time": "Time", "days": "Number",
    "hours": "Number", "minutes": "Number", "count": "Number", "km": "Number"}`.
  - `typed(d: dict, raw) -> str | float` — `d["type"] == "time"` returns `str(raw).strip()`;
    blank `raw` returns `""`; otherwise returns `float(raw)`.
  - `problem_with(key: str, raw) -> str | None`.
  - `workday_problem(key: str, raw, values: dict) -> str | None`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/delivery/test_settings_defs.py
from app.delivery.settings_defs import SETTING_DEFS, DEFS, GROUPS, is_delivery_key, TYPE_FIELD, typed, problem_with, workday_problem


def test_defs_is_keyed_by_setting_key_and_covers_every_entry():
    assert len(SETTING_DEFS) == 19
    for d in SETTING_DEFS:
        assert DEFS[d["key"]] is d
    assert len({d["key"] for d in SETTING_DEFS}) == 19, "no duplicate keys"


def test_groups_in_first_seen_order():
    assert GROUPS == ["Scheduling window and workday", "Ranking", "Capacity", "Team rotation", "Alerts and archive"]


def test_is_delivery_key():
    assert is_delivery_key("traffic_buffer_percent") is True
    assert is_delivery_key("nonsense") is False


def test_every_numeric_setting_has_a_label_group_affects_and_an_in_range_default():
    for d in SETTING_DEFS:
        assert d["label"] and d["group"] and d["affects"], d["key"]
        if d["type"] not in ("time",) and d["default"] != "":
            assert d["min"] <= d["default"] <= d["max"], d["key"]


def test_rotation_max_so_capacity_is_optional_with_a_blank_default():
    d = DEFS["rotation_max_so_capacity"]
    assert d["default"] == ""
    assert d.get("optional") is True


def test_two_ranking_settings_are_marked_shared_with_fulfillment():
    assert DEFS["default_promise_days"]["shared"] == "Fulfillment"
    assert DEFS["at_risk_slack_days"]["shared"] == "Fulfillment"


def test_type_field_maps_every_type_used_by_the_catalogue():
    used_types = {d["type"] for d in SETTING_DEFS}
    for t in used_types:
        assert t in TYPE_FIELD, t


def test_typed_time_is_stripped_text_others_are_numbers_blank_is_empty_string():
    assert typed(DEFS["workday_start_time"], " 8:00 AM ") == "8:00 AM"
    assert typed(DEFS["traffic_buffer_percent"], "15") == 15.0
    assert typed(DEFS["rotation_max_so_capacity"], "") == ""
    assert typed(DEFS["rotation_max_so_capacity"], None) == ""


def test_problem_with_rejects_a_value_outside_the_range():
    msg = problem_with("max_days_scheduling_window", "9000")
    assert msg is not None and "outside the allowed range (1 to 60)" in msg


def test_problem_with_rejects_a_non_numeric_value():
    msg = problem_with("max_days_scheduling_window", "abc")
    assert msg is not None and "enter a number" in msg


def test_problem_with_rejects_a_non_integer_value():
    msg = problem_with("max_days_scheduling_window", "3.5")
    assert msg is not None and "whole numbers" in msg


def test_problem_with_rejects_an_unknown_key():
    msg = problem_with("nonsense", "3")
    assert msg is not None and "not a Delivery setting" in msg


def test_problem_with_accepts_a_value_within_range():
    assert problem_with("max_days_scheduling_window", "30") is None


def test_problem_with_blank_optional_setting_is_fine():
    assert problem_with("rotation_max_so_capacity", "") is None


def test_problem_with_blank_required_setting_is_rejected():
    msg = problem_with("max_days_scheduling_window", "")
    assert msg is not None and "enter a number" in msg


def test_problem_with_time_type_accepts_valid_clock_strings():
    assert problem_with("workday_start_time", "8:00 AM") is None
    assert problem_with("workday_start_time", "5:30 PM") is None
    assert problem_with("workday_start_time", "12:00 AM") is None


def test_problem_with_time_type_rejects_bad_format():
    msg = problem_with("workday_start_time", "25:00")
    assert msg is not None and "enter a time like 8:00 AM or 5:30 PM" in msg
    msg2 = problem_with("workday_start_time", "not a time")
    assert msg2 is not None and "enter a time like 8:00 AM or 5:30 PM" in msg2


def test_workday_problem_requires_at_least_one_hour_between_start_and_end():
    values = {"workday_start_time": "8:00 AM", "workday_end_time": "5:00 PM"}
    assert workday_problem("workday_start_time", "8:00 AM", values) is None
    bad = workday_problem("workday_end_time", "8:30 AM", values)
    assert bad is not None and "at least one hour after it starts" in bad


def test_workday_problem_is_none_for_non_workday_keys():
    assert workday_problem("traffic_buffer_percent", "50", {}) is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/delivery/test_settings_defs.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.delivery.settings_defs'`.

- [ ] **Step 3: Write `settings_defs.py`**

```python
# app/delivery/settings_defs.py
# The catalogue of Delivery settings (spec 05 Shared Engines / 08 Control Panel: the "Delivery
# capacity" group). Every number the Delivery code reads from Policy_Settings is listed here with
# a plain label, the default the code already uses, limits, and one sentence on what it affects.
# Code holds the formulas only. A changed value is a Policy_Settings row (no row = the default), so
# every module that already reads policy() keeps working unchanged. Every change is kept in
# Delivery_Settings_History (settings.py).
#
# Only keys the code really reads are here. Fulfillment's own keys (boxes per hour, default
# people, hours per day) are not: they belong to Fulfillment. "shared": "Fulfillment" marks the two
# ranking numbers Fulfillment's sorter reads too. Ported from
# server/modules/delivery-management/settings-defs.mjs.
#
# _clock() is a private duplicate of scheduling.mjs's clock() (Phase 2, not yet ported) -- just
# enough to validate the "8:00 AM" format this file's own problem_with()/workday_problem() need.
# When Phase 2 lands scheduling.py's own clock(), re-point this file at it and delete _clock.
import re

SETTING_DEFS = [
    # --- scheduling window and workday ---
    {"key": "traffic_buffer_percent", "label": "Traffic buffer", "type": "percent", "default": 15, "min": 0, "max": 100, "group": "Scheduling window and workday", "affects": "How long every job is planned to take: its estimated hours plus this much extra. A bigger buffer fits fewer jobs in a team-day.", "preview": "none"},
    {"key": "max_days_scheduling_window", "label": "Scheduling window", "type": "days", "default": 14, "min": 1, "max": 60, "group": "Scheduling window and workday", "affects": "How many days ahead the scheduling engine looks for a free team-day before it gives up and raises an exception.", "preview": "none"},
    {"key": "workday_start_time", "label": "Workday start", "type": "time", "default": "8:00 AM", "group": "Scheduling window and workday", "affects": "When a team-day begins. With the end time it sets the hours a team can be booked for.", "preview": "none"},
    {"key": "workday_end_time", "label": "Workday end", "type": "time", "default": "5:00 PM", "group": "Scheduling window and workday", "affects": "When a team-day ends. With the start time it sets the hours a team can be booked for.", "preview": "none"},
    {"key": "soft_hold_minutes", "label": "Soft hold on a quoted slot", "type": "minutes", "default": 20, "min": 1, "max": 240, "group": "Scheduling window and workday", "affects": "How long a slot quoted to a customer is kept for them before it is released.", "preview": "none"},
    # --- ranking (the Sorting Engine) ---
    {"key": "default_promise_days", "label": "Promise days when a job has no target", "type": "days", "default": 25, "min": 1, "max": 120, "group": "Ranking", "affects": "The target used to rank a job whose order has no requested delivery date: order date plus this many days.", "shared": "Fulfillment", "preview": "ranking"},
    {"key": "at_risk_slack_days", "label": "At risk: slack at or below this many days", "type": "days", "default": 3, "min": 1, "max": 30, "group": "Ranking", "affects": "Which on-time jobs move to At Risk (days left to the target at or below this number).", "shared": "Fulfillment", "preview": "ranking"},
    # --- capacity ---
    {"key": "delivery_sites_per_team_per_day", "label": "Sites per team per day", "type": "count", "default": 3, "min": 1, "max": 10, "group": "Capacity", "affects": "How many visits (drop-off or installation) one team does in a day. Feeds the backlog calculator on Delivery Analytics.", "preview": "backlog"},
    {"key": "delivery_max_teams", "label": "Field teams (vehicles) at most", "type": "count", "default": 3, "min": 1, "max": 10, "group": "Capacity", "affects": "The most teams that can be out on one day, even if more show as available. Feeds the backlog calculator.", "preview": "backlog"},
    {"key": "delivery_heavy_box_threshold", "label": "Heavy order: boxes at or above", "type": "count", "default": 10, "min": 1, "max": 200, "group": "Capacity", "affects": "From this many boxes, with no lift on site, the suggested crew is 4 people instead of 2.", "preview": "none"},
    {"key": "dropoff_max_wait_days", "label": "Drop-off: longest wait for an own-team slot", "type": "days", "default": 2, "min": 0, "max": 14, "group": "Capacity", "affects": "A drop-off whose own-team slot is later than its target, or more than this many days from today, gets a Book third party approval item.", "preview": "none"},
    # --- team rotation ---
    {"key": "rotation_days_ahead", "label": "Team rotation: days ahead", "type": "days", "default": 14, "min": 1, "max": 60, "group": "Team rotation", "affects": "How far ahead the nightly job fills the team availability. Rows already there are never changed.", "preview": "none"},
    {"key": "rotation_teams_per_day", "label": "Team rotation: teams per day", "type": "count", "default": 3, "min": 1, "max": 10, "group": "Team rotation", "affects": "How many teams the nightly job puts on each work day (never more than the roster allows).", "preview": "none"},
    {"key": "rotation_max_hours", "label": "Team rotation: hours a team can work", "type": "hours", "default": 8, "min": 1, "max": 14, "group": "Team rotation", "affects": "The hours of work stamped on each new team-day row.", "preview": "none"},
    {"key": "rotation_max_so_capacity", "label": "Team rotation: most orders per team-day (blank = no limit)", "type": "count", "default": "", "optional": True, "min": 1, "max": 50, "group": "Team rotation", "affects": "The most orders stamped on each new team-day row. The scheduling engine checks it when it books a job on that team-day.", "preview": "none"},
    # --- alerts and archive ---
    {"key": "approval_sla_hours", "label": "Hours to decide before it escalates", "type": "hours", "default": 24, "min": 1, "max": 168, "group": "Alerts and archive", "affects": "The due time put on every supervisor approval item (schedule shortfall, third-party booking).", "preview": "none"},
    {"key": "redelivery_silence_days", "label": "Failed job with no redelivery: days before the alert", "type": "days", "default": 2, "min": 1, "max": 30, "group": "Alerts and archive", "affects": "When a failed or partial job with no redelivery scheduled raises an alert.", "preview": "none"},
    {"key": "archive_after_days", "label": "Archive a finished job after", "type": "days", "default": 7, "min": 1, "max": 90, "group": "Alerts and archive", "affects": "When a done job leaves the active lists (if it has no open exception).", "preview": "none"},
    {"key": "permit_warn_days", "label": "Permit still pending: warn this many days before the job", "type": "days", "default": 2, "min": 1, "max": 14, "group": "Alerts and archive", "affects": "When a job whose work permit / gate pass is required but still Pending shows in the Delivery Exception Queue (this many days before its date, or past it).", "preview": "none"},
    {"key": "maintenance_warn_days", "label": "Truck maintenance: warn this many days before", "type": "days", "default": 7, "min": 0, "max": 60, "group": "Alerts and archive", "affects": "How early a vehicle that is due for maintenance by date is flagged.", "preview": "none"},
    {"key": "maintenance_warn_km", "label": "Truck maintenance: warn this many km before", "type": "km", "default": 300, "min": 0, "max": 5000, "group": "Alerts and archive", "affects": "How early a vehicle that is due for maintenance by distance is flagged.", "preview": "none"},
]

DEFS = {d["key"]: d for d in SETTING_DEFS}
GROUPS = list(dict.fromkeys(d["group"] for d in SETTING_DEFS))  # insertion order, matches Node's [...new Set(...)]


def is_delivery_key(key: str) -> bool:
    return key in DEFS


# The Type_field the old Policy Settings widget expects on a row.
TYPE_FIELD = {"percent": "Percentage", "time": "Time", "days": "Number", "hours": "Number", "minutes": "Number", "count": "Number", "km": "Number"}


def _blank_text(v) -> bool:
    return v is None or str(v).strip() == ""


def typed(d: dict, raw):
    if d["type"] == "time":
        return str(raw).strip()
    return "" if _blank_text(raw) else float(raw)


_TIME_RE = re.compile(r"^(1[0-2]|0?[1-9]):([0-5]\d)\s(AM|PM)$", re.IGNORECASE)


def _clock(value) -> dict | None:
    m = _TIME_RE.match(str(value or "").strip())
    if not m:
        return None
    hour = int(m.group(1)) % 12 + (12 if m.group(3).upper() == "PM" else 0)
    return {"hour": hour, "minute": int(m.group(2))}


def problem_with(key: str, raw) -> str | None:
    d = DEFS.get(key)
    if not d:
        return f'"{key}" is not a Delivery setting.'
    if d["type"] == "time":
        c = _clock(str(raw if raw is not None else "").strip())
        return None if c else f"{d['label']}: enter a time like 8:00 AM or 5:30 PM."
    if _blank_text(raw):
        return None if d.get("optional") else f"{d['label']}: enter a number."
    try:
        n = float(raw)
    except (TypeError, ValueError):
        return f"{d['label']}: enter a number."
    if n != n or n in (float("inf"), float("-inf")):  # NaN or infinite
        return f"{d['label']}: enter a number."
    if n != int(n):
        return f"{d['label']}: use whole numbers."
    n = int(n)
    if n < d["min"] or n > d["max"]:
        return f"{d['label']}: {n} is outside the allowed range ({d['min']} to {d['max']})."
    return None


def workday_problem(key: str, raw, values: dict) -> str | None:
    if key not in ("workday_start_time", "workday_end_time"):
        return None
    start = _clock(raw if key == "workday_start_time" else values.get("workday_start_time"))
    end = _clock(raw if key == "workday_end_time" else values.get("workday_end_time"))
    if not start or not end:
        return None
    if end["hour"] * 60 + end["minute"] - (start["hour"] * 60 + start["minute"]) >= 60:
        return None
    return "The workday must end at least one hour after it starts."
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_settings_defs.py -v
```

Expected: 19 passed.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/settings_defs.py tests/delivery/test_settings_defs.py
git commit -m "feat(delivery): port settings-defs.mjs (19-key catalogue, validation)"
```

---

### Task 6: `app/delivery/settings.py` — catalogue, validation hooks, history (no preview/roster yet)

Ports the non-preview, non-roster parts of `settings.mjs`: `settings_in_use`, the `Policy_Settings`
hooks (`_check`/`_history`/before-delete/after-delete), and `get_settings`. Mirrors
`app/procurement/settings_hooks.py`'s exact structure (confirmed by reading it in full this
session) — `register()` from `app.workflows`, a module-level `_was_value` dict for the before→after
history handoff, `_text`/`_shown` helpers.

**Files:**
- Create: `app/delivery/settings.py`
- Test: `tests/delivery/test_settings.py`

**Interfaces:**
- Consumes: `app.delivery.settings_defs.{SETTING_DEFS, DEFS, GROUPS, is_delivery_key, TYPE_FIELD, typed, problem_with, workday_problem}` (Task 5); `app.workflows.register`; `app.criteria.{ZohoError, zoho_now}`; `app.deluge.blank`.
- Produces: `async def settings_in_use(store) -> dict[str, dict]` (each value:
  `{"value": ..., "source": "saved" | "default", "row": dict | None}`); `async def get_settings(store) -> dict` (`{"settings": [...], "groups": GROUPS}`); hooks registered on `"Policy_Settings"` via `register()` at module import time, so importing this module is what makes writes to `Policy_Settings` validate.
- This task leaves `preview_setting`, `get_roster`, `seed_roster` for Tasks 7–8 — do not implement
  them here, even as stubs, to keep this task's diff reviewable on its own.

- [ ] **Step 1: Write the failing tests**

```python
# tests/delivery/test_settings.py
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
    import app.delivery.settings  # noqa: F401 -- registers the Policy_Settings hooks
    return create_hooked_store(raw)


async def _row_of(raw, key):
    return (await raw.find("Policy_Settings", lambda r: r.get("Policy_Key") == key))[0]


async def test_setting_row_validated_outside_limits_refused(raw, store):
    from app.criteria import ZohoError
    with pytest.raises(ZohoError, match=r"outside the allowed range \(1 to 60\)"):
        await store.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "9000"})
    with pytest.raises(ZohoError, match="enter a number"):
        await store.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "abc"})
    with pytest.raises(ZohoError, match="enter a time like 8:00 AM"):
        await store.add_record("Policy_Settings", {"Policy_Key": "workday_start_time", "Value": "25:00"})
    assert len(await raw.find("Policy_Settings", lambda r: r.get("Policy_Key") == "max_days_scheduling_window")) == 0


async def test_a_non_catalogue_key_passes_through_untouched(raw, store):
    # settings.mjs's own comment: "A key that is NOT in the catalogue ... passes through untouched."
    id_ = await store.add_record("Policy_Settings", {"Policy_Key": "some_other_module_key", "Value": "whatever"})
    row = await raw.get_record_by_id("Policy_Settings", id_, raw=True)
    assert row["Value"] == "whatever"


async def test_a_second_row_for_the_same_key_is_refused(raw, store):
    from app.criteria import ZohoError
    await store.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "20"})
    with pytest.raises(ZohoError, match="already has a row"):
        await store.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "30"})


async def test_change_written_to_history_second_write_refused_no_op_write_logs_nothing(raw, store):
    id_ = await store.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "20"})
    await store.update_record("Policy_Settings", id_, {"Value": "25", "Change_Reason": "more buffer"}, user="admin@x")
    await store.update_record("Policy_Settings", id_, {"Value": "25"})  # same value: no history row
    h = sorted(await raw.find("Delivery_Settings_History"), key=lambda x: int(x["ID"]))
    assert len(h) == 1
    assert h[0]["Setting_Key"] == "max_days_scheduling_window"
    assert h[0]["Old_Value"] == "20"
    assert h[0]["New_Value"] == "25"
    assert h[0]["Changed_By"] == "admin@x"
    assert h[0]["Reason"] == "more buffer"
    assert h[0]["Effect"] == "", "preview == 'none' for this key: no engine side effect"


async def test_a_ranking_key_change_notes_queue_rescore_in_the_effect_even_though_rescoreall_is_not_ported_yet(raw, store):
    # default_promise_days has preview: 'ranking'. Phase 1 has not ported sorter.rescoreAll yet, so
    # this phase's _history hook must not call it -- Node's own rescoreAll call inside history() is
    # exactly the kind of Phase-3 dependency this phase stubs. Confirm it degrades safely (no crash,
    # Effect left blank) rather than raising ImportError or similar.
    id_ = await store.add_record("Policy_Settings", {"Policy_Key": "default_promise_days", "Value": "20"})
    await store.update_record("Policy_Settings", id_, {"Value": "30"})
    h = await raw.find("Delivery_Settings_History", lambda x: x.get("Setting_Key") == "default_promise_days")
    assert len(h) == 1
    assert h[0]["New_Value"] == "30"


async def test_deleting_a_row_reverts_to_default_and_logs_history(raw, store):
    id_ = await store.add_record("Policy_Settings", {"Policy_Key": "archive_after_days", "Value": "5"})
    await store.delete_record("Policy_Settings", id_, user="admin@x")
    h = await raw.find("Delivery_Settings_History", lambda x: x.get("Reason") == "Back to the default")
    assert len(h) == 1
    assert h[0]["Setting_Key"] == "archive_after_days"
    assert h[0]["New_Value"] == "7"  # the default


async def test_get_settings_shows_source_default_and_saved_and_marks_an_out_of_range_saved_row(raw, store):
    from app.delivery.settings import get_settings
    out = await get_settings(raw)
    assert {g for g in out["groups"]} == {"Scheduling window and workday", "Ranking", "Capacity", "Team rotation", "Alerts and archive"}
    by_key = {s["key"]: s for s in out["settings"]}
    assert by_key["max_days_scheduling_window"]["source"] == "default"
    assert by_key["max_days_scheduling_window"]["is_default"] is True
    assert by_key["max_days_scheduling_window"]["value"] == 14
    assert by_key["max_days_scheduling_window"]["problem"] is None

    # a row saved through the raw store (bypassing this module's own validation) can be out of range
    await raw.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "9000"})
    out2 = await get_settings(raw)
    row2 = next(s for s in out2["settings"] if s["key"] == "max_days_scheduling_window")
    assert row2["source"] == "saved"
    assert row2["problem"] is not None and "outside the allowed range" in row2["problem"]


async def test_get_settings_includes_last_changed_by_and_at_from_history(raw, store):
    from app.delivery.settings import get_settings
    id_ = await store.add_record("Policy_Settings", {"Policy_Key": "approval_sla_hours", "Value": "48"}, user="dispatcher@x")
    out = await get_settings(raw)
    row = next(s for s in out["settings"] if s["key"] == "approval_sla_hours")
    assert row["last_changed_by"] == "dispatcher@x"
    assert row["last_changed_at"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test
pytest tests/delivery/test_settings.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.delivery.settings'`.

- [ ] **Step 3: Write `settings.py` (catalogue + hooks + history only)**

```python
# app/delivery/settings.py
# Delivery settings, the Control Panel's "Delivery capacity" group (spec 05 Shared Engines / 08):
# validation (CP-R6), history (CP-R5), the effect before saving (CP-R4) and the editable team
# roster (Delivery 02, TM-R4). Admin only (app/access.py). The catalogue itself is settings_defs.py.
#
# Storage is the existing Policy_Settings table, not a new one: every module already reads it; a
# key that is NOT in the catalogue (another module's, or a custom one) passes through untouched.
# Ported from server/modules/delivery-management/settings.mjs.
from app.criteria import ZohoError, zoho_now
from app.deluge import blank
from app.delivery.settings_defs import DEFS, GROUPS, SETTING_DEFS, TYPE_FIELD, is_delivery_key, problem_with, typed, workday_problem
from app.workflows import register

POLICY = "Policy_Settings"
HISTORY = "Delivery_Settings_History"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _shown(v) -> str:
    return "" if blank(v) else str(v)


_was_value: dict = {}  # key -> the value in use before this write, for the history


async def settings_in_use(store) -> dict:
    rows = await store.find(POLICY, lambda r: is_delivery_key(_text(r.get("Policy_Key"))))
    out = {}
    for d in SETTING_DEFS:
        row = next((r for r in rows if _text(r.get("Policy_Key")) == d["key"] and not blank(r.get("Value"))), None)
        out[d["key"]] = {"value": typed(d, row["Value"]) if row else d["default"], "source": "saved" if row else "default", "row": row}
    return out


def _values_of(in_use: dict) -> dict:
    return {k: v["value"] for k, v in in_use.items()}


def _refusal(key: str, raw, current: dict) -> str | None:
    return problem_with(key, raw) or workday_problem(key, raw, current)


async def _check(args: dict) -> None:
    input_, previous, id_, store = args["input"], args.get("previous"), args.get("id"), args["store"]
    key = _text(input_.get("Policy_Key") if "Policy_Key" in input_ else (previous or {}).get("Policy_Key")).strip()
    if not is_delivery_key(key):
        return  # not a Delivery catalogue key: not ours
    if previous and "Policy_Key" in input_ and _text(input_.get("Policy_Key")).strip() != _text(previous.get("Policy_Key")):
        raise ZohoError(2001, "A setting cannot change its key.")
    clash = [r for r in await store.find(POLICY, lambda r: _text(r.get("Policy_Key")) == key) if str(r["ID"]) != str(id_ or "")]
    if clash:
        raise ZohoError(2001, f'"{key}" already has a row: change that one.')
    d = DEFS[key]
    value = _text(input_.get("Value") if "Value" in input_ else (previous or {}).get("Value")).strip()
    current = _values_of(await settings_in_use(store))
    bad = _refusal(key, value, current)
    if bad:
        raise ZohoError(2001, bad)
    input_["Policy_Key"] = key
    input_["Value"] = value.replace(r"\s+", " ").upper() if d["type"] == "time" else ("" if value == "" else str(float(value)))
    if blank(input_.get("Description") if "Description" in input_ else (previous or {}).get("Description")):
        input_["Description"] = d["label"]
    if blank(input_.get("Type_field") if "Type_field" in input_ else (previous or {}).get("Type_field")):
        input_["Type_field"] = TYPE_FIELD[d["type"]]
    _was_value[key] = current[key]


async def _history(args: dict) -> None:
    record, store, user = args["record"], args["store"], args.get("user", "")
    key = _text(record.get("Policy_Key"))
    if not is_delivery_key(key):
        return
    old_v = _shown(_was_value.get(key))
    _was_value.pop(key, None)
    if old_v == _text(record.get("Value")):
        return
    effect = ""
    # preview == 'ranking' re-scores the queue right away in Node (CP-R3). sorter.rescoreAll is
    # Phase 3 and not yet ported, so this phase deliberately does NOT call it -- Effect stays blank
    # for a ranking key's history row until Phase 3 lands and this call is added back.
    await store.add_record(HISTORY, {"Setting_Key": key, "Old_Value": old_v, "New_Value": _shown(record.get("Value")), "Changed_By": user or "", "Changed_At": zoho_now(), "Reason": _text(record.get("Change_Reason")), "Effect": effect})


async def _before_delete(args: dict) -> None:
    previous, store = args.get("previous") or {}, args["store"]
    key = _text(previous.get("Policy_Key"))
    if is_delivery_key(key):
        _was_value[f"del:{key}"] = _shown(_values_of(await settings_in_use(store)).get(key))


async def _after_delete(args: dict) -> None:
    previous, store, user = args.get("previous") or {}, args["store"], args.get("user", "")
    key = _text(previous.get("Policy_Key"))
    if not is_delivery_key(key):
        return
    before = _was_value.pop(f"del:{key}", None)
    if before is None:
        before = _text(previous.get("Value"))
    await store.add_record(HISTORY, {"Setting_Key": key, "Old_Value": before, "New_Value": _shown(DEFS[key]["default"]), "Changed_By": user or "", "Changed_At": zoho_now(), "Reason": "Back to the default", "Effect": ""})


register(POLICY, {
    "beforeAdd": _check,
    "beforeUpdate": _check,
    "afterAdd": _history,
    "afterUpdate": _history,
    "beforeDelete": _before_delete,
    "afterDelete": _after_delete,
})


async def get_settings(store) -> dict:
    use = await settings_in_use(store)
    hist = await store.find(HISTORY, lambda h: is_delivery_key(_text(h.get("Setting_Key"))))
    current = _values_of(use)
    settings = []
    for d in SETTING_DEFS:
        matches = sorted((h for h in hist if _text(h.get("Setting_Key")) == d["key"]), key=lambda h: int(h["ID"]), reverse=True)
        last = matches[0] if matches else None
        u = use[d["key"]]
        problem = _refusal(d["key"], u["value"], current) if u["source"] == "saved" else None
        settings.append({**d, "value": u["value"], "source": u["source"], "is_default": u["source"] == "default", "row_id": str(u["row"]["ID"]) if u.get("row") else None, "problem": problem, "last_changed_by": (last or {}).get("Changed_By", ""), "last_changed_at": (last or {}).get("Changed_At", "")})
    return {"settings": settings, "groups": GROUPS}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_settings.py -v
```

Expected: 8 passed.

- [ ] **Step 5: Run the full suite for a regression check**

```bash
pytest -q
```

Expected: PASS, previous count plus this task's new tests.

- [ ] **Step 6: Commit**

```bash
git add app/delivery/settings.py tests/delivery/test_settings.py
git commit -m "feat(delivery): port settings.mjs's catalogue, Policy_Settings hooks and history"
```

---

### Task 7: `preview_setting` with the two stubbed branches, plus `get_delivery_settings`/`preview_delivery_setting` custom APIs

Adds `preview_setting(store, key, value)` to `app/delivery/settings.py`, matching Node's three
branches: `'none'` fully ported (no engine dependency); `'ranking'` and `'backlog'` return
`fail()` stubs naming the phase that will complete them, per the spec's explicit decision. Also
registers the two custom APIs this function backs.

**Files:**
- Modify: `app/delivery/settings.py`
- Test: `tests/delivery/test_settings.py` (same file, appended)

**Interfaces:**
- Consumes: `app.custom_apis.CUSTOM_APIS` (self-registration, same pattern as
  `app/procurement/settings_hooks.py`'s `CUSTOM_APIS["preview_procurement_setting"] = ...`).
- Produces: `async def preview_setting(store, key, value) -> dict` (`{"status": "success" |
  "error", "message": str, ...}`); `CUSTOM_APIS["get_delivery_settings"]` and
  `CUSTOM_APIS["preview_delivery_setting"]` registered.

- [ ] **Step 1: Write the failing tests (append to `tests/delivery/test_settings.py`)**

```python
async def test_preview_setting_unknown_key_is_error(raw, store):
    from app.delivery.settings import preview_setting
    out = await preview_setting(raw, "nonsense", "5")
    assert out["status"] == "error"
    assert "not a Delivery setting" in out["message"]


async def test_preview_setting_invalid_value_is_error_without_writing(raw, store):
    from app.delivery.settings import preview_setting
    out = await preview_setting(raw, "max_days_scheduling_window", "9000")
    assert out["status"] == "error"
    assert "outside the allowed range" in out["message"]
    assert len(await raw.find("Policy_Settings")) == 0


async def test_preview_setting_none_branch_message_and_shared_note(raw, store):
    from app.delivery.settings import preview_setting
    from app.delivery.settings_defs import DEFS
    out = await preview_setting(raw, "traffic_buffer_percent", "25")
    assert out["status"] == "success"
    assert "No open job changes right now" in out["message"]
    assert DEFS["traffic_buffer_percent"]["affects"] in out["message"]


async def test_preview_setting_ranking_branch_is_stubbed(raw, store):
    from app.delivery.settings import preview_setting
    out = await preview_setting(raw, "default_promise_days", "30")
    assert out["status"] == "error"
    assert "Phase 3" in out["message"] and "Sorter/Rotation" in out["message"]


async def test_preview_setting_backlog_branch_is_stubbed(raw, store):
    from app.delivery.settings import preview_setting
    out = await preview_setting(raw, "delivery_max_teams", "4")
    assert out["status"] == "error"
    assert "Phase 7" in out["message"] and "Analytics" in out["message"]


async def test_get_delivery_settings_and_preview_delivery_setting_custom_apis_are_registered(raw, store):
    from app.custom_apis import invoke_custom_api
    out = await invoke_custom_api("get_delivery_settings", {}, raw, {})
    assert out["status"] == "success"
    assert out["groups"]
    out2 = await invoke_custom_api("preview_delivery_setting", {"key": "traffic_buffer_percent", "value": "25"}, raw, {})
    assert out2["status"] == "success"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/delivery/test_settings.py -v -k "preview_setting or custom_apis"
```

Expected: FAIL — `preview_setting` not defined / `AttributeError`.

- [ ] **Step 3: Append `preview_setting` and the two custom APIs to `settings.py`**

```python
# Append to app/delivery/settings.py:
from app.custom_apis import CUSTOM_APIS


async def preview_setting(store, key, value) -> dict:
    if not is_delivery_key(str(key if key is not None else "")):
        return {"status": "error", "message": f'"{key}" is not a Delivery setting.'}
    d = DEFS[key]
    current = _values_of(await settings_in_use(store))
    bad = _refusal(key, value, current)
    if bad:
        return {"status": "error", "message": bad}
    shared = f" {d['shared']}'s own ranking reads this number too." if d.get("shared") else ""

    if d["preview"] == "ranking":
        return {"status": "error", "message": "Ranking preview is not available yet (Phase 3 — Sorter/Rotation — has not been ported)."}
    if d["preview"] == "backlog":
        return {"status": "error", "message": "Backlog preview is not available yet (Phase 7 — Analytics — has not been ported)."}
    return {"status": "success", "message": f"No open job changes right now: this number is read when it is needed. {d['affects']}{shared}"}


async def _get_delivery_settings_api(payload: dict, store, ctx: dict) -> dict:
    return {"status": "success", **(await get_settings(store))}


async def _preview_delivery_setting_api(payload: dict, store, ctx: dict) -> dict:
    p = payload or {}
    return await preview_setting(store, p.get("key"), p.get("value"))


CUSTOM_APIS["get_delivery_settings"] = _get_delivery_settings_api
CUSTOM_APIS["preview_delivery_setting"] = _preview_delivery_setting_api
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_settings.py -v
```

Expected: all passed (14 total in this file so far).

- [ ] **Step 5: Commit**

```bash
git add app/delivery/settings.py tests/delivery/test_settings.py
git commit -m "feat(delivery): preview_setting (ranking/backlog stubbed for Phase 3/7) + 2 custom APIs"
```

---

### Task 8: Team roster — stubbed `get_roster`/`seed_roster`, `Delivery_Roster` hooks, 2 custom APIs

Ports `settings.mjs`'s roster section EXCEPT the parts that need `rotation.mjs`'s `ROSTER`/
`rosterFrom` (Phase 3, not yet ported): `get_roster`/`seed_roster` return `fail()` stubs per the
spec's decision ("stub the whole feature, not a partial implementation"). The `Delivery_Roster`
table's own validation hooks (`check_roster`/`log_roster`) have no such dependency and port in
full — a roster row can still be created/edited by hand even before seeding exists; only the
"copy the built-in list" convenience and the "read what rotation will use" read-path are stubbed.

**Files:**
- Modify: `app/delivery/settings.py`
- Test: `tests/delivery/test_settings.py` (same file, appended)

**Interfaces:**
- Produces: `async def get_roster(store) -> dict` (stub: `{"status": "error", "message":
  "The roster is not available yet (Phase 3 — Sorter/Rotation — has not been ported)."}`);
  `async def seed_roster(store, user="") -> dict` (same stub shape); hooks registered on
  `"Delivery_Roster"`; `CUSTOM_APIS["get_delivery_roster"]`, `CUSTOM_APIS["seed_delivery_roster"]`.

- [ ] **Step 1: Write the failing tests (append to `tests/delivery/test_settings.py`)**

```python
ROLES_FORM = "Delivery_Roster"


async def test_roster_row_requires_a_valid_role(raw, store):
    from app.criteria import ZohoError
    with pytest.raises(ZohoError, match="Role must be installer, driver or vehicle"):
        await store.add_record(ROLES_FORM, {"Role": "manager", "Name": "Jo"})


async def test_roster_row_requires_a_name_within_60_chars(raw, store):
    from app.criteria import ZohoError
    with pytest.raises(ZohoError, match="Enter a name"):
        await store.add_record(ROLES_FORM, {"Role": "installer", "Name": ""})
    with pytest.raises(ZohoError, match="too long"):
        await store.add_record(ROLES_FORM, {"Role": "installer", "Name": "x" * 61})


async def test_roster_row_rejects_a_duplicate_name_in_the_same_role(raw, store):
    from app.criteria import ZohoError
    await store.add_record(ROLES_FORM, {"Role": "installer", "Name": "Jo"})
    with pytest.raises(ZohoError, match="already on the installer roster"):
        await store.add_record(ROLES_FORM, {"Role": "installer", "Name": "jo"})  # case-insensitive


async def test_roster_at_least_one_active_per_role_enforced_on_update_and_delete(raw, store):
    from app.criteria import ZohoError
    only = await store.add_record(ROLES_FORM, {"Role": "driver", "Name": "Sam", "Active": True})
    with pytest.raises(ZohoError, match="At least one driver must stay active"):
        await store.update_record(ROLES_FORM, only, {"Active": False})
    with pytest.raises(ZohoError, match="At least one driver must stay active"):
        await store.delete_record(ROLES_FORM, only)


async def test_roster_write_logs_history(raw, store):
    id_ = await store.add_record(ROLES_FORM, {"Role": "installer", "Name": "Jo", "Active": True, "Sort_Order": 1})
    h = await raw.find("Delivery_Settings_History", lambda x: x.get("Setting_Key") == "roster:installer")
    assert len(h) == 1
    assert "Jo (active, order 1)" in h[0]["New_Value"]
    await store.update_record(ROLES_FORM, id_, {"Name": "Jo Cruz"})
    h2 = await raw.find("Delivery_Settings_History", lambda x: x.get("Setting_Key") == "roster:installer")
    assert len(h2) == 2


async def test_get_roster_and_seed_roster_are_stubbed_until_phase_3(raw, store):
    from app.delivery.settings import get_roster, seed_roster
    out = await get_roster(raw)
    assert out["status"] == "error"
    assert "Phase 3" in out["message"] and "Sorter/Rotation" in out["message"]
    out2 = await seed_roster(raw, "admin@x")
    assert out2["status"] == "error"
    assert "Phase 3" in out2["message"]


async def test_get_delivery_roster_and_seed_delivery_roster_custom_apis_are_registered(raw, store):
    from app.custom_apis import invoke_custom_api
    out = await invoke_custom_api("get_delivery_roster", {}, raw, {})
    assert out["status"] == "error"
    out2 = await invoke_custom_api("seed_delivery_roster", {}, raw, {"user": "admin@x"})
    assert out2["status"] == "error"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/delivery/test_settings.py -v -k roster
```

Expected: FAIL — `Delivery_Roster` hooks not registered / `get_roster` not defined.

- [ ] **Step 3: Append the roster section to `settings.py`**

```python
# Append to app/delivery/settings.py:
ROSTER_FORM = "Delivery_Roster"
_ROLES = ["installer", "driver", "vehicle"]
_seeding = False  # "Make editable" writes 13 rows but logs ONE history row, not 13


def _active_rows(rows: list, role: str, except_id=None) -> list:
    return [r for r in rows if _text(r.get("Role")) == role and str(r.get("Active")) != "false" and str(r["ID"]) != str(except_id or "")]


def _row_text(r: dict) -> str:
    active = "inactive" if str(r.get("Active")) == "false" else "active"
    order = "" if blank(r.get("Sort_Order")) else f", order {_text(r.get('Sort_Order'))}"
    return f"{_text(r.get('Name'))} ({active}{order})"


async def _check_roster(args: dict) -> None:
    input_, previous, id_, store = args["input"], args.get("previous"), args.get("id"), args["store"]
    role = _text(input_.get("Role") if "Role" in input_ else (previous or {}).get("Role")).strip()
    name = _text(input_.get("Name") if "Name" in input_ else (previous or {}).get("Name")).strip()
    if role not in _ROLES:
        raise ZohoError(2001, "Role must be installer, driver or vehicle.")
    if not name:
        raise ZohoError(2001, "Enter a name.")
    if len(name) > 60:
        raise ZohoError(2001, "The name is too long (60 characters at most).")
    rows = await store.find(ROSTER_FORM)
    if any(str(r["ID"]) != str(id_ or "") and _text(r.get("Role")) == role and _text(r.get("Name")).strip().lower() == name.lower() for r in rows):
        raise ZohoError(2001, f"{name} is already on the {role} roster.")
    input_["Role"] = role
    input_["Name"] = name
    will_be_active = str(input_.get("Active", (previous or {}).get("Active", "true"))) != "false"
    if previous and not will_be_active and str(previous.get("Active")) != "false" and len(_active_rows(rows, _text(previous.get("Role")), id_)) == 0:
        raise ZohoError(2001, f"At least one {_text(previous.get('Role'))} must stay active.")
    if previous and _text(previous.get("Role")) != role and len(_active_rows(rows, _text(previous.get("Role")), id_)) == 0 and str(previous.get("Active")) != "false":
        raise ZohoError(2001, f"At least one {_text(previous.get('Role'))} must stay active.")


async def _log_roster(store, user: str, role: str, old_v: str, new_v: str) -> None:
    await store.add_record(HISTORY, {"Setting_Key": f"roster:{role}", "Old_Value": old_v, "New_Value": new_v, "Changed_By": user or "", "Changed_At": zoho_now(), "Reason": "", "Effect": "Used from the next nightly rotation; team rows that already exist are not changed."})


async def _roster_after_add(args: dict) -> None:
    if not _seeding:
        await _log_roster(args["store"], args.get("user", ""), _text(args["record"].get("Role")), "", _row_text(args["record"]))


async def _roster_after_update(args: dict) -> None:
    record, previous, store, user = args["record"], args.get("previous"), args["store"], args.get("user", "")
    if previous and _row_text(previous) == _row_text(record) and _text(previous.get("Role")) == _text(record.get("Role")):
        return
    await _log_roster(store, user, _text(record.get("Role")), _row_text(previous) if previous else "", _row_text(record))


async def _roster_before_delete(args: dict) -> None:
    previous, store = args.get("previous") or {}, args["store"]
    rows = await store.find(ROSTER_FORM)
    if str(previous.get("Active")) != "false" and len(_active_rows(rows, _text(previous.get("Role")), previous.get("ID"))) == 0:
        raise ZohoError(2001, f"At least one {_text(previous.get('Role'))} must stay active.")


async def _roster_after_delete(args: dict) -> None:
    previous, store, user = args.get("previous") or {}, args["store"], args.get("user", "")
    await _log_roster(store, user, _text(previous.get("Role")), _row_text(previous), "")


register(ROSTER_FORM, {
    "beforeAdd": _check_roster,
    "beforeUpdate": _check_roster,
    "afterAdd": _roster_after_add,
    "afterUpdate": _roster_after_update,
    "beforeDelete": _roster_before_delete,
    "afterDelete": _roster_after_delete,
})

_ROSTER_NOT_READY = "The roster is not available yet (Phase 3 — Sorter/Rotation — has not been ported)."


async def get_roster(store) -> dict:
    # rosterFrom (rotation.mjs, Phase 3) is not yet ported -- stub the whole read, not a partial one.
    return {"status": "error", "message": _ROSTER_NOT_READY}


async def seed_roster(store, user: str = "") -> dict:
    # ROSTER (rotation.mjs's built-in list, Phase 3) is not yet ported -- stub the whole write.
    return {"status": "error", "message": _ROSTER_NOT_READY}


async def _get_delivery_roster_api(payload: dict, store, ctx: dict) -> dict:
    return await get_roster(store)


async def _seed_delivery_roster_api(payload: dict, store, ctx: dict) -> dict:
    return await seed_roster(store, ctx.get("user", ""))


CUSTOM_APIS["get_delivery_roster"] = _get_delivery_roster_api
CUSTOM_APIS["seed_delivery_roster"] = _seed_delivery_roster_api
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_settings.py -v
```

Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/settings.py tests/delivery/test_settings.py
git commit -m "feat(delivery): Delivery_Roster hooks + get/seed_roster stubbed for Phase 3"
```

---

### Task 9: Wire `app.delivery` into `app/main.py` and run the full regression suite

Mirrors how `app/procurement/apis.py` self-registers every Procurement custom-API module by being
imported from `app/main.py` (confirmed: `import app.procurement` triggers the whole chain). This
phase's equivalent: `app/delivery/__init__.py` imports `app.delivery.settings` (which is what
actually registers the hooks and custom APIs — `app/delivery/locks.py` and
`app/delivery/scoping.py` have no registration side effects of their own, so they do not need an
import here, though `scoping.py` is already separately imported by `app/main.py` directly per
Task 4).

**Files:**
- Modify: `app/delivery/__init__.py`
- Modify: `app/main.py`

**Interfaces:**
- Produces: importing `app.delivery` registers `Policy_Settings`/`Delivery_Roster` hooks and all 4
  custom APIs from this phase (`get_delivery_settings`, `preview_delivery_setting`,
  `get_delivery_roster`, `seed_delivery_roster`) as a side effect, same as `import app.procurement`
  does for Procurement's.

- [ ] **Step 1: Update `app/delivery/__init__.py`**

```python
# Delivery Management. Each sub-module registers its own hooks/custom APIs on import; see
# app/procurement/apis.py for the established pattern this package will grow into across later
# phases. Phase 1 (Foundation): settings.py (Policy_Settings/Delivery_Roster hooks, 4 custom APIs).
import app.delivery.settings  # noqa: F401 -- registers Policy_Settings/Delivery_Roster hooks and get_delivery_settings/preview_delivery_setting/get_delivery_roster/seed_delivery_roster
```

- [ ] **Step 2: Add the import to `app/main.py`**

Near the other module-registration imports (after `import app.procurement`, confirmed at
`app/main.py` around line 25):

```python
import app.delivery  # noqa: F401 -- side effect: registers Delivery Management Phase 1's hooks and custom APIs
```

- [ ] **Step 3: Verify the app still imports and starts cleanly**

```bash
cd /c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2-Python
python -c "import app.main; print('ok')"
```

Expected: prints `ok`, no import errors.

- [ ] **Step 4: Run the full test suite**

```bash
export TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test
pytest -q
```

Expected: PASS — 551 (pre-existing) + this phase's new tests (4 locks + 2 scoping + 19 settings_defs
+ ~22 settings = ~598 total, exact count depends on final assertion-per-test split, confirm the
printed total rather than asserting an exact number here).

- [ ] **Step 5: Commit**

```bash
git add app/delivery/__init__.py app/main.py
git commit -m "feat(delivery): wire app.delivery into app/main.py, completing Phase 1 (Foundation)"
```

---

## Final verification

After Task 9, confirm live behavior against the running local-Postgres dev server (never Railway,
per CLAUDE.md):

```bash
cd /c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2-Python
# start uvicorn against local Postgres (TEST_DATABASE_URL's own DB or a dedicated dev DB), then:
curl -s -b <session-cookie> -X POST http://127.0.0.1:8001/api/invokeCustomApi \
  -H "Content-Type: application/json" \
  -d '{"api_name":"get_delivery_settings","payload":{}}'
```

Expected: `{"code":3000,"result":{"status":"success","settings":[...19 entries...],"groups":[...5 groups...]}}`.

This phase deliberately ships two stubbed behaviors (ranking/backlog preview, and the whole team
roster read/seed) — this is expected and documented, not a bug to fix before moving to Phase 2.
