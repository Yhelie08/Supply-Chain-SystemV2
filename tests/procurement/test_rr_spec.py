import pytest
from app.deluge import add_days, ymd, today_date
from app.procurement.rr_spec import target_for, run_rr_daily, get_rr_report

TODAY = today_date()


def day(n: int) -> str:
    return ymd(add_days(TODAY, n))


# Node: 'RR-R3: the RR has a Target Delivery (the original one if it is still ahead, else today + 21) and the original Order Date'
def test_target_for_keeps_the_original_target_when_still_ahead():
    assert target_for(day(30), {"rr_default_days": 21}, TODAY) == day(30)


def test_target_for_falls_back_to_today_plus_rr_default_days_when_the_original_has_passed():
    assert target_for(day(-5), {"rr_default_days": 21}, TODAY) == day(21)


def test_target_for_with_no_original_target_uses_rr_default_days():
    assert target_for("", {"rr_default_days": 10}, TODAY) == day(10)


# Node: 'an RR the supplier has not acknowledged after 1 day raises one alert for the buyer'
@pytest.mark.asyncio
async def test_run_rr_daily_alerts_once_for_an_rr_open_more_than_1_day(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store

    await ensure_schema(db_conn)
    store = create_store(db_conn)

    async def mk(no, status, ago):
        await store.add_record("Replacement_Request", {"RR_No": no, "RR_Status": status, "RR_Date": day(-ago), "RR_Supplier": "Fenteng Lighting"})

    await mk("RR-00001", "Open", 3)
    await mk("RR-00002", "Open", 0)
    await mk("RR-00003", "Acknowledged", 5)
    r1 = await run_rr_daily(store)
    assert r1["alerted"] == 1
    notes = await store.find("App_Notifications", lambda n: n.get("Notification_Type") == "RR Not Acknowledged")
    assert len(notes) == 1
    assert "RR-00001 (Fenteng Lighting) has not been acknowledged after 1 day" in notes[0]["Message"]
    r2 = await run_rr_daily(store)
    assert r2["alerted"] == 0, "once"


# Node: 'RR-R6: the monthly report counts replacements by cause, fault origin and supplier'
@pytest.mark.asyncio
async def test_get_rr_report_counts_by_cause_fault_origin_and_supplier(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    month = day(0)[:7]
    await store.add_record("Exceptions", {"Exception_No": "EXC-1", "Fault_Origin": "supplier"})
    await store.add_record("Exceptions", {"Exception_No": "EXC-2", "Fault_Origin": "transit"})

    async def mk(no, type_, exc, sup, orig=None):
        await store.add_record("Replacement_Request", {"RR_No": no, "RR_Date": day(0), "Source_Type": type_, "Source_Exception_No": exc, "RR_Supplier": sup, "Original_Supplier": orig or sup})

    await mk("RR-1", "Receiving Damage", "EXC-1", "Tony Fan")
    await mk("RR-2", "Receiving Damage", "EXC-2", "Tony")
    await mk("RR-3", "Receiving Missing", "EXC-1", "HC System", "Tony Fan")
    await store.add_record("Replacement_Request", {"RR_No": "RR-OLD", "RR_Date": "2020-01-01", "Source_Type": "QC Failure"})
    r = (await get_rr_report({"month": month}, store))["data"]
    assert r["total"] == 3
    assert r["by_cause"] == [{"name": "Damage", "count": 2}, {"name": "Missing part", "count": 1}]
    assert r["by_fault_origin"] == [{"name": "supplier", "count": 2}, {"name": "transit", "count": 1}]
    assert r["by_supplier"] == [{"name": "Tony Fan", "count": 2}, {"name": "HC System", "count": 1}]
    assert r["changed_supplier"] == 1
    assert r["rework"]["rate"] is None, "no packages this month: no rate"


@pytest.mark.asyncio
async def test_rr_created_logs_an_rr_created_event_once(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.workflows import create_hooked_store
    import app.procurement.rr_spec  # noqa: F401

    await ensure_schema(db_conn)
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    rr_id = await store.add_record("Replacement_Request", {"RR_No": "RR-5", "RR_Supplier": "Tony Fan"})
    events = await raw.find("Stage_Events", lambda r: r.get("Record_Id") == str(rr_id))
    assert [e["Event"] for e in events] == ["rr.created"]
    # saving again does not duplicate the event
    await store.update_record("Replacement_Request", rr_id, {"RR_Status": "Open"}, by_form=True)
    events2 = await raw.find("Stage_Events", lambda r: r.get("Record_Id") == str(rr_id) and r.get("Event") == "rr.created")
    assert len(events2) == 1


@pytest.mark.asyncio
async def test_server_only_fields_are_dropped_from_a_widget_write(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.workflows import create_hooked_store
    import app.procurement.rr_spec  # noqa: F401

    await ensure_schema(db_conn)
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    rr_id = await store.add_record("Replacement_Request", {"RR_No": "RR-6", "Order_Date": "2020-01-01"})
    row = await raw.get_record_by_id("Replacement_Request", rr_id, raw=True)
    assert row.get("Order_Date") in (None, "")
