# Delivery Management Phase 2 (Scheduling core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Delivery Management's scheduling core — the team/day-finding engine, its workflow
hooks, earliest-slot lookups with soft holds, dispatcher-facing suggestions, the customer-facing
time window, a capacity warning, and appointment confirmation — from Node to Python, exactly
reproducing current behavior including every documented quirk.

**Architecture:** Seven new files under `app/delivery/` (`scheduling.py`, `scheduling_engine.py`,
`earliest_slot.py`, `suggest_schedule.py`, `time_window.py`, `delivery_scheduling_hooks.py`,
`confirmation.py`), following the exact conventions Phase 1 established (`register()` hooks via
`app.workflows`, `with_lock` via Phase 1's `app.delivery.locks`, `CUSTOM_APIS` self-registration).
Bundles three fixes found while re-reading the Node source: `settings_defs.py`'s `_clock` gets
replaced by the real, shared `clock()` this phase ports; `suggest_schedule.py` gets a tracked local
duplicate of Phase 3's `effectiveTarget`; `Service_Appointment_Form`'s spec-forms extension gains
the one field (`Time_Window`) this phase needs.

**Tech Stack:** Python 3.12+, FastAPI, asyncpg, pytest + pytest-asyncio, local Postgres for tests
(`TEST_DATABASE_URL`).

**Spec:** `docs/superpowers/specs/2026-11-20-delivery-scheduling-core-design.md`

## Global Constraints

- Reproduce `jv-update`'s (Node) current behavior exactly for parity — including every documented
  quirk in `scheduling.mjs`'s own header comment; this is a parity port, not a cleanup.
- No live credentials, no new external dependency.
- Commit after each task. Work directly on `main` in `Supply-Chain-SystemV2-Python` (no feature
  branch), per this port's established governing rule.
- Test with local Postgres via `TEST_DATABASE_URL` — never a Railway tunnel — per CLAUDE.md.
- **Run the full suite SOLO** (confirm no other `pytest` process is running first via `ps aux | grep
  pytest`) before every full-suite regression check in this plan. Two pytest instances racing
  against the same shared local schema corrupted `record_id_seq` during Phase 1 and produced ~230
  unrelated false-positive errors — confirmed root cause, not a code bug. Never run two full-suite
  passes concurrently.
- Every ported file gets real Python tests derived from reading Node's actual behavior, even though
  no Node test file exists for any of these 7 files.
- `Daily_Team_Availability`, `DMS_Exception_Queue`, `Delivery_Scheduling` forms already exist in
  `zoho-export/parsed/forms/` in this repo — confirmed via direct file check, no copying needed.

---

### Task 1: Add `Time_Window` to `Service_Appointment_Form`'s spec-forms extension

**Files:**
- Modify: `server/spec-forms/Service_Appointment_Form.json`

**Interfaces:**
- Produces: `app.model.COLUMNS["Service_Appointment_Form"]` includes a `Time_Window` text column
  after this task, consumed by Task 6 (`time_window.py`).

- [ ] **Step 1: Read Node's exact field entry**

```bash
grep -A1 -B1 '"name": "Time_Window"' "/c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2/server/spec-forms/Service_Appointment_Form.json"
```

Confirm the exact text before copying (do not trust any prior transcription). As read this
session, Node's entry is:
```json
    { "name": "Time_Window", "label": "Time Window", "type": "text", "helpText": "Delivery 03: the window the customer is told (Morning or Afternoon, from the workday times), instead of the exact Confirmed_Time_Slot. Computed by the server (time-window.mjs); a widget cannot write it." },
```

- [ ] **Step 2: Add only this one field to Python's copy**

Open `server/spec-forms/Service_Appointment_Form.json`, find the array of field objects, and insert
the `Time_Window` object (exact text from Step 1) at the same relative position Node has it. Do
**not** add `Books_Payment_Status` or `Books_Payment_Checked_At` — those belong to Phase 4.

- [ ] **Step 3: Verify the field loads**

```bash
cd /c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2-Python
python -c "
from app.model import COLUMNS
assert 'Time_Window' in COLUMNS['Service_Appointment_Form'], 'Time_Window not loaded'
print('ok')
"
```

Expected: prints `ok`.

- [ ] **Step 4: Run the full suite solo to confirm nothing broke**

```bash
ps aux | grep pytest | grep -v grep || echo "clear to proceed"
export TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test
pytest -q
```

Expected: PASS, same count as before this task (597).

- [ ] **Step 5: Commit**

```bash
git add server/spec-forms/Service_Appointment_Form.json
git commit -m "feat(delivery): add Time_Window field to Service_Appointment_Form spec-forms extension"
```

---

### Task 2: `app/delivery/scheduling.py`

The core engine. Ports `scheduling.mjs` in full: constants, pure helpers, `policy_reader`,
`schedule_slot` (the public, lock-wrapped entry point) and its real implementation.

**Files:**
- Create: `app/delivery/scheduling.py`
- Test: `tests/delivery/test_scheduling.py`

**Interfaces:**
- Consumes: `app.delivery.locks.with_lock(key: str, fn: Callable[[], Awaitable[T]]) -> T` (Phase 1);
  `app.criteria.zoho_now(d: datetime | None = None) -> str`; `app.deluge.{blank, truthy, to_num,
  parse_date, ymd, add_days, today_date, id_of}`.
- Produces: `SA = "Service_Appointment_Form"`; `BROKEN_FAILURE_CODES = {"damaged_in_transit",
  "refused"}`; `r6(x: float) -> float`; `hrs(x: float) -> str`; `null_text(v) -> str`; `day(v) ->
  str`; `customer_name(rec: dict) -> str`; `clock(text) -> dict | None` (`{"hour": int, "minute":
  int}`) — **the shared lenient parser Task 3 re-points `settings_defs.py` at**; `stored_clock(text)
  -> str`; `slot_text(start_text, used_hours: float) -> str`; `async def policy_reader(store,
  overrides: dict | None = None) -> Callable[[str], str | None]`; `to_long(v, fallback: int) ->
  int`; `workday_length(policy) -> int`; `default_duration(d_type: str) -> int`; `normalize_type(raw)
  -> str`; `async def raise_exception(store, rec: dict, *, stage: str, reason: str, severity: str,
  user: str = "") -> bool`; `schedule_slot(store, record_id, is_rerun: bool, options: dict | None =
  None)` (a coroutine via `with_lock`, same call shape as Node's `scheduleSlot`). Registers
  `CUSTOM_APIS["dms_reschedule"]`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/delivery/test_scheduling.py
import pytest


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


def test_clock_parses_lenient_hh_mm_am_pm():
    from app.delivery.scheduling import clock
    assert clock("8:00 AM") == {"hour": 8, "minute": 0}
    assert clock("12:00 AM") == {"hour": 0, "minute": 0}
    assert clock("12:00 PM") == {"hour": 12, "minute": 0}
    assert clock("08:00:00 AM") == {"hour": 8, "minute": 0}
    assert clock("5:30 pm") == {"hour": 17, "minute": 30}


def test_clock_is_lenient_not_strict_unlike_settings_defs_validation():
    from app.delivery.scheduling import clock
    # Node's real clock() has no format rejection -- it parses whatever integers are there.
    assert clock("8:0 AM") == {"hour": 8, "minute": 0}
    assert clock("25:99 AM") == {"hour": 25, "minute": 99}


def test_clock_returns_none_for_non_clock_text():
    from app.delivery.scheduling import clock
    assert clock("") is None
    assert clock(None) is None
    assert clock("not a time") is None
    assert clock("8:00") is None  # only one part, no AM/PM


def test_stored_clock_converts_to_zoho_storage_format():
    from app.delivery.scheduling import stored_clock
    assert stored_clock("8:00 AM") == "08:00:00 AM"
    assert stored_clock("12:30 pm") == "12:30:00 PM"
    assert stored_clock("not a time") == "not a time"


def test_slot_text_adds_used_hours_to_the_start_time():
    from app.delivery.scheduling import slot_text
    assert slot_text("8:00 AM", 2.5) == "10:30 AM"
    assert slot_text("", 0) == "8:00 AM"
    assert slot_text("11:00 AM", 2) == "1:00 PM"


def test_r6_rounds_away_binary_noise():
    from app.delivery.scheduling import r6
    assert r6(4 * 1.15 * 60) == 276


def test_hrs_formats_two_decimals():
    from app.delivery.scheduling import hrs
    assert hrs(2.3) == "2.30"


def test_null_text_blank_is_literal_null_string():
    from app.delivery.scheduling import null_text
    assert null_text(None) == "null"
    assert null_text("") == "null"
    assert null_text("Sam") == "Sam"


def test_customer_name_from_object_or_plain_string():
    from app.delivery.scheduling import customer_name
    assert customer_name({"Customer_Name": {"first_name": "Jo", "last_name": "Cruz"}}) == "Jo Cruz"
    assert customer_name({"Customer_Name": {"first_name": "Jo"}}) == "Jo"
    assert customer_name({"Customer_Name": "Plain Name"}) == "Plain Name"
    assert customer_name({"Customer_Name": None}) == ""


def test_default_duration_by_delivery_type():
    from app.delivery.scheduling import default_duration
    assert default_duration("With Installation") == 4
    assert default_duration("Full-Day Install") == 8
    assert default_duration("Site Visit") == 1
    assert default_duration("Pullout") == 2


def test_normalize_type_maps_the_two_spellings():
    from app.delivery.scheduling import normalize_type
    assert normalize_type("Delivery and Installation") == "With Installation"
    assert normalize_type("Pull Out") == "Pullout"
    assert normalize_type("Site Visit") == "Site Visit"
    assert normalize_type(None) == ""


async def test_policy_reader_reads_saved_value_or_none(raw):
    from app.delivery.scheduling import policy_reader
    await raw.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "20"})
    policy = await policy_reader(raw)
    assert policy("max_days_scheduling_window") == "20"
    assert policy("nonexistent_key") is None


async def test_policy_reader_overrides_win_for_preview(raw):
    from app.delivery.scheduling import policy_reader
    await raw.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "20"})
    policy = await policy_reader(raw, {"max_days_scheduling_window": "99"})
    assert policy("max_days_scheduling_window") == "99"


def test_to_long_truncates_and_falls_back():
    from app.delivery.scheduling import to_long
    assert to_long("14", 9) == 14
    assert to_long(None, 9) == 9
    assert to_long("abc", 9) == 9
    assert to_long("14.9", 9) == 14


async def test_workday_length_from_policy_or_default_9(raw):
    from app.delivery.scheduling import policy_reader, workday_length
    policy_default = await policy_reader(raw)
    assert workday_length(policy_default) == 9
    policy = await policy_reader(raw, {"workday_start_time": "8:00 AM", "workday_end_time": "5:00 PM"})
    assert workday_length(policy) == 9  # 17 - 8 = 9


async def test_raise_exception_adds_once_not_twice_for_same_open_reason(raw):
    from app.delivery.scheduling import raise_exception
    rec = {"ID": "1", "Customer_Name": "X"}
    first = await raise_exception(raw, rec, stage="Scheduling", reason="Calendar Full", severity="Medium")
    assert first is True
    second = await raise_exception(raw, rec, stage="Scheduling", reason="Calendar Full", severity="Medium")
    assert second is False
    rows = await raw.find("DMS_Exception_Queue")
    assert len(rows) == 1
    assert rows[0]["Status"] == "Open"


async def test_schedule_slot_record_not_found_is_error(raw):
    from app.delivery.scheduling import schedule_slot
    out = await schedule_slot(raw, "999999999", False)
    assert out["status"] == "error"
    assert out["message"] == "Record not found."


async def test_schedule_slot_blocked_when_completed_or_failed(raw):
    from app.delivery.scheduling import schedule_slot
    id_ = await raw.add_record("Service_Appointment_Form", {"Appointment_Status": "Completed"})
    out = await schedule_slot(raw, id_, False)
    assert out["status"] == "blocked"


async def test_schedule_slot_skipped_for_pick_up():
    pass  # filled in Step 1b below (needs raw/id_ fixture context)


async def test_schedule_slot_skipped_for_pick_up_real(raw):
    from app.delivery.scheduling import schedule_slot
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Pick Up"})
    out = await schedule_slot(raw, id_, False)
    assert out["status"] == "skipped"


async def test_schedule_slot_blocked_when_flagged_and_not_rerun(raw):
    from app.delivery.scheduling import schedule_slot
    id_ = await raw.add_record("Service_Appointment_Form", {"Exception_Status": "Flagged"})
    out = await schedule_slot(raw, id_, False)
    assert out["status"] == "blocked"


async def test_schedule_slot_resolves_flag_on_rerun_then_continues(raw):
    from app.delivery.scheduling import schedule_slot
    id_ = await raw.add_record("Service_Appointment_Form", {"Exception_Status": "Flagged", "Type_of_Delivery": "Pick Up"})
    out = await schedule_slot(raw, id_, True)
    # Pick Up is skipped regardless, but the flag resolution write still goes through via `finish`
    assert out["status"] == "skipped"


async def test_schedule_slot_flags_multi_day_install_as_manual(raw):
    from app.delivery.scheduling import schedule_slot
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Multi-Day Install"})
    out = await schedule_slot(raw, id_, False)
    assert out["status"] == "flagged"
    assert "Multi-Day Install" in out["message"]
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Exception_Status"] == "Flagged"
    assert row["Exception_Reason"] == "Requires Manual Planning"


async def test_schedule_slot_no_team_available_flags_calendar_full(raw):
    from app.delivery.scheduling import schedule_slot
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation"})
    out = await schedule_slot(raw, id_, False)
    assert out["status"] == "flagged"
    assert "Calendar Full" in out["message"]
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Exception_Reason"] == "Calendar Full"
    assert row["Suggested_Schedule_Date"] == ""


async def test_schedule_slot_finds_a_team_and_suggests(raw):
    from app.delivery.scheduling import schedule_slot
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Driver": "Sam", "Vehicle": "Van 1", "Max_Capacity_Hours": "9", "Start_Time1": "8:00 AM"})
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation", "Estimated_Duration": "2"})
    out = await schedule_slot(raw, id_, False)
    assert out["status"] == "success"
    assert out["installer"] == "Team A"
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Appointment_Status"] == "Queued"
    assert row["Installer"] == "Team A"
    assert row["Fleet_Assignment"] == "Van 1"
    assert row["Suggested_Time_Slot"] == "08:00:00 AM"  # 2hrs * 1.15 buffer = 2.3h, still starts at 8:00


async def test_schedule_slot_priority_auto_confirms_when_room(raw):
    from app.delivery.scheduling import schedule_slot
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Max_Capacity_Hours": "9", "Start_Time1": "8:00 AM"})
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation", "Estimated_Duration": "2", "Priority": True, "Sales_Order": "SO-1"})
    out = await schedule_slot(raw, id_, False)
    assert out["status"] == "success"
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Appointment_Status"] == "Scheduled"
    assert row["Calendar_Entry_Created"] is True
    assert row["Confirmed_Schedule_Date"] == tomorrow


async def test_dms_reschedule_custom_api_is_registered(raw):
    from app.custom_apis import invoke_custom_api
    import app.delivery.scheduling  # noqa: F401
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Pick Up"})
    out = await invoke_custom_api("dms_reschedule", {"recordId": id_}, raw, {"user": "dispatcher@x"})
    assert out["status"] == "skipped"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export TEST_DATABASE_URL=postgresql://postgres:LocalTest_pg2026@127.0.0.1:5432/supply_chain_test
pytest tests/delivery/test_scheduling.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.delivery.scheduling'`.

- [ ] **Step 3: Write `scheduling.py`**

```python
# app/delivery/scheduling.py
# The scheduling engine, ported from zoho-export/parsed/functions/dmsScheduleSlot.dg (521 lines of
# Deluge, via Node's server/modules/delivery-management/scheduling.mjs). It finds a team and a day
# for a Service Appointment, writes the suggestion, flags an exception when there is no room, and
# confirms a Priority order by itself. Callers: the custom API dms_reschedule (is_rerun=True), the
# SA_Scheduling_Engine workflow (scheduling_engine.py, is_rerun=False).
#
# Compared with Zoho Development: the script is ported as written, quirks included ("mirrors
# Zoho"), with ONE deliberate difference, the clock (3).
#  1. Hours already used by a team: a team is charged for its OWN jobs of the day that are
#     Confirmed or Suggested, not Failed, not this record.
#  2. The winner test is `fits && remaining > best || (remaining == best && fewer jobs)`: the tie
#     clause does not re-check the SO cap or that the job fits.
#  3. DELIBERATE DIFFERENCE, a Zoho bug: ctsTotalMin / 60 is a decimal division in Zoho, which can
#     produce an invalid time string and fail the whole script. Here it is whole minutes.
#  4. Hours are printed with two decimals ("2.30 hrs"), and a blank driver or fleet prints "null".
#  5. "today" is the server's date, so the server must run with TZ=Asia/Manila.
# Teams and records are looped in ID order, like Zoho. Times are stored as "08:00:00 AM" (what
# Zoho's time field keeps) while summary text keeps "8:00 AM".
import re

from app.criteria import zoho_now
from app.custom_apis import CUSTOM_APIS
from app.delivery.locks import with_lock
from app.deluge import add_days, blank, id_of, parse_date, to_num, today_date, truthy, ymd

SA = "Service_Appointment_Form"
_EXC = "DMS_Exception_Queue"

# Shared between failure-redelivery.py (Phase 5, raises the exception) and exception-queue.py
# (Phase 5, creates the redelivery on resolve): which failure reason codes categorise a redelivery
# as Broken for sorter.py's isBroken() (Phase 3).
BROKEN_FAILURE_CODES = {"damaged_in_transit", "refused"}


def r6(x: float) -> float:
    return round(x * 1e6) / 1e6


def hrs(x: float) -> str:
    return f"{x:.2f}"


def null_text(v) -> str:
    return "null" if blank(v) else str(v)


def day(v) -> str:
    return "" if v is None else str(v)[:10]


def customer_name(rec: dict) -> str:
    c = rec.get("Customer_Name")
    if not c or not isinstance(c, dict):
        return c.strip() if isinstance(c, str) else ""
    return f"{c.get('first_name') or ''} {c.get('last_name') or ''}".strip()


def clock(text) -> dict | None:
    parts = str(text if text is not None else "").strip().split(" ")
    if len(parts) != 2:
        return None
    hm = parts[0].split(":")
    if len(hm) < 2:
        return None
    try:
        hour = int(hm[0])
        minute = int(hm[1])
    except ValueError:
        return None
    ap = parts[1].upper()
    if ap == "PM" and hour != 12:
        hour += 12
    if ap == "AM" and hour == 12:
        hour = 0
    return {"hour": hour, "minute": minute}


_STORED_CLOCK_RE = re.compile(r"^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$", re.IGNORECASE)


def stored_clock(text) -> str:
    m = _STORED_CLOCK_RE.match(str(text if text is not None else "").strip())
    if not m:
        return text
    return f"{m.group(1).zfill(2)}:{m.group(2)}:00 {m.group(3).upper()}"


def slot_text(start_text, used_hours: float) -> str:
    base = "8:00 AM" if blank(start_text) else str(start_text)
    c = clock(base)
    if not c:
        return base
    total = c["hour"] * 60 + c["minute"] + int(r6(used_hours * 60))
    hr24 = total // 60
    minute = total - hr24 * 60
    shown = 12 if hr24 == 0 else (hr24 - 12 if hr24 > 12 else hr24)
    return f"{shown}:{str(minute).zfill(2)} {'PM' if hr24 >= 12 else 'AM'}"


async def policy_reader(store, overrides: dict | None = None):
    overrides = overrides or {}
    rows = await store.find("Policy_Settings")

    def read(key: str) -> str | None:
        if key in overrides:
            return None if blank(overrides[key]) else str(overrides[key])
        r = next((p for p in rows if p.get("Policy_Key") == key), None)
        return str(r["Value"]) if r and not blank(r.get("Value")) else None
    return read


def to_long(v, fallback: int) -> int:
    if blank(v):
        return fallback
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return fallback


def workday_length(policy) -> int:
    s = policy("workday_start_time")
    e = policy("workday_end_time")
    if s and e:
        a = clock(s)
        b = clock(e)
        if a and b and b["hour"] > a["hour"]:
            return b["hour"] - a["hour"]
    return 9


def default_duration(d_type: str) -> int:
    if d_type == "With Installation":
        return 4
    if d_type == "Full-Day Install":
        return 8
    if d_type == "Site Visit":
        return 1
    return 2


def normalize_type(raw) -> str:
    if raw == "Delivery and Installation":
        return "With Installation"
    if raw == "Pull Out":
        return "Pullout"
    return raw if raw is not None else ""


async def raise_exception(store, rec: dict, *, stage: str, reason: str, severity: str, user: str = "") -> bool:
    open_ = await store.find(_EXC, lambda r: id_of(r.get("Sales_Order_Reference")) == str(rec["ID"]) and r.get("Exception_Reason") == reason and r.get("Status") == "Open")
    if open_:
        return False
    await store.add_record(_EXC, {
        "Sales_Order_Reference": rec["ID"], "Customer_Name": customer_name(rec), "Exception_Stage": stage, "Exception_Reason": reason,
        "Severity": severity, "Raised_By": "System", "Date_Raised": zoho_now(), "Status": "Open",
    }, user)
    return True


def schedule_slot(store, record_id, is_rerun: bool, options: dict | None = None):
    return with_lock("scheduling", lambda: _schedule_slot_now(store, record_id, is_rerun, options))


async def _schedule_slot_now(store, record_id, is_rerun: bool, options: dict | None = None) -> dict:
    user = (options or {}).get("user", "")
    sa_id = str(record_id if record_id is not None else "").strip()
    everything = await store.find(SA) if sa_id.isdigit() else []
    rec = next((r for r in everything if str(r["ID"]) == sa_id), None)
    if not rec:
        return {"status": "error", "message": "Record not found."}

    changes: dict = {}

    def set_(k, v):
        rec[k] = v
        changes[k] = v

    async def finish(resp):
        if changes:
            await store.update_record(SA, sa_id, changes, by_form=True)
        return resp

    async def flag(reason, stage, severity):
        set_("Exception_Status", "Flagged")
        set_("Exception_Reason", reason)
        await raise_exception(store, rec, stage=stage, reason=reason, severity=severity, user=user)

    # GUARD 1: the job is finished. GUARD 2: Pick Up needs no team.
    if rec.get("Appointment_Status") in ("Completed", "Failed"):
        return {"status": "blocked", "message": "Hindi na maaaring i-schedule - tapos na ang delivery na ito."}
    if rec.get("Type_of_Delivery") == "Pick Up":
        return {"status": "skipped", "message": "Pick Up - i-set na lang diretso ang Confirmed Date at Time."}
    # GUARD 3: a Flagged exception stops the automatic run; a manual re-schedule resolves it on purpose.
    if rec.get("Exception_Status") == "Flagged":
        if is_rerun:
            set_("Exception_Status", "Resolved")
        else:
            return {"status": "blocked", "message": "Naka-Flagged pa ang Exception - i-resolve muna."}

    d_type_raw = rec.get("Type_of_Delivery") or ""
    d_type = normalize_type(d_type_raw)
    if d_type == "Multi-Day Install":
        await flag("Requires Manual Planning", "Scheduling", "Medium")
        return await finish({"status": "flagged", "message": "Multi-Day Install - kailangan ng manual planning."})

    is_full_day = d_type == "Full-Day Install"
    fleet_assignment = "Own Fleet"
    est_duration = to_num(rec.get("Estimated_Duration"))
    if est_duration == 0:
        est_duration = default_duration(d_type)
        set_("Estimated_Duration", est_duration)

    policy = await policy_reader(store)
    buffer_pct = to_long(policy("traffic_buffer_percent"), 15)
    factor = 1 + buffer_pct / 100
    buffered_duration = 8 if is_full_day else r6(est_duration * factor)
    max_window = to_long(policy("max_days_scheduling_window"), 14)
    workday_hours = workday_length(policy)

    search_start = today_date()
    requested = day(rec.get("Requested_Delivery_Date"))
    if requested != "" and requested >= ymd(search_start):
        search_start = parse_date(requested)
    availability = await store.find("Daily_Team_Availability")
    found = None
    n = 0
    while n < max_window and not found:
        candidate = ymd(add_days(search_start, n))
        teams = [t for t in availability if day(t.get("Availability_Date")) == candidate and t.get("Availability_Status") != "Not Available"]
        best = None
        best_remaining = -1
        best_so_count = 999999
        for t in teams:
            cap = to_num(t.get("Max_Capacity_Hours"))
            if cap <= 0:
                cap = workday_hours
            used_recs = [r for r in everything if r.get("Installer") == t.get("Installer")
                         and (day(r.get("Confirmed_Schedule_Date")) == candidate or day(r.get("Suggested_Schedule_Date")) == candidate)
                         and r.get("Appointment_Status") != "Failed" and str(r["ID"]) != sa_id]
            used = 0.0
            for u in used_recs:
                used = r6(used + (8 if u.get("Type_of_Delivery") == "Full-Day Install" else r6(to_num(u.get("Estimated_Duration")) * factor)))
            so_count_today = len(used_recs)
            remaining = r6(cap - used)
            max_so = to_num(t.get("Max_SO_Capacity"))
            so_cap_ok = not (max_so > 0 and so_count_today >= max_so)
            if (so_cap_ok and buffered_duration <= remaining and remaining > best_remaining) or (remaining == best_remaining and so_count_today < best_so_count):
                best = {"installer": t.get("Installer"), "driver": t.get("Driver"), "vehicle": t.get("Vehicle"), "start": t.get("Start_Time1"), "used": used, "cap": cap}
                best_remaining = remaining
                best_so_count = so_count_today
        if best:
            found = {**best, "date": candidate}
        n += 1

    fail_reason = ""
    if not found:
        fail_reason = "Calendar Full"
    elif r6(found["used"] + buffered_duration) > workday_hours and fleet_assignment == "Own Fleet":
        fail_reason = "Slot Pushed — Overtime Declined"
    if fail_reason:
        set_("Suggested_Schedule_Date", "")
        set_("Suggested_Time_Slot", "")
        set_("Installer", "")
        set_("Assigned_to_Driver", "")
        set_("Fleet_Assignment", "")
        await flag(fail_reason, "Scheduling", "Medium")
        return await finish({"status": "flagged", "message": f"{fail_reason} - walang available na team sa loob ng {max_window} araw."})

    time_slot = slot_text(found["start"], found["used"])
    fleet_display = fleet_assignment if blank(found["vehicle"]) else found["vehicle"]
    set_("Suggested_Schedule_Date", found["date"])
    set_("Suggested_Time_Slot", stored_clock(time_slot))
    set_("Fleet_Assignment", fleet_display)
    set_("Installation_Required", d_type in ("With Installation", "Full-Day Install"))
    set_("Calendar_Entry_Created", False)
    set_("Appointment_Status", "Queued")
    set_("Installer", found["installer"])
    set_("Assigned_to_Driver", found["driver"] or "")
    set_("Original_System_Suggestion", f"System suggested: {found['installer']} / {null_text(found['driver'])} on {found['date']} ({fleet_display})")

    resp = {"status": "success"}
    if truthy(rec.get("Priority")):
        others = [r for r in everything if r.get("Installer") == found["installer"] and day(r.get("Confirmed_Schedule_Date")) == found["date"] and truthy(r.get("Calendar_Entry_Created")) and str(r["ID"]) != sa_id]
        other_hours = 0.0
        for o in others:
            other_hours = r6(other_hours + (8 if o.get("Type_of_Delivery") == "Full-Day Install" else r6(to_num(o.get("Estimated_Duration")) * factor)))
        if r6(other_hours + buffered_duration) <= found["cap"]:
            where = f"{rec.get('Customer_Address') or ''}{'' if blank(rec.get('City')) else f', {rec.get(\"City\")}'}"
            set_("Confirmed_Schedule_Date", found["date"])
            set_("Confirmed_Time_Slot", stored_clock(time_slot))
            set_("Calendar_Event_Summary", f"Title: {rec.get('Sales_Order')} - {customer_name(rec)} | Date: {found['date']} | Time: {time_slot} ({buffered_duration if is_full_day else hrs(buffered_duration)} hrs) | Team: {found['installer']} / {null_text(found['driver'])} | Fleet: {fleet_display} | Type: {'-' if blank(d_type_raw) else d_type_raw} | Location: {where} | Notes: Auto-confirmed (Priority)")
            set_("Calendar_Entry_Created", True)
            set_("Appointment_Status", "Scheduled")
    return await finish({
        **resp,
        "message": f"Suggested: {found['installer']} / {null_text(found['driver'])} - {found['date']} {time_slot}",
        "date": found["date"], "time": time_slot, "installer": found["installer"],
    })


async def _dms_reschedule_api(payload: dict, store, ctx: dict) -> dict:
    return await schedule_slot(store, (payload or {}).get("recordId"), True, {"user": ctx.get("user", "")})


CUSTOM_APIS["dms_reschedule"] = _dms_reschedule_api
```

Remove the placeholder test `test_schedule_slot_skipped_for_pick_up` (the empty `pass` one) from
the test file written in Step 1 before running — it was a drafting artifact; the real assertion is
`test_schedule_slot_skipped_for_pick_up_real`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_scheduling.py -v
```

Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/scheduling.py tests/delivery/test_scheduling.py
git commit -m "feat(delivery): port scheduling.mjs (the engine, schedule_slot, dms_reschedule API)"
```

---

### Task 3: Re-point `settings_defs.py` at the shared `clock()`, delete `_clock`

**Files:**
- Modify: `app/delivery/settings_defs.py`
- Test: `tests/delivery/test_settings_defs.py` (append regression tests)

**Interfaces:**
- Consumes: `app.delivery.scheduling.clock(text) -> dict | None` (Task 2).
- Produces: `problem_with`/`workday_problem` behave identically to before this task for every
  input the existing Phase 1 tests already cover (strict regex unchanged); confirms the shared
  `clock()` is used for the actual parse step.

- [ ] **Step 1: Append the regression tests**

```python
# Append to tests/delivery/test_settings_defs.py

def test_problem_with_time_still_rejects_bad_format_after_repointing_at_shared_clock():
    # Regression for the Phase 2 fix: problem_with's OWN strict regex must still reject malformed
    # input even though the underlying parse now goes through scheduling.py's lenient clock().
    from app.delivery.settings_defs import problem_with
    assert problem_with("workday_start_time", "8:0 AM") is not None, "single-digit minute must still be rejected by the strict regex"
    assert problem_with("workday_start_time", "25:00 AM") is not None, "hour out of 1-12 range must still be rejected"
    assert problem_with("workday_start_time", "8:00") is not None, "missing AM/PM must still be rejected"


def test_settings_defs_clock_is_now_imported_from_scheduling_not_private():
    import app.delivery.settings_defs as sd
    assert not hasattr(sd, "_clock"), "_clock should be deleted after re-pointing at the shared clock()"
    from app.delivery.scheduling import clock
    assert sd.clock is clock, "settings_defs.py must use scheduling.py's clock(), not its own copy"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/delivery/test_settings_defs.py -v -k "repointing or still_rejects"
```

Expected: FAIL — `AttributeError: module 'app.delivery.settings_defs' has no attribute 'clock'`
(the second test) and the first test currently PASSES already (no regression yet to prove) — note
this in the task but proceed, since the real goal is the second test driving the refactor.

- [ ] **Step 3: Edit `settings_defs.py`**

Replace the import line and delete the private `_clock` function, keeping `problem_with` and
`workday_problem`'s own strict-regex checks exactly as they are, but calling the shared `clock()`.

```python
# Change the top of app/delivery/settings_defs.py from:
import re

SETTING_DEFS = [
```

```python
# to:
import re

from app.delivery.scheduling import clock

SETTING_DEFS = [
```

Delete this block entirely:
```python
_TIME_RE = re.compile(r"^(1[0-2]|0?[1-9]):([0-5]\d)\s(AM|PM)$", re.IGNORECASE)


def _clock(value) -> dict | None:
    m = _TIME_RE.match(str(value or "").strip())
    if not m:
        return None
    hour = int(m.group(1)) % 12 + (12 if m.group(3).upper() == "PM" else 0)
    return {"hour": hour, "minute": int(m.group(2))}
```

Re-add the strict regex (still needed by `problem_with`'s own validation — this does NOT move to
`scheduling.py`, it stays Delivery-settings-specific) just above `problem_with`:

```python
_TIME_RE = re.compile(r"^(1[0-2]|0?[1-9]):([0-5]\d)\s(AM|PM)$", re.IGNORECASE)
```

In `problem_with`, replace:
```python
    if d["type"] == "time":
        c = _clock(str(raw if raw is not None else "").strip())
        return None if c else f"{d['label']}: enter a time like 8:00 AM or 5:30 PM."
```
with:
```python
    if d["type"] == "time":
        raw_text = str(raw if raw is not None else "").strip()
        c = clock(raw_text) if _TIME_RE.match(raw_text) else None
        return None if c else f"{d['label']}: enter a time like 8:00 AM or 5:30 PM."
```

In `workday_problem`, replace both `_clock(...)` calls with `clock(...)` (no strict-regex gate
needed here — this function only ever receives values that already passed `problem_with`, or the
stored default, both already known-good clock strings; matches Node's own `workdayProblem`, which
calls `clock()` directly with no re-validation).

- [ ] **Step 4: Verify no circular import**

```bash
cd /c/Users/Admin/Desktop/JV/OTHERS/Supply-Chain-SystemV2-Python
python -c "import app.delivery.settings_defs; print('ok')"
python -c "import app.delivery.scheduling; print('ok')"
```

Expected: both print `ok`. (`scheduling.py`'s own imports, confirmed in Task 2, are `app.criteria`,
`app.custom_apis`, `app.delivery.locks`, `app.deluge` — none of which import `settings_defs.py`, so
this direction is safe.)

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/delivery/test_settings_defs.py -v
```

Expected: all passed (19 original + 3 new = 22).

- [ ] **Step 6: Commit**

```bash
git add app/delivery/settings_defs.py tests/delivery/test_settings_defs.py
git commit -m "fix(delivery): re-point settings_defs.py at scheduling.py's real clock(), delete _clock stand-in"
```

---

### Task 4: `app/delivery/scheduling_engine.py`

**Files:**
- Create: `app/delivery/scheduling_engine.py`
- Test: `tests/delivery/test_scheduling_engine.py`

**Interfaces:**
- Consumes: `app.delivery.scheduling.{SA, schedule_slot, customer_name, default_duration,
  normalize_type, policy_reader, raise_exception, to_long, r6, hrs, null_text, day}` (Task 2);
  `app.delivery.locks.with_lock`; `app.workflows.register`; `app.deluge.{blank, truthy, to_num,
  same_value}`; `app.criteria.zoho_now`.
- Produces: 4 hook functions registered on `SA` via `register(SA, {"afterAdd": actions,
  "afterUpdate": actions})` where `actions = [run_engine, confirm_calendar, tag_finished_status,
  convert_to_pick_up]`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/delivery/test_scheduling_engine.py
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
    import app.delivery.scheduling_engine  # noqa: F401
    return create_hooked_store(raw)


async def test_action1_runs_engine_when_site_confirmed_and_no_dates(raw, store):
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Max_Capacity_Hours": "9", "Start_Time1": "8:00 AM"})
    id_ = await store.add_record("Service_Appointment_Form", {"Site_Confirmation_Status": "Confirmed", "Type_of_Delivery": "With Installation", "Estimated_Duration": "2"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Appointment_Status"] == "Queued"
    assert row["Installer"] == "Team A"


async def test_action1_does_not_run_when_already_has_a_suggested_date(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Site_Confirmation_Status": "Confirmed", "Suggested_Schedule_Date": "2026-12-01"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Appointment_Status"] != "Queued"


async def test_action2_pick_up_confirms_at_once_no_team(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Pick Up", "Confirmed_Schedule_Date": "2026-12-01", "Confirmed_Time_Slot": "9:00:00 AM"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Fleet_Assignment"] == "Customer Pickup"
    assert row["Calendar_Entry_Created"] is True
    assert row["Appointment_Status"] == "Scheduled"


async def test_action2_third_party_confirms_at_once(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation", "Confirmed_Schedule_Date": "2026-12-01", "Fleet_Decision": "3rd Party"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Calendar_Entry_Created"] is True
    assert row["Appointment_Status"] == "Scheduled"
    assert "3rd Party" in row["Calendar_Event_Summary"] or "3rd-party" in row["Calendar_Event_Summary"]


async def test_action2_capacity_exceeded_without_override_is_blocked(raw, store):
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": "2026-12-01", "Installer": "Team A", "Max_Capacity_Hours": "2"})
    id_ = await store.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation", "Estimated_Duration": "3", "Confirmed_Schedule_Date": "2026-12-01", "Installer": "Team A", "Suggested_Schedule_Date": "2026-12-01"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Exception_Status"] == "Flagged"
    assert row["Exception_Reason"] == "Calendar Conflict"
    assert row.get("Calendar_Entry_Created") in (None, False, "false")


async def test_action2_override_bypasses_capacity_check(raw, store):
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": "2026-12-01", "Installer": "Team A", "Max_Capacity_Hours": "2"})
    id_ = await store.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation", "Estimated_Duration": "3", "Confirmed_Schedule_Date": "2026-12-01", "Confirmed_Time_Slot": "9:00:00 AM", "Installer": "Team A", "Override_Reason": "ASAP customer request"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Override_Applied"] is True
    assert row["Calendar_Entry_Created"] is True
    assert "ASAP" in row["Calendar_Event_Summary"] or "Exceeds Daily Capacity" in row["Calendar_Event_Summary"]


async def test_action3_tags_completed_once(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Calendar_Event_Summary": "Title: X"})
    await store.update_record("Service_Appointment_Form", id_, {"Appointment_Status": "Completed"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Calendar_Event_Summary"].count("[Completed]") == 1
    await store.update_record("Service_Appointment_Form", id_, {"Notes": "touch"})
    row2 = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row2["Calendar_Event_Summary"].count("[Completed]") == 1


async def test_action4_converts_to_pickup_releases_team(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation", "Installer": "Team A"})
    await store.update_record("Service_Appointment_Form", id_, {"Type_of_Delivery": "Pick Up"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Installer"] == ""
    assert row["Fleet_Assignment"] == "Customer Pickup"
    assert row["Appointment_Status"] == "Queued"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/delivery/test_scheduling_engine.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.delivery.scheduling_engine'`.

- [ ] **Step 3: Write `scheduling_engine.py`**

```python
# app/delivery/scheduling_engine.py
# SA_Scheduling_Engine, ported from zoho-export/parsed/workflows/form/Service_Appointment_Form/
# SA_Scheduling_Engine__1..4.dg (via Node's scheduling-engine.mjs). One Zoho workflow with four
# actions, all "on add or edit, on success". They run in order, and each one reads `input` as it
# was when the save finished (Action 2 does not see what Action 1 wrote in the same save), while
# the record it changes is read fresh from the database.
#   1. Site confirmed and no dates yet: run the scheduling engine (scheduling.py).
#   2. A confirmed date without a calendar entry: Pick Up and 3rd Party confirm at once;
#      otherwise flag an override, check the team's capacity for that day, write the calendar
#      summary and mark the appointment Scheduled.
#   3. Completed (or Failed with a calendar entry): tag the calendar summary once.
#   4. A Pick Up that still has an installer: release the team and confirm (or queue) the pickup.
# The four are four hooks, so an error in one is logged and does not skip the others.
#
# Quirks kept ("mirrors Zoho"): Action 3's `or` means Failed only counts when a calendar entry
# exists. Numbers in summaries print with two decimals, a blank team prints "null".
from app.criteria import zoho_now
from app.delivery.locks import with_lock
from app.delivery.scheduling import SA, customer_name, day, default_duration, hrs, normalize_type, null_text, policy_reader, r6, raise_exception, schedule_slot, to_long
from app.deluge import blank, same_value, to_num, truthy
from app.workflows import register


async def _fresh(store, id_):
    return await store.get_record_by_id(SA, id_, raw=True)


async def _save(store, id_, changes: dict):
    if changes:
        return await store.update_record(SA, id_, changes, by_form=True)
    return None


def _hours_text(n, full_day: bool) -> str:
    return str(n) if full_day else hrs(n)


# Action 1
async def run_engine(args: dict) -> None:
    record, store, user = args["record"], args["store"], args.get("user", "")
    if record.get("Site_Confirmation_Status") == "Confirmed" and blank(record.get("Suggested_Schedule_Date")) and blank(record.get("Confirmed_Schedule_Date")):
        await schedule_slot(store, args["id"], False, {"user": user})


# Action 2
def confirm_calendar(args: dict):
    return with_lock("scheduling", lambda: _confirm_calendar_now(args))


async def _confirm_calendar_now(args: dict) -> None:
    id_, input_, store, user = args["id"], args["record"], args["store"], args.get("user", "")
    if blank(input_.get("Confirmed_Schedule_Date")) or truthy(input_.get("Calendar_Entry_Created")):
        return
    rec = await _fresh(store, id_)
    type_raw = input_.get("Type_of_Delivery") or ""
    d_type = normalize_type(type_raw)
    time_slot = "" if blank(rec.get("Confirmed_Time_Slot")) else str(rec.get("Confirmed_Time_Slot"))
    changes: dict = {}
    head = f"Title: {null_text(rec.get('Sales_Order'))} - {customer_name(rec)} | Date: {day(rec.get('Confirmed_Schedule_Date'))} | Time: {time_slot}"

    if d_type == "Pick Up":
        changes["Fleet_Assignment"] = "Customer Pickup"
        changes["Calendar_Event_Summary"] = f"{head} | Type: Pick Up | Notes: Customer/dispatcher-scheduled pickup, no delivery team assigned"
        changes["Calendar_Entry_Created"] = True
        changes["Appointment_Status"] = "Scheduled"
        await _save(store, id_, changes)
        return
    if input_.get("Fleet_Decision") == "3rd Party":
        fleet = "3rd Party" if blank(rec.get("Fleet_Assignment")) else rec.get("Fleet_Assignment")
        changes["Calendar_Event_Summary"] = f"{head} | Fleet: {fleet} | Notes: 3rd-party courier, no internal team assigned"
        changes["Calendar_Entry_Created"] = True
        changes["Appointment_Status"] = "Scheduled"
        await _save(store, id_, changes)
        return

    is_override = blank(input_.get("Suggested_Schedule_Date")) or not same_value(input_.get("Confirmed_Schedule_Date"), input_.get("Suggested_Schedule_Date")) or not same_value(input_.get("Confirmed_Time_Slot"), input_.get("Suggested_Time_Slot"))
    if is_override:
        changes["Override_Applied"] = True
        changes["Override_Timestamp"] = zoho_now()

    team_cap = 8
    availability = await store.find("Daily_Team_Availability", lambda a: day(a.get("Availability_Date")) == day(input_.get("Confirmed_Schedule_Date")) and a.get("Installer") == input_.get("Installer"))
    for a in availability:
        if to_num(a.get("Max_Capacity_Hours")) > 0:
            team_cap = to_num(a.get("Max_Capacity_Hours"))
    policy = await policy_reader(store)
    factor = 1 + to_long(policy("traffic_buffer_percent"), 15) / 100
    my_duration = to_num(input_.get("Estimated_Duration"))
    if my_duration == 0:
        my_duration = default_duration(d_type)
    full_day = d_type == "Full-Day Install"
    my_buffered = 8 if full_day else r6(my_duration * factor)
    others = await store.find(SA, lambda r: r.get("Installer") == input_.get("Installer") and day(r.get("Confirmed_Schedule_Date")) == day(input_.get("Confirmed_Schedule_Date")) and truthy(r.get("Calendar_Entry_Created")) and str(r["ID"]) != str(id_))
    other_hours = 0.0
    for o in others:
        other_hours = r6(other_hours + (8 if o.get("Type_of_Delivery") == "Full-Day Install" else r6(to_num(o.get("Estimated_Duration")) * factor)))
    projected = r6(other_hours + my_buffered)
    capacity_exceeded = projected > team_cap

    if capacity_exceeded and not is_override:
        changes["Exception_Status"] = "Flagged"
        changes["Exception_Reason"] = "Calendar Conflict"
        await _save(store, id_, changes)
        await raise_exception(store, rec, stage="Calendar", reason="Calendar Conflict", severity="High", user=user)
        return

    where = f"{rec.get('Customer_Address') or ''}{'' if blank(rec.get('City')) else f', {rec.get(\"City\")}'}"
    notes = f"Override: {rec.get('Override_Reason') or ''}" if is_override else ""
    if capacity_exceeded:
        notes = f"{notes}{' | ' if notes != '' else ''}ASAP - Exceeds Daily Capacity ({hrs(projected)} / {team_cap} hrs)"
    changes["Calendar_Event_Summary"] = f"{head} ({_hours_text(my_buffered, full_day)} hrs) | Team: {null_text(rec.get('Installer'))} / {null_text(rec.get('Assigned_to_Driver'))} | Fleet: {null_text(rec.get('Fleet_Assignment'))} | Type: {'-' if blank(type_raw) else type_raw} | Location: {where} | Notes: {notes}"
    if (rec.get("Exception_Status") == "Flagged" and rec.get("Exception_Reason") == "Calendar Conflict") or rec.get("Exception_Reason") in ("Calendar Full", "Slot Pushed — Overtime Declined"):
        changes["Exception_Status"] = "Resolved"
    changes["Calendar_Entry_Created"] = True
    changes["Appointment_Status"] = "Scheduled"
    await _save(store, id_, changes)


# Action 3
async def tag_finished_status(args: dict) -> None:
    id_, input_, store = args["id"], args["record"], args["store"]
    status = input_.get("Appointment_Status")
    if not (status == "Completed" or (status == "Failed" and truthy(input_.get("Calendar_Entry_Created")))):
        return
    tag = f"[{status}]"
    if blank(input_.get("Calendar_Event_Summary")) or tag not in str(input_.get("Calendar_Event_Summary")):
        rec = await _fresh(store, id_)
        await _save(store, id_, {"Calendar_Event_Summary": f"{rec.get('Calendar_Event_Summary') or ''} {tag}"})


# Action 4
async def convert_to_pick_up(args: dict) -> None:
    id_, input_, store = args["id"], args["record"], args["store"]
    if input_.get("Type_of_Delivery") != "Pick Up" or blank(input_.get("Installer")):
        return
    rec = await _fresh(store, id_)
    changes = {"Installer": "", "Assigned_to_Driver": "", "Suggested_Schedule_Date": "", "Suggested_Time_Slot": "", "Fleet_Assignment": "Customer Pickup"}
    if not blank(input_.get("Confirmed_Schedule_Date")):
        time_slot = "" if blank(input_.get("Confirmed_Time_Slot")) else str(input_.get("Confirmed_Time_Slot"))
        changes["Calendar_Event_Summary"] = f"Title: {null_text(rec.get('Sales_Order'))} - {customer_name(rec)} | Date: {day(rec.get('Confirmed_Schedule_Date'))} | Time: {time_slot} | Type: Pick Up | Notes: Converted from delivery to Pick Up - original team released"
        changes["Calendar_Entry_Created"] = True
        changes["Appointment_Status"] = "Scheduled"
    else:
        changes["Calendar_Entry_Created"] = False
        changes["Appointment_Status"] = "Queued"
    await _save(store, id_, changes)


_actions = [run_engine, confirm_calendar, tag_finished_status, convert_to_pick_up]
register(SA, {"afterAdd": _actions, "afterUpdate": _actions})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_scheduling_engine.py -v
```

Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/scheduling_engine.py tests/delivery/test_scheduling_engine.py
git commit -m "feat(delivery): port scheduling-engine.mjs's 4 Service_Appointment_Form hooks"
```

---

### Task 5: `app/delivery/earliest_slot.py`

**Files:**
- Create: `app/delivery/earliest_slot.py`
- Test: `tests/delivery/test_earliest_slot.py`

**Interfaces:**
- Consumes: `app.delivery.scheduling.{SA, day, r6, policy_reader, to_long, normalize_type,
  default_duration, workday_length}` (Task 2); `app.criteria.zoho_now`; `app.deluge.{blank, to_num,
  truthy, parse_date, ymd, add_days, today_date}`.
- Produces: `async def find_earliest_slot(store, *, job_type=None, est_minutes=None,
  from_date=None, now=None) -> dict` (`{"found": bool, "date": str | None, "installer": str,
  "driver": str, "vehicle": str, "reason": str}`); `async def teams_with_room_on(store, date, *,
  job_type=None, est_minutes=None, now=None) -> list[dict]`; `async def quote_and_hold(store, *,
  job_type=None, est_minutes=None, from_date=None, quoted_by="", sr_no="") -> dict`; `async def
  release_hold(store, hold_id) -> None`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/delivery/test_earliest_slot.py
import pytest
from datetime import datetime


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def test_find_earliest_slot_no_team_scheduled_any_day_reports_not_found(raw):
    from app.delivery.earliest_slot import find_earliest_slot
    out = await find_earliest_slot(raw, job_type="With Installation")
    assert out["found"] is False
    assert "no team available" in out["reason"].lower()


async def test_find_earliest_slot_finds_a_team_with_room(raw):
    from app.delivery.earliest_slot import find_earliest_slot
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Driver": "Sam", "Vehicle": "Van 1", "Max_Capacity_Hours": "9"})
    out = await find_earliest_slot(raw, job_type="With Installation", est_minutes=120)
    assert out["found"] is True
    assert out["date"] == tomorrow
    assert out["installer"] == "Team A"
    assert "Earliest is" in out["reason"]


async def test_find_earliest_slot_skips_on_leave_teams(raw):
    from app.delivery.earliest_slot import find_earliest_slot
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Availability_Status": "Not Available"})
    day_after = ymd(add_days(today_date(), 2))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": day_after, "Installer": "Team B", "Max_Capacity_Hours": "9"})
    out = await find_earliest_slot(raw, job_type="With Installation", est_minutes=120)
    assert out["found"] is True
    assert out["date"] == day_after
    assert out["installer"] == "Team B"
    assert "on leave" in out["reason"]


async def test_find_earliest_slot_accounts_for_active_holds(raw):
    from app.delivery.earliest_slot import find_earliest_slot
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Max_Capacity_Hours": "3"})
    now = datetime.now()
    await raw.add_record("Schedule_Holds", {"Installer": "Team A", "Hold_Date": tomorrow, "Hours": "2", "Expires_At": "2099-01-01 12:00:00 PM", "Released": False})
    out = await find_earliest_slot(raw, job_type="With Installation", est_minutes=120, now=now)
    # 3h cap, 2h held, buffered ~2.3h needed -- no room on tomorrow, should push further
    assert out["found"] is False or out["date"] != tomorrow


async def test_teams_with_room_on_sorts_by_most_remaining_capacity(raw):
    from app.delivery.earliest_slot import teams_with_room_on
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": "2026-12-01", "Installer": "Team A", "Max_Capacity_Hours": "9"})
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": "2026-12-01", "Installer": "Team B", "Max_Capacity_Hours": "5"})
    out = await teams_with_room_on(raw, "2026-12-01", job_type="With Installation", est_minutes=60)
    assert [t["installer"] for t in out] == ["Team A", "Team B"]


async def test_quote_and_hold_creates_a_hold_with_expiry(raw):
    from app.delivery.earliest_slot import quote_and_hold
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Max_Capacity_Hours": "9"})
    out = await quote_and_hold(raw, job_type="With Installation", est_minutes=120, quoted_by="agent@x", sr_no="SR-1")
    assert out["found"] is True
    assert out["holdId"]
    rows = await raw.find("Schedule_Holds")
    assert len(rows) == 1
    assert rows[0]["Installer"] == "Team A"
    assert rows[0]["Service_Request_No"] == "SR-1"
    assert rows[0]["Released"] in (False, "false")


async def test_quote_and_hold_no_slot_returns_not_found_no_hold_created(raw):
    from app.delivery.earliest_slot import quote_and_hold
    out = await quote_and_hold(raw, job_type="With Installation")
    assert out["found"] is False
    assert len(await raw.find("Schedule_Holds")) == 0


async def test_release_hold_marks_released(raw):
    from app.delivery.earliest_slot import release_hold
    id_ = await raw.add_record("Schedule_Holds", {"Installer": "Team A", "Released": False})
    await release_hold(raw, id_)
    row = await raw.get_record_by_id("Schedule_Holds", id_, raw=True)
    assert row["Released"] is True


async def test_release_hold_blank_id_is_a_no_op(raw):
    from app.delivery.earliest_slot import release_hold
    await release_hold(raw, "")  # must not raise
    await release_hold(raw, None)  # must not raise
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/delivery/test_earliest_slot.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.delivery.earliest_slot'`.

- [ ] **Step 3: Write `earliest_slot.py`**

```python
# app/delivery/earliest_slot.py
# Earliest available date, with a reason, and a soft hold (spec v1.4, Delivery 01, "Earliest
# available date"). find_earliest_slot reuses the SAME capacity math scheduling.py's schedule_slot
# uses (team hours, the traffic buffer, the working day length) in a read-only, callable-before-
# an-SR-exists form, and adds two things schedule_slot does not do: a plain-words reason for the
# date it picked (or did not), and a short soft hold so two sales agents quoting at once cannot
# both walk away promising the same last slot. The real scheduling engine itself is not changed.
# Ported from server/modules/delivery-management/earliest-slot.mjs.
import re
from datetime import datetime

from app.criteria import zoho_now
from app.deluge import add_days, blank, parse_date, to_num, today_date, truthy, ymd
from app.delivery.scheduling import SA, day, default_duration, normalize_type, policy_reader, r6, to_long, workday_length

_HOLDS = "Schedule_Holds"
_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _dm(iso: str) -> str:
    d = datetime.strptime(iso, "%Y-%m-%d")
    return f"{d.day} {_MON[d.month - 1]}"


_PARSE_ZOHO_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?", re.IGNORECASE)


def _parse_zoho(v) -> datetime | None:
    """"2026-11-18 10:55:59 AM" -> datetime. Local to this file (Delivery has no shared one), like
    Node's own decisions-core.mjs parseZoho in Procurement -- kept separate on purpose."""
    m = _PARSE_ZOHO_RE.match(_text(v))
    if not m:
        return None
    h = 0 if m.group(4) is None else int(m.group(4))
    if m.group(7):
        h = (h % 12) + (12 if m.group(7).upper() == "PM" else 0)
    return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), h, int(m.group(5) or 0), int(m.group(6) or 0))


async def _active_hold_hours(store, now: datetime) -> dict:
    holds = await store.find(_HOLDS, lambda h: not truthy(h.get("Released")))
    by_key: dict = {}
    for h in holds:
        expires = _parse_zoho(h.get("Expires_At"))
        if expires and expires <= now:
            continue
        key = f"{_text(h.get('Installer'))}|{day(h.get('Hold_Date'))}"
        by_key[key] = by_key.get(key, 0) + to_num(h.get("Hours"))
    return by_key


async def find_earliest_slot(store, *, job_type=None, est_minutes=None, from_date=None, now=None) -> dict:
    now = now or datetime.now()
    d_type = normalize_type(job_type or "")
    is_full_day = d_type == "Full-Day Install"
    policy = await policy_reader(store)
    buffer_pct = to_long(policy("traffic_buffer_percent"), 15)
    factor = 1 + buffer_pct / 100
    est_hours = (float(est_minutes) / 60) if est_minutes is not None else default_duration(d_type)
    buffered_duration = 8 if is_full_day else r6(est_hours * factor)
    max_window = to_long(policy("max_days_scheduling_window"), 14)
    workday_hours = workday_length(policy)

    search_start = parse_date(from_date) if from_date else today_date()
    if search_start < today_date():
        search_start = today_date()

    availability = await store.find("Daily_Team_Availability")
    everything = await store.find(SA)
    held_hours = await _active_hold_hours(store, now)

    trail = []
    for n in range(max_window):
        candidate = ymd(add_days(search_start, n))
        teams_today = [t for t in availability if day(t.get("Availability_Date")) == candidate]
        if not teams_today:
            trail.append(f"{_dm(candidate)} no team scheduled")
            continue
        on_leave = [t.get("Installer") for t in teams_today if t.get("Availability_Status") == "Not Available"]
        active = [t for t in teams_today if t.get("Availability_Status") != "Not Available"]
        if not active:
            trail.append(f"{_dm(candidate)} {', '.join(on_leave)} on leave")
            continue

        best = None
        best_remaining = -1
        full_count = 0
        for t in active:
            cap = to_num(t.get("Max_Capacity_Hours")) or workday_hours
            used_recs = [r for r in everything if r.get("Installer") == t.get("Installer")
                         and (day(r.get("Confirmed_Schedule_Date")) == candidate or day(r.get("Suggested_Schedule_Date")) == candidate) and r.get("Appointment_Status") != "Failed"]
            used = 0.0
            for u in used_recs:
                used = r6(used + (8 if u.get("Type_of_Delivery") == "Full-Day Install" else r6(to_num(u.get("Estimated_Duration")) * factor)))
            used = r6(used + held_hours.get(f"{t.get('Installer')}|{candidate}", 0))
            remaining = r6(cap - used)
            fits = buffered_duration <= remaining and r6(used + buffered_duration) <= workday_hours
            if fits:
                if remaining > best_remaining:
                    best = {**t, "used": used, "cap": cap}
                    best_remaining = remaining
            else:
                full_count += 1
        if best:
            reason = f"Earliest is {_dm(candidate)}: {', '.join(trail)}." if trail else f"Earliest is {_dm(candidate)}."
            return {"found": True, "date": candidate, "installer": best.get("Installer"), "driver": best.get("Driver"), "vehicle": best.get("Vehicle"), "reason": reason}
        leave_note = f", {', '.join(on_leave)} on leave" if on_leave else ""
        trail.append(f"{_dm(candidate)} full ({full_count} of {len(active)} jobs){leave_note}")
    return {"found": False, "date": None, "reason": f"No team available within {max_window} days: {'; '.join(trail)}."}


async def teams_with_room_on(store, date: str, *, job_type=None, est_minutes=None, now=None) -> list[dict]:
    now = now or datetime.now()
    d_type = normalize_type(job_type or "")
    is_full_day = d_type == "Full-Day Install"
    policy = await policy_reader(store)
    buffer_pct = to_long(policy("traffic_buffer_percent"), 15)
    factor = 1 + buffer_pct / 100
    est_hours = (float(est_minutes) / 60) if est_minutes is not None else default_duration(d_type)
    buffered_duration = 8 if is_full_day else r6(est_hours * factor)
    workday_hours = workday_length(policy)

    teams_today = await store.find("Daily_Team_Availability", lambda t: day(t.get("Availability_Date")) == date)
    everything = await store.find(SA)
    held_hours = await _active_hold_hours(store, now)
    active = [t for t in teams_today if t.get("Availability_Status") != "Not Available"]
    fitting = []
    for t in active:
        cap = to_num(t.get("Max_Capacity_Hours")) or workday_hours
        used_recs = [r for r in everything if r.get("Installer") == t.get("Installer")
                     and (day(r.get("Confirmed_Schedule_Date")) == date or day(r.get("Suggested_Schedule_Date")) == date) and r.get("Appointment_Status") != "Failed"]
        used = 0.0
        for u in used_recs:
            used = r6(used + (8 if u.get("Type_of_Delivery") == "Full-Day Install" else r6(to_num(u.get("Estimated_Duration")) * factor)))
        used = r6(used + held_hours.get(f"{t.get('Installer')}|{date}", 0))
        remaining = r6(cap - used)
        if buffered_duration <= remaining and r6(used + buffered_duration) <= workday_hours:
            fitting.append({"installer": t.get("Installer"), "driver": t.get("Driver"), "vehicle": t.get("Vehicle"), "remaining": remaining})
    return sorted(fitting, key=lambda f: -f["remaining"])


async def quote_and_hold(store, *, job_type=None, est_minutes=None, from_date=None, quoted_by="", sr_no="") -> dict:
    policy = await policy_reader(store)
    hold_minutes = to_long(policy("soft_hold_minutes"), 20)
    now = datetime.now()
    result = await find_earliest_slot(store, job_type=job_type, est_minutes=est_minutes, from_date=from_date, now=now)
    if not result["found"]:
        return result
    d_type = normalize_type(job_type or "")
    est_hours = (float(est_minutes) / 60) if est_minutes is not None else default_duration(d_type)
    buffer_pct = to_long(policy("traffic_buffer_percent"), 15)
    hours = 8 if d_type == "Full-Day Install" else r6(est_hours * (1 + buffer_pct / 100))
    from datetime import timedelta
    hold_id = await store.add_record(_HOLDS, {
        "Installer": result["installer"], "Hold_Date": result["date"], "Hours": hours,
        "Expires_At": zoho_now(now + timedelta(minutes=hold_minutes)), "Quoted_By": quoted_by, "Service_Request_No": sr_no, "Released": False,
    })
    return {**result, "holdId": str(hold_id), "holdMinutes": hold_minutes}


async def release_hold(store, hold_id) -> None:
    if blank(hold_id):
        return
    await store.update_record(_HOLDS, hold_id, {"Released": True}, by_form=True)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_earliest_slot.py -v
```

Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/earliest_slot.py tests/delivery/test_earliest_slot.py
git commit -m "feat(delivery): port earliest-slot.mjs (find_earliest_slot, teams_with_room_on, holds)"
```

---

### Task 6: `app/delivery/suggest_schedule.py`

**Files:**
- Create: `app/delivery/suggest_schedule.py`
- Test: `tests/delivery/test_suggest_schedule.py`

**Interfaces:**
- Consumes: `app.delivery.earliest_slot.{find_earliest_slot, teams_with_room_on}` (Task 5);
  `app.delivery.scheduling.{SA, day, policy_reader, to_long}` (Task 2); `app.criteria.zoho_now`;
  `app.deluge.{blank, to_num, parse_date, ymd, add_days, today_date}`.
- Produces: `async def suggest_schedule(store, sa_id, *, now=None, from_date=None) -> dict`. Also a
  private `_effective_target(sa, policy)` — a tracked duplicate of Phase 3's `sorter.py`'s
  `effective_target`, to be re-pointed once that phase ships.

- [ ] **Step 1: Write the failing tests**

```python
# tests/delivery/test_suggest_schedule.py
import pytest


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def test_pick_up_needs_no_team(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Pick Up"})
    out = await suggest_schedule(raw, id_)
    assert out["status"] == "no_team_needed"


async def test_not_found_record(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    out = await suggest_schedule(raw, "999999999")
    assert out["status"] == "not_found"


async def test_suggests_earliest_team_when_room(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Max_Capacity_Hours": "9"})
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Drop Off", "Estimated_Duration": "2"})
    out = await suggest_schedule(raw, id_)
    assert out["status"] == "suggested"
    assert out["installer"] == "Team A"
    assert out["date"] == tomorrow


async def test_dropoff_past_target_suggests_third_party(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    from app.deluge import ymd, add_days, today_date
    far = ymd(add_days(today_date(), 10))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": far, "Installer": "Team A", "Max_Capacity_Hours": "9"})
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Drop Off", "Estimated_Duration": "2", "Requested_Delivery_Date": ymd(add_days(today_date(), 2))})
    out = await suggest_schedule(raw, id_)
    assert out["status"] == "third_party_suggested"
    assert out["approvalId"]
    rows = await raw.find("Approval_Queue")
    assert len(rows) == 1
    assert rows[0]["Kind"] == "third_party_booking"


async def test_dropoff_third_party_approval_deduped_on_second_call(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    from app.deluge import ymd, add_days, today_date
    far = ymd(add_days(today_date(), 10))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": far, "Installer": "Team A", "Max_Capacity_Hours": "9"})
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Drop Off", "Estimated_Duration": "2", "Requested_Delivery_Date": ymd(add_days(today_date(), 2))})
    first = await suggest_schedule(raw, id_)
    second = await suggest_schedule(raw, id_)
    assert second["approvalId"] == first["approvalId"]
    assert len(await raw.find("Approval_Queue")) == 1


async def test_installation_with_no_slot_escalates(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation", "Estimated_Duration": "2"})
    out = await suggest_schedule(raw, id_)
    assert out["status"] == "escalated"
    assert out["approvalId"]
    rows = await raw.find("Approval_Queue")
    assert rows[0]["Kind"] == "schedule_shortfall"


async def test_dropoff_with_no_slot_is_no_slot_not_escalated(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Drop Off", "Estimated_Duration": "2"})
    out = await suggest_schedule(raw, id_)
    assert out["status"] == "no_slot"
    assert len(await raw.find("Approval_Queue")) == 0


async def test_prefers_team_already_going_to_same_city(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Max_Capacity_Hours": "9"})
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team B", "Max_Capacity_Hours": "9"})
    await raw.add_record("Service_Appointment_Form", {"Installer": "Team B", "Confirmed_Schedule_Date": tomorrow, "City": "Quezon City", "Appointment_Status": "Scheduled"})
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Drop Off", "Estimated_Duration": "1", "City": "Quezon City"})
    out = await suggest_schedule(raw, id_)
    assert out["status"] == "suggested"
    assert out["installer"] == "Team B"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/delivery/test_suggest_schedule.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.delivery.suggest_schedule'`.

- [ ] **Step 3: Write `suggest_schedule.py`**

```python
# app/delivery/suggest_schedule.py
# Suggesting a schedule (spec v1.4, Delivery 02 §3): for a ranked job -- drop-off or installation,
# find the earliest slot, a city tie-break among every team with room that day, "Book third party"
# for a drop-off whose own-team slot is too late, and a supervisor approval item when an
# installation cannot meet its target any other way.
#
# This sits ALONGSIDE the existing scheduling engine (scheduling_engine.py / scheduling.py), not
# instead of it: that engine still writes the Suggested_Schedule_Date a dispatcher approves today,
# and nothing here changes it. This is the new, read-mostly "what should the dispatcher see" layer
# the spec asks for -- it only writes when it prepares an Approval_Queue item.
# Ported from server/modules/delivery-management/suggest-schedule.mjs.
from datetime import datetime, timedelta

from app.criteria import zoho_now
from app.deluge import add_days, blank, parse_date, to_num, today_date, ymd
from app.delivery.earliest_slot import find_earliest_slot, teams_with_room_on
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


async def _prepare_approval(store, *, kind: str, sa: dict, summary: str, options: list, payload: dict):
    existing = await store.find(_AQ, lambda i: i.get("Kind") == kind and _text(i.get("Record_Id")) == str(sa["ID"]) and i.get("Status") == "pending")
    if existing:
        return existing[0]["ID"]
    policy = await policy_reader(store)
    sla_hours = to_long(policy("approval_sla_hours"), 24)
    import json
    return await store.add_record(_AQ, {
        "Kind": kind, "Record_Type": "service_appointment", "Record_Id": str(sa["ID"]), "Record_No": _text(sa.get("Sales_Order")),
        "Summary": summary, "Options": json.dumps(options), "Payload": json.dumps(payload),
        "Prepared_By_Type": "system", "Status": "pending", "Due_At": zoho_now(datetime.now() + timedelta(hours=sla_hours)),
    })


async def _pick_team_for_city(store, date: str, city, candidates: list) -> str | None:
    if not candidates:
        return None
    if blank(city) or len(candidates) == 1:
        return candidates[0]["installer"]
    that_day = await store.find(SA, lambda r: (day(r.get("Confirmed_Schedule_Date")) == date or day(r.get("Suggested_Schedule_Date")) == date) and r.get("Appointment_Status") != "Failed")
    same_city = next((c for c in candidates if any(r.get("Installer") == c["installer"] and not blank(r.get("City")) and str(r.get("City")).strip().lower() == str(city).strip().lower() for r in that_day)), None)
    return (same_city or candidates[0])["installer"]


async def suggest_schedule(store, sa_id, *, now=None, from_date=None) -> dict:
    now = now or datetime.now()
    sa = await store.get_record_by_id(SA, sa_id, raw=True)
    if not sa:
        return {"status": "not_found"}
    d_type = sa.get("Type_of_Delivery") or ""
    if d_type == "Pick Up":
        return {"status": "no_team_needed", "reason": "Pick Up has no team to schedule."}
    is_install = d_type in _INSTALL_TYPES
    policy = await policy_reader(store)
    est_minutes = to_num(sa.get("Estimated_Duration")) * 60 if to_num(sa.get("Estimated_Duration")) else None

    slot = await find_earliest_slot(store, job_type=d_type, est_minutes=est_minutes, from_date=from_date, now=now)
    if not slot["found"]:
        if not is_install:
            return {"status": "no_slot", "reason": slot["reason"]}
        id_ = await _prepare_approval(store, kind="schedule_shortfall", sa=sa,
                                       summary=f"{_text(sa.get('Sales_Order'))}: no team-day found within the scheduling window for an installation.",
                                       options=["Add a team-day (overtime, extra installer)", "Tell the customer (proposed new date)"],
                                       payload={"reason": slot["reason"]})
        return {"status": "escalated", "approvalId": str(id_), "reason": slot["reason"]}

    candidates = await teams_with_room_on(store, slot["date"], job_type=d_type, est_minutes=est_minutes, now=now)
    installer = await _pick_team_for_city(store, slot["date"], sa.get("City"), candidates if candidates else [{"installer": slot["installer"]}])
    chosen = next((c for c in candidates if c["installer"] == installer), {"driver": slot.get("driver"), "vehicle": slot.get("vehicle")})

    if not is_install:
        max_wait_days = to_long(policy("dropoff_max_wait_days"), 2)
        target = parse_date(_effective_target(sa, policy))
        slot_date = parse_date(slot["date"])
        past_target = target is not None and slot_date > target
        past_max_wait = slot_date > add_days(today_date(), max_wait_days)
        if past_target or past_max_wait:
            target_text = f" (target {ymd(target)})" if target else ""
            id_ = await _prepare_approval(store, kind="third_party_booking", sa=sa,
                                           summary=f"{_text(sa.get('Sales_Order'))}: own-team slot is {slot['date']}{target_text} — book a third party instead?",
                                           options=["Book third party", f"Keep own team on {slot['date']}"],
                                           payload={"ownTeamDate": slot["date"], "installer": installer, "target": _effective_target(sa, policy) or ""})
            return {"status": "third_party_suggested", "approvalId": str(id_), "date": slot["date"], "installer": installer, "reason": slot["reason"]}

    return {"status": "suggested", "date": slot["date"], "installer": installer, "driver": chosen.get("driver"), "vehicle": chosen.get("vehicle"), "reason": slot["reason"]}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_suggest_schedule.py -v
```

Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/suggest_schedule.py tests/delivery/test_suggest_schedule.py
git commit -m "feat(delivery): port suggest-schedule.mjs (city tie-break, third-party/escalation approvals)"
```

---

### Task 7: `app/delivery/time_window.py`

**Files:**
- Create: `app/delivery/time_window.py`
- Test: `tests/delivery/test_time_window.py`

**Interfaces:**
- Consumes: `app.delivery.scheduling.{SA, clock, policy_reader}` (Task 2); `app.workflows.register`;
  `app.deluge.blank`.
- Produces: `def window_for(slot, start="8:00 AM", end="5:00 PM") -> str`; hooks on `SA` stripping a
  widget-supplied `Time_Window` and stamping the computed one after save.

- [ ] **Step 1: Write the failing tests**

```python
# tests/delivery/test_time_window.py
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
    import app.delivery.time_window  # noqa: F401
    return create_hooked_store(raw)


def test_window_for_morning_before_noon():
    from app.delivery.time_window import window_for
    assert window_for("8:00 AM") == "Morning (8:00 AM–12:00 NN)"
    assert window_for("11:59 AM") == "Morning (8:00 AM–12:00 NN)"


def test_window_for_afternoon_from_noon():
    from app.delivery.time_window import window_for
    assert window_for("12:00 PM") == "Afternoon (12:00 NN–5:00 PM)"
    assert window_for("3:30 PM") == "Afternoon (12:00 NN–5:00 PM)"


def test_window_for_custom_workday_times():
    from app.delivery.time_window import window_for
    assert window_for("9:00 AM", "9:00 AM", "6:00 PM") == "Morning (9:00 AM–12:00 NN)"


def test_window_for_blank_or_unparseable_slot_is_empty():
    from app.delivery.time_window import window_for
    assert window_for("") == ""
    assert window_for(None) == ""
    assert window_for("not a time") == ""


async def test_widget_cannot_write_time_window_directly(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Time_Window": "Hacked"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Time_Window"] != "Hacked"


async def test_time_window_stamped_from_confirmed_time_slot(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Confirmed_Time_Slot": "9:00:00 AM"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Time_Window"] == "Morning (8:00 AM–12:00 NN)"


async def test_time_window_only_rewritten_when_it_actually_changes(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Confirmed_Time_Slot": "9:00:00 AM"})
    await store.update_record("Service_Appointment_Form", id_, {"Notes": "touch"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Time_Window"] == "Morning (8:00 AM–12:00 NN)"
    await store.update_record("Service_Appointment_Form", id_, {"Confirmed_Time_Slot": "2:00:00 PM"})
    row2 = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row2["Time_Window"] == "Afternoon (12:00 NN–5:00 PM)"


async def test_time_window_uses_policy_workday_times_when_set(raw, store):
    await raw.add_record("Policy_Settings", {"Policy_Key": "workday_start_time", "Value": "7:00 AM"})
    id_ = await store.add_record("Service_Appointment_Form", {"Confirmed_Time_Slot": "7:30:00 AM"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert "7:00 AM" in row["Time_Window"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/delivery/test_time_window.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.delivery.time_window'`.

- [ ] **Step 3: Write `time_window.py`**

```python
# app/delivery/time_window.py
# Time window, not exact time (spec v1.4, Delivery 03 "Time window (hindi exact time)"): the
# customer is promised a window, never the minute. The scheduling engine still books an exact
# start (Confirmed_Time_Slot) because that is what the team-day capacity math needs; this adds a
# computed, server-only Time_Window next to it, which the widgets show instead of the exact time.
#
# The window is a half day, cut at 12:00 NN: "Morning (<workday start>-12:00 NN)" for a slot that
# starts before noon, "Afternoon (12:00 NN-<workday end>)" from noon on.
# Ported from server/modules/delivery-management/time-window.mjs.
from app.deluge import blank
from app.delivery.scheduling import SA, clock, policy_reader
from app.workflows import register

_NOON = 12 * 60


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _pretty(v) -> str:
    c = clock(_text(v))
    if not c:
        return _text(v)
    h = c["hour"] % 12 or 12
    return f"{h}:{str(c['minute']).zfill(2)} {'PM' if c['hour'] >= 12 else 'AM'}"


def window_for(slot, start="8:00 AM", end="5:00 PM") -> str:
    c = clock(_text(slot))
    if not c:
        return ""
    if c["hour"] * 60 + c["minute"] < _NOON:
        return f"Morning ({_pretty(start)}–12:00 NN)"
    return f"Afternoon (12:00 NN–{_pretty(end)})"


async def _stamp(args: dict) -> None:
    id_, record, store = args["id"], args["record"], args["store"]
    policy = await policy_reader(store)
    want = window_for(record.get("Confirmed_Time_Slot"), policy("workday_start_time") or "8:00 AM", policy("workday_end_time") or "5:00 PM")
    if _text(record.get("Time_Window")) == want:
        return
    await store.update_record(SA, id_, {"Time_Window": want}, by_form=True)


def _strip(args: dict) -> None:
    args["input"].pop("Time_Window", None)


register(SA, {
    "beforeAdd": _strip,
    "beforeUpdate": _strip,
    "afterAdd": _stamp,
    "afterUpdate": _stamp,
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_time_window.py -v
```

Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/time_window.py tests/delivery/test_time_window.py
git commit -m "feat(delivery): port time-window.mjs (customer-facing Morning/Afternoon window)"
```

---

### Task 8: `app/delivery/delivery_scheduling_hooks.py`

**Files:**
- Create: `app/delivery/delivery_scheduling_hooks.py`
- Test: `tests/delivery/test_delivery_scheduling_hooks.py`

**Interfaces:**
- Consumes: `app.workflows.register`; `app.deluge.blank`.
- Produces: `async def teams_without_availability(rec: dict, store) -> list[str]`; a non-blocking
  `before_add`/`before_update` warning hook on `Delivery_Scheduling`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/delivery/test_delivery_scheduling_hooks.py
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
    import app.delivery.delivery_scheduling_hooks  # noqa: F401
    return create_hooked_store(raw)


async def test_teams_without_availability_blank_when_date_or_installer_missing(raw):
    from app.delivery.delivery_scheduling_hooks import teams_without_availability
    assert await teams_without_availability({"Date_field": "", "Installer": "Team A"}, raw) == []
    assert await teams_without_availability({"Date_field": "2026-12-01", "Installer": ""}, raw) == []


async def test_teams_without_availability_lists_missing_installers(raw):
    from app.delivery.delivery_scheduling_hooks import teams_without_availability
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": "2026-12-01", "Installer": "Team A", "Availability_Status": "Available"})
    out = await teams_without_availability({"Date_field": "2026-12-01", "Installer": ["Team A", "Team B"]}, raw)
    assert out == ["Team B"]


async def test_teams_without_availability_excludes_not_available_rows(raw):
    from app.delivery.delivery_scheduling_hooks import teams_without_availability
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": "2026-12-01", "Installer": "Team A", "Availability_Status": "Not Available"})
    out = await teams_without_availability({"Date_field": "2026-12-01", "Installer": "Team A"}, raw)
    assert out == ["Team A"]


async def test_the_save_goes_ahead_even_when_team_has_no_availability_record(raw, store, caplog):
    # Zoho only shows an alert and never cancels the save -- this ports it as a non-blocking log.
    id_ = await store.add_record("Delivery_Scheduling", {"Date_field": "2026-12-01", "Installer": "Team Z"})
    assert id_  # the write went through, nothing raised
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/delivery/test_delivery_scheduling_hooks.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.delivery.delivery_scheduling_hooks'`.

- [ ] **Step 3: Write `delivery_scheduling_hooks.py`**

```python
# app/delivery/delivery_scheduling_hooks.py
# Delivery_Scheduling workflows, ported from zoho-export/parsed/workflows/form/Delivery_Scheduling/
# *.dg (via Node's delivery-scheduling.mjs). Only the events that run on API writes are here.
#
# Ported here: DS_Validate_Team_Capacity1.
# Ported elsewhere: ISCHED_Instant_Forecast (forecast-stamp.py, a later phase).
#
# DS_Validate_Team_Capacity: for each installer picked for a date, look for a Daily_Team_Availability
# record that is not "Not Available". Zoho only shows an alert ("Paalala: ...") and never cancels
# the save, which means a write through the API is never refused or changed by this script. It is
# ported as a warning in the server log.
import logging

from app.deluge import blank
from app.workflows import register

logger = logging.getLogger(__name__)


async def teams_without_availability(rec: dict, store) -> list[str]:
    if blank(rec.get("Date_field")) or blank(rec.get("Installer")):
        return []
    missing = []
    installers = rec["Installer"] if isinstance(rec["Installer"], list) else [rec["Installer"]]
    for installer in installers:
        free = await store.find("Daily_Team_Availability", lambda r: r.get("Availability_Date") == rec["Date_field"] and r.get("Installer") == installer and r.get("Availability_Status") != "Not Available")
        if not free:
            missing.append(installer)
    return missing


async def _warn_about_capacity(args: dict) -> None:
    input_, previous, store = args["input"], args.get("previous"), args["store"]
    merged = {**(previous or {}), **input_}
    missing = await teams_without_availability(merged, store)
    if missing:
        date_field = input_.get("Date_field", (previous or {}).get("Date_field"))
        logger.warning(f"[Delivery_Scheduling] no Daily Team Availability record for {', '.join(missing)} on {date_field}; the save goes ahead, as in Zoho.")


register("Delivery_Scheduling", {"beforeAdd": _warn_about_capacity, "beforeUpdate": _warn_about_capacity})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_delivery_scheduling_hooks.py -v
```

Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/delivery_scheduling_hooks.py tests/delivery/test_delivery_scheduling_hooks.py
git commit -m "feat(delivery): port delivery-scheduling.mjs (non-blocking team capacity warning)"
```

---

### Task 9: `app/delivery/confirmation.py`

**Files:**
- Create: `app/delivery/confirmation.py`
- Test: `tests/delivery/test_confirmation.py`

**Interfaces:**
- Consumes: `app.delivery.scheduling.{SA, raise_exception}` (Task 2); `app.workflows.register`;
  `app.criteria.zoho_now`; `app.deluge.{blank, truthy, parse_date, ymd, add_days, today_date}`.
- Produces: `before_add`/`before_update` hooks on `SA` stamping `Appointment_Confirmed_At` once;
  `async def run_confirm_cutoff_check(store, *, now=None) -> dict` (`{"checked": int, "alerted":
  int}`).

- [ ] **Step 1: Write the failing tests**

```python
# tests/delivery/test_confirmation.py
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
    import app.delivery.confirmation  # noqa: F401
    return create_hooked_store(raw)


async def test_confirm_appointment_trigger_stamps_once_and_clears(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Confirm_Appointment": True})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Appointment_Confirmed_At"]
    assert row.get("Confirm_Appointment") in (False, "false", None)


async def test_second_confirm_trigger_is_a_no_op_keeps_first_timestamp(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Confirm_Appointment": True})
    first = (await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True))["Appointment_Confirmed_At"]
    await store.update_record("Service_Appointment_Form", id_, {"Confirm_Appointment": True})
    second = (await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True))["Appointment_Confirmed_At"]
    assert first == second


async def test_false_trigger_is_dropped_not_stamped(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Confirm_Appointment": False})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert blank(row.get("Appointment_Confirmed_At")) if (b := row.get("Appointment_Confirmed_At")) is not None else True


async def test_run_confirm_cutoff_check_alerts_unconfirmed_for_tomorrow(raw):
    from app.delivery.confirmation import run_confirm_cutoff_check
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Service_Appointment_Form", {"Confirmed_Schedule_Date": tomorrow, "Appointment_Status": "Scheduled"})
    out = await run_confirm_cutoff_check(raw)
    assert out["checked"] == 1
    assert out["alerted"] == 1
    rows = await raw.find("DMS_Exception_Queue")
    assert len(rows) == 1
    assert rows[0]["Exception_Reason"] == "Unconfirmed by cutoff"


async def test_run_confirm_cutoff_check_skips_already_confirmed(raw):
    from app.delivery.confirmation import run_confirm_cutoff_check
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Service_Appointment_Form", {"Confirmed_Schedule_Date": tomorrow, "Appointment_Status": "Scheduled", "Appointment_Confirmed_At": "2026-11-20 10:00:00 AM"})
    out = await run_confirm_cutoff_check(raw)
    assert out["alerted"] == 0


async def test_run_confirm_cutoff_check_skips_done_statuses(raw):
    from app.delivery.confirmation import run_confirm_cutoff_check
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Service_Appointment_Form", {"Confirmed_Schedule_Date": tomorrow, "Appointment_Status": "Completed"})
    out = await run_confirm_cutoff_check(raw)
    assert out["alerted"] == 0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/delivery/test_confirmation.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.delivery.confirmation'`.

- [ ] **Step 3: Write `confirmation.py`**

```python
# app/delivery/confirmation.py
# Appointment confirmation and the unconfirmed-by-cutoff alert (spec v1.4, Delivery 03 §1,
# AP-R2/AP-R4).
#
# AP-R2's own trigger ("SMS with window and tracking link") is not built -- no SMS integration
# exists in this app yet. This still ports the part that does not need SMS: "the customer's reply,
# OR A DISPATCHER CALL, sets confirmed" -- a dispatcher can mark an appointment confirmed by hand.
# Ported from server/modules/delivery-management/confirmation.mjs.
from app.criteria import zoho_now
from app.deluge import add_days, blank, parse_date, today_date, truthy, ymd
from app.delivery.scheduling import SA, raise_exception
from app.workflows import register

_DONE_STATUSES = {"Completed", "Failed", "Archived"}


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _stamp_confirmation(args: dict) -> None:
    input_, previous = args["input"], args.get("previous")
    if not truthy(input_.get("Confirm_Appointment")):
        input_.pop("Confirm_Appointment", None)
        return
    input_["Confirm_Appointment"] = False
    if blank((previous or {}).get("Appointment_Confirmed_At")):
        input_["Appointment_Confirmed_At"] = zoho_now()


register(SA, {"beforeAdd": _stamp_confirmation, "beforeUpdate": _stamp_confirmation})


async def run_confirm_cutoff_check(store, *, now=None) -> dict:
    tomorrow = ymd(add_days(today_date(), 1))

    def _is_tomorrow(r):
        d = parse_date(r.get("Confirmed_Schedule_Date"))
        return d is not None and ymd(d) == tomorrow

    all_ = await store.find(SA, _is_tomorrow)
    alerted = 0
    for rec in all_:
        if _text(rec.get("Appointment_Status")) in _DONE_STATUSES:
            continue
        if not blank(rec.get("Appointment_Confirmed_At")):
            continue
        raised = await raise_exception(store, rec, stage="Confirmation", reason="Unconfirmed by cutoff", severity="Medium")
        if raised:
            alerted += 1
    return {"checked": len(all_), "alerted": alerted}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/delivery/test_confirmation.py -v
```

Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/confirmation.py tests/delivery/test_confirmation.py
git commit -m "feat(delivery): port confirmation.mjs (confirm stamp + AP-R4 cutoff check)"
```

---

### Task 10: Wire the 4 hook-registering files into `app/delivery/__init__.py`, final regression

Per the spec: `scheduling.py`, `earliest_slot.py`, `suggest_schedule.py` are pure library modules
(no `register()` calls) — only `scheduling_engine.py`, `time_window.py`, `confirmation.py`,
`delivery_scheduling_hooks.py` register hooks and need to be imported for their side effects.

**Files:**
- Modify: `app/delivery/__init__.py`

**Interfaces:**
- Produces: importing `app.delivery` registers every Phase 2 hook (on `Service_Appointment_Form`
  and `Delivery_Scheduling`) and the `dms_reschedule` custom API, as a side effect — same as
  importing `app.procurement` does for Procurement's.

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
import app.delivery.settings  # noqa: F401 -- registers Policy_Settings/Delivery_Roster hooks and get_delivery_settings/preview_delivery_setting/get_delivery_roster/seed_delivery_roster
import app.delivery.scheduling  # noqa: F401 -- registers the dms_reschedule custom API
import app.delivery.scheduling_engine  # noqa: F401 -- registers Service_Appointment_Form's 4 scheduling-engine hooks
import app.delivery.time_window  # noqa: F401 -- registers Service_Appointment_Form's Time_Window strip/stamp hooks
import app.delivery.confirmation  # noqa: F401 -- registers Service_Appointment_Form's confirmation-stamp hook
import app.delivery.delivery_scheduling_hooks  # noqa: F401 -- registers Delivery_Scheduling's capacity warning hook
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

Expected: PASS — 597 (end of Phase 1) + this phase's new tests. Confirm the printed total rather
than asserting an exact number here (the exact count depends on final test-collection, which may
differ slightly from the per-task estimates above if any test needed splitting during
implementation).

- [ ] **Step 4: Commit**

```bash
git add app/delivery/__init__.py
git commit -m "feat(delivery): wire Phase 2's hook-registering modules into app/delivery/__init__.py"
```

---

## Final verification

After Task 10, confirm live behavior against the running local-Postgres dev server (never Railway,
per CLAUDE.md): start uvicorn, log in, and call `dms_reschedule` on a real `Service_Appointment_Form`
row to confirm the custom API reaches `schedule_slot` end-to-end through the HTTP layer, same
smoke-test style used after Phase 1 and the Integrations sub-project.

This phase deliberately leaves the other 4 `apis.mjs` thin wrappers (`get_earliest_slot`,
`quote_and_hold_slot`, `release_schedule_hold`, `suggest_schedule`) unregistered, and
`run_confirm_cutoff_check` unscheduled (no cron wiring yet) — both are expected gaps, not bugs,
per the spec's own "Out of scope" section.
