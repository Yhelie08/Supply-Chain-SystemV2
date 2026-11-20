import pytest
from app.deluge import add_days, ymd, today_date
from app.criteria import ZohoError
from app.procurement.ship_track import apply_shipment_event, report_shipment_delay

TODAY = today_date()


def day(n: int) -> str:
    return ymd(add_days(TODAY, n))


# Node: 'Report_Event stores the stamp once, with when it happened and when we were told'
@pytest.mark.asyncio
async def test_apply_shipment_event_production_started_stamps_once_and_logs(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    ship_id = await store.add_record("Shipments", {"Shipment_No": "SHP-T1"})
    await apply_shipment_event(store, ship_id, "production_started", occurred_at=day(-3), source="supplier")
    s = await store.get_record_by_id("Shipments", ship_id, raw=True)
    assert s["Production_Started_At"] == day(-3)
    assert s["Last_Supplier_Update_At"]
    # reported again: the stamp on the shipment stays the first one (T-6)
    await apply_shipment_event(store, ship_id, "production_started", occurred_at=day(-1))
    s2 = await store.get_record_by_id("Shipments", ship_id, raw=True)
    assert s2["Production_Started_At"] == day(-3), "never overwritten"


# Node: 'an event cannot have happened in the future, and a bad date is refused'
@pytest.mark.asyncio
async def test_apply_shipment_event_rejects_a_future_or_unparseable_date(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    ship_id = await store.add_record("Shipments", {"Shipment_No": "SHP-T2"})
    with pytest.raises(ZohoError, match="future"):
        await apply_shipment_event(store, ship_id, "production_started", occurred_at=day(2))
    with pytest.raises(ZohoError, match="not a date"):
        await apply_shipment_event(store, ship_id, "production_started", occurred_at="yesterday")


# Node: 'leaving Production needs a production photo (ST-R3)'
@pytest.mark.asyncio
async def test_apply_shipment_event_shipped_out_requires_a_production_photo(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    ship_id = await store.add_record("Shipments", {"Shipment_No": "SHP-T3"})
    with pytest.raises(ZohoError, match="production photo"):
        await apply_shipment_event(store, ship_id, "shipped_out", occurred_at=day(-1), gate=True)
    await store.update_record("Shipments", ship_id, {"Production_Photos": ["p1.jpg"]})
    await apply_shipment_event(store, ship_id, "shipped_out", occurred_at=day(-1), gate=True)
    s = await store.get_record_by_id("Shipments", ship_id, raw=True)
    assert s["Stage"] == "shipped_out"
    assert s["Shipment_Status"] == "In Transit"
    assert s["Production_Finished_At"] == day(-1), "implied by the shipout"


# Node: 'SP-R5: the server-side reportShipmentDelay follows the same rules'
@pytest.mark.asyncio
async def test_report_shipment_delay_requires_a_reason_and_logs_the_source(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    ship_id = await store.add_record("Shipments", {"Shipment_No": "SHP-T4", "Target_Date": day(90)})
    with pytest.raises(ZohoError, match="reason"):
        await report_shipment_delay(store, ship_id, date=day(5), reason="")
    assert await report_shipment_delay(store, ship_id, date=day(5), reason="Forwarder strike", source="forwarder") is True
    log = await store.find("Stage_Events", lambda e: str(e["Record_Id"]) == str(ship_id) and e["Event"] == "shipment.delay_reported")
    assert log[0]["Source"] == "forwarder"
