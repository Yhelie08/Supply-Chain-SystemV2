# Partial/unpaid packages stay out of Order Readiness ("Need Approval") until approved (app/fulfillment/workflows.py).
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment.workflows  # noqa: F401
import app.fulfillment.pipeline  # noqa: F401 -- so_to_readiness creates the Gate records this file reads

SOF = "Sales_Order_Fulfillment"
GATE = "Sales_Order_Readiness_Gate"
PICK = "Pick1"
LAMP = {"Item": "Lamp", "SKU": "L-1", "Quantity": "2", "Bin_Location": "A-01"}
SHADE = {"Item": "Shade", "SKU": "S-1", "Quantity": "1", "Bin_Location": "A-02"}


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _add_package(hooked_store, extra=None):
    extra = extra or {}
    return await hooked_store.add_record(SOF, {"SO_No": "SO-1", "Fulfillment_Stage": "Waiting For Package", "Package": "PAC-1", "Status": "Partial", "Item_Details1": [LAMP, SHADE], **extra})


async def _stage(raw_store, id_):
    return (await raw_store.get_record_by_id(SOF, id_, raw=True))["Fulfillment_Stage"]


async def _approve(hooked_store, gate_id, for_status="Partial"):
    await hooked_store.update_record(GATE, gate_id, {"Override_Approved": True, "Override_Approved_For_Status": for_status, "Override_By": "Boss", "Override_Reason": "ok"}, by_form=True)


@pytest.mark.asyncio
async def test_partial_is_need_approval_with_gate_records_existing(hooked_store, raw_store):
    id_ = await _add_package(hooked_store)
    assert await _stage(raw_store, id_) == "Need Approval"
    assert len(await raw_store.find(GATE)) == 2


@pytest.mark.asyncio
async def test_approving_every_gate_record_moves_to_readiness_approving_one_does_not(hooked_store, raw_store):
    id_ = await _add_package(hooked_store)
    g1, g2 = await raw_store.find(GATE)
    await _approve(hooked_store, g1["ID"])
    assert await _stage(raw_store, id_) == "Need Approval"
    await _approve(hooked_store, g2["ID"])
    assert await _stage(raw_store, id_) == "Order Readiness"


@pytest.mark.asyncio
async def test_approval_is_only_good_for_the_status_it_was_given_for(hooked_store, raw_store):
    id_ = await _add_package(hooked_store)
    for g in await raw_store.find(GATE):
        await _approve(hooked_store, g["ID"], "Partial")
    assert await _stage(raw_store, id_) == "Order Readiness"
    await hooked_store.update_record(SOF, id_, {"Status": "No"}, by_form=True)
    assert await _stage(raw_store, id_) == "Need Approval"


@pytest.mark.asyncio
async def test_paying_moves_to_readiness_with_no_approval_credit_terms_need_none_either(hooked_store, raw_store):
    id_ = await _add_package(hooked_store)
    await hooked_store.update_record(SOF, id_, {"Status": "Yes"}, by_form=True)
    assert await _stage(raw_store, id_) == "Order Readiness"
    id2 = await _add_package(hooked_store, {"SO_No": "SO-2", "Package": "PAC-2", "Has_Credit_Terms": True})
    assert await _stage(raw_store, id2) == "Order Readiness"


@pytest.mark.asyncio
async def test_a_gate_record_still_needing_approval_is_never_released_to_pick(hooked_store, raw_store):
    await _add_package(hooked_store)
    g1 = (await raw_store.find(GATE))[0]
    await hooked_store.update_record(GATE, g1["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    assert await raw_store.find(PICK) == []
    await _approve(hooked_store, g1["ID"])
    await hooked_store.update_record(GATE, g1["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    assert len(await raw_store.find(PICK)) == 1
