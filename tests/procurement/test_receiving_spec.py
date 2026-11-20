import pytest
from datetime import datetime
from app.deluge import add_days, ymd, today_date

TODAY = today_date()


def day(n: int) -> str:
    return ymd(add_days(TODAY, n))


def line(**extra) -> dict:
    return {"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Expected_Qty": 3, **extra}


async def _shipment(raw, **extra):
    return await raw.add_record("Shipments", {"Shipment_No": "SHP-00001", "Supplier": "Tony", "Shipment_Status": "In Transit", **extra})


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def store(raw):
    from app.workflows import create_hooked_store
    import app.procurement.receiving  # noqa: F401
    import app.procurement.ship_track  # noqa: F401
    import app.procurement.receiving_spec  # noqa: F401
    return create_hooked_store(raw)


# Node: 'the four events are server stamps: counted on the first quantity, arrived derived "before" it, binned on the bin, available when pickable'
@pytest.mark.asyncio
async def test_the_four_events_stamp_in_order_and_only_once(raw, store):
    ship = await _shipment(raw)
    rcv_id = await store.add_record("Receiving", {"Shipments": ship, "Receiving_Line_Items": [line()]})
    r0 = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    assert not r0.get("Arrived_At") and not r0.get("Counted_At")
    await store.update_record("Receiving", rcv_id, {"Receiving_Line_Items": [line(Accepted_Qty=3)]})
    r = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    assert r["Counted_At"] and r["Arrived_At"]
    assert not r.get("Binned_At") and not r.get("Available_At")
    assert r["Receive_Status"] == "Partial Received", "counted in full, not binned: not pickable (D12)"
    await store.update_record("Receiving", rcv_id, {"Receiving_Line_Items": [line(Accepted_Qty=3, Bin_location="Receiving Area")]})
    assert not (await raw.get_record_by_id("Receiving", rcv_id, raw=True)).get("Binned_At"), '"Receiving Area" is where goods wait, not a bin'
    await store.update_record("Receiving", rcv_id, {"Receiving_Line_Items": [line(Accepted_Qty=3, Bin_location="A-01-1")]})
    r2 = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    assert r2["Binned_At"] and r2["Available_At"]
    assert r2["Receive_Status"] == "Received"
    assert r2["Receiving_Line_Items"][0]["Ready_for_Fulfillment"] in (True, "true")
    evs = sorted(await raw.find("Stage_Events", lambda e: e.get("Record_Type") == "receiving" and str(e.get("Record_Id")) == str(rcv_id)), key=lambda e: int(e["ID"]))
    assert [[e["Event"], e["Occurred_Bound"]] for e in evs] == [["receiving.arrived", "before"], ["receiving.counted", "exact"], ["receiving.binned", "exact"], ["receiving.available", "exact"]]
    stamp = r2["Counted_At"]
    await store.update_record("Receiving", rcv_id, {"Notes_for_Shipment": "later edit"})
    assert (await raw.get_record_by_id("Receiving", rcv_id, raw=True))["Counted_At"] == stamp, "a later save keeps the first stamp (T-6)"


# Node: 'the shipment is received when every line is pickable: stage and event'
@pytest.mark.asyncio
async def test_shipment_becomes_received_when_every_line_is_pickable(raw, store):
    ship = await _shipment(raw)
    rcv_id = await store.add_record("Receiving", {"Shipments": ship, "Receiving_Line_Items": [line(Accepted_Qty=3)]})
    assert (await raw.get_record_by_id("Shipments", ship, raw=True))["Stage"] != "received"
    await store.update_record("Receiving", rcv_id, {"Receiving_Line_Items": [line(Accepted_Qty=3, Bin_location="A-01-1")]})
    s = await raw.get_record_by_id("Shipments", ship, raw=True)
    assert s["Stage"] == "received"
    assert s["Received_At"]


# Node: 'the gate log: arrival can be reported with when it happened; the future is refused; the stamps cannot be typed'
@pytest.mark.asyncio
async def test_report_arrived_on_gate_log_future_refused_stamps_not_writable(raw, store):
    from app.criteria import ZohoError
    ship = await _shipment(raw)
    rcv_id = await store.add_record("Receiving", {"Shipments": ship, "Receiving_Line_Items": [line()]})
    with pytest.raises(ZohoError, match="future"):
        await store.update_record("Receiving", rcv_id, {"Report_Arrived_On": day(2)})
    await store.update_record("Receiving", rcv_id, {"Report_Arrived_On": day(-2)})
    r = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    assert r["Arrived_At"] == day(-2)
    ev = sorted(await raw.find("Stage_Events", lambda e: e.get("Record_Type") == "receiving" and str(e.get("Record_Id")) == str(rcv_id)), key=lambda e: int(e["ID"]))[0]
    assert [ev["Event"], ev["Occurred_At"], ev["Occurred_Bound"]] == ["receiving.arrived", day(-2), "exact"]
    assert ev["Reported_At"] and ev["Reported_At"] != ev["Occurred_At"], "when it happened and when we were told"
    await store.update_record("Receiving", rcv_id, {"Counted_At": "2001-01-01", "Available_At": "2001-01-01", "Rcv_State": "available", "Queue_Rank": 1})
    after = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    assert not after.get("Counted_At") and not after.get("Available_At")


# Node: 'an exception found at receiving records where, the fault origin from the root cause, and the quantity; resolving is stamped (RCV-R3)'
@pytest.mark.asyncio
async def test_exception_found_at_receiving_records_fault_origin_and_qty_resolving_stamped(raw, store):
    ship = await _shipment(raw)
    rcv_id = await store.add_record("Receiving", {"Shipments": ship, "Receive_No1": "RCV-00009", "SO_No": "SO-5", "PO_No": "PO-1", "Create_Exception_Requested": True, "Receiving_Line_Items": [line(Accepted_Qty=1, Damage_Qty=2)]})
    exc = (await raw.find("Exceptions"))[0]
    assert exc["Found_Stage"] == "receiving"
    assert exc["Fault_Origin"] == "unknown", "no root cause given yet"
    # the receiver gives the root cause of the damage rows
    r = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    await store.update_record("Receiving", rcv_id, {"Damage_Missing_Details": [{**d, "Root_Cause_Category": "Shipping Damage"} for d in r["Damage_Missing_Details"]], "Create_Exception_Requested": True})
    exc = (await raw.find("Exceptions"))[0]
    assert exc["Found_Stage"] == "receiving"
    assert int(exc["Affected_Qty"]) == 2
    assert len(await raw.find("Stage_Events", lambda e: e.get("Event") == "exception.raised")) == 1
    await store.update_record("Exceptions", exc["ID"], {"Exception_Status": "Resolved", "Resolution_Action": "Replacement ordered", "Found_Stage": "qc"})
    done = (await raw.find("Exceptions"))[0]
    assert done["Resolved_At"]
    assert done["Found_Stage"] == "receiving", "where it was found cannot be retyped"
    assert len(await raw.find("Stage_Events", lambda e: e.get("Event") == "exception.resolved")) == 1


# Node: 'received less than ordered: the suggested action asks for a replacement request, and the buyer is told once (RCV-R7)'
@pytest.mark.asyncio
async def test_shortage_suggests_rr_and_alerts_once(raw, store):
    ship = await _shipment(raw)
    rcv_id = await store.add_record("Receiving", {"Shipments": ship, "Receiving_Line_Items": [line(Accepted_Qty=2, Missing_Qty=1)]})
    r = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    assert "replacement request" in r["Suggested_Action"]
    await store.update_record("Receiving", rcv_id, {"Notes_for_Shipment": "x"})
    assert len(await raw.find("App_Notifications", lambda n: n.get("Notification_Type") == "Receiving Shortage")) == 1
    ok_id = await store.add_record("Receiving", {"Shipments": ship, "Receiving_Line_Items": [line(Accepted_Qty=3)]})
    ok = await raw.get_record_by_id("Receiving", ok_id, raw=True)
    assert "replacement request" not in ok["Suggested_Action"], "nothing short: no shortage suggestion"


# Node: 'the Arrivals list: arrived-not-counted first, then counted, then expected; oldest Sales Order first inside each; with the reason (SE-1..5)'
@pytest.mark.asyncio
async def test_arrivals_list_ranks_arrived_before_counted_before_expected(raw, store):
    from app.procurement.receiving_spec import rescore_receivings
    ship_a = await _shipment(raw, Shipment_No="SHP-1", Stage="arrived_warehouse", Arrived_Warehouse_At=day(-3))
    ship_b = await _shipment(raw, Shipment_No="SHP-2", Stage="arrived_warehouse", Arrived_Warehouse_At=day(-1))
    ship_c = await _shipment(raw, Shipment_No="SHP-3", Stage="shipped_out", Receive_Planned=day(3))
    await raw.add_record("Purchase_Request1", {"PR_No": "PR-OLD", "Order_Date": day(-60)})
    await raw.add_record("Purchase_Request1", {"PR_No": "PR-NEW", "Order_Date": day(-5)})
    newer = await store.add_record("Receiving", {"Shipments": ship_b, "Receive_No1": "RCV-2", "Receiving_Line_Items": [line(PR_No="PR-NEW")]})
    older = await store.add_record("Receiving", {"Shipments": ship_a, "Receive_No1": "RCV-1", "Receiving_Line_Items": [line(PR_No="PR-OLD")]})
    expected = await store.add_record("Receiving", {"Shipments": ship_c, "Receive_No1": "RCV-3", "Receiving_Line_Items": [line(PR_No="PR-OLD")]})
    counted = await store.add_record("Receiving", {"Receive_No1": "RCV-4", "Receiving_Line_Items": [line(PR_No="PR-OLD", Accepted_Qty=3)]})
    await rescore_receivings(raw)
    o = await raw.get_record_by_id("Receiving", older, raw=True)
    n = await raw.get_record_by_id("Receiving", newer, raw=True)
    e = await raw.get_record_by_id("Receiving", expected, raw=True)
    c = await raw.get_record_by_id("Receiving", counted, raw=True)
    assert [o["Rcv_State"], n["Rcv_State"], e["Rcv_State"], c["Rcv_State"]] == ["arrived", "arrived", "expected", "counted"]
    assert int(o["Queue_Rank"]) < int(n["Queue_Rank"]), "the older Sales Order is first"
    assert int(n["Queue_Rank"]) < int(c["Queue_Rank"]) < int(e["Queue_Rank"])
    assert o["Order_Date"] == day(-60)
    assert "arrived 3 day(s) ago, not counted" in o["Priority_Reason"]
    assert o["Suggested_Action"] == "Count and inspect it"
    assert c["Suggested_Action"] == "Write the bin location"


# Node: 'silence is an alert: arrived and not counted, counted and not binned (RCV-R6), once each, and the daily run ranks and alerts'
@pytest.mark.asyncio
async def test_silence_alerts_once_each_and_daily_run_ranks_and_alerts(raw, db_conn):
    from app.procurement.receiving_spec import check_receiving_silence, run_receiving_daily
    from app.procurement.plan import load_settings
    ship = await _shipment(raw)
    rcv_id = await raw.add_record("Receiving", {"Shipments": ship, "Receive_No1": "RCV-7", "Receiving_Line_Items": [line()]})
    await db_conn.execute('UPDATE "Receiving" SET "Arrived_At" = $1 WHERE "ID" = $2::bigint', f"{day(-2)} 09:00:00 AM", int(rcv_id))
    settings = await load_settings(raw)
    assert await check_receiving_silence(raw, settings, datetime.now()) == 1
    assert await check_receiving_silence(raw, settings, datetime.now()) == 0, "once"
    backed_up = (await raw.find("App_Notifications", lambda n: n.get("Notification_Type") == "Receiving Backed Up"))[0]
    assert "has not been counted" in backed_up["Message"]
    await raw.update_record("Receiving", rcv_id, {"Receiving_Line_Items": [line(Accepted_Qty=3)]})
    await db_conn.execute('UPDATE "Receiving" SET "Counted_At" = $1 WHERE "ID" = $2::bigint', f"{day(-2)} 09:00:00 AM", int(rcv_id))
    r = await run_receiving_daily(raw, now=datetime.now())
    assert r["alerts"] == 1
    assert len(await raw.find("App_Notifications", lambda n: n.get("Notification_Type") == "Receiving Not Binned")) == 1


# Node: 'the receiving record shows the forecast pickable date of its shipment (it has no forecast of its own)'
@pytest.mark.asyncio
async def test_receiving_shows_forecast_pickable_of_its_shipment_and_cannot_be_written(raw, store):
    from app.procurement.ship_track import rescore_shipments
    ship = await raw.add_record("Shipments", {"Shipment_No": "SHP-F", "Supplier": "Tony Fan", "Shipment_Mode": "LCL", "Required_Days_Lead": 20, "PO_Date": ymd(add_days(TODAY, 0)), "Target_Date": ymd(add_days(TODAY, 120)), "Stage": "production", "PO_Shipments": [{"PR_No": "PR-1", "SKU": "L-1", "Shipment_QTY": 1}]})
    rcv_id = await raw.add_record("Receiving", {"Receive_No1": "RCV-F", "Shipments": ship, "Receiving_Line_Items": [{"PR_No": "PR-1", "SKU": "L-1", "Expected_Qty": 1}]})
    await rescore_shipments(raw, full=True)
    s = await raw.get_record_by_id("Shipments", ship, raw=True)
    r = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    assert s["Forecast_Pickable"]
    assert r["Rcv_Forecast_Pickable"] == str(s["Forecast_Pickable"])[:10]
    await store.update_record("Receiving", rcv_id, {"Rcv_Forecast_Pickable": "2000-01-01"})
    assert (await raw.get_record_by_id("Receiving", rcv_id, raw=True))["Rcv_Forecast_Pickable"] != "2000-01-01", "a widget cannot write it"
