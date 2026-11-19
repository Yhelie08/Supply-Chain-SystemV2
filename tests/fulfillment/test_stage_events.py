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
