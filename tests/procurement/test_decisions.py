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
    import app.procurement.decisions  # noqa: F401
    return create_hooked_store(raw)


async def _shipment(raw, store, *, po_days=-2, so_days=-60, target=30, so="SO-1"):
    await raw.add_record("Sales_Order_Fulfillment", {"SO_No": so, "SO_Created_Date": day(so_days)})
    po_id = await store.add_record("Purchase_Order", {"Customer": "C", "PO_Date": day(po_days), "PO_Line_Items": [LINE]})
    return await store.add_record("Shipments", {"PO_No": po_id, "Sales_Order": so, "Supplier": "Tony Fan", "Target_Date": day(target), "PO_Shipments": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Ordered_QTY": 2, "Shipment_QTY": 2, "Shipping_Mode": "LCL"}]})


async def _get(raw, id_):
    return await raw.get_record_by_id("Shipments", id_, raw=True)


async def _items(raw, kind=None):
    return await raw.find("Approval_Queue", lambda i: not kind or i.get("Kind") == kind)


# Node: 'an Act now shipment still in production gets one air_upgrade decision, with the numbers, once'
@pytest.mark.asyncio
async def test_act_now_shipment_gets_one_air_upgrade_decision(raw, store):
    import json
    id_ = await _shipment(raw, store, target=30)
    assert (await _get(raw, id_))["Category"] == "act_now"
    it = (await _items(raw, "air_upgrade"))[0]
    assert it["Status"] == "pending"
    assert json.loads(it["Options"]) == ["upgrade_air", "move_target", "tell_customer"]
    assert "By air it would save 16 days" in it["Summary"]
    assert it["Due_At"]
    from app.procurement.ship_track import rescore_shipments
    await rescore_shipments(raw)
    assert len(await _items(raw, "air_upgrade")) == 1, "not asked again"


# Node: 'deciding "upgrade_air" changes the mode, plans the dates again, stamps who decided, and cannot be decided twice'
@pytest.mark.asyncio
async def test_deciding_upgrade_air_changes_mode_and_locks_decision(raw, store):
    id_ = await _shipment(raw, store, target=30)
    it = (await _items(raw, "air_upgrade"))[0]
    before = (await _get(raw, id_))["Arrival_Planned"]
    await store.update_record("Approval_Queue", it["ID"], {"Decision": "upgrade_air"}, user="buyer@x")
    s = await _get(raw, id_)
    assert s["Shipment_Mode"] == "Airfreight"
    assert s["Arrival_Planned"] != before
    d = (await _items(raw, "air_upgrade"))[0]
    assert d["Status"] == "decided"
    assert d["Decided_By"] == "buyer@x"
    assert d["Decided_By_Type"] == "human"
    assert d["Decided_At"]
    assert "Changed to air" in d["Result"]
    from app.criteria import ZohoError
    with pytest.raises(ZohoError, match="already been decided"):
        await store.update_record("Approval_Queue", it["ID"], {"Decision": "tell_customer"})
    assert len(await raw.find("Stage_Events", lambda e: e.get("Event") == "shipment.mode_upgraded")) == 1


# Node: 'a decision cannot be typed, forged or deleted, and only the listed options are accepted'
@pytest.mark.asyncio
async def test_decision_cannot_be_typed_forged_or_deleted(raw, store):
    from app.criteria import ZohoError
    await _shipment(raw, store, target=30)
    it = (await _items(raw, "air_upgrade"))[0]
    with pytest.raises(ZohoError, match="prepared by the system"):
        await store.add_record("Approval_Queue", {"Kind": "air_upgrade"})
    with pytest.raises(ZohoError, match="cannot be deleted"):
        await store.delete_record("Approval_Queue", it["ID"])
    with pytest.raises(ZohoError, match="not one of the options"):
        await store.update_record("Approval_Queue", it["ID"], {"Decision": "cancel_everything"})
    await store.update_record("Approval_Queue", it["ID"], {"Status": "decided", "Decided_By": "someone else", "Result": "fake"})
    after = (await _items(raw, "air_upgrade"))[0]
    assert after["Status"] == "pending"
    assert not after.get("Decided_By") and not after.get("Result")


# Node: '"move the target" sends a forecast_promise_change; accepting it changes the target, logs why, and never happens by itself'
@pytest.mark.asyncio
async def test_move_target_sends_forecast_promise_change_and_only_moves_on_accept(raw, store):
    import json
    id_ = await _shipment(raw, store, target=30)
    old_target = (await _get(raw, id_))["Target_Date"]
    air = (await _items(raw, "air_upgrade"))[0]
    await store.update_record("Approval_Queue", air["ID"], {"Decision": "move_target"}, user="buyer@x")
    assert (await _get(raw, id_))["Target_Date"] == old_target, "the forecast alone does not move the promise (DT-5)"
    fp = (await _items(raw, "forecast_promise_change"))[0]
    assert fp["Status"] == "pending"
    proposed = json.loads(fp["Payload"])["proposed_target"]
    await store.update_record("Approval_Queue", fp["ID"], {"Decision": "accept_target"}, user="sales@x")
    assert (await _get(raw, id_))["Target_Date"] == proposed
    ch = (await raw.find("Target_Date_Changes"))[0]
    assert [ch["Old_Date"], ch["New_Date"], ch["Changed_By"], ch["Via"]] == [old_target, proposed, "sales@x", "approval_queue"]
    notice = (await raw.find("App_Notifications", lambda n: n.get("Notification_Type") == "Tell The Customer"))[0]
    assert notice, "accepting a new target actually alerts someone to tell the customer"


# Node: 'the "tell the customer" alert goes to the sales-agent setting, not the general procurement one'
@pytest.mark.asyncio
async def test_tell_the_customer_alert_goes_to_sales_agent_setting(raw, store):
    await raw.add_record("Procurement_Settings", {"Setting_Key": "procurement_alert_email", "Value": "general@example.test"})
    await raw.add_record("Procurement_Settings", {"Setting_Key": "sales_agent_alert_email", "Value": "sales@example.test"})
    id_ = await _shipment(raw, store, target=30)
    air = (await _items(raw, "air_upgrade"))[0]
    await store.update_record("Approval_Queue", air["ID"], {"Decision": "tell_customer"}, user="buyer@x")
    notice = (await raw.find("App_Notifications", lambda n: n.get("Notification_Type") == "Tell The Customer"))[0]
    assert notice["Recipient_Email"] == "sales@example.test"
    assert id_


# Node: 'with no sales-agent setting, "tell the customer" falls back to the general alert recipient'
@pytest.mark.asyncio
async def test_tell_the_customer_falls_back_to_general_alert(raw, store):
    await raw.add_record("Procurement_Settings", {"Setting_Key": "procurement_alert_email", "Value": "general@example.test"})
    await _shipment(raw, store, target=30)
    air = (await _items(raw, "air_upgrade"))[0]
    await store.update_record("Approval_Queue", air["ID"], {"Decision": "tell_customer"}, user="buyer@x")
    notice = (await raw.find("App_Notifications", lambda n: n.get("Notification_Type") == "Tell The Customer"))[0]
    assert notice["Recipient_Email"] == "general@example.test"


# Node: 'ladder day 3: the decision is recorded on the rung; "cancel and re-source" cancels nothing by itself'
@pytest.mark.asyncio
async def test_ladder_day3_decision_recorded_on_rung_no_automatic_cancel(raw, store):
    from app.procurement.ship_track import run_shipment_ladder
    id_ = await _shipment(raw, store, po_days=-2)
    await run_shipment_ladder(raw, today=add_days(TODAY, 2))
    it = (await _items(raw, "ladder_day3"))[0]
    await store.update_record("Approval_Queue", it["ID"], {"Decision": "cancel_resource"}, user="buyer@x")
    rung3 = (await raw.find("Ladder_Events", lambda l: int(l.get("Rung")) == 3))[0]
    assert [rung3["Decision"], rung3["Decided_By"]] == ["cancel_resource", "buyer@x"]
    assert "Nothing was cancelled by the system" in (await _items(raw, "ladder_day3"))[0]["Result"]
    assert (await _get(raw, id_))["Stage"] == "production"


# Node: 'AQ-4: when the record changes the item goes stale by itself (production started, or the supplier shipped)'
@pytest.mark.asyncio
async def test_aq4_item_goes_stale_when_record_changes(raw, store):
    from app.criteria import ZohoError
    from app.procurement.ship_track import run_shipment_ladder
    id_ = await _shipment(raw, store, po_days=-2)
    await run_shipment_ladder(raw, today=add_days(TODAY, 2))
    assert (await _items(raw, "ladder_day3"))[0]["Status"] == "pending"
    await store.update_record("Shipments", id_, {"Report_Event": "production_started", "Report_Occurred_At": day(-1)})
    assert (await _items(raw, "ladder_day3"))[0]["Status"] == "stale"
    assert "production has started" in (await _items(raw, "ladder_day3"))[0]["Result"]
    stale_id = (await _items(raw, "ladder_day3"))[0]["ID"]
    with pytest.raises(ZohoError, match="stale"):
        await store.update_record("Approval_Queue", stale_id, {"Decision": "hold"})
    # shipped out: the air_upgrade item (if one was made) is stale too, none is left pending
    await store.update_record("Shipments", id_, {"Production_Photos": ["p.jpg"]})
    await store.update_record("Shipments", id_, {"Report_Event": "shipped_out", "Report_Occurred_At": day(-1)})
    assert all(i.get("Status") != "pending" for i in await _items(raw, "air_upgrade"))


# Node: 'AQ-3: not decided within the hours it escalates once, with an alert'
@pytest.mark.asyncio
async def test_aq3_escalates_once_after_sla_hours(raw, store):
    from datetime import datetime, timedelta
    from app.procurement.decisions_core import escalate_overdue
    from app.procurement.plan import load_settings
    await _shipment(raw, store, target=30)
    assert await escalate_overdue(raw, await load_settings(raw), datetime.now()) == 0
    later = datetime.now() + timedelta(hours=25)
    assert await escalate_overdue(raw, await load_settings(raw), later) == 1
    assert await escalate_overdue(raw, await load_settings(raw), later) == 0, "once"
    it = (await _items(raw, "air_upgrade"))[0]
    assert it["Escalated_At"]
    assert len(await raw.find("App_Notifications", lambda n: n.get("Notification_Type") == "Decision Escalated")) == 1


# Node: 'the alert goes to the setting, not to a hard-coded address'
@pytest.mark.asyncio
async def test_alert_goes_to_configured_setting_not_hardcoded(raw, store):
    from app.procurement.ship_track import run_shipment_ladder
    await raw.add_record("Procurement_Settings", {"Setting_Key": "procurement_alert_email", "Value": "buyer@example.test"})
    await _shipment(raw, store, po_days=-2)
    await run_shipment_ladder(raw, today=TODAY)
    n = await raw.find("App_Notifications", lambda x: x.get("Notification_Type") == "Supplier Ladder")
    assert len(n) >= 1 and all(x["Recipient_Email"] == "buyer@example.test" for x in n)
