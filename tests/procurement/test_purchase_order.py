# Node: 'PO: number, totals, mixed shipping and the status dates'
import pytest


@pytest.mark.asyncio
async def test_po_number_totals_mixed_shipping_and_status_dates(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.workflows import create_hooked_store
    import app.procurement.purchase_order  # noqa: F401

    await ensure_schema(db_conn)
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    a = await store.add_record("Purchase_Order", {"PO_Line_Items": [
        {"Line_Total": 10.5, "Shipping_Mode": "Air"}, {"Line_Total": 4.25, "Shipping_Mode": "Sea"}, {"Shipping_Mode": "Air"},
    ]})
    po = await raw.get_record_by_id("Purchase_Order", a, raw=True)
    assert po["PO_No"] == "PO-00001"
    assert float(po["Total_PO_Value"]) == 14.75
    assert int(po["Total_Lines"]) == 3
    assert po["Mixed_Shipping"] in (True, "true")
    b = await store.add_record("Purchase_Order", {"PO_Line_Items": [
        {"Line_Total": 1, "Shipping_Mode": "Air"}, {"Line_Total": 2, "Shipping_Mode": "Air"},
    ]})
    po2 = await raw.get_record_by_id("Purchase_Order", b, raw=True)
    assert po2["PO_No"] == "PO-00002"
    assert po2["Mixed_Shipping"] in (False, "false", None, "")
    assert not po2.get("Sent_On")
    await store.update_record("Purchase_Order", b, {"PO_Status": "Sent"})
    sent = (await raw.get_record_by_id("Purchase_Order", b, raw=True))["Sent_On"]
    assert sent
    await store.update_record("Purchase_Order", b, {"Notes": "later edit"})
    assert (await raw.get_record_by_id("Purchase_Order", b, raw=True))["Sent_On"] == sent, "a later save keeps the date"
    await store.update_record("Purchase_Order", b, {"PO_Status": "Completed"})
    assert (await raw.get_record_by_id("Purchase_Order", b, raw=True))["Completed_On"]


@pytest.mark.asyncio
async def test_fenteng_copy_gets_its_own_number_when_added_by_hand(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.workflows import create_hooked_store
    import app.procurement.purchase_order  # noqa: F401

    await ensure_schema(db_conn)
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    await store.add_record("Purchase_Order", {})  # PO-00001
    f = await store.add_record("Fenteng_Lighting_Purchase_Order", {"PO_Line_Items_Supplier1": [{"Line_Total_Supplier1": 5, "Shipping_Mode_Supplier1": "Air"}]})
    row = await raw.get_record_by_id("Fenteng_Lighting_Purchase_Order", f, raw=True)
    assert row["PO_No_Supplier1"] == "PO-00002"
    assert float(row["Total_PO_Value_Supplier1"]) == 5
