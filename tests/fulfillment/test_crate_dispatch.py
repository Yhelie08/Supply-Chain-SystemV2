# Crate -> To Ship -> For Delivery, and Pre-Order -> Readiness Gate (app/fulfillment/crate_dispatch.py).
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment.workflows  # noqa: F401
import app.fulfillment.pipeline  # noqa: F401
import app.fulfillment.qc_routing  # noqa: F401
import app.fulfillment.crate_dispatch  # noqa: F401

SOF, QC, AGG, CRATE, GATE, PRE = "Sales_Order_Fulfillment", "Checker_Checklist", "Order_Aggregation1", "Crate_Checklist", "Sales_Order_Readiness_Gate", "Pre_Order_FF"


# Mandatory checks (app/fulfillment/mandatory.py): a crate saved as Done has to carry its checklist, photo, weight and dimensions.
_CRATE_DONE = {"Crating_Status1": "Done", "Crating_Checklist": ["Maayos at matibay ang pagkaka-crate"], "Photo_Documentation": "/uploads/3_crate.jpg", "Crate_Weight_Kg": "12.5", "Crate_Dimensions_Cm": "120 x 60 x 40"}


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _add_package(raw_store, fulfillment_stage="Crate"):
    return await raw_store.add_record(SOF, {"SO_No": "SO-1", "Fulfillment_Stage": fulfillment_stage, "Package": "PAC-1", "Item_Details1": [{"Item": "Lamp", "SKU": "L-1", "Quantity": "3"}, {"Item": "Shade", "SKU": "S-1", "Quantity": "1"}]})


async def _stage(raw_store):
    return (await raw_store.find(SOF))[0]["Fulfillment_Stage"]


async def _crate(hooked_store, extra=None):
    extra = extra or {}
    return await hooked_store.add_record(CRATE, {"SO": "SO-1", "Package_Order": "PAC-1", "SKU": "L-1", "Item_Name": "Lamp", "Quantity": "2", "Order_Type": "Normal", "Delivery_Type": "Delivery Only", "Customer_Name": "Sample Customer", "Customer_Address": "1 Main St", "Crating_Status1": "Pending", **extra})


@pytest.mark.asyncio
async def test_crating_not_done_nothing_goes_to_to_ship_stage_is_crate(hooked_store, raw_store):
    await _add_package(raw_store, "Order Readiness")
    await _crate(hooked_store)
    assert await raw_store.find(AGG) == []
    assert await _stage(raw_store) == "Crate"


@pytest.mark.asyncio
async def test_crating_done_item_goes_to_to_ship_with_crate_quantity_qc_bin_for_crate(hooked_store, raw_store):
    await _add_package(raw_store)
    await raw_store.add_record(QC, {"SO": "SO-1", "PAC": "PAC-1", "SKU": "L-1", "QC_Status": "Approved", "Quantity": "2", "Bin_Location": "A-01", "City": "Makati", "Email": "c@example.test", "Contact": "0900"})
    id_ = await _crate(hooked_store)
    await hooked_store.update_record(CRATE, id_, _CRATE_DONE, by_form=True)
    agg = await raw_store.find(AGG)
    assert len(agg) == 1
    assert agg[0]["SO"] == "SO-1"
    assert agg[0]["For_Crate"] in (True, "true")
    assert [(r["SKU"], str(r["QTY"]), r["PAC"], r["Bin_Location"]) for r in agg[0]["Item_Details"]] == [("L-1", "2", "PAC-1", "A-01")]
    assert agg[0]["City"] == "Makati"
    assert await _stage(raw_store) == "Order Aggregation"
    await hooked_store.update_record(CRATE, id_, {"Remarks": "again"}, by_form=True)
    agg_again = await raw_store.find(AGG)
    assert len(agg_again) == 1
    assert len(agg_again[0]["Item_Details"]) == 1


@pytest.mark.asyncio
async def test_a_second_crated_item_adds_a_row_to_the_same_to_ship_record(hooked_store, raw_store):
    await _add_package(raw_store)
    await _crate(hooked_store, _CRATE_DONE)
    await _crate(hooked_store, {"SKU": "S-1", "Item_Name": "Shade", "Quantity": "1", **_CRATE_DONE})
    agg = await raw_store.find(AGG)
    assert len(agg) == 1
    assert sorted(r["SKU"] for r in agg[0]["Item_Details"]) == ["L-1", "S-1"]


@pytest.mark.asyncio
async def test_dispatch_selected_moves_every_item_to_for_delivery_unchecked_keeps_order_aggregation(hooked_store, raw_store):
    await _add_package(raw_store, "Crate")
    id_ = await hooked_store.add_record(AGG, {"SO": "SO-1", "PAC": "PAC-1", "Item_Details": [{"Item_Name": "Lamp", "SKU": "L-1", "QTY": 2, "PAC": "PAC-1"}, {"Item_Name": "Shade", "SKU": "S-1", "QTY": 1, "PAC": "PAC-1"}]})
    assert await _stage(raw_store) == "Order Aggregation"
    await hooked_store.update_record(AGG, id_, {"Dispatch_Selected": True}, by_form=True)
    assert await _stage(raw_store) == "For Delivery"
    await hooked_store.update_record(AGG, id_, {"Dispatch_Selected": False}, by_form=True)
    assert await _stage(raw_store) == "For Delivery"  # never pulled back


def _received(extra=None):
    extra = extra or {}
    return {"SO": "SO-1", "SKU": "L-1", "Item_Name": "Lamp", "Qty": "3", "Bin_Location": "B-02", "Pre_Order_Status": "Received", "Package_Number": "PAC-1", "Status": "Partial", "Order_Type": "Pre Order", "Delivery_Type": "Delivery Only", "Customer_Name": "Sample Customer", "Customer_Address": "1 Main St", "PR": "PR-1", **extra}


@pytest.mark.asyncio
async def test_pre_order_not_received_or_no_package_number_nothing_enters_the_gate(hooked_store, raw_store):
    await hooked_store.add_record(PRE, _received({"Pre_Order_Status": "Pending"}))
    await hooked_store.add_record(PRE, _received({"Package_Number": ""}))
    assert await raw_store.find(GATE) == []


@pytest.mark.asyncio
async def test_pre_order_received_with_a_package_number_one_gate_record_saving_again_adds_none(hooked_store, raw_store):
    id_ = await hooked_store.add_record(PRE, _received())
    gates = await raw_store.find(GATE)
    assert len(gates) == 1
    assert (gates[0]["sales_order_number"], gates[0]["SKU"], gates[0]["Package_Order"], gates[0]["Quantity"], gates[0]["Bin_Location"], gates[0]["payment_status"], gates[0]["pr_number"]) == (
        "SO-1", "L-1", "PAC-1", "3", "B-02", "Partial", "PR-1",
    )
    await hooked_store.update_record(PRE, id_, {"Qty": "4", "Status": "Yes"}, by_form=True)
    gates = await raw_store.find(GATE)
    assert len(gates) == 1
    assert (gates[0]["Quantity"], gates[0]["payment_status"]) == ("4", "Yes")


@pytest.mark.asyncio
async def test_an_rr_replacement_gets_its_own_gate_record_leaves_the_original_alone(hooked_store, raw_store):
    await hooked_store.add_record(PRE, _received())
    await hooked_store.add_record(PRE, _received({"Replacement_Request": [{"RR": "RR-00001"}]}))
    gates = await raw_store.find(GATE)
    assert len(gates) == 2
    assert sorted(g.get("rr_number") or "" for g in gates) == ["", "RR-00001"]
