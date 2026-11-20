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


@pytest.mark.asyncio
async def test_find_by_an_id_criteria_like_the_widgets_send_works_on_real_postgres(store):
    # every widget save is updateRecords with criteria "(ID == <id>)"; the id travels as text and must be cast, not sent as a bigint parameter
    a = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-ID-1"})
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-ID-2"})
    rows = await store.find("Sales_Order_Fulfillment", criteria=f"(ID == {a})")
    assert [r["SO_No"] for r in rows] == ["SO-ID-1"]
    others = await store.find("Sales_Order_Fulfillment", criteria=f"(ID != {a})")
    assert [r["SO_No"] for r in others] == ["SO-ID-2"]


@pytest.mark.asyncio
async def test_a_lookup_inside_a_grid_row_shows_the_item_name_not_its_id_for_the_warehouse_forms(store):
    # found in the browser 2026-11-20: the Warehouse Request card showed 4900000000000000061 where the item name goes (Zoho gives { ID, display_value })
    item = await store.add_record("Items", {"item_name": "Sample Shade", "SKU": "SMP-S1"})
    wr = await store.add_record("Warehouse_Request", {"Item": [{"Items": item, "SKU": "SMP-S1"}]})
    shown = (await store.get_record_by_id("Warehouse_Request", wr))["Item"][0]
    assert shown["Items"] == {"ID": item, "display_value": "Sample Shade", "zc_display_value": "Sample Shade"} and shown["SKU"] == "SMP-S1"
    assert (await store.get_record_by_id("Warehouse_Request", wr, raw=True))["Item"][0]["Items"] == item   # raw stays the plain id (what Deluge and the hooks read)
    tw = await store.add_record("Transfer_Warehouse", {"Item_to_transfer": [{"Items": item, "SKU": "SMP-S1"}]})
    assert (await store.get_record_by_id("Transfer_Warehouse", tw))["Item_to_transfer"][0]["Items"]["display_value"] == "Sample Shade"


@pytest.mark.asyncio
async def test_a_grid_lookup_to_an_item_that_no_longer_exists_falls_back_to_the_id_and_other_grids_are_left_alone(store):
    wr = await store.add_record("Warehouse_Request", {"Item": [{"Items": "4900000000000000999", "SKU": "X"}, {"SKU": "no item on this row"}]})
    rows = (await store.get_record_by_id("Warehouse_Request", wr))["Item"]
    assert rows[0]["Items"]["display_value"] == "4900000000000000999" and "Items" not in rows[1] or not rows[1].get("Items")
    pr = await store.add_record("Purchase_Request1", {"Supplier_Load_Balancing": [{"Suppliers": "123"}]})
    assert (await store.get_record_by_id("Purchase_Request1", pr))["Supplier_Load_Balancing"][0]["Suppliers"] == "123"   # Procurement's grid is not changed
