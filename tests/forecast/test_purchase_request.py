from datetime import date, timedelta

import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
from app.forecast.purchase_request import fc_stamp_purchase_request, fc_pr_to_pre_order
from app.forecast.stamp import NULL_TEXT
import app.forecast.pr_hooks  # noqa: F401 -- import registers the Purchase_Request1 hook

TODAY = date(2026, 11, 12)


@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def _added_on(db_conn, form, id_, text):
    # Added_Time is system-managed (store.update_record silently drops it) -- same raw-SQL backdoor
    # used in tests/forecast/test_stamp.py, needed here because the ladder anchors on this field.
    await db_conn.execute(f'UPDATE "{form}" SET "Added_Time" = $1 WHERE "ID" = $2::bigint', text, int(id_))


async def _pr(store, db_conn, extra=None, added="2026-11-01 08:00:00 AM"):
    extra = extra or {}
    id_ = await store.add_record("Purchase_Request1", {"PR_No": "PR-1", "Shipment_Mode": "Air", "Sourcing_Type": "Import", **extra})
    await _added_on(db_conn, "Purchase_Request1", id_, added)
    return id_


@pytest.mark.asyncio
async def test_a_pr_with_a_mode_and_no_order(store, db_conn):
    id_ = await _pr(store, db_conn)
    out = await fc_stamp_purchase_request(store, id_, today=TODAY)
    r = await store.get_record_by_id("Purchase_Request1", id_, raw=True)
    assert (r["Forecast_Delivery"], r["Forecast_Window"], r["Forecast_Status"]) == (
        "2026-11-17", "Nov 15 - Nov 18, 2026 | Air | Procurement", "No Client Date",
    )
    assert out == "PR-1 -> Nov 17, 2026 | Nov 15 - Nov 18, 2026 | Air | Procurement | No Client Date"


@pytest.mark.asyncio
async def test_a_missing_pr_or_one_with_no_added_time_is_answered_and_nothing_is_written(store, db_conn):
    assert (await fc_stamp_purchase_request(store, "4662244000099999999", today=TODAY)).startswith("walang PR o walang Added_Time")
    id_ = await store.add_record("Purchase_Request1", {"PR_No": "PR-2", "Shipment_Mode": "Air"})
    await _added_on(db_conn, "Purchase_Request1", id_, "")
    assert (await fc_stamp_purchase_request(store, id_, today=TODAY)).startswith("walang PR o walang Added_Time")


@pytest.mark.asyncio
async def test_mirrors_zoho_nothing_stamped_until_mode_known_except_local(store, db_conn):
    id_ = await _pr(store, db_conn, {"Shipment_Mode": "", "Sourcing_Type": "Import"})
    out = await fc_stamp_purchase_request(store, id_, today=TODAY)
    if NULL_TEXT:
        assert "LCL?" in out and "Procurement" in out
    else:
        assert out == "wala pang Shipment Mode ang PR-1 — hindi muna nagtatatak"
    local = await _pr(store, db_conn, {"PR_No": "PR-3", "Shipment_Mode": "", "Sourcing_Type": "Local"})
    out2 = await fc_stamp_purchase_request(store, local, today=TODAY)
    assert "Local" in out2 and "Procurement" in out2


@pytest.mark.asyncio
async def test_status_uses_the_client_date_of_the_prs_order_and_the_order_is_stamped(store, db_conn):
    id_ = await _pr(store, db_conn)
    sof = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-1", "PR_No": "PR-1", "order_type": "PRE ORDER", "target_delivery_date": "2026-11-16"})
    await fc_stamp_purchase_request(store, id_, today=TODAY)
    r = await store.get_record_by_id("Purchase_Request1", id_, raw=True)
    assert r["Forecast_Status"] == "At Risk"
    assert r["Forecast_Window"] == "Nov 15 - Nov 18, 2026 | Air | Procurement"
    sof_row = await store.get_record_by_id("Sales_Order_Fulfillment", sof, raw=True)
    assert (sof_row["Forecast_Delivery"], sof_row["Forecast_Status"]) == ("2026-11-17", "At Risk")


@pytest.mark.asyncio
async def test_stock_on_hand_vs_on_the_ladder_vs_never_stock_with_no_order(store, db_conn):
    id_ = await _pr(store, db_conn)
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-2", "PR_No": "PR-1", "order_type": "STOCK"})
    await fc_stamp_purchase_request(store, id_, today=TODAY)
    assert (await store.get_record_by_id("Purchase_Request1", id_, raw=True))["Forecast_Window"] == "Nov 19 - Nov 19, 2026 | Air | Stock on hand"

    for r in await store.find("Sales_Order_Fulfillment"):
        await store.delete_record("Sales_Order_Fulfillment", r["ID"])
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-3", "PR_No": "PR-1", "order_type": "PRE ORDER", "Fulfillment_Stage": "For Delivery"})
    await fc_stamp_purchase_request(store, id_, today=TODAY)
    assert (await store.get_record_by_id("Purchase_Request1", id_, raw=True))["Forecast_Window"] == "Nov 12 - Nov 12, 2026 | Air | Ready"


@pytest.mark.asyncio
async def test_a_prep_stage_counts_the_days_used_from_the_earliest_gate_pick_qc_or_crate_row_of_the_so(store, db_conn):
    id_ = await _pr(store, db_conn)
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-4", "PR_No": "PR-1", "order_type": "PRE ORDER", "Fulfillment_Stage": "Picking"})
    pick = await store.add_record("Pick1", {"SO": "SO-4", "PR_if_any": "PR-OTHER"})
    await _added_on(db_conn, "Pick1", pick, "2026-11-09 09:00:00 AM")  # 3 of 7 days used, even though the row names another PR
    await fc_stamp_purchase_request(store, id_, today=TODAY)
    assert (await store.get_record_by_id("Purchase_Request1", id_, raw=True))["Forecast_Window"] == "Nov 16 - Nov 16, 2026 | Air | Picking"


@pytest.mark.asyncio
async def test_a_shipped_pr_is_in_transit_a_delivered_one_is_at_the_warehouse(store, db_conn):
    id_ = await _pr(store, db_conn, added="2026-10-01 08:00:00 AM")
    await store.add_record("Shipments", {"Shipment_Status": "In Transit", "Supplier_Shipment_Details": [{"PR_No": "PR-1", "Date_Shipped": "2026-11-01"}]})
    await fc_stamp_purchase_request(store, id_, today=TODAY)
    assert (await store.get_record_by_id("Purchase_Request1", id_, raw=True))["Forecast_Window"] == "Nov 15 - Nov 18, 2026 | Air | In transit"
    for r in await store.find("Shipments"):
        await store.delete_record("Shipments", r["ID"])
    await store.add_record("Shipments", {"Shipment_Status": "Delivered", "Supplier_Shipment_Details": [{"PR_No": "PR-1", "Date_Shipped": "2026-11-01"}]})
    await fc_stamp_purchase_request(store, id_, today=TODAY)
    assert (await store.get_record_by_id("Purchase_Request1", id_, raw=True))["Forecast_Window"] == "Nov 19 - Nov 19, 2026 | Air | At WH"


@pytest.mark.asyncio
async def test_mirrors_zoho_the_supplier_lead_time_is_added_only_when_the_shipment_branch_is_not_taken(store, db_conn):
    id_ = await _pr(store, db_conn, {"Required_Days_Lead": "10"})
    await store.add_record("Forecast_Settings", {"Re_anchor_on_Latest_Real_Event": "false", "Include_Supplier_Lead_Time": "true"})
    await fc_stamp_purchase_request(store, id_, today=TODAY)
    assert (await store.get_record_by_id("Purchase_Request1", id_, raw=True))["Forecast_Window"] == "Nov 25 - Nov 28, 2026 | Air | Procurement"  # Nov 1 + 14 + 10
    for r in await store.find("Forecast_Settings"):
        await store.delete_record("Forecast_Settings", r["ID"])
    await store.add_record("Forecast_Settings", {"Re_anchor_on_Latest_Real_Event": "true", "Include_Supplier_Lead_Time": "true"})
    await fc_stamp_purchase_request(store, id_, today=TODAY)
    assert (await store.get_record_by_id("Purchase_Request1", id_, raw=True))["Forecast_Window"] == "Nov 15 - Nov 18, 2026 | Air | Procurement"  # re-anchoring on: the lead time is not added


@pytest.mark.asyncio
async def test_mirrors_zoho_a_second_run_writes_nothing(store, db_conn):
    def forecast_of(r):
        return (r["Forecast_Delivery"], r["Forecast_Window"], r["Forecast_Status"], r["Modified_Time"])

    id_ = await _pr(store, db_conn)
    await fc_stamp_purchase_request(store, id_, today=TODAY)
    first = await store.get_record_by_id("Purchase_Request1", id_, raw=True)
    await fc_stamp_purchase_request(store, id_, today=TODAY)
    assert forecast_of(await store.get_record_by_id("Purchase_Request1", id_, raw=True)) == forecast_of(first)


@pytest.mark.asyncio
async def test_fc_pr_to_pre_order_copies_the_pr_forecast_onto_every_pre_order_row_of_the_pr(store, db_conn):
    id_ = await _pr(store, db_conn)
    a = await store.add_record("Pre_Order_FF", {"SO": "SO-5", "PR": "PR-1"})
    b = await store.add_record("Pre_Order_FF", {"SO": "SO-6", "PR": "PR-1"})
    other = await store.add_record("Pre_Order_FF", {"SO": "SO-7", "PR": "PR-9"})
    out = await fc_pr_to_pre_order(store, id_, today=TODAY)
    assert out == "PR-1 -> 2 pre-order row | Nov 15 - Nov 18, 2026 | Air | Procurement | No Client Date"
    for row in (a, b):
        assert (await store.get_record_by_id("Pre_Order_FF", row, raw=True))["Forecast_Delivery"] == "2026-11-17"
    assert (await store.get_record_by_id("Pre_Order_FF", other, raw=True))["Forecast_Delivery"] == ""


@pytest.mark.asyncio
async def test_fc_pr_to_pre_order_does_not_wipe_a_pre_order_date_when_the_pr_has_no_forecast_yet(store, db_conn):
    id_ = await _pr(store, db_conn, {"Shipment_Mode": "", "Sourcing_Type": "Import"})
    po = await store.add_record("Pre_Order_FF", {"SO": "SO-8", "PR": "PR-1", "Forecast_Delivery": "2026-12-01", "Forecast_Status": "On Track"})
    out = await fc_pr_to_pre_order(store, id_, today=TODAY)
    if NULL_TEXT:
        assert out.startswith("PR-1 -> 1 pre-order row")
    else:
        assert "wala pang forecast ang PR mismo" in out
        assert (await store.get_record_by_id("Pre_Order_FF", po, raw=True))["Forecast_Delivery"] == "2026-12-01"
    assert (await fc_pr_to_pre_order(store, "4662244000099999999", today=TODAY)).startswith("walang PR na ")


@pytest.mark.asyncio
async def test_saving_a_pr_through_the_hooks_stamps_it_and_its_pre_order_rows(store):
    hooked = create_hooked_store(store)
    id_ = await hooked.add_record("Purchase_Request1", {"Shipment_Mode": "Air", "Sourcing_Type": "Import", "PR_No": "PR-HOOK-1"})
    r = await store.get_record_by_id("Purchase_Request1", id_, raw=True)
    assert r["Forecast_Delivery"] != ""
    po = await store.add_record("Pre_Order_FF", {"SO": "SO-9", "PR": r["PR_No"]})
    await hooked.update_record("Purchase_Request1", id_, {"description": "saved again"}, by_form=True)
    po_row = await store.get_record_by_id("Pre_Order_FF", po, raw=True)
    pr_row = await store.get_record_by_id("Purchase_Request1", id_, raw=True)
    assert po_row["Forecast_Delivery"] == pr_row["Forecast_Delivery"]
