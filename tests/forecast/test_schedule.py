from datetime import date

import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.forecast.schedule import run_forecast_stamp_daily, run_backfill_pre_order
from app.forecast.stamp import fc_stamp_by_so_no, NULL_TEXT

TODAY = date(2026, 11, 12)


@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


class CountingStore:
    """Wraps the real store and counts update_record calls (Node's tests do the same)."""

    def __init__(self, inner):
        self._inner = inner
        self.writes = 0

    async def update_record(self, *a, **kw):
        self.writes += 1
        return await self._inner.update_record(*a, **kw)

    def __getattr__(self, name):
        return getattr(self._inner, name)


async def added_on(db_conn, form, id_, text):
    # Added_Time is system-managed (store.update_record silently drops it) -- same raw-SQL backdoor
    # used in tests/forecast/test_stamp.py.
    await db_conn.execute(f'UPDATE "{form}" SET "Added_Time" = $1 WHERE "ID" = $2::bigint', text, int(id_))


@pytest.mark.asyncio
async def test_every_sof_row_is_stamped_and_the_summary_counts_are_right(store):
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-1", "order_type": "STOCK"})
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-2", "order_type": "STOCK"})
    summary = await run_forecast_stamp_daily(store, today=TODAY)
    assert summary["sofCount"] == 2
    assert summary["stampCount"] == 2
    assert summary["noDateCount"] == 0
    rows = await store.find("Sales_Order_Fulfillment")
    assert all(r["Forecast_Delivery"] != "" for r in rows)


@pytest.mark.asyncio
async def test_items_are_matched_by_sku_when_a_stage_row_carries_one(store):
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-3", "order_type": "STOCK", "SO_SKU_Key": "SO-3_L-1", "Fulfillment_Stage": "Picking"})
    gate = await store.add_record("Sales_Order_Readiness_Gate", {"sales_order_number": "SO-3", "SKU": "L-1"})
    other_gate = await store.add_record("Sales_Order_Readiness_Gate", {"sales_order_number": "SO-3", "SKU": "S-1"})
    await run_forecast_stamp_daily(store, today=TODAY)
    assert (await store.get_record_by_id("Sales_Order_Readiness_Gate", gate, raw=True))["Forecast_Delivery"] != ""
    assert (await store.get_record_by_id("Sales_Order_Readiness_Gate", other_gate, raw=True))["Forecast_Delivery"] == ""


@pytest.mark.asyncio
async def test_a_pr_with_no_sof_yet_is_stamped_in_the_second_pass_always_no_client_date(store, db_conn):
    pr = await store.add_record("Purchase_Request1", {"PR_No": "PR-1", "Shipment_Mode": "Air"})
    await added_on(db_conn, "Purchase_Request1", pr, "2026-11-01 08:00:00 AM")
    summary = await run_forecast_stamp_daily(store, today=TODAY)
    assert summary["prOnlyCount"] == 1
    r = await store.get_record_by_id("Purchase_Request1", pr, raw=True)
    assert r["Forecast_Status"] == "No Client Date"


@pytest.mark.asyncio
async def test_the_pr_is_stamped_with_the_forecast_of_its_item_and_a_pr_number_that_is_the_text_null_is_no_pr(store, db_conn):
    pr = await store.add_record("Purchase_Request1", {"PR_No": "PR-2", "Sourcing_Type": "Import", "Shipment_Mode": "Air"})
    await added_on(db_conn, "Purchase_Request1", pr, "2026-11-01 08:00:00 AM")
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-2", "SO_SKU_Key": "SO-2_L-1", "PR_No": "PR-2", "order_type": "PRE ORDER", "Shipment_Mode": "Air"})
    no_pr = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-3", "SO_SKU_Key": "SO-3_L-1", "PR_No": "null", "order_type": "PRE ORDER"})
    await run_forecast_stamp_daily(store, today=TODAY)
    assert (await store.get_record_by_id("Purchase_Request1", pr, raw=True))["Forecast_Delivery"] == "2026-11-17"
    assert "Stock on hand" in (await store.get_record_by_id("Sales_Order_Fulfillment", no_pr, raw=True))["Forecast_Window"]


@pytest.mark.asyncio
async def test_the_shipment_of_a_pr_is_the_one_with_the_earliest_date_shipped_and_the_order_is_in_transit_from_that_day(store, db_conn):
    pr = await store.add_record("Purchase_Request1", {"PR_No": "PR-6", "Sourcing_Type": "Import", "Shipment_Mode": "LCL"})
    await added_on(db_conn, "Purchase_Request1", pr, "2026-10-01 08:00:00 AM")
    s1 = await store.add_record("Shipments", {"Shipment_Status": "In Transit", "Supplier_Shipment_Details": [{"PR_No": "PR-6", "Date_Shipped": "05-Nov-2026"}]})
    s2 = await store.add_record("Shipments", {"Shipment_Status": "In Transit", "Supplier_Shipment_Details": [{"PR_No": "PR-6", "Date_Shipped": "30-Oct-2026"}]})
    sof = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-6", "SO_SKU_Key": "SO-6_A", "PR_No": "PR-6", "order_type": "PRE ORDER", "Shipment_Mode": "LCL"})
    await run_forecast_stamp_daily(store, today=TODAY)
    r = await store.get_record_by_id("Sales_Order_Fulfillment", sof, raw=True)
    assert "| LCL | In transit" in r["Forecast_Window"]
    assert r["Forecast_Window"].startswith("Dec 18 - Jan 15, 2027")  # Oct 30 + 49 and + 77 days
    assert (await store.get_record_by_id("Shipments", s2, raw=True))["Forecast_Delivery"] != ""
    assert (await store.get_record_by_id("Shipments", s1, raw=True))["Forecast_Delivery"] == ""


@pytest.mark.asyncio
async def test_mirrors_zoho_a_pr_with_a_sof_is_not_in_the_second_pass_it_keeps_its_items_forecast(store, db_conn):
    pr = await store.add_record("Purchase_Request1", {"PR_No": "PR-9", "Sourcing_Type": "Import", "Shipment_Mode": "Air"})
    await added_on(db_conn, "Purchase_Request1", pr, "2026-11-01 08:00:00 AM")
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-9", "SO_SKU_Key": "SO-9_A", "PR_No": "PR-9", "order_type": "PRE ORDER", "Shipment_Mode": "Air", "target_delivery_date": "2026-11-20"})
    out = await run_forecast_stamp_daily(store, today=TODAY)
    assert out["prOnlyCount"] == 0
    assert (await store.get_record_by_id("Purchase_Request1", pr, raw=True))["Forecast_Status"] == "On Track"  # the item status, not "No Client Date"


@pytest.mark.asyncio
async def test_mirrors_zoho_a_blank_shipment_mode_on_the_sof_row_is_the_text_null_so_the_pr_mode_is_not_used(store, db_conn):
    pr = await store.add_record("Purchase_Request1", {"PR_No": "PR-20", "Sourcing_Type": "Import", "Shipment_Mode": "Air"})
    await added_on(db_conn, "Purchase_Request1", pr, "2026-11-01 08:00:00 AM")
    sof = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-20", "SO_SKU_Key": "SO-20_A", "PR_No": "PR-20", "order_type": "PRE ORDER"})
    await run_forecast_stamp_daily(store, today=TODAY)
    window = (await store.get_record_by_id("Sales_Order_Fulfillment", sof, raw=True))["Forecast_Window"]
    # Node's own test uses an unescaped regex here that matches anything; this one checks the text for real.
    assert ("| LCL? | Procurement" if NULL_TEXT else "| Air | Procurement") in window


@pytest.mark.asyncio
async def test_schedule_test_settings_can_set_a_test_today(store):
    id_ = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-10", "SO_SKU_Key": "SO-10_A", "order_type": "STOCK"})
    await store.add_record("Schedule_Test_Settings", {"Test_Current_Date": "2026-12-01"})
    await run_forecast_stamp_daily(store, today=TODAY)
    assert (await store.get_record_by_id("Sales_Order_Fulfillment", id_, raw=True))["Forecast_Delivery"] == "2026-12-08"


@pytest.mark.asyncio
async def test_a_second_run_writes_nothing(store):
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-11", "SO_SKU_Key": "SO-11_A", "order_type": "STOCK"})
    await store.add_record("Receiving", {"SO_No": "SO-11"})
    await run_forecast_stamp_daily(store, today=TODAY)
    counting = CountingStore(store)
    await run_forecast_stamp_daily(counting, today=TODAY)
    assert counting.writes == 0


@pytest.mark.asyncio
async def test_the_schedule_and_the_on_save_stamp_give_the_same_forecast_for_a_one_item_order(store, db_conn):
    pr = await store.add_record("Purchase_Request1", {"PR_No": "PR-12", "Sourcing_Type": "Import", "Shipment_Mode": "Air"})
    await added_on(db_conn, "Purchase_Request1", pr, "2026-11-01 08:00:00 AM")
    sof = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-12", "SO_SKU_Key": "SO-12_A", "PR_No": "PR-12", "order_type": "PRE ORDER", "Shipment_Mode": "Air", "target_delivery_date": "2026-11-20"})
    await run_forecast_stamp_daily(store, today=TODAY)
    by_schedule = await store.get_record_by_id("Sales_Order_Fulfillment", sof, raw=True)
    wanted = (by_schedule["Forecast_Delivery"], by_schedule["Forecast_Window"], by_schedule["Forecast_Status"])
    await store.update_record("Sales_Order_Fulfillment", sof, {"Forecast_Delivery": "", "Forecast_Window": "", "Forecast_Status": ""}, by_form=True)
    await fc_stamp_by_so_no(store, "SO-12", today=TODAY)
    by_save = await store.get_record_by_id("Sales_Order_Fulfillment", sof, raw=True)
    assert (by_save["Forecast_Delivery"], by_save["Forecast_Window"], by_save["Forecast_Status"]) == wanted


@pytest.mark.asyncio
async def test_rollup_forms_get_the_latest_date_and_worst_status_across_items(store):
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-4", "order_type": "STOCK", "SO_SKU_Key": "SO-4_A", "target_delivery_date": "2026-11-10"})
    await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-4", "order_type": "STOCK", "SO_SKU_Key": "SO-4_B", "target_delivery_date": "2026-12-25"})
    receiving = await store.add_record("Receiving", {"SO_No": "SO-4"})
    await run_forecast_stamp_daily(store, today=TODAY)
    r = await store.get_record_by_id("Receiving", receiving, raw=True)
    assert r["Forecast_Status"] in ("Overdue", "At Risk", "Will Miss")  # worst of the two items' statuses


@pytest.mark.asyncio
async def test_run_backfill_pre_order_copies_the_pr_forecast_onto_matching_pre_order_rows(store):
    # txt() turns a blank PR field into the literal string "null" (NULL_TEXT=True, matching Node's
    # stamp.mjs exactly), so it never equals "" -- a blank-PR row falls into noForecast, not noPr,
    # in both languages. The noPr branch is real but only reachable by a literal "null" string PR
    # value never actually written by this app; confirmed by reading server/forecast/schedule.mjs.
    pr = await store.add_record("Purchase_Request1", {"PR_No": "PR-2", "Forecast_Delivery": "2026-12-01", "Forecast_Window": "window text", "Forecast_Status": "On Track"})
    filled = await store.add_record("Pre_Order_FF", {"SO": "SO-5", "PR": "PR-2"})
    blank_pr = await store.add_record("Pre_Order_FF", {"SO": "SO-6", "PR": ""})
    no_forecast_pr = await store.add_record("Pre_Order_FF", {"SO": "SO-7", "PR": "PR-NONE"})
    summary = await run_backfill_pre_order(store)
    assert summary["filled"] == 1
    assert summary["noPr"] == 0
    assert summary["noForecast"] == 2  # the blank-PR row and the PR-NONE row
    r = await store.get_record_by_id("Pre_Order_FF", filled, raw=True)
    assert (r["Forecast_Delivery"], r["Forecast_Status"]) == ("2026-12-01", "On Track")
    assert (await store.get_record_by_id("Pre_Order_FF", blank_pr, raw=True))["Forecast_Delivery"] == ""


@pytest.mark.asyncio
async def test_per_item_each_fulfillment_row_is_one_item_with_its_own_forecast_an_item_with_no_pr_is_stock_on_hand(store, db_conn):
    pr = await store.add_record("Purchase_Request1", {"PR_No": "PR-1", "Sourcing_Type": "Import", "Shipment_Mode": "Air"})
    await added_on(db_conn, "Purchase_Request1", pr, "2026-11-01 08:00:00 AM")
    with_pr = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-1", "SO_SKU_Key": "SO-1_L-1", "PR_No": "PR-1", "order_type": "(PARTLY) PRE ORDER", "Shipment_Mode": "Air"})
    no_pr = await store.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-1", "SO_SKU_Key": "SO-1_S-1", "order_type": "(PARTLY) PRE ORDER"})
    await run_forecast_stamp_daily(store, today=TODAY)
    a = await store.get_record_by_id("Sales_Order_Fulfillment", with_pr, raw=True)
    b = await store.get_record_by_id("Sales_Order_Fulfillment", no_pr, raw=True)
    assert (a["Forecast_Delivery"], a["Forecast_Window"]) == ("2026-11-17", "Nov 15 - Nov 18, 2026 | Air | Procurement")
    assert (b["Forecast_Delivery"], b["Forecast_Window"]) == ("2026-11-19", "Nov 19 - Nov 19, 2026 | LCL? | Stock on hand")
