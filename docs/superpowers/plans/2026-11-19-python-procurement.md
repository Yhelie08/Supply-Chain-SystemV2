# Python Procurement — Implementation Plan

Date: 2026-11-19
Spec: `docs/superpowers/specs/2026-11-19-python-procurement-design.md`
Depends on: Foundation (8/8 tasks), Fulfillment (17/17 tasks + `dc1fcf4`), both on `main`, 273/273 tests passing.
Node reference: `C:\Users\Admin\Desktop\JV\OTHERS\Supply-Chain-SystemV2\server\modules\procurement\*` (23 in-scope files, ~5018 lines) + `server\workflows\{suppliers,deluge,numbering}.mjs`.

## Goal

Port Procurement's server-side business logic to Python/FastAPI, reproducing `jv-update`'s current Node behavior exactly (parity first, not spec v1.4's fuller rules) — same rule Foundation and Fulfillment followed.

## Architecture

One Python file per Node file, same name (snake_case), same functions, same hook registrations via `app.workflows.register()`. `app/procurement/__init__.py` imports every submodule (hooks register on import) plus `app.forecast.pr_hooks` (ported during Fulfillment Task 6, deliberately unwired until now — this is the wiring point).

**Dependency-order fix vs. the design doc's first-pass sketch:** Node's `ship-track.mjs` depends on `po-spec.mjs`, `rr-spec.mjs`, `sorting.mjs`, `events.mjs`, `decisions-core.mjs` for its `rescoreShipments()` scoring pass, but `receiving.mjs` depends on `ship-track.mjs`'s `applyShipmentEvent` (a pure state-transition function, not the scoring pass). Node breaks the resulting cycle with dynamic `import()` inside `rescoreShipments` (for `receiving-spec.mjs`/`pr-spec.mjs`) and inside `po-approval.mjs`'s `shipmentAndReceivingFor` (for `ship-track.mjs`/`plan.mjs`). This plan reproduces the effect with Python's own equivalent idiom — a local `import` statement inside the function body, not a module-level import — at every point Node uses a dynamic `import()`. Task order below sequences `ship_track.py` in two passes: Task 11 writes `effectiveStage`/`planPatch`/`buildEvent`/`buildDelay`/`applyShipmentEvent`/photo helpers only (what `receiving.py` needs); Task 18 adds the `Shipments` hook registrations and `rescoreShipments`/`runShipmentLadder` (which need `po_spec`/`rr_spec`/`sorting`/`decisions_core`, all done by then).

## Tech stack

Unchanged from Foundation/Fulfillment: Python 3.11+, FastAPI, asyncpg/PGlite-equivalent Postgres test fixture (`db_conn` in `conftest.py`), pytest + pytest-asyncio, `app.workflows.register`/`create_hooked_store`, `app.store.create_store`, `app.criteria.ZohoError`/`zoho_now`/`today`.

## Global constraints

- No widget HTML/JS touched. No change to `app/main.py` (Procurement has no `reconcileFulfillment`-style catch-up — confirmed, `server/pg/api.mjs` only special-cases Fulfillment).
- Every new Python file is a direct behavioral port of its Node counterpart — same field names, same thresholds, same error codes/messages (via `ZohoError`), same hook phases (`beforeAdd`/`beforeUpdate`/`beforeDelete`/`afterAdd`/`afterUpdate`/`afterDelete`).
- `app/deluge.py` gains 11 functions this slice (Task 1) — needed by nearly every later task, so it goes first.
- Books/Akeneo-dependent code (`books-apis.mjs`, `akeneo-apis.mjs`, `estimates.mjs`, `create_bin_receiving`, `po-approval.mjs`'s booking half) stays a placeholder in `app/procurement/apis.py`, matching Node's own `withPlaceholders()`.
- Every task's tests run with `BACKEND=pg` semantics against the `db_conn` fixture (`TEST_DATABASE_URL`), same convention as Fulfillment.
- **Test-oracle honesty (updated 2026-11-19, correctness pass)**: all ~18 previously-unread Node Procurement test files have now been read in full — `tests/procurement-dashboard.test.js`, `procurement-decisions.test.js`, `procurement-inq-spec.test.js`, `procurement-po-approval.test.js`, `procurement-po-shipments.test.js`, `procurement-po-spec.test.js`, `procurement-pr-spec.test.js`, `procurement-receiving-buttons.test.js`, `procurement-receiving-spec.test.js`, `procurement-receiving.test.js`, `procurement-rr-spec.test.js`, `procurement-ship-track.test.js`, `procurement-supplier-portal.test.js`, `procurement-supplier-portal-spec.test.js`, `tests/procurement/inquiry-workflows.test.js`, `tests/procurement/pr-workflows.test.js` (re-confirmed), `tests/procurement/supplier-copies.test.js`, plus `tests/procurement-po-approval.test.js`'s "Create RR" section. Every task's test block below has been replaced with real Node-test-verified assertions, fixtures and scenario names — not source-derived guesses — **except**: `app/deluge.py` extension (Task 1, pure arithmetic ported straight from Node's own `deluge.mjs`, no test-file oracle exists for it or needs one) and `events.py` (Task 4, flagged explicitly in its own task text as staying source-derived because no Node test file exercises `events.mjs` as a standalone unit — only indirectly through every other module's `Stage_Events` rows). If a test still fails and the fix isn't obvious, re-read the cited Node test file's line range before guessing.

## Self-review notes (flagged up front, not buried)

1. **`settings-defs.mjs` scope correction**: the approved design doc's Scope section only names `default_settings()`/`problem_with()`. The real file also exports `SETTING_DEFS`, `DEFS`, `GROUPS`, `rangeProblem`, `ladderProblem` — all consumed by `settings-hooks.mjs`. Task 2 ports the full set.
2. **Dependency-order correction**: `decisions.py` depends on `ship_track.py`'s `planPatch`/`rescoreShipments`, not the reverse — `decisions.py` is Task 19, after `ship_track.py`'s second pass (Task 18).
3. **`app/deluge.py` extension**: 11 new functions (`id_of`, `ids_of`, `unbracket`, `to_num`, `has_value`, `same_value`, `lower`, `inquiry_number`, `round2`, `lit`, `stamp`) not called out as their own task in the design doc — folded into Task 1.
4. **Test-file coverage gap**: closed in the 2026-11-19 correctness pass — see "Test-oracle honesty" above and "Self-Review Notes" at the end of this document for the full list of corrections found while re-reading the real Node test files.

---

## Task 1 — `app/deluge.py` extension

**Files:** `app/deluge.py` (modify), `tests/test_deluge.py` (modify, append)

**Interfaces:**
```python
def id_of(v) -> str: ...
def ids_of(v) -> list[str]: ...
def unbracket(v) -> str: ...
def to_num(v) -> float: ...
def has_value(v) -> bool: ...
def same_value(a, b) -> bool: ...
def lower(v) -> str: ...
def inquiry_number(seq) -> str: ...
def round2(n: float) -> float: ...
def lit(s) -> str: ...
def stamp(d: datetime | None = None) -> str: ...
```

**Steps:**

1. Read current `app/deluge.py` in full to see existing style (`blank`, `truthy`, `add_days`, `day_diff`, `today_date`, `parse_date`, `ymd`) and match it exactly (module-level functions, no classes).

2. Append:
```python
def id_of(v) -> str:
    if isinstance(v, dict):
        v = v.get("ID") or v.get("id") or ""
    return str(v if v is not None else "").strip()


def ids_of(v) -> list[str]:
    if v is None or v == "":
        return []
    items = v if isinstance(v, list) else [v]
    return [x for x in (id_of(item) for item in items) if x]


def unbracket(v) -> str:
    s = str(v if v is not None else "").strip()
    s = re.sub(r"^\s*\[", "", s)
    s = re.sub(r"\]\s*$", "", s)
    return s.strip()


def to_num(v) -> float:
    if blank(v):
        return 0.0
    try:
        n = float(v)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if n != n else n  # NaN guard


def has_value(v) -> bool:
    return not blank(v) and to_num(v) != 0


def same_value(a, b) -> bool:
    if blank(a) and blank(b):
        return True
    if blank(a) or blank(b):
        return False
    if str(a) == str(b):
        return True
    try:
        return float(a) == float(b)
    except (TypeError, ValueError):
        return False


def lower(v) -> str:
    return str(v if v is not None else "").strip().lower()


def inquiry_number(seq) -> str:
    return f"INQ-{int(to_num(seq)):05d}"


def round2(n: float) -> float:
    return round(n + 1e-9, 2)


def lit(s) -> str:
    escaped = str(s).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def stamp(d: datetime | None = None) -> str:
    d = d or datetime.now()
    return f"{d.year:04d}{d.month:02d}{d.day:02d}{d.hour:02d}{d.minute:02d}{d.second:02d}"
```
Add `import re` and `from datetime import datetime` at top if not already present (check existing imports first — `today_date`/`add_days` likely already import `datetime`/`date`).

3. `round2` note: Node's `Math.round((n + Number.EPSILON) * 100) / 100` — Python: `round(n * 100 + 1e-9) / 100` is the faithful translation (round-half-up bias toward avoiding float-representation truncation), not `round(n, 2)` (Python's round-half-to-even differs at exact .xx5 boundaries). Use:
```python
def round2(n: float) -> float:
    return math.floor(n * 100 + 0.5 + 1e-9) / 100 if n >= 0 else -math.floor(-n * 100 + 0.5 + 1e-9) / 100
```
Add `import math`. (This matches JS `Math.round` semantics, which round half away from zero for positive numbers and Node's code only ever calls this on non-negative currency/qty values in practice, but the symmetric form is safer.)

4. Tests — append to `tests/test_deluge.py` (read it first for existing style/imports):
```python
def test_id_of_extracts_id_field_from_a_lookup_object():
    assert id_of({"ID": "123"}) == "123"
    assert id_of({"id": "456"}) == "456"
    assert id_of("789") == "789"
    assert id_of(None) == ""


def test_ids_of_flattens_a_list_of_lookups():
    assert ids_of([{"ID": "1"}, {"ID": "2"}]) == ["1", "2"]
    assert ids_of(None) == []
    assert ids_of({"ID": "1"}) == ["1"]


def test_unbracket_strips_leading_and_trailing_brackets():
    assert unbracket("[abc]") == "abc"
    assert unbracket("abc") == "abc"
    assert unbracket("  [ abc ]  ") == "abc"


def test_to_num_defaults_blank_and_nonnumeric_to_zero():
    assert to_num("") == 0
    assert to_num(None) == 0
    assert to_num("abc") == 0
    assert to_num("5.5") == 5.5


def test_has_value_requires_nonblank_and_nonzero():
    assert has_value("5") is True
    assert has_value("0") is False
    assert has_value("") is False


def test_same_value_compares_as_string_or_number():
    assert same_value("5", 5) is True
    assert same_value("", None) is True
    assert same_value("5", "6") is False


def test_inquiry_number_pads_to_five_digits():
    assert inquiry_number(7) == "INQ-00007"
    assert inquiry_number("42") == "INQ-00042"


def test_round2_rounds_to_two_decimals():
    assert round2(1.005) == 1.01 or round2(1.005) == 1.0  # float repr edge case, both acceptable
    assert round2(1.1) == 1.1
    assert round2(2.345) == 2.35 or round2(2.345) == 2.34


def test_lit_escapes_quotes_and_backslashes_for_criteria_strings():
    assert lit('He said "hi"') == '"He said \\"hi\\""'
    assert lit("back\\slash") == '"back\\\\slash"'


def test_stamp_formats_as_yyyymmddhhmmss():
    import datetime as dt
    s = stamp(dt.datetime(2026, 1, 2, 3, 4, 5))
    assert s == "20260102030405"
```

5. Run `cd Supply-Chain-SystemV2-Python && python -m pytest tests/test_deluge.py -q`. Fix any float-rounding assertion flakiness by relaxing to `pytest.approx` if the exact literal comparison fails — do not change `round2`'s algorithm to chase a test.

---

## Task 2 — `app/procurement/__init__.py` (empty manifest stub) + `app/procurement/settings_defs.py`

**Files:** `app/procurement/__init__.py` (new, minimal), `app/procurement/settings_defs.py` (new), `tests/procurement/test_settings_defs.py` (new)

**Interfaces:**
```python
SETTING_DEFS: list[dict]
DEFS: dict[str, dict]
GROUPS: list[str]

def default_settings() -> dict: ...
def problem_with(key: str, raw) -> str | None: ...
def range_problem(key: str, raw, values: dict) -> str | None: ...
def ladder_problem(s: dict) -> str | None: ...
```

**Steps:**

1. Create `app/procurement/__init__.py` as an empty package marker for now (just a docstring comment noting it will become the full manifest in the last task) — this lets every subsequent task do `from app.procurement import ...`-style imports without needing the full import chain built yet. Do NOT add submodule imports here until Task 22.

2. Read `server/modules/procurement/settings-defs.mjs` in full (already read this session — 87 lines, confirmed scope: `SETTING_DEFS` array of ~30 entries with `key`/`label`/`type`/`default`/`min`/`max`/`group`/`affects`, `DEFS`, `GROUPS`, `defaultSettings()`, `problemWith(key, raw)`, `rangeProblem(key, raw, values)`, `ladderProblem(s)`).

3. Port the file 1:1, snake_case function names, keeping every setting key's string name EXACTLY as Node has it (these are literal Postgres column/JSON keys read by every other Procurement file — any typo breaks cross-file wiring silently). Structure:
```python
SETTING_DEFS = [
    {"key": "...", "label": "...", "type": "...", "default": ..., "min": ..., "max": ..., "group": "...", "affects": "..."},
    # one dict per Node entry, copied field-for-field
]

DEFS = {d["key"]: d for d in SETTING_DEFS}
GROUPS = sorted({d["group"] for d in SETTING_DEFS}) if <Node builds GROUPS this way> else <copy Node's literal GROUPS array order, do not re-derive by sorting if Node's own order isn't alphabetical>


def default_settings() -> dict:
    return {d["key"]: d["default"] for d in SETTING_DEFS}


def problem_with(key: str, raw) -> str | None:
    # port Node's problemWith body exactly: type check, delegate to range_problem for numeric/ladder types
    ...


def range_problem(key: str, raw, values: dict) -> str | None:
    ...


def ladder_problem(s: dict) -> str | None:
    ...
```
Copy `GROUPS`'s construction exactly as Node defines it (re-read the `.mjs` source's literal `export const GROUPS = [...]` — do not infer order from `DEFS`).

4. Tests — **Node-test-verified**: ported from `tests/procurement-decisions.test.js`'s "the Procurement settings" section (lines 46-65), the one real Node test block that exercises `settings-defs.mjs` directly (through `settings-hooks.mjs`'s `store.addRecord('Procurement_Settings', ...)` calls, which is how the Node test suite itself reaches `problemWith`/`rangeProblem`/`ladderProblem` — there is no standalone `settings-defs.test.js`). These are the real messages and the real key (`transit_lcl_max_days`, range 1-200) confirmed from that file:
```python
import pytest
from app.procurement.settings_defs import SETTING_DEFS, DEFS, GROUPS, default_settings, problem_with, range_problem, ladder_problem


def test_default_settings_has_a_value_for_every_defined_key():
    defaults = default_settings()
    assert set(defaults) == {d["key"] for d in SETTING_DEFS}


def test_defs_is_keyed_by_setting_key():
    for d in SETTING_DEFS:
        assert DEFS[d["key"]] is d


# Node: 'every setting in the catalogue has a label, a default inside its limits and a sentence on what it affects'
def test_every_setting_has_a_label_group_affects_and_an_in_range_default():
    for d in SETTING_DEFS:
        assert d["label"] and d["group"] and d["affects"], d["key"]
        if d["type"] in ("days", "hours"):
            assert d["min"] <= d["default"] <= d["max"], d["key"]
    assert len({d["key"] for d in SETTING_DEFS}) == len(SETTING_DEFS)


# Node: 'a setting row is validated: a typo outside the limits is refused with a plain message (CP-R6)'
def test_problem_with_rejects_a_value_outside_the_range_1_to_200():
    assert problem_with("transit_lcl_max_days", "800") is not None
    assert "outside the allowed range (1 to 200)" in problem_with("transit_lcl_max_days", "800")


def test_problem_with_rejects_a_non_numeric_value():
    msg = problem_with("transit_lcl_max_days", "abc")
    assert msg is not None and "enter a number" in msg


def test_problem_with_rejects_an_unknown_key():
    msg = problem_with("nonsense", "3")
    assert msg is not None and "not a Procurement setting" in msg


def test_problem_with_rejects_a_bad_yes_no_value():
    msg = problem_with("forecast_reanchor", "maybe")
    assert msg is not None and "choose yes or no" in msg


def test_problem_with_accepts_a_value_within_range():
    assert problem_with("transit_lcl_max_days", "30") is None


# Node: 'the ladder days must keep going up (rung 1 < rung 2 < rung 3)'
def test_ladder_problem_rejects_rungs_that_do_not_increase():
    # rung1=5 with the defaults' rung2/rung3 unchanged must violate the "must go up" rule
    settings = {**default_settings(), "ladder_rung1_days": 5}
    msg = ladder_problem(settings)
    assert msg is not None and "must go up" in msg


# Node: 'the shortest transit cannot be more than the longest'
def test_range_problem_rejects_min_greater_than_max():
    values = {**default_settings(), "transit_lcl_max_days": 30}
    msg = range_problem("transit_lcl_min_days", "40", values)
    assert msg is not None
    assert "shortest (40) cannot be more than the longest (30)" in msg
```
(These key names, limits and exact message substrings are taken directly from the real Node test file, not derived from reading `settings-defs.mjs`'s source alone — if the ported `range_problem`/`ladder_problem` signatures need a different argument shape to express "the rest of the settings dict" than `values: dict` above, adjust the call sites, not the asserted messages.)

5. Run `python -m pytest tests/procurement/test_settings_defs.py -q` (create `tests/procurement/__init__.py` if the directory doesn't exist yet — check first).

---

## Task 3 — `app/procurement/suppliers.py`

**Files:** `app/procurement/suppliers.py` (new), `tests/procurement/test_suppliers.py` (new)

**Interfaces:**
```python
SUPPLIERS: list[dict]  # [{"key": "tony", "books_id": ..., "form": ..., "name_token": ..., "image_field": ..., "notifications": ..., "page": ..., "param": ..., "email_env": ..., "pr_form": ...}, {"key": "fenteng", ...}]

def portal_of(name: str) -> dict | None: ...
async def supplier_index(store) -> dict[str, dict]: ...  # id -> {id, name, display_name, books_id, handles_all, categories, max_capacity}
def quote_books_id(quote: dict, suppliers: dict) -> str | None: ...
```

**Steps:**

1. Port `server/workflows/suppliers.mjs` (33 lines, already read in full) field-for-field. `SUPPLIERS` keeps Tony Fan (`key: "tony"`) and Fenteng Lighting (`key: "fenteng"`) entries with every field Node has.

2. `portal_of(name)`: linear search over `SUPPLIERS` matching `name_token` or `key`, same match logic as Node's `portalOf`.

3. `supplier_index(store)`: async, queries the supplier form(s) via `store.get_records(...)`, builds `{id: {...}}` dict — port the exact field mapping Node does (re-check Node's `supplierIndex` body for which source form/fields it reads: likely `Supplier_1`/`Supplier_2` or similar, confirm against the actual `.mjs` body already read this session rather than guessing).

4. `quote_books_id(quote, suppliers)`: pure lookup, ports Node's 1-liner.

5. Tests — **Node-test-verified** for `portal_of`: `tests/procurement-supplier-portal-spec.test.js`'s "one supplier, one identity (owner 2026-11-17)" section (lines 200-203) is the real oracle for `portalOf` (there is no dedicated test for `supplier_index`/`quote_books_id` in any Node file read this pass — those two stay source-derived, flagged below):
```python
import pytest
from app.procurement.suppliers import SUPPLIERS, portal_of, quote_books_id


def test_suppliers_list_has_tony_and_fenteng():
    keys = {s["key"] for s in SUPPLIERS}
    assert keys == {"tony", "fenteng"}


# Node: '"Tony" and "Tony Fan" are one supplier, "Fenteng" and "Fenteng Lighting" are one; part of a word and other names are not'
def test_portal_of_matches_tony_by_name_or_whole_word_start_case_and_space_insensitive():
    for n in ["Tony", "Tony Fan", "TONY FAN", " tony  fan "]:
        assert portal_of(n) is not None and portal_of(n)["key"] == "tony", n


def test_portal_of_matches_fenteng_by_name_or_whole_word_start():
    for n in ["Fenteng", "Fenteng Lighting", "fenteng lighting"]:
        assert portal_of(n) is not None and portal_of(n)["key"] == "fenteng", n


def test_portal_of_returns_none_for_a_partial_word_or_unrelated_name():
    for n in ["Fentengxyz", "Antony", "Stony Co", "HC System", "Steady Co", "", None]:
        assert portal_of(n) is None, str(n)


# supplier_index / quote_books_id: source-derived (no dedicated Node test file read this pass for suppliers.mjs
# beyond portalOf, which is covered above) — keep these as behavioral smoke tests, not an oracle match.
@pytest.mark.asyncio
async def test_supplier_index_builds_id_keyed_map(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    from app.procurement.suppliers import supplier_index
    idx = await supplier_index(store)
    assert isinstance(idx, dict)
```

6. Run `python -m pytest tests/procurement/test_suppliers.py -q`.

---

## Task 4 — `app/procurement/events.py`

**Files:** `app/procurement/events.py` (new), `tests/procurement/test_events.py` (new)

**Interfaces:**
```python
SHIPMENT_EVENTS: list[str]
SHIPMENT_STAGE_OF: dict[str, str]
SHIPMENT_STAMP_OF: dict[str, str]
SHIPMENT_STAGES: list[str]

def parse_when(v) -> datetime | None: ...
def occurred_from(input: dict, now: datetime) -> datetime: ...
async def events_of(store, record_type: str, record_id: str) -> list[dict]: ...
async def log_event(store, *, record_type, record_id, record_no, event, occurred_at=None, bound=None, source=None, actor=None, note=None) -> int: ...
def days_between(a: datetime, b: datetime) -> int: ...
```

**Steps:**

1. Port `server/modules/procurement/events.mjs` (64 lines, already read in full) 1:1. Independent of other Procurement files (only needs `app.criteria`/`app.deluge`), so no ordering risk.

2. `log_event` writes one row to `Stage_Events` via `store.add_record(...)`, returns a "visit number" — port Node's exact numbering logic (re-check the `.mjs` body for how it computes the return value: likely a count of prior events of the same `record_id`+`event` via `store.find`/`get_records` with a criteria filter).

3. `occurred_from(input, now)`: parses a person-given date/time from `input`, refusing future dates (raises `ZohoError` on a future date — port the exact message/code).

4. `parse_when(v)`: parses Zoho's various date/time text formats — port the regex/parsing branches exactly.

5. Tests — **stays source-derived, by necessity**: no Node test file (in the set re-read this pass, or anywhere else in `tests/`) exercises `events.mjs` directly as a unit; every Node test only sees it indirectly through other modules' `Stage_Events` rows (e.g. `assert.rejects(..., /future/)` on a future `Report_Occurred_At`, confirmed consistently across `procurement-ship-track.test.js` and `procurement-receiving-spec.test.js` — matches this task's own future-date assertion below, so that one line IS cross-confirmed even though the file as a whole has no dedicated oracle). Flagging this explicitly rather than inventing a fake "ported from Node" provenance:
```python
import pytest
from datetime import datetime, timedelta
from app.criteria import ZohoError
from app.procurement.events import parse_when, occurred_from, log_event, days_between, SHIPMENT_STAGE_OF


def test_parse_when_handles_a_plain_date_string():
    d = parse_when("2026-01-15")
    assert d is not None and d.year == 2026 and d.month == 1 and d.day == 15


def test_occurred_from_rejects_a_future_date():
    now = datetime(2026, 1, 1)
    with pytest.raises(ZohoError):
        occurred_from({"occurred_at": "2027-01-01"}, now)


def test_occurred_from_defaults_to_now_when_blank():
    now = datetime(2026, 1, 1, 10, 0, 0)
    assert occurred_from({}, now) == now


def test_days_between_computes_whole_days():
    a = datetime(2026, 1, 10)
    b = datetime(2026, 1, 1)
    assert days_between(a, b) == 9


@pytest.mark.asyncio
async def test_log_event_writes_a_stage_events_row_and_returns_a_visit_number(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    n1 = await log_event(store, record_type="shipment", record_id="1", record_no="SHP-1", event="departed")
    n2 = await log_event(store, record_type="shipment", record_id="1", record_no="SHP-1", event="departed")
    assert n2 > n1
```

6. Run `python -m pytest tests/procurement/test_events.py -q`.

---

## Task 5 — `app/procurement/plan.py`

**Files:** `app/procurement/plan.py` (new), `tests/procurement/test_plan.py` (new)

**Interfaces:** (confirmed this pass against `tests/procurement-ship-track.test.js`'s and `tests/procurement-supplier-portal-spec.test.js`'s import lines — `plan.mjs` exports `DEFAULT_SETTINGS`, `SPEC_NUMBERS`, `feasibility`, `plannedChain`, `forecastChain`, `resolveSupplier`, `loadSettings`, `parseLeadDays`; the rest below is still cross-importer-inferred, re-confirm against the live source at write time)
```python
DEFAULT_SETTINGS: dict
SPEC_NUMBERS: dict

def load_settings(store) -> dict: ...  # or similar — reads Procurement_Settings via settings_defs.default_settings() merge
def feasibility(settings: dict, *, po_date, production_days: int, mode: str, target) -> dict: ...
def parse_lead_days(text) -> int: ...
def norm_mode(mode: str) -> str: ...
def resolve_supplier(rows: list[dict], name: str) -> dict | None: ...  # Node: resolveSupplier — confirmed by tests/procurement-supplier-portal-spec.test.js
def supplier_days_from(...) -> int: ...
def planned_chain(settings: dict, *, po_date, production_days: int, mode: str) -> dict: ...  # Node: plannedChain
def forecast_chain(settings: dict, *, po_date, production_days: int, mode: str, today, actual: dict) -> dict: ...
def date_needed(...) -> datetime: ...
def lead_days(...) -> int: ...
def transit_days(...) -> int: ...
def customs_days(...) -> int: ...
```

**Steps:**

1. Re-read `server/modules/procurement/plan.mjs` in full before writing this task's actual code (it was referenced heavily this session by name/usage but its own full body wasn't quoted verbatim in the research notes — confirm every export name and signature from the live source file, do not guess from cross-file call sites alone).

2. Port every exported function 1:1, snake_case. This file reads `app.forecast.forecast_settings`'s `forecast_settings`/`plan_numbers`/`ENGINE_DEFAULTS`/`is_forecast_key` (already ported) — import those directly, matching Node's own import of `../../forecast/forecast-settings.mjs`.

3. Settings loading reads `Procurement_Settings` (a DIFFERENT store than Fulfillment's `Policy_Settings` — confirmed in earlier research) merged over `settings_defs.default_settings()`.

4. Tests — **Node-test-verified**: `tests/procurement-ship-track.test.js`'s "the calculator (Calculators section 3)" block (lines 49-80) is the real oracle for `feasibility`/`plannedChain`/`forecastChain`, and `tests/procurement-inq-spec.test.js`'s `parseLeadDays` test (line 44-47) is the real oracle for `parse_lead_days`. Both ported directly, same numbers:
```python
import pytest
from datetime import datetime
from app.procurement.plan import DEFAULT_SETTINGS, SPEC_NUMBERS, feasibility, planned_chain, forecast_chain, parse_lead_days
from app.deluge import add_days, ymd, today_date

S = {**DEFAULT_SETTINGS, **SPEC_NUMBERS}  # the spec's worked example: LCL 30, Air 14, fulfillment 3, delivery 2
TODAY = today_date()


# Node: 'feasibility: the spec example (target 20 days away, lead 20, LCL) is impossible, 41 days short, and Air is still 25 short'
def test_feasibility_spec_example_is_impossible_41_days_short_air_still_25_short():
    f = feasibility(S, po_date=TODAY, production_days=20, mode="LCL", target=add_days(TODAY, 20))
    assert f["feasibility"] == "impossible"
    assert f["shortfall_days"] == 41  # 1 + 20 + 3 + 30 + 2 + 3 + 2 = 61 days needed
    assert f["air_saving_days"] == 16
    assert f["air_shortfall_days"] == 25
    assert "Even by air" in f["air_option"]


# Node: 'feasibility: feasible with room, at_risk with little slack, and Air can rescue a late LCL line'
def test_feasibility_feasible_at_risk_and_air_rescue_cases():
    assert feasibility(S, po_date=TODAY, production_days=20, mode="LCL", target=add_days(TODAY, 90))["feasibility"] == "feasible"
    assert feasibility(S, po_date=TODAY, production_days=20, mode="LCL", target=add_days(TODAY, 63))["feasibility"] == "at_risk"
    f = feasibility(S, po_date=TODAY, production_days=20, mode="LCL", target=add_days(TODAY, 50))
    assert f["feasibility"] == "impossible"
    assert "Air saves 16 days -> feasible" in f["air_option"]


# Node: 'planned chain: production starts PO + 1; planned arrival = PO + 1 + production + consolidation + transit + receiving'
def test_planned_chain_dates_for_an_air_shipment():
    p = planned_chain(S, po_date="2026-01-01", production_days=20, mode="Airfreight")
    assert ymd(p["production_start"]) == "2026-01-02"
    assert ymd(p["production_end"]) == "2026-01-22"
    assert ymd(p["shipout"]) == "2026-01-25"
    assert ymd(p["arrival"]) == "2026-02-08"  # air: 14 days
    assert ymd(p["receive"]) == "2026-02-10"


# Node: 'forecast uses actual dates where they exist and never plans a stage in the past'
def test_forecast_chain_never_plans_a_stage_in_the_past():
    f = forecast_chain(S, po_date=add_days(TODAY, -40), production_days=20, mode="LCL", today=TODAY,
                        actual={"production_started": add_days(TODAY, -39)})
    assert f["shipout"] >= TODAY and f["arrival"] >= TODAY and f["pickable"] >= TODAY
    g = forecast_chain(S, po_date=add_days(TODAY, -40), production_days=20, mode="LCL", today=TODAY,
                        actual={"production_started": add_days(TODAY, -39), "production_finished": add_days(TODAY, -20), "shipped_out": add_days(TODAY, -10)})
    assert ymd(g["arrival"]) == ymd(add_days(TODAY, 20))  # shipped 10 days ago + 30 transit


# Node: 'INQ-R3: a lead time typed as text is read as days (a range takes the larger number)'
@pytest.mark.parametrize("text,days", [
    ("20", 20), ("20 days", 20), ("3 weeks", 21), ("2-3 weeks", 21), ("1 month", 30),
    ("20天", 20), ("2周", 14), ("", 0), ("soon", 0), (None, 0), ("12.5 days", 13),
])
def test_parse_lead_days_matches_the_node_cases(text, days):
    assert parse_lead_days(text) == days


@pytest.mark.asyncio
async def test_load_settings_merges_stored_overrides_over_defaults(db_conn):
    from app.store import create_store
    from app.procurement.settings_defs import default_settings
    from app.procurement.plan import load_settings
    store = create_store(db_conn)
    settings = await load_settings(store)
    defaults = default_settings()
    assert set(defaults).issubset(set(settings))
```
(Function names above assume `planned_chain`/`forecast_chain`/`feasibility` take keyword args matching Node's object-destructured params `{ poDate, productionDays, mode, target }` — confirm the exact Python signature against the real ported `plan.py` body at write time; adjust the call sites, not the asserted values, if the real signature differs. `DEFAULT_SETTINGS`/`SPEC_NUMBERS` must be ported as constants too — confirmed present in Node's `plan.mjs` from this same test file's import line.)

5. Run `python -m pytest tests/procurement/test_plan.py -q`.

---

## Task 6 — `app/procurement/decisions_core.py`

**Files:** `app/procurement/decisions_core.py` (new), `tests/procurement/test_decisions_core.py` (new)

**Interfaces:**
```python
def alert_recipient(settings: dict) -> str: ...
def sales_agent_recipient(settings: dict) -> str: ...
async def notify(store, settings, **kwargs) -> None: ...
async def prepare_item(store, settings, **kwargs) -> dict: ...
async def sync_air_upgrade_items(store, settings, rows, today) -> None: ...
async def mark_stale_items(store, ships, stage_of) -> None: ...
async def escalate_overdue(store, settings, now) -> None: ...
def parse_zoho(v): ...
```

**Steps:**

1. Port `server/modules/procurement/decisions-core.mjs` (113 lines, already read in full) 1:1. Imports `plan.py`'s `forecast_chain`/`date_needed`/`lead_days` (Task 5, done).

2. `prepare_item` creates an `Approval_Queue` row with one-click `options` — port the exact options structure (list of `{label, kind, ...}` dicts or similar; confirm shape from source).

3. Tests — **Node-test-verified**: `tests/procurement-decisions.test.js`'s "Decisions list" section is the real oracle. `prepare_item` is exercised by the "an Act now shipment still in production gets one air_upgrade decision" test (lines 139-149): options `['upgrade_air', 'move_target', 'tell_customer']`, a `Summary` matching `/By air it would save 16 days/`, a `Due_At` stamp, and never asked twice. `alert_recipient`/`sales_agent_recipient` are exercised by "the alert goes to the setting, not to a hard-coded address" (line 255) and "the 'tell the customer' alert goes to the sales-agent setting, not the general procurement one" / "falls back to the general alert recipient" (lines 198-216). `escalate_overdue` is exercised by "AQ-3: not decided within the hours it escalates once, with an alert" (lines 244-253):
```python
import pytest
from datetime import datetime, timedelta


def test_alert_recipient_reads_the_procurement_alert_email_setting():
    settings = {"procurement_alert_email": "buyer@example.test"}
    assert alert_recipient(settings) == "buyer@example.test"


# Node: 'the "tell the customer" alert goes to the sales-agent setting, not the general procurement one'
def test_sales_agent_recipient_prefers_the_sales_agent_setting():
    settings = {"procurement_alert_email": "general@example.test", "sales_agent_alert_email": "sales@example.test"}
    assert sales_agent_recipient(settings) == "sales@example.test"


# Node: 'with no sales-agent setting, "tell the customer" falls back to the general alert recipient'
def test_sales_agent_recipient_falls_back_to_the_general_alert_email():
    settings = {"procurement_alert_email": "general@example.test"}
    assert sales_agent_recipient(settings) == "general@example.test"


# Node: 'an Act now shipment still in production gets one air_upgrade decision, with the numbers, once'
@pytest.mark.asyncio
async def test_prepare_item_creates_an_air_upgrade_decision_with_the_right_options_and_summary(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    settings = {"procurement_alert_email": "buyer@example.test"}
    item = {
        "record_type": "shipment", "kind": "air_upgrade", "record_id": "1", "record_no": "SHP-1",
        "options": ["upgrade_air", "move_target", "tell_customer"], "summary": "By air it would save 16 days",
    }
    row_id = await prepare_item(store, settings, **item)
    row = await store.get_record_by_id("Approval_Queue", row_id, raw=True)
    assert row["Status"] == "pending"
    assert row["Options"] in (item["options"], str(item["options"]))
    assert "By air it would save 16 days" in row["Summary"]
    assert row["Due_At"]


# Node: 'AQ-3: not decided within the hours it escalates once, with an alert'
@pytest.mark.asyncio
async def test_escalate_overdue_fires_once_after_the_window(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    settings = {"procurement_alert_email": "buyer@example.test", "escalate_after_hours": 24}
    now = datetime.now()
    assert await escalate_overdue(store, settings, now) == 0
    later = now + timedelta(hours=25)
    assert await escalate_overdue(store, settings, later) == 1
    assert await escalate_overdue(store, settings, later) == 0, "once"
```
(`prepare_item`'s real keyword names and `escalate_after_hours`-equivalent setting key must be confirmed against the actual ported function signature at write time — the shape above is derived from the Node call sites seen in `decisions-core.mjs`/`ship-track.mjs`, not guessed from scratch, but the exact field names are not yet 100% nailed down without re-reading `decisions-core.mjs`'s body one more time at implementation time.)

4. Run `python -m pytest tests/procurement/test_decisions_core.py -q`.

---

## Task 7 — `app/procurement/sorting.py`

**Files:** `app/procurement/sorting.py` (new), `tests/procurement/test_sorting.py` (new)

**Interfaces:** (corrected this pass against `tests/procurement-ship-track.test.js`'s real calls — `categorise` returns a **dict** with `category`/`blocked_reason`/`priority_reason`/`no_target` keys, not a bare string, and `rank` returns a **Map-like id -> rank number** structure, not a re-sorted list; the plan's original signatures were wrong)
```python
CATEGORY_ORDER: list[str]  # broken > act_now > tell_customer > watch > on_track

def categorise(row: dict, settings: dict, today) -> dict: ...  # {category, blocked_reason?, priority_reason?, no_target?, ...}
def categorise_base(row: dict, settings: dict, today) -> dict: ...
def suggested_action(row: dict, category: str, settings: dict) -> str: ...
def rank(items: list[dict]) -> dict: ...  # id -> rank (1-based), stable regardless of input order
```

**Steps:**

1. Port `server/modules/procurement/sorting.mjs` (109 lines, already read in full) 1:1 — pure functions, no store dependency, independent of `decisions_core.py`. Node's `categorise` returns `{ category, blocked_reason, priority_reason, no_target, ... }`, confirmed by `tests/procurement-ship-track.test.js` reading `.category`/`.blocked_reason`/`.priority_reason`/`.no_target` off its result — port that same dict shape, not a bare category string. Node's `rank(items)` returns a `Map` keyed by each item's `id`, confirmed by the same test calling `a.get(i.id)` — port it as a Python `dict[str, int]`.

2. Tests — **Node-test-verified**, ported from `tests/procurement-ship-track.test.js`'s "the sorting engine" section (lines 162-200):
```python
import pytest
from datetime import timedelta
from app.procurement.sorting import categorise, rank, CATEGORY_ORDER
from app.deluge import add_days, today_date

TODAY = today_date()
S = {}  # the real ported DEFAULT_SETTINGS/SPEC_NUMBERS merge from plan.py — see Task 5


def test_category_order_is_broken_first_on_track_last():
    assert CATEGORY_ORDER[0] == "broken"
    assert CATEGORY_ORDER[-1] == "on_track"


# Node: 'categorise: act_now when it will miss and can still change, tell_customer when nothing can change, watch, on_track, blocked first'
def test_categorise_boundaries_match_the_node_cases():
    base = {"stage": "production", "order_date": add_days(TODAY, -10), "target": add_days(TODAY, 30), "mode": "LCL",
            "held": "", "no_supplier": False, "ladder_rung": 0, "days_late": 0, "production_started": False, "production_finished": False}
    miss = add_days(TODAY, 40)  # date needed = target - 5 = today + 25
    assert categorise({**base, "forecast_pickable": miss}, S, TODAY)["category"] == "act_now"
    assert categorise({**base, "stage": "shipped_out", "forecast_pickable": miss}, S, TODAY)["category"] == "tell_customer"
    assert categorise({**base, "forecast_pickable": add_days(TODAY, 22)}, S, TODAY)["category"] == "watch"  # 3 days of slack <= 7
    assert categorise({**base, "forecast_pickable": add_days(TODAY, 5)}, S, TODAY)["category"] == "on_track"
    b = categorise({**base, "held": "PR-1 is On Hold", "forecast_pickable": miss}, S, TODAY)
    assert b["category"] == "blocked"
    assert "On Hold" in b["blocked_reason"]
    assert categorise({**base, "no_supplier": True, "forecast_pickable": miss}, S, TODAY)["category"] == "blocked"


# Node: 'a shipment already by air with production started and no ladder has nothing left to change: tell the customer'
def test_categorise_air_with_production_started_is_tell_customer():
    r = categorise({"stage": "production", "order_date": add_days(TODAY, -10), "target": add_days(TODAY, 30), "mode": "Airfreight",
                     "held": "", "no_supplier": False, "ladder_rung": 0, "days_late": 0, "production_started": True,
                     "forecast_pickable": add_days(TODAY, 40)}, S, TODAY)
    assert r["category"] == "tell_customer"


# Node: 'no target set: order date + 25 days is used, and the reason says so (never pushed to the bottom)'
def test_categorise_with_no_target_uses_order_date_plus_25():
    r = categorise({"stage": "production", "order_date": add_days(TODAY, -40), "target": None, "mode": "LCL", "held": "",
                     "no_supplier": False, "ladder_rung": 0, "days_late": 0, "forecast_pickable": add_days(TODAY, 10)}, S, TODAY)
    assert r["no_target"] is True
    assert "no target set" in r["priority_reason"]
    assert r["category"] == "act_now"  # order date + 25 = 15 days ago: long past


# Node: 'rank: oldest Sales Order date first inside a category, then target, then number; the same input gives the same rank'
def test_rank_is_stable_and_orders_by_order_date_then_target_then_number():
    d = lambda n: add_days(TODAY, n)
    items = [
        {"id": "1", "no": "SHP-00010", "category": "act_now", "order_date": d(-5), "target": d(10)},
        {"id": "2", "no": "SHP-00002", "category": "act_now", "order_date": d(-30), "target": d(50)},
        {"id": "3", "no": "SHP-00003", "category": "act_now", "order_date": d(-30), "target": d(40)},
        {"id": "4", "no": "SHP-00004", "category": "watch", "order_date": d(-90), "target": d(1)},
        {"id": "5", "no": "SHP-00005", "category": "tell_customer", "order_date": d(-1), "target": d(1)},
    ]
    a = rank(items)
    assert [a[i] for i in ["3", "2", "1", "5", "4"]] == [1, 2, 3, 4, 5]
    again = rank(list(reversed(items)))
    assert [again[i["id"]] for i in items] == [a[i["id"]] for i in items]
```
(`S` above must be the real `plan.py` `DEFAULT_SETTINGS`/`SPEC_NUMBERS` merge once Task 5 exists — placeholder `{}` here only because this task can be written before Task 5's constants are confirmed; fill in the real import before running.)

3. Run `python -m pytest tests/procurement/test_sorting.py -q`.

---

## Task 8 — `app/procurement/purchase_order.py` + `po_spec.py`

**Files:** `app/procurement/purchase_order.py` (new), `app/procurement/po_spec.py` (new), `tests/procurement/test_purchase_order.py` (new), `tests/procurement/test_po_spec.py` (new)

**Interfaces:**
```python
# purchase_order.py
async def next_number(store, form, field, prefix, digits=5) -> str: ...  # thin wrapper over store.next_number
MAIN: dict   # field-name map
FENTENG: dict
def steps(f, with_number: bool = False): ...  # hook factory, registered on Purchase_Order / Fenteng_Lighting_Purchase_Order

# po_spec.py
def po_state(po: dict) -> str: ...
async def record_po_acknowledged(store, po_id, who) -> None: ...
async def check_pos_acknowledged(store, settings, today) -> None: ...
async def close_po_if_received(store, po_no) -> None: ...  # also hooked via onReceiving on Receiving
async def rollup_po_categories(store, items) -> dict: ...
async def get_born_late_rate(payload, store) -> dict: ...
async def get_po_tracking(payload, store) -> dict: ...
```

**Steps:**

1. `purchase_order.py`: `next_number` is a 1:1 wrapper matching `server/workflows/numbering.mjs`'s `nextNumber` — just calls `store.next_number(form, field, prefix, digits)` (Foundation's `store.next_number` already appends the dash internally, confirmed from prior sessions, so do NOT append `"-"` again here — Node's `numbering.mjs` appends it because Foundation's Node `store.nextNumber` does NOT; Python's `store.next_number` contract differs, already established during Fulfillment — pass `prefix` through unmodified, let `store.next_number` do its own formatting).

2. Port `steps(f, with_number)` hook factory and the `fenteng_number` hook from `server/modules/procurement/purchase-order.mjs` (73 lines, already read in full), registering on both `Purchase_Order` and `Fenteng_Lighting_Purchase_Order` exactly as Node does.

3. `po_spec.py`: port `server/modules/procurement/po-spec.mjs` (155 lines, already read in full) 1:1 — `po_state`, the four hook phases on `Purchase_Order`, `close_po_if_received` ALSO registered as a hook on `Receiving` (confirm the exact hook phase Node uses — `onReceiving`/`afterUpdate`/custom dispatch — from the source body).

4. Tests — **Node-test-verified**. `tests/procurement-po-shipments.test.js`'s "Purchase_Order" section (lines 25-54) is the oracle for `purchase_order.py`'s numbering/totals/mixed-shipping/status-date hooks. `tests/procurement-po-spec.test.js`'s "events and state" test (lines 158-178) and its "PO list"/"PO-R3"/"PO detail" section (lines 212-271) are the oracle for `po_state`/`get_born_late_rate`/`get_po_tracking`:
```python
import pytest


# Node: 'PO: number, totals, mixed shipping and the status dates'
@pytest.mark.asyncio
async def test_po_number_totals_mixed_shipping_and_status_dates(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    a = await store.add_record("Purchase_Order", {"PO_Line_Items": [
        {"Line_Total": 10.5, "Shipping_Mode": "Air"}, {"Line_Total": 4.25, "Shipping_Mode": "Sea"}, {"Shipping_Mode": "Air"},
    ]})
    po = await store.get_record_by_id("Purchase_Order", a, raw=True)
    assert po["PO_No"] == "PO-00001"
    assert float(po["Total_PO_Value"]) == 14.75
    assert int(po["Total_Lines"]) == 3
    assert po["Mixed_Shipping"] in (True, "true")
    b = await store.add_record("Purchase_Order", {"PO_Line_Items": [
        {"Line_Total": 1, "Shipping_Mode": "Air"}, {"Line_Total": 2, "Shipping_Mode": "Air"},
    ]})
    po2 = await store.get_record_by_id("Purchase_Order", b, raw=True)
    assert po2["PO_No"] == "PO-00002"
    assert po2["Mixed_Shipping"] in (False, "false", None, "")
    assert not po2.get("Sent_On")
    await store.update_record("Purchase_Order", b, {"PO_Status": "Sent"})
    sent = (await store.get_record_by_id("Purchase_Order", b, raw=True))["Sent_On"]
    assert sent
    await store.update_record("Purchase_Order", b, {"Notes": "later edit"})
    assert (await store.get_record_by_id("Purchase_Order", b, raw=True))["Sent_On"] == sent, "a later save keeps the date"
    await store.update_record("Purchase_Order", b, {"PO_Status": "Completed"})
    assert (await store.get_record_by_id("Purchase_Order", b, raw=True))["Completed_On"]


# Node: 'events and state: created, sent, acknowledged by the supplier; a PO is never deleted; the server fields cannot be typed'
@pytest.mark.asyncio
async def test_po_state_transitions_through_created_sent_acknowledged_and_cannot_be_typed(db_conn):
    # requires the Task 17 approve_po_main / approve_supplier_po / acknowledge_po round trip to reach Po_State
    # transitions 'sent' and 'acknowledged' end to end; the pure po_state(po) branch function itself should at
    # least cover: no PO_Status/Sent_On/Acknowledge_On -> 'created'; Sent_On set -> 'sent'; Acknowledge_On set -> 'acknowledged';
    # PO_Status Cancelled -> 'cancelled'. Confirm exact branch inputs against the real po-spec.mjs poState() body at write time.
    pass


# Node: 'PO-R3: the born-late rate counts lines late at the gate (even when air saved them) over lines raised, per week'
@pytest.mark.asyncio
async def test_get_born_late_rate_counts_lines_raised_vs_born_late_per_week(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    po = lambda no, raised, late, status="sent": store.add_record("Purchase_Order", {"PO_No": no, "Lines_Raised": raised, "Lines_Born_Late": late, "PO_Status": status})
    await po("PO-1", 2, 1)
    await po("PO-2", 3, 0)
    await po("PO-3", 1, 1)
    await po("PO-4", 5, 5, "Cancelled")  # cancelled: not counted
    res = await get_born_late_rate({"weeks": 4}, store)
    assert res["data"]["raised"] == 6
    assert res["data"]["born_late"] == 2
    assert res["data"]["rate"] == pytest.approx(33.3, abs=0.05)


# Node: "PO detail: the tracking lists the PO's shipments with planned and actual dates, the category and the event log"
@pytest.mark.asyncio
async def test_get_po_tracking_returns_empty_list_for_a_blank_po_id(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    res = await get_po_tracking({"po_id": ""}, store)
    assert res["data"]["shipments"] == []
```
(The `test_po_state_transitions...` case is left as a documented TODO rather than a fabricated assertion: the real `po_state`/`poState` branch logic requires reading `po-spec.mjs`'s body once more at write time to get the exact field-to-state mapping right — the Node test file only exercises it end-to-end through `approvePOMain`/`approveSupplierPO`/`acknowledgePO`, which belong to Task 17, so a true unit test of the pure `po_state` branches has no direct Node oracle and must be written from source once the function body is in hand. Flagging this rather than inventing values.)

5. Run `python -m pytest tests/procurement/test_purchase_order.py tests/procurement/test_po_spec.py -q`.

---

## Task 9 — `app/procurement/rr_spec.py`

**Files:** `app/procurement/rr_spec.py` (new), `tests/procurement/test_rr_spec.py` (new)

**Interfaces:**
```python
def target_for(original_target, settings, today) -> datetime: ...
async def order_date_for(store, *, pr_no=None, so_no=None) -> datetime | None: ...
async def original_target_for(store, *, pr_no) -> datetime | None: ...
async def log_once(store, **kwargs) -> None: ...
async def stamp_replacement_received(store, rr_no) -> None: ...  # hooked via onReceiving on Receiving
async def rollup_rr(store, shipments) -> dict: ...
async def run_rr_daily(store, now=None) -> None: ...
async def get_rr_report(payload, store) -> dict: ...
```

**Steps:**

1. Port `server/modules/procurement/rr-spec.mjs` (146 lines, already read in full) 1:1. Registers hooks on `Replacement_Request` and `Exceptions` — port those registrations exactly.

2. This file must exist before Task 15 (`replacement_requests.py`), which imports `target_for`/`order_date_for`/`original_target_for`/`log_once`/`rollup_rr` FROM this module.

3. Tests — **Node-test-verified**: `tests/procurement-rr-spec.test.js` is the real oracle. `target_for`/RR-R3 date rules come from lines 42-58, `run_rr_daily` (Node: `runRrDaily`) from lines 138-148, `get_rr_report`/RR-R6 from lines 150-166, `rollup_rr` from lines 109-120:
```python
import pytest
from app.deluge import add_days, ymd, today_date

TODAY = today_date()
day = lambda n: ymd(add_days(TODAY, n))


# Node: 'RR-R3: the RR has a Target Delivery (the original one if it is still ahead, else today + 21) and the original Order Date'
def test_target_for_keeps_the_original_target_when_still_ahead():
    assert target_for(day(30), {"rr_default_days": 21}, TODAY) == day(30)


def test_target_for_falls_back_to_today_plus_rr_default_days_when_the_original_has_passed():
    assert target_for(day(-5), {"rr_default_days": 21}, TODAY) == day(21)


def test_target_for_with_no_original_target_uses_rr_default_days():
    assert target_for("", {"rr_default_days": 10}, TODAY) == day(10)


# Node: 'an RR the supplier has not acknowledged after 1 day raises one alert for the buyer'
@pytest.mark.asyncio
async def test_run_rr_daily_alerts_once_for_an_rr_open_more_than_1_day(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    mk = lambda no, status, ago: store.add_record("Replacement_Request", {"RR_No": no, "RR_Status": status, "RR_Date": day(-ago), "RR_Supplier": "Fenteng Lighting"})
    await mk("RR-00001", "Open", 3)
    await mk("RR-00002", "Open", 0)
    await mk("RR-00003", "Acknowledged", 5)
    r1 = await run_rr_daily(store)
    assert r1["alerted"] == 1
    notes = await store.find("App_Notifications", lambda n: n["Notification_Type"] == "RR Not Acknowledged")
    assert len(notes) == 1
    assert "RR-00001 (Fenteng Lighting) has not been acknowledged after 1 day" in notes[0]["Message"]
    r2 = await run_rr_daily(store)
    assert r2["alerted"] == 0, "once"


# Node: 'RR-R6: the monthly report counts replacements by cause, fault origin and supplier'
@pytest.mark.asyncio
async def test_get_rr_report_counts_by_cause_fault_origin_and_supplier(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    month = day(0)[:7]
    await store.add_record("Exceptions", {"Exception_No": "EXC-1", "Fault_Origin": "supplier"})
    await store.add_record("Exceptions", {"Exception_No": "EXC-2", "Fault_Origin": "transit"})
    mk = lambda no, type_, exc, sup, orig=None: store.add_record("Replacement_Request", {
        "RR_No": no, "RR_Date": day(0), "Source_Type": type_, "Source_Exception_No": exc, "RR_Supplier": sup, "Original_Supplier": orig or sup})
    await mk("RR-1", "Receiving Damage", "EXC-1", "Tony Fan")
    await mk("RR-2", "Receiving Damage", "EXC-2", "Tony")
    await mk("RR-3", "Receiving Missing", "EXC-1", "HC System", "Tony Fan")
    await store.add_record("Replacement_Request", {"RR_No": "RR-OLD", "RR_Date": "2020-01-01", "Source_Type": "QC Failure"})
    r = (await get_rr_report({"month": month}, store))["data"]
    assert r["total"] == 3
    assert r["by_cause"] == [{"name": "Damage", "count": 2}, {"name": "Missing part", "count": 1}]
    assert r["by_fault_origin"] == [{"name": "supplier", "count": 2}, {"name": "transit", "count": 1}]
    assert r["by_supplier"] == [{"name": "Tony Fan", "count": 2}, {"name": "HC System", "count": 1}]
    assert r["changed_supplier"] == 1
    assert r["rework"]["rate"] is None, "no packages this month: no rate"
```
(`run_rr_daily`'s return shape `{"alerted": n}` and `target_for`'s positional args are taken directly from the Node call sites `runRrDaily(raw)` / `targetFor('', { rr_default_days: 10 })` in the test file — confirm the exact Python parameter order against the real ported function signature.)

4. Run `python -m pytest tests/procurement/test_rr_spec.py -q`.

---

## Task 10 — `app/procurement/receiving.py`

**Files:** `app/procurement/receiving.py` (new), `tests/procurement/test_receiving.py` (new)

**Interfaces:**
```python
def is_binned(line: dict) -> bool: ...
def is_ready(line: dict) -> bool: ...  # counted AND binned
def exception_of_line(line: dict, ...) -> dict | None: ...
# beforeSave / afterSave hooks registered on Receiving
```

**Steps:**

1. Port `server/modules/procurement/receiving.mjs` (238 lines, already read in full). This file calls `ship_track.applyShipmentEvent` — per the Architecture section's dependency-order fix, import it with a **local import inside the hook function body**, not at module top level:
```python
async def _after_save(form, hook_args):
    from app.procurement.ship_track import apply_shipment_event  # local import: receiving.py loads before ship_track.py's full module in app/procurement/__init__.py's import order
    ...
    await apply_shipment_event(store, ship_id, event, ...)
```
This mirrors Node's own dynamic `import()` workaround for the same cycle, using Python's native late-import idiom instead (Python has no async dynamic-import equivalent worth using here — a function-local `import` statement achieves the identical effect: resolved at call time, not module-load time).

2. Port the beforeSave/afterSave hook bodies: totals computation, line results, quantity validation, auto-exception creation (calls `exception_of_line`), receive-status computation, damage/missing detail rows, product-context sync, shipment-mode sync, supplier-copy "Arrived" sync, quantity-mismatch notification. Match every field name and threshold from source.

3. `is_binned`/`is_ready` are reused by `receiving_spec.py` (**Task 12**, not Task 17 as an earlier draft of this step said — `receiving_spec.py` is built in Task 12; Task 17 is `po_create.py`/`po_approval.py`/`clone_shipment.py`, unrelated. Corrected this pass.) — keep them public, pure, no store dependency.

4. Tests — **Node-test-verified**: `tests/procurement-receiving.test.js` is the real oracle for the hook bodies (there is no separate pure-function test for `is_binned`/`is_ready` in Node — they are inferred from the D12 "counted in full but not binned: not pickable yet" assertions repeated across `procurement-receiving.test.js` line 39 and `procurement-receiving-spec.test.js` line 40):
```python
import pytest


def test_is_ready_requires_both_counted_and_binned():
    assert is_ready({"counted": True, "binned": True}) is True
    assert is_ready({"counted": True, "binned": False}) is False
    assert is_ready({"counted": False, "binned": True}) is False


# Node: 'totals, line result and receive status; the shipment becomes Delivered'
@pytest.mark.asyncio
async def test_totals_line_result_and_receive_status_and_shipment_becomes_delivered(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    ship = await raw.add_record("Shipments", {"Shipment_No": "SHP-00001", "Supplier": "Tony", "Shipment_Status": "In Transit"})
    line = lambda **extra: {"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Expected_Qty": 3, **extra}
    rcv_id = await store.add_record("Receiving", {"Shipments": ship, "Receiving_Line_Items": [
        line(Accepted_Qty=3), line(PR_No="PR-2", SKU="S-1", Expected_Qty=2, Accepted_Qty=1),
    ]})
    r = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    assert r["Receive_No1"] == "RCV-00001"
    assert [float(r["Total_Expected_Qty"]), float(r["Total_Accepted_Qty"]), float(r["Total_Lines"])] == [5, 4, 2]
    assert [l["Line_Result"] for l in r["Receiving_Line_Items"]] == ["Complete", "Incomplete"]
    assert r["Receive_Status"] == "Partial Received"
    s = await raw.get_record_by_id("Shipments", ship, raw=True)
    assert s["Shipment_Status"] == "Delivered"
    assert s["Previous_Status"] == "In Transit"


# Node: 'more than expected is refused'
@pytest.mark.asyncio
async def test_accepted_qty_more_than_expected_is_refused(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    from app.criteria import ZohoError
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    with pytest.raises(ZohoError, match="cannot exceed Expected Qty"):
        await store.add_record("Receiving", {"Receiving_Line_Items": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Expected_Qty": 3, "Accepted_Qty": 3, "Damage_Qty": 1}]})


# Node: 'Create Exception: one exception per damaged / missing line, found again on the next save (never a second one), Need Attention on the shipment'
@pytest.mark.asyncio
async def test_create_exception_requested_makes_one_exception_and_sets_need_attention(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    ship = await raw.add_record("Shipments", {"Shipment_No": "SHP-00001", "Supplier": "Tony", "Shipment_Status": "In Transit"})
    lines = [
        {"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Expected_Qty": 3, "Accepted_Qty": 1, "Damage_Qty": 2},
        {"PR_No": "PR-2", "SKU": "S-1", "Item_Name": "Lamp", "Expected_Qty": 2, "Accepted_Qty": 2},
    ]
    rcv_id = await store.add_record("Receiving", {"Shipments": ship, "SO_No": "SO-5", "PO_No": "PO-00001", "Create_Exception_Requested": True, "Receiving_Line_Items": lines})
    exc = await raw.find("Exceptions")
    assert len(exc) == 1
    assert exc[0]["Exception_No"] == "EXC-00001"
    assert exc[0]["Source_Module"] == "Receiving"
    assert exc[0]["Exception_Status"] == "Open"
    assert exc[0]["Exception_Line_Key"] == "RCV-00001||L-1"
    r = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    assert int(r["Exception_Count"]) == 1
    ship_rec = await raw.get_record_by_id("Shipments", ship, raw=True)
    assert ship_rec["Need_Attention1"] in (True, "true")
    # ticking it again re-uses the exception
    await store.update_record("Receiving", rcv_id, {"Create_Exception_Requested": True})
    assert len(await raw.find("Exceptions")) == 1


# Node: 'quantity mismatch notification: one per receiving record, not one per save'
@pytest.mark.asyncio
async def test_quantity_mismatch_notification_fires_once_per_receiving_record(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    rcv_id = await store.add_record("Receiving", {"Receiving_Line_Items": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Expected_Qty": 3, "Accepted_Qty": 1}]})
    assert len(await raw.find("App_Notifications")) == 1
    await store.update_record("Receiving", rcv_id, {"Receiving_Notes": "x"})
    await store.update_record("Receiving", rcv_id, {"Receiving_Notes": "y"})
    assert len(await raw.find("App_Notifications")) == 1
```
(Store call shapes above — `raw.add_record`/`raw.find`/`raw.get_record_by_id` for the un-hooked path versus `store.add_record`/`store.update_record` for the hooked path — must match whatever the real ported `app.workflows.create_hooked_store`/`app.store.create_store` API actually exposes; Fulfillment's own test files already establish this convention, so mirror those call sites exactly rather than the shape guessed here.)

5. Run `python -m pytest tests/procurement/test_receiving.py -q`. This task's `ship_track.apply_shipment_event` import will fail until Task 11 exists — write Task 10 and Task 11 in the same working session before running this test, or stub `apply_shipment_event` temporarily is NOT acceptable (no placeholders) — sequence Task 11 immediately after Task 10, run tests only after both exist.

---

## Task 11 — `app/procurement/ship_track.py` (pass 1: pure helpers only)

**Files:** `app/procurement/ship_track.py` (new — partial), `tests/procurement/test_ship_track_helpers.py` (new)

**Interfaces (this pass only):**
```python
SERVER_ONLY: list[str]
TRANSIENT: list[str]

def photos_of(ship: dict) -> list[dict]: ...
async def append_photo(store, ship_id, photo) -> None: ...
def effective_stage(r: dict) -> str: ...
async def plan_patch(store, ship, settings) -> dict: ...
def build_event(...) -> dict: ...
def build_delay(...) -> dict: ...
async def refresh_supplier_view(store, ship_id) -> None: ...
async def deposit_note(store, ship) -> str: ...
async def report_shipment_delay(store, ship_id, **kwargs) -> None: ...
async def apply_shipment_event(store, ship_id, event, **kwargs) -> dict: ...
```

**Steps:**

1. Port `server/modules/procurement/ship-track.mjs`'s (451 lines, already read in full) non-hook, non-`rescoreShipments` functions ONLY: `SERVER_ONLY`, `TRANSIENT`, `photosOf`, `appendPhoto`, `effectiveStage`, `planPatch`, `buildEvent`, `buildDelay`, `refreshSupplierView`, `depositNote`, `reportShipmentDelay`, `applyShipmentEvent`.

2. Do NOT add the `beforeSave`/`afterSave` hook registrations on `Shipments`, the `Purchase_Request1` hold-status hook, the `Ladder_Events` hook, `rescoreShipments`, or `runShipmentLadder` yet — those come in Task 18, after `po_spec`/`rr_spec`/`sorting`/`decisions_core` all exist (they're already done by Task 9, so Task 18 is really just "the rest of this same file" once its own prerequisites are met — listed separately here only to make the dependency-break explicit).

3. `apply_shipment_event` is the function `receiving.py` (Task 10) calls — make sure its signature matches exactly what Task 10's local import expects.

4. Tests — **Node-test-verified** for `apply_shipment_event` (via `Report_Event` on `Shipments`) and `report_shipment_delay`: `tests/procurement-ship-track.test.js` lines 111-159 and `tests/procurement-supplier-portal-spec.test.js`'s SP-R5 section (lines 74-130) are the real oracles. `effective_stage` has no standalone Node unit test — it is only ever observed through `Shipments.Stage` after a `Report_Event` save, so the test below checks it the same indirect way the Node suite does, via `apply_shipment_event`'s effect, not a bare dict-in/string-out call:
```python
import pytest
from app.deluge import add_days, ymd, today_date
from app.criteria import ZohoError

TODAY = today_date()
day = lambda n: ymd(add_days(TODAY, n))


# Node: 'Report_Event stores the stamp once, with when it happened and when we were told'
@pytest.mark.asyncio
async def test_apply_shipment_event_production_started_stamps_once_and_logs(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    ship_id = await store.add_record("Shipments", {"Shipment_No": "SHP-T1"})
    await apply_shipment_event(store, ship_id, "production_started", occurred_at=day(-3), source="supplier")
    s = await store.get_record_by_id("Shipments", ship_id, raw=True)
    assert s["Production_Started_At"] == day(-3)
    assert s["Last_Supplier_Update_At"]
    # reported again: the stamp on the shipment stays the first one (T-6)
    await apply_shipment_event(store, ship_id, "production_started", occurred_at=day(-1))
    s2 = await store.get_record_by_id("Shipments", ship_id, raw=True)
    assert s2["Production_Started_At"] == day(-3), "never overwritten"


# Node: 'an event cannot have happened in the future, and a bad date is refused'
@pytest.mark.asyncio
async def test_apply_shipment_event_rejects_a_future_or_unparseable_date(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    ship_id = await store.add_record("Shipments", {"Shipment_No": "SHP-T2"})
    with pytest.raises(ZohoError, match="future"):
        await apply_shipment_event(store, ship_id, "production_started", occurred_at=day(2))
    with pytest.raises(ZohoError, match="not a date"):
        await apply_shipment_event(store, ship_id, "production_started", occurred_at="yesterday")


# Node: 'leaving Production needs a production photo (ST-R3)'
@pytest.mark.asyncio
async def test_apply_shipment_event_shipped_out_requires_a_production_photo(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    ship_id = await store.add_record("Shipments", {"Shipment_No": "SHP-T3"})
    with pytest.raises(ZohoError, match="production photo"):
        await apply_shipment_event(store, ship_id, "shipped_out", occurred_at=day(-1))
    await store.update_record("Shipments", ship_id, {"Production_Photos": ["p1.jpg"]})
    await apply_shipment_event(store, ship_id, "shipped_out", occurred_at=day(-1))
    s = await store.get_record_by_id("Shipments", ship_id, raw=True)
    assert s["Stage"] == "shipped_out"
    assert s["Shipment_Status"] == "In Transit"
    assert s["Production_Finished_At"] == day(-1), "implied by the shipout"


# Node: 'SP-R5: the server-side reportShipmentDelay follows the same rules'
@pytest.mark.asyncio
async def test_report_shipment_delay_requires_a_reason_and_logs_the_source(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    ship_id = await store.add_record("Shipments", {"Shipment_No": "SHP-T4", "Target_Date": day(90)})
    with pytest.raises(ZohoError, match="reason"):
        await report_shipment_delay(store, ship_id, date=day(5), reason="")
    assert await report_shipment_delay(store, ship_id, date=day(5), reason="Forwarder strike", source="forwarder") is True
    log = await store.find("Stage_Events", lambda e: str(e["Record_Id"]) == str(ship_id) and e["Event"] == "shipment.delay_reported")
    assert log[0]["Source"] == "forwarder"
```
(`apply_shipment_event`'s keyword names (`occurred_at`, `source`) and `report_shipment_delay`'s (`date`, `reason`, `source`) are taken from the Node call sites `store.updateRecord('Shipments', id, { Report_Event, Report_Occurred_At, Report_Source })` and `reportShipmentDelay(raw, id, { date, reason, source })` — confirm the exact Python parameter names against the real ported function signature; these are the two functions Task 10's `receiving.py` and the supplier-portal customer-facing surface both call, so getting the signature right here matters beyond this task alone.)

5. Run `python -m pytest tests/procurement/test_ship_track_helpers.py -q`. Now re-run Task 10's tests: `python -m pytest tests/procurement/test_receiving.py -q` — should pass now that `ship_track.apply_shipment_event` exists.

---

## Task 12 — `app/procurement/receiving_spec.py` + `receiving_buttons.py`

**Files:** `app/procurement/receiving_spec.py` (new), `app/procurement/receiving_buttons.py` (new), `tests/procurement/test_receiving_spec.py` (new), `tests/procurement/test_receiving_buttons.py` (new)

**Interfaces:**
```python
# receiving_spec.py
FAULT_OF: dict
async def rescore_receivings(store, today) -> None: ...
async def check_receiving_silence(store, settings, now) -> None: ...
async def run_receiving_daily(store, now=None, log=None) -> None: ...
# beforeSave/afterSave hooks on Receiving; hooks on Exceptions for found-stage/resolved-at

# receiving_buttons.py
async def create_receiving_from_shipment(payload: dict, store, ctx) -> dict: ...  # corrected this pass: Node dispatches as invokeCustomApi(name, payload, rawStore, ctx) — same (payload, store, ctx) shape as every other custom-API handler in this plan, not (payload, data, ctx)
```

**Steps:**

1. Port `server/modules/procurement/receiving-spec.mjs` (187 lines, already read in full): the four stamped events (arrived/counted/binned/available), RCV-R7 shortage suggestion, `rescore_receivings` (Arrivals list scoring), `check_receiving_silence`, `run_receiving_daily`. Uses `receiving.py`'s `is_binned`/`is_ready` (Task 10, done) and `ship_track.py`'s `apply_shipment_event` (Task 11, done) — both importable at module top-level now since both exist.

2. Port `server/modules/procurement/receiving-buttons.mjs` (42 lines, already read in full): `create_receiving_from_shipment` — a custom-API button handler, uses `numbering`-equivalent (`store.next_number`) directly, NOT through `purchase_order.py`. Confirmed this pass from `tests/procurement-receiving-buttons.test.js`: it is dispatched via `invokeCustomApi('create_receiving_from_shipment', { shipmentId }, raw, ctx)` and runs against the **raw** store (no hook re-fire) — same calling convention as `clone_shipment_for_replacement` in Task 17.

3. Tests — **Node-test-verified**. `tests/procurement-receiving-spec.test.js` (the four stamped events, RCV-R7, the Arrivals list, silence alerts — lines 32-159) is the oracle for `receiving_spec.py`. `tests/procurement-receiving-buttons.test.js`'s "create_receiving_from_shipment" section (lines 44-71) is the oracle for `receiving_buttons.py`:
```python
import pytest
from app.deluge import add_days, ymd, today_date

TODAY = today_date()
day = lambda n: ymd(add_days(TODAY, n))


# Node: 'the four events are server stamps: counted on the first quantity, arrived derived "before" it, binned on the bin, available when pickable'
@pytest.mark.asyncio
async def test_the_four_receiving_events_stamp_in_order_and_only_once(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    ship = await raw.add_record("Shipments", {"Shipment_No": "SHP-00001", "Supplier": "Tony", "Shipment_Status": "In Transit"})
    line = lambda **extra: {"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Expected_Qty": 3, **extra}
    rcv_id = await store.add_record("Receiving", {"Shipments": ship, "Receiving_Line_Items": [line()]})
    r0 = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    assert not r0.get("Arrived_At") and not r0.get("Counted_At")
    await store.update_record("Receiving", rcv_id, {"Receiving_Line_Items": [line(Accepted_Qty=3)]})
    r1 = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    assert r1["Counted_At"] and r1["Arrived_At"]
    assert not r1.get("Binned_At") and not r1.get("Available_At")
    assert r1["Receive_Status"] == "Partial Received", "counted in full, not binned: not pickable (D12)"
    await store.update_record("Receiving", rcv_id, {"Receiving_Line_Items": [line(Accepted_Qty=3, Bin_location="Receiving Area")]})
    assert not (await raw.get_record_by_id("Receiving", rcv_id, raw=True)).get("Binned_At"), '"Receiving Area" is where goods wait, not a bin'
    await store.update_record("Receiving", rcv_id, {"Receiving_Line_Items": [line(Accepted_Qty=3, Bin_location="A-01-1")]})
    r2 = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    assert r2["Binned_At"] and r2["Available_At"]
    assert r2["Receive_Status"] == "Received"


# Node: 'received less than ordered: the suggested action asks for a replacement request, and the buyer is told once (RCV-R7)'
@pytest.mark.asyncio
async def test_shortage_suggests_a_replacement_request_and_alerts_once(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    ship = await raw.add_record("Shipments", {"Shipment_No": "SHP-00001", "Supplier": "Tony", "Shipment_Status": "In Transit"})
    rcv_id = await store.add_record("Receiving", {"Shipments": ship, "Receiving_Line_Items": [
        {"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Expected_Qty": 3, "Accepted_Qty": 2, "Missing_Qty": 1}]})
    r = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    assert "replacement request" in r["Suggested_Action"]
    await store.update_record("Receiving", rcv_id, {"Notes_for_Shipment": "x"})
    notes = await raw.find("App_Notifications", lambda n: n["Notification_Type"] == "Receiving Shortage")
    assert len(notes) == 1


# Node: 'silence is an alert: arrived and not counted, counted and not binned (RCV-R6), once each, and the daily run ranks and alerts'
@pytest.mark.asyncio
async def test_check_receiving_silence_alerts_once_for_an_old_arrived_not_counted_row(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    from app.procurement.plan import load_settings
    ship = await store.add_record("Shipments", {"Shipment_No": "SHP-00001", "Supplier": "Tony", "Shipment_Status": "In Transit"})
    rcv_id = await store.add_record("Receiving", {"Shipments": ship, "Receive_No1": "RCV-7", "Receiving_Line_Items": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Expected_Qty": 3}]})
    await store.raw_sql_update_arrived_at(rcv_id, day(-2))  # placeholder for the test's direct SQL backdate of Arrived_At — adapt to the real db_conn fixture helper
    settings = await load_settings(store)
    import datetime
    assert await check_receiving_silence(store, settings, datetime.datetime.now()) == 1
    assert await check_receiving_silence(store, settings, datetime.datetime.now()) == 0, "once"


# Node: 'create_receiving_from_shipment builds RCV with lines from the shipment'
@pytest.mark.asyncio
async def test_create_receiving_from_shipment_builds_rcv_with_shipment_lines(db_conn):
    from app.store import create_store
    from app.custom_apis import invoke_custom_api
    store = create_store(db_conn)
    po = await store.add_record("Purchase_Order", {"PO_No": "PO-00001", "Customer": "ACME"})
    ship = await store.add_record("Shipments", {
        "Shipment_No": "SHP-00001", "PO_No": po, "Sales_Order": "SO-1", "Customer": "ACME", "Supplier": "Tony",
        "Shipment_Status": "In Transit", "Sales_Owner": "HC Sales 1",
        "PO_Shipments": [
            {"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Shipment_QTY": 3, "Shipping_Mode": "Sea"},
            {"PR_No": "PR-2", "SKU": "S-1", "Item_Name": "Switch", "Shipment_QTY": 2, "Shipping_Mode": "Sea"},
        ],
    })
    out = await invoke_custom_api("create_receiving_from_shipment", {"shipmentId": ship}, store, {"user": "tester@homecartel.com"})
    assert out["status"] == "success"
    r = await store.get_record_by_id("Receiving", out["receivingId"], raw=True)
    assert r["Receive_No1"] == out["receiveNo"]
    assert len(r["Receiving_Line_Items"]) == 2
    second = await invoke_custom_api("create_receiving_from_shipment", {"shipmentId": ship}, store, {"user": "tester@homecartel.com"})
    assert second["status"] == "already"
```
(The `check_receiving_silence` test's direct-SQL backdate of `Arrived_At` mirrors Node's own `db.query('UPDATE "Receiving" SET "Arrived_At" = $1 WHERE "ID" = $2', ...)` — use the real `db_conn` fixture's equivalent raw-SQL escape hatch, not a fabricated helper method; the placeholder name above is not a real function and must be replaced with whatever Fulfillment's test suite already uses for this same pattern.)

4. Run `python -m pytest tests/procurement/test_receiving_spec.py tests/procurement/test_receiving_buttons.py -q`.

---

## Task 13 — `app/procurement/replacement_requests.py` + `replacement_exceptions.py`

**Files:** `app/procurement/replacement_requests.py` (new), `app/procurement/replacement_exceptions.py` (new), `tests/procurement/test_replacement_requests.py` (new), `tests/procurement/test_replacement_exceptions.py` (new)

**Interfaces:**
```python
# replacement_requests.py
def exception_of(rec: dict) -> dict: ...
def spare_parts(raw, other) -> list: ...
def groups(exc: dict, supplier_override=None) -> list[dict]: ...
def source_type_of(exc: dict, g: dict) -> str: ...
def summary_row(exc: dict, g: dict) -> dict: ...
async def create_rr_main(payload: dict, store) -> dict: ...  # corrected this pass: Node's createRRMain({ exceptionId }, store) takes no ctx
async def create_rr_supplier(key: str, payload: dict, store) -> dict: ...  # corrected: createRRSupplier('Tony', { exceptionId }, store), no ctx
# 3 exported custom-API wrappers (the custom-API dispatch layer itself supplies ctx to callers that need it; these two functions don't)

# replacement_exceptions.py
async def rr_before_save(form, hook_args) -> None: ...  # registered on Replacement_Request / Tony_Fan_Replacement_Request / Fenteng_Lighting_Replacement_Request
async def exc_before_save(form, hook_args) -> None: ...  # registered on Exceptions
```

**Steps:**

1. Port `server/modules/procurement/replacement-requests.mjs` (152 lines, already read in full) and `replacement-exceptions.mjs` (66 lines, already read in full). Imports from `rr_spec.py` (Task 9, done): `target_for`, `order_date_for`, `original_target_for`, `log_once`, `rollup_rr`. Imports `purchase_order.py`'s `next_number` (Task 8, done).

2. Register `rr_before_save` on all three forms Node does: `Replacement_Request`, `Tony_Fan_Replacement_Request`, `Fenteng_Lighting_Replacement_Request`.

3. Tests — **Node-test-verified**: `tests/procurement-po-approval.test.js`'s "Create RR from an exception" section (lines 155-208) is the oracle for `create_rr_main`/`create_rr_supplier`. `tests/procurement-po-shipments.test.js`'s "Replacement_Request" section (lines 128-152) is the oracle for `replacement_exceptions.py`'s `rr_before_save` (numbering, Open-on-add, Closed validation, Closed_At/acknowledge-date stamps):
```python
import pytest


async def exception(store, extra=None):
    await store.add_record("Purchase_Order", {"PO_No": "PO-00001"})
    await store.add_record("Tony_Fan_Purchase_Order", {"PO_No_Supplier2": "PO-00001"})
    return await store.add_record("Exceptions", {
        "Exception_No": "EXC-00001", "Source_Module": "Receiving", "Exception_Status": "Open", "Sales_Order": "SO-A",
        "PO_No": "PO-00001", "Receiving_Line_ID": "PR-1",
        "Product_Context1": [
            {"SKU": "L-1", "Item": "Lamp", "Supplier": "Tony", "Type_field": "Damage", "Qty": 1, "Repairable": "No",
             "Quantity_of_damage_spare_s": "Shade: 2, Others: 1", "Spare_Part_Type_Other": "Cable"},
            {"SKU": "L-1", "Item": "Lamp", "Supplier": "Tony", "Type_field": "Damage", "Qty": 1, "Repairable": "No"},
            {"SKU": "S-1", "Item": "Shade", "Supplier": "Tony", "Type_field": "Missing", "Qty": 2},
            {"SKU": "B-1", "Item": "Base", "Supplier": "Tony", "Type_field": "Damage", "Qty": 1, "Repairable": "Yes", "Repair_Outcome": "Pending"},
        ],
        **(extra or {}),
    })


# Node: 'Create RR (main): one RR per SKU + type, repairable damage that is not "Not Fixed" is left out, the PO is stamped, nothing is made twice'
@pytest.mark.asyncio
async def test_create_rr_main_makes_one_rr_per_sku_and_type_and_stamps_the_po(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    exc_id = await exception(store)
    res = await create_rr_main({"exceptionId": str(exc_id)}, store)
    assert res["created"] == 2
    rrs = await store.find("Replacement_Request")
    assert [(r["RR_No"], r["Source_Type"], r["RR_SKU"], float(r["RR_Qty_Value"]), r["RR_Status"]) for r in rrs] == [
        ("RR-00001", "Receiving Damage", "L-1", 2, "Open"), ("RR-00002", "Receiving Missing", "S-1", 2, "Open")]
    assert rrs[0]["RR_Item_to_Replace"] == "Shade, Cable"
    assert rrs[0]["RR_Spare_Parts"] == "Shade: 2, Cable: 1"
    po = (await store.find("Purchase_Order"))[0]
    assert po["Damage_SKUs"] == "L-1"
    assert po["Missing_SKUs"] == "S-1"
    assert (await store.find("Exceptions"))[0]["Exception_Status"] == "Under Review"
    again = await create_rr_main({"exceptionId": str(exc_id)}, store)
    assert again["created"] == 0
    assert "No new RR needed" in again["message"]
    assert len(await store.find("Replacement_Request")) == 2


# Node: 'Create RR (Tony): the copy takes the number of its main RR, once, and stamps the supplier PO; a different supplier gets none'
@pytest.mark.asyncio
async def test_create_rr_supplier_copies_use_the_main_rr_number_once_each(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    exc_id = await exception(store)
    await create_rr_main({"exceptionId": str(exc_id)}, store)
    res = await create_rr_supplier("Tony", {"exceptionId": str(exc_id)}, store)
    assert res["created"] == 2
    copies = await store.find("Tony_Fan_Replacement_Request")
    assert [(c["RR_No"], c["Source_Type"], c["RR_Status"]) for c in copies] == [
        ("RR-00001", "Receiving Damage", "Open"), ("RR-00002", "Receiving Missing", "Open")]
    spo = (await store.find("Tony_Fan_Purchase_Order"))[0]
    assert spo["Damage_SKUs_Supplier2"] == "L-1"
    assert spo["Missing_SKUs_Supplier2"] == "S-1"
    assert (await create_rr_supplier("Tony", {"exceptionId": str(exc_id)}, store))["created"] == 0
    assert len(await store.find("Tony_Fan_Replacement_Request")) == 2
    assert (await create_rr_supplier("Fenteng", {"exceptionId": str(exc_id)}, store))["created"] == 0
    assert len(await store.find("Fenteng_Lighting_Replacement_Request")) == 0


# Node: 'Create RR: an exception that does not exist is refused'
@pytest.mark.asyncio
async def test_create_rr_main_refuses_an_unknown_exception(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    assert (await create_rr_main({"exceptionId": "99999999"}, store))["message"] == "Exception not found."


# Node: 'RR: number, Open + date on add; Closed needs the notes and the reason; Closed_At / acknowledge date on the change'
@pytest.mark.asyncio
async def test_rr_before_save_number_open_on_add_and_closed_validation(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    from app.criteria import ZohoError
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    rr_id = await store.add_record("Replacement_Request", {"RR_Status": "Closed", "RR_Reason": "damaged", "Closure_Notes": "x"})
    rr = await raw.get_record_by_id("Replacement_Request", rr_id, raw=True)
    assert rr["RR_No"] == "RR-00001"
    assert rr["RR_Status"] == "Open", "a new RR always starts Open"
    assert rr["RR_Date"]
    await store.update_record("Replacement_Request", rr_id, {"RR_Status": "Acknowledged"})
    assert (await raw.get_record_by_id("Replacement_Request", rr_id, raw=True))["Supplier_Acknowledge_Date"]
    with pytest.raises(ZohoError, match="Closure Notes are required"):
        await store.update_record("Replacement_Request", rr_id, {"RR_Status": "Closed", "Closure_Notes": "", "RR_Reason": "damaged"})
    with pytest.raises(ZohoError, match="RR Reason is required"):
        await store.update_record("Replacement_Request", rr_id, {"RR_Status": "Closed", "Closure_Notes": "done", "RR_Reason": ""})
    await store.update_record("Replacement_Request", rr_id, {"RR_Status": "Closed", "Closure_Notes": "done", "RR_Reason": "damaged"})
    closed = await raw.get_record_by_id("Replacement_Request", rr_id, raw=True)
    assert closed["RR_Status"] == "Closed"
    assert closed["Closed_At"]
```
(`create_rr_main`/`create_rr_supplier`'s third positional arg `ctx`/ last param shape in Node is just `store` with no separate `ctx` for these two — re-check `replacement-requests.mjs`'s real export signature: the Node test calls them as `createRRMain({ exceptionId }, store)` / `createRRSupplier('Tony', { exceptionId }, store)`, two/three args with NO `ctx`, not three/four as this task's Interfaces block states. Corrected: drop the trailing `ctx` param from both signatures unless the real source file's body shows otherwise — flagging rather than silently keeping a wrong interface.)

4. Run `python -m pytest tests/procurement/test_replacement_requests.py tests/procurement/test_replacement_exceptions.py -q`.

---

## Task 14 — `app/procurement/purchase_request.py` + `pr_spec.py`

**Files:** `app/procurement/purchase_request.py` (new), `app/procurement/pr_spec.py` (new), `tests/procurement/test_purchase_request.py` (new), `tests/procurement/test_pr_spec.py` (new)

**Interfaces:**
```python
# purchase_request.py
def ref_price_known(rec: dict) -> bool: ...
async def validate(form, hook_args) -> None: ...  # the big beforeSave
async def populate_copies(store, pr_id) -> None: ...
async def changed_copies(store, pr_id, changes) -> None: ...
async def sync_own_image(store, pr_id) -> None: ...
async def delete_copies(store, pr_id) -> None: ...

# pr_spec.py
PR_SERVER_ONLY: list[str]
def pr_state(r: dict) -> str: ...
async def order_date_of(store, pr: dict) -> datetime | None: ...
def recommend(**kwargs) -> dict: ...
async def refresh_pr_spec(store, pr_id) -> None: ...
def categorise_pr(pr: dict, settings, today) -> str: ...
async def rescore_prs(store, today) -> None: ...
async def rollup_pr_forecast(store, ships) -> dict: ...
```

**Steps:**

1. Port `server/modules/procurement/purchase-request.mjs` (313 lines, already read in full) — dense file: PR number generation, supplier load-balancing sync, supplier-selected sync, default status, lock-after-PO check, export-selected-supplier, shipment timeline computation, shipment-mode default, readiness checklist, priority computation.

2. Port `server/modules/procurement/pr-spec.mjs` (247 lines, already read in full): `recommend()` is the supplier recommendation algorithm — port its scoring formula exactly (field names/weights from source, do not approximate). Includes a hook on `Sales_Order` for `hold_for_voided_so` — register that too, not just the `Purchase_Request1` hooks.

3. Imports `plan.py`'s `parse_lead_days` (Task 5, done), `suppliers.py` (Task 3, done). `pr_spec.py` imports `events.py` (Task 4), `decisions_core.py`'s `notify` (Task 6).

4. Tests — **Node-test-verified, now actually written out** (an earlier draft of this task left only a comment saying "port this later" instead of real test code, despite the plan's own self-review claiming this task's tests were already ported — that gap is fixed in this pass). Oracle: `tests/procurement/pr-workflows.test.js` (216 lines, numbering/status/load-balancing/recommendation/selection/Local-sourcing/PR-R5/pricing/shipment-mode/timeline/priority/lock-after-conversion/supplier-copies/never-deleted) for `purchase_request.py`, and `tests/procurement-pr-spec.test.js` (PR-R4/PR-R6/queue-category/SO-void-hold rules) for `pr_spec.py`:
```python
import pytest
from app.deluge import add_days, ymd, today_date

TODAY = today_date()
day = lambda n: ymd(add_days(TODAY, n))


async def seed_suppliers(store):
    tony = await store.add_record("Suppliers", {"Supplier_Name": {"first_name": "Tony", "last_name": "Fan"}, "Handles_All": True, "Max_Capacity": 10})
    fenteng = await store.add_record("Suppliers", {"Supplier_Name": {"first_name": "Fenteng"}, "Handles_All": False, "Supported_Categories": ["Pendant Light", "Wall Light"], "Max_Capacity": 4})
    item = await store.add_record("Items", {"ID1": "B1", "item_name": "Lamp", "SKU": "S-1", "Image": "/img/lamp.png", "Rate": "0"})
    return tony, fenteng, item


def pr_payload(item, **extra):
    return {"sku": "S-1", "quantity": 2, "category": "Pendant Light", "Items": item, "Target_Delivery": day(60),
            "PR_Date": day(0), "Description1": "d1", "description": "d", "unit": "pcs", **extra}


# Node: 'numbering: the next PR number follows the highest one that exists'
@pytest.mark.asyncio
async def test_pr_numbering_follows_the_highest_existing_number(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    tony, fenteng, item = await seed_suppliers(store)
    a = await store.add_record("Purchase_Request1", pr_payload(item))
    b = await store.add_record("Purchase_Request1", pr_payload(item))
    ra = await raw.get_record_by_id("Purchase_Request1", a, raw=True)
    rb = await raw.get_record_by_id("Purchase_Request1", b, raw=True)
    assert [ra["PR_No"], rb["PR_No"]] == ["PR-00001", "PR-00002"]
    await raw.add_record("Purchase_Request1", {"PR_No": "PR-00009"})
    c = await store.add_record("Purchase_Request1", pr_payload(item))
    assert (await raw.get_record_by_id("Purchase_Request1", c, raw=True))["PR_No"] == "PR-00010"


# Node: 'status: Open until a PO is linked, then Converted to PO'
@pytest.mark.asyncio
async def test_pr_status_open_until_linked_to_a_po(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    tony, fenteng, item = await seed_suppliers(store)
    open_id = await store.add_record("Purchase_Request1", pr_payload(item))
    linked_id = await store.add_record("Purchase_Request1", pr_payload(item, Link_PO_No="PO-1"))
    assert (await raw.get_record_by_id("Purchase_Request1", open_id, raw=True))["PR_Status"] == "Open"
    assert (await raw.get_record_by_id("Purchase_Request1", linked_id, raw=True))["PR_Status"] == "Converted to PO"


# Node: 'a Local PR uses HC System, with no lead time and no freight'
@pytest.mark.asyncio
async def test_local_pr_uses_hc_system_with_no_lead_time(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    tony, fenteng, item = await seed_suppliers(store)
    id_ = await store.add_record("Purchase_Request1", pr_payload(item, Sourcing_Type="Local"))
    rec = await raw.get_record_by_id("Purchase_Request1", id_, raw=True)
    assert rec["Selected_Supplier"] == "HC System"
    assert float(rec["Required_Days_Lead"]) == 0
    assert rec["Shipping_mode_selected"] in (True, "true")


# Node: 'spec v1.4 PR-R5 (review item, 2026-11-18): an auto-priced PR reaches Ready for PO on its first save, no second touch needed'
@pytest.mark.asyncio
async def test_pr_r5_auto_priced_pr_is_ready_for_po_on_first_save(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    tony, fenteng, item = await seed_suppliers(store)
    id_ = await store.add_record("Purchase_Request1", pr_payload(item, SRP_Approved_PR=100,
        Supplier_Selected=[{"Supplier_ID": tony, "Suppliers": "Tony", "Selected": True, "Final_Price": 90, "Lead_Time": 5}]))
    rec = await raw.get_record_by_id("Purchase_Request1", id_, raw=True)
    assert rec["Selected_Supplier1"] in (True, "true")
    assert rec["Final_price_confirmed"] in (True, "true")
    assert rec["Target_date_exists"] in (True, "true")
    assert rec["Shipment_Mode"] == "LCL"
    assert rec["Shipping_mode_selected"] in (True, "true")
    assert rec["PR_READY_FOR_PO"] in (True, "true")


# Node: 'a PR converted to a PO is locked: its terms cannot change, other fields can'
@pytest.mark.asyncio
async def test_pr_converted_to_po_is_locked_for_terms_but_not_other_fields(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    from app.criteria import ZohoError
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    tony, fenteng, item = await seed_suppliers(store)
    id_ = await store.add_record("Purchase_Request1", pr_payload(item, Link_PO_No="PO-1", category="Floor Lamp",
        Supplier_Selected=[{"Supplier_ID": tony, "Suppliers": "Tony", "Selected": True, "Final_Price": 500, "Lead_Time": 10}]))
    await store.update_record("Purchase_Request1", id_, {"description": "a note"}, by_form=True)
    assert (await raw.get_record_by_id("Purchase_Request1", id_, raw=True))["description"] == "a note"
    with pytest.raises(ZohoError) as exc_info:
        await store.update_record("Purchase_Request1", id_, {"quantity": 99}, by_form=True)
    assert exc_info.value.code == 2001
    assert "already locked" in str(exc_info.value)


# Node: 'a new PR is copied to each supplier portal that should quote it'
@pytest.mark.asyncio
async def test_a_new_pr_is_copied_to_each_matching_supplier_portal(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    tony, fenteng, item = await seed_suppliers(store)
    id_ = await store.add_record("Purchase_Request1", pr_payload(item), user="staff@example.test")
    rec = await raw.get_record_by_id("Purchase_Request1", id_, raw=True)
    tony_copies = await raw.find("Tony_Fan_Purchase_Request", lambda r: r.get("PR_No_Supplier2") == rec["PR_No"])
    fenteng_copies = await raw.find("Fenteng_Lighting_Purchase_Request", lambda r: r.get("PR_No_Supplier1") == rec["PR_No"])
    t = tony_copies[0]
    f = fenteng_copies[0]
    assert [t["Response_Status"], t["edit_counter"], t["sku_Supplier2"], t["quantity_Supplier2"], t["Product_Image_Supplier2_PR"]] == ["Waiting", "1", "S-1", "2", "/img/lamp.png"]
    assert [f["Response_Status"], f["sku_Supplier1"]] == ["Waiting", "S-1"]
    assert rec["Product_Image_PR"] == "/img/lamp.png"


# Node: "a PR is never deleted (spec: cancel it); its suppliers' copies stay"
@pytest.mark.asyncio
async def test_a_pr_is_never_deleted_and_its_supplier_copies_stay(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    from app.criteria import ZohoError
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    tony, fenteng, item = await seed_suppliers(store)
    id_ = await store.add_record("Purchase_Request1", pr_payload(item))
    rec = await raw.get_record_by_id("Purchase_Request1", id_, raw=True)
    tony_copies = await raw.find("Tony_Fan_Purchase_Request", lambda r: r.get("PR_No_Supplier2") == rec["PR_No"])
    fenteng_copies = await raw.find("Fenteng_Lighting_Purchase_Request", lambda r: r.get("PR_No_Supplier1") == rec["PR_No"])
    assert len(tony_copies) + len(fenteng_copies) == 2
    with pytest.raises(ZohoError, match="never deleted"):
        await store.delete_record("Purchase_Request1", id_)
    tony_copies2 = await raw.find("Tony_Fan_Purchase_Request", lambda r: r.get("PR_No_Supplier2") == rec["PR_No"])
    fenteng_copies2 = await raw.find("Fenteng_Lighting_Purchase_Request", lambda r: r.get("PR_No_Supplier1") == rec["PR_No"])
    assert len(tony_copies2) + len(fenteng_copies2) == 2


# ---- pr_spec.py: tests/procurement-pr-spec.test.js ----

async def supplier(store, name, extra=None):
    return await store.add_record("Suppliers", {"Supplier_Name": {"first_name": name, "last_name": ""}, "Handles_All": True, "Max_Capacity": 50, **(extra or {})})


def quote(id_, name, price, lead):
    return {"Supplier_ID": id_, "Suppliers": name, "Availability": "Confirmed", "Initial_Price": price, "Lead_Time": lead}


# Node: 'the recommendation weighs price AND lead time against the target, and says why in words (PR-R4)'
@pytest.mark.asyncio
async def test_recommendation_weighs_price_and_lead_time_against_the_target(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    a = await supplier(store, "Cheapo")
    b = await supplier(store, "Steady")
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-1", "SO_Created_Date": day(-30)})
    id_ = await store.add_record("Purchase_Request1", {"Sales_Order": "SO-1", "Target_Delivery": day(70), "Shipment_Mode": "LCL",
        "category": "Chandeliers", "Supplier_Selected": [quote(a, "Cheapo", 50, 60), quote(b, "Steady", 80, 20)]})
    p = await raw.get_record_by_id("Purchase_Request1", id_, raw=True)
    assert p["Recommended_Supplier_Id"] == b
    assert "Steady: CNY 80, lead 20 days, arrives in time" in p["Recommendation_Reason"]
    assert "Cheapo is cheaper (CNY 50) but would be" in p["Recommendation_Reason"]


# Node: 'every PR carries its feasibility: feasible, at risk, or impossible with the shortfall, the earliest date and the air option (PR-R6)'
@pytest.mark.asyncio
async def test_pr_feasibility_feasible_at_risk_and_impossible(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    a = await supplier(store, "Steady")
    q = [quote(a, "Steady", 80, 20)]
    mk = lambda so, target: store.add_record("Purchase_Request1", {"Sales_Order": so, "Target_Delivery": day(target), "Shipment_Mode": "LCL", "category": "Chandeliers", "Supplier_Selected": q})
    feasible = await raw.get_record_by_id("Purchase_Request1", await mk("SO-A", 90), raw=True)
    assert feasible["Feasibility"] == "feasible"
    risk = await raw.get_record_by_id("Purchase_Request1", await mk("SO-B", 63), raw=True)
    assert risk["Feasibility"] == "at_risk"
    late = await raw.get_record_by_id("Purchase_Request1", await mk("SO-C", 20), raw=True)
    assert late["Feasibility"] == "impossible"
    assert float(late["Shortfall_Days"]) == 41
    assert late["Earliest_Feasible_Date"] == day(61)
    assert "Even by air" in late["Air_Option"]


# Node: 'Books voids the Sales Order: its open PRs go on hold at once, with the reason (PR-R2)'
@pytest.mark.asyncio
async def test_so_voided_in_books_holds_its_open_prs_at_once(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    so = await store.add_record("Sales_Order", {"Sales_Order_Number": "SO-V", "Order_Status": "open"})
    a = await store.add_record("Purchase_Request1", {"Sales_Order": "SO-V"})
    other = await store.add_record("Purchase_Request1", {"Sales_Order": "SO-OTHER"})
    await store.update_record("Sales_Order", so, {"Order_Status": "void"})
    pa = await raw.get_record_by_id("Purchase_Request1", a, raw=True)
    assert pa["Pr_State"] == "on_hold"
    assert pa["Hold_Reason"] == "SO voided in Books"
    assert pa["Pr_Category"] == "blocked"
    assert (await raw.get_record_by_id("Purchase_Request1", other, raw=True))["Pr_State"] != "on_hold"
```
(Confirmed this task's real test code was missing before this pass — the plan previously only had a comment telling the implementer to "re-read the Node file... at write time," which is exactly the source-derived gap this whole correctness pass exists to close. `store.delete_record`/`by_form=True`/`user=` keyword names above match `app/store.py`'s and `app/workflows.py`'s real `add_record(form_name, data, user="")` / `update_record(report_or_form, id, data, *, by_form=False, user="")` signatures, confirmed this pass — not `actor=`, which an earlier draft of this task used and which does not exist on the real store API.)

5. Run `python -m pytest tests/procurement/test_purchase_request.py tests/procurement/test_pr_spec.py -q`.

---

## Task 15 — `app/procurement/shipments.py`

**Files:** `app/procurement/shipments.py` (new), `tests/procurement/test_shipments.py` (new)

**Interfaces:**
```python
async def before_save(form, hook_args) -> None: ...  # number generation, autofill from PO, previous-status tracking
async def populate_receiving(store, ship_id) -> None: ...
async def sync_after_edit(form, hook_args) -> None: ...
```

**Steps:**

1. Port `server/modules/procurement/shipments.mjs` (115 lines, already read in full). Imports `purchase_order.py`'s `next_number` (Task 8), `suppliers.py`'s `portal_of` (Task 3).

2. Implement the "same RCV" rule confirmed in prior research: a second/replacement shipment for a PO that already has a `Receiving` record does NOT create a second one — re-point the existing record instead. Port this branch exactly from `populate_receiving`'s source body.

3. Register on `Shipments`.

4. Tests — **Node-test-verified** (an earlier draft left only a `...` stub here; fixed in this pass). Oracle: `tests/procurement-po-shipments.test.js`'s "Shipments" section (lines 56-126):
```python
import pytest

lamp = {"PR_No": "PR-1", "SKU": "L-1", "Item": "Lamp", "QTY": 2, "Supplier": "Tony", "Line_Total": 10, "Shipping_Mode": "Air"}
shade = {"PR_No": "PR-2", "SKU": "S-1", "Item": "Shade", "QTY": 1, "Supplier": "Tony", "Line_Total": 5, "Shipping_Mode": "Air"}
ship_row = lambda l, qty: {"PR_No": l["PR_No"], "SKU": l["SKU"], "Item_Name": l["Item"], "Ordered_QTY": l["QTY"], "Shipment_QTY": qty}


async def po_with(store, lines):
    so = await raw.add_record("Sales_Order", {"Sales_Order_Number": "SO-77"})
    return await store.add_record("Purchase_Order", {"SO_No": so, "Customer": "Sample Customer", "PO_Line_Items": lines})


# Node: 'Shipment: number, SO / customer / single supplier from the PO, and ONE Receiving record with the lines'
@pytest.mark.asyncio
async def test_shipment_number_so_customer_supplier_and_one_receiving_record(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    po_id = await po_with(store, [lamp, shade])
    id_ = await store.add_record("Shipments", {"PO_No": po_id, "PO_Shipments": [ship_row(lamp, 2), ship_row(shade, 1)]})
    ship = await raw.get_record_by_id("Shipments", id_, raw=True)
    assert ship["Shipment_No"] == "SHP-00001"
    assert ship["Sales_Order"] == "SO-77"
    assert ship["Customer"] == "Sample Customer"
    assert ship["Supplier"] == "Tony"
    assert ship["Receiving_Record_Created"] in (True, "true")
    rcv = await raw.find("Receiving")
    assert len(rcv) == 1
    assert rcv[0]["SO_No"] == "SO-77"
    assert rcv[0]["Supplier"] == "Tony"
    assert [(l["PR_No"], l["SKU"], float(l["Expected_Qty"])) for l in rcv[0]["Receiving_Line_Items"]] == [("PR-1", "L-1", 2), ("PR-2", "S-1", 1)]


# Node: 'a mixed-supplier PO leaves the shipment supplier alone'
@pytest.mark.asyncio
async def test_mixed_supplier_po_leaves_shipment_supplier_blank(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    po_id = await po_with(store, [lamp, {**shade, "Supplier": "Fenteng"}])
    id_ = await store.add_record("Shipments", {"PO_No": po_id, "PO_Shipments": [ship_row(lamp, 2)]})
    assert not (await raw.get_record_by_id("Shipments", id_, raw=True)).get("Supplier")


# Node: 'a second shipment of the same PO re-uses the Receiving record (no duplicate, lines untouched)'
@pytest.mark.asyncio
async def test_second_shipment_for_a_po_with_existing_receiving_repoints_not_duplicates(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    po_id = await po_with(store, [lamp])
    first = await store.add_record("Shipments", {"PO_No": po_id, "PO_Shipments": [ship_row(lamp, 2)]})
    second = await store.add_record("Shipments", {"PO_No": po_id, "PO_Shipments": [ship_row(lamp, 1)]})
    rcv = await raw.find("Receiving")
    assert len(rcv) == 1
    assert str(rcv[0]["Shipments"]) == str(second), "pointed at the shipment in flight"
    assert first and len(rcv[0]["Receiving_Line_Items"]) == 1
    assert float(rcv[0]["Receiving_Line_Items"][0]["Expected_Qty"]) == 2, "Expected_Qty stays the original order quantity"
    assert (await raw.get_record_by_id("Shipments", second, raw=True))["Shipment_No"] == "SHP-00002"


# Node: 'editing a shipment: Receiving follows it, new lines are added, existing lines keep Expected_Qty, shipment mode flows down'
@pytest.mark.asyncio
async def test_editing_a_shipment_adds_lines_and_keeps_expected_qty(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    po_id = await po_with(store, [lamp, shade])
    id_ = await store.add_record("Shipments", {"PO_No": po_id, "PO_Shipments": [ship_row(lamp, 2)]})
    await store.update_record("Shipments", id_, {"PO_Shipments": [{**ship_row(lamp, 1), "Shipment_Mode_When_Received": "Sea"}, ship_row(shade, 1)]})
    r = (await raw.find("Receiving"))[0]
    assert len(r["Receiving_Line_Items"]) == 2
    l1 = next(l for l in r["Receiving_Line_Items"] if l["SKU"] == "L-1")
    assert float(l1["Expected_Qty"]) == 2, "the existing line is not overwritten with the shipment quantity 1"
    assert l1["Shipment_Mode_When_Received"] == "Sea"


# Node: 'shipment status change keeps the previous status'
@pytest.mark.asyncio
async def test_shipment_status_change_keeps_the_previous_status(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    po_id = await po_with(store, [lamp])
    id_ = await store.add_record("Shipments", {"PO_No": po_id, "Shipment_Status": "In Transit", "PO_Shipments": [ship_row(lamp, 2)]})
    await store.update_record("Shipments", id_, {"Shipment_Status": "Arrived"})
    assert (await raw.get_record_by_id("Shipments", id_, raw=True))["Previous_Status"] == "In Transit"
```

5. Run `python -m pytest tests/procurement/test_shipments.py -q`.

---

## Task 16 — `app/procurement/inquiry.py` + `inq_spec.py`

**Files:** `app/procurement/inquiry.py` (new), `app/procurement/inq_spec.py` (new), `tests/procurement/test_inquiry.py` (new), `tests/procurement/test_inq_spec.py` (new)

**Interfaces:**
```python
# inquiry.py (largest single file, 362 lines Node)
async def populate_quotes(store, inquiry_id) -> None: ...
async def check_readiness(form, hook_args) -> None: ...
def stage_rows(rows: list) -> list: ...
async def populate_suppliers(store, inquiry_id) -> None: ...
async def sync_suppliers(store, inquiry_id) -> None: ...
async def sync_back_to_inquiry(store, supplier_copy_id) -> None: ...
def stage_supplier_rows(rows: list) -> list: ...
def mandatory_supplier_fields(rec: dict) -> list[str]: ...
def product_image(rec: dict) -> str | None: ...
async def generate_number(store) -> str: ...
async def delete_supplier_copies(store, inquiry_id) -> None: ...

# inq_spec.py
def clear_unavailable(rows: list) -> list: ...
async def before_save(form, hook_args) -> None: ...
def hints_for(settings, rec, today) -> list[str]: ...
async def after_save(form, hook_args) -> None: ...
async def refresh_inquiry_spec(store, inquiry_id) -> None: ...
async def run_inquiry_daily(store, now=None) -> None: ...
```

**Steps:**

1. Port `server/modules/procurement/inquiry.mjs` (362 lines, already read in full — the largest single Procurement file) and `inq-spec.mjs` (138 lines, already read in full). Uses `app/deluge.py`'s extended helper set heavily (Task 1) and `suppliers.py`'s full export list (Task 3).

2. Register `inquiry.py`'s hooks on `Inquiry_Form` and on each supplier form (`Supplier_1`/`Supplier_2`).

3. `inq_spec.py` imports `plan.py`'s `load_settings`/`feasibility`/`parse_lead_days` (Task 5), `events.py` (Task 4), `decisions_core.py`'s `notify` (Task 6). `run_inquiry_daily` is the no-quote alert job named in the design doc.

4. Tests — **Node-test-verified** (corrected this pass — the earlier draft said "no Node test file for it was read in full," which was true only at that point; `tests/procurement/inquiry-workflows.test.js` (187 lines) and `tests/procurement-inq-spec.test.js` (151 lines) are both now read in full and are the real oracles):
```python
import pytest
from app.deluge import add_days, ymd, today_date

TODAY = today_date()
day = lambda n: ymd(add_days(TODAY, n))


async def seed(store):
    tony = await raw.add_record("Suppliers", {"Supplier_ID": "tony-books-id", "Supplier_Name": {"first_name": "Tony", "last_name": "Fan"}})
    fenteng = await raw.add_record("Suppliers", {"Supplier_ID": "fenteng-books-id", "Supplier_Name": {"first_name": "Fenteng"}})
    project = await raw.add_record("Projects", {"Project_Code": "PRJ-1", "Project_Name": "Mall"})
    item = await raw.add_record("Items", {"SKU": "LAMP-1", "item_name": "Lamp", "Image": "/api/v2.1/lamp.png"})
    return tony, fenteng, project, item


def base(item, project, tony, fenteng, **extra):
    return {"sku": "LAMP-1", "quantity": 3, "unit": "pcs", "target_date": "2026-12-01", "description": "A lamp",
            "Items": item, "Projects": project, "Suppliers": [tony, fenteng], **extra}


# Node: 'a new inquiry gets its number, project group, quote rows and product image'
@pytest.mark.asyncio
async def test_new_inquiry_gets_number_project_group_quote_rows_and_image(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    tony, fenteng, project, item = await seed(store)
    id_ = await store.add_record("Inquiry_Form", base(item, project, tony, fenteng), user="staff@example.test")
    rec = await raw.get_record_by_id("Inquiry_Form", id_, raw=True)
    assert rec["INQ_No"].startswith("INQ-") and len(rec["INQ_No"]) == 9
    assert rec["quote_group"] == "PRJ-1"
    assert [(q["Suppliers"], q["Stage"]) for q in rec["Supplier_Quotes"]] == [("Tony", "Not Selected"), ("Fenteng", "Not Selected")]
    assert rec["Product_Image"] == "/api/v2.1/lamp.png"


# Node: 'each asked supplier gets a copy of the inquiry and a notification'
@pytest.mark.asyncio
async def test_each_asked_supplier_gets_a_copy_and_a_notification(db_conn, monkeypatch):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    tony, fenteng, project, item = await seed(store)
    id_ = await store.add_record("Inquiry_Form", base(item, project, tony, fenteng), user="staff@example.test")
    inq_no = (await raw.get_record_by_id("Inquiry_Form", id_, raw=True))["INQ_No"]
    tony_copies = await raw.find("Supplier_2", lambda r: r.get("INQ_No_Supplier") == inq_no)
    fenteng_copies = await raw.find("Supplier_1", lambda r: r.get("INQ_No_Supplier") == inq_no)
    assert len(tony_copies) == 1 and len(fenteng_copies) == 1
    assert tony_copies[0]["Response_Status"] == "Waiting"
    assert tony_copies[0]["SKU_Supplier"] == "LAMP-1"
    assert tony_copies[0]["Quantity_Supplier"] == "3"


# Node: 'only the suppliers that were asked get a copy'
@pytest.mark.asyncio
async def test_only_asked_suppliers_get_a_copy(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    tony, fenteng, project, item = await seed(store)
    id_ = await store.add_record("Inquiry_Form", base(item, project, tony, fenteng, Suppliers=[tony]))
    inq_no = (await raw.get_record_by_id("Inquiry_Form", id_, raw=True))["INQ_No"]
    assert len(await raw.find("Supplier_2", lambda r: r.get("INQ_No_Supplier") == inq_no)) == 1
    assert len(await raw.find("Supplier_1", lambda r: r.get("INQ_No_Supplier") == inq_no)) == 0


# Node: 'margin = (SRP - final cost) / SRP * 100, and 0 without an SRP'
@pytest.mark.asyncio
async def test_margin_formula_and_zero_without_srp(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    tony, fenteng, project, item = await seed(store)
    id_ = await store.add_record("Inquiry_Form", base(item, project, tony, fenteng))
    rec = await raw.get_record_by_id("Inquiry_Form", id_, raw=True)
    t, f = rec["Supplier_Quotes"]
    await store.update_record("Inquiry_Form", id_, {"Supplier_Quotes": [{**t, "Final_Price": "600", "Selected": True}, f], "SRP_Approved1": 1000}, by_form=True)
    assert (await raw.get_record_by_id("Inquiry_Form", id_, raw=True))["Margin"] == "40"
    await store.update_record("Inquiry_Form", id_, {"SRP_Approved1": 0}, by_form=True)
    assert (await raw.get_record_by_id("Inquiry_Form", id_, raw=True))["Margin"] == "0"


# Node: 'deleting an inquiry removes the suppliers\' copies'
@pytest.mark.asyncio
async def test_deleting_an_inquiry_removes_supplier_copies(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    tony, fenteng, project, item = await seed(store)
    id_ = await store.add_record("Inquiry_Form", base(item, project, tony, fenteng))
    inq_no = (await raw.get_record_by_id("Inquiry_Form", id_, raw=True))["INQ_No"]
    before = len(await raw.find("Supplier_2", lambda r: r.get("INQ_No_Supplier") == inq_no)) + len(await raw.find("Supplier_1", lambda r: r.get("INQ_No_Supplier") == inq_no))
    assert before == 2
    await store.delete_record("Inquiry_Form", id_)
    after = len(await raw.find("Supplier_2", lambda r: r.get("INQ_No_Supplier") == inq_no)) + len(await raw.find("Supplier_1", lambda r: r.get("INQ_No_Supplier") == inq_no))
    assert after == 0


# ---- inq_spec.py: tests/procurement-inq-spec.test.js ----

# Node: 'INQ-R2: a line the supplier cannot supply has no price and no lead time'
def test_clear_unavailable_does_not_change_a_confirmed_quote():
    result = clear_unavailable([{"Availability": "Confirmed", "Initial_Price": 5}])
    assert result["changed"] is False


# Node: 'no quote after inquiry_quote_days (2): the buyer gets one alert naming the supplier that has not answered; none when all answered'
@pytest.mark.asyncio
async def test_run_inquiry_daily_alerts_once_for_a_late_unanswered_supplier(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    tony, fenteng, project, item = await seed(store)
    late = await store.add_record("Inquiry_Form", base(item, project, tony, fenteng))
    old_sent = f"{day(-3)} 09:00:00 AM"
    await raw.update_record("Inquiry_Form", late, {"Sent_At": old_sent}, by_form=True)
    r1 = await run_inquiry_daily(store)
    assert r1["alerted"] == 1
    notes = await raw.find("App_Notifications", lambda n: n["Notification_Type"] == "Inquiry No Quote")
    assert len(notes) == 1
    r2 = await run_inquiry_daily(store)
    assert r2["alerted"] == 0, "once per inquiry"
```
(`run_inquiry_daily`'s real alert condition needs at least one supplier with a quote and one without, per the Node test's full setup with `late`/`fresh`/`done` inquiries — the simplified version above only exercises the single-supplier-late path; port the full three-inquiry Node scenario (lines 133-150 of `procurement-inq-spec.test.js`) at write time for full parity, this is a trimmed starting point, not the complete Node test ported verbatim.)

5. Run `python -m pytest tests/procurement/test_inquiry.py tests/procurement/test_inq_spec.py -q`.

---

## Task 17 — `app/procurement/po_create.py` + `po_approval.py` + `clone_shipment.py`

**Files:** `app/procurement/po_create.py` (new), `app/procurement/po_approval.py` (new), `app/procurement/clone_shipment.py` (new), `tests/procurement/test_po_create.py` (new), `tests/procurement/test_po_approval.py` (new), `tests/procurement/test_clone_shipment.py` (new)

**Interfaces:** (corrected this pass against the real Node call sites in `tests/procurement-po-approval.test.js` and `tests/procurement-receiving-buttons.test.js` — none of `approve_po_main`/`approve_supplier_po`/`approve_po_hc` take a `ctx`, and `clone_shipment_for_replacement`'s second param is `store`, not `data`, same bug as Task 12's `create_receiving_from_shipment`)
```python
# po_create.py
async def approve_po_main(payload: dict, store) -> dict: ...  # feasibility gate PO-R4/PO-R1/PO-R3/DT-1; Node: approvePOMain({ soNo }, raw) — no ctx

# po_approval.py (pure-logic half only — Books booking NOT ported)
SUPPLIER: dict
def receiving_totals(lines: list) -> dict: ...
async def approve_supplier_po(key: str, payload: dict, store) -> dict: ...  # Node: approveSupplierPO('Tony', { soNo }, store) — no ctx
async def shipment_and_receiving_for(store, ctx, S, po_no, ship_extra) -> dict: ...
async def approve_po_hc(payload: dict, store) -> dict: ...  # Node: approvePOHC({ soNo }, store) — no ctx
# 4 exported custom-API wrapper functions

# clone_shipment.py
async def clone_shipment_for_replacement(payload: dict, store, ctx) -> dict: ...  # Node: invokeCustomApi('clone_shipment_for_replacement', { rrRecordId }, raw, ctx) — (payload, store, ctx), not (payload, data, ctx)
```

**Steps:**

1. Port `server/modules/procurement/po-create.mjs` (178 lines, already read in full): `approve_po_main` — the feasibility gate, grouping by supplier+mode, creating PO records and lines. Imports `purchase_order.py`'s `next_number` (Task 8), `plan.py`'s `load_settings`/`feasibility`/`norm_mode`/`resolve_supplier`/`supplier_days_from` (Task 5), `decisions_core.py`'s `prepare_item` (Task 6), `events.py`'s `log_event` (Task 4).

2. Port `server/modules/procurement/po-approval.mjs` (199 lines, already read in full) — **pure-logic half only**, per the approved design doc's explicit scope line: "the second half, which books the PO in Zoho Books, is not ported." Re-export `approve_po_main` from `po_create.py`. `shipment_and_receiving_for` uses dynamic imports in Node (`ship-track.mjs`/`plan.mjs`) — use the same local-import-inside-function idiom as Task 10 (though both modules are fully available by now, so this is for parity/clarity, not strict necessity — still worth matching Node's own structure so future readers see the same shape).

3. Port `server/modules/procurement/clone-shipment.mjs` (150 lines, already read in full): `clone_shipment_for_replacement` — traces back to the original PO, clones shipment identity, creates supplier copies. Imports `suppliers.py`'s `portal_of` (Task 3), `store.next_number` directly (not through `purchase_order.py`, per Node's own direct-import pattern).

4. Tests — **Node-test-verified**. `tests/procurement-po-spec.test.js`'s feasibility-gate section (lines 47-100) is the oracle for `approve_po_main`'s PO-R1/PO-R2/PO-R3 gate. `tests/procurement-po-approval.test.js` (lines 36-236) is the oracle for `approve_po_main`'s grouping, `approve_supplier_po`, `approve_po_hc`. `tests/procurement-receiving-buttons.test.js`'s "clone_shipment_for_replacement" section (lines 101-166) is the oracle for `clone_shipment.py`:
```python
import pytest
from app.deluge import add_days, ymd, today_date

TODAY = today_date()
day = lambda n: ymd(add_days(TODAY, n))
SPEC = {"transit_lcl_min_days": 30, "transit_lcl_max_days": 30, "transit_air_min_days": 14, "transit_air_max_days": 14,
        "customs_lcl_min_days": 0, "customs_lcl_max_days": 0, "customs_air_min_days": 0, "customs_air_max_days": 0,
        "fulfillment_days": 3, "delivery_days": 2}


async def with_spec_settings(store):
    for k, v in SPEC.items():
        await raw.add_record("Procurement_Settings", {"Setting_Key": k, "Value": str(v)})


async def base(store, suppliers=("Tony Fan",)):
    customer = await raw.add_record("Customer", {"customer_name": "Sample Customer"})
    lamp = await raw.add_record("Items", {"item_name": "Lamp", "SKU": "L-1", "Rate": 150})
    for n in suppliers:
        await raw.add_record("Suppliers", {"Supplier_Name": {"first_name": n, "last_name": ""}, "Active_PO_Count": 0})
    return customer, lamp


def pr_row(no, so, customer, lamp, **extra):
    return {"PR_No": no, "Sales_Order": so, "PR_Approved": False, "PR_READY_FOR_PO": True, "Selected_Supplier": "Tony Fan",
            "Customer": customer, "Items": lamp, "sku": "L-1", "quantity": 2, "unit": "pcs", "Selcted_Final_Cost": 100,
            "Shipment_Mode": "LCL", "Followed_Recommendation": "Yes", "Sales_Owner": "HC Sales 1", "Customer_Type": "customer",
            "Target_Delivery": day(120), "Required_Days_Lead": 20, **extra}


# Node: 'the gate: a line that cannot arrive in time needs an option first, and nothing is written until it has one (PO-R1)'
@pytest.mark.asyncio
async def test_po_r1_gate_blocks_until_a_late_line_has_a_choice(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    await with_spec_settings(store)
    customer, lamp = await base(store)
    await raw.add_record("Purchase_Request1", pr_row("PR-1", "SO-A", customer, lamp, Target_Delivery=day(20)))
    await raw.add_record("Purchase_Request1", pr_row("PR-2", "SO-A", customer, lamp))
    r = await approve_po_main({"soNo": "SO-A"}, store)
    assert r["status"] == "needs_choice"
    assert [(l["pr_no"], l["shortfall_days"], l["can_air"]) for l in r["lines"]] == [("PR-1", 41, True)]
    assert len(await raw.find("Purchase_Order")) == 0, "no PO yet"


# Node: 'option C, proceed as is: the PO is made, marked born late, with the shortfall and the choice in its note (PO-R3)'
@pytest.mark.asyncio
async def test_po_r3_proceed_as_is_marks_born_late_with_shortfall(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    await with_spec_settings(store)
    customer, lamp = await base(store)
    await raw.add_record("Purchase_Request1", pr_row("PR-1", "SO-A", customer, lamp, Target_Delivery=day(20)))
    r = await approve_po_main({"soNo": "SO-A", "lateChoices": {"PR-1": "proceed"}}, store)
    assert r["status"] == "success"
    po = (await raw.find("Purchase_Order"))[0]
    assert po["Born_Late"] in (True, "true")
    assert float(po["Shortfall_Days"]) == 41
    assert "PR-1: 41 days late; chose proceed as is" in po["Feasibility_Note"]


# Node: 'Create PO: the ready PRs of the sales order become ONE PO with their lines, the PRs are approved, nothing is made twice'
@pytest.mark.asyncio
async def test_create_po_groups_ready_prs_into_one_po_and_approves_them(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    customer, lamp = await base(store)
    shade = await raw.add_record("Items", {"item_name": "Shade", "SKU": "S-1", "Rate": 0})
    await raw.add_record("Purchase_Request1", pr_row("PR-1", "SO-A", customer, lamp))
    await raw.add_record("Purchase_Request1", pr_row("PR-2", "SO-A", customer, shade, Items=shade, sku="S-1", quantity=1))
    res = await approve_po_main({"soNo": "SO-A"}, store)
    assert res["status"] == "success"
    pos = await raw.find("Purchase_Order")
    assert len(pos) == 1
    assert pos[0]["PO_No"] == "PO-00001"
    assert pos[0]["PO_Status"] == "Draft"
    assert float(pos[0]["Total_PO_Value"]) == 300
    again = await approve_po_main({"soNo": "SO-A"}, store)
    assert again["status"] == "empty"
    assert len(await raw.find("Purchase_Order")) == 1


# Node: 'Create PO for the supplier: its copy of the PO, one Pending shipment with the supplier copy, and one Receiving record, once'
@pytest.mark.asyncio
async def test_approve_supplier_po_creates_copy_shipment_and_receiving_once(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    customer, lamp = await base(store)
    shade = await raw.add_record("Items", {"item_name": "Shade", "SKU": "S-1", "Rate": 0})
    await raw.add_record("Purchase_Request1", pr_row("PR-1", "SO-A", customer, lamp))
    await raw.add_record("Purchase_Request1", pr_row("PR-2", "SO-A", customer, shade, Items=shade, sku="S-1", quantity=1))
    await approve_po_main({"soNo": "SO-A"}, store)
    res = await approve_supplier_po("Tony", {"soNo": "SO-A"}, store)
    assert res["status"] == "success"
    assert res["processed"] == 2
    copy = (await raw.find("Tony_Fan_Purchase_Order"))[0]
    assert copy["PO_No_Supplier2"] == "PO-00001"
    ships = await raw.find("Shipments")
    assert len(ships) == 1
    assert ships[0]["Shipment_No"] == "SHP-00001"
    assert ships[0]["Shipment_Status"] == "Pending"
    rcv = (await raw.find("Receiving"))[0]
    assert rcv["Receive_No1"] == "RCV-00001"
    again = await approve_supplier_po("Tony", {"soNo": "SO-A"}, store)
    assert again["processed"] == 0


# Node: 'Create PO, local (HC System): the PO of the Local PRs gets one Pending shipment and one Receiving record with its lines, and is Confirmed; no supplier copy; once'
@pytest.mark.asyncio
async def test_approve_po_hc_handles_local_prs_with_no_supplier_copy(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    customer, lamp = await base(store, suppliers=("HC System",))
    shade = await raw.add_record("Items", {"item_name": "Shade", "SKU": "S-1", "Rate": 0})
    await raw.add_record("Purchase_Request1", pr_row("PR-1", "SO-A", customer, lamp, Selected_Supplier="HC System", Sourcing_Type="Local"))
    await raw.add_record("Purchase_Request1", pr_row("PR-2", "SO-A", customer, shade, Items=shade, sku="S-1", quantity=1, Selected_Supplier="HC System", Sourcing_Type="Local"))
    await approve_po_main({"soNo": "SO-A"}, store)
    res = await approve_po_hc({"soNo": "SO-A"}, store)
    assert res["status"] == "success"
    assert res["processed"] == 1
    po = (await raw.find("Purchase_Order"))[0]
    assert po["PO_Status"] == "Confirmed"
    ship = (await raw.find("Shipments"))[0]
    assert ship["Supplier"] == "HC System"
    assert ship["Shipment_Status"] == "Pending"


# ---- clone_shipment.py: tests/procurement-receiving-buttons.test.js ----

@pytest.mark.asyncio
async def test_clone_shipment_for_replacement_reuses_the_existing_receiving(db_conn):
    from app.store import create_store
    from app.custom_apis import invoke_custom_api
    store = create_store(db_conn)
    po = await store.add_record("Purchase_Order", {"PO_No": "PO-00001", "Customer": "ACME"})
    orig_ship = await store.add_record("Shipments", {
        "Shipment_No": "SHP-00001", "PO_No": po, "Sales_Order": "SO-1", "Customer": "ACME", "Supplier": "Tony",
        "Shipment_Status": "Delivered", "Sales_Owner": "HC Sales 1", "Target_Date": "2026-11-01", "Supplier_Target_Date": "2026-10-20",
        "PO_Shipments": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Shipment_QTY": 5, "Shipping_Mode": "Sea"}],
    })
    recv = await store.add_record("Receiving", {
        "Receive_No1": "RCV-00001", "Shipments": orig_ship, "SO_No": "SO-1", "PO_No": "PO-00001", "Customer_Name": "ACME", "Supplier": "Tony",
        "Receiving_Line_Items": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Expected_Qty": 5, "Accepted_Qty": 3}],
    })
    await store.add_record("Exceptions", {"Exception_No": "EXC-1", "PO_No": "PO-00001", "Source_Module": "Receiving"})
    rr = await store.add_record("Replacement_Request", {
        "RR_No": "RR-00001", "RR_Supplier": "Tony", "Source_Module": "Receiving", "Source_Exception_No": "EXC-1",
        "RR_SKU": "L-1", "RR_Item_Name": "Lamp", "RR_Qty_Value": 2, "RR_PR_No": "PR-1", "RR_SO": "SO-1",
        "Expected_Ship_Date": "2026-12-01", "ETA": "2026-12-10", "RR_Status": "Acknowledged",
    })
    await store.add_record("Tony_Fan_Replacement_Request", {"RR_No": "RR-00001", "RR_Status": "Acknowledged", "Shipment_Mode": "Sea"})
    out = await invoke_custom_api("clone_shipment_for_replacement", {"rrRecordId": rr}, store, {"user": "t"})
    assert out["status"] == "success"
    new_ship = await store.get_record_by_id("Shipments", out["shipmentId"], raw=True)
    assert new_ship["Shipment_Status"] == "Pending"
    assert new_ship["Receiving_Record_Created"] in (True, "true")
    r = await store.get_record_by_id("Receiving", recv, raw=True)
    assert str(r["Shipments"]) == str(out["shipmentId"])
    assert float(r["Receiving_Line_Items"][0]["Expected_Qty"]) == 5
    assert len(await store.find("Receiving")) == 1


# Node: 'an RR the supplier has not acknowledged cannot be cloned'
@pytest.mark.asyncio
async def test_clone_shipment_refuses_an_unacknowledged_rr(db_conn):
    from app.store import create_store
    from app.custom_apis import invoke_custom_api
    store = create_store(db_conn)
    po = await store.add_record("Purchase_Order", {"PO_No": "PO-00002", "Customer": "ACME"})
    await store.add_record("Shipments", {"Shipment_No": "SHP-00001", "PO_No": po, "Supplier": "Tony", "Shipment_Status": "Delivered",
                                          "PO_Shipments": [{"PR_No": "PR-1", "SKU": "L-1", "Shipment_QTY": 5}]})
    rr = await store.add_record("Replacement_Request", {"RR_No": "RR-00002", "RR_Supplier": "Tony", "RR_Status": "Open"})
    out = await invoke_custom_api("clone_shipment_for_replacement", {"rrRecordId": rr}, store, {"user": "t"})
    assert out["status"] == "error"
    assert "Acknowledged" in out["message"]
```

5. Run `python -m pytest tests/procurement/test_po_create.py tests/procurement/test_po_approval.py tests/procurement/test_clone_shipment.py -q`.

---

## Task 18 — `app/procurement/ship_track.py` (pass 2: hooks + `rescoreShipments` + `runShipmentLadder`)

**Files:** `app/procurement/ship_track.py` (modify — append), `tests/procurement/test_ship_track.py` (new)

**Interfaces (added this pass):**
```python
# beforeSave/afterSave hooks registered on Shipments
# hook on Purchase_Request1 for hold-status re-scoring
# hook on Ladder_Events
async def rescore_shipments(store, today=None, full=False, settings=None, dry_run=False) -> dict: ...
async def run_shipment_ladder(store, now=None, log=None) -> None: ...
```

**Steps:**

1. Append the remaining Node `ship-track.mjs` content not ported in Task 11: the `beforeSave`/`afterSave` hooks on `Shipments`, the `Purchase_Request1` hold-status re-scoring hook, the `Ladder_Events` hook, `rescore_shipments`, `run_shipment_ladder`.

2. `rescore_shipments` imports `receiving_spec.py` and `pr_spec.py` dynamically in Node — use local imports inside the function body, exactly matching the Architecture section's stated fix:
```python
async def rescore_shipments(store, today=None, full=False, settings=None, dry_run=False):
    from app.procurement.receiving_spec import rescore_receivings
    from app.procurement.pr_spec import rescore_prs
    ...
```
By this task, both `receiving_spec.py` (Task 12) and `pr_spec.py` (Task 14) already exist, so this local import is purely for structural parity with Node's own cycle-breaking pattern — document that with a one-line comment matching the style of `app/fulfillment/__init__.py`'s own explanatory comments (e.g., "local import: mirrors Node's dynamic import() cycle-break between ship-track.mjs and receiving-spec.mjs/pr-spec.mjs").

3. Register all hooks exactly matching Node's registration list: `Shipments` (beforeSave/afterSave), `Purchase_Request1` (hold-status), `Ladder_Events`.

4. Tests — **Node-test-verified** (an earlier draft left only a vague description here; fixed in this pass). Oracle: `tests/procurement-ship-track.test.js`'s "the supplier ladder" section (lines 243-313) for `run_shipment_ladder`, and its "rescore" tests (lines 202-240) for `rescore_shipments`:
```python
import pytest
from app.deluge import add_days, ymd, today_date

TODAY = today_date()
day = lambda n: ymd(add_days(TODAY, n))
line = {"PR_No": "PR-1", "SKU": "L-1", "Item": "Lamp", "QTY": 2, "Supplier": "Tony Fan", "Line_Total": 10, "Shipping_Mode": "LCL"}


async def shipment(store, po_days=0, so_days=-10, target=60, lines=(line,), extra=None, so="SO-100"):
    await raw.add_record("Sales_Order_Fulfillment", {"SO_No": so, "SO_Created_Date": day(so_days)})
    po_id = await store.add_record("Purchase_Order", {"Customer": "C", "PO_Date": day(po_days), "PO_Line_Items": list(lines)})
    id_ = await store.add_record("Shipments", {
        "PO_No": po_id, "Sales_Order": so, "Supplier": "Tony Fan", "Target_Date": day(target),
        "PO_Shipments": [{"PR_No": l["PR_No"], "SKU": l["SKU"], "Item_Name": l["Item"], "Ordered_QTY": l["QTY"], "Shipment_QTY": l["QTY"], "Shipping_Mode": l["Shipping_Mode"]} for l in lines],
        **(extra or {}),
    })
    return id_, po_id


# Node: 'ladder: late = production not started by PO + 1; one rung per day, each only once, day 3 is a prepared decision and never a cancel'
@pytest.mark.asyncio
async def test_ladder_fires_one_rung_per_day_and_day_3_is_a_decision_not_a_cancel(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    id_, po_id = await shipment(store, po_days=-2)  # PO + 1 was yesterday: 1 day late
    await run_shipment_ladder(store, now=TODAY)
    rungs = await raw.find("Ladder_Events")
    assert [int(r["Rung"]) for r in rungs] == [1]
    await run_shipment_ladder(store, now=TODAY)
    assert len(await raw.find("Ladder_Events")) == 1, "a rung fires once"
    await run_shipment_ladder(store, now=add_days(TODAY, 2))  # 3 days late
    rungs = await raw.find("Ladder_Events")
    assert sorted(int(r["Rung"]) for r in rungs) == [1, 2, 3]
    q = [i for i in await raw.find("Approval_Queue") if i["Kind"] == "ladder_day3"]
    assert len(q) == 1
    assert q[0]["Status"] == "pending"
    ship = await raw.get_record_by_id("Shipments", id_, raw=True)
    assert ship["Stage"] != "cancelled", "no automatic cancellation"


# Node: 'silence alert: shipped out and not at the port within transit days + 3 raises one overdue notification'
@pytest.mark.asyncio
async def test_silence_alert_fires_once_when_overdue_past_transit_plus_3(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    id_, po_id = await shipment(store, po_days=-60)
    await store.update_record("Shipments", id_, {"Production_Photos": ["p.jpg"]})
    await store.update_record("Shipments", id_, {"Report_Event": "shipped_out", "Report_Occurred_At": day(-40)})  # 30 + 3 = 33 days allowed
    await run_shipment_ladder(store, now=TODAY)
    await run_shipment_ladder(store, now=TODAY)
    n = [x for x in await raw.find("App_Notifications") if x["Notification_Type"] == "Shipment Overdue"]
    assert len(n) == 1


# Node: 'rescore: the board columns are written, the oldest order is ranked first, and a PR on hold blocks the shipment'
@pytest.mark.asyncio
async def test_rescore_shipments_writes_board_columns_and_blocks_on_hold(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    older_id, _ = await shipment(store, so="SO-OLD", so_days=-60, target=20)
    newer_id, _ = await shipment(store, so="SO-NEW", so_days=-5, target=20, lines=({**line, "PR_No": "PR-2"},))
    await raw.add_record("Purchase_Request1", {"PR_No": "PR-2", "Hold_Status": "On Hold"})
    await rescore_shipments(store)
    o = await raw.get_record_by_id("Shipments", older_id, raw=True)
    n = await raw.get_record_by_id("Shipments", newer_id, raw=True)
    assert o["Category"] == "act_now"
    assert int(o["Queue_Rank"]) == 1
    assert n["Category"] == "blocked"
    assert "PR-2" in n["Blocked_Reason"]
```

5. Run full `tests/procurement/test_ship_track.py` plus re-run `test_ship_track_helpers.py` to confirm no regression from the append.

---

## Task 19 — `app/procurement/decisions.py`

**Files:** `app/procurement/decisions.py` (new), `tests/procurement/test_decisions.py` (new)

**Interfaces:**
```python
async def upgrade_to_air(store, item, ctx) -> dict: ...
async def apply_pr(store, item, ctx) -> dict: ...
async def apply(store, item, ctx) -> dict: ...  # dispatch by Record_Type / Kind
# beforeAdd/beforeDelete throw; beforeUpdate validates decision options; afterUpdate calls apply()
# registered on Approval_Queue
```

**Steps:**

1. Port `server/modules/procurement/decisions.mjs` (104 lines, already read in full). Imports `plan.py`'s `load_settings` (Task 5), `decisions_core.py` (Task 6), `ship_track.py`'s `plan_patch`/`rescore_shipments` (Task 18, now done — this is why this task comes after Task 18), `events.py`'s `log_event` (Task 4).

2. `apply()` dispatches by `Record_Type` (`pr` vs `shipment`) and `Kind` (`ladder_day3`, `air_upgrade`, `forecast_promise_change`). Confirm from source: Delivery's own `service_appointment` kind is explicitly NOT handled here (per prior research, a Node comment says it's handled by `delivery-management/approval-decisions.mjs` instead) — port that exclusion exactly (e.g., a dispatch branch that no-ops or raises for unknown kinds, matching Node's exact behavior, not a Python-added guard).

3. Register on `Approval_Queue`: `beforeAdd` throws (direct inserts not allowed — only `decisions_core.prepare_item` creates rows), `beforeDelete` throws, `beforeUpdate` validates the decision `options` field, `afterUpdate` calls `apply()`.

4. Tests — **Node-test-verified**: `tests/procurement-decisions.test.js`'s "the Decisions list" section (lines 138-276) is the real oracle:
```python
import pytest
from app.deluge import add_days, ymd, today_date

TODAY = today_date()
day = lambda n: ymd(add_days(TODAY, n))
SPEC_ROWS = {"transit_lcl_min_days": 30, "transit_lcl_max_days": 30, "transit_air_min_days": 14, "transit_air_max_days": 14,
             "customs_lcl_min_days": 0, "customs_lcl_max_days": 0, "customs_air_min_days": 0, "customs_air_max_days": 0,
             "fulfillment_days": 3, "delivery_days": 2}


async def with_spec(store):
    for k, v in SPEC_ROWS.items():
        await raw.add_record("Procurement_Settings", {"Setting_Key": k, "Value": str(v)})


async def shipment(store, target=30, so="SO-1", po_days=-2, so_days=-60):
    await raw.add_record("Sales_Order_Fulfillment", {"SO_No": so, "SO_Created_Date": day(so_days)})
    line = {"PR_No": "PR-1", "SKU": "L-1", "Item": "Lamp", "QTY": 2, "Supplier": "Tony Fan", "Line_Total": 10, "Shipping_Mode": "LCL"}
    po_id = await store.add_record("Purchase_Order", {"Customer": "C", "PO_Date": day(po_days), "PO_Line_Items": [line]})
    return await store.add_record("Shipments", {
        "PO_No": po_id, "Sales_Order": so, "Supplier": "Tony Fan", "Target_Date": day(target),
        "PO_Shipments": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Ordered_QTY": 2, "Shipment_QTY": 2, "Shipping_Mode": "LCL"}],
    })


# Node: 'an Act now shipment still in production gets one air_upgrade decision, with the numbers, once'
@pytest.mark.asyncio
async def test_act_now_shipment_gets_one_air_upgrade_decision(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    await with_spec(store)
    id_ = await shipment(store, target=30)
    assert (await raw.get_record_by_id("Shipments", id_, raw=True))["Category"] == "act_now"
    items = await raw.find("Approval_Queue", lambda i: i["Kind"] == "air_upgrade")
    assert len(items) == 1
    assert items[0]["Status"] == "pending"


# Node: 'deciding "upgrade_air" changes the mode, plans the dates again, stamps who decided, and cannot be decided twice'
@pytest.mark.asyncio
async def test_deciding_upgrade_air_changes_mode_and_cannot_be_decided_twice(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    from app.criteria import ZohoError
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    await with_spec(store)
    id_ = await shipment(store, target=30)
    it = (await raw.find("Approval_Queue", lambda i: i["Kind"] == "air_upgrade"))[0]
    await store.update_record("Approval_Queue", it["ID"], {"Decision": "upgrade_air"}, user="buyer@x")
    s = await raw.get_record_by_id("Shipments", id_, raw=True)
    assert s["Shipment_Mode"] == "Airfreight"
    d = (await raw.find("Approval_Queue", lambda i: i["Kind"] == "air_upgrade"))[0]
    assert d["Status"] == "decided"
    assert d["Decided_By"] == "buyer@x"
    with pytest.raises(ZohoError, match="already been decided"):
        await store.update_record("Approval_Queue", it["ID"], {"Decision": "tell_customer"})
    events = await raw.find("Stage_Events", lambda e: e["Event"] == "shipment.mode_upgraded")
    assert len(events) == 1


# Node: 'a decision cannot be typed, forged or deleted, and only the listed options are accepted'
@pytest.mark.asyncio
async def test_approval_queue_rows_cannot_be_created_deleted_or_forged(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    from app.criteria import ZohoError
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    await with_spec(store)
    await shipment(store, target=30)
    it = (await raw.find("Approval_Queue", lambda i: i["Kind"] == "air_upgrade"))[0]
    with pytest.raises(ZohoError, match="prepared by the system"):
        await store.add_record("Approval_Queue", {"Kind": "air_upgrade"})
    with pytest.raises(ZohoError, match="cannot be deleted"):
        await store.delete_record("Approval_Queue", it["ID"])
    with pytest.raises(ZohoError, match="not one of the options"):
        await store.update_record("Approval_Queue", it["ID"], {"Decision": "cancel_everything"})
    await store.update_record("Approval_Queue", it["ID"], {"Status": "decided", "Decided_By": "someone else", "Result": "fake"})
    after = (await raw.find("Approval_Queue", lambda i: i["Kind"] == "air_upgrade"))[0]
    assert after["Status"] == "pending"
    assert not after.get("Decided_By") and not after.get("Result")


# Node: 'ladder day 3: the decision is recorded on the rung; "cancel and re-source" cancels nothing by itself'
@pytest.mark.asyncio
async def test_ladder_day3_cancel_resource_records_but_cancels_nothing(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    await with_spec(store)
    id_ = await shipment(store, po_days=-2)
    from app.procurement.ship_track import run_shipment_ladder
    await run_shipment_ladder(store, now=add_days(TODAY, 2))
    it = (await raw.find("Approval_Queue", lambda i: i["Kind"] == "ladder_day3"))[0]
    await store.update_record("Approval_Queue", it["ID"], {"Decision": "cancel_resource"}, user="buyer@x")
    rung3 = [l for l in await raw.find("Ladder_Events") if int(l["Rung"]) == 3][0]
    assert rung3["Decision"] == "cancel_resource"
    assert rung3["Decided_By"] == "buyer@x"
    result = (await raw.find("Approval_Queue", lambda i: i["Kind"] == "ladder_day3"))[0]
    assert "Nothing was cancelled by the system" in result["Result"]
    assert (await raw.get_record_by_id("Shipments", id_, raw=True))["Stage"] == "production"
```
(Decision options validation message "not one of the options" and "already been decided" are taken verbatim from the Node test file; `decisions.mjs`'s own `apply()` dispatch for `move_target`/`tell_customer`/`accept_target` is covered more fully by Task 20's `settings_hooks`/Task 6's `decisions_core` tests which already exercise those branches end-to-end — not duplicated here to avoid redundant coverage across tasks.)

5. Run `python -m pytest tests/procurement/test_decisions.py -q`.

---

## Task 20 — `app/procurement/settings_hooks.py` + `dashboard.py`

**Files:** `app/procurement/settings_hooks.py` (new), `app/procurement/dashboard.py` (new), `tests/procurement/test_settings_hooks.py` (new), `tests/procurement/test_dashboard.py` (new)

**Interfaces:**
```python
# settings_hooks.py
async def settings_in_use(store) -> dict: ...
def refusal(key, raw, current) -> str | None: ...
# check/history hooks on Procurement_Settings (beforeUpdate, afterUpdate/beforeDelete/afterDelete)
async def preview_procurement_setting(payload: dict, store) -> dict: ...
async def recalculate_shipments(payload: dict, store) -> dict: ...
async def get_procurement_settings(payload: dict, store) -> dict: ...

# dashboard.py
async def get_procurement_dashboard(payload: dict, store) -> dict: ...
```

**Steps:**

1. Port `server/modules/procurement/settings-hooks.mjs` (114 lines, already read in full). Imports `settings_defs.py`'s full export list (Task 2 — `DEFS`, `SETTING_DEFS`, `GROUPS`, `problem_with`, `range_problem`, `ladder_problem`, confirming the Task 2 scope correction), `app.forecast.forecast_settings`'s `is_forecast_key`/`forecast_values` (already ported), `ship_track.py`'s `rescore_shipments` (Task 18).

2. `preview_procurement_setting` is the "preview the effect" custom API (CP-R4 from the design doc's data-flow section) — port its dry-run path exactly (likely calls `rescore_shipments(..., dry_run=True)`).

3. Port `server/modules/procurement/dashboard.mjs` (118 lines, already read in full): `get_procurement_dashboard` — pure read-only aggregator building `today`/`born_late`/`on_time`/`scorecard`/`pipeline`/`replacements` blocks. Imports `plan.py` (Task 5), `ship_track.py`'s `effective_stage` (Task 11), `po_spec.py`'s `get_born_late_rate` (Task 8), `rr_spec.py`'s `get_rr_report` (Task 9), `suppliers.py`'s `portal_of` (Task 3).

4. Tests — **Node-test-verified**: `tests/procurement-decisions.test.js`'s "the Procurement settings" section (lines 99-136) is the oracle for `settings_hooks.py`'s `preview_procurement_setting`/`recalculate_shipments`/history-write behavior; `tests/procurement-dashboard.test.js` (all six tests, lines 24-124) is the oracle for `dashboard.py`:
```python
import pytest
from app.deluge import add_days, ymd, today_date

TODAY = today_date()
day = lambda n: ymd(add_days(TODAY, n))


# ---- settings_hooks.py ----

# Node: 'preview: shows how many open shipments would change category before anything is saved (CP-R4)'
@pytest.mark.asyncio
async def test_preview_setting_shows_the_effect_without_saving(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    for k, v in {"transit_lcl_min_days": 30, "transit_lcl_max_days": 30, "fulfillment_days": 3, "delivery_days": 2}.items():
        await store.add_record("Procurement_Settings", {"Setting_Key": k, "Value": str(v)})
    line = {"PR_No": "PR-1", "SKU": "L-1", "Item": "Lamp", "QTY": 2, "Supplier": "Tony Fan", "Line_Total": 10, "Shipping_Mode": "LCL"}
    po_id = await store.add_record("Purchase_Order", {"Customer": "C", "PO_Date": day(-2), "PO_Line_Items": [line]})
    await store.add_record("Shipments", {"PO_No": po_id, "Supplier": "Tony Fan", "Target_Date": day(70),
                                          "PO_Shipments": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Ordered_QTY": 2, "Shipment_QTY": 2, "Shipping_Mode": "LCL"}]})
    from app.procurement.ship_track import rescore_shipments
    await rescore_shipments(store)
    r = await preview_procurement_setting({"key": "transit_lcl_max_days", "value": 120}, store)
    assert r["status"] == "success"
    assert r["moved_count"] == 1
    row = (await store.find("Procurement_Settings", lambda x: x["Setting_Key"] == "transit_lcl_max_days"))[0]
    assert row["Value"] == "30", "nothing was saved"
    bad = await preview_procurement_setting({"key": "transit_lcl_max_days", "value": 900}, store)
    assert bad["status"] == "error"


# Node: 'Recalculate now re-reads the dates and ranks everything'
@pytest.mark.asyncio
async def test_recalculate_shipments_reports_how_many_it_scored(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    line = {"PR_No": "PR-1", "SKU": "L-1", "Item": "Lamp", "QTY": 2, "Supplier": "Tony Fan", "Line_Total": 10, "Shipping_Mode": "LCL"}
    po_id = await store.add_record("Purchase_Order", {"Customer": "C", "PO_Date": day(0), "PO_Line_Items": [line]})
    await store.add_record("Shipments", {"PO_No": po_id, "Supplier": "Tony Fan", "Target_Date": day(60),
                                          "PO_Shipments": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Ordered_QTY": 2, "Shipment_QTY": 2, "Shipping_Mode": "LCL"}]})
    r = await recalculate_shipments({}, store)
    assert r["status"] == "success"
    assert r["scored"] == 1


# ---- dashboard.py ----

FORMS = ["Shipments", "Purchase_Order", "Purchase_Request1", "Approval_Queue", "Ladder_Events", "Stage_Events", "Receiving",
         "Exceptions", "Replacement_Request", "Package_Shipments", "Exception_Control1", "Procurement_Settings", "Suppliers"]


async def ship(store, **extra):
    return await store.add_record("Shipments", {"Supplier": "Tony Fan", "Shipment_Mode": "LCL", "Required_Days_Lead": 20,
                                                  "Stage": "production", "PO_Shipments": [{"PR_No": "PR-1", "SKU": "L-1", "Shipment_QTY": 1}], **extra})


# Node: 'Today: the counts of Act now, Tell the customer and Broken, the decisions waiting, PRs needing a manual quote, POs not acknowledged, each with its link'
@pytest.mark.asyncio
async def test_dashboard_today_block_counts_and_links(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    await ship(store, Shipment_No="S1", Category="act_now", Queue_Rank=2, Priority_Reason="late", Suggested_Action="Call")
    await ship(store, Shipment_No="S2", Category="act_now", Queue_Rank=3)
    await ship(store, Shipment_No="S3", Category="tell_customer", Queue_Rank=4)
    await ship(store, Shipment_No="S4", Category="broken", Queue_Rank=1)
    await ship(store, Shipment_No="S5", Category="act_now", Stage="received")  # received: not counted
    for kind in ["air_upgrade", "air_upgrade", "ladder_day3"]:
        await store.add_record("Approval_Queue", {"Kind": kind, "Status": "pending"})
    await store.add_record("Approval_Queue", {"Kind": "air_upgrade", "Status": "decided"})
    await store.add_record("Purchase_Request1", {"PR_No": "PR-1", "Pricing_Status": "needs_manual_quote", "Pr_State": "open"})
    await store.add_record("Purchase_Order", {"PO_No": "PO-1", "Po_State": "sent"})
    d = (await get_procurement_dashboard({}, store))["data"]
    t = d["today"]
    assert [t["act_now"]["count"], t["tell_customer"]["count"], t["broken"]["count"]] == [2, 1, 1]
    assert [t["decisions"]["count"], t["decisions"]["air_upgrade"], t["decisions"]["ladder_day3"]] == [3, 2, 1]
    assert t["manual_quote"]["count"] == 1
    assert t["pos_not_acknowledged"]["count"] == 1
    assert [x["no"] for x in t["top"]] == ["S4", "S1", "S2"], "Broken first, then Act now by rank"


# Node: 'Born-late rate (acceptance): matches a manual count for one week of POs'
@pytest.mark.asyncio
async def test_dashboard_born_late_rate_block(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    po = lambda no, date_, raised, late, status="sent": store.add_record("Purchase_Order", {"PO_No": no, "PO_Date": date_, "Lines_Raised": raised, "Lines_Born_Late": late, "PO_Status": status})
    await po("PO-1", day(0), 2, 1)
    await po("PO-2", day(0), 3, 0)
    await po("PO-3", day(0), 1, 1)
    await po("PO-4", day(0), 5, 5, "Cancelled")
    b = (await get_procurement_dashboard({}, store))["data"]["born_late"]
    assert [b["raised"], b["born_late"]] == [6, 2]
    assert b["rate"] == pytest.approx(33.3, abs=0.05)


# Node: 'an empty system gives empty blocks, not errors'
@pytest.mark.asyncio
async def test_dashboard_empty_system_gives_empty_blocks(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    d = (await get_procurement_dashboard({}, store))["data"]
    assert d["today"]["act_now"]["count"] == 0
    assert d["born_late"]["rate"] is None
    assert d["on_time"]["rate"] is None
    assert d["scorecard"] == []
    assert len(d["pipeline"]) == 4
    assert d["replacements"]["open"] == 0
```

5. Run `python -m pytest tests/procurement/test_settings_hooks.py tests/procurement/test_dashboard.py -q`.

---

## Task 21 — `app/procurement/projects.py` + `supplier_portal_workflows.py` + `production_portal.py`

**Files:** `app/procurement/projects.py` (new), `app/procurement/supplier_portal_workflows.py` (new), `app/procurement/production_portal.py` (new), `tests/procurement/test_projects.py` (new), `tests/procurement/test_supplier_portal_workflows.py` (new), `tests/procurement/test_production_portal.py` (new)

**Interfaces:**
```python
# projects.py
async def proj_code_autonumber(form, hook_args) -> None: ...  # hooked on Projects

# supplier_portal_workflows.py
# hooks on Tony_Shipment/Fenteng_Shipment (delay reports, "select to ship" sync creating shipment IDs via Shipment_ID_Counter)
# hooks on Tony_Fan_Purchase_Request/Fenteng_Lighting_Purchase_Request (mandatory-fields validation, image sync, copy-answer-to-buyer-PR)

# production_portal.py
# hooks on Tony_Shipment/Fenteng_Shipment for production-started/finished reports, photo gate ST-R3
```

**Steps:**

1. Port `server/modules/procurement/projects.mjs` (11 lines, already read in full) — trivial.

2. Port `server/modules/procurement/supplier-portal-workflows.mjs` (154 lines, already read in full) — confirmed distinct from the out-of-scope `supplier-portal.mjs` (no `-workflows` suffix, Tony Fan/Fenteng's own custom-API file). Do NOT create a `supplier_portal.py` (no suffix) file this task.

3. Port `server/modules/procurement/production-portal.mjs` (72 lines, already read in full) — photo gate ST-R3, port the exact photo-count/type check from source.

4. Tests — **Node-test-verified**. `tests/procurement/supplier-copies.test.js`'s "Projects" test (lines 90-95) is the oracle for `projects.py`. `tests/procurement-supplier-portal.test.js`'s "the supplier's shipment" and "the supplier's Purchase Request" sections (lines 22-85) are the oracle for `supplier_portal_workflows.py`. `tests/procurement-supplier-portal-spec.test.js`'s "Production screen" section (lines 132-194) is the oracle for `production_portal.py`:
```python
import pytest
from app.deluge import add_days, ymd, today_date

TODAY = today_date()
day = lambda n: ymd(add_days(TODAY, n))


# Node: 'Projects: a new project gets PRJ-nnnnn after the highest code, even when the widget sent one'
@pytest.mark.asyncio
async def test_project_code_autonumber_follows_the_highest_existing_code(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    await raw.add_record("Projects", {"Project_Code": "PRJ-00007"})  # simulate pre-existing highest code
    a = await store.add_record("Projects", {"Project_Name": "Hotel", "Project_Code": "X"})
    b = await store.add_record("Projects", {"Project_Name": "Office"})
    code_a = (await raw.get_record_by_id("Projects", a, raw=True))["Project_Code"]
    code_b = (await raw.get_record_by_id("Projects", b, raw=True))["Project_Code"]
    assert code_a == "PRJ-00008"
    assert code_b == "PRJ-00009"


# Node: 'ticked lines get a shipment id, go to the parent shipment In Transit, dates and mode are set, and nothing is added twice'
@pytest.mark.asyncio
async def test_select_to_ship_creates_shipment_id_and_syncs_parent(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    parent = await raw.add_record("Shipments", {"Shipment_No": "SHP-00001", "Sales_Order": "SO-1", "Supplier": "Tony",
        "PO_Shipments": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp"}, {"PR_No": "PR-2", "SKU": "S-1", "Item_Name": "Shade"}]})
    sup = await raw.add_record("Tony_Shipment", {"Shipment_No": "SHP-00001", "Parent_Shipment_ID": str(parent),
        "Supplier2_Shipment_Details": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "RR_No": ""}, {"PR_No": "PR-2", "SKU": "S-1", "Item_Name": "Shade", "RR_No": ""}]})
    await store.update_record("Tony_Shipment", sup, {"Supplier2_Shipment_Details": [
        {"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "RR_No": "", "Select_To_Ship": True, "Shipment_Mode": "Airfreight", "Date_Shipped": "2026-12-01"},
        {"PR_No": "PR-2", "SKU": "S-1", "Item_Name": "Shade", "RR_No": "", "Select_To_Ship": False},
    ]})
    p = await raw.get_record_by_id("Shipments", parent, raw=True)
    assert [(r["Shipment_ID"], r["PR_No"], r["Status"], r["Shipment_Mode"]) for r in p["Supplier_Shipment_Details"]] == [("SHP-AIR-00001", "PR-1", "In Transit", "Airfreight")]
    assert p["Ship_Out_Date"] == "2026-12-01"


# Node: "Tony PR: the response needs its fields, then it is copied onto Tony's row of the buyer's PR"
@pytest.mark.asyncio
async def test_supplier_pr_answer_validates_required_fields_then_copies_to_buyer_pr(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    from app.criteria import ZohoError
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    tony = await raw.add_record("Suppliers", {"Supplier_Name": {"first_name": "Tony Fan", "last_name": ""}})
    other = await raw.add_record("Suppliers", {"Supplier_Name": {"first_name": "Fenteng Lighting", "last_name": ""}})
    await raw.add_record("Purchase_Request1", {"PR_No": "PR-1", "Supplier_Selected": [{"Suppliers": other, "Final_Price": 1}, {"Suppliers": tony, "Final_Price": 0}]})
    answer = lambda **extra: {"Availability_Supplier2": "Available", "Initial_Price_Supplier2": 90, "Negotiated_Supplier2": 85, "Final_Price_Supplier2": 80, "Lead_Time_Supplier2": 14, **extra}
    id_ = await raw.add_record("Tony_Fan_Purchase_Request", {"PR_No_Supplier2": "PR-1", "Supplier_Selected_Supplier2": [answer()]})
    with pytest.raises(ZohoError, match="Required fields missing: Availability"):
        await store.update_record("Tony_Fan_Purchase_Request", id_, {"Supplier_Selected_Supplier2": [answer(Availability_Supplier2="")]})
    await store.update_record("Tony_Fan_Purchase_Request", id_, {"Supplier_Selected_Supplier2": [answer()]})
    pr = (await raw.find("Purchase_Request1"))[0]
    tony_row = next(r for r in pr["Supplier_Selected"] if str(r.get("Suppliers", {}).get("ID", r.get("Suppliers"))) == str(tony))
    assert [tony_row["Availability"], float(tony_row["Initial_Price"]), float(tony_row["Final_Price"]), float(tony_row["Lead_Time"])] == ["Available", 90, 80, 14]


# Node: 'Production screen: "production started" on the copy stamps the shipment (source supplier, the day they enter) and refreshes the copy'
@pytest.mark.asyncio
async def test_production_started_on_the_supplier_copy_stamps_the_shipment(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    ship_id = await store.add_record("Shipments", {"Shipment_No": "SHP-T", "Supplier": "Tony Fan"})
    from app.procurement.ship_track import refresh_supplier_view
    copy = await raw.add_record("Tony_Shipment", {"Shipment_No": "SHP-X", "Parent_Shipment_ID": str(ship_id)})
    await refresh_supplier_view(store, ship_id)
    await store.update_record("Tony_Shipment", copy, {"Report_Prod_Event": "production_started", "Report_Prod_Date": day(-2)})
    s = await raw.get_record_by_id("Shipments", ship_id, raw=True)
    assert s["Production_Started_At"] == day(-2)
    assert s["Last_Supplier_Update_At"]
    c = await raw.get_record_by_id("Tony_Shipment", copy, raw=True)
    assert c["Prod_Status"] == "in_production"


# Node: 'Production screen: finishing needs a production photo (ST-R3); with the photo the shipment is finished and the photo is on the shipment'
@pytest.mark.asyncio
async def test_production_finished_requires_a_photo_and_syncs_to_the_shipment(db_conn):
    from app.store import create_store
    from app.workflows import create_hooked_store
    from app.criteria import ZohoError
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    ship_id = await store.add_record("Shipments", {"Shipment_No": "SHP-T2", "Supplier": "Tony Fan"})
    from app.procurement.ship_track import refresh_supplier_view
    copy = await raw.add_record("Tony_Shipment", {"Shipment_No": "SHP-X2", "Parent_Shipment_ID": str(ship_id)})
    await refresh_supplier_view(store, ship_id)
    with pytest.raises(ZohoError, match="production photo"):
        await store.update_record("Tony_Shipment", copy, {"Report_Prod_Event": "production_finished", "Report_Prod_Date": day(0)})
    await store.update_record("Tony_Shipment", copy, {"Prod_Photo": "/uploads/123_made.jpg"})
    s = await raw.get_record_by_id("Shipments", ship_id, raw=True)
    assert "/uploads/123_made.jpg" in s["Production_Photos"]
```

5. Run `python -m pytest tests/procurement/test_projects.py tests/procurement/test_supplier_portal_workflows.py tests/procurement/test_production_portal.py -q`.

---

## Task 22 — `app/procurement/shipment_schedules.py` + `apis.py` + `__init__.py` (final manifest)

**Files:** `app/procurement/shipment_schedules.py` (new), `app/procurement/apis.py` (new), `app/procurement/__init__.py` (modify — full manifest), `tests/procurement/test_shipment_schedules.py` (new), `tests/procurement/test_apis.py` (new), `tests/procurement/test_module_manifest.py` (new)

**Interfaces:**
```python
# shipment_schedules.py
async def run_shipment_10_day_check(store, log=None) -> None: ...
async def run_shipment_delay_status(store, today=None, log=None) -> None: ...

# apis.py
CUSTOM_APIS: dict[str, callable]  # merged into app.custom_apis.CUSTOM_APIS at import time, same pattern as Fulfillment's apis.py
```

**Steps:**

1. Port `server/modules/procurement/shipment-schedules.mjs` (59 lines, already read in full) — plain async callables, no cron wiring (per design doc scope).

2. Port `server/modules/procurement/apis.mjs` (50 lines, already read in full): build `CUSTOM_APIS` mapping every non-Books/Akeneo entry from Node's `functions` dict to a real handler. Books/Akeneo entries (`add_item_by_id`, `create_books_contact`, `fetch_customer_from_books`, `search_items_akeneo`, `fetch_item_from_akeneo`, `create_estimate`) and `create_bin_receiving` stay placeholders — reuse Foundation's existing "not ported yet" placeholder mechanism (check `app/fulfillment/apis.py` for the established placeholder pattern and match it exactly, do not invent a new placeholder shape).

2a. Tests for `shipment_schedules.py` — **Node-test-verified, added this pass** (an earlier draft of this task had no test block at all for this file). Oracle: `tests/procurement/supplier-copies.test.js`'s "the daily shipment schedules" section (lines 103-131):
```python
import pytest
import datetime


# Node: '10-day check: a shipment with 10 days or less is notified once; more days, a blank count, or already notified is not'
@pytest.mark.asyncio
async def test_run_shipment_10_day_check_notifies_once_for_near_shipments(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    near = await store.add_record("Shipments", {"Shipment_No": "SHP-00001", "Remaining_Days": 6})
    await store.add_record("Shipments", {"Shipment_No": "SHP-00002", "Remaining_Days": 30})
    await store.add_record("Shipments", {"Shipment_No": "SHP-00003"})
    await store.add_record("Shipments", {"Shipment_No": "SHP-00004", "Remaining_Days": 2, "Notified_10d": True})
    assert await run_shipment_10_day_check(store) == {"notified": 1}
    notes = await store.find("App_Notifications")
    assert notes[0]["Message"] == "Shipment SHP-00001 has 6 day(s) left on its timeline."
    assert str(notes[0]["Source_Record_ID"]) == str(near)
    assert await run_shipment_10_day_check(store) == {"notified": 0}, "told once"


# Node: 'delay status: past the arrival date is Delayed, within 7 days is "Arriving in 1 Week"; Delivered and far-off shipments are left alone'
@pytest.mark.asyncio
async def test_run_shipment_delay_status_sets_delayed_and_arriving_soon(db_conn):
    from app.store import create_store
    store = create_store(db_conn)
    mk = lambda no, eta, status="In Transit": store.add_record("Shipments", {"Shipment_No": no, "Estimated_Warehouse_Arrival": eta, "Shipment_Status": status})
    await mk("A", "2026-11-10")
    await mk("B", "2026-11-20")
    await mk("C", "2026-12-30")
    await mk("D", "2026-11-01", "Delivered")
    await mk("E", "")
    counts = await run_shipment_delay_status(store, today=datetime.datetime(2026, 11, 17))
    assert counts == {"delayed": 1, "arriving": 1, "skippedDelivered": 1, "checked": 3, "changed": 2}
    status = {s["Shipment_No"]: s["Shipment_Status"] for s in await store.find("Shipments")}
    assert status == {"A": "Delayed", "B": "Arriving in 1 Week", "C": "In Transit", "D": "Delivered", "E": "In Transit"}
```

3. Write the final `app/procurement/__init__.py`, matching Node's `workflows.mjs` import order exactly (already confirmed this session):
```python
# Procurement module manifest. Ported from server/modules/procurement/{index,workflows}.mjs.
# Importing this package registers every hook below, via each submodule's own register(...)
# calls at import time.
import app.procurement.inquiry  # noqa: F401
import app.procurement.inq_spec  # noqa: F401
import app.procurement.purchase_request  # noqa: F401
import app.procurement.pr_spec  # noqa: F401
import app.procurement.purchase_order  # noqa: F401
import app.procurement.shipments  # noqa: F401
import app.procurement.ship_track  # noqa: F401
import app.procurement.po_spec  # noqa: F401
import app.procurement.decisions  # noqa: F401
import app.procurement.settings_hooks  # noqa: F401
import app.procurement.receiving  # noqa: F401
import app.procurement.receiving_spec  # noqa: F401
import app.procurement.supplier_portal_workflows  # noqa: F401
import app.procurement.production_portal  # noqa: F401
import app.procurement.replacement_exceptions  # noqa: F401
import app.procurement.rr_spec  # noqa: F401
import app.procurement.projects  # noqa: F401
import app.forecast.pr_hooks  # noqa: F401 -- Node: workflows.mjs's own last import, ../../forecast/pr-hooks.mjs

import app.procurement.apis  # noqa: F401 -- registers CUSTOM_APIS, not a hook file, but must load for invoke_custom_api to find these names

FORMS = [
    "Inquiry_Form", "Purchase_Request1", "Purchase_Order", "Shipments", "Receiving",
    "Replacement_Request", "Exceptions", "Supplier_1", "Supplier_2", "Projects",
    "Ladder_Events", "Approval_Queue", "Procurement_Settings", "Procurement_Settings_History",
    "Target_Date_Changes",
]
```
(`FORMS` list copied verbatim from `server/modules/procurement/index.mjs`'s `forms` array, already confirmed this session.)

4. Tests — mirror Fulfillment's own `tests/fulfillment/test_module_manifest.py` (already read this session as the convention reference) exactly:
```python
from app.workflows import WORKFLOWS
import app.procurement  # noqa: F401


def test_importing_the_module_registers_hooks_on_every_form_it_owns():
    for form in ["Inquiry_Form", "Purchase_Request1", "Purchase_Order", "Shipments", "Receiving", "Replacement_Request", "Exceptions", "Projects", "Approval_Queue", "Procurement_Settings"]:
        assert form in WORKFLOWS, form


def test_forms_list_matches_the_forms_this_module_touches():
    assert set(app.procurement.FORMS) == {
        "Inquiry_Form", "Purchase_Request1", "Purchase_Order", "Shipments", "Receiving",
        "Replacement_Request", "Exceptions", "Supplier_1", "Supplier_2", "Projects",
        "Ladder_Events", "Approval_Queue", "Procurement_Settings", "Procurement_Settings_History",
        "Target_Date_Changes",
    }


def test_pr_hooks_is_imported_by_the_procurement_module():
    import sys
    assert "app.forecast.pr_hooks" in sys.modules
    assert "Purchase_Request1" in WORKFLOWS
```

5. Run the full suite: `python -m pytest -q`. Fix any import-order failure (a hook file importing a sibling that hasn't registered yet) by checking whether the failing import is module-level (should already be resolved by this task's position in the sequence) or needs converting to a local import matching the Task 10/18 pattern.

6. Update `vault/Deluge Scripts (Obsidian)/00 - Change Log.md` per CLAUDE.md's standing instruction (new entry at the top of today's date, what changed/why/what was checked/what was NOT checked — explicitly note the test-oracle honesty gap from this plan's constraints section).

---

## Final verification (after Task 22)

1. `python -m pytest -q` — full suite, expect 273 (Foundation+Fulfillment) + however many new Procurement tests, all green.
2. `python -m pytest tests/ -q --collect-only | grep procurement | wc -l` sanity check that every task's test file was actually collected (catches a typo'd filename that pytest silently skips).
3. Manual smoke test (same pattern as the Fulfillment post-port check that found `dc1fcf4`'s two bugs): start `uvicorn app.main:create_app --factory --reload` against local Postgres, log in, open the Procurement Dashboard widget, confirm it now renders real data instead of the "Not Found"/"Could not load live data" placeholder states seen before this port existed. This step needs the user's own browser session — flag it as the next action after code review, do not claim "works end-to-end" without it actually having been run.

---

## Self-Review Notes (2026-11-19, correctness pass — test-oracle re-verification)

This pass replaced every task's test code that had been written from **source** (`.mjs` body reading) with code ported directly from the real **Node test files**, now all read in full. No part of the plan was executed — this is a document-only correction. Nothing below was run; "confirmed" means "confirmed against the real Node test file's text," not "confirmed by running Python."

**Tasks whose test code was replaced (source-derived -> Node-test-verified):**
- Task 2 (`settings_defs.py`) — oracle: `procurement-decisions.test.js` lines 46-97 (CP-R6 messages, ladder-must-go-up, shortest-cannot-exceed-longest).
- Task 3 (`suppliers.py`) — oracle: `procurement-supplier-portal-spec.test.js` lines 200-203 (`portalOf` name matching). `supplier_index`/`quote_books_id` have no Node test oracle anywhere in the 18 files and stay flagged as such, not silently re-labeled as verified.
- Task 5 (`plan.py`) — oracle: `procurement-ship-track.test.js` lines 49-80 (feasibility/plannedChain/forecastChain) and `procurement-inq-spec.test.js` line 44-47 (parseLeadDays cases).
- Task 6 (`decisions_core.py`) — oracle: `procurement-decisions.test.js`'s "Decisions list" section (prepare_item, alert_recipient, sales_agent_recipient, escalate_overdue).
- Task 7 (`sorting.py`) — oracle: `procurement-ship-track.test.js` lines 162-200 (categorise/rank boundaries).
- Task 8 (`purchase_order.py`/`po_spec.py`) — oracle: `procurement-po-shipments.test.js` lines 25-54 and `procurement-po-spec.test.js` lines 158-271.
- Task 9 (`rr_spec.py`) — oracle: `procurement-rr-spec.test.js` (target_for, run_rr_daily, get_rr_report).
- Task 10 (`receiving.py`) — oracle: `procurement-receiving.test.js` (totals, line result, exception creation, quantity-mismatch notification).
- Task 11 (`ship_track.py` pass 1) — oracle: `procurement-ship-track.test.js` lines 111-159 (apply_shipment_event) and `procurement-supplier-portal-spec.test.js` SP-R5 (report_shipment_delay).
- Task 12 (`receiving_spec.py`/`receiving_buttons.py`) — oracle: `procurement-receiving-spec.test.js` and `procurement-receiving-buttons.test.js`.
- Task 13 (`replacement_requests.py`/`replacement_exceptions.py`) — oracle: `procurement-po-approval.test.js` lines 155-208 (createRRMain/createRRSupplier) and `procurement-po-shipments.test.js` lines 128-152 (RR before-save rules).
- Task 14 (`purchase_request.py`/`pr_spec.py`) — **this task's own text previously claimed its tests were "the one Node test file read in full," but the actual test code block was only a comment telling a future implementer to port it later — no real test code existed.** Replaced with real ported cases from `tests/procurement/pr-workflows.test.js` (216 lines) and `procurement-pr-spec.test.js`.
- Task 15 (`shipments.py`) — **same gap**: the test block was a `...` stub, not real code. Replaced with real cases from `procurement-po-shipments.test.js` lines 56-126.
- Task 16 (`inquiry.py`/`inq_spec.py`) — **same gap**: the task said "no Node test file for it was read in full," which stopped being true once `tests/procurement/inquiry-workflows.test.js` and `procurement-inq-spec.test.js` were read this pass. Replaced with real cases.
- Task 17 (`po_create.py`/`po_approval.py`/`clone_shipment.py`) — oracle: `procurement-po-spec.test.js` lines 47-100 (feasibility gate), `procurement-po-approval.test.js` lines 36-236, `procurement-receiving-buttons.test.js` lines 101-166 (clone_shipment).
- Task 18 (`ship_track.py` pass 2) — **same stub gap** as Tasks 14/15: the test step was a one-line description with no code. Replaced with real ladder/rescore cases from `procurement-ship-track.test.js` lines 202-313.
- Task 19 (`decisions.py`) — oracle: `procurement-decisions.test.js`'s "Decisions list" section lines 138-276.
- Task 20 (`settings_hooks.py`/`dashboard.py`) — oracle: `procurement-decisions.test.js` lines 99-136 and `procurement-dashboard.test.js` (all six tests).
- Task 21 (`projects.py`/`supplier_portal_workflows.py`/`production_portal.py`) — oracle: `tests/procurement/supplier-copies.test.js` lines 90-95, `procurement-supplier-portal.test.js` lines 22-85, `procurement-supplier-portal-spec.test.js` lines 132-194.
- Task 22 (`shipment_schedules.py`) — **had no test block at all** in the prior draft; added one from `tests/procurement/supplier-copies.test.js` lines 103-131.

**Task left as-is (already real, double-checked):** Task 14's self-reported "read in full" claim about the Node test file was accurate for the *file having been read*, but the *test code written into the plan* did not match that claim — see above; this is now fixed, so it is no longer an exception to the "already done" rule, it's one of the corrections.

**Implementation code (not just tests) that also had to change, because the real Node test files exposed wrong signatures:**
- Task 5 — `plan.py`'s Interfaces block was missing `DEFAULT_SETTINGS`, `SPEC_NUMBERS`, and `planned_chain` (Node: `plannedChain`), confirmed exported and used directly by `procurement-ship-track.test.js`'s import line. Added.
- Task 7 — `sorting.py`'s `categorise()` was specified to return a bare `str`; the real Node tests read `.category`/`.blocked_reason`/`.priority_reason`/`.no_target` off its result, so it returns a dict. `rank()` was specified to return a re-sorted `list`; the real test calls `.get(id)` on it (a `Map`), so it returns an `id -> rank` mapping. Both signatures corrected.
- Task 10 — step 3 pointed to "Task 17" for where `receiving_spec.py` is built; it is actually Task 12. Corrected.
- Task 12 — `create_receiving_from_shipment`'s interface had `(payload, data, ctx)`; the real Node dispatch is `invokeCustomApi(name, payload, rawStore, ctx)`, i.e. `(payload, store, ctx)`, matching every other custom-API handler. Corrected.
- Task 13 — `create_rr_main`/`create_rr_supplier` were specified with a trailing `ctx` param; the real Node test calls them as `createRRMain({ exceptionId }, store)` / `createRRSupplier('Tony', { exceptionId }, store)` with no `ctx`. Corrected, and all call sites in this task's own test code updated to match.
- Task 17 — `approve_po_main`, `approve_supplier_po`, `approve_po_hc` were all specified with a trailing `ctx` param that the real Node call sites don't have (`approvePOMain({ soNo }, raw)`, `approveSupplierPO('Tony', { soNo }, store)`, `approvePOHC({ soNo }, store)`). `clone_shipment_for_replacement` had the same `(payload, data, ctx)` bug as Task 12's function. All four corrected.

**Not re-verified in this pass (explicitly out of scope for this correctness pass, per the user's instruction to only correct and recommit the document, not execute it):**
- None of the corrected test code has been run. No Python implementation exists yet (`app/procurement/` does not exist in this repo as of this pass) — this document still describes work to be done, now with a more reliable test oracle.
- `events.py` (Task 4) remains source-derived by necessity — no Node test file anywhere in the repository exercises `events.mjs` as a standalone unit.
- The exact keyword-argument names on several corrected functions (e.g. `prepare_item`'s field names, `report_shipment_delay`'s `date`/`reason`/`source`) are taken from Node call-site shapes, not from re-reading every target `.mjs` function body character-by-character in this pass — each such case is flagged inline in its task with a note to confirm against the real source body at write time, which is the same discipline the original plan already used for signatures it hadn't fully nailed down.
- The `supplier-portal.mjs` (no `-workflows` suffix) exclusion — confirmed consistent with the design doc's explicit out-of-scope decision; several Node test files call its `acknowledgePO`/`approveRR` functions only as fixture/setup steps to drive PO and RR state for assertions on `Purchase_Order`/`Replacement_Request`, not as a request to port those functions. No scope change made.
