# QC routing (app/fulfillment/qc_routing.py), with the hooked store: approved -> To Ship (or Crate
# when for crating), rejected -> Exception Control, split = both.
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment.workflows  # noqa: F401
import app.fulfillment.pipeline  # noqa: F401
import app.fulfillment.qc_routing  # noqa: F401
from app.fulfillment.where import eq

SOF, QC, AGG, CRATE, EXC = "Sales_Order_Fulfillment", "Checker_Checklist", "Order_Aggregation1", "Crate_Checklist", "Exception_Control1"


# Mandatory checks (app/fulfillment/mandatory.py): a QC save that sets Approved / Rejected has to carry its evidence.
_PHOTO = "Image_Upload_max_10_JPG_JPEG_PNG"
_CHECKS = {"Fixture_Body_Checklist": ["Walang yupi, gasgas, bitak o basag"], "LED_Checklist": ["Hindi kumukurap ang bulb"], "Uniformity": ["Kapag marami ang ilaw dapat pare-parehas ang sukat"]}


def _evidence(qc_status):
    if qc_status == "Approved":
        return {**_CHECKS, _PHOTO: "/uploads/1_lamp.jpg", "Signature": "/uploads/2_sig.png"}
    if qc_status == "Rejected":
        return {"Remarks": "Damaged", _PHOTO: "/uploads/1_lamp.jpg"}
    return {}


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _add_package(raw_store):
    return await raw_store.add_record(SOF, {"SO_No": "SO-1", "Fulfillment_Stage": "Pack & QC", "Package": "PAC-1", "Item_Details1": [{"Item": "Lamp", "SKU": "L-1", "Quantity": "3"}]})


async def _add_qc(hooked_store, extra=None):
    extra = extra or {}
    return await hooked_store.add_record(QC, {"SO": "SO-1", "PAC": "PAC-1", "SKU": "L-1", "Item_Name": "Lamp", "Quantity": "3", "Bin_Location": "A-01", "Customer_Name": "Sample Customer", "Customer_Address": "1 Main St", "Order_Type": "Normal", "Delivery_Type": "Delivery Only", **extra})


async def _decide(hooked_store, id_, qc_status, quantity, extra=None):
    extra = extra or {}
    await hooked_store.update_record(QC, id_, {"QC_Status": qc_status, "Quantity": str(quantity), **_evidence(qc_status), **extra}, by_form=True)


async def _stage(raw_store):
    return (await raw_store.find(SOF))[0]["Fulfillment_Stage"]


@pytest.mark.asyncio
async def test_approved_not_for_crating_one_to_ship_record_with_the_approved_quantity(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store)
    await _decide(hooked_store, id_, "Approved", 3)
    agg = await raw_store.find(AGG)
    assert len(agg) == 1
    assert agg[0]["SO"] == "SO-1"
    assert [(r["SKU"], str(r["QTY"]), r["PAC"], r["Bin_Location"]) for r in agg[0]["Item_Details"]] == [("L-1", "3", "PAC-1", "A-01")]
    assert await raw_store.find(CRATE) == []
    assert await raw_store.find(EXC) == []
    assert await _stage(raw_store) == "Order Aggregation"


@pytest.mark.asyncio
async def test_approved_and_for_crating_goes_to_crate_not_to_ship(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store, {"For_Crate": True})
    await _decide(hooked_store, id_, "Approved", 3, {"Quality_Checker": "Kurt"})
    crate = await raw_store.find(CRATE)
    assert len(crate) == 1
    assert (crate[0]["SO"], crate[0]["Package_Order"], str(crate[0]["Quantity"]), crate[0]["Assigned_Checker"]) == ("SO-1", "PAC-1", "3", "Kurt")
    assert await raw_store.find(AGG) == []
    assert await _stage(raw_store) == "Crate"


@pytest.mark.asyncio
async def test_rejected_one_exception_record_per_unit_numbered(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store)
    await _decide(hooked_store, id_, "Rejected", 2, {"Remarks": "Cracked glass"})
    exc = await raw_store.find(EXC)
    assert len(exc) == 2
    assert sorted(e["Exception_Number"] for e in exc) == ["EXC-FF-00001", "EXC-FF-00002"]
    assert all(e["Sales_Order"] == "SO-1" and e["SKU"] == "L-1" and e["PAC"] == "PAC-1" and str(e["Qty"]) == "1" and e["Remarks"] == "Cracked glass" for e in exc)
    assert len(await raw_store.find(AGG)) + len(await raw_store.find(CRATE)) == 0


@pytest.mark.asyncio
async def test_split_3_units_2_pass_1_fails(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store)
    await _decide(hooked_store, id_, "Rejected", 1)
    await _decide(hooked_store, id_, "Approved", 2, {"Split_Rejected_Qty": "1", "Split_Original_Qty": "3"})
    assert len(await raw_store.find(EXC)) == 1
    agg = await raw_store.find(AGG)
    assert len(agg) == 1
    assert str(agg[0]["Item_Details"][0]["QTY"]) == "2"


@pytest.mark.asyncio
async def test_saving_the_same_decision_again_adds_nothing(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store)
    await _decide(hooked_store, id_, "Rejected", 1)
    await _decide(hooked_store, id_, "Rejected", 1)
    await _decide(hooked_store, id_, "Approved", 2)
    await _decide(hooked_store, id_, "Approved", 2)
    assert len(await raw_store.find(EXC)) == 1
    agg = await raw_store.find(AGG)
    assert len(agg) == 1
    assert len(agg[0]["Item_Details"]) == 1
    assert str(agg[0]["Item_Details"][0]["QTY"]) == "2"


@pytest.mark.asyncio
async def test_a_later_batch_adds_to_to_ship_a_different_item_adds_a_row(hooked_store, raw_store):
    await _add_package(raw_store)
    a = await _add_qc(hooked_store, {"Quantity": "2"})
    await _decide(hooked_store, a, "Approved", 2)
    b = await _add_qc(hooked_store, {"Quantity": "1"})
    await _decide(hooked_store, b, "Approved", 1)
    c = await _add_qc(hooked_store, {"SKU": "S-1", "Item_Name": "Shade", "Quantity": "5"})
    await _decide(hooked_store, c, "Approved", 5)
    agg = (await raw_store.find(AGG))
    assert len(agg) == 1
    rows = {r["SKU"]: str(r["QTY"]) for r in agg[0]["Item_Details"]}
    assert rows == {"L-1": "3", "S-1": "5"}


@pytest.mark.asyncio
async def test_pending_or_blank_status_does_nothing(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store)
    await hooked_store.update_record(QC, id_, {"Remarks": "draft"}, by_form=True)
    assert len(await raw_store.find(AGG)) + len(await raw_store.find(CRATE)) + len(await raw_store.find(EXC)) == 0
    assert await _stage(raw_store) == "Pack & QC"


@pytest.mark.asyncio
async def test_find_with_criteria_reads_only_matching_rows(raw_store):
    await raw_store.add_record(AGG, {"SO": "SO-A", "PAC": "PAC-A", "Item_Details": []})
    await raw_store.add_record(AGG, {"SO": "SO-B", "PAC": "PAC-B", "Item_Details": []})
    assert len(await raw_store.find(AGG)) == 2
    assert [r["SO"] for r in await raw_store.find(AGG, criteria=eq("SO", "SO-A"))] == ["SO-A"]
    assert await raw_store.find(AGG, criteria=eq("SO", 'a "quoted" \\ value')) == []
    assert [r["SO"] for r in await raw_store.find(AGG, lambda r: r["SO"] == "SO-B", criteria='(NoSuchField == "x")')] == ["SO-B"]
