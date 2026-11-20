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


@pytest.mark.asyncio
async def test_stage_events_form_exists_with_the_expected_columns(raw_store):
    id_ = await raw_store.add_record(EVENTS, {"Record_Type": "package", "Record_Id": "1", "Event": "package.picking", "Occurred_At": "x", "Reported_At": "x", "Source": "system"})
    r = await raw_store.get_record_by_id(EVENTS, id_, raw=True)
    assert r["Record_Type"] == "package"
    assert r["Event"] == "package.picking"


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
    assert rows[0]["Event"] == "package.created"   # spec v1.4 name (2026-11-20); before it was package.waiting_for_package
    assert rows[0]["Occurred_At"] == rows[0]["Reported_At"]


@pytest.mark.asyncio
async def test_a_save_that_changes_stage_logs_exactly_one_new_row(hooked_store, raw_store):
    id_ = await hooked_store.add_record(SOF, {"SO_No": "SO-2", "Fulfillment_Stage": "Waiting For Package"})
    await hooked_store.update_record(SOF, id_, {"Package": "PAC-2", "Status": "Yes"}, by_form=True)
    rows = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_))
    assert len(rows) == 2
    assert sorted(r["Event"] for r in rows) == ["package.created", "package.ready"]


@pytest.mark.asyncio
async def test_a_save_that_does_not_change_stage_logs_nothing_new(hooked_store, raw_store):
    id_ = await hooked_store.add_record(SOF, {"SO_No": "SO-3", "Fulfillment_Stage": "Picking", "Package": "PAC-3"})
    before = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_))
    assert sorted(r["Event"] for r in before) == ["package.created", "package.released"]   # created, then the stage it starts in
    await hooked_store.update_record(SOF, id_, {"Delivery_Type": "Delivery Only"}, by_form=True)
    rows = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_))
    assert len(rows) == len(before)


@pytest.mark.asyncio
async def test_two_saves_setting_the_same_stage_log_only_once(hooked_store, raw_store):
    id_ = await hooked_store.add_record(SOF, {"SO_No": "SO-4", "Fulfillment_Stage": "Waiting For Package"})
    await hooked_store.update_record(SOF, id_, {"Fulfillment_Stage": "Waiting For Package"}, by_form=True)
    rows = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_))
    assert len(rows) == 1


# ---------- Step 7.0: every stage change is logged, also the ones a hook writes through the RAW store ----------
# (before the fix only the first stage of a package was logged: advance_stage, reconcile_fulfillment and the
# readiness-gate hook write Fulfillment_Stage through the raw store, which never fires the afterUpdate hook)
from app.fulfillment.pipeline import advance_stage, reconcile_fulfillment  # noqa: E402

GATE = "Sales_Order_Readiness_Gate"
LAMP = {"Item": "Lamp", "SKU": "L-1", "Quantity": "2", "Bin_Location": "A-01"}


async def _events_of(raw_store, id_):
    rows = await raw_store.find(EVENTS, lambda r: r.get("Record_Id") == str(id_))
    return [r["Event"] for r in sorted(rows, key=lambda r: int(r["ID"]))]


@pytest.mark.asyncio
async def test_advance_stage_logs_the_stage_it_moves_the_package_to(hooked_store, raw_store):
    id_ = await hooked_store.add_record(SOF, {"SO_No": "SO-7", "Fulfillment_Stage": "Order Readiness", "Package": "PAC-7", "Status": "Yes", "Item_Details1": [LAMP]})
    await advance_stage(raw_store, "SO-7", "Lamp", "L-1", "Picking")
    assert (await raw_store.get_record_by_id(SOF, id_, raw=True))["Fulfillment_Stage"] == "Picking"
    assert await _events_of(raw_store, id_) == ["package.created", "package.ready", "package.released"]


@pytest.mark.asyncio
async def test_advance_stage_that_changes_nothing_logs_nothing(hooked_store, raw_store):
    id_ = await hooked_store.add_record(SOF, {"SO_No": "SO-8", "Fulfillment_Stage": "Picking", "Package": "PAC-8", "Status": "Yes", "Item_Details1": [LAMP]})
    await advance_stage(raw_store, "SO-8", "Lamp", "L-1", "Picking")   # already there
    await advance_stage(raw_store, "SO-8", "Lamp", "L-1", "Order Readiness")   # would move backwards
    assert await _events_of(raw_store, id_) == ["package.created", "package.released"]


@pytest.mark.asyncio
async def test_the_readiness_gate_hook_logs_the_stage_it_sets(hooked_store, raw_store):
    # a package saved with no package number is at Waiting For Package; the Gate saves then move it to Order Readiness
    id_ = await raw_store.add_record(SOF, {"SO_No": "SO-9", "Fulfillment_Stage": "Waiting For Package", "Package": "PAC-9", "Status": "Yes", "Item_Details1": [LAMP]})
    await hooked_store.add_record(GATE, {"sales_order_number": "SO-9", "Package_Order": "PAC-9", "SKU": "L-1", "Item_Name": "Lamp", "payment_status": "Yes"})
    assert (await raw_store.get_record_by_id(SOF, id_, raw=True))["Fulfillment_Stage"] == "Order Readiness"
    assert await _events_of(raw_store, id_) == ["package.ready"]


@pytest.mark.asyncio
async def test_reconcile_logs_the_stage_changes_it_makes(raw_store):
    id_ = await raw_store.add_record(SOF, {"SO_No": "SO-10", "Fulfillment_Stage": "Waiting For Package", "Package": "PAC-10", "Status": "Yes", "Item_Details1": [LAMP]})
    await reconcile_fulfillment(raw_store)
    assert (await raw_store.get_record_by_id(SOF, id_, raw=True))["Fulfillment_Stage"] == "Order Readiness"
    assert await _events_of(raw_store, id_) == ["package.ready"]
    await reconcile_fulfillment(raw_store)   # nothing left to change -> nothing new logged
    assert await _events_of(raw_store, id_) == ["package.ready"]


@pytest.mark.asyncio
async def test_a_hooked_store_write_is_logged_once_not_twice(hooked_store, raw_store):
    id_ = await hooked_store.add_record(SOF, {"SO_No": "SO-11", "Fulfillment_Stage": "Order Readiness", "Package": "PAC-11", "Status": "Yes", "Item_Details1": [LAMP]})
    await advance_stage(hooked_store, "SO-11", "Lamp", "L-1", "Picking")
    assert await _events_of(raw_store, id_) == ["package.created", "package.ready", "package.released"]
