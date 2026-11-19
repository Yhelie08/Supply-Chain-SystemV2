# package_pick_status custom API (app/fulfillment/apis.py): tells the Pick widget whether a package
# is now fully picked and still needs its box count, right after a Mark Picked save.
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
from app.custom_apis import CUSTOM_APIS
import app.fulfillment.workflows  # noqa: F401
import app.fulfillment.pipeline  # noqa: F401
import app.fulfillment.apis  # noqa: F401 -- registers package_pick_status

SOF, GATE, PICK = "Sales_Order_Fulfillment", "Sales_Order_Readiness_Gate", "Pick1"
LAMP = {"Item": "Lamp", "SKU": "L-1", "Quantity": "2", "Bin_Location": "A-01"}


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _add_package(hooked_store):
    return await hooked_store.add_record(SOF, {
        "SO_No": "SO-1", "Fulfillment_Stage": "Waiting For Package", "Package": "PAC-1", "Status": "Yes",
        "Customer_Type": "Corporate", "Delivery_Type": "Delivery Only", "order_type": "Normal", "Shipping_Address": "1 Main St", "Item_Details1": [LAMP],
    })


@pytest.mark.asyncio
async def test_not_all_picked_yet_reports_all_picked_false_needs_box_count_false(hooked_store, raw_store):
    await _add_package(hooked_store)
    gate = (await raw_store.find(GATE))[0]
    await hooked_store.update_record(GATE, gate["ID"], {"Release": True}, by_form=True)
    fn = CUSTOM_APIS["package_pick_status"]
    result = await fn({"so": "SO-1", "pkg": "PAC-1"}, raw_store, {})
    assert (result["status"], result["allPicked"], result["needsBoxCount"]) == ("success", False, False)


@pytest.mark.asyncio
async def test_all_picked_and_still_estimated_reports_needs_box_count_true(hooked_store, raw_store):
    await _add_package(hooked_store)
    gate = (await raw_store.find(GATE))[0]
    await hooked_store.update_record(GATE, gate["ID"], {"Release": True}, by_form=True)
    pick = (await raw_store.find(PICK))[0]
    await hooked_store.update_record(PICK, pick["ID"], {"Marked": True}, by_form=True)
    fn = CUSTOM_APIS["package_pick_status"]
    result = await fn({"so": "SO-1", "pkg": "PAC-1"}, raw_store, {})
    assert (result["allPicked"], result["needsBoxCount"]) == (True, True)


@pytest.mark.asyncio
async def test_all_picked_but_already_counted_reports_needs_box_count_false(hooked_store, raw_store):
    id_ = await _add_package(hooked_store)
    await raw_store.update_record(SOF, id_, {"Box_Count": "3", "Box_Count_Source": "counted"}, by_form=True)
    gate = (await raw_store.find(GATE))[0]
    await hooked_store.update_record(GATE, gate["ID"], {"Release": True}, by_form=True)
    pick = (await raw_store.find(PICK))[0]
    await hooked_store.update_record(PICK, pick["ID"], {"Marked": True}, by_form=True)
    fn = CUSTOM_APIS["package_pick_status"]
    result = await fn({"so": "SO-1", "pkg": "PAC-1"}, raw_store, {})
    assert (result["allPicked"], result["needsBoxCount"]) == (True, False)
