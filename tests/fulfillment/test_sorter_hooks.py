import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
from app.custom_apis import CUSTOM_APIS
from app.fulfillment.sorter import rescore_one, rescore_all
import app.fulfillment.sorter_hooks  # noqa: F401 -- registers the two re-score hooks
import app.fulfillment.apis  # noqa: F401 -- registers recalculate_fulfillment_queue

SOF = "Sales_Order_Fulfillment"


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _add_package(raw_store, extra):
    return await raw_store.add_record(SOF, {"SO_No": "SO-1", "Fulfillment_Stage": "Order Readiness", "order_type": "Normal", "Shipping_Address": "1 Main St", "Item_Details1": [{"Quantity": "1"}], **extra})


@pytest.mark.asyncio
async def test_rescore_all_every_open_package_gets_a_category_rank_and_scored_at(raw_store):
    await _add_package(raw_store, {"SO_No": "SO-1", "SO_Created_Date": "2026-11-01", "target_delivery_date": "2026-12-15"})
    await _add_package(raw_store, {"SO_No": "SO-2", "SO_Created_Date": "2026-11-05", "target_delivery_date": "2026-12-15"})
    result = await rescore_all(raw_store)
    assert result["scored"] == 2
    rows = await raw_store.find(SOF)
    by_so = {r["SO_No"]: r for r in rows}
    assert by_so["SO-1"]["Category"] == "on_time"
    assert by_so["SO-1"]["Queue_Rank"] == "1"
    assert by_so["SO-2"]["Queue_Rank"] == "2"
    assert by_so["SO-1"]["Scored_At"]


@pytest.mark.asyncio
async def test_rescore_all_a_package_already_at_for_delivery_is_left_out(raw_store):
    await _add_package(raw_store, {"SO_No": "SO-1", "Fulfillment_Stage": "For Delivery"})
    result = await rescore_all(raw_store)
    assert result["scored"] == 0
    row = (await raw_store.find(SOF))[0]
    assert row["Category"] == ""


@pytest.mark.asyncio
async def test_rescore_one_rescores_the_named_so_but_still_reranks_everything_else(raw_store):
    await _add_package(raw_store, {"SO_No": "SO-1", "SO_Created_Date": "2026-11-01"})
    await _add_package(raw_store, {"SO_No": "SO-2", "SO_Created_Date": "2026-11-05"})
    await rescore_one(raw_store, "SO-1")
    rows = await raw_store.find(SOF)
    by_so = {r["SO_No"]: r for r in rows}
    assert by_so["SO-1"]["Category"]
    assert by_so["SO-2"]["Category"]


@pytest.mark.asyncio
async def test_saving_a_sof_record_scores_it_automatically(hooked_store, raw_store):
    id_ = await hooked_store.add_record(SOF, {"SO_No": "SO-9", "Fulfillment_Stage": "Order Readiness", "order_type": "Normal", "SO_Created_Date": "2026-11-01", "target_delivery_date": "2026-12-15", "Shipping_Address": "1 Main St", "Item_Details1": [{"Quantity": "1"}]})
    row = await raw_store.get_record_by_id(SOF, id_, raw=True)
    assert row["Category"] == "on_time"
    assert row["Scored_At"]


@pytest.mark.asyncio
async def test_an_unpaid_gate_save_rescores_the_package_blocked_flips_to_a_workable_category(hooked_store, raw_store):
    id_ = await hooked_store.add_record(SOF, {"SO_No": "SO-10", "Fulfillment_Stage": "Order Readiness", "order_type": "Normal", "Package": "PAC-10", "SO_Created_Date": "2026-11-01", "target_delivery_date": "2026-12-15", "Shipping_Address": "1 Main St", "Item_Details1": [{"Quantity": "1"}]})
    gate_id = await hooked_store.add_record("Sales_Order_Readiness_Gate", {"sales_order_number": "SO-10", "Package_Order": "PAC-10", "payment_status": "Partial", "Has_Credit_Terms": False})
    row = await raw_store.get_record_by_id(SOF, id_, raw=True)
    assert row["Category"] == "blocked"
    await hooked_store.update_record("Sales_Order_Readiness_Gate", gate_id, {"payment_status": "Yes"}, by_form=True)
    row = await raw_store.get_record_by_id(SOF, id_, raw=True)
    assert row["Category"] == "on_time"


@pytest.mark.asyncio
async def test_an_open_replacement_request_makes_the_package_broken_read_from_the_db(raw_store):
    await _add_package(raw_store, {"SO_No": "SO-11", "SO_Created_Date": "2026-11-01", "target_delivery_date": "2026-12-15"})
    await raw_store.add_record("Replacement_Request", {"RR_No": "RR-00001", "RR_SO": "SO-11", "RR_Status": "Open"})
    await rescore_all(raw_store)
    row = (await raw_store.find(SOF, lambda r: r["SO_No"] == "SO-11"))[0]
    assert row["Category"] == "broken"
    rr = (await raw_store.find("Replacement_Request"))[0]
    await raw_store.update_record("Replacement_Request", rr["ID"], {"RR_Status": "Closed"}, by_form=True)
    await rescore_all(raw_store)
    after = (await raw_store.find(SOF, lambda r: r["SO_No"] == "SO-11"))[0]
    assert after["Category"] == "on_time"


@pytest.mark.asyncio
async def test_recalculate_fulfillment_queue_custom_api_rescores_everything(hooked_store, raw_store):
    await hooked_store.add_record(SOF, {"SO_No": "SO-20", "Fulfillment_Stage": "Order Readiness", "order_type": "Normal", "Shipping_Address": "1 Main St", "Item_Details1": [{"Quantity": "1"}]})
    fn = CUSTOM_APIS["recalculate_fulfillment_queue"]
    result = await fn({}, raw_store, {})
    assert result["status"] == "success"
    assert result["scored"] == 1
