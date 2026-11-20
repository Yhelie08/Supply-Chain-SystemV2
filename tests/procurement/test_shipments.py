import pytest

LAMP = {"PR_No": "PR-1", "SKU": "L-1", "Item": "Lamp", "QTY": 2, "Supplier": "Tony", "Line_Total": 10, "Shipping_Mode": "Air"}
SHADE = {"PR_No": "PR-2", "SKU": "S-1", "Item": "Shade", "QTY": 1, "Supplier": "Tony", "Line_Total": 5, "Shipping_Mode": "Air"}


def ship_row(l: dict, qty) -> dict:
    return {"PR_No": l["PR_No"], "SKU": l["SKU"], "Item_Name": l["Item"], "Ordered_QTY": l["QTY"], "Shipment_QTY": qty}


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def store(raw):
    from app.workflows import create_hooked_store
    import app.procurement.purchase_order  # noqa: F401
    import app.procurement.shipments  # noqa: F401
    return create_hooked_store(raw)


async def _po_with(raw, store, lines):
    so = await raw.add_record("Sales_Order", {"Sales_Order_Number": "SO-77"})
    return await store.add_record("Purchase_Order", {"SO_No": so, "Customer": "Sample Customer", "PO_Line_Items": lines})


# Node: 'Shipment: number, SO / customer / single supplier from the PO, and ONE Receiving record with the lines'
@pytest.mark.asyncio
async def test_shipment_number_so_customer_supplier_and_one_receiving_record(raw, store):
    po_id = await _po_with(raw, store, [LAMP, SHADE])
    id_ = await store.add_record("Shipments", {"PO_No": po_id, "PO_Shipments": [ship_row(LAMP, 2), ship_row(SHADE, 1)]})
    ship = await raw.get_record_by_id("Shipments", id_, raw=True)
    assert ship["Shipment_No"] == "SHP-00001"
    assert ship["Sales_Order"] == "SO-77"
    assert ship["Customer"] == "Sample Customer"
    assert ship["Supplier"] == "Tony"
    assert ship["Receiving_Record_Created"] is True
    rcv = await raw.find("Receiving")
    assert len(rcv) == 1
    assert rcv[0]["SO_No"] == "SO-77"
    assert rcv[0]["Supplier"] == "Tony"
    assert [(l["PR_No"], l["SKU"], float(l["Expected_Qty"])) for l in rcv[0]["Receiving_Line_Items"]] == [("PR-1", "L-1", 2), ("PR-2", "S-1", 1)]


# Node: 'a mixed-supplier PO leaves the shipment supplier alone'
@pytest.mark.asyncio
async def test_mixed_supplier_po_leaves_shipment_supplier_blank(raw, store):
    po_id = await _po_with(raw, store, [LAMP, {**SHADE, "Supplier": "Fenteng"}])
    id_ = await store.add_record("Shipments", {"PO_No": po_id, "PO_Shipments": [ship_row(LAMP, 2)]})
    assert not (await raw.get_record_by_id("Shipments", id_, raw=True)).get("Supplier")


# Node: 'a second shipment of the same PO re-uses the Receiving record (no duplicate, lines untouched)'
@pytest.mark.asyncio
async def test_second_shipment_for_a_po_with_existing_receiving_repoints_not_duplicates(raw, store):
    po_id = await _po_with(raw, store, [LAMP])
    first = await store.add_record("Shipments", {"PO_No": po_id, "PO_Shipments": [ship_row(LAMP, 2)]})
    second = await store.add_record("Shipments", {"PO_No": po_id, "PO_Shipments": [ship_row(LAMP, 1)]})
    rcv = await raw.find("Receiving")
    assert len(rcv) == 1
    assert str(rcv[0]["Shipments"]) == str(second), "pointed at the shipment in flight"
    assert first and len(rcv[0]["Receiving_Line_Items"]) == 1
    assert float(rcv[0]["Receiving_Line_Items"][0]["Expected_Qty"]) == 2, "Expected_Qty stays the original order quantity"
    assert (await raw.get_record_by_id("Shipments", second, raw=True))["Shipment_No"] == "SHP-00002"


# Node: 'editing a shipment: Receiving follows it, new lines are added, existing lines keep Expected_Qty, shipment mode flows down'
@pytest.mark.asyncio
async def test_editing_a_shipment_adds_lines_and_keeps_expected_qty(raw, store):
    po_id = await _po_with(raw, store, [LAMP, SHADE])
    id_ = await store.add_record("Shipments", {"PO_No": po_id, "PO_Shipments": [ship_row(LAMP, 2)]})
    await store.update_record("Shipments", id_, {"PO_Shipments": [{**ship_row(LAMP, 1), "Shipment_Mode_When_Received": "Sea"}, ship_row(SHADE, 1)]})
    r = (await raw.find("Receiving"))[0]
    assert len(r["Receiving_Line_Items"]) == 2
    l1 = next(l for l in r["Receiving_Line_Items"] if l["SKU"] == "L-1")
    assert float(l1["Expected_Qty"]) == 2, "the existing line is not overwritten with the shipment quantity 1"
    assert l1["Shipment_Mode_When_Received"] == "Sea"
    assert float(next(l for l in r["Receiving_Line_Items"] if l["SKU"] == "S-1")["Expected_Qty"]) == 1


# Node: 'shipment line status goes back to the supplier copy (Tony), matched by PR_No + SKU'
@pytest.mark.asyncio
async def test_shipment_line_status_syncs_back_to_tony_copy(raw, store):
    po_id = await _po_with(raw, store, [LAMP])
    id_ = await store.add_record("Shipments", {"PO_No": po_id, "PO_Shipments": [ship_row(LAMP, 2)]})
    await raw.add_record("Tony_Shipment", {"Parent_Shipment_ID": str(id_), "Supplier2_Shipment_Details": [{"PR_No": "PR-1", "SKU": "L-1", "Status": "In Transit"}, {"PR_No": "PR-9", "SKU": "X", "Status": "In Transit"}]})
    await store.update_record("Shipments", id_, {"PO_Shipments": [{**ship_row(LAMP, 2), "Line_Status": "Arrived"}]})
    t = (await raw.find("Tony_Shipment"))[0]
    assert [r["Status"] for r in t["Supplier2_Shipment_Details"]] == ["Arrived", "In Transit"]


# Node: 'shipment status change keeps the previous status'
@pytest.mark.asyncio
async def test_shipment_status_change_keeps_the_previous_status(raw, store):
    po_id = await _po_with(raw, store, [LAMP])
    id_ = await store.add_record("Shipments", {"PO_No": po_id, "Shipment_Status": "In Transit", "PO_Shipments": [ship_row(LAMP, 2)]})
    await store.update_record("Shipments", id_, {"Shipment_Status": "Arrived"})
    assert (await raw.get_record_by_id("Shipments", id_, raw=True))["Previous_Status"] == "In Transit"
