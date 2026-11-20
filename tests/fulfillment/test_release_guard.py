# The single Release (a Gate row saved with Release checked) refuses a Blocked package (spec v1.4, 03 Fulfillment / 02 Order Readiness, OR-R1:
# a Blocked package is "not in the work list"; OR-R4: the supervisor may release beyond the capacity line, which is a different thing).
# Owner decision 2026-11-20: follow the document, so the single button is as strict as "Release selected" / "Release all suggested".
import pytest

from app.criteria import ZohoError
from app.fulfillment.sorter import rescore_all
from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment  # noqa: F401  (wires every Fulfillment hook)

SOF, GATE, PICK, EXC = "Sales_Order_Fulfillment", "Sales_Order_Readiness_Gate", "Pick1", "Exception_Control1"
LAMP = {"Item": "Lamp", "SKU": "L-1", "Quantity": "2", "Bin_Location": "A-01"}


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _package(hooked_store, so="SO-1", **extra):
    return await hooked_store.add_record(SOF, {
        "SO_No": so, "Fulfillment_Stage": "Waiting For Package", "Package": f"PAC-{so}", "Status": "Yes", "Customer_Type": "Corporate",
        "Delivery_Type": "Delivery Only", "order_type": "Normal", "Shipping_Address": "1 Main St", "Contact_No": "0917 000 0000", "Item_Details1": [LAMP], **extra})


async def _gate(raw_store, so="SO-1"):
    return next(g for g in await raw_store.find(GATE) if g["sales_order_number"] == so)


def _released(g):
    return g["Release"] in (True, "true")


@pytest.mark.asyncio
async def test_a_package_with_an_open_exception_cannot_be_released_and_the_message_says_why(hooked_store, raw_store):
    await _package(hooked_store)
    await raw_store.add_record(EXC, {"Sales_Order": "SO-1", "SKU": "L-1", "PAC": "PAC-SO-1", "Item_Name": "Lamp", "Status": "Pending"})
    await rescore_all(raw_store)
    gate = await _gate(raw_store)
    with pytest.raises(ZohoError) as e:
        await hooked_store.update_record(GATE, gate["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    assert e.value.code == 3100
    assert "Blocked" in str(e.value) and "Open exception" in str(e.value) and "SO-1" in str(e.value)
    assert not _released(await _gate(raw_store))
    assert await raw_store.find(PICK) == []


@pytest.mark.asyncio
async def test_a_package_with_no_contact_cannot_be_released(hooked_store, raw_store):
    await _package(hooked_store, Contact_No="")
    await rescore_all(raw_store)
    with pytest.raises(ZohoError) as e:
        await hooked_store.update_record(GATE, (await _gate(raw_store))["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    assert "Blocked" in str(e.value)
    assert await raw_store.find(PICK) == []


@pytest.mark.asyncio
async def test_a_workable_package_is_released_as_before(hooked_store, raw_store):
    await _package(hooked_store)
    await hooked_store.update_record(GATE, (await _gate(raw_store))["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    assert _released(await _gate(raw_store))
    assert len(await raw_store.find(PICK)) == 1


@pytest.mark.asyncio
async def test_a_stale_blocked_mark_is_checked_again_before_refusing(hooked_store, raw_store):
    # the exception was closed but nothing re-scored yet: the Blocked mark on the package is old. The guard re-scores, sees it is fine, releases.
    await _package(hooked_store)
    exc = await raw_store.add_record(EXC, {"Sales_Order": "SO-1", "SKU": "L-1", "PAC": "PAC-SO-1", "Item_Name": "Lamp", "Status": "Pending"})
    await rescore_all(raw_store)
    assert (await raw_store.find(SOF))[0]["Category"] == "blocked"
    await raw_store.update_record(EXC, exc, {"Status": "Completed"}, by_form=True)   # raw write: no re-score
    assert (await raw_store.find(SOF))[0]["Category"] == "blocked"
    await hooked_store.update_record(GATE, (await _gate(raw_store))["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    assert _released(await _gate(raw_store))


@pytest.mark.asyncio
async def test_saving_an_already_released_row_is_never_refused_even_if_the_package_is_blocked_now(hooked_store, raw_store):
    await _package(hooked_store)
    gate = await _gate(raw_store)
    await hooked_store.update_record(GATE, gate["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    await raw_store.add_record(EXC, {"Sales_Order": "SO-1", "SKU": "L-1", "PAC": "PAC-SO-1", "Item_Name": "Lamp", "Status": "Pending"})
    await rescore_all(raw_store)
    await hooked_store.update_record(GATE, gate["ID"], {"Assign_Picker": "Jazz"}, by_form=True)   # a later edit of a released row: only the change to Released is checked
    assert (await _gate(raw_store))["Assign_Picker"] == "Jazz"


@pytest.mark.asyncio
async def test_a_package_that_was_never_scored_is_not_refused(hooked_store, raw_store):
    # a Gate row with no package record behind it (or one not scored yet) has no Blocked mark to go by: the old behaviour stays
    gate_id = await raw_store.add_record(GATE, {"sales_order_number": "SO-NOSOF", "Package_Order": "PAC-X", "SKU": "L-1", "Item_Name": "Lamp", "payment_status": "Yes"})
    await hooked_store.update_record(GATE, gate_id, {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    assert _released(await raw_store.get_record_by_id(GATE, gate_id, raw=True))


@pytest.mark.asyncio
async def test_the_widget_call_gets_code_3100_and_the_message(hooked_store, raw_store):
    # what the Order Readiness widget receives through updateRecords: the ZohoError becomes {"code": 3100, "message": ...}
    await _package(hooked_store)
    await raw_store.add_record(EXC, {"Sales_Order": "SO-1", "SKU": "L-1", "PAC": "PAC-SO-1", "Item_Name": "Lamp", "Status": "Pending"})
    await rescore_all(raw_store)
    with pytest.raises(ZohoError) as e:
        await hooked_store.update_record(GATE, (await _gate(raw_store))["ID"], {"Release": True, "Assign_Picker": "Hendel"}, by_form=True)
    assert (e.value.code, "Cannot release" in str(e.value)) == (3100, True)
