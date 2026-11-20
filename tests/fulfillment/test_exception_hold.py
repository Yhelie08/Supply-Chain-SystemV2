# FS-3 (spec v1.4, 03 Fulfillment / 03 Pick, QC, Rework and Crate): "an open exception holds the package".
# Owner decision 2026-11-20: while a package has an open exception (Pending / In Rework / blank status), the server refuses
#   Pick  -> Mark as Picked,   Crate -> Crating Done,   To Ship -> Dispatch Selected.
# Not refused: fixing the exception itself, and QC (Approved and Rejected): a QC split saves the rejected units first (that makes the
# exception) and then the approved units of the same package, so refusing Approved broke the split flow (11 existing tests failed). The single Release already refuses
# a Blocked package (release_guard.py). An exception of ANOTHER package of the same sales order does not hold this one.
import pytest

from app.criteria import ZohoError
from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment  # noqa: F401  (wires every Fulfillment hook)

SOF, PICK, QC, CRATE, AGG, EXC = "Sales_Order_Fulfillment", "Pick1", "Checker_Checklist", "Crate_Checklist", "Order_Aggregation1", "Exception_Control1"
PHOTO = "Image_Upload_max_10_JPG_JPEG_PNG"
LAMP = {"Item": "Lamp", "SKU": "L-1", "Quantity": "2", "Bin_Location": "A-01"}
OK_QC = {"QC_Status": "Approved", "Fixture_Body_Checklist": ["Finish OK"], "LED_Checklist": ["Lights up"], "Uniformity": ["Even"], PHOTO: "p.png", "Signature": "s.png"}
OK_CRATE = {"Crating_Status1": "Done", "Crating_Checklist": ["Padded"], "Photo_Documentation": "c.png", "Crate_Weight_Kg": "12", "Crate_Dimensions_Cm": "50x40x30"}


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _package(raw_store, so="SO-1"):
    await raw_store.add_record(SOF, {"SO_No": so, "Fulfillment_Stage": "Pack & QC", "Package": f"PAC-{so}", "Status": "Yes", "Item_Details1": [LAMP]})


async def _exception(raw_store, so="SO-1", pac="PAC-SO-1", status="Pending"):
    data = {"Sales_Order": so, "SKU": "L-1", "PAC": pac, "Item_Name": "Lamp", "Exception_Number": "EXC-FF-00001"}
    if status is not None:
        data["Status"] = status
    return await raw_store.add_record(EXC, data)


async def _pick(raw_store):
    return await raw_store.add_record(PICK, {"SO": "SO-1", "Package_Order": "PAC-SO-1", "SKU": "L-1", "Item_Name": "Lamp", "Marked": False})


async def _qc(raw_store):
    return await raw_store.add_record(QC, {"SO": "SO-1", "PAC": "PAC-SO-1", "SKU": "L-1", "Item_Name": "Lamp", "Quantity": "2"})


async def _crate(raw_store):
    return await raw_store.add_record(CRATE, {"SO": "SO-1", "Package_Order": "PAC-SO-1", "SKU": "L-1", "Item_Name": "Lamp", "Quantity": "2"})


async def _agg(raw_store):
    return await raw_store.add_record(AGG, {"SO": "SO-1", "PAC": "PAC-SO-1", "Item_Details": [{"Item_Name": "Lamp", "SKU": "L-1", "PAC": "PAC-SO-1"}]})


def _id(r):
    return r["ID"] if isinstance(r, dict) else r


async def _refused(coro):
    with pytest.raises(ZohoError) as e:
        await coro
    assert e.value.code == 3100
    msg = str(e.value)
    assert "open exception" in msg and "SO-1" in msg and "EXC-FF-00001" in msg
    return msg


@pytest.mark.asyncio
async def test_mark_as_picked_is_refused_while_the_package_has_an_open_exception(hooked_store, raw_store):
    await _package(raw_store)
    pick = _id(await _pick(raw_store))
    await _exception(raw_store)
    await _refused(hooked_store.update_record(PICK, pick, {"Marked": True}, by_form=True))
    assert (await raw_store.get_record_by_id(PICK, str(pick), raw=True))["Marked"] in (False, "false", None)
    assert await raw_store.find(QC) == []   # nothing went on to QC


@pytest.mark.asyncio
async def test_qc_approved_is_not_refused_so_a_split_can_send_its_approved_units_on(hooked_store, raw_store):
    await _package(raw_store)
    qc = _id(await _qc(raw_store))
    await _exception(raw_store, status="In Rework")
    await hooked_store.update_record(QC, qc, OK_QC, by_form=True)
    assert (await raw_store.get_record_by_id(QC, str(qc), raw=True))["QC_Status"] == "Approved"


@pytest.mark.asyncio
async def test_qc_rejected_is_not_refused_by_the_hold(hooked_store, raw_store):
    await _package(raw_store)
    qc = _id(await _qc(raw_store))
    await _exception(raw_store)
    await hooked_store.update_record(QC, qc, {"QC_Status": "Rejected", "Remarks": "Scratched", PHOTO: "p.png"}, by_form=True)
    assert (await raw_store.get_record_by_id(QC, str(qc), raw=True))["QC_Status"] == "Rejected"


@pytest.mark.asyncio
async def test_crating_done_is_refused_while_the_package_has_an_open_exception(hooked_store, raw_store):
    await _package(raw_store)
    crate = _id(await _crate(raw_store))
    await _exception(raw_store, status=None)   # a blank status counts as Pending
    await _refused(hooked_store.update_record(CRATE, crate, OK_CRATE, by_form=True))
    assert await raw_store.find(AGG) == []   # nothing went to To Ship


@pytest.mark.asyncio
async def test_dispatch_is_refused_while_the_package_has_an_open_exception(hooked_store, raw_store):
    await _package(raw_store)
    agg = _id(await _agg(raw_store))
    await _exception(raw_store)
    await _refused(hooked_store.update_record(AGG, agg, {"Dispatch_Selected": True}, by_form=True))


@pytest.mark.asyncio
async def test_the_same_steps_work_when_the_exception_is_closed(hooked_store, raw_store):
    await _package(raw_store)
    pick, qc, crate, agg = [_id(await f(raw_store)) for f in (_pick, _qc, _crate, _agg)]
    await _exception(raw_store, status="Completed")
    await hooked_store.update_record(PICK, pick, {"Marked": True}, by_form=True)
    await hooked_store.update_record(QC, qc, OK_QC, by_form=True)
    await hooked_store.update_record(CRATE, crate, OK_CRATE, by_form=True)
    await hooked_store.update_record(AGG, agg, {"Dispatch_Selected": True}, by_form=True)


@pytest.mark.asyncio
async def test_an_exception_of_another_package_of_the_same_order_does_not_hold_this_one(hooked_store, raw_store):
    await _package(raw_store)
    pick = _id(await _pick(raw_store))
    await _exception(raw_store, pac="PAC-OTHER")
    await hooked_store.update_record(PICK, pick, {"Marked": True}, by_form=True)


@pytest.mark.asyncio
async def test_an_exception_of_another_order_does_not_hold_this_one(hooked_store, raw_store):
    await _package(raw_store)
    pick = _id(await _pick(raw_store))
    await _exception(raw_store, so="SO-2", pac="PAC-SO-2")
    await hooked_store.update_record(PICK, pick, {"Marked": True}, by_form=True)


@pytest.mark.asyncio
async def test_only_the_save_that_makes_the_step_is_refused_not_a_later_edit(hooked_store, raw_store):
    # a Pick row that was already Marked before an exception was opened is not blocked for an unrelated edit
    await _package(raw_store)
    pick = _id(await raw_store.add_record(PICK, {"SO": "SO-1", "Package_Order": "PAC-SO-1", "SKU": "L-1", "Item_Name": "Lamp", "Marked": True}))
    await _exception(raw_store)
    await hooked_store.update_record(PICK, pick, {"Remarks": "note"}, by_form=True)


@pytest.mark.asyncio
async def test_the_exception_itself_can_still_be_fixed_while_open(hooked_store, raw_store):
    await _package(raw_store)
    exc = _id(await _exception(raw_store))
    await hooked_store.update_record(EXC, exc, {"Status": "Completed"}, by_form=True)
    assert (await raw_store.get_record_by_id(EXC, str(exc), raw=True))["Status"] == "Completed"


# ---- To Ship: item-by-item (partial) dispatch, and the pre-check the To Ship widget makes before it creates anything in Delivery ----
async def _agg_two_items(raw_store, dispatched=(False, False)):
    rows = [{"Item_Name": "Lamp", "SKU": "L-1", "PAC": "PAC-SO-1", "Dispatched": dispatched[0], "Select1": False},
            {"Item_Name": "Shade", "SKU": "S-1", "PAC": "PAC-SO-1", "Dispatched": dispatched[1], "Select1": False}]
    return rows, _id(await raw_store.add_record(AGG, {"SO": "SO-1", "PAC": "PAC-SO-1", "Item_Details": rows}))


@pytest.mark.asyncio
async def test_dispatching_one_item_of_a_package_is_refused_while_it_has_an_open_exception(hooked_store, raw_store):
    # the To Ship widget dispatches item by item (Dispatched on the row); Dispatch_Selected only turns on when ALL are done
    await _package(raw_store)
    rows, agg = await _agg_two_items(raw_store)
    await _exception(raw_store)
    await _refused(hooked_store.update_record(AGG, agg, {"Item_Details": [{**rows[0], "Dispatched": True}, rows[1]]}, by_form=True))


@pytest.mark.asyncio
async def test_dispatching_one_item_works_without_an_open_exception_and_an_earlier_dispatch_is_not_refused_later(hooked_store, raw_store):
    await _package(raw_store)
    rows, agg = await _agg_two_items(raw_store, dispatched=(True, False))   # the Lamp was dispatched before the exception was opened
    await _exception(raw_store)
    # an edit that leaves the Lamp as dispatched and changes nothing else about dispatching is not refused
    await hooked_store.update_record(AGG, agg, {"Item_Details": [{**rows[0], "Select1": False}, rows[1]]}, by_form=True)


@pytest.mark.asyncio
async def test_the_hold_check_api_says_held_and_why_before_anything_is_created(raw_store):
    from app.fulfillment.exception_hold import exception_hold_check
    await _package(raw_store)
    assert await exception_hold_check({"so": "SO-1", "pacs": ["PAC-SO-1"]}, raw_store, {}) == {"status": "success", "held": False, "message": ""}
    await _exception(raw_store)
    res = await exception_hold_check({"so": "SO-1", "pacs": ["PAC-SO-1"]}, raw_store, {})
    assert res["status"] == "success" and res["held"] is True
    assert "Cannot dispatch SO-1" in res["message"] and "EXC-FF-00001" in res["message"]
    other = await exception_hold_check({"so": "SO-1", "pacs": ["PAC-OTHER"]}, raw_store, {})   # another package of the order is not held
    assert other["held"] is False
    assert (await exception_hold_check({}, raw_store, {}))["held"] is False   # nothing to check is not an error
