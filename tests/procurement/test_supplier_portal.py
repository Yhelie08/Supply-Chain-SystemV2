import pytest

from app.procurement.supplier_portal import acknowledge_po, approve_rr


@pytest.fixture
async def store(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def test_acknowledge_requires_etd_and_eta(store):
    r = await acknowledge_po("Tony", {"poNo": "PO-1"}, store)
    assert r["status"] == "error"
    assert "ETD and ETA" in r["message"]


async def test_acknowledge_unknown_po_not_found(store):
    r = await acknowledge_po("Tony", {"poNo": "PO-404", "etd": "2026-12-01", "eta": "2026-12-10"}, store)
    assert r["status"] == "error"
    assert "PO not found" in r["message"]


async def test_acknowledge_confirms_the_copy_and_the_main_po_and_stamps_the_pending_shipment(store):
    po_id = await store.add_record("Purchase_Order", {"PO_No": "PO-1", "PO_Status": "Sent"}, "")
    await store.add_record("Tony_Fan_Purchase_Order", {"PO_No_Supplier2": "PO-1", "PO_Status_Supplier2": "Draft"}, "")
    ship_id = await store.add_record("Shipments", {"PO_No": po_id, "Shipment_Status": "Pending"}, "")

    r = await acknowledge_po("Tony", {"poNo": "PO-1", "etd": "2026-12-01", "eta": "2026-12-10"}, store)
    assert r["status"] == "success"
    assert "PO-1" in r["message"]

    copy = (await store.find("Tony_Fan_Purchase_Order", lambda c: c["PO_No_Supplier2"] == "PO-1"))[0]
    assert copy["PO_Status_Supplier2"] == "Confirmed"
    assert copy["Acknowledge_On_Supplier2"]

    po = await store.get_record_by_id("Purchase_Order", po_id, raw=True)
    assert po["PO_Status"] == "Confirmed"
    assert po["Acknowledge_On"]
    assert po["Po_State"] == "acknowledged"

    ship = await store.get_record_by_id("Shipments", ship_id, raw=True)
    assert ship["ETD"] == "2026-12-01"
    assert ship["ETA"] == "2026-12-10"

    events = await store.find("Stage_Events", lambda e: str(e["Record_Id"]) == str(po_id) and e["Event"] == "po.acknowledged")
    assert len(events) == 1
    assert events[0]["Source"] == "supplier"


async def test_second_acknowledge_answers_already_no_duplicate_event(store):
    po_id = await store.add_record("Purchase_Order", {"PO_No": "PO-1", "PO_Status": "Sent"}, "")
    await store.add_record("Tony_Fan_Purchase_Order", {"PO_No_Supplier2": "PO-1", "PO_Status_Supplier2": "Draft"}, "")

    await acknowledge_po("Tony", {"poNo": "PO-1", "etd": "2026-12-01", "eta": "2026-12-10"}, store)
    r = await acknowledge_po("Tony", {"poNo": "PO-1", "etd": "2026-12-02", "eta": "2026-12-11"}, store)
    assert r["status"] == "already"

    events = await store.find("Stage_Events", lambda e: str(e["Record_Id"]) == str(po_id) and e["Event"] == "po.acknowledged")
    assert len(events) == 1


async def test_acknowledge_with_no_pending_shipment_makes_one_with_the_supplier_name(store):
    po_id = await store.add_record("Purchase_Order", {"PO_No": "PO-1", "PO_Status": "Sent", "Customer": "ACME"}, "")
    await store.add_record("Fenteng_Lighting_Purchase_Order", {"PO_No_Supplier1": "PO-1", "PO_Status_Supplier1": "Draft"}, "")

    r = await acknowledge_po("Fenteng", {"poNo": "PO-1", "etd": "2026-12-01", "eta": "2026-12-10"}, store)
    assert r["status"] == "success"

    ships = await store.find("Shipments", lambda s: str(s.get("PO_No")) == str(po_id) or (isinstance(s.get("PO_No"), dict) and str(s["PO_No"].get("ID")) == str(po_id)))
    assert len(ships) == 1
    assert ships[0]["Supplier"] == "Fenteng Lighting"
    assert ships[0]["ETD"] == "2026-12-01"
    assert ships[0]["ETA"] == "2026-12-10"


async def test_approve_rr_requires_expected_ship_date_and_eta(store):
    rr_id = await store.add_record("Tony_Fan_Replacement_Request", {"RR_No": "RR-1", "RR_Status": "Open"}, "")
    r = await approve_rr("Tony", {"rrRecordId": str(rr_id)}, store)
    assert r["status"] == "error"
    assert "Expected Ship Date and ETA" in r["message"]


async def test_approve_rr_unknown_id_not_found(store):
    r = await approve_rr("Tony", {"rrRecordId": "999999", "expectedShipDate": "2026-12-01", "eta": "2026-12-10"}, store)
    assert r["status"] == "error"
    assert "not found" in r["message"]


async def test_approve_rr_already_acknowledged_refused(store):
    rr_id = await store.add_record("Tony_Fan_Replacement_Request", {"RR_No": "RR-1", "RR_Status": "Acknowledged"}, "")
    r = await approve_rr("Tony", {"rrRecordId": str(rr_id), "expectedShipDate": "2026-12-01", "eta": "2026-12-10"}, store)
    assert r["status"] == "error"
    assert "Already approved" in r["message"]


async def test_approve_rr_stamps_both_the_supplier_copy_and_the_main_rr(store):
    rr_id = await store.add_record("Fenteng_Lighting_Replacement_Request", {"RR_No": "RR-1", "RR_Status": "Open"}, "")
    main_id = await store.add_record("Replacement_Request", {"RR_No": "RR-1", "RR_Status": "Open"}, "")

    r = await approve_rr("Fenteng", {"rrRecordId": str(rr_id), "expectedShipDate": "2026-12-01", "eta": "2026-12-10"}, store)
    assert r["status"] == "success"
    assert "2026-12-01" in r["message"]
    assert "2026-12-10" in r["message"]

    copy = await store.get_record_by_id("Fenteng_Lighting_Replacement_Request", rr_id, raw=True)
    assert copy["RR_Status"] == "Acknowledged"
    assert copy["Expected_Ship_Date"] == "2026-12-01"
    assert copy["ETA"] == "2026-12-10"
    assert copy["Supplier_Acknowledgement1"] in (True, "true")

    main = await store.get_record_by_id("Replacement_Request", main_id, raw=True)
    assert main["RR_Status"] == "Acknowledged"
    assert main["Expected_Ship_Date"] == "2026-12-01"
    assert main["ETA"] == "2026-12-10"
