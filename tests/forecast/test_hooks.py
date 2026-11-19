from datetime import timedelta

import pytest

from app.deluge import today_date, ymd
from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store, WORKFLOWS
import app.forecast.hooks  # noqa: F401 -- import registers the 7 hooks as a side effect, once per process


def in_days(n: int) -> str:
    return ymd(today_date() + timedelta(days=n))


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


# No WORKFLOWS-clearing fixture in this file: app.forecast.hooks registers its 7 hooks once, at
# import time, the same way Node's hooks.mjs does -- clearing WORKFLOWS between tests would also
# erase them, since they are never re-registered. This file instead relies on the module import
# above happening exactly once per test process (Python's own import cache), consistent with every
# other hook-registering module in this plan being imported once at process start, not per test.


def test_every_form_with_an_instant_forecast_workflow_has_its_hooks():
    for form in ["Sales_Order_Fulfillment", "Sales_Order_Readiness_Gate", "Pick1", "Pre_Order_FF", "Checker_Checklist", "Crate_Checklist", "Order_Aggregation1"]:
        assert WORKFLOWS.get(form, {}).get("afterAdd")
        assert WORKFLOWS.get(form, {}).get("afterUpdate")


@pytest.mark.asyncio
async def test_saving_a_gate_row_stamps_the_forecast_on_the_orders_rows_with_its_own_so_field_name(raw_store):
    hooked = create_hooked_store(raw_store)
    sof = await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-1", "order_type": "STOCK", "target_delivery_date": in_days(30)})
    gate = await hooked.add_record("Sales_Order_Readiness_Gate", {"sales_order_number": "SO-1"})
    for form, id_ in [("Sales_Order_Readiness_Gate", gate), ("Sales_Order_Fulfillment", sof)]:
        r = await raw_store.get_record_by_id(form, id_, raw=True)
        assert r["Forecast_Delivery"] == in_days(7), form
        assert r["Forecast_Status"] == "On Track", form


@pytest.mark.asyncio
async def test_each_of_the_other_forms_stamps_its_order_when_it_is_saved(raw_store):
    hooked = create_hooked_store(raw_store)
    for form, field in [("Pick1", "SO"), ("Pre_Order_FF", "SO"), ("Checker_Checklist", "SO"), ("Crate_Checklist", "SO"), ("Order_Aggregation1", "SO")]:
        so = f"SO-{form}"
        await raw_store.add_record("Sales_Order_Fulfillment", {"SO_No": so, "order_type": "STOCK"})
        id_ = await hooked.add_record(form, {field: so})
        r = await raw_store.get_record_by_id(form, id_, raw=True)
        assert r["Forecast_Delivery"] == in_days(7), form


@pytest.mark.asyncio
async def test_mirrors_zoho_a_fulfillment_row_is_stamped_only_when_it_has_no_forecast_yet(raw_store):
    hooked = create_hooked_store(raw_store)
    id_ = await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-2", "order_type": "STOCK"})
    assert (await raw_store.get_record_by_id("Sales_Order_Fulfillment", id_, raw=True))["Forecast_Delivery"] == in_days(7)
    await raw_store.update_record("Sales_Order_Fulfillment", id_, {"Forecast_Delivery": in_days(3)}, by_form=True)
    await hooked.update_record("Sales_Order_Fulfillment", id_, {"Shipment_Mode": "Air"}, by_form=True)
    assert (await raw_store.get_record_by_id("Sales_Order_Fulfillment", id_, raw=True))["Forecast_Delivery"] == in_days(3)  # untouched


@pytest.mark.asyncio
async def test_a_save_with_a_blank_sales_order_does_nothing_and_does_not_fail(raw_store):
    hooked = create_hooked_store(raw_store)
    id_ = await hooked.add_record("Pick1", {})
    r = await raw_store.get_record_by_id("Pick1", id_, raw=True)
    assert r["Forecast_Delivery"] == ""
