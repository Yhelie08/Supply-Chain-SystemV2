# Warehouse Request (spec v1.4, 03 Fulfillment / 05 Warehouse Request and Transfer, section 1).
#   WR-R2  Silence alert if not Done/Cannot do within warehouse_request_hours (default 24).
#   WR-R3  The requester is told when the request is Done.
# WR-R1 (ranked oldest first) is the widget's own sort, nothing to test server-side.
from datetime import datetime, timedelta

import pytest

from app.criteria import zoho_now
from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment  # noqa: F401
from app.fulfillment.warehouse_request import check_warehouse_request_silence

WR, NOTES = "Warehouse_Request", "App_Notifications"


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


def _ago(hours):
    return zoho_now(datetime.now() - timedelta(hours=hours))


async def _request(raw_store, **extra):
    return await raw_store.add_record(WR, {"Type_of_Request": "Actual Photo", "Request_By": "Emily", "Date_Requested": _ago(0), **extra})


# ---------------- WR-R3 ----------------
async def test_the_requester_is_told_once_the_request_is_marked_done(hooked_store, raw_store):
    id_ = await _request(raw_store, Request_By="Emily")
    await hooked_store.update_record(WR, id_, {"Request_Status": "Done"}, by_form=True)
    notes = [n for n in await raw_store.find(NOTES) if n["Notification_Type"] == "Warehouse Request Done"]
    assert len(notes) == 1 and notes[0]["Source_Record_ID"] == str(id_)
    assert "Emily" in notes[0]["Message"]


async def test_marking_done_again_does_not_tell_a_second_time(hooked_store, raw_store):
    id_ = await _request(raw_store)
    await hooked_store.update_record(WR, id_, {"Request_Status": "Done"}, by_form=True)
    await hooked_store.update_record(WR, id_, {"Remarks": "edited"}, by_form=True)
    assert len([n for n in await raw_store.find(NOTES) if n["Notification_Type"] == "Warehouse Request Done"]) == 1


async def test_marking_cannot_do_tells_nobody(hooked_store, raw_store):
    id_ = await _request(raw_store)
    await hooked_store.update_record(WR, id_, {"Request_Status": "Cannot do"}, by_form=True)
    assert [n for n in await raw_store.find(NOTES) if n["Notification_Type"] == "Warehouse Request Done"] == []


# ---------------- WR-R2 ----------------
async def test_a_request_not_decided_after_24_hours_tells_the_supervisor_once(raw_store):
    await _request(raw_store, Date_Requested=_ago(25), Request_By="Julia")
    await check_warehouse_request_silence(raw_store)
    await check_warehouse_request_silence(raw_store)   # the second run must not tell again
    notes = [n for n in await raw_store.find(NOTES) if n["Notification_Type"] == "Warehouse Request Silence"]
    assert len(notes) == 1
    assert "Julia" in notes[0]["Message"] and "Fulfillment supervisor" in notes[0]["Message"]


async def test_a_request_under_24_hours_old_gets_no_alert_yet(raw_store):
    await _request(raw_store, Date_Requested=_ago(10))
    await check_warehouse_request_silence(raw_store)
    assert [n for n in await raw_store.find(NOTES) if n["Notification_Type"] == "Warehouse Request Silence"] == []


async def test_a_done_request_is_never_silent(raw_store):
    await _request(raw_store, Date_Requested=_ago(48), Request_Status="Done")
    await check_warehouse_request_silence(raw_store)
    assert [n for n in await raw_store.find(NOTES) if n["Notification_Type"] == "Warehouse Request Silence"] == []


async def test_a_cannot_do_request_is_never_silent(raw_store):
    await _request(raw_store, Date_Requested=_ago(48), Request_Status="Cannot do")
    await check_warehouse_request_silence(raw_store)
    assert [n for n in await raw_store.find(NOTES) if n["Notification_Type"] == "Warehouse Request Silence"] == []


async def test_the_warehouse_request_hours_setting_overrides_the_default(raw_store):
    await raw_store.add_record("Policy_Settings", {"Policy_Key": "warehouse_request_hours", "Value": "48"})
    await _request(raw_store, Date_Requested=_ago(30))
    await check_warehouse_request_silence(raw_store)
    assert [n for n in await raw_store.find(NOTES) if n["Notification_Type"] == "Warehouse Request Silence"] == []   # 30h < the 48h setting
