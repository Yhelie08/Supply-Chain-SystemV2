import pytest
import json
from app.deluge import add_days, ymd, today_date

TODAY = today_date()


def day(n: int) -> str:
    return ymd(add_days(TODAY, n))


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
    import app.procurement.production_portal  # noqa: F401
    return create_hooked_store(raw)


async def _a_shipment(raw, store):
    await raw.add_record("Suppliers", {"Supplier_ID": "X", "Supplier_Name": {"first_name": "Tony", "last_name": "Fan"}})
    line = {"PR_No": "PR-1", "SKU": "L-1", "Item": "Lamp", "QTY": 2, "Supplier": "Tony Fan", "Line_Total": 10, "Shipping_Mode": "LCL"}
    await raw.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-1", "SO_Created_Date": day(-10)})
    po_id = await store.add_record("Purchase_Order", {"Customer": "C", "PO_Date": day(0), "PO_Line_Items": [line]})
    return await store.add_record("Shipments", {"PO_No": po_id, "Sales_Order": "SO-1", "Supplier": "Tony Fan", "Target_Date": day(90), "PO_Shipments": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Ordered_QTY": 2, "Shipment_QTY": 2, "Shipping_Mode": "LCL"}]})


async def _with_copy(raw, store):
    from app.procurement.ship_track import refresh_supplier_view
    id_ = await _a_shipment(raw, store)
    copy = await raw.add_record("Tony_Shipment", {"Shipment_No": "SHP-X", "Parent_Shipment_ID": str(id_)})
    await refresh_supplier_view(raw, id_)
    return id_, copy


async def _ship(raw, id_):
    return await raw.get_record_by_id("Shipments", id_, raw=True)


async def _view(raw, copy):
    return await raw.get_record_by_id("Tony_Shipment", copy, raw=True)


# Node: 'Production screen: the copy shows the lines and the planned production dates, and nothing about the customer or a price'
@pytest.mark.asyncio
async def test_production_screen_shows_lines_and_planned_dates_only(raw, store):
    id_, copy = await _with_copy(raw, store)
    c = await _view(raw, copy)
    s = await _ship(raw, id_)
    assert c["Prod_Status"] == "not_started"
    assert c["Prod_Planned_Start"] == s["Production_Start_Planned"]
    assert c["Prod_Planned_End"] == s["Production_End_Planned"]
    assert "L-1 Lamp x2" in c["Prod_Lines"]
    all_text = json.dumps(c)
    assert "SO-1" not in all_text, "no Sales Order"
    assert '"Customer"' not in all_text and "Line_Total" not in all_text


# Node: 'Production screen: "production started" on the copy stamps the shipment (source supplier, the day they enter) and refreshes the copy'
@pytest.mark.asyncio
async def test_production_started_stamps_shipment_and_refreshes_copy(raw, store):
    id_, copy = await _with_copy(raw, store)
    await store.update_record("Tony_Shipment", copy, {"Report_Prod_Event": "production_started", "Report_Prod_Date": day(-2)})
    s = await _ship(raw, id_)
    assert s["Production_Started_At"] == day(-2)
    assert s["Last_Supplier_Update_At"]
    e = (await raw.find("Stage_Events", lambda x: str(x.get("Record_Id")) == str(id_) and x.get("Event") == "shipment.production_started"))[0]
    assert e["Source"] == "supplier"
    assert e["Occurred_At"] == day(-2)
    assert e["Reported_At"] and e["Reported_At"] != e["Occurred_At"], "when it happened and when we were told are two things"
    c = await _view(raw, copy)
    assert c["Prod_Status"] == "in_production"
    assert not c.get("Report_Prod_Event") and not c.get("Report_Prod_Date"), "the report fields are cleared"


# Node: 'Production screen: finishing needs a production photo (ST-R3); with the photo the shipment is finished and the photo is on the shipment'
@pytest.mark.asyncio
async def test_production_finished_needs_photo_and_photo_list_grows(raw, store):
    from app.criteria import ZohoError
    id_, copy = await _with_copy(raw, store)
    with pytest.raises(ZohoError, match="production photo"):
        await store.update_record("Tony_Shipment", copy, {"Report_Prod_Event": "production_finished", "Report_Prod_Date": day(0)})
    assert not (await _ship(raw, id_)).get("Production_Finished_At")
    with pytest.raises(ZohoError, match="JPG, PNG"):
        await store.update_record("Tony_Shipment", copy, {"Prod_Photo": "/uploads/a.exe"})
    await store.update_record("Tony_Shipment", copy, {"Prod_Photo": "/uploads/123_made.jpg"})
    assert json.loads((await _ship(raw, id_))["Production_Photos"]) == ["/uploads/123_made.jpg"], "the photo shows on the shipment (ST-R4)"
    await store.update_record("Tony_Shipment", copy, {"Prod_Photo": "/uploads/456_second.jpg"})
    assert json.loads((await _ship(raw, id_))["Production_Photos"]) == ["/uploads/123_made.jpg", "/uploads/456_second.jpg"], "a second photo adds to the list, it does not replace the first"
    await store.update_record("Tony_Shipment", copy, {"Report_Prod_Event": "production_finished", "Report_Prod_Date": day(-1)})
    s = await _ship(raw, id_)
    assert s["Production_Finished_At"] == day(-1)
    assert (await _view(raw, copy))["Prod_Status"] == "finished"


# Node: 'Production screen: a date in the future, an unknown report, or a shipment that already left Production is refused'
@pytest.mark.asyncio
async def test_future_date_unknown_report_or_left_production_refused(raw, store):
    from app.criteria import ZohoError
    id_, copy = await _with_copy(raw, store)
    with pytest.raises(ZohoError, match="future"):
        await store.update_record("Tony_Shipment", copy, {"Report_Prod_Event": "production_started", "Report_Prod_Date": day(3)})
    with pytest.raises(ZohoError, match="Unknown"):
        await store.update_record("Tony_Shipment", copy, {"Report_Prod_Event": "shipped_out"})
    with pytest.raises(ZohoError, match="what happened"):
        await store.update_record("Tony_Shipment", copy, {"Report_Prod_Date": day(0)})
    await raw.update_record("Shipments", id_, {"Stage": "shipped_out"}, by_form=True)
    with pytest.raises(ZohoError, match="left Production"):
        await store.update_record("Tony_Shipment", copy, {"Report_Prod_Event": "production_started"})
    assert not (await _ship(raw, id_)).get("Production_Started_At")
