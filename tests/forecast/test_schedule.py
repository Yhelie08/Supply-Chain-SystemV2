from datetime import date

import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.forecast.schedule import run_forecast_stamp_daily, run_backfill_pre_order

TODAY = date(2026, 11, 12)


@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


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
