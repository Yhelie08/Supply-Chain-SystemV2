import pytest
from app.deluge import id_of


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


def _text(v) -> str:
    return "" if v is None else str(v)


async def _seed_replacement(raw, *, supplier="Tony", source_module="Receiving", rr_status="Acknowledged", po_no="PO-00001", exc_no="EXC-1", qty=2, existing_recv=True):
    po = await raw.add_record("Purchase_Order", {"PO_No": po_no, "Customer": "ACME"})
    orig_ship = await raw.add_record("Shipments", {
        "Shipment_No": "SHP-00001", "PO_No": po, "Sales_Order": "SO-1", "Customer": "ACME", "Supplier": supplier,
        "Shipment_Status": "Delivered", "Sales_Owner": "HC Sales 1", "Target_Date": "2026-11-01", "Supplier_Target_Date": "2026-10-20",
        "PO_Shipments": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Shipment_QTY": 5, "Shipping_Mode": "Sea"}],
    })
    recv = None
    if existing_recv:
        recv = await raw.add_record("Receiving", {
            "Receive_No1": "RCV-00001", "Shipments": orig_ship, "SO_No": "SO-1", "PO_No": po_no, "Customer_Name": "ACME", "Supplier": supplier,
            "Receiving_Line_Items": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Expected_Qty": 5, "Accepted_Qty": 3}],
        })
    await raw.add_record("Exceptions", {"Exception_No": exc_no, "PO_No": po_no, "Source_Module": "Receiving"})
    rr_no = "RR-00001"
    rr = await raw.add_record("Replacement_Request", {
        "RR_No": rr_no, "RR_Supplier": supplier, "Source_Module": source_module, "Source_Exception_No": exc_no,
        "RR_SKU": "L-1", "RR_Item_Name": "Lamp", "RR_Qty_Value": qty, "RR_PR_No": "PR-1", "RR_SO": "SO-1",
        "Expected_Ship_Date": "2026-12-01", "ETA": "2026-12-10", "RR_Status": rr_status,
    })
    copy_form = "Fenteng_Lighting_Replacement_Request" if "Fenteng" in supplier else "Tony_Fan_Replacement_Request"
    await raw.add_record(copy_form, {"RR_No": rr_no, "RR_Status": rr_status, "Shipment_Mode": "Air" if "Fenteng" in supplier else "Sea"})
    return {"po": po, "orig_ship": orig_ship, "recv": recv, "rr": rr, "rr_no": rr_no}


# Node: 'clone_shipment_for_replacement creates a replacement shipment reusing the RCV'
@pytest.mark.asyncio
async def test_clone_shipment_creates_replacement_reusing_rcv(raw):
    from app.procurement.clone_shipment import clone_shipment_for_replacement
    seeded = await _seed_replacement(raw)
    out = await clone_shipment_for_replacement({"rrRecordId": seeded["rr"]}, raw)
    assert out["status"] == "success"
    new_ship = await raw.get_record_by_id("Shipments", out["shipmentId"], raw=True)
    assert new_ship["Shipment_No"].startswith("SHP-")
    assert new_ship["Shipment_Status"] == "Pending"
    assert new_ship["Supplier"] == "Tony"
    assert new_ship["ETD"] == "2026-12-01"
    assert new_ship["ETA"] == "2026-12-10"
    assert len(new_ship["PO_Shipments"]) == 1
    assert int(float(new_ship["PO_Shipments"][0]["Shipment_QTY"])) == 2
    assert new_ship["PO_Shipments"][0]["Shipping_Mode"] == "Sea"
    assert new_ship["Receiving_Record_Created"] is True
    # the SAME receiving record is re-pointed at the new shipment; its Expected_Qty is left alone
    r = await raw.get_record_by_id("Receiving", seeded["recv"], raw=True)
    assert id_of(r["Shipments"]) == str(out["shipmentId"])
    assert int(float(r["Receiving_Line_Items"][0]["Expected_Qty"])) == 5
    assert len(await raw.find("Receiving")) == 1
    # the RR remembers the cloned shipment, and the supplier gets its own copy
    rr_rec = await raw.get_record_by_id("Replacement_Request", seeded["rr"], raw=True)
    assert rr_rec["Cloned_Shipment_No"] == new_ship["Shipment_No"]
    copies = await raw.find("Tony_Shipment", lambda c: _text(c.get("Parent_Shipment_ID")) == str(out["shipmentId"]))
    assert len(copies) == 1
    assert len(copies[0]["Supplier2_Shipment_Details"]) == 1


# Node: 'cloning twice for one RR is refused (already logged)'
@pytest.mark.asyncio
async def test_cloning_twice_for_one_rr_is_refused(raw):
    from app.procurement.clone_shipment import clone_shipment_for_replacement
    seeded = await _seed_replacement(raw)
    await clone_shipment_for_replacement({"rrRecordId": seeded["rr"]}, raw)
    second = await clone_shipment_for_replacement({"rrRecordId": seeded["rr"]}, raw)
    assert second["status"] == "error"
    assert "already logged" in second["message"]
    assert len(await raw.find("Shipments")) == 2  # original + one clone, no third


# Node: 'an RR the supplier has not acknowledged cannot be cloned'
@pytest.mark.asyncio
async def test_unacknowledged_rr_cannot_be_cloned(raw):
    from app.procurement.clone_shipment import clone_shipment_for_replacement
    seeded = await _seed_replacement(raw, rr_status="Open")
    out = await clone_shipment_for_replacement({"rrRecordId": seeded["rr"]}, raw)
    assert out["status"] == "error"
    assert "Acknowledged" in out["message"]
    assert len(await raw.find("Shipments")) == 1  # only the original


# Node: 'a Fulfillment EXC clone makes a NEW receiving with explicit totals and the supplier copy'
@pytest.mark.asyncio
async def test_fulfillment_exc_clone_makes_new_receiving_with_totals(raw):
    from app.procurement.clone_shipment import clone_shipment_for_replacement
    seeded = await _seed_replacement(raw, supplier="Fenteng", source_module="Fulfillment EXC", po_no="PO-00002", exc_no="EXC-2", qty=4, existing_recv=False)
    out = await clone_shipment_for_replacement({"rrRecordId": seeded["rr"]}, raw)
    assert out["status"] == "success"
    recvs = await raw.find("Receiving", lambda r: id_of(r.get("Shipments")) == str(out["shipmentId"]))
    assert len(recvs) == 1
    nr = recvs[0]
    assert nr["Receive_No1"].startswith("RCV-")
    assert int(float(nr["Total_Expected_Qty"])) == 4
    assert int(float(nr["Total_Accepted_Qty"])) == 0
    assert int(float(nr["Total_Lines"])) == 1
    assert int(float(nr["Incomplete_Lines"])) == 1
    assert nr["Receive_Status"] == "Pending"
    assert nr["Source_Module"] == "Fulfillment EXC"
    assert nr["Receiving_Line_Items"][0]["Shipment_Mode_When_Received"] == "Air"
    copies = await raw.find("Fenteng_Shipment", lambda c: _text(c.get("Parent_Shipment_ID")) == str(out["shipmentId"]))
    assert len(copies) == 1


# Node: 'an unknown RR id returns error'
@pytest.mark.asyncio
async def test_unknown_rr_id_returns_error(raw):
    from app.procurement.clone_shipment import clone_shipment_for_replacement
    out = await clone_shipment_for_replacement({"rrRecordId": "4662244000099999999"}, raw)
    assert out["status"] == "error"
    assert "Replacement Request not found" in out["message"]
