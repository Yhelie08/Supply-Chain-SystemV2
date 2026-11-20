import pytest
from app.deluge import add_days, ymd, today_date

TODAY = today_date()
SPEC_ROWS = {"transit_lcl_min_days": 30, "transit_lcl_max_days": 30, "transit_fcl_min_days": 30, "transit_fcl_max_days": 30, "transit_air_min_days": 14, "transit_air_max_days": 14,
             "customs_lcl_min_days": 0, "customs_lcl_max_days": 0, "customs_fcl_min_days": 0, "customs_fcl_max_days": 0, "customs_air_min_days": 0, "customs_air_max_days": 0, "fulfillment_days": 3, "delivery_days": 2}
LINE = {"PR_No": "PR-1", "SKU": "L-1", "Item": "Lamp", "QTY": 2, "Supplier": "Tony Fan", "Line_Total": 10, "Shipping_Mode": "LCL"}


def day(n: int) -> str:
    return ymd(add_days(TODAY, n))


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    store = create_store(db_conn)
    for k, v in SPEC_ROWS.items():
        await store.add_record("Procurement_Settings", {"Setting_Key": k, "Value": str(v)})
    return store


@pytest.fixture
def store(raw):
    from app.workflows import create_hooked_store
    import app.procurement.receiving  # noqa: F401
    import app.procurement.ship_track  # noqa: F401
    import app.procurement.shipments  # noqa: F401
    import app.procurement.purchase_order  # noqa: F401
    return create_hooked_store(raw)


async def _shipment(raw, store, *, po_days=0, so_days=-10, target=60, lines=None, extra=None, so="SO-100"):
    lines = lines or [LINE]
    extra = extra or {}
    await raw.add_record("Sales_Order_Fulfillment", {"SO_No": so, "SO_Created_Date": day(so_days)})
    po_id = await store.add_record("Purchase_Order", {"Customer": "C", "PO_Date": day(po_days), "PO_Line_Items": lines})
    id_ = await store.add_record("Shipments", {
        "PO_No": po_id, "Sales_Order": so, "Supplier": "Tony Fan", "Target_Date": "" if target is None else day(target),
        "PO_Shipments": [{"PR_No": l["PR_No"], "SKU": l["SKU"], "Item_Name": l["Item"], "Ordered_QTY": l["QTY"], "Shipment_QTY": l["QTY"], "Shipping_Mode": l["Shipping_Mode"]} for l in lines], **extra,
    })
    return {"id": id_, "po_id": po_id}


async def _get(raw, id_):
    return await raw.get_record_by_id("Shipments", id_, raw=True)


async def _events(raw, id_):
    rows = sorted(await raw.find("Stage_Events", lambda e: str(e.get("Record_Id")) == str(id_)), key=lambda e: int(e["ID"]))
    return rows


# Node: 'a new shipment starts in Production, and the planned dates, PO Date and Order Date are computed from the PO and the Sales Order'
@pytest.mark.asyncio
async def test_new_shipment_starts_in_production_with_planned_dates(raw, store):
    seeded = await _shipment(raw, store, po_days=-2, so_days=-12)
    s = await _get(raw, seeded["id"])
    assert s["Stage"] == "production"
    assert s["PO_Date"] == day(-2)
    assert s["Order_Date"] == day(-12)
    assert s["Production_Start_Planned"] == day(-1)
    assert s["Production_End_Planned"] == day(19)
    assert s["Shipout_Planned"] == day(22)
    assert s["Arrival_Planned"] == day(52)
    assert s["Receive_Planned"] == day(54)


# Node: 'a widget cannot type a planned date, an actual stamp, the stage, the order date or a queue column (T-2, ST-R1)'
@pytest.mark.asyncio
async def test_widget_cannot_type_server_only_fields(raw, store):
    seeded = await _shipment(raw, store)
    before = await _get(raw, seeded["id"])
    await store.update_record("Shipments", seeded["id"], {
        "Stage": "received", "Order_Date": "2001-01-01", "Arrival_Planned": "2001-01-01", "Shipped_Out_At": "2001-01-01", "Category": "act_now", "Queue_Rank": 99, "Notes": "ok",
    })
    s = await _get(raw, seeded["id"])
    assert s["Notes"] == "ok", "normal fields still save"
    assert s["Stage"] == "production"
    assert s["Order_Date"] == before["Order_Date"]
    assert s["Arrival_Planned"] == before["Arrival_Planned"]
    assert not s.get("Shipped_Out_At")
    assert str(s["Queue_Rank"]) != "99"


# Node: 'Report_Event stores the stamp once, with when it happened and when we were told'
@pytest.mark.asyncio
async def test_report_event_stamps_once_with_occurred_and_reported(raw, store):
    seeded = await _shipment(raw, store)
    await store.update_record("Shipments", seeded["id"], {"Report_Event": "production_started", "Report_Occurred_At": day(-3), "Report_Source": "supplier"})
    s = await _get(raw, seeded["id"])
    assert s["Production_Started_At"] == day(-3)
    assert s["Last_Supplier_Update_At"], "a supplier report stamps the last supplier update"
    assert s["Report_Event"] == "", "the transient field is cleared"
    ev = (await _events(raw, seeded["id"]))[0]
    assert ev["Event"] == "shipment.production_started"
    assert ev["Occurred_At"] == day(-3)
    assert ev["Reported_At"] and ev["Reported_At"] != ev["Occurred_At"]
    assert ev["Occurred_Bound"] == "exact"
    assert ev["Source"] == "supplier"
    assert int(ev["Visit_No"]) == 1
    # reported again: the stamp on the shipment is the first one, the log gets a second visit
    await store.update_record("Shipments", seeded["id"], {"Report_Event": "production_started", "Report_Occurred_At": day(-1)})
    s2 = await _get(raw, seeded["id"])
    assert s2["Production_Started_At"] == day(-3), "never overwritten (T-6)"
    assert [int(e["Visit_No"]) for e in await _events(raw, seeded["id"])] == [1, 2]


# Node: 'an event cannot have happened in the future, and a bad date is refused'
@pytest.mark.asyncio
async def test_event_refuses_future_or_unparseable_date(raw, store):
    from app.criteria import ZohoError
    seeded = await _shipment(raw, store)
    with pytest.raises(ZohoError, match="future"):
        await store.update_record("Shipments", seeded["id"], {"Report_Event": "production_started", "Report_Occurred_At": day(2)})
    with pytest.raises(ZohoError, match="not a date"):
        await store.update_record("Shipments", seeded["id"], {"Report_Event": "production_started", "Report_Occurred_At": "yesterday"})
    assert len(await _events(raw, seeded["id"])) == 0


# Node: 'leaving Production needs a production photo (ST-R3); with one, a shipout implies production finished, stored as "before"'
@pytest.mark.asyncio
async def test_shipout_needs_production_photo_and_implies_production_finished(raw, store):
    from app.criteria import ZohoError
    seeded = await _shipment(raw, store)
    with pytest.raises(ZohoError, match="production photo"):
        await store.update_record("Shipments", seeded["id"], {"Report_Event": "shipped_out", "Report_Occurred_At": day(-1)})
    assert (await _get(raw, seeded["id"]))["Stage"] == "production"
    await store.update_record("Shipments", seeded["id"], {"Production_Photos": ["p1.jpg"]})
    await store.update_record("Shipments", seeded["id"], {"Report_Event": "shipped_out", "Report_Occurred_At": day(-1)})
    s = await _get(raw, seeded["id"])
    assert s["Stage"] == "shipped_out"
    assert s["Shipment_Status"] == "In Transit", "the legacy status the Zoho widgets read follows the stage"
    assert s["Ship_Out_Date"] == day(-1)
    assert s["Production_Finished_At"] == day(-1), "implied by the shipout"
    evs = await _events(raw, seeded["id"])
    assert [[e["Event"], e["Occurred_Bound"]] for e in evs] == [["shipment.production_finished", "before"], ["shipment.shipped_out", "exact"]]


# Node: 'the old way still works: Shipment_Status "In Transit" is a shipout event and needs the photo too'
@pytest.mark.asyncio
async def test_legacy_shipment_status_in_transit_is_a_shipout_event(raw, store):
    from app.criteria import ZohoError
    seeded = await _shipment(raw, store)
    with pytest.raises(ZohoError, match="production photo"):
        await store.update_record("Shipments", seeded["id"], {"Shipment_Status": "In Transit"})
    await store.update_record("Shipments", seeded["id"], {"Production_Photos": ["p.jpg"], "Shipment_Status": "In Transit"})
    assert (await _get(raw, seeded["id"]))["Stage"] == "shipped_out"


# Node: 'rescore: the board columns are written, the oldest order is ranked first, and a PR on hold blocks the shipment'
@pytest.mark.asyncio
async def test_rescore_writes_board_columns_oldest_first_and_held_pr_blocks(raw, store):
    from app.procurement.ship_track import rescore_shipments
    older = await _shipment(raw, store, so="SO-OLD", so_days=-60, target=20)
    newer = await _shipment(raw, store, so="SO-NEW", so_days=-5, target=20, lines=[{**LINE, "PR_No": "PR-2"}])
    await raw.add_record("Purchase_Request1", {"PR_No": "PR-2", "Hold_Status": "On Hold"})
    await rescore_shipments(raw)
    o, n = await _get(raw, older["id"]), await _get(raw, newer["id"])
    assert o["Category"] == "act_now"
    assert int(o["Queue_Rank"]) == 1
    assert o["Risk_Status"] == "Delayed", "Risk Status follows the forecast"
    await store.update_record("Shipments", older["id"], {"Risk_Status": "On Track"})
    assert (await _get(raw, older["id"]))["Risk_Status"] == "Delayed", "and cannot be typed"
    assert "SO dated" in o["Priority_Reason"]
    assert o["Suggested_Action"]
    assert o["Date_Needed"] and o["Forecast_Pickable"] and o["Scored_At"]
    assert n["Category"] == "blocked"
    assert "PR-2" in n["Blocked_Reason"]


# Node: 'rescore reaches every Sales Order behind the shipment: its own PR gets the same forecast pickable, not only the shipment'
@pytest.mark.asyncio
async def test_rescore_reaches_every_sales_order_via_its_pr(raw, store):
    from app.procurement.ship_track import rescore_shipments
    await raw.add_record("Purchase_Request1", {"PR_No": "PR-1", "Sales_Order": "SO-100"})
    await raw.add_record("Purchase_Request1", {"PR_No": "PR-9", "Sales_Order": "SO-OTHER"})  # not on any shipment: untouched
    ship = await _shipment(raw, store, target=60)
    await rescore_shipments(raw)
    s = await _get(raw, ship["id"])
    pr1 = (await raw.find("Purchase_Request1", lambda p: p.get("PR_No") == "PR-1"))[0]
    pr9 = (await raw.find("Purchase_Request1", lambda p: p.get("PR_No") == "PR-9"))[0]
    assert s["Forecast_Pickable"]
    assert pr1["Pr_Forecast_Pickable"] == s["Forecast_Pickable"][:10]
    assert pr9["Pr_Forecast_Pickable"] == ""


# Node: 'ladder: late = production not started by PO + 1; one rung per day, each only once, day 3 is a prepared decision and never a cancel'
@pytest.mark.asyncio
async def test_ladder_production_start_late_fires_rungs_once_each_and_day3_prepares_decision(raw, store):
    from app.procurement.ship_track import run_shipment_ladder
    seeded = await _shipment(raw, store, po_days=-2)  # PO + 1 was yesterday: 1 day late
    await run_shipment_ladder(raw, today=TODAY)
    rungs = await raw.find("Ladder_Events")
    assert [int(r["Rung"]) for r in rungs] == [1]
    await run_shipment_ladder(raw, today=TODAY)
    assert len(await raw.find("Ladder_Events")) == 1, "a rung fires once"
    await run_shipment_ladder(raw, today=add_days(TODAY, 2))  # 3 days late
    rungs = await raw.find("Ladder_Events")
    assert sorted(int(r["Rung"]) for r in rungs) == [1, 2, 3]
    q = [i for i in await raw.find("Approval_Queue") if i.get("Kind") == "ladder_day3"]
    assert len(q) == 1
    assert q[0]["Kind"] == "ladder_day3"
    assert q[0]["Status"] == "pending"
    import json
    assert json.loads(q[0]["Options"]) == ["cancel_resource", "hold"]
    assert (await _get(raw, seeded["id"]))["Stage"] != "cancelled", "no automatic cancellation"
    assert len(await raw.find("App_Notifications")) >= 3


# Node: 'ladder day 3: the prepared decision says whether the deposit is paid and how much (spec 04), or that none was paid'
@pytest.mark.asyncio
async def test_ladder_day3_decision_mentions_deposit_status(raw, store, db_conn):
    from app.procurement.ship_track import run_shipment_ladder
    seeded = await _shipment(raw, store, po_days=-3, so="SO-D1")
    await raw.update_record("Purchase_Order", seeded["po_id"], {"Deposit_Paid": True, "Deposit_Amount": 5000}, by_form=True)
    await run_shipment_ladder(raw, today=add_days(TODAY, 1))
    paid = [i for i in await raw.find("Approval_Queue") if i.get("Kind") == "ladder_day3"][0]
    assert "Deposit paid: 5000 on PO-" in paid["Summary"]
    await db_conn.execute('DELETE FROM "Approval_Queue"')
    await db_conn.execute('DELETE FROM "Ladder_Events"')
    await raw.update_record("Purchase_Order", seeded["po_id"], {"Deposit_Paid": False, "Deposit_Amount": 0}, by_form=True)
    await run_shipment_ladder(raw, today=add_days(TODAY, 1))
    none_ = [i for i in await raw.find("Approval_Queue") if i.get("Kind") == "ladder_day3"][0]
    assert "No deposit paid on PO-" in none_["Summary"]


# Node: 'ladder: no rung once production has started; older rows with no Stage get no alerts (import safe)'
@pytest.mark.asyncio
async def test_ladder_no_rung_once_started_and_no_stage_rows_skipped(raw, store, db_conn):
    from app.procurement.ship_track import run_shipment_ladder
    a = await _shipment(raw, store, po_days=-5)
    await store.update_record("Shipments", a["id"], {"Report_Event": "production_started", "Report_Occurred_At": day(-3)})
    b = await _shipment(raw, store, po_days=-9, so="SO-200")
    await db_conn.execute('UPDATE "Shipments" SET "Stage" = NULL WHERE "ID" = $1::bigint', int(b["id"]))  # as if imported from Zoho
    await run_shipment_ladder(raw, today=TODAY)
    rungs = await raw.find("Ladder_Events")
    assert all(r.get("Kind") != "production_start" for r in rungs), "started on time: no start rung; the imported row is skipped"


# Node: 'ladder: production finishing late (planned end passed) fires its own rungs, and day 3 offers hold or upgrade, not cancel'
@pytest.mark.asyncio
async def test_ladder_production_finish_late_offers_hold_or_upgrade(raw, store):
    from app.procurement.ship_track import run_shipment_ladder
    import json
    seeded = await _shipment(raw, store, po_days=-25)
    await store.update_record("Shipments", seeded["id"], {"Report_Event": "production_started", "Report_Occurred_At": day(-24)})
    await run_shipment_ladder(raw, today=add_days(TODAY, 0))  # planned end = PO + 1 + 20 = 4 days ago
    rungs = [r for r in await raw.find("Ladder_Events") if r.get("Kind") == "production_finish"]
    assert sorted(int(r["Rung"]) for r in rungs) == [1, 2, 3]
    item = next(i for i in await raw.find("Approval_Queue") if i.get("Kind") == "ladder_day3")
    assert json.loads(item["Options"]) == ["hold", "upgrade_mode"]


# Node: 'writing what was done on a rung stamps the last chase on the shipment (a side effect, not a button)'
@pytest.mark.asyncio
async def test_writing_rung_action_stamps_last_chase(raw, store):
    from app.procurement.ship_track import run_shipment_ladder
    seeded = await _shipment(raw, store, po_days=-2)
    await run_shipment_ladder(raw, today=TODAY)
    rung = (await raw.find("Ladder_Events"))[0]
    assert not (await _get(raw, seeded["id"])).get("Last_Chase_At")
    await store.update_record("Ladder_Events", rung["ID"], {"Action_Taken": "Called Tony on WeChat"})
    assert (await _get(raw, seeded["id"])).get("Last_Chase_At")
    assert any(e["Event"] == "shipment.chased" for e in await _events(raw, seeded["id"]))


# Node: 'silence alert: shipped out and not at the port within transit days + 3 raises one overdue notification'
@pytest.mark.asyncio
async def test_silence_alert_shipped_out_overdue(raw, store):
    from app.procurement.ship_track import run_shipment_ladder
    seeded = await _shipment(raw, store, po_days=-60)
    await store.update_record("Shipments", seeded["id"], {"Production_Photos": ["p.jpg"]})
    await store.update_record("Shipments", seeded["id"], {"Report_Event": "shipped_out", "Report_Occurred_At": day(-40)})  # 30 + 3 = 33 days allowed
    await run_shipment_ladder(raw, today=TODAY)
    await run_shipment_ladder(raw, today=TODAY)
    n = [x for x in await raw.find("App_Notifications") if x.get("Notification_Type") == "Shipment Overdue"]
    assert len(n) == 1


# Node: 'putting a PR on hold blocks its shipment at once (no waiting for the nightly run)'
@pytest.mark.asyncio
async def test_pr_hold_blocks_shipment_at_once(raw, store):
    seeded = await _shipment(raw, store, lines=[{**LINE, "PR_No": "PR-9"}])
    pr = await raw.add_record("Purchase_Request1", {"PR_No": "PR-9"})
    await store.update_record("Purchase_Request1", pr, {"Hold_Status": "On Hold", "Hold_Reason": "Client stopped order"})
    assert (await _get(raw, seeded["id"]))["Category"] == "blocked"
    await store.update_record("Purchase_Request1", pr, {"Hold_Status": ""})
    assert (await _get(raw, seeded["id"]))["Category"] != "blocked"


# Node: 'Receiving: the first count means the shipment arrived at the warehouse "before" it (stage + event with a before bound)'
@pytest.mark.asyncio
async def test_receiving_first_count_arrives_shipment_before_bound(raw, store):
    seeded = await _shipment(raw, store)
    rcv = (await raw.find("Receiving"))[0]
    await store.update_record("Receiving", rcv["ID"], {"Receiving_Line_Items": [{**l, "Accepted_Qty": l["Expected_Qty"]} for l in rcv["Receiving_Line_Items"]]})
    s = await _get(raw, seeded["id"])
    assert s["Stage"] == "arrived_warehouse"
    assert s.get("Arrived_Warehouse_At")
    arrived = next(e for e in await _events(raw, seeded["id"]) if e["Event"] == "shipment.arrived_warehouse")
    assert arrived["Occurred_Bound"] == "before"
    assert arrived["Source"] == "system"
