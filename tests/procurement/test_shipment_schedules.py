import pytest
from datetime import datetime


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


# Node: '10-day check: a shipment with 10 days or less is notified once; more days, a blank count, or already notified is not'
@pytest.mark.asyncio
async def test_10_day_check_notifies_once_for_near_shipments(raw):
    from app.procurement.shipment_schedules import run_shipment_10_day_check
    near = await raw.add_record("Shipments", {"Shipment_No": "SHP-00001", "Remaining_Days": 6})
    await raw.add_record("Shipments", {"Shipment_No": "SHP-00002", "Remaining_Days": 30})
    await raw.add_record("Shipments", {"Shipment_No": "SHP-00003"})
    await raw.add_record("Shipments", {"Shipment_No": "SHP-00004", "Remaining_Days": 2, "Notified_10d": True})
    assert await run_shipment_10_day_check(raw) == {"notified": 1}
    n = (await raw.find("App_Notifications"))[0]
    assert n["Message"] == "Shipment SHP-00001 has 6 day(s) left on its timeline."
    assert str(n["Source_Record_ID"]) == str(near)
    assert await run_shipment_10_day_check(raw) == {"notified": 0}, "told once"


# Node: 'delay status: past the arrival date is Delayed, within 7 days is "Arriving in 1 Week"; Delivered and far-off shipments are left alone'
@pytest.mark.asyncio
async def test_delay_status_sets_delayed_and_arriving_soon(raw):
    from app.procurement.shipment_schedules import run_shipment_delay_status

    async def mk(no, eta, status="In Transit"):
        await raw.add_record("Shipments", {"Shipment_No": no, "Estimated_Warehouse_Arrival": eta, "Shipment_Status": status})

    await mk("A", "2026-11-10")
    await mk("B", "2026-11-20")
    await mk("C", "2026-12-30")
    await mk("D", "2026-11-01", "Delivered")
    await mk("E", "")
    counts = await run_shipment_delay_status(raw, today=datetime(2026, 11, 17).date())
    assert counts == {"delayed": 1, "arriving": 1, "skippedDelivered": 1, "checked": 3, "changed": 2}
    status = {s["Shipment_No"]: s["Shipment_Status"] for s in await raw.find("Shipments")}
    assert status == {"A": "Delayed", "B": "Arriving in 1 Week", "C": "In Transit", "D": "Delivered", "E": "In Transit"}
    # the test date in Schedule_Test_Settings wins over today
    await raw.add_record("Schedule_Test_Settings", {"Test_Current_Date": "2027-01-05"})
    await run_shipment_delay_status(raw, today=datetime(2026, 11, 17).date())
    c = next(s for s in await raw.find("Shipments") if s["Shipment_No"] == "C")
    assert c["Shipment_Status"] == "Delayed"
