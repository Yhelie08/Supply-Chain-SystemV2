import pytest
from app.deluge import add_days, parse_date, ymd, today_date

TODAY = today_date()


def day(n: int) -> str:
    return ymd(add_days(TODAY, n))


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def _ship(raw, **extra):
    return await raw.add_record("Shipments", {"Supplier": "Tony Fan", "Shipment_Mode": "LCL", "Required_Days_Lead": 20, "Stage": "production", "PO_Shipments": [{"PR_No": "PR-1", "SKU": "L-1", "Shipment_QTY": 1}], **extra})


async def _dash(raw):
    from app.procurement.dashboard import get_procurement_dashboard
    return (await get_procurement_dashboard({}, raw))["data"]


# Node: 'Today: the counts of Act now, Tell the customer and Broken, the decisions waiting, PRs needing a manual quote, POs not acknowledged, each with its link'
@pytest.mark.asyncio
async def test_today_block_counts_and_links(raw):
    await _ship(raw, Shipment_No="S1", Category="act_now", Queue_Rank=2, Priority_Reason="late", Suggested_Action="Call")
    await _ship(raw, Shipment_No="S2", Category="act_now", Queue_Rank=3)
    await _ship(raw, Shipment_No="S3", Category="tell_customer", Queue_Rank=4)
    await _ship(raw, Shipment_No="S4", Category="broken", Queue_Rank=1)
    await _ship(raw, Shipment_No="S5", Category="act_now", Stage="received")  # received: not counted
    for kind in ("air_upgrade", "air_upgrade", "ladder_day3"):
        await raw.add_record("Approval_Queue", {"Kind": kind, "Status": "pending"})
    await raw.add_record("Approval_Queue", {"Kind": "air_upgrade", "Status": "decided"})
    await raw.add_record("Purchase_Request1", {"PR_No": "PR-1", "Pricing_Status": "needs_manual_quote", "Pr_State": "open"})
    await raw.add_record("Purchase_Request1", {"PR_No": "PR-2", "Pricing_Status": "needs_manual_quote", "Pr_State": "cancelled"})
    await raw.add_record("Purchase_Order", {"PO_No": "PO-1", "Po_State": "sent"})
    await raw.add_record("Purchase_Order", {"PO_No": "PO-2", "Po_State": "acknowledged"})
    t = (await _dash(raw))["today"]
    assert [t["act_now"]["count"], t["tell_customer"]["count"], t["broken"]["count"]] == [2, 1, 1]
    assert [t["decisions"]["count"], t["decisions"]["air_upgrade"], t["decisions"]["ladder_day3"]] == [3, 2, 1]
    assert t["manual_quote"]["count"] == 1
    assert t["pos_not_acknowledged"]["count"] == 1
    assert [x["no"] for x in t["top"]] == ["S4", "S1", "S2"], "Broken first, then Act now by rank"
    assert t["act_now"]["link"] == {"page": "Shipments1", "query": "cat=act_now"}
    assert t["manual_quote"]["link"] == {"page": "Purchase_Request", "query": "pricing=needs_manual_quote"}
    assert t["pos_not_acknowledged"]["link"] == {"page": "Purchase_Order1", "query": "status=sent"}
    assert t["decisions"]["link"]["page"] == "Decisions"


# Node: 'Born-late rate (acceptance): matches a manual count for one week of POs'
@pytest.mark.asyncio
async def test_born_late_rate_matches_manual_count(raw):
    async def po(no, date_, raised, late, status="sent"):
        await raw.add_record("Purchase_Order", {"PO_No": no, "PO_Date": date_, "Lines_Raised": raised, "Lines_Born_Late": late, "PO_Status": status})

    await po("PO-1", day(0), 2, 1)
    await po("PO-2", day(0), 3, 0)
    await po("PO-3", day(0), 1, 1)
    await po("PO-4", day(0), 5, 5, "Cancelled")  # cancelled: not counted
    await po("PO-5", day(-60), 4, 4)  # far outside the weeks shown
    b = (await _dash(raw))["born_late"]
    assert [b["raised"], b["born_late"], b["rate"]] == [6, 2, 33.3], "manual count: 2 of 6 lines = 33.3 %"
    assert b["weeks"][0]["rate"] == 33.3
    assert b["link"] == {"page": "Purchase_Order1", "query": "born=late"}


# Node: 'On-time arrival: against the PLANNED arrival worked out from the PO date and the settings, overall and by supplier'
@pytest.mark.asyncio
async def test_on_time_arrival_against_planned(raw):
    from app.procurement.plan import load_settings, planned_chain
    settings = await load_settings(raw)
    po_date = day(-100)
    planned = planned_chain(settings, po_date=parse_date(po_date), production_days=20, mode="LCL")["arrival"]

    def at(offset: int) -> str:
        return ymd(add_days(planned, offset))

    await _ship(raw, Shipment_No="A", PO_Date=po_date, Stage="arrived_port", Arrived_Port_At=at(-2))
    await _ship(raw, Shipment_No="B", PO_Date=po_date, Stage="arrived_port", Arrived_Port_At=at(5), Arrival_Planned=at(5))  # the stored plan was moved by a delay report: still late
    await _ship(raw, Shipment_No="C", PO_Date=po_date, Stage="production")  # not arrived: not counted
    await _ship(raw, Shipment_No="D", PO_Date=po_date, Supplier="Fenteng Lighting", Stage="arrived_warehouse", Arrived_Warehouse_At=at(0), PO_Shipments=[{"SKU": "a"}, {"SKU": "b"}])
    o = (await _dash(raw))["on_time"]
    assert [o["lines"], o["on_time"], o["rate"]] == [4, 3, 75]
    assert [(x["supplier"], x["lines"], x["on_time"], x["rate"]) for x in o["by_supplier"]] == [("Fenteng Lighting", 2, 2, 100), ("Tony Fan", 2, 1, 50)]


# Node: 'Supplier scorecard: lead time planned vs actual, late starts, ladder rungs, reporting lag, damage rate of supplier faults'
@pytest.mark.asyncio
async def test_supplier_scorecard(raw):
    from app.procurement.plan import load_settings, planned_chain
    po_date = day(-40)
    settings = await load_settings(raw)
    planned = planned_chain(settings, po_date=parse_date(po_date), production_days=20, mode="LCL")["arrival"]
    arrived = ymd(add_days(planned, 3))
    a = await _ship(raw, Shipment_No="A", PO_Date=po_date, Stage="arrived_port", Arrived_Port_At=arrived, Production_Started_At=ymd(add_days(parse_date(po_date), 4)))  # started 3 days late
    await _ship(raw, Shipment_No="B", PO_Date=day(-5), Stage="production")  # not started by PO + 1: a late start
    for i in (1, 2):
        await raw.add_record("Ladder_Events", {"Record_Id": str(a), "Rung": i})
    await raw.add_record("Stage_Events", {"Record_Type": "shipment", "Record_Id": str(a), "Event": "shipment.production_started", "Source": "supplier", "Occurred_At": day(-10), "Reported_At": day(-7)})
    await raw.add_record("Stage_Events", {"Record_Type": "shipment", "Record_Id": str(a), "Event": "shipment.shipped_out", "Source": "user", "Occurred_At": day(-10), "Reported_At": day(0)})  # not the supplier: not counted
    await raw.add_record("Receiving", {"Supplier": "Tony Fan", "Total_Expected_Qty": 40})
    await raw.add_record("Exceptions", {"Exception_No": "E1", "Fault_Origin": "supplier", "Affected_Qty": 2, "Product_Context1": [{"Supplier": "Tony Fan"}]})
    await raw.add_record("Exceptions", {"Exception_No": "E2", "Fault_Origin": "transit", "Affected_Qty": 9, "Product_Context1": [{"Supplier": "Tony Fan"}]})
    t = next(x for x in (await _dash(raw))["scorecard"] if x["supplier"] == "Tony Fan")
    assert t["late_starts"] == 2
    assert t["ladder_rungs"] == 2
    assert t["reporting_lag_days"] == 3
    assert t["lead_actual_days"] - t["lead_planned_days"] == 3, "arrived 3 days after the plan"
    assert [t["damage_qty"], t["received_qty"], t["damage_rate_supplier_fault"]] == [2, 40, 5]


# Node: 'Pipeline: lines by stage with the oldest Order Date; Replacements: open RRs, oldest first, with the rework rate'
@pytest.mark.asyncio
async def test_pipeline_and_replacements(raw):
    await _ship(raw, Shipment_No="P1", Stage="production", Order_Date=day(-9), PO_Shipments=[{"SKU": "a"}, {"SKU": "b"}])
    await _ship(raw, Shipment_No="P2", Stage="production", Order_Date=day(-20))
    await _ship(raw, Shipment_No="S1", Stage="shipped_out", Order_Date=day(-3))
    await _ship(raw, Shipment_No="T1", Stage="customs_cleared", Order_Date=day(-30))
    await _ship(raw, Shipment_No="W1", Stage="arrived_warehouse")
    await _ship(raw, Shipment_No="R1", Stage="received", Order_Date=day(-99))
    p = {x["stage"]: x for x in (await _dash(raw))["pipeline"]}
    assert [p["production"]["lines"], p["production"]["oldest_order_date"]] == [3, day(-20)]
    assert [p["shipout"]["lines"], p["transit"]["lines"], p["transit"]["oldest_order_date"], p["receive"]["lines"]] == [1, 1, day(-30), 1]
    assert p["production"]["link"] == {"page": "Shipments1", "query": "stage=production"}
    await raw.add_record("Replacement_Request", {"RR_No": "RR-2", "RR_Status": "Open", "Order_Date": day(-5), "RR_Supplier": "Tony Fan"})
    await raw.add_record("Replacement_Request", {"RR_No": "RR-1", "RR_Status": "Acknowledged", "Order_Date": day(-50), "RR_Supplier": "HC System"})
    await raw.add_record("Replacement_Request", {"RR_No": "RR-0", "RR_Status": "Closed", "Order_Date": day(-90)})
    r = (await _dash(raw))["replacements"]
    assert r["open"] == 2
    assert [x["no"] for x in r["oldest"]] == ["RR-1", "RR-2"]
    assert "rate" in r["rework"]


# Node: 'an empty system gives empty blocks, not errors'
@pytest.mark.asyncio
async def test_empty_system_gives_empty_blocks_not_errors(raw):
    d = await _dash(raw)
    assert d["today"]["act_now"]["count"] == 0
    assert d["born_late"]["rate"] is None
    assert d["on_time"]["rate"] is None
    assert d["scorecard"] == []
    assert len(d["pipeline"]) == 4
    assert d["replacements"]["open"] == 0
