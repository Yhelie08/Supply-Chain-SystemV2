import pytest

from app.schema import ensure_schema
from app.store import create_store


@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.mark.asyncio
async def test_add_record_then_get_record_by_id_round_trips(store):
    record_id = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-1", "Fulfillment_Stage": "Waiting For Package"})
    assert isinstance(record_id, str)
    rec = await store.get_record_by_id("Sales_Order_Fulfillment", record_id, raw=True)
    assert rec["SO_No"] == "SO-1"
    assert rec["Fulfillment_Stage"] == "Waiting For Package"


@pytest.mark.asyncio
async def test_update_record_preserves_fields_not_touched_by_the_update(store):
    record_id = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-2", "Package": "PAC-2"})
    await store.update_record("Sales_Order_Fulfillment", record_id, {"Fulfillment_Stage": "Order Readiness"}, by_form=True)
    rec = await store.get_record_by_id("Sales_Order_Fulfillment", record_id, raw=True)
    assert rec["Package"] == "PAC-2"  # untouched by the update, still present
    assert rec["Fulfillment_Stage"] == "Order Readiness"


@pytest.mark.asyncio
async def test_get_records_returns_newest_first(store):
    id1 = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-A"})
    id2 = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-B"})
    rows = await store.get_records("Sales_Order_Fulfillment_Report")
    ids = [r["ID"] for r in rows]
    assert ids.index(id2) < ids.index(id1)  # newer (higher ID) comes first


@pytest.mark.asyncio
async def test_get_record_by_id_raises_zoho_error_9280_when_not_found(store):
    from app.criteria import ZohoError
    with pytest.raises(ZohoError) as exc:
        await store.get_record_by_id("Sales_Order_Fulfillment", "999999999999999999")
    assert exc.value.code == 9280


@pytest.mark.asyncio
async def test_delete_record_removes_it(store):
    record_id = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-DEL"})
    await store.delete_record("Sales_Order_Fulfillment", record_id)
    from app.criteria import ZohoError
    with pytest.raises(ZohoError):
        await store.get_record_by_id("Sales_Order_Fulfillment", record_id)


@pytest.mark.asyncio
async def test_find_with_a_python_predicate_and_no_criteria(store):
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-X", "Fulfillment_Stage": "Picking"})
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-Y", "Fulfillment_Stage": "Crate"})
    rows = await store.find("Sales_Order_Fulfillment", lambda r: r["Fulfillment_Stage"] == "Picking")
    assert len(rows) == 1
    assert rows[0]["SO_No"] == "SO-X"


@pytest.mark.asyncio
async def test_find_with_a_criteria_string_filters_at_the_database(store):
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-P", "Fulfillment_Stage": "Picking"})
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-Q", "Fulfillment_Stage": "Crate"})
    rows = await store.find("Sales_Order_Fulfillment", criteria='(SO_No == "SO-P")')
    assert len(rows) == 1
    assert rows[0]["SO_No"] == "SO-P"


@pytest.mark.asyncio
async def test_next_number_is_sequential_and_zero_padded(store):
    n1 = await store.next_number("Purchase_Order", "PO_No", "PO-", 5)
    n2 = await store.next_number("Purchase_Order", "PO_No", "PO-", 5)
    assert n1 == "PO-00001"
    assert n2 == "PO-00002"


@pytest.mark.asyncio
async def test_table_counts_only_lists_nonempty_tables(store):
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-COUNT"})
    counts = await store.table_counts()
    sof_count = next((c for c in counts if c["form"] == "Sales_Order_Fulfillment"), None)
    assert sof_count is not None
    assert sof_count["rows"] >= 1


@pytest.mark.asyncio
async def test_a_lookup_field_gets_a_display_value_resolved_from_the_looked_up_record(store):
    customer_id = await store.add_record("Customer", {"customer_name": "Acme Corp"})
    package_id = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-LOOKUP", "Customer": customer_id})
    rec = await store.get_record_by_id("Sales_Order_Fulfillment", package_id)
    assert rec["Customer"]["ID"] == customer_id
    assert rec["Customer"]["display_value"] == "Acme Corp"


@pytest.mark.asyncio
async def test_raw_mode_returns_the_bare_lookup_id_not_a_display_object(store):
    customer_id = await store.add_record("Customer", {"customer_name": "Acme Corp"})
    package_id = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-LOOKUP2", "Customer": customer_id})
    rec = await store.get_record_by_id("Sales_Order_Fulfillment", package_id, raw=True)
    assert rec["Customer"] == customer_id


@pytest.mark.asyncio
async def test_for_crate_boolean_round_trip(store):
    record_id = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-BOOL", "For_Crate": True})
    rec = await store.get_record_by_id("Sales_Order_Fulfillment", record_id, raw=True)
    assert rec["For_Crate"] is True
    record_id2 = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-BOOL2"})
    rec2 = await store.get_record_by_id("Sales_Order_Fulfillment", record_id2, raw=True)
    assert rec2["For_Crate"] is False


@pytest.mark.asyncio
async def test_an_unrecognized_field_name_is_stored_in_extra_and_still_comes_back(store):
    record_id = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-EXTRA", "Totally_Made_Up_Field": "keep-me"})
    rec = await store.get_record_by_id("Sales_Order_Fulfillment", record_id, raw=True)
    assert rec["Totally_Made_Up_Field"] == "keep-me"
    # A later update that does not mention the unknown field must not drop it.
    await store.update_record("Sales_Order_Fulfillment", record_id, {"Package": "PAC-EXTRA"}, by_form=True)
    rec2 = await store.get_record_by_id("Sales_Order_Fulfillment", record_id, raw=True)
    assert rec2["Totally_Made_Up_Field"] == "keep-me"
    assert rec2["Package"] == "PAC-EXTRA"
