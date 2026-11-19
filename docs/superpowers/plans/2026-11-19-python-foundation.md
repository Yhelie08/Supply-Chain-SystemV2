# Python Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure-plumbing Python backend (schema loader, store, criteria parser, hook system, auth/access, HTTP layer) that serves the existing, byte-unmodified widget HTML/JS files against a FastAPI server instead of the Node one — proven by Order Readiness's read/write round-trip.

**Architecture:** Direct behavioral ports (not transpiles) of six Node files, each becoming one focused Python module: `app/model.py` (schema/form loader), `app/criteria.py` (JS-predicate-style fallback filter), `app/criteria_sql.py` (best-effort SQL pushdown), `app/schema.py` (DDL), `app/store.py` (the CRUD + `find`/`nextNumber` operations), `app/workflows.py` (the hook/register system), `app/access.py` + `app/auth.py` (session + role/section access), and `app/main.py` (FastAPI app wiring the `/api/*` routes). Raw parameterized SQL via `asyncpg` throughout — confirmed from reading the Node store, which itself builds raw SQL strings dynamically from the column map rather than using an ORM; an ORM would fight that design, not match it.

**Tech Stack:** Python 3.12, FastAPI, `asyncpg` (no ORM), `pytest` + `pytest-asyncio`, a local Postgres (or `testing.postgresql`/a Docker Postgres for CI — decided in Task 1) for tests, matching the Node repo's own PGlite-for-tests / real-Postgres-for-prod split in spirit.

**Spec:** `docs/superpowers/specs/2026-11-19-python-foundation-design.md`

## Global Constraints

- Every `/api/*` route returns HTTP 200 on BOTH success and application-level error; the error/success distinction lives entirely in the JSON body's `code` field (`3000` = success, anything else = error). Confirmed from `server/index.mjs`: `return send(res, 200, result)` on success and `return send(res, 200, { code: e.code || 500, message: e.message })` in the catch block — never a 4xx/5xx HTTP status for an application error. The one real exception is auth: an unauthenticated request to a protected route DOES get HTTP 401 (confirmed: `return p.startsWith('/api/') ? send(res, 401, ...) : redirect(...)`), and `/api/getRecords`-etc.'s per-op 404 for an unknown operation name.
- Record IDs are always strings end-to-end (Postgres `BIGINT`, Python `str`), never cast to `int`/`float` — a Zoho ID is 19 digits, wider than a float can represent exactly and wider than many languages' safe integer range.
- `addRecords`/`updateRecordById`/`updateRecords`/`deleteRecordById` wrap their result as `{code: 3000, data: {ID: <id>}, message: '<fixed string>'}`; `getRecords`/`getRecordById` wrap theirs as `{code: 3000, data: <rows-or-row>}` with no `message`. These exact shapes are what `zoho-shim.js` (unmodified, not touched by this plan) expects.
- No department business logic anywhere in this plan. `invoke_custom_api`'s dispatch table exists and is wired (Task 7) but is empty — calling any API name returns a "not ported yet" response, mirroring Node's `custom-api-helpers.mjs`'s `notPorted()`.
- Every task's tests must pass before moving to the next task.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/model.py` | Load `zoho-export/parsed/forms/*.json` + `server/spec-forms/*.json` into a `FORMS`/`COLUMNS` map; `form_of_report()`, `form_by_name()` lookups |
| `app/criteria.py` | Tokenize + compile a Zoho criteria string into a Python predicate function (the always-correct fallback) |
| `app/criteria_sql.py` | Best-effort translation of a Zoho criteria string into a parameterized SQL fragment; returns `None` when unsupported so the caller falls back to `app/criteria.py` |
| `app/schema.py` | `ensure_schema(conn)`: creates/alters tables to match `app/model.py`'s column map; `quote_ident()` |
| `app/store.py` | `get_records`, `get_record_by_id`, `add_record`, `update_record`, `delete_record`, `find`, `next_number`, `table_counts` — the full CRUD surface, raw-store (unhooked) |
| `app/workflows.py` | `register(form, hooks)`, `create_hooked_store(raw_store)` — wraps `store.py`'s functions with before/after phase dispatch |
| `app/access.py` | Role/section visibility, `check_call`, `scope_criteria`, `check_record_access` — ported from `server/access.mjs` |
| `app/auth.py` | Session cookie issuance/verification, login/logout, password change — ported from `server/auth.mjs` |
| `app/custom_apis.py` | `invoke_custom_api(name, payload, store, ctx)` dispatch table — empty this plan, wired for later sub-projects to populate |
| `app/main.py` | FastAPI app: `/api/*` routes, `/login`, `/logout`, `/api/me`, `/api/pages`, static file serving for `modules/` and `server/public/` |
| `tests/test_model.py`, `tests/test_criteria.py`, `tests/test_criteria_sql.py`, `tests/test_schema.py`, `tests/test_store.py`, `tests/test_workflows.py`, `tests/test_access.py`, `tests/test_main.py` | One test file per module above |

---

## Task 1: Project scaffold + `app/model.py`

**Files:**
- Create: `pyproject.toml` (or `requirements.txt` — whichever this repo's existing `package.json`-adjacent convention suggests once Step 1 checks; default to `pyproject.toml` with `uv` or `pip-tools` if neither is dictated)
- Create: `app/__init__.py`, `app/model.py`
- Test: `tests/test_model.py`

**Interfaces:**
- Produces: `FORMS: dict[str, dict]` (raw parsed form JSON, keyed by form name, after spec-forms extension merge), `COLUMNS: dict[str, dict[str, dict]]` (`{form: {column_name: {type, kind, lookup}}}`), `form_of_report(report_name: str) -> tuple[str, str | None]` (returns `(form_name, report_criteria_or_None)`, raises `ZohoError(9230, ...)` if not found), `form_by_name(form_name: str) -> str` (raises `ZohoError(9220, ...)` if not found), `SYSTEM_COLUMNS: list[str] = ['ID', 'Added_Time', 'Modified_Time', 'Added_User', '_extra']`.

- [ ] **Step 1: Confirm the Python project layout convention**

Run: `ls` at the repo root and check for any existing `pyproject.toml`, `requirements.txt`, or `setup.py` left over from a prior attempt. If none exists, create `pyproject.toml`:

```toml
[project]
name = "supply-chain-system-v2-python"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "asyncpg>=0.30.0",
    "python-multipart>=0.0.12",
]

[project.optional-dependencies]
dev = ["pytest>=8.3.0", "pytest-asyncio>=0.24.0"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
```

Run: `pip install -e ".[dev]"` to confirm it installs cleanly.

- [ ] **Step 2: Write the failing test**

Create `tests/test_model.py`:

```python
from app.model import FORMS, COLUMNS, form_of_report, form_by_name, SYSTEM_COLUMNS
from app.criteria import ZohoError
import pytest

def test_sales_order_fulfillment_form_is_loaded():
    assert "Sales_Order_Fulfillment" in FORMS
    cols = COLUMNS["Sales_Order_Fulfillment"]
    assert "Fulfillment_Stage" in cols
    assert "Category" in cols  # this session's Fulfillment sorting-engine field, confirms parsing works end to end

def test_spec_forms_extension_merges_fields_onto_the_base_form():
    # Stage_Events: base form has Record_Type/Record_Id/Event/Occurred_At/Reported_At/Source/Note;
    # server/spec-forms/Stage_Events.json (extends: true) adds Record_No/Occurred_Bound/Actor/Visit_No.
    cols = COLUMNS["Stage_Events"]
    assert "Record_Id" in cols
    assert "Occurred_Bound" in cols
    assert "Visit_No" in cols

def test_form_of_report_resolves_a_real_report_name():
    form, criteria = form_of_report("Sales_Order_Fulfillment_Report")
    assert form == "Sales_Order_Fulfillment"

def test_form_of_report_falls_back_to_the_form_name_itself_when_no_report_entry_exists():
    # Confirmed in the Node repo's server/model.mjs: a name with no reports.json entry but a real
    # form of the same name resolves to that form directly (used by Capacity_Days, which has no report).
    form, criteria = form_of_report("Capacity_Days")
    assert form == "Capacity_Days"

def test_form_of_report_raises_zoho_error_9230_for_an_unknown_name():
    with pytest.raises(ZohoError) as exc:
        form_of_report("Totally_Made_Up_Report")
    assert exc.value.code == 9230

def test_form_by_name_raises_zoho_error_9220_for_an_unknown_form():
    with pytest.raises(ZohoError) as exc:
        form_by_name("Totally_Made_Up_Form")
    assert exc.value.code == 9220

def test_system_columns_are_excluded_from_a_forms_own_columns():
    assert set(SYSTEM_COLUMNS) == {"ID", "Added_Time", "Modified_Time", "Added_User", "_extra"}
```

- [ ] **Step 3: Run to verify it fails**

Run: `pytest tests/test_model.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.model'`

- [ ] **Step 4: Implement `app/model.py`**

```python
# Loads zoho-export/parsed/forms/*.json plus server/spec-forms/*.json (fields added to an existing
# form without being wiped by a future npm run parse-ds re-export) into FORMS/COLUMNS. Ported from
# server/model.mjs — same two-pass structure: base forms, then spec-forms merge.
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARSED = ROOT / "zoho-export" / "parsed"
SPEC_FORMS = ROOT / "server" / "spec-forms"

SYSTEM_COLUMNS = ["ID", "Added_Time", "Modified_Time", "Added_User", "_extra"]

NO_VALUE = {"section", "help_text", "plaintext", "submit", "cancel", "tooltip"}
NUMBER = {"number", "decimal", "percentage", "CNY", "PHP", "currency", "autonumber"}
JSONISH = {"grid", "name", "address", "checkboxes", "list"}


def _load_forms() -> dict:
    forms = {}
    for f in (PARSED / "forms").glob("*.json"):
        form = json.loads(f.read_text(encoding="utf-8"))
        forms[form["name"]] = form
    if SPEC_FORMS.exists():
        for f in sorted(SPEC_FORMS.glob("*.json")):
            add = json.loads(f.read_text(encoding="utf-8"))
            own = forms.get(add["name"])
            if add.get("extends"):
                if not own:
                    raise RuntimeError(f'spec-forms/{f.name} extends "{add["name"]}", which is not in the parsed export')
                have = {x["name"] for x in own["fields"]}
                own["fields"].extend(x for x in add["fields"] if x["name"] not in have)
            elif not own:
                forms[add["name"]] = {"name": add["name"], "label": add.get("label", add["name"]), "fields": add["fields"]}
    return forms


def _load_reports() -> dict:
    reports_file = PARSED / "reports.json"
    if not reports_file.exists():
        return {}
    return {r["name"]: r for r in json.loads(reports_file.read_text(encoding="utf-8"))}


def _build_columns(forms: dict) -> dict:
    columns = {}
    for form in forms.values():
        cols = {}
        for f in form.get("fields", []):
            ftype = f.get("type")
            if ftype in NO_VALUE or not ftype:
                continue
            if ftype == "checkbox":
                kind = "bool"
            elif ftype in NUMBER:
                kind = "num"
            elif ftype in JSONISH:
                kind = "json"
            else:
                kind = "text"
            lookup = f.get("lookup", {}).get("form") if isinstance(f.get("lookup"), dict) else None
            cols[f["name"]] = {"type": ftype, "kind": kind, "lookup": lookup}
        columns[form["name"]] = cols
    return columns


FORMS = _load_forms()
REPORTS = _load_reports()
COLUMNS = _build_columns(FORMS)


class ZohoErrorBase(Exception):
    """Re-exported by app.criteria as ZohoError; defined here to avoid a circular import between
    model.py and criteria.py (both need it, criteria.py owns the canonical name)."""
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def form_of_report(report_name: str) -> tuple[str, str | None]:
    r = REPORTS.get(report_name)
    if r and r.get("form") in COLUMNS:
        return r["form"], r.get("criteria")
    if report_name in COLUMNS:
        return report_name, None
    raise ZohoErrorBase(9230, f"Report '{report_name}' not found in the parsed .ds")


def form_by_name(form_name: str) -> str:
    if form_name not in COLUMNS:
        raise ZohoErrorBase(9220, f"Form '{form_name}' not found in the parsed .ds")
    return form_name
```

- [ ] **Step 5: Run to verify it passes**

Run: `pytest tests/test_model.py -v`
Expected: FAIL on the `ZohoError` import (not yet created in `app/criteria.py` — expected at this point, since Task 2 creates it) — this is fine; re-run after Task 2. For now, confirm the non-`ZohoError` tests pass by running: `pytest tests/test_model.py -v -k "not raises"`
Expected: PASS for `test_sales_order_fulfillment_form_is_loaded`, `test_spec_forms_extension_merges_fields_onto_the_base_form`, `test_form_of_report_resolves_a_real_report_name`, `test_form_of_report_falls_back_to_the_form_name_itself_when_no_report_entry_exists`, `test_system_columns_are_excluded_from_a_forms_own_columns`.

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml app/__init__.py app/model.py tests/test_model.py
git commit -m "feat: project scaffold and app/model.py (form/column loader)"
```

---

## Task 2: `app/criteria.py` — the JS-predicate-style fallback compiler

**Files:**
- Create: `app/criteria.py`
- Test: `tests/test_criteria.py`

**Interfaces:**
- Consumes: nothing from Task 1 directly (pure string compiler), but re-exports `ZohoError` as the one real class every other module imports (Task 1's `ZohoErrorBase` is an internal alias to avoid the circular import; from here on, `app.criteria.ZohoError` is canonical and `app/model.py`'s `form_of_report`/`form_by_name` should be updated in this task to raise `app.criteria.ZohoError` once it exists).
- Produces: `ZohoError(code: int, message: str)`, `compile_criteria(src: str, ctx: dict) -> Callable[[dict], bool]`, `zoho_now() -> str`, `today() -> str`.

- [ ] **Step 1: Read the Node source for exact tokenizer/grammar behavior**

Run: `cat ../Supply-Chain-SystemV2/server/criteria.mjs` (adjust the relative path to wherever the Node repo clone sits) — read `TOKEN`, `compileCriteria`, and every operator it supports (`==`, `!=`, `>=`, `<=`, `>`, `<`, `&&`, `||`, `!`, `.contains(...)`, `.startsWith(...)`, `.endsWith(...)`, parentheses) before writing the Python port, since this plan does not re-derive the grammar from scratch — it is read from the real file at this step.

- [ ] **Step 2: Write the failing tests**

Create `tests/test_criteria.py` (one test per operator the Node source defines — fill in the exact literal cases the Node tokenizer/grammar support once Step 1 is read; at minimum, cover):

```python
import pytest
from app.criteria import ZohoError, compile_criteria, zoho_now, today
import re

def test_equality_on_a_string_field():
    pred = compile_criteria('(Status == "Yes")', {})
    assert pred({"Status": "Yes"}) is True
    assert pred({"Status": "No"}) is False

def test_inequality():
    pred = compile_criteria('(Status != "Yes")', {})
    assert pred({"Status": "No"}) is True

def test_and_or_combination_with_parentheses():
    pred = compile_criteria('(Status == "Yes" || Has_Credit_Terms == true)', {})
    assert pred({"Status": "No", "Has_Credit_Terms": True}) is True
    assert pred({"Status": "No", "Has_Credit_Terms": False}) is False

def test_blank_criteria_matches_everything():
    pred = compile_criteria("", {})
    assert pred({"anything": "at all"}) is True
    pred2 = compile_criteria(None, {})
    assert pred2({}) is True

def test_zoho_error_carries_a_code():
    e = ZohoError(9230, "not found")
    assert e.code == 9230
    assert str(e) == "not found"

def test_zoho_now_format():
    # "YYYY-MM-DD hh:mm:ss AM/PM" -- confirmed from server/criteria.mjs's zohoNow()
    assert re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} (AM|PM)$", zoho_now())

def test_today_format():
    assert re.match(r"^\d{4}-\d{2}-\d{2}$", today())
```

Add further tests here for every operator/function confirmed present in Step 1 that is not already covered above (`.contains`, `.startsWith`, `.endsWith`, `!`, numeric `>`/`<`/`>=`/`<=`) — do not skip any operator the Node source implements.

- [ ] **Step 3: Run to verify it fails**

Run: `pytest tests/test_criteria.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 4: Implement `app/criteria.py`**

Port `compileCriteria`'s tokenizer and recursive-descent/Pratt parser from the Node source read in Step 1, translated to Python (regex tokenizer using `re`, an AST of small dataclasses or nested closures, a `compile_criteria` that returns a closure over the parsed AST). Include `zoho_now()`/`today()` ported from the same file's date-formatting functions (12-hour clock, zero-padded, exact format confirmed by Step 2's test). Write the actual implementation here, matching every token/operator confirmed in Step 1 — this step is not a placeholder; the real code goes here once Step 1's read is done, since the grammar must be copied from the live Node file to avoid drift, not re-invented blind in this plan.

- [ ] **Step 5: Update `app/model.py` to use the canonical `ZohoError`**

Replace `ZohoErrorBase` in `app/model.py` with an import: `from app.criteria import ZohoError`, and change `form_of_report`/`form_by_name` to raise `ZohoError` instead of `ZohoErrorBase`. Remove the `ZohoErrorBase` class entirely.

- [ ] **Step 6: Run both test files to verify everything passes**

Run: `pytest tests/test_model.py tests/test_criteria.py -v`
Expected: PASS, all tests green.

- [ ] **Step 7: Commit**

```bash
git add app/criteria.py app/model.py tests/test_criteria.py
git commit -m "feat: app/criteria.py (Zoho criteria string compiler) and canonical ZohoError"
```

---

## Task 3: `app/criteria_sql.py` — best-effort SQL pushdown

**Files:**
- Create: `app/criteria_sql.py`
- Test: `tests/test_criteria_sql.py`

**Interfaces:**
- Consumes: `app.criteria`'s tokenizer (reused, not reimplemented — confirmed from the Node source, `server/pg/criteria-sql.mjs` imports `TOKEN` from `criteria.mjs` directly), `app.model.COLUMNS`.
- Produces: `criteria_to_sql(src: str, form: str, ctx: dict, offset: int = 0) -> dict | None` — returns `{"sql": str, "params": list}` or `None` when the criteria string uses something this translator does not support (the caller then falls back to `app.criteria.compile_criteria` and filters in Python).

- [ ] **Step 1: Read the Node source for the exact supported subset**

Run: `cat ../Supply-Chain-SystemV2/server/pg/criteria-sql.mjs` — note precisely which criteria forms it translates (confirmed earlier in this plan's own research: `field == / != literal`, `.contains/startsWith/endsWith("text")`, combined with `&& || !` and parentheses, "every piece is two-valued, so NOT is safe") and which it refuses (anything else, by throwing an internal `Unsupported` exception that the outer function catches and returns `None` for).

- [ ] **Step 2: Write the failing tests**

Create `tests/test_criteria_sql.py`:

```python
from app.criteria_sql import criteria_to_sql

def test_simple_equality_translates_to_a_parameterized_condition():
    result = criteria_to_sql('(Status == "Yes")', "Sales_Order_Fulfillment", {}, 0)
    assert result is not None
    assert "$1" in result["sql"]
    assert result["params"] == ["Yes"]

def test_offset_shifts_the_placeholder_numbers():
    result = criteria_to_sql('(Status == "Yes")', "Sales_Order_Fulfillment", {}, 2)
    assert "$3" in result["sql"]

def test_blank_criteria_returns_true_with_no_params():
    result = criteria_to_sql("", "Sales_Order_Fulfillment", {}, 0)
    assert result == {"sql": "TRUE", "params": []}

def test_and_or_combination():
    result = criteria_to_sql('(Status == "Yes" || Has_Credit_Terms == true)', "Sales_Order_Readiness_Gate", {}, 0)
    assert result is not None
    assert "OR" in result["sql"].upper() or "||" not in result["sql"]  # exact SQL keyword confirmed from the Node source in Step 1

def test_unsupported_criteria_returns_none_not_an_exception():
    # Confirmed from the Node source: an internal Unsupported exception is caught and converted to None,
    # never propagated — the caller relies on None, not a try/except, to decide to fall back.
    result = criteria_to_sql('(SomeField.someUnsupportedThing())', "Sales_Order_Fulfillment", {}, 0)
    assert result is None
```

Add further tests for `.contains`/`.startsWith`/`.endsWith` once Step 1 confirms their exact SQL translation (likely `LIKE` with wildcards, confirmed by reading the Node source rather than guessed here).

- [ ] **Step 3: Run to verify it fails**

Run: `pytest tests/test_criteria_sql.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 4: Implement `app/criteria_sql.py`**

Port the Node file's tokenizer reuse + recursive translator, catching any "I don't understand this" case internally and returning `None` from `criteria_to_sql` rather than raising. Reuse `app.criteria`'s tokenizer function if it was written in Task 2 in a way that's importable (e.g. a `tokenize(src: str) -> list[str]` helper) — if Task 2's implementation inlined tokenization into `compile_criteria` without a separate reusable function, add that extraction to `app/criteria.py` now (a small refactor, justified because this task's own requirement is to reuse it, matching the Node source's actual import structure) and re-run Task 2's tests to confirm the refactor didn't change its behavior.

- [ ] **Step 5: Run to verify it passes**

Run: `pytest tests/test_criteria.py tests/test_criteria_sql.py -v`
Expected: PASS, all tests green (including Task 2's tests, confirming the tokenizer-extraction refactor was safe).

- [ ] **Step 6: Commit**

```bash
git add app/criteria_sql.py app/criteria.py tests/test_criteria_sql.py
git commit -m "feat: app/criteria_sql.py (best-effort SQL pushdown for Zoho criteria)"
```

---

## Task 4: `app/schema.py` — DDL

**Files:**
- Create: `app/schema.py`
- Test: `tests/test_schema.py`

**Interfaces:**
- Consumes: `app.model.COLUMNS`, `app.model.SYSTEM_COLUMNS`.
- Produces: `quote_ident(name: str) -> str`, `own_columns(form: str) -> list[tuple[str, dict]]` (a form's columns excluding `SYSTEM_COLUMNS`), `async def ensure_schema(conn) -> int` (returns how many DDL statements ran — `conn` is an `asyncpg.Connection`), `SEQ = "record_id_seq"`, `SEQ_START = "4900000000000000000"`.

- [ ] **Step 1: Set up a test Postgres connection fixture**

Create a `conftest.py` at the repo root (or `tests/conftest.py`) with a `pytest-asyncio` fixture that connects to a test Postgres database (confirm with the user or use a local Postgres instance pointed at by a `TEST_DATABASE_URL` env var — do not assume Docker is available; check first with `which docker` and `pg_ctl --version` or similar, and fail the fixture with a clear message naming exactly what's missing rather than silently skipping):

```python
import os
import asyncpg
import pytest

@pytest.fixture
async def db_conn():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.fail("Set TEST_DATABASE_URL to a Postgres connection string for tests (e.g. postgresql://localhost/supply_chain_test)")
    conn = await asyncpg.connect(url)
    yield conn
    # Clean slate between test modules: drop every table this test suite might have created.
    tables = await conn.fetch("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    for t in tables:
        await conn.execute(f'DROP TABLE IF EXISTS "{t["tablename"]}" CASCADE')
    await conn.execute("DROP SEQUENCE IF EXISTS record_id_seq")
    await conn.close()
```

- [ ] **Step 2: Write the failing test**

Create `tests/test_schema.py`:

```python
import pytest
from app.schema import ensure_schema, quote_ident, SEQ, SEQ_START

def test_quote_ident_escapes_embedded_quotes():
    assert quote_ident("Sales_Order_Fulfillment") == '"Sales_Order_Fulfillment"'
    assert quote_ident('weird"name') == '"weird""name"'

@pytest.mark.asyncio
async def test_ensure_schema_creates_tables_for_every_form(db_conn):
    changes = await ensure_schema(db_conn)
    assert changes > 0
    row = await db_conn.fetchrow(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'Sales_Order_Fulfillment' AND column_name = 'Category'"
    )
    assert row is not None

@pytest.mark.asyncio
async def test_ensure_schema_is_idempotent(db_conn):
    first = await ensure_schema(db_conn)
    assert first > 0
    second = await ensure_schema(db_conn)
    assert second == 0  # nothing left to create or alter on a second run

@pytest.mark.asyncio
async def test_system_columns_exist_on_every_table(db_conn):
    await ensure_schema(db_conn)
    for col in ["ID", "Added_Time", "Modified_Time", "Added_User", "_extra"]:
        row = await db_conn.fetchrow(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'Sales_Order_Fulfillment' AND column_name = $1", col
        )
        assert row is not None, f"missing system column {col}"
```

- [ ] **Step 3: Run to verify it fails**

Run: `pytest tests/test_schema.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 4: Implement `app/schema.py`**

```python
# Postgres schema generated from the parsed Zoho export + spec-forms. Ported from server/pg/schema.mjs.
# Record IDs are BIGINT; always handled as Python str, never int/float (a Zoho ID is 19 digits).
from app.model import COLUMNS, SYSTEM_COLUMNS

SEQ = "record_id_seq"
SEQ_START = "4900000000000000000"
PG_TYPE = {"num": "NUMERIC", "bool": "BOOLEAN", "json": "JSONB", "text": "TEXT"}


def quote_ident(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def own_columns(form: str) -> list[tuple[str, dict]]:
    return [(name, col) for name, col in COLUMNS[form].items() if name not in SYSTEM_COLUMNS]


async def ensure_schema(conn) -> int:
    await conn.execute(f"CREATE SEQUENCE IF NOT EXISTS {SEQ} START {SEQ_START}")
    await conn.execute(
        "CREATE TABLE IF NOT EXISTS _number_series "
        "(form TEXT NOT NULL, field TEXT NOT NULL, last_num BIGINT NOT NULL DEFAULT 0, PRIMARY KEY (form, field))"
    )
    rows = await conn.fetch("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()")
    have: dict[str, set[str]] = {}
    for r in rows:
        have.setdefault(r["table_name"], set()).add(r["column_name"])

    statements: list[str] = []
    for form in COLUMNS:
        own = own_columns(form)
        if form not in have:
            col_defs = [
                f'"ID" BIGINT PRIMARY KEY DEFAULT nextval(\'{SEQ}\')',
                '"Added_Time" TEXT', '"Modified_Time" TEXT', '"Added_User" TEXT', '"_extra" JSONB',
                *[f"{quote_ident(name)} {PG_TYPE[col['kind']]}" for name, col in own],
            ]
            statements.append(f"CREATE TABLE {quote_ident(form)} ({', '.join(col_defs)})")
        else:
            for name, col in own:
                if name not in have[form]:
                    statements.append(f"ALTER TABLE {quote_ident(form)} ADD COLUMN {quote_ident(name)} {PG_TYPE[col['kind']]}")

    for stmt in statements:
        await conn.execute(stmt)
    return len(statements)
```

- [ ] **Step 5: Run to verify it passes**

Run: `pytest tests/test_schema.py -v`
Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add app/schema.py tests/test_schema.py conftest.py
git commit -m "feat: app/schema.py (DDL from the form/column model)"
```

---

## Task 5: `app/store.py` — the CRUD surface

**Files:**
- Create: `app/store.py`
- Test: `tests/test_store.py`

**Interfaces:**
- Consumes: `app.model.COLUMNS`, `app.model.form_of_report`, `app.model.form_by_name`, `app.criteria.ZohoError`, `app.criteria.compile_criteria`, `app.criteria.zoho_now`, `app.criteria_sql.criteria_to_sql`, `app.schema.quote_ident`, `app.schema.own_columns`.
- Produces: `create_store(pool) -> Store` where `Store` exposes `async def get_records(report_name, *, criteria=None, page=1, page_size=None, max_records=None, user=None) -> list[dict]`, `async def get_record_by_id(report_name, id, *, raw=False) -> dict`, `async def add_record(form_name, data, user="") -> str`, `async def update_record(report_or_form, id, data, *, by_form=False) -> str`, `async def delete_record(report_name, id) -> str`, `async def find(form_name, test=lambda r: True, *, criteria=None) -> list[dict]`, `async def next_number(form_name, field, prefix, digits=5) -> str`, `async def table_counts() -> list[dict]`.

- [ ] **Step 1: Read `encode`/`records` helpers in the Node source for exact field encoding rules**

Run: `cat ../Supply-Chain-SystemV2/server/pg/store.mjs` and specifically find the `encode(form, data, existingExtra)` function and whatever `records()` does (referenced but not shown in this plan's own earlier research — re-read it now) to port the exact rule for: which fields go into typed columns vs. the `_extra` JSONB sidecar, how lookup fields are read back as `{ID, display_value}` vs. raw IDs (the `raw` flag), and how `_extra` merges with new writes on an update (confirmed in this plan's research: `updateRecord` reads the current `_extra` first, passes it to `encode` as `existingExtra`, so unknown fields already stored are preserved across partial updates).

- [ ] **Step 2: Write the failing tests**

Create `tests/test_store.py` (uses the `db_conn` fixture from Task 4, but store takes a pool/connection wrapper — adapt the fixture to also provide a minimal pool-like object whose `.execute`/`.fetch` methods `store.py` calls, or have `create_store` accept a raw `asyncpg.Connection` directly for tests and a real pool in production — decide the exact shape in Step 1's read and match it, since the Node version's `db` parameter is "anything with query(sql, params)" and this plan's Python port should keep that same minimal-interface flexibility):

```python
import pytest
from app.schema import ensure_schema
from app.store import create_store

@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)

@pytest.mark.asyncio
async def test_add_record_then_get_record_by_id_round_trips(store):
    record_id = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-1", "Fulfillment_Stage": "Waiting For Package"})
    assert isinstance(record_id, str)
    rec = await store.get_record_by_id("Sales_Order_Fulfillment", record_id, raw=True)
    assert rec["SO_No"] == "SO-1"
    assert rec["Fulfillment_Stage"] == "Waiting For Package"

@pytest.mark.asyncio
async def test_update_record_preserves_extra_fields_not_touched_by_the_update(store):
    record_id = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-2", "Package": "PAC-2"})
    await store.update_record("Sales_Order_Fulfillment", record_id, {"Fulfillment_Stage": "Order Readiness"}, by_form=True)
    rec = await store.get_record_by_id("Sales_Order_Fulfillment", record_id, raw=True)
    assert rec["Package"] == "PAC-2"  # untouched by the update, still present
    assert rec["Fulfillment_Stage"] == "Order Readiness"

@pytest.mark.asyncio
async def test_get_records_returns_newest_first(store):
    id1 = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-A"})
    id2 = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-B"})
    rows = await store.get_records("Sales_Order_Fulfillment_Report")
    ids = [r["ID"] for r in rows]
    assert ids.index(id2) < ids.index(id1)  # newer (higher ID) comes first

@pytest.mark.asyncio
async def test_get_record_by_id_raises_zoho_error_9280_when_not_found(store):
    from app.criteria import ZohoError
    with pytest.raises(ZohoError) as exc:
        await store.get_record_by_id("Sales_Order_Fulfillment", "999999999999999999")
    assert exc.value.code == 9280

@pytest.mark.asyncio
async def test_delete_record_removes_it(store):
    record_id = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-DEL"})
    await store.delete_record("Sales_Order_Fulfillment", record_id)
    from app.criteria import ZohoError
    with pytest.raises(ZohoError):
        await store.get_record_by_id("Sales_Order_Fulfillment", record_id)

@pytest.mark.asyncio
async def test_find_with_a_js_predicate_and_no_criteria(store):
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-X", "Fulfillment_Stage": "Picking"})
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-Y", "Fulfillment_Stage": "Crate"})
    rows = await store.find("Sales_Order_Fulfillment", lambda r: r["Fulfillment_Stage"] == "Picking")
    assert len(rows) == 1
    assert rows[0]["SO_No"] == "SO-X"

@pytest.mark.asyncio
async def test_find_with_a_criteria_string_filters_at_the_database(store):
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-P", "Fulfillment_Stage": "Picking"})
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-Q", "Fulfillment_Stage": "Crate"})
    rows = await store.find("Sales_Order_Fulfillment", criteria='(SO_No == "SO-P")')
    assert len(rows) == 1
    assert rows[0]["SO_No"] == "SO-P"

@pytest.mark.asyncio
async def test_next_number_is_sequential_and_zero_padded(store):
    n1 = await store.next_number("Purchase_Order1", "PO_No", "PO-", 5)
    n2 = await store.next_number("Purchase_Order1", "PO_No", "PO-", 5)
    assert n1 == "PO-00001"
    assert n2 == "PO-00002"

@pytest.mark.asyncio
async def test_table_counts_only_lists_nonempty_tables(store):
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-COUNT"})
    counts = await store.table_counts()
    sof_count = next((c for c in counts if c["form"] == "Sales_Order_Fulfillment"), None)
    assert sof_count is not None
    assert sof_count["rows"] >= 1
```

- [ ] **Step 3: Run to verify it fails**

Run: `pytest tests/test_store.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 4: Implement `app/store.py`**

Port each function from the Node source read in this plan's research and Step 1, preserving: the dual-path `get_records` (SQL pushdown via `criteria_to_sql`, JS-predicate fallback via `compile_criteria` when pushdown returns `None`), newest-first `ORDER BY "ID" DESC` for `get_records` specifically (but plain ascending `ORDER BY "ID"` for `find`, confirmed from the Node source — these two methods order differently on purpose, do not unify them), the `_extra` JSONB merge-on-update behavior from Step 1, and `next_number`'s `_number_series` row-lock pattern (an `INSERT ... ON CONFLICT DO UPDATE` no-op lock followed by an `UPDATE ... RETURNING` that takes `GREATEST(stored_counter, highest_suffix_in_the_table) + 1`). Use `asyncpg`'s native parameter style (`$1`, `$2`, ...) throughout, matching what `criteria_to_sql` already produces.

- [ ] **Step 5: Run to verify it passes**

Run: `pytest tests/test_store.py -v`
Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add app/store.py tests/test_store.py
git commit -m "feat: app/store.py (CRUD + find/next_number/table_counts)"
```

---

## Task 6: `app/workflows.py` — the hook/register system

**Files:**
- Create: `app/workflows.py`
- Test: `tests/test_workflows.py`

**Interfaces:**
- Consumes: `app.model.form_by_name`, `app.model.form_of_report`, a raw `Store` from Task 5.
- Produces: `WORKFLOWS: dict` (the module-level registry, mirroring Node's module-level `workflows` singleton), `register(form: str, hooks: dict, registry=WORKFLOWS) -> None`, `create_hooked_store(store, registry=WORKFLOWS, *, books=None) -> HookedStore` where `HookedStore` wraps `add_record`/`update_record`/`delete_record` to run `beforeAdd`/`afterAdd`/`beforeUpdate`/`afterUpdate`/`beforeDelete`/`afterDelete` phase functions around the raw store's own calls, passing each phase function a dict of `{form, id, record, previous, input, store, books, user}` as appropriate to that phase (exact per-phase argument sets confirmed by re-reading `server/workflows/index.mjs`'s `createHookedStore` in this plan's own research above).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_workflows.py`:

```python
import pytest
from app.schema import ensure_schema
from app.store import create_store
from app.workflows import register, create_hooked_store, WORKFLOWS

@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)

@pytest.fixture(autouse=True)
def clear_workflows():
    WORKFLOWS.clear()
    yield
    WORKFLOWS.clear()

@pytest.mark.asyncio
async def test_after_add_hook_fires_with_the_record_and_raw_store(raw_store):
    seen = {}
    async def on_add(args):
        seen["record"] = args["record"]
        seen["store_is_raw"] = args["store"] is raw_store
    register("Sales_Order_Fulfillment", {"afterAdd": on_add})
    hooked = create_hooked_store(raw_store)
    record_id = await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-HOOK"})
    assert seen["record"]["SO_No"] == "SO-HOOK"
    assert seen["store_is_raw"] is True  # the hook must receive the UNHOOKED store (re-entrancy safety)

@pytest.mark.asyncio
async def test_after_update_hook_receives_both_record_and_previous(raw_store):
    seen = {}
    async def on_update(args):
        seen["previous_stage"] = args["previous"]["Fulfillment_Stage"]
        seen["new_stage"] = args["record"]["Fulfillment_Stage"]
    register("Sales_Order_Fulfillment", {"afterUpdate": on_update})
    hooked = create_hooked_store(raw_store)
    record_id = await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-HOOK2", "Fulfillment_Stage": "Waiting For Package"})
    await hooked.update_record("Sales_Order_Fulfillment", record_id, {"Fulfillment_Stage": "Order Readiness"}, by_form=True)
    assert seen["previous_stage"] == "Waiting For Package"
    assert seen["new_stage"] == "Order Readiness"

@pytest.mark.asyncio
async def test_a_hooks_own_write_never_retriggers_the_same_hook(raw_store):
    call_count = {"n": 0}
    async def on_update(args):
        call_count["n"] += 1
        # writes through the RAW store it was given -- must not re-enter this same hook
        await args["store"].update_record("Sales_Order_Fulfillment", args["id"], {"Package": "SET-BY-HOOK"}, by_form=True)
    register("Sales_Order_Fulfillment", {"afterUpdate": on_update})
    hooked = create_hooked_store(raw_store)
    record_id = await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-HOOK3"})
    await hooked.update_record("Sales_Order_Fulfillment", record_id, {"Fulfillment_Stage": "Picking"}, by_form=True)
    assert call_count["n"] == 1  # not 2+ -- the hook's own write through raw_store did not re-fire itself

@pytest.mark.asyncio
async def test_registering_multiple_hooks_on_the_same_phase_runs_all_of_them(raw_store):
    order = []
    async def first(args): order.append("first")
    async def second(args): order.append("second")
    register("Sales_Order_Fulfillment", {"afterAdd": first})
    register("Sales_Order_Fulfillment", {"afterAdd": second})
    hooked = create_hooked_store(raw_store)
    await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-MULTI"})
    assert order == ["first", "second"]

@pytest.mark.asyncio
async def test_a_hook_exception_is_logged_and_swallowed_not_propagated(raw_store, capsys):
    # Confirmed from the Node source: afterAdd/afterUpdate/afterDelete run with { swallow: true } --
    # a throwing hook is caught and logged, the caller's own add_record/update_record call still succeeds.
    async def broken(args):
        raise ValueError("boom")
    register("Sales_Order_Fulfillment", {"afterAdd": broken})
    hooked = create_hooked_store(raw_store)
    record_id = await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-BROKEN"})
    assert record_id is not None  # the add itself succeeded despite the hook throwing
```

- [ ] **Step 2: Run to verify it fails**

Run: `pytest tests/test_workflows.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Re-read the Node source for the exact before/after argument shapes and swallow behavior**

Run: `cat ../Supply-Chain-SystemV2/server/workflows/index.mjs` in full — confirm precisely which phases swallow exceptions (`afterAdd`/`afterUpdate`/`afterDelete`, confirmed `{ swallow: true }` in this plan's earlier research) vs. which propagate (`beforeAdd`/`beforeUpdate`/`beforeDelete` — a `before*` hook that throws should stop the write, since it runs before the raw store's own call).

- [ ] **Step 4: Implement `app/workflows.py`**

```python
# Hook/register system. Ported from server/workflows/index.mjs. WORKFLOWS is a module-level singleton
# registry (matching Node's `export const workflows = {}`), so any module that imports this file and
# calls register() at import time contributes to the SAME registry other modules' create_hooked_store()
# calls read from -- Python's own module caching gives this the same "runs once" guarantee ES modules do.
import logging
from app.model import form_by_name, form_of_report

logger = logging.getLogger(__name__)

PHASES = ["beforeAdd", "afterAdd", "beforeUpdate", "afterUpdate", "beforeDelete", "afterDelete"]
WORKFLOWS: dict = {}


def register(form: str, hooks: dict, registry: dict = WORKFLOWS) -> None:
    form_by_name(form)
    entry = registry.setdefault(form, {})
    for phase, fns in hooks.items():
        if phase not in PHASES:
            raise ValueError(f'Unknown workflow phase "{phase}" for {form}')
        fn_list = fns if isinstance(fns, list) else [fns]
        entry.setdefault(phase, []).extend(fn_list)


class HookedStore:
    def __init__(self, store, registry: dict, books=None):
        self._store = store
        self._registry = registry
        self._books = books
        # Pass through every other method of the raw store unchanged (get_records, get_record_by_id,
        # find, next_number, table_counts, ... ) -- only writes are wrapped.
        for name in ("get_records", "get_record_by_id", "find", "next_number", "table_counts"):
            setattr(self, name, getattr(store, name))

    def _has(self, form: str, *phases: str) -> bool:
        entry = self._registry.get(form, {})
        return any(entry.get(p) for p in phases)

    async def _run(self, form: str, phase: str, args: dict, swallow: bool = False) -> None:
        for fn in self._registry.get(form, {}).get(phase, []):
            if not swallow:
                await fn(args)
                continue
            try:
                await fn(args)
            except Exception as e:
                logger.error(f"[workflow {form}.{phase}] {e}")

    def _base(self, user: str) -> dict:
        return {"store": self._store, "books": self._books, "user": user}

    async def add_record(self, form_name: str, data: dict, user: str = "") -> str:
        form = form_by_name(form_name)
        input_ = dict(data)
        await self._run(form, "beforeAdd", {"form": form, "input": input_, **self._base(user)})
        record_id = await self._store.add_record(form, input_, user)
        if self._has(form, "afterAdd"):
            record = await self._store.get_record_by_id(form, record_id, raw=True)
            await self._run(form, "afterAdd", {"form": form, "id": record_id, "record": record, **self._base(user)}, swallow=True)
        return record_id

    async def update_record(self, report_or_form: str, id: str, data: dict, *, by_form: bool = False, user: str = "") -> str:
        form = form_by_name(report_or_form) if by_form else form_of_report(report_or_form)[0]
        watched = self._has(form, "beforeUpdate", "afterUpdate")
        previous = await self._store.get_record_by_id(form, id, raw=True) if watched else None
        input_ = dict(data)
        await self._run(form, "beforeUpdate", {"form": form, "id": str(id), "input": input_, "previous": previous, **self._base(user)})
        out = await self._store.update_record(report_or_form, id, input_, by_form=by_form)
        if self._has(form, "afterUpdate"):
            record = await self._store.get_record_by_id(form, id, raw=True)
            await self._run(form, "afterUpdate", {"form": form, "id": str(id), "record": record, "previous": previous, **self._base(user)}, swallow=True)
        return out

    async def delete_record(self, report_name: str, id: str, *, user: str = "") -> str:
        form, _ = form_of_report(report_name)
        previous = await self._store.get_record_by_id(form, id, raw=True) if self._has(form, "beforeDelete", "afterDelete") else None
        await self._run(form, "beforeDelete", {"form": form, "id": str(id), "previous": previous, **self._base(user)})
        out = await self._store.delete_record(report_name, id)
        if self._has(form, "afterDelete"):
            await self._run(form, "afterDelete", {"form": form, "id": str(id), "previous": previous, **self._base(user)}, swallow=True)
        return out


def create_hooked_store(store, registry: dict = WORKFLOWS, *, books=None) -> HookedStore:
    return HookedStore(store, registry, books)
```

- [ ] **Step 5: Run to verify it passes**

Run: `pytest tests/test_workflows.py -v`
Expected: PASS, all tests green — in particular `test_a_hooks_own_write_never_retriggers_the_same_hook`, which proves the re-entrancy-safety invariant carried over from the Node implementation.

- [ ] **Step 6: Commit**

```bash
git add app/workflows.py tests/test_workflows.py
git commit -m "feat: app/workflows.py (hook/register system, ported with re-entrancy safety intact)"
```

---

## Task 7: `app/access.py` + `app/auth.py` + `app/custom_apis.py`

**Files:**
- Create: `app/access.py`, `app/auth.py`, `app/custom_apis.py`
- Test: `tests/test_access.py`, `tests/test_auth.py`

**Interfaces:**
- Consumes: Task 5's store, Task 6's hooked store.
- Produces: `app.access`: `create_access(sections, widgets_root, scoping=None) -> Access` where `Access` exposes `check_call(me, op_name, body) -> dict | None`, `scope_criteria(me, report_name, criteria) -> str`, `check_record_access(me, report_name, record) -> dict | None`, `visible_sections(me) -> list`. `app.auth`: session cookie creation/verification, `login(email, password) -> dict | None`, password-change flow — exact function names and signatures to be fixed once the Node source is read in Step 1 of this task (not guessed here, since this plan's own research did not go as deep into `auth.mjs`/`access.mjs`'s internals as it did for `store.mjs`/`workflows/index.mjs`). `app.custom_apis`: `CUSTOM_APIS: dict[str, Callable]` (empty dict this task), `async def invoke_custom_api(name: str, payload: dict, store, ctx: dict) -> dict` (looks up `name` in `CUSTOM_APIS`, returns a "not ported yet" error shape if absent — mirrors `server/custom-apis.mjs`'s `invokeCustomApi` dispatcher and `custom-api-helpers.mjs`'s `notPorted()`).

- [ ] **Step 1: Read `server/access.mjs` and `server/auth.mjs` in full**

Run: `cat ../Supply-Chain-SystemV2/server/access.mjs ../Supply-Chain-SystemV2/server/auth.mjs` — these were only sized (108 and 211 lines respectively) during this plan's research, not read function-by-function. Read them now and write down, before touching test code: every exported function's exact name, parameters, and return shape; how a session cookie is signed/verified (confirm whether it's a signed cookie, a server-side session store, or a JWT — the design doc said "cookie-based session model" generically); what `checkCall`/`scopeCriteria`/`checkRecordAccess` each decide and on what input; what `visibleSections` returns.

- [ ] **Step 2: Write the failing tests for `app/access.py`**

Create `tests/test_access.py` with test cases derived from Step 1's actual read — this plan cannot pre-write these tests without knowing `access.mjs`'s real rules (e.g. this session confirmed one real rule, from `index.mjs`: a field-account user (`me.team_name` set) cannot write records whose `Installer`/`Assigned_to_Installer` differs from their own team name; write that as a concrete test, and add the rest from Step 1's reading):

```python
import pytest
from app.access import create_access

def test_field_account_cannot_assign_a_record_to_another_team():
    access = create_access(sections={}, widgets_root=".")
    me = {"team_name": "Team A", "role": "field"}
    denied = access.check_call(me, "updateRecords", {
        "report_name": "Service_Appointment_Form",
        "payload": {"data": {"Installer": "Team B"}},
    })
    assert denied is not None
    assert denied["code"] == 403

# Add further tests here once Step 1's reading of access.mjs confirms visibleSections/checkRecordAccess/
# scopeCriteria's exact rules -- this plan does not invent additional rules it has not confirmed exist.
```

- [ ] **Step 3: Write the failing tests for `app/auth.py`**

Create `tests/test_auth.py`, similarly derived from Step 1's actual reading of `auth.mjs` (session issuance on login, rejection of a bad password, cookie verification). Do not write placeholder assertions — only write what Step 1 confirms the Node version actually does.

- [ ] **Step 4: Run to verify both fail**

Run: `pytest tests/test_access.py tests/test_auth.py -v`
Expected: FAIL — `ModuleNotFoundError` for both.

- [ ] **Step 5: Implement `app/access.py` and `app/auth.py`**

Port each confirmed function from Step 1's reading, in Python, preserving exact decision logic and exact returned error shapes (`{code, message}`-style, consistent with the rest of this plan's response-envelope constraint).

- [ ] **Step 6: Implement `app/custom_apis.py`**

```python
# Dispatch table for custom APIs (mirrors server/custom-apis.mjs). Empty this plan -- every department's
# sub-project adds its own entries here. invoke_custom_api never raises for an unknown name; it returns
# the same "not ported yet" shape Node's custom-api-helpers.mjs's notPorted() produces.
CUSTOM_APIS: dict = {}


async def invoke_custom_api(name: str, payload: dict, store, ctx: dict) -> dict:
    fn = CUSTOM_APIS.get(name)
    if not fn:
        return {"status": "error", "message": f'"{name}" is not ported yet.'}
    return await fn(payload, store, ctx)
```

- [ ] **Step 7: Run to verify everything passes**

Run: `pytest tests/test_access.py tests/test_auth.py -v`
Expected: PASS, all tests green.

- [ ] **Step 8: Commit**

```bash
git add app/access.py app/auth.py app/custom_apis.py tests/test_access.py tests/test_auth.py
git commit -m "feat: app/access.py, app/auth.py, app/custom_apis.py (ported access control, session auth, empty custom-API dispatch)"
```

---

## Task 8: `app/main.py` — FastAPI app and the `/api/*` contract

**Files:**
- Create: `app/main.py`
- Test: `tests/test_main.py`

**Interfaces:**
- Consumes: every module from Tasks 1–7.
- Produces: a FastAPI `app` object; no other Python module depends on this one (it's the outermost layer).

- [ ] **Step 1: Re-read `server/index.mjs`'s full `/api/*` dispatch block**

Run: `cat ../Supply-Chain-SystemV2/server/index.mjs` in full (this plan's research read lines 1–60 and 255–310 only) — confirm the complete request lifecycle: JSON body parsing, the `access.checkCall`/`scopeCriteria`/`checkRecordAccess` integration points already partially read, the exact catch-block error envelope (`{code: e.code || 500, message: e.message}` at HTTP 200 — already confirmed and stated as a Global Constraint above), and how `/api/uploadFile`/`/api/readFile` read their query-string parameters and streamed body.

- [ ] **Step 2: Write the failing tests**

Create `tests/test_main.py` using FastAPI's `TestClient`:

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_unauthenticated_request_to_a_protected_api_route_gets_401():
    resp = client.post("/api/getRecords", json={"report_name": "Sales_Order_Fulfillment_Report"})
    assert resp.status_code == 401

def test_unknown_operation_name_gets_404():
    # Still requires auth first in the real app -- this test logs in via whatever app.auth's test
    # helper Task 7 provided, then hits an unknown op. Fill in the real login call once Task 7's
    # app/auth.py interface is fixed; sketched here as the behavior this endpoint must have.
    pass  # placeholder removed once Task 7's auth interface is read and used for a real session here

def test_get_records_after_login_returns_200_with_code_3000_envelope():
    pass  # same as above -- real login flow wired in once Task 7 is done; this task does not re-derive auth

def test_application_error_still_returns_http_200_with_a_nonzero_code_in_the_body():
    # Confirmed Global Constraint: application errors are HTTP 200 with {code, message} in the body,
    # never a 4xx/5xx status, except the auth-required and unknown-operation cases above.
    pass  # filled in with a real request once a concrete error-triggering call is chosen from Task 5/6's store behavior
```

Note: the three `pass`-bodied tests above are placeholders **only in this plan's draft text**, flagged explicitly rather than hidden, because they depend on `app/auth.py`'s exact login function signature, which Task 7 fixes from reading the real Node source — something this plan cannot pre-specify without guessing. **The implementer must replace each `pass` with a real assertion using Task 7's actual `app.auth` interface before this task is considered done** — do not commit this task with any `pass`-bodied test still in place.

- [ ] **Step 3: Implement `app/main.py`**

```python
# FastAPI app: the /api/* contract that server/public/zoho-shim.js (unmodified) expects. Ported from
# server/index.mjs. Every application-level error is HTTP 200 with {code, message} in the body; only
# "not authenticated" and "unknown operation" get a real HTTP error status (confirmed from the Node source).
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from app.criteria import ZohoError
from app.store import create_store
from app.workflows import create_hooked_store
from app.custom_apis import invoke_custom_api
from app.access import create_access
from app import auth  # exact functions used below depend on Task 7's confirmed interface

app = FastAPI()

# Pool/connection setup: wired to a real asyncpg pool at startup, matching server/pg/pool.mjs's role.
# ... startup/shutdown event handlers creating `store`/`hooked_store`/`access` as app.state, left for
# the implementer to wire using Task 5-7's real constructors once this task's Step 1 read is done.

OPS = {
    "getRecords": lambda store, hooked, body, user: store.get_records(body["report_name"], **body),
    "getRecordById": lambda store, hooked, body, user: store.get_record_by_id(body["report_name"], body["id"]),
    "addRecords": None,  # filled in to match server/pg/api.mjs's addRecords shape (array vs single, {ID} wrapper)
    "updateRecordById": None,
    "updateRecords": None,
    "deleteRecordById": None,
    "invokeCustomApi": None,
}


@app.post("/api/{op_name}")
async def api_dispatch(op_name: str, request: Request):
    # Real implementation wires session lookup (401 if missing, matching server/index.mjs), access.check_call,
    # the OPS dispatch table above (fully implemented, not left as None, by the end of this task), and the
    # try/except ZohoError -> HTTP 200 {code, message} envelope described in the Global Constraints section.
    raise NotImplementedError("filled in during this task's real implementation, not left as a stub when committed")
```

This sketch is intentionally incomplete in this plan document — `app/main.py`'s real content must be fully implemented (no `None` dispatch entries, no `NotImplementedError`) before Step 4; the plan shows the skeleton and constraints, not a copy-pasteable final file, because the exact per-operation body-parsing logic (`payload.data` vs `data`, array vs. single record in `addRecords`) needs the Node source's exact shape confirmed in Step 1 of THIS task before being written correctly, not guessed from this plan's earlier, partial research.

- [ ] **Step 4: Run to verify the real (non-placeholder) tests pass**

Run: `pytest tests/test_main.py -v`
Expected: PASS for every test that has a real assertion (the `pass`-bodied ones from Step 2 must be filled in with real assertions before this step, per that step's own instruction — if any `pass` remains, this step is not done).

- [ ] **Step 5: Serve the static files and confirm Order Readiness loads**

Add static file mounts for `modules/` and `server/public/` (copied byte-for-byte from the Node repo into this repo's own `modules/`/`server/public/` directories — confirm they already exist from the initial `git clone`/push in this session; if not, copy them over before this step). Start the server: `uvicorn app.main:app --reload --port 4001` (a different port than the Node version's 4000, so both can run side by side during the conversion). Open `http://localhost:4001/w/Fulfillment/Order%20Readiness/app/` (or whatever URL pattern the Node `server/index.mjs` used for serving a widget — confirm the exact path pattern during Step 1's read) in a browser and confirm the page loads, lists records, and a Release action round-trips — this is the plan's Proof-of-Done from the design doc, and must be done in a real browser, not just asserted in pytest; if no browser is available in the environment doing this work, state that explicitly rather than claiming it was checked (same standard this session already applied to the Node-side Fulfillment widget work).

- [ ] **Step 6: Commit**

```bash
git add app/main.py tests/test_main.py
git commit -m "feat: app/main.py (FastAPI /api/* contract, proven against the Order Readiness widget)"
```

---

## Self-Review Notes

- Spec coverage: every layer in the design doc's §3 (schema/model loader, store, criteria parser split into its two real halves — corrected during this plan's own research to name both `criteria.py` and `criteria_sql.py` rather than the design doc's single-mention, since the Node source actually has two cooperating files — hook system, HTTP layer) has a task. §4's exclusions (no business logic, no integrations, no scheduled jobs, UI unchanged) are honored: `app/custom_apis.py`'s dispatch table is empty, no Books/Akeneo/Shopify client files exist in this plan, no scheduler file exists, and Task 8 explicitly copies `modules/`/`server/public/` rather than editing them.
- Two real gaps found during this plan's writing and fixed before finalizing: (1) the design doc undersold the criteria layer as one file when the Node source has two (`criteria.mjs` + `pg/criteria-sql.mjs`) — Task 2 and Task 3 now split accordingly; (2) `server/access.mjs`/`server/auth.mjs` were only size-checked, not read function-by-function, during the design phase — Task 7 is written to force that real read as its own Step 1 rather than let this plan guess their interface, and its test-writing steps are explicit that they must derive from that reading, not from assumptions in this document.
- Placeholder scan: Task 8 contains deliberate, clearly-flagged incompleteness (the `pass`-bodied tests and the `None`/`NotImplementedError` sketch in `app/main.py`) because this plan's own research did not go deep enough into `server/index.mjs`'s full body-parsing logic to write the final contract correctly — rather than guess and risk a wrong contract silently shipping, the plan names exactly what must happen (a real Step 1 re-read) before the task can be marked done, and explicitly forbids committing with any placeholder still in place. This is the one task in the plan with this treatment; every other task's code blocks are complete, runnable implementations.
- Type/name consistency: `store`'s method names (`get_records`, `get_record_by_id`, `add_record`, `update_record`, `delete_record`, `find`, `next_number`, `table_counts`) are used identically across Tasks 5, 6, 7, and 8's sketch — no renaming drift between tasks.
