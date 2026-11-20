# The package event log with the names of spec v1.4 (05 Shared Engines / 04 Timestamps and Event Log; owner decision 2026-11-20: "ayon sa
# document"): package.created / ready / released / picked / qc_passed / qc_rejected / rework_done / crated / aggregated / dispatched, plus
# blocked / unblocked, box_counted and picker_assigned. T-6: a second visit is a NEW row with visit_no 2, the first is never overwritten.
# Rows written before this change carry the old names (package.<stage>) and must still be understood.
import pytest

from app.fulfillment.events import (event_aliases, legacy_event_name, log_package_event, stage_event_name, stage_event_names)
from app.fulfillment.sorter import rescore_all
from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment  # noqa: F401  (wires every Fulfillment hook)

SOF, GATE, QC, CRATE, EXC, AGG, EVENTS = ("Sales_Order_Fulfillment", "Sales_Order_Readiness_Gate", "Checker_Checklist", "Crate_Checklist",
                                          "Exception_Control1", "Order_Aggregation1", "Stage_Events")
_PHOTO = "Image_Upload_max_10_JPG_JPEG_PNG"
_APPROVED = {"QC_Status": "Approved", "Fixture_Body_Checklist": ["ok"], "LED_Checklist": ["ok"], "Uniformity": ["ok"], _PHOTO: "/uploads/1_a.jpg", "Signature": "/uploads/2_s.png"}
_REJECTED = {"QC_Status": "Rejected", "Remarks": "Damaged", _PHOTO: "/uploads/1_a.jpg"}
_CRATE_DONE = {"Crating_Status1": "Done", "Crating_Checklist": ["ok"], "Photo_Documentation": "/uploads/3_c.jpg", "Crate_Weight_Kg": "5", "Crate_Dimensions_Cm": "1 x 1 x 1"}


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _events(raw_store, id_):
    rows = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_))
    return sorted(((r["Event"], int(r["Visit_No"])) for r in rows), key=lambda x: x[0])


async def _names(raw_store, id_):
    rows = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_))
    return [r["Event"] for r in sorted(rows, key=lambda r: int(r["ID"]))]


async def _package(hooked_store, stage="Waiting For Package", **extra):
    return await hooked_store.add_record(SOF, {"SO_No": "SO-1", "Fulfillment_Stage": stage, "Package": "PAC-1", "Item_Details1": [{"Item": "Lamp", "SKU": "L-1", "Quantity": "2"}], **extra})


# ---------- the names ----------
def test_each_stage_has_its_spec_event_name_and_an_unknown_stage_keeps_the_old_style_name():
    assert [stage_event_name(s) for s in ("Waiting For Package", "Order Readiness", "Picking", "Pack & QC", "Order Aggregation", "For Delivery")] == [
        "package.created", "package.ready", "package.released", "package.picked", "package.aggregated", "package.dispatched"]
    assert stage_event_name("Need Approval") == "package.need_approval"   # the spec has no name for it; kept so the aging guard can count it
    assert stage_event_name("Crate") == "package.crate"
    assert stage_event_name("") == ""


def test_the_old_name_of_a_stage_is_still_understood():
    assert legacy_event_name("Order Aggregation") == "package.order_aggregation"
    assert stage_event_names("Order Aggregation") == {"package.aggregated", "package.order_aggregation"}
    assert stage_event_names("Picking") == {"package.released", "package.picking"}
    assert event_aliases("package.qc_passed") == {"package.qc_passed"}   # a semantic event has no old name
    assert event_aliases("package.dispatched") == {"package.dispatched", "package.for_delivery"}


# ---------- stage entry ----------
@pytest.mark.asyncio
async def test_a_new_package_logs_created_and_a_package_that_starts_ready_logs_created_then_ready(hooked_store, raw_store):
    waiting = await _package(hooked_store, Package="")   # no package number yet: it waits
    assert await _events(raw_store, waiting) == [("package.created", 1)]
    paid = await hooked_store.add_record(SOF, {"SO_No": "SO-2", "Fulfillment_Stage": "Waiting For Package", "Package": "PAC-2", "Status": "Yes", "Item_Details1": [{"Item": "Lamp", "SKU": "L-1", "Quantity": "2"}]})
    assert await _names(raw_store, paid) == ["package.created", "package.ready"]


@pytest.mark.asyncio
async def test_the_stages_a_package_walks_through_log_their_spec_names_in_order(hooked_store, raw_store):
    id_ = await _package(hooked_store, Status="Yes")
    for stage in ("Picking", "Pack & QC", "Order Aggregation", "For Delivery"):
        await hooked_store.update_record(SOF, id_, {"Fulfillment_Stage": stage}, by_form=True)
    assert await _names(raw_store, id_) == ["package.created", "package.ready", "package.released", "package.picked", "package.aggregated", "package.dispatched"]


@pytest.mark.asyncio
async def test_coming_back_to_a_stage_is_a_new_row_with_visit_2_and_the_first_row_is_kept(hooked_store, raw_store):
    id_ = await _package(hooked_store, Status="Yes")
    first = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_) and r["Event"] == "package.ready")
    for stage in ("Picking", "Pack & QC", "Picking"):
        await hooked_store.update_record(SOF, id_, {"Fulfillment_Stage": stage}, by_form=True)
    released = [r for r in await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_) and r["Event"] == "package.released")]
    assert sorted(int(r["Visit_No"]) for r in released) == [1, 2]
    assert len({r["ID"] for r in released}) == 2   # two rows, the first one was not overwritten
    assert (await _events(raw_store, id_)).count(("package.picked", 1)) == 1
    again = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_) and r["Event"] == "package.ready")
    assert [r["ID"] for r in again] == [r["ID"] for r in first]


@pytest.mark.asyncio
async def test_a_row_with_the_old_name_counts_as_the_first_visit(hooked_store, raw_store):
    id_ = await _package(hooked_store, Status="Yes")
    await raw_store.add_record(EVENTS, {"Record_Type": "package", "Record_Id": str(id_), "Event": "package.picking", "Occurred_At": "2026-11-01 08:00:00 AM", "Reported_At": "2026-11-01 08:00:00 AM", "Source": "system"})
    await hooked_store.update_record(SOF, id_, {"Fulfillment_Stage": "Picking"}, by_form=True)
    released = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_) and r["Event"] == "package.released")
    assert [int(r["Visit_No"]) for r in released] == [2]


@pytest.mark.asyncio
async def test_an_event_row_is_stamped_by_the_server_with_two_times_and_an_exact_bound(raw_store):
    visit = await log_package_event(raw_store, "77", "package.box_counted", note="12 boxes", actor="tester")
    assert visit == 1
    row = (await raw_store.find(EVENTS))[0]
    assert (row["Record_Type"], row["Record_Id"], row["Event"], row["Source"], row["Occurred_Bound"], row["Note"], row["Actor"]) == ("package", "77", "package.box_counted", "system", "exact", "12 boxes", "tester")
    assert row["Occurred_At"] == row["Reported_At"] != ""
    assert await log_package_event(raw_store, "77", "package.box_counted") == 2


# ---------- events that are not a stage change ----------
@pytest.mark.asyncio
async def test_qc_approved_and_rejected_log_qc_passed_and_qc_rejected_once_per_decision(hooked_store, raw_store):
    id_ = await _package(hooked_store, "Pack & QC")
    qc = await hooked_store.add_record(QC, {"SO": "SO-1", "PAC": "PAC-1", "SKU": "L-1", "Item_Name": "Lamp", "Quantity": "2", "Bin_Location": "A-01"})
    assert "package.qc_passed" not in await _names(raw_store, id_)
    await hooked_store.update_record(QC, qc, _APPROVED, by_form=True)
    await hooked_store.update_record(QC, qc, {"Remarks": "saved again"}, by_form=True)   # a second save of the same decision logs nothing
    assert (await _events(raw_store, id_)).count(("package.qc_passed", 1)) == 1
    qc2 = await hooked_store.add_record(QC, {"SO": "SO-1", "PAC": "PAC-1", "SKU": "L-1", "Item_Name": "Lamp", "Quantity": "1"})
    await hooked_store.update_record(QC, qc2, _REJECTED, by_form=True)
    rows = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_) and r["Event"] == "package.qc_rejected")
    assert len(rows) == 1 and "L-1" in rows[0]["Note"]


@pytest.mark.asyncio
async def test_a_second_qc_pass_after_the_first_is_visit_2_not_an_overwrite(hooked_store, raw_store):
    id_ = await _package(hooked_store, "Pack & QC")
    for _ in range(2):
        qc = await hooked_store.add_record(QC, {"SO": "SO-1", "PAC": "PAC-1", "SKU": "L-1", "Item_Name": "Lamp", "Quantity": "1", "Bin_Location": "A-01"})
        await hooked_store.update_record(QC, qc, _APPROVED, by_form=True)
    passed = [(e, v) for e, v in await _events(raw_store, id_) if e == "package.qc_passed"]
    assert passed == [("package.qc_passed", 1), ("package.qc_passed", 2)]


@pytest.mark.asyncio
async def test_rework_done_is_logged_when_the_exception_is_completed_and_the_unit_goes_back_to_qc(hooked_store, raw_store):
    id_ = await _package(hooked_store, "Pack & QC")
    qc = await hooked_store.add_record(QC, {"SO": "SO-1", "PAC": "PAC-1", "SKU": "L-1", "Item_Name": "Lamp", "Quantity": "1"})
    await hooked_store.update_record(QC, qc, _REJECTED, by_form=True)
    exc = (await raw_store.find(EXC))[0]
    await hooked_store.update_record(EXC, exc["ID"], {"Status": "In Rework"}, by_form=True)
    assert "package.rework_done" not in await _names(raw_store, id_)
    await hooked_store.update_record(EXC, exc["ID"], {"Status": "Completed"}, by_form=True)
    await hooked_store.update_record(EXC, exc["ID"], {"Remarks": "saved again"}, by_form=True)
    assert (await _events(raw_store, id_)).count(("package.rework_done", 1)) == 1


@pytest.mark.asyncio
async def test_crated_is_logged_once_when_a_crate_is_marked_done(hooked_store, raw_store):
    id_ = await _package(hooked_store, "Crate")
    crate = await hooked_store.add_record(CRATE, {"SO": "SO-1", "Package_Order": "PAC-1", "SKU": "L-1", "Item_Name": "Lamp", "Quantity": "2", "Crating_Status1": "Pending"})
    assert "package.crated" not in await _names(raw_store, id_)
    await hooked_store.update_record(CRATE, crate, _CRATE_DONE, by_form=True)
    await hooked_store.update_record(CRATE, crate, {"Crate_Weight_Kg": "6"}, by_form=True)
    assert (await _events(raw_store, id_)).count(("package.crated", 1)) == 1


@pytest.mark.asyncio
async def test_box_counted_is_logged_when_the_count_becomes_counted_and_picker_assigned_when_a_picker_is_set(hooked_store, raw_store):
    id_ = await _package(hooked_store, Status="Yes", Shipping_Address="1 Main St", Contact_No="0917 000 0000")
    await hooked_store.update_record(SOF, id_, {"Box_Count": "4", "Box_Count_Source": "estimated"}, by_form=True)
    assert "package.box_counted" not in await _names(raw_store, id_)
    await hooked_store.update_record(SOF, id_, {"Box_Count": "5", "Box_Count_Source": "counted"}, by_form=True)
    await hooked_store.update_record(SOF, id_, {"Box_Count": "6"}, by_form=True)   # changed again while already counted: not a new event
    assert (await _events(raw_store, id_)).count(("package.box_counted", 1)) == 1
    gate = (await raw_store.find(GATE))[0]
    await hooked_store.update_record(GATE, gate["ID"], {"Assign_Picker": "Hendel"}, by_form=True)
    await hooked_store.update_record(GATE, gate["ID"], {"Assign_Picker": "Hendel"}, by_form=True)
    picked = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_) and r["Event"] == "package.picker_assigned")
    assert len(picked) == 1 and "Hendel" in picked[0]["Note"]


@pytest.mark.asyncio
async def test_blocked_and_unblocked_are_logged_when_the_category_changes_and_not_on_the_first_scoring(hooked_store, raw_store):
    id_ = await _package(hooked_store, Status="Yes", Shipping_Address="1 Main St", Contact_No="0917 000 0000")
    await rescore_all(raw_store)
    assert not [n for n in await _names(raw_store, id_) if n in ("package.blocked", "package.unblocked")]   # first scoring: nothing
    exc = await raw_store.add_record(EXC, {"Sales_Order": "SO-1", "SKU": "L-1", "PAC": "PAC-1", "Item_Name": "Lamp", "Status": "Pending"})
    await rescore_all(raw_store)
    await rescore_all(raw_store)   # same category again: nothing new
    blocked = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_) and r["Event"] == "package.blocked")
    assert len(blocked) == 1 and "Open exception" in blocked[0]["Note"]
    await raw_store.update_record(EXC, exc, {"Status": "Completed"}, by_form=True)
    await rescore_all(raw_store)
    assert (await _events(raw_store, id_)).count(("package.unblocked", 1)) == 1


def test_the_aging_guard_counts_days_from_an_old_named_row_and_from_a_new_named_row_alike():
    from datetime import datetime
    from app.fulfillment.aging import days_in_stage
    now = datetime(2026, 11, 20, 12, 0, 0)
    sof = {"ID": "5", "Fulfillment_Stage": "Picking"}
    old = [{"Record_Id": "5", "Event": "package.picking", "Occurred_At": "2026-11-10 12:00:00 PM"}]
    new = [{"Record_Id": "5", "Event": "package.released", "Occurred_At": "2026-11-10 12:00:00 PM"}]
    assert days_in_stage(sof, old, now) == 10 and days_in_stage(sof, new, now) == 10
    mixed = old + [{"Record_Id": "5", "Event": "package.released", "Occurred_At": "2026-11-15 12:00:00 PM"}]   # came back later: the newest visit counts
    assert days_in_stage(sof, mixed, now) == 5
    assert days_in_stage(sof, [{"Record_Id": "5", "Event": "package.qc_passed", "Occurred_At": "2026-11-01 12:00:00 PM"}], now) == 0   # another event is not a stage entry
