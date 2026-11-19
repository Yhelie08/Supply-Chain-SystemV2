from datetime import date

import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.forecast.stamp import fc_stamp_by_so_no, to_date

TODAY = date(2026, 11, 12)


@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def added_on(db_conn, form, id_, text):
    # Added_Time is system-managed (store.update_record silently drops it), so backdating it for a
    # test needs a raw SQL write -- same approach as Node's tests/forecast/stamp.test.js's addedOn().
    await db_conn.execute(f'UPDATE "{form}" SET "Added_Time" = $1 WHERE "ID" = $2::bigint', text, int(id_))


def test_to_date_reads_the_forms_the_app_uses():
    assert to_date("2026-11-12").day == 12
    assert to_date("2026-11-12 09:00:00 AM").month == 11
    d = to_date("05-Nov-2026")
    assert (d.month, d.day) == (11, 5)
    assert to_date("soon") is None
    assert to_date("") is None


@pytest.mark.asyncio
async def test_a_blank_sales_order_number_is_answered_nothing_is_stamped(store):
    for so in ["", None, "null"]:
        assert await fc_stamp_by_so_no(store, so, today=TODAY) == "walang SO number na ipinasa"


@pytest.mark.asyncio
async def test_stock_on_hand_order_prep_and_delivery_days_from_today_stamped_on_its_sof_row(store):
    id_ = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-1", "order_type": "STOCK", "target_delivery_date": "2026-11-25"})
    out = await fc_stamp_by_so_no(store, "SO-1", today=TODAY)
    r = await store.get_record_by_id("Sales_Order_Fulfillment", id_, raw=True)
    assert (r["Forecast_Delivery"], r["Forecast_Window"], r["Forecast_Status"]) == (
        "2026-11-19", "Nov 19 - Nov 19, 2026 | LCL? | Stock on hand | 6d early", "On Track",
    )
    assert out == "SO-1 -> Nov 19, 2026 | Nov 19 - Nov 19, 2026 | LCL? | Stock on hand | 6d early | On Track | 1 record"


@pytest.mark.asyncio
async def test_a_gate_row_with_no_sof_puts_the_order_at_order_readiness(store, db_conn):
    g = await store.add_record("Sales_Order_Readiness_Gate", {"sales_order_number": "SO-2", "Order_Type": "Stock", "Target_Delivery_Date": "2026-11-30"})
    await added_on(db_conn, "Sales_Order_Readiness_Gate", g, "2026-11-09 09:00:00 AM")  # 3 of 7 days used
    await fc_stamp_by_so_no(store, "SO-2", today=TODAY)
    r = await store.get_record_by_id("Sales_Order_Readiness_Gate", g, raw=True)
    assert (r["Forecast_Delivery"], r["Forecast_Window"], r["Forecast_Status"]) == (
        "2026-11-16", "Nov 16 - Nov 16, 2026 | LCL? | Order Readiness | 14d early", "On Track",
    )


@pytest.mark.asyncio
async def test_only_a_pre_order_row_the_pr_gives_the_start_sourcing_and_mode(store, db_conn):
    pr = await store.add_record("Purchase_Request1", {"PR_No": "PR-1", "Sourcing_Type": "Import", "Shipment_Mode": "Air", "Required_Days_Lead": "3"})
    await added_on(db_conn, "Purchase_Request1", pr, "2026-11-01 08:00:00 AM")
    po = await store.add_record("Pre_Order_FF", {"SO": "SO-3", "PR": "PR-1", "Order_Type": "Pre Order", "Target_Delivery": "2026-11-16"})
    out = await fc_stamp_by_so_no(store, "SO-3", today=TODAY)
    po_row = await store.get_record_by_id("Pre_Order_FF", po, raw=True)
    pr_row = await store.get_record_by_id("Purchase_Request1", pr, raw=True)
    assert (po_row["Forecast_Delivery"], po_row["Forecast_Window"], po_row["Forecast_Status"]) == (
        "2026-11-17", "Nov 15 - Nov 18, 2026 | Air | Procurement | +1d vs client", "At Risk",
    )
    assert (pr_row["Forecast_Delivery"], pr_row["Forecast_Window"], pr_row["Forecast_Status"]) == (
        po_row["Forecast_Delivery"], po_row["Forecast_Window"], po_row["Forecast_Status"],
    )
    assert out.endswith("| 2 record")


@pytest.mark.asyncio
async def test_rows_naming_another_pr_than_the_order_are_left_out_of_the_stamping(store):
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-6", "order_type": "STOCK", "PR_No": "PR-4", "Fulfillment_Stage": "Picking", "Shipment_Mode": "LCL"})
    mine = await store.add_record("Pick1", {"SO": "SO-6", "PR_if_any": "PR-4"})
    no_pr = await store.add_record("Pick1", {"SO": "SO-6", "PR_if_any": ""})
    other = await store.add_record("Pick1", {"SO": "SO-6", "PR_if_any": "PR-OTHER"})
    await fc_stamp_by_so_no(store, "SO-6", today=TODAY)
    assert (await store.get_record_by_id("Pick1", mine, raw=True))["Forecast_Delivery"] != ""
    assert (await store.get_record_by_id("Pick1", no_pr, raw=True))["Forecast_Delivery"] != ""
    assert (await store.get_record_by_id("Pick1", other, raw=True))["Forecast_Delivery"] == ""


@pytest.mark.asyncio
async def test_every_form_of_the_order_is_stamped(store):
    ids = {}
    ids["Sales_Order_Fulfillment"] = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-7", "order_type": "STOCK"})
    ids["Sales_Order_Readiness_Gate"] = await store.add_record("Sales_Order_Readiness_Gate", {"sales_order_number": "SO-7"})
    ids["Pre_Order_FF"] = await store.add_record("Pre_Order_FF", {"SO": "SO-7"})
    ids["Pick1"] = await store.add_record("Pick1", {"SO": "SO-7"})
    ids["Checker_Checklist"] = await store.add_record("Checker_Checklist", {"SO": "SO-7"})
    ids["Order_Aggregation1"] = await store.add_record("Order_Aggregation1", {"SO": "SO-7"})
    ids["Crate_Checklist"] = await store.add_record("Crate_Checklist", {"SO": "SO-7"})
    ids["Receiving"] = await store.add_record("Receiving", {"SO_No": "SO-7"})
    await fc_stamp_by_so_no(store, "SO-7", today=TODAY)
    for form, id_ in ids.items():
        r = await store.get_record_by_id(form, id_, raw=True)
        assert r["Forecast_Status"] == "No Client Date", form


@pytest.mark.asyncio
async def test_mirrors_zoho_only_the_first_sales_order_fulfillment_row_of_the_order_is_stamped(store):
    a = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-8", "order_type": "STOCK"})
    b = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-8", "order_type": "STOCK"})
    await fc_stamp_by_so_no(store, "SO-8", today=TODAY)
    assert (await store.get_record_by_id("Sales_Order_Fulfillment", a, raw=True))["Forecast_Delivery"] != ""
    assert (await store.get_record_by_id("Sales_Order_Fulfillment", b, raw=True))["Forecast_Delivery"] == ""


@pytest.mark.asyncio
async def test_the_settings_record_changes_the_prep_and_delivery_days(store):
    await store.add_record("Forecast_Settings", {"Prep_Days_Thru_QC": "2", "Delivery_Days": "1", "Re_anchor_on_Latest_Real_Event": "true", "Include_Supplier_Lead_Time": "true"})
    id_ = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-10", "order_type": "STOCK"})
    await fc_stamp_by_so_no(store, "SO-10", today=TODAY)
    r = await store.get_record_by_id("Sales_Order_Fulfillment", id_, raw=True)
    assert r["Forecast_Delivery"] == "2026-11-15"  # 2 prep + 1 delivery


@pytest.mark.asyncio
async def test_no_sof_gate_or_pre_order_row_at_all_counts_as_stock_on_hand_but_nothing_to_stamp(store):
    out = await fc_stamp_by_so_no(store, "SO-NOTHING", today=TODAY)
    assert "Stock on hand" in out
    assert out.endswith("0 record")
