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
