# Exception Control -> back to Pack & QC (app/fulfillment/exception_recheck.py), and the QC that
# follows, with no duplicates.
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment.workflows  # noqa: F401
import app.fulfillment.pipeline  # noqa: F401
import app.fulfillment.qc_routing  # noqa: F401
import app.fulfillment.exception_recheck  # noqa: F401

SOF, QC, AGG, EXC = "Sales_Order_Fulfillment", "Checker_Checklist", "Order_Aggregation1", "Exception_Control1"


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


async def _excs(raw_store):
    return await raw_store.find(EXC)


async def _qcs(raw_store):
    return await raw_store.find(QC)


async def _split_two_one(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store)
    await _decide(hooked_store, id_, "Rejected", 1, {"Quantity_of_Damage_Items": "1"})
    await _decide(hooked_store, id_, "Approved", 2)
    return id_


@pytest.mark.asyncio
async def test_a_repaired_unit_goes_back_once_even_if_saved_or_completed_again(hooked_store, raw_store):
    await _split_two_one(hooked_store, raw_store)
    e1 = (await _excs(raw_store))[0]
    assert e1.get("Status") != "Completed"
    await hooked_store.update_record(EXC, e1["ID"], {"Status": "Completed"}, by_form=True)
    all_qc = await _qcs(raw_store)
    recheck = [c for c in all_qc if isinstance(c.get("Recheck_Exceptions"), list)]
    assert len(all_qc) == 2
    assert len(recheck) == 1
    assert str(recheck[0]["Quantity"]) == "1"
    assert (recheck[0].get("QC_Status") or "") == ""
    assert (recheck[0]["SO"], recheck[0]["Item_Name"], recheck[0]["Bin_Location"]) == ("SO-1", "Lamp", "A-01")
    assert (await _excs(raw_store))[0]["Sent_To_QC"] in (True, "true")

    await hooked_store.update_record(EXC, e1["ID"], {"Remarks": "saved again"}, by_form=True)
    await hooked_store.update_record(EXC, e1["ID"], {"Status": "Completed"}, by_form=True)
    assert len(await _qcs(raw_store)) == 2


@pytest.mark.asyncio
async def test_two_repaired_units_share_one_pending_qc_record_with_quantity_2(hooked_store, raw_store):
    await _add_package(raw_store)
    id_ = await _add_qc(hooked_store)
    await _decide(hooked_store, id_, "Rejected", 2, {"Quantity_of_Damage_Items": "2"})
    await _decide(hooked_store, id_, "Approved", 1)
    exc_list = await _excs(raw_store)
    assert len(exc_list) == 2
    await hooked_store.update_record(EXC, exc_list[0]["ID"], {"Status": "Completed"}, by_form=True)
    await hooked_store.update_record(EXC, exc_list[1]["ID"], {"Status": "Completed"}, by_form=True)
    recheck = [c for c in await _qcs(raw_store) if isinstance(c.get("Recheck_Exceptions"), list)]
    assert len(recheck) == 1
    assert str(recheck[0]["Quantity"]) == "2"
    assert len(recheck[0]["Recheck_Exceptions"]) == 2


@pytest.mark.asyncio
async def test_recheck_approved_joins_the_others_in_to_ship_no_second_record(hooked_store, raw_store):
    await _split_two_one(hooked_store, raw_store)
    e1 = (await _excs(raw_store))[0]
    await hooked_store.update_record(EXC, e1["ID"], {"Status": "Completed"}, by_form=True)
    recheck = next(c for c in await _qcs(raw_store) if isinstance(c.get("Recheck_Exceptions"), list))
    await _decide(hooked_store, recheck["ID"], "Approved", 1)
    agg = await raw_store.find(AGG)
    assert len(agg) == 1
    assert [(r["SKU"], str(r["QTY"])) for r in agg[0]["Item_Details"]] == [("L-1", "3")]
    assert len(await _excs(raw_store)) == 1


@pytest.mark.asyncio
async def test_recheck_rejected_again_the_same_exception_reopens_no_new_one(hooked_store, raw_store):
    await _split_two_one(hooked_store, raw_store)
    e1 = (await _excs(raw_store))[0]
    await hooked_store.update_record(EXC, e1["ID"], {"Status": "Completed"}, by_form=True)
    recheck = next(c for c in await _qcs(raw_store) if isinstance(c.get("Recheck_Exceptions"), list))
    await _decide(hooked_store, recheck["ID"], "Rejected", 1, {"Quantity_of_Damage_Items": "1"})
    list1 = await _excs(raw_store)
    assert len(list1) == 1
    assert list1[0]["Exception_Number"] == e1["Exception_Number"]
    assert list1[0]["Status"] == "Pending"
    assert list1[0].get("Sent_To_QC") not in (True, "true")
    await _decide(hooked_store, recheck["ID"], "Rejected", 1, {"Quantity_of_Damage_Items": "1"})
    assert len(await _excs(raw_store)) == 1
    await hooked_store.update_record(EXC, list1[0]["ID"], {"Status": "Completed"}, by_form=True)
    assert len([c for c in await _qcs(raw_store) if isinstance(c.get("Recheck_Exceptions"), list)]) == 2
    assert len(await _excs(raw_store)) == 1


@pytest.mark.asyncio
async def test_a_rejected_unit_of_another_qc_record_gets_its_own_exception(hooked_store, raw_store):
    await _split_two_one(hooked_store, raw_store)
    e1 = (await _excs(raw_store))[0]
    await hooked_store.update_record(EXC, e1["ID"], {"Status": "Completed"}, by_form=True)
    second = await _add_qc(hooked_store, {"Quantity": "1"})
    await _decide(hooked_store, second, "Rejected", 1, {"Quantity_of_Damage_Items": "1"})
    list2 = await _excs(raw_store)
    assert len(list2) == 2
    assert list2[0]["Exception_Number"] != list2[1]["Exception_Number"]


@pytest.mark.asyncio
async def test_a_pending_recheck_is_not_overwritten_by_a_later_pick_of_the_same_item(hooked_store, raw_store):
    await _split_two_one(hooked_store, raw_store)
    e1 = (await _excs(raw_store))[0]
    await hooked_store.update_record(EXC, e1["ID"], {"Status": "Completed"}, by_form=True)
    before = next(c for c in await _qcs(raw_store) if isinstance(c.get("Recheck_Exceptions"), list))
    await raw_store.add_record("Pick1", {"SO": "SO-1", "SKU": "L-1", "Item_Name": "Lamp", "Package_Order": "PAC-1", "Quantity_to_Pick": "5", "Marked": False})
    pick = (await raw_store.find("Pick1"))[0]
    await hooked_store.update_record("Pick1", pick["ID"], {"Marked": True}, by_form=True)
    after = await _qcs(raw_store)
    assert str(next(c for c in after if c["ID"] == before["ID"])["Quantity"]) == "1"
    assert len(after) == 3


@pytest.mark.asyncio
async def test_older_exceptions_with_no_qc_id_are_reopened_too(hooked_store, raw_store):
    await _add_package(raw_store)
    e1 = await raw_store.add_record(EXC, {"Exception_Number": "EXC-FF-00001", "Sales_Order": "SO-1", "SKU": "L-1", "PAC": "PAC-1", "Qty": 1, "Status": "Completed", "Sent_To_QC": True, "Item_Name": "Lamp"})
    e2 = await raw_store.add_record(EXC, {"Exception_Number": "EXC-FF-00002", "Sales_Order": "SO-1", "SKU": "L-1", "PAC": "PAC-1", "Qty": 1, "Status": "Completed", "Sent_To_QC": True, "Item_Name": "Lamp"})
    re_id = await raw_store.add_record(QC, {"SO": "SO-1", "PAC": "PAC-1", "SKU": "L-1", "Item_Name": "Lamp", "Quantity": "2", "Recheck_Exceptions": [e1, e2]})
    await hooked_store.update_record(QC, re_id, {"QC_Status": "Rejected", "Quantity": "2", **_evidence("Rejected")}, by_form=True)
    list1 = await _excs(raw_store)
    assert len(list1) == 2
    assert [e["Status"] for e in list1] == ["Pending", "Pending"]
    assert all(e.get("Sent_To_QC") in (False, "false") for e in list1)
    await hooked_store.update_record(QC, re_id, {"Remarks": "saved again"}, by_form=True)
    assert len(await _excs(raw_store)) == 2
    await hooked_store.update_record(EXC, e2, {"Status": "Completed"}, by_form=True)
    rechecks = [c for c in await _qcs(raw_store) if isinstance(c.get("Recheck_Exceptions"), list) and not c.get("QC_Status")]
    assert len(rechecks) == 1
    assert str(rechecks[0]["Quantity"]) == "1"
