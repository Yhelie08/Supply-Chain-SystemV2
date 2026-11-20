import pytest
from app.procurement.receiving import is_ready


def test_is_ready_requires_both_counted_and_binned():
    assert is_ready({"Accepted_Qty": 3, "Damage_Qty": 0, "Missing_Qty": 0, "Expected_Qty": 3, "Bin_location": "A-01"}) is True
    assert is_ready({"Accepted_Qty": 3, "Damage_Qty": 0, "Missing_Qty": 0, "Expected_Qty": 3, "Bin_location": ""}) is False
    assert is_ready({"Accepted_Qty": 1, "Damage_Qty": 0, "Missing_Qty": 0, "Expected_Qty": 3, "Bin_location": "A-01"}) is False
    assert is_ready({"Accepted_Qty": 3, "Damage_Qty": 0, "Missing_Qty": 0, "Expected_Qty": 3, "Bin_location": "Receiving Area"}) is False


# Node: 'totals, line result and receive status; the shipment becomes Delivered'
@pytest.mark.asyncio
async def test_totals_line_result_and_receive_status_and_shipment_becomes_delivered(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.workflows import create_hooked_store
    import app.procurement.receiving  # noqa: F401
    import app.procurement.ship_track  # noqa: F401

    await ensure_schema(db_conn)
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    ship = await raw.add_record("Shipments", {"Shipment_No": "SHP-00001", "Supplier": "Tony", "Shipment_Status": "In Transit"})

    def line(**extra):
        return {"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Expected_Qty": 3, **extra}

    rcv_id = await store.add_record("Receiving", {"Shipments": ship, "Receiving_Line_Items": [
        line(Accepted_Qty=3), line(PR_No="PR-2", SKU="S-1", Expected_Qty=2, Accepted_Qty=1),
    ]})
    r = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    assert r["Receive_No1"] == "RCV-00001"
    assert [float(r["Total_Expected_Qty"]), float(r["Total_Accepted_Qty"]), float(r["Total_Lines"])] == [5, 4, 2]
    assert [l["Line_Result"] for l in r["Receiving_Line_Items"]] == ["Complete", "Incomplete"]
    assert r["Receive_Status"] == "Partial Received"
    s = await raw.get_record_by_id("Shipments", ship, raw=True)
    assert s["Shipment_Status"] == "Delivered"
    assert s["Previous_Status"] == "In Transit"


# Node: 'more than expected is refused'
@pytest.mark.asyncio
async def test_accepted_qty_more_than_expected_is_refused(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.workflows import create_hooked_store
    from app.criteria import ZohoError
    import app.procurement.receiving  # noqa: F401
    import app.procurement.ship_track  # noqa: F401

    await ensure_schema(db_conn)
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    with pytest.raises(ZohoError, match="cannot exceed Expected Qty"):
        await store.add_record("Receiving", {"Receiving_Line_Items": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Expected_Qty": 3, "Accepted_Qty": 3, "Damage_Qty": 1}]})


# Node: 'Create Exception: one exception per damaged / missing line, found again on the next save (never a second one), Need Attention on the shipment'
@pytest.mark.asyncio
async def test_create_exception_requested_makes_one_exception_and_sets_need_attention(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.workflows import create_hooked_store
    import app.procurement.receiving  # noqa: F401
    import app.procurement.ship_track  # noqa: F401

    await ensure_schema(db_conn)
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    ship = await raw.add_record("Shipments", {"Shipment_No": "SHP-00001", "Supplier": "Tony", "Shipment_Status": "In Transit"})
    lines = [
        {"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Expected_Qty": 3, "Accepted_Qty": 1, "Damage_Qty": 2},
        {"PR_No": "PR-2", "SKU": "S-1", "Item_Name": "Lamp", "Expected_Qty": 2, "Accepted_Qty": 2},
    ]
    rcv_id = await store.add_record("Receiving", {"Shipments": ship, "SO_No": "SO-5", "PO_No": "PO-00001", "Create_Exception_Requested": True, "Receiving_Line_Items": lines})
    exc = await raw.find("Exceptions")
    assert len(exc) == 1
    assert exc[0]["Exception_No"] == "EXC-00001"
    assert exc[0]["Source_Module"] == "Receiving"
    assert exc[0]["Exception_Status"] == "Open"
    assert exc[0]["Exception_Line_Key"] == "RCV-00001||L-1"
    r = await raw.get_record_by_id("Receiving", rcv_id, raw=True)
    assert int(r["Exception_Count"]) == 1
    ship_rec = await raw.get_record_by_id("Shipments", ship, raw=True)
    assert ship_rec["Need_Attention1"] in (True, "true")
    # ticking it again re-uses the exception
    await store.update_record("Receiving", rcv_id, {"Create_Exception_Requested": True})
    assert len(await raw.find("Exceptions")) == 1


# Node: 'quantity mismatch notification: one per receiving record, not one per save'
@pytest.mark.asyncio
async def test_quantity_mismatch_notification_fires_once_per_receiving_record(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.workflows import create_hooked_store
    import app.procurement.receiving  # noqa: F401
    import app.procurement.ship_track  # noqa: F401

    await ensure_schema(db_conn)
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    rcv_id = await store.add_record("Receiving", {"Receiving_Line_Items": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Expected_Qty": 3, "Accepted_Qty": 1}]})
    assert len(await raw.find("App_Notifications")) == 1
    await store.update_record("Receiving", rcv_id, {"Receiving_Notes": "x"})
    await store.update_record("Receiving", rcv_id, {"Receiving_Notes": "y"})
    assert len(await raw.find("App_Notifications")) == 1
