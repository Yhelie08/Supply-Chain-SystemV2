import pytest
from app.procurement.po_spec import po_state, get_born_late_rate, get_po_tracking


# Node: 'events and state: created, sent, acknowledged by the supplier; a PO is never deleted; the server fields cannot be typed'
# Real po_state branches, read from the source directly (no Node unit test exercises the pure
# function in isolation -- the Node test file only reaches it end-to-end through approve/acknowledge
# flows that belong to Task 17):
#   PO_Status == "Cancelled" -> "cancelled"
#   PO_Status == "Completed" or Completed_On set -> "closed"
#   Acknowledge_On set or PO_Status starts with "Confirmed" -> "acknowledged"
#   Sent_On set or PO_Status == "Sent" -> "sent"
#   else -> "draft"
def test_po_state_transitions_through_the_real_branches():
    assert po_state({}) == "draft"
    assert po_state({"Sent_On": "2026-01-01"}) == "sent"
    assert po_state({"PO_Status": "Sent"}) == "sent"
    assert po_state({"Acknowledge_On": "2026-01-02"}) == "acknowledged"
    assert po_state({"PO_Status": "Confirmed by supplier"}) == "acknowledged"
    assert po_state({"PO_Status": "Completed"}) == "closed"
    assert po_state({"Completed_On": "2026-01-03"}) == "closed"
    assert po_state({"PO_Status": "Cancelled"}) == "cancelled"
    # Cancelled wins even with other fields set
    assert po_state({"PO_Status": "Cancelled", "Sent_On": "2026-01-01", "Acknowledge_On": "2026-01-02"}) == "cancelled"


@pytest.mark.asyncio
async def test_before_delete_hook_refuses_to_delete_a_po(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.workflows import create_hooked_store
    from app.criteria import ZohoError
    import app.procurement.purchase_order  # noqa: F401
    import app.procurement.po_spec  # noqa: F401

    await ensure_schema(db_conn)
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    po_id = await store.add_record("Purchase_Order", {})
    with pytest.raises(ZohoError):
        await store.delete_record("Purchase_Order", po_id)


@pytest.mark.asyncio
async def test_a_po_created_and_sent_logs_po_created_and_po_sent_events(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.workflows import create_hooked_store
    import app.procurement.purchase_order  # noqa: F401
    import app.procurement.po_spec  # noqa: F401

    await ensure_schema(db_conn)
    raw = create_store(db_conn)
    store = create_hooked_store(raw)
    po_id = await store.add_record("Purchase_Order", {})
    await store.update_record("Purchase_Order", po_id, {"PO_Status": "Sent"})
    events = await raw.find("Stage_Events", lambda r: r.get("Record_Id") == str(po_id))
    assert "po.created" in [e["Event"] for e in events]
    assert "po.sent" in [e["Event"] for e in events]


@pytest.mark.asyncio
async def test_close_po_if_received_closes_when_every_line_is_fully_received(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.procurement.po_spec import close_po_if_received

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    await store.add_record("Purchase_Order", {"PO_No": "PO-9", "PO_Line_Items": [{"PR_No": "PR-1", "QTY": 10}]})
    await store.add_record("Receiving", {"PO_No": "PO-9", "Receiving_Line_Items": [{"PR_No": "PR-1", "Accepted_Qty": 10}]})
    closed = await close_po_if_received(store, "PO-9")
    assert closed is True
    po = (await store.find("Purchase_Order"))[0]
    assert po["PO_Status"] == "Completed"
    assert po["Po_State"] == "closed"


@pytest.mark.asyncio
async def test_close_po_if_received_does_nothing_when_a_line_is_short(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.procurement.po_spec import close_po_if_received

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    await store.add_record("Purchase_Order", {"PO_No": "PO-10", "PO_Line_Items": [{"PR_No": "PR-1", "QTY": 10}]})
    await store.add_record("Receiving", {"PO_No": "PO-10", "Receiving_Line_Items": [{"PR_No": "PR-1", "Accepted_Qty": 5}]})
    closed = await close_po_if_received(store, "PO-10")
    assert closed is False


# Node: 'PO-R3: the born-late rate counts lines late at the gate (even when air saved them) over lines raised, per week'
@pytest.mark.asyncio
async def test_get_born_late_rate_counts_lines_raised_vs_born_late_per_week(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    from datetime import date
    today = date.today().strftime("%Y-%m-%d")

    async def po(no, raised, late, status="sent"):
        await store.add_record("Purchase_Order", {"PO_No": no, "Lines_Raised": raised, "Lines_Born_Late": late, "PO_Status": status, "PO_Date": today})

    await po("PO-1", 2, 1)
    await po("PO-2", 3, 0)
    await po("PO-3", 1, 1)
    await po("PO-4", 5, 5, "Cancelled")  # cancelled: not counted
    res = await get_born_late_rate({"weeks": 4}, store)
    assert res["data"]["raised"] == 6
    assert res["data"]["born_late"] == 2
    assert res["data"]["rate"] == pytest.approx(33.3, abs=0.05)


# Node: "PO detail: the tracking lists the PO's shipments with planned and actual dates, the category and the event log"
@pytest.mark.asyncio
async def test_get_po_tracking_returns_empty_list_for_a_blank_po_id(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    res = await get_po_tracking({"po_id": ""}, store)
    assert res["data"]["shipments"] == []


@pytest.mark.asyncio
async def test_get_po_tracking_returns_the_shipments_of_a_real_po(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    po_id = await store.add_record("Purchase_Order", {"PO_No": "PO-20"})
    await store.add_record("Shipments", {"PO_No": po_id, "Shipment_No": "SHP-1", "Stage": "production"})
    res = await get_po_tracking({"po_id": po_id}, store)
    assert len(res["data"]["shipments"]) == 1
    assert res["data"]["shipments"][0]["shipment_no"] == "SHP-1"
