# Transfer, WH1 Banawe <-> WH3 Baesa (spec v1.4, 03 Fulfillment / 05 Warehouse Request and Transfer, section 2, TR-R2).
#   Sent stamps when the sender confirms loading (Dispatch checked).
#   Received stamps when the receiver confirms quantities (Quantities_Match) and signs (Receiver_Signature).
#   Differences (Quantities_Match unchecked) create an exception, in the general Exceptions log.
import pytest

from app.criteria import ZohoError
from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment  # noqa: F401

TRANSFER, EXC = "Transfer_Warehouse", "Exceptions"


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _transfer(raw_store, **extra):
    return await raw_store.add_record(TRANSFER, {"From_Warehouse": "HC WH1 BANAWE", "To_Warehouse": "HC WH3 BAESA",
                                                  "Item_to_transfer": [{"SKU": "L-1", "Quantity": "5"}], **extra})


async def _refused(hooked_store, id_, data) -> str:
    with pytest.raises(ZohoError) as e:
        await hooked_store.update_record(TRANSFER, id_, data, by_form=True)
    return e.value.message


async def test_dispatch_stamps_sent_at(hooked_store, raw_store):
    id_ = await _transfer(raw_store)
    await hooked_store.update_record(TRANSFER, id_, {"Dispatch": True}, by_form=True)
    r = await raw_store.get_record_by_id(TRANSFER, id_, raw=True)
    assert r["Sent_At"]


async def test_received_needs_a_signature_and_either_a_match_or_notes(hooked_store, raw_store):
    id_ = await _transfer(raw_store)
    msg = await _refused(hooked_store, id_, {"Received": True})
    assert "signature" in msg and "discrepancy notes" in msg


async def test_received_with_signature_and_quantities_match_is_accepted_no_exception(hooked_store, raw_store):
    id_ = await _transfer(raw_store)
    await hooked_store.update_record(TRANSFER, id_, {"Received": True, "Receiver_Signature": "/uploads/sig.png", "Quantities_Match": True}, by_form=True)
    r = await raw_store.get_record_by_id(TRANSFER, id_, raw=True)
    assert r["Received_At"]
    assert await raw_store.find(EXC) == []


async def test_received_with_signature_but_no_match_needs_discrepancy_notes(hooked_store, raw_store):
    id_ = await _transfer(raw_store)
    msg = await _refused(hooked_store, id_, {"Received": True, "Receiver_Signature": "/uploads/sig.png"})
    assert "discrepancy notes" in msg and "signature" not in msg


async def test_a_mismatch_with_notes_is_accepted_and_opens_one_exception(hooked_store, raw_store):
    id_ = await _transfer(raw_store)
    await hooked_store.update_record(TRANSFER, id_, {
        "Received": True, "Receiver_Signature": "/uploads/sig.png", "Quantities_Match": False, "Discrepancy_Notes": "2 short on L-1",
    }, by_form=True)
    r = await raw_store.get_record_by_id(TRANSFER, id_, raw=True)
    assert r["Received_At"]
    exc = await raw_store.find(EXC)
    assert len(exc) == 1
    assert exc[0]["Source_Module"] == "Transfer" and exc[0]["Exception_Description"] == "2 short on L-1"
    assert "HC WH1 BANAWE" in exc[0]["Exception_Title"] and "HC WH3 BAESA" in exc[0]["Exception_Title"]


async def test_a_later_save_of_an_already_received_transfer_is_not_checked_again(hooked_store, raw_store):
    id_ = await _transfer(raw_store, Received=True, Received_At="2026-01-01 09:00:00 AM")
    await hooked_store.update_record(TRANSFER, id_, {"Received": True}, by_form=True)   # no signature on the record at all
    assert await raw_store.find(EXC) == []


async def test_a_pending_transfer_needs_no_evidence(hooked_store, raw_store):
    id_ = await _transfer(raw_store)
    await hooked_store.update_record(TRANSFER, id_, {"Discrepancy_Notes": "note so far"}, by_form=True)


async def test_the_new_columns_exist(raw_store):
    id_ = await raw_store.add_record(TRANSFER, {"Receiver_Signature": "/uploads/sig.png", "Quantities_Match": True, "Discrepancy_Notes": "x"})
    r = await raw_store.get_record_by_id(TRANSFER, id_, raw=True)
    assert r["Receiver_Signature"] == "/uploads/sig.png" and r["Discrepancy_Notes"] == "x"
