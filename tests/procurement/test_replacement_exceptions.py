import pytest


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def store(raw):
    from app.workflows import create_hooked_store
    import app.procurement.replacement_exceptions  # noqa: F401
    return create_hooked_store(raw)


# Node: 'RR: number, Open + date on add; Closed needs the notes and the reason; Closed_At / acknowledge date on the change'
@pytest.mark.asyncio
async def test_rr_number_open_on_add_and_closed_validation(raw, store):
    from app.criteria import ZohoError
    rr_id = await store.add_record("Replacement_Request", {"RR_Status": "Closed", "RR_Reason": "damaged", "Closure_Notes": "x"})
    rr = await raw.get_record_by_id("Replacement_Request", rr_id, raw=True)
    assert rr["RR_No"] == "RR-00001"
    assert rr["RR_Status"] == "Open", "a new RR always starts Open"
    assert rr["RR_Date"]
    await store.update_record("Replacement_Request", rr_id, {"RR_Status": "Acknowledged"})
    assert (await raw.get_record_by_id("Replacement_Request", rr_id, raw=True))["Supplier_Acknowledge_Date"]
    with pytest.raises(ZohoError, match="Closure Notes are required"):
        await store.update_record("Replacement_Request", rr_id, {"RR_Status": "Closed", "Closure_Notes": "", "RR_Reason": "damaged"})
    with pytest.raises(ZohoError, match="RR Reason is required"):
        await store.update_record("Replacement_Request", rr_id, {"RR_Status": "Closed", "Closure_Notes": "done", "RR_Reason": ""})
    await store.update_record("Replacement_Request", rr_id, {"RR_Status": "Closed", "Closure_Notes": "done", "RR_Reason": "damaged"})
    closed = await raw.get_record_by_id("Replacement_Request", rr_id, raw=True)
    assert closed["RR_Status"] == "Closed"
    assert closed["Closed_At"]


# Node: 'Tony RR copy: its number continues the MAIN RR sequence and Last_Updated is stored'
@pytest.mark.asyncio
async def test_tony_rr_copy_continues_main_sequence_and_stores_last_updated(raw, store):
    await store.add_record("Replacement_Request", {})
    copy_id = await store.add_record("Tony_Fan_Replacement_Request", {})
    rr = await raw.get_record_by_id("Tony_Fan_Replacement_Request", copy_id, raw=True)
    assert rr["RR_No"] == "RR-00002"
    assert rr["RR_Status"] == "Open"
    assert rr["Last_Updated"]


# Node: 'Exception: number and Open on add; Resolved needs the action; Closed only after Resolved'
@pytest.mark.asyncio
async def test_exception_number_open_resolved_then_closed(raw, store):
    from app.criteria import ZohoError
    exc_id = await store.add_record("Exceptions", {"Exception_Title": "Broken glass"})
    exc = await raw.get_record_by_id("Exceptions", exc_id, raw=True)
    assert exc["Exception_No"] == "EXC-00001"
    assert exc["Exception_Status"] == "Open"
    assert exc["Opened_On"]
    with pytest.raises(ZohoError, match="Resolution Action is required"):
        await store.update_record("Exceptions", exc_id, {"Exception_Status": "Resolved"})
    with pytest.raises(ZohoError, match="must be Resolved first"):
        await store.update_record("Exceptions", exc_id, {"Exception_Status": "Closed"})
    await store.update_record("Exceptions", exc_id, {"Exception_Status": "Resolved", "Resolution_Action": "Replaced"})
    await store.update_record("Exceptions", exc_id, {"Exception_Status": "Closed"})
    assert (await raw.get_record_by_id("Exceptions", exc_id, raw=True))["Exception_Status"] == "Closed"
    second_id = await store.add_record("Exceptions", {})
    assert (await raw.get_record_by_id("Exceptions", second_id, raw=True))["Exception_No"] == "EXC-00002"


# Node: 'Fulfillment Create RR: the RR lands in the Procurement Replacement_Request, and the supplier copy ends with the SAME number'
@pytest.mark.asyncio
async def test_fulfillment_create_rr_copy_keeps_the_main_number_after_a_follow_up_edit(raw, store):
    main = await store.add_record("Replacement_Request", {"RR_No": "RR-00001", "RR_Date": "2026-11-14", "RR_Status": "Open", "Source_Type": "QC Failure", "Source_Module": "Fulfillment EXC", "Source_Exception_No": "EXC-FF-00007", "RR_Supplier": "Tony", "RR_SKU": "L-1", "RR_SO": "SO-1", "RR_PAC": "PAC-1", "Replacement_Summary": [{"PR_No": "PR-1", "SKU": "L-1", "RR_Qty": 1}]})
    copy = await store.add_record("Tony_Fan_Replacement_Request", {"RR_No": "RR-00001", "RR_Status": "Open", "Source_Module": "Fulfillment EXC", "Source_Exception_No": "EXC-FF-00007", "RR_SO": "SO-1", "Replacement_Summary": [{"PR_No": "PR-1", "SKU": "L-1", "RR_Qty": 1}]})
    await store.update_record("Tony_Fan_Replacement_Request", copy, {"RR_No": "RR-00001"})
    m = await raw.get_record_by_id("Replacement_Request", main, raw=True)
    c = await raw.get_record_by_id("Tony_Fan_Replacement_Request", copy, raw=True)
    assert m["RR_No"] == "RR-00001"
    assert m["RR_Status"] == "Open"
    assert m["Source_Exception_No"] == "EXC-FF-00007"
    assert c["RR_No"] == "RR-00001", "the follow-up edit keeps the main number on the copy"
    assert len(await raw.find("Replacement_Request")) == 1, "one RR in Procurement"
