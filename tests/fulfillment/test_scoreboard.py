# Fulfillment Scoreboard numbers (spec v1.4, 03 Fulfillment / 06 Kanban, Scoreboard and SO Report, section 2; rework rate: 03 / 03 RW-R4).
# Custom API `scoreboard_numbers`; everything is read from the Stage_Events log, the package rows, the Pick rows, Exception_Control1 and Capacity_Days.
# Definitions used (the owner is asked to confirm the readings marked "my reading" in the change log):
#   Boxes out per day         boxes of the packages dispatched that day (a package counts once per day).
#   Capacity used             boxes released today / the day's capacity (people x boxes per hour x hours).
#   Boxes per person per hour my reading: boxes picked / (people who picked that day x the day's hours per day), over the last 7 days.
#   Rework rate               packages with at least one exception / packages through QC (a QC passed or rejected event), per week, split by rework type
#                             (Rework field) and fault origin (Fault_Origin field, both optional, "Select"/blank = "Not chosen yet").
#   Time in stage             median hours Ready->Released, Released->Picked, Picked->QC passed, QC passed->Aggregated, Aggregated->Dispatched.
#   Received -> Pick gap      median days Ready->Released ("available" to "released").
#   On-time dispatch          packages dispatched on or before their target delivery date (packages with no target are counted apart).
import pytest

from app.custom_apis import CUSTOM_APIS
from app.fulfillment.scoreboard import scoreboard_numbers
from app.schema import ensure_schema
from app.store import create_store
import app.fulfillment  # noqa: F401

SOF, EV, PICK, EXC, CAP = "Sales_Order_Fulfillment", "Stage_Events", "Pick1", "Exception_Control1", "Capacity_Days"
TODAY = "2026-11-20"


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def _pkg(store, so, boxes=2, target="2026-12-01", pac=None):
    r = await store.add_record(SOF, {"SO_No": so, "Package": pac or f"PAC-{so}", "Fulfillment_Stage": "Pack & QC", "Box_Count": str(boxes), "Box_Count_Source": "counted",
                                     "target_delivery_date": target})
    return str(r["ID"] if isinstance(r, dict) else r)


async def _ev(store, pid, event, at):
    await store.add_record(EV, {"Record_Type": "package", "Record_Id": pid, "Event": event, "Occurred_At": at, "Visit_No": "1"})


def _t(day, hm):   # "2026-11-20", "08:00" -> the Zoho style stamp the log carries
    h, m = hm.split(":")
    h = int(h)
    return f"{day} {(h % 12) or 12:02d}:{m}:00 {'AM' if h < 12 else 'PM'}"


def _stage(res, key):
    return next(s for s in res["timeInStage"] if s["key"] == key)


async def _run(store, **payload):
    return await scoreboard_numbers({"today": TODAY, **payload}, store, {})


def test_the_api_is_registered():
    assert CUSTOM_APIS["scoreboard_numbers"] is scoreboard_numbers


@pytest.mark.asyncio
async def test_an_empty_log_gives_empty_numbers_not_an_error(raw_store):
    res = await _run(raw_store)
    assert res["status"] == "success"
    assert [s["key"] for s in res["timeInStage"]] == ["ready_to_released", "released_to_picked", "picked_to_qc_passed", "qc_to_aggregated", "aggregated_to_dispatched"]
    assert all(s["medianHours"] is None and s["count"] == 0 for s in res["timeInStage"])
    assert res["receivedToPickGap"] == {"medianDays": None, "count": 0}
    assert res["boxesOut"]["today"] == 0 and len(res["boxesOut"]["days"]) == 7 and res["boxesOut"]["days"][-1]["date"] == TODAY
    assert res["capacityUsed"]["releasedBoxes"] == 0 and res["capacityUsed"]["capacityBoxes"] == 224 and res["capacityUsed"]["pct"] == 0.0
    assert res["boxesPerPersonPerHour"]["value"] is None
    assert len(res["reworkRate"]["weeks"]) == 4 and all(w["ratePct"] is None for w in res["reworkRate"]["weeks"])
    assert res["onTimeDispatch"] == {"dispatched": 0, "onTime": 0, "late": 0, "noTarget": 0, "pct": None}


# ---------------- Time in stage ----------------
@pytest.mark.asyncio
async def test_time_in_stage_is_the_median_of_the_five_spec_transitions(raw_store):
    # package A: ready 08:00, released 10:00 (2h), picked 11:00 (1h), qc passed 12:00 (1h), aggregated 14:00 (2h), dispatched 17:00 (3h)
    # package B: 4h, 3h, 1h, 4h, 5h
    for so, hours in (("SO-A", [8, 10, 11, 12, 14, 17]), ("SO-B", [8, 12, 15, 16, 20, 25])):
        pid = await _pkg(raw_store, so)
        d0 = "2026-11-19"
        for ev, h in zip(["package.ready", "package.released", "package.picked", "package.qc_passed", "package.aggregated", "package.dispatched"], hours):
            await _ev(raw_store, pid, ev, _t(d0 if h < 24 else "2026-11-20", f"{h % 24:02d}:00"))
    res = await _run(raw_store)
    got = {s["key"]: (s["medianHours"], s["count"]) for s in res["timeInStage"]}
    assert got == {"ready_to_released": (3.0, 2), "released_to_picked": (2.0, 2), "picked_to_qc_passed": (1.0, 2), "qc_to_aggregated": (3.0, 2), "aggregated_to_dispatched": (4.0, 2)}
    assert res["receivedToPickGap"] == {"medianDays": round(3.0 / 24, 2), "count": 2}   # Ready -> Released, in days


@pytest.mark.asyncio
async def test_a_package_that_comes_back_uses_the_latest_start_and_several_qc_passes_use_the_last_one(raw_store):
    pid = await _pkg(raw_store, "SO-A")
    seq = [("package.picked", "08:00"), ("package.qc_passed", "09:00"), ("package.qc_passed", "11:00"), ("package.aggregated", "12:00")]   # two items passed QC
    for ev, hm in seq:
        await _ev(raw_store, pid, ev, _t("2026-11-19", hm))
    res = await _run(raw_store)
    assert _stage(res, "qc_to_aggregated")["medianHours"] == 1.0     # from the LAST qc passed (11:00), not the first
    assert _stage(res, "qc_to_aggregated")["count"] == 1
    assert _stage(res, "picked_to_qc_passed")["medianHours"] == 1.0  # picked 08:00 -> the first qc passed 09:00


@pytest.mark.asyncio
async def test_old_event_names_count_and_two_entries_in_the_same_second_follow_the_pipeline_order(raw_store):
    pid = await _pkg(raw_store, "SO-A")
    await _ev(raw_store, pid, "package.order_aggregation", _t("2026-11-19", "10:00"))   # old name of package.aggregated
    await _ev(raw_store, pid, "package.pack_qc", _t("2026-11-19", "10:00"))             # old name of package.picked, same second
    await _ev(raw_store, pid, "package.qc_passed", _t("2026-11-19", "10:00"))
    await _ev(raw_store, pid, "package.for_delivery", _t("2026-11-19", "12:00"))        # old name of package.dispatched
    res = await _run(raw_store)
    assert _stage(res, "aggregated_to_dispatched")["medianHours"] == 2.0


@pytest.mark.asyncio
async def test_the_window_leaves_out_old_stays_and_rows_with_a_bad_time_are_skipped(raw_store):
    pid = await _pkg(raw_store, "SO-OLD")
    await _ev(raw_store, pid, "package.ready", _t("2026-09-01", "08:00"))
    await _ev(raw_store, pid, "package.released", _t("2026-09-01", "10:00"))     # older than 30 days
    bad = await _pkg(raw_store, "SO-BAD")
    await _ev(raw_store, bad, "package.ready", "not a time")
    await _ev(raw_store, bad, "package.released", _t("2026-11-19", "10:00"))
    res = await _run(raw_store)
    assert _stage(res, "ready_to_released")["count"] == 0
    wide = await _run(raw_store, days=90)
    assert _stage(wide, "ready_to_released")["medianHours"] == 2.0


# ---------------- Boxes out, capacity used, boxes per person per hour ----------------
@pytest.mark.asyncio
async def test_boxes_out_per_day_counts_each_dispatched_package_once_per_day(raw_store):
    a, b, c = await _pkg(raw_store, "SO-A", boxes=3), await _pkg(raw_store, "SO-B", boxes=4), await _pkg(raw_store, "SO-C", boxes=5)
    await _ev(raw_store, a, "package.dispatched", _t(TODAY, "09:00"))
    await _ev(raw_store, a, "package.dispatched", _t(TODAY, "09:30"))   # logged twice the same day: still 3 boxes
    await _ev(raw_store, b, "package.dispatched", _t(TODAY, "10:00"))
    await _ev(raw_store, c, "package.dispatched", _t("2026-11-18", "10:00"))
    res = await _run(raw_store)
    assert res["boxesOut"]["today"] == 7
    days = {d["date"]: d["boxes"] for d in res["boxesOut"]["days"]}
    assert days["2026-11-18"] == 5 and days["2026-11-19"] == 0 and days[TODAY] == 7
    assert [d["date"] for d in res["boxesOut"]["days"]][0] == "2026-11-14"


@pytest.mark.asyncio
async def test_capacity_used_is_the_boxes_released_today_over_the_days_capacity(raw_store):
    await raw_store.add_record(CAP, {"Date": TODAY, "People": 2, "Boxes_Per_Hour": 5, "Hours_Per_Day": 8})   # 80 boxes
    a, b = await _pkg(raw_store, "SO-A", boxes=20), await _pkg(raw_store, "SO-B", boxes=20)
    await _ev(raw_store, a, "package.released", _t(TODAY, "08:00"))
    await _ev(raw_store, b, "package.released", _t("2026-11-19", "08:00"))   # yesterday: not counted
    res = await _run(raw_store)
    assert res["capacityUsed"] == {"releasedBoxes": 20, "capacityBoxes": 80, "pct": 25.0}


@pytest.mark.asyncio
async def test_boxes_per_person_per_hour_uses_the_pickers_of_the_day_and_the_days_hours(raw_store):
    await raw_store.add_record(CAP, {"Date": "2026-11-01", "People": 4, "Boxes_Per_Hour": 8, "Hours_Per_Day": 8})
    a, b = await _pkg(raw_store, "SO-A", boxes=16), await _pkg(raw_store, "SO-B", boxes=8)
    await raw_store.add_record(PICK, {"SO": "SO-A", "Package_Order": "PAC-SO-A", "Assign_Picker": "Hendel"})
    await raw_store.add_record(PICK, {"SO": "SO-A", "Package_Order": "PAC-SO-A", "Assign_Picker": "Ana"})
    await raw_store.add_record(PICK, {"SO": "SO-B", "Package_Order": "PAC-SO-B", "Assign_Picker": "Hendel"})
    await _ev(raw_store, a, "package.picked", _t("2026-11-19", "10:00"))   # 16 boxes, 2 pickers, 8 h -> 16 person-hours
    await _ev(raw_store, b, "package.picked", _t("2026-11-18", "10:00"))   # 8 boxes, 1 picker, 8 h -> 8 person-hours
    res = (await _run(raw_store))["boxesPerPersonPerHour"]
    assert res == {"value": 1.0, "days": 2, "boxes": 24, "personHours": 24}


@pytest.mark.asyncio
async def test_boxes_per_person_per_hour_is_empty_when_nobody_is_recorded_as_picker(raw_store):
    a = await _pkg(raw_store, "SO-A", boxes=16)
    await _ev(raw_store, a, "package.picked", _t("2026-11-19", "10:00"))
    assert (await _run(raw_store))["boxesPerPersonPerHour"]["value"] is None


@pytest.mark.asyncio
async def test_a_pick_row_with_no_picker_name_does_not_count_as_a_person(raw_store):
    a = await _pkg(raw_store, "SO-A", boxes=16)
    await raw_store.add_record(PICK, {"SO": "SO-A", "Package_Order": "PAC-SO-A", "Assign_Picker": ""})
    await _ev(raw_store, a, "package.picked", _t("2026-11-19", "10:00"))
    assert (await _run(raw_store))["boxesPerPersonPerHour"]["value"] is None


# ---------------- Rework rate ----------------
@pytest.mark.asyncio
async def test_rework_rate_is_packages_with_an_exception_over_packages_through_qc_per_week_split_by_type(raw_store):
    # this week (starts Mon 2026-11-16): 4 packages through QC; two of them have an exception (Paint/transit, blank/blank)
    for i, so in enumerate(["SO-1", "SO-2", "SO-3", "SO-4"]):
        pid = await _pkg(raw_store, so)
        await _ev(raw_store, pid, "package.qc_passed" if i % 2 else "package.qc_rejected", _t("2026-11-18", "10:00"))
    await raw_store.add_record(EXC, {"Sales_Order": "SO-1", "PAC": "PAC-SO-1", "Rework": "Paint", "Fault_Origin": "transit"})
    await raw_store.add_record(EXC, {"Sales_Order": "SO-1", "PAC": "PAC-SO-1", "Rework": "Repair", "Fault_Origin": "transit"})   # a second exception on the same package: counted once
    await raw_store.add_record(EXC, {"Sales_Order": "SO-3", "PAC": "PAC-SO-3"})
    # last week (starts Mon 2026-11-09): 1 package through QC, no exception
    old = await _pkg(raw_store, "SO-5")
    await _ev(raw_store, old, "package.qc_passed", _t("2026-11-10", "10:00"))
    res = (await _run(raw_store))["reworkRate"]
    assert [w["weekStart"] for w in res["weeks"]] == ["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]   # 4 weeks, oldest first, weeks start on Monday
    by_week = {w["weekStart"]: w for w in res["weeks"]}
    assert by_week["2026-11-16"] == {"weekStart": "2026-11-16", "throughQc": 4, "withRework": 2, "ratePct": 50.0}
    assert by_week["2026-11-09"] == {"weekStart": "2026-11-09", "throughQc": 1, "withRework": 0, "ratePct": 0.0}
    assert res["weeks"][-1]["weekStart"] == "2026-11-16"            # the newest week is the one that contains today
    assert res["byType"] == {"Paint": 1, "Repair": 1, "Not chosen yet": 1}   # Rework field (what the widget edits), of the packages with rework, over the 4 weeks
    assert res["byOrigin"] == {"transit": 2, "Not chosen yet": 1}             # Fault_Origin field, same packages


@pytest.mark.asyncio
async def test_rework_type_field_nothing_writes_is_not_used_and_select_counts_as_not_chosen_yet(raw_store):
    # Rework_Type is a dead field (only Node's sample seed ever wrote it); the Exception Control widget edits `Rework`, whose
    # unset value is the string "Select", not blank. Both must land in the same "Not chosen yet" bucket as a truly blank field.
    pid = await _pkg(raw_store, "SO-1")
    await _ev(raw_store, pid, "package.qc_rejected", _t("2026-11-18", "10:00"))
    await raw_store.add_record(EXC, {"Sales_Order": "SO-1", "PAC": "PAC-SO-1", "Rework": "Select", "Fault_Origin": "unknown", "Rework_Type": "Paint"})
    res = (await _run(raw_store))["reworkRate"]
    assert res["byType"] == {"Not chosen yet": 1}
    assert res["byOrigin"] == {"unknown": 1}


async def test_the_fault_origin_column_exists(raw_store):
    id_ = await raw_store.add_record(EXC, {"Sales_Order": "SO-1", "PAC": "PAC-SO-1", "Fault_Origin": "supplier"})
    r = await raw_store.get_record_by_id(EXC, id_, raw=True)
    assert r["Fault_Origin"] == "supplier"


# ---------------- On-time dispatch ----------------
@pytest.mark.asyncio
async def test_on_time_dispatch_compares_the_dispatch_day_with_the_target(raw_store):
    on = await _pkg(raw_store, "SO-ON", target="2026-11-20")      # dispatched on the target day: on time
    late = await _pkg(raw_store, "SO-LATE", target="2026-11-18")  # dispatched 2 days after: late
    none = await _pkg(raw_store, "SO-NONE", target="")            # no target: counted apart
    for pid in (on, late, none):
        await _ev(raw_store, pid, "package.dispatched", _t(TODAY, "09:00"))
    res = (await _run(raw_store))["onTimeDispatch"]
    assert res == {"dispatched": 3, "onTime": 1, "late": 1, "noTarget": 1, "pct": 50.0}   # the percentage is over the packages that have a target
