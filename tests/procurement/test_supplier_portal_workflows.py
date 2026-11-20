import pytest
from app.deluge import add_days, parse_date, ymd


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
    import app.procurement.purchase_request  # noqa: F401
    import app.procurement.pr_spec  # noqa: F401
    import app.procurement.supplier_portal_workflows  # noqa: F401
    return create_hooked_store(raw)


# ---------- the supplier's shipment ----------
async def _shipments(raw):
    parent = await raw.add_record("Shipments", {"Shipment_No": "SHP-00001", "Sales_Order": "SO-1", "Supplier": "Tony", "PO_Shipments": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp"}, {"PR_No": "PR-2", "SKU": "S-1", "Item_Name": "Shade"}]})
    sup = await raw.add_record("Tony_Shipment", {"Shipment_No": "SHP-00001", "Parent_Shipment_ID": str(parent), "Supplier2_Shipment_Details": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "RR_No": ""}, {"PR_No": "PR-2", "SKU": "S-1", "Item_Name": "Shade", "RR_No": ""}]})
    return parent, sup


# Node: 'ticked lines get a shipment id, go to the parent shipment In Transit, dates and mode are set, and nothing is added twice'
@pytest.mark.asyncio
async def test_select_to_ship_creates_shipment_id_and_syncs_parent(raw, store):
    from app.procurement.plan import load_settings
    parent, sup = await _shipments(raw)
    await store.update_record("Tony_Shipment", sup, {"Supplier2_Shipment_Details": [
        {"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "RR_No": "", "Select_To_Ship": True, "Shipment_Mode": "Airfreight", "Date_Shipped": "2026-12-01"},
        {"PR_No": "PR-2", "SKU": "S-1", "Item_Name": "Shade", "RR_No": "", "Select_To_Ship": False},
    ]})
    p = await raw.get_record_by_id("Shipments", parent, raw=True)
    assert [(r["Shipment_ID"], r["PR_No"], r["Status"], r["Shipment_Mode"]) for r in p["Supplier_Shipment_Details"]] == [("SHP-AIR-00001", "PR-1", "In Transit", "Airfreight")]
    assert p["Ship_Out_Date"] == "2026-12-01"
    cfg_air = await load_settings(raw)  # the days to the warehouse are the settings' (transit + customs + receiving), not a fixed 12
    air = cfg_air["transit_air_days"] + cfg_air["customs_air_days"] + cfg_air["receiving_days"]
    assert p["Estimated_Warehouse_Arrival"] == ymd(add_days(parse_date("2026-12-01"), int(air))), f"airfreight: ship date + {air} days from the settings"
    assert next(l for l in p["PO_Shipments"] if l["SKU"] == "L-1")["Shipment_Mode_When_Received"] == "Airfreight"
    s = await raw.get_record_by_id("Tony_Shipment", sup, raw=True)
    assert next(r for r in s["Supplier2_Shipment_Details"] if r["SKU"] == "L-1")["Synced"] in (True, "true")
    # saving again changes nothing
    await store.update_record("Tony_Shipment", sup, {"Added_User1": "someone"})
    p = await raw.get_record_by_id("Shipments", parent, raw=True)
    assert len(p["Supplier_Shipment_Details"]) == 1
    # the other line, by sea: the next number of ITS mode
    rows = [({**r, "Select_To_Ship": True, "Shipment_Mode": "LCL", "Date_Shipped": "2026-12-02"} if r["SKU"] == "S-1" else r) for r in s["Supplier2_Shipment_Details"]]
    await store.update_record("Tony_Shipment", sup, {"Supplier2_Shipment_Details": rows})
    p = await raw.get_record_by_id("Shipments", parent, raw=True)
    assert [r["Shipment_ID"] for r in p["Supplier_Shipment_Details"]] == ["SHP-AIR-00001", "SHP-LCL-00001"]
    cfg = await load_settings(raw)  # the days to the warehouse are the settings' (transit + customs + receiving), not a fixed 67
    sea = cfg["transit_lcl_days"] + cfg["customs_lcl_days"] + cfg["receiving_days"]
    assert p["Estimated_Warehouse_Arrival"] == ymd(add_days(parse_date("2026-12-02"), int(sea))), f"LCL: ship date + {sea} days from the settings"
    counter = (await raw.find("Shipment_ID_Counter"))[0]
    assert [int(float(counter["Air_Counter"])), int(float(counter["LCL_Counter"])), int(float(counter["FCL_Counter"]))] == [2, 2, 1]


# ---------- the supplier's Purchase Request ----------
def _answer(**extra):
    return {"Availability_Supplier2": "Available", "Initial_Price_Supplier2": 90, "Negotiated_Supplier2": 85, "Final_Price_Supplier2": 80, "Lead_Time_Supplier2": 14, **extra}


# Node: "Tony PR: the response needs its fields, then it is copied onto Tony's row of the buyer's PR"
@pytest.mark.asyncio
async def test_tony_pr_answer_validates_then_copies_to_buyer_pr(raw, store):
    from app.criteria import ZohoError
    tony = await raw.add_record("Suppliers", {"Supplier_Name": {"first_name": "Tony Fan", "last_name": ""}})
    other = await raw.add_record("Suppliers", {"Supplier_Name": {"first_name": "Fenteng Lighting", "last_name": ""}})
    await raw.add_record("Purchase_Request1", {"PR_No": "PR-1", "Supplier_Selected": [{"Suppliers": other, "Final_Price": 1}, {"Suppliers": tony, "Final_Price": 0}]})
    id_ = await raw.add_record("Tony_Fan_Purchase_Request", {"PR_No_Supplier2": "PR-1", "Supplier_Selected_Supplier2": [_answer()]})

    with pytest.raises(ZohoError, match="Required fields missing: Availability"):
        await store.update_record("Tony_Fan_Purchase_Request", id_, {"Supplier_Selected_Supplier2": [_answer(Availability_Supplier2="")]})
    with pytest.raises(ZohoError, match="Final Price, Lead Time"):
        await store.update_record("Tony_Fan_Purchase_Request", id_, {"Supplier_Selected_Supplier2": [_answer(Final_Price_Supplier2=0, Lead_Time_Supplier2=0)]})
    with pytest.raises(ZohoError, match="Editing is locked"):
        await store.update_record("Tony_Fan_Purchase_Request", id_, {"edit_counter": 0, "Supplier_Selected_Supplier2": [_answer()]})
    # cannot produce needs no prices or lead time
    await store.update_record("Tony_Fan_Purchase_Request", id_, {"Supplier_Selected_Supplier2": [_answer(Availability_Supplier2="Cannot Produce", Initial_Price_Supplier2=0, Final_Price_Supplier2=0, Lead_Time_Supplier2=0)]})

    await store.update_record("Tony_Fan_Purchase_Request", id_, {"Supplier_Selected_Supplier2": [_answer()]})
    pr = (await raw.find("Purchase_Request1"))[0]

    def _supplier_id(row):
        s = row.get("Suppliers")
        return str(s.get("ID")) if isinstance(s, dict) else str(s)

    tony_row = next(r for r in pr["Supplier_Selected"] if _supplier_id(r) == str(tony))
    assert [tony_row["Availability"], float(tony_row["Initial_Price"]), float(tony_row["Final_Price"]), float(tony_row["Lead_Time"])] == ["Available", 90, 80, 14]
    other_row = next(r for r in pr["Supplier_Selected"] if _supplier_id(r) == str(other))
    assert float(other_row["Final_Price"]) == 1, "the other supplier's row is untouched"


# Node: 'portal PR: the product image of the item is copied'
@pytest.mark.asyncio
async def test_portal_pr_copies_product_image(raw, store):
    item = await raw.add_record("Items", {"item_name": "Lamp", "SKU": "L-1", "Image": "/uploads/lamp.png"})
    id_ = await store.add_record("Fenteng_Lighting_Purchase_Request", {"PR_No_Supplier1": "PR-1", "Items_Supplier1": item})
    assert (await raw.get_record_by_id("Fenteng_Lighting_Purchase_Request", id_, raw=True))["Product_Image_Supplier1_PR"] == "/uploads/lamp.png"
