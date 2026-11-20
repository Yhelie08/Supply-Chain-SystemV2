from datetime import datetime, timezone

import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.fulfillment.sorter import categorize, rank_and_cut_line, effective_boxes, capacity_for, backlog_days, people_needed

SOF = "Sales_Order_Fulfillment"
NOW = datetime(2026, 11, 17, tzinfo=timezone.utc)


def _policy(**overrides):
    def read(key):
        return overrides.get(key)
    return read


@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.mark.asyncio
async def test_the_six_queue_columns_exist_on_sales_order_fulfillment_schema(store):
    # was an empty `pass` (found 2026-11-19): now writes and reads the columns, like Node's test does
    id_ = await store.add_record(SOF, {"SO_No": "SO-1", "Category": "on_time", "Queue_Rank": "1", "Suggested_Release": True})
    r = await store.get_record_by_id(SOF, id_, raw=True)
    assert r["Category"] == "on_time"
    assert r["Queue_Rank"] == "1"
    assert r["Suggested_Release"] is True


@pytest.mark.asyncio
async def test_box_count_and_box_count_source_columns_exist_on_sales_order_fulfillment(store):
    id_ = await store.add_record(SOF, {"SO_No": "SO-BOX-1", "Box_Count": "7", "Box_Count_Source": "counted"})
    r = await store.get_record_by_id(SOF, id_, raw=True)
    assert r["Box_Count"] == "7"
    assert r["Box_Count_Source"] == "counted"


@pytest.mark.asyncio
async def test_capacity_days_form_exists_with_date_people_boxes_per_hour_hours_per_day(store):
    id_ = await store.add_record("Capacity_Days", {"Date": "2026-11-17", "People": "4", "Boxes_Per_Hour": "8", "Hours_Per_Day": "7"})
    r = await store.get_record_by_id("Capacity_Days", id_, raw=True)
    assert r["People"] == "4"
    assert r["Boxes_Per_Hour"] == "8"
    assert r["Hours_Per_Day"] == "7"


def test_categorize_blocked_when_payment_not_cleared_and_no_credit_terms():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-12-01", "order_type": "Normal"}
    gates = [{"sales_order_number": "SO-1", "payment_status": "Partial", "Has_Credit_Terms": False, "Override_Approved": False}]
    out = categorize(sof, gates=gates, open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "blocked"
    assert "payment" in out["blockedReason"].lower()


def test_categorize_blocked_when_an_exception_on_this_package_is_still_open():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-12-01", "order_type": "Normal"}
    out = categorize(sof, gates=[], open_exceptions=[{"Sales_Order": "SO-1", "Status": "Pending"}], now=NOW, policy=_policy())
    assert out["category"] == "blocked"
    assert "exception" in out["blockedReason"].lower()


def test_categorize_broken_for_replacement_order_type_even_with_a_future_target():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-12-01", "order_type": "Replacement", "Shipping_Address": "1 Main St"}
    out = categorize(sof, gates=[], open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "broken"


def test_categorize_broken_for_a_replacement_with_no_target_date_at_all():
    sof = {"SO_No": "SO-1", "target_delivery_date": "", "order_type": "Replacement", "SO_Created_Date": "2026-11-01", "Shipping_Address": "1 Main St"}
    out = categorize(sof, gates=[], open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "broken"
    assert "no target set" in out["priorityReason"].lower()


def test_categorize_broken_when_an_open_replacement_request_points_at_this_so():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-12-01", "order_type": "Normal", "Shipping_Address": "1 Main St"}
    open_rrs = [{"RR_No": "RR-00001", "RR_SO": "SO-1", "RR_Status": "Open"}]
    out = categorize(sof, gates=[], open_exceptions=[], open_rrs=open_rrs, now=NOW, policy=_policy())
    assert out["category"] == "broken"
    assert "RR-00001" in out["priorityReason"]


def test_categorize_a_closed_replacement_request_does_not_make_it_broken():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-12-01", "order_type": "Normal", "Shipping_Address": "1 Main St"}
    out = categorize(sof, gates=[], open_exceptions=[], open_rrs=[], now=NOW, policy=_policy())
    assert out["category"] == "on_time"


def test_categorize_blocked_wins_over_an_open_replacement_request_too():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-12-01", "order_type": "Normal"}
    gates = [{"sales_order_number": "SO-1", "payment_status": "No", "Has_Credit_Terms": False, "Override_Approved": False}]
    open_rrs = [{"RR_No": "RR-00001", "RR_SO": "SO-1", "RR_Status": "Open"}]
    out = categorize(sof, gates=gates, open_exceptions=[], open_rrs=open_rrs, now=NOW, policy=_policy())
    assert out["category"] == "blocked"


def test_categorize_late_when_today_is_past_the_target():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-11-10", "order_type": "Normal", "Shipping_Address": "1 Main St"}
    out = categorize(sof, gates=[], open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "late"


def test_categorize_at_risk_when_forecast_misses_the_target():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-11-25", "Forecast_Delivery": "2026-11-28", "order_type": "Normal", "Shipping_Address": "1 Main St"}
    out = categorize(sof, gates=[], open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "at_risk"


def test_categorize_at_risk_when_slack_is_within_the_default_3_days():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-11-19", "order_type": "Normal", "Shipping_Address": "1 Main St"}  # 2 days out
    out = categorize(sof, gates=[], open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "at_risk"


def test_categorize_on_time_otherwise():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-12-15", "order_type": "Normal", "Shipping_Address": "1 Main St"}
    out = categorize(sof, gates=[], open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "on_time"


def test_categorize_blocked_wins_over_broken_broken_wins_over_late():
    sof = {"SO_No": "SO-1", "target_delivery_date": "2026-11-01", "order_type": "Replacement"}  # late AND broken
    gates = [{"sales_order_number": "SO-1", "payment_status": "No", "Has_Credit_Terms": False, "Override_Approved": False}]  # also blocked
    out = categorize(sof, gates=gates, open_exceptions=[], now=NOW, policy=_policy())
    assert out["category"] == "blocked"


def _entry(so, created=None, target=None, items=None, category="on_time", stage="Order Readiness"):
    items = items or [{"Quantity": "1"}]
    return {"sof": {"SO_No": so, "SO_Created_Date": created, "target_delivery_date": target, "Item_Details1": items, "Fulfillment_Stage": stage}, "category": category, "priorityReason": "x"}


def test_rank_and_cut_line_oldest_created_date_ranks_first_regardless_of_input_order():
    entries = [_entry("SO-2", created="2026-11-10"), _entry("SO-1", created="2026-11-01")]
    out = rank_and_cut_line(entries, capacity_boxes=50)
    assert [e["sof"]["SO_No"] for e in out] == ["SO-1", "SO-2"]
    assert [e["queueRank"] for e in out] == [1, 2]


def test_rank_and_cut_line_same_created_date_earlier_target_wins_the_tiebreak():
    entries = [_entry("SO-2", created="2026-11-01", target="2026-12-05"), _entry("SO-1", created="2026-11-01", target="2026-11-20")]
    out = rank_and_cut_line(entries, capacity_boxes=50)
    assert [e["sof"]["SO_No"] for e in out] == ["SO-1", "SO-2"]


def test_rank_and_cut_line_so_no_ascending_is_the_final_tiebreak():
    entries = [_entry("SO-20", created="2026-11-01"), _entry("SO-3", created="2026-11-01")]
    out = rank_and_cut_line(entries, capacity_boxes=50)
    assert [e["sof"]["SO_No"] for e in out] == ["SO-3", "SO-20"]


def test_rank_and_cut_line_cut_line_marks_suggested_release_up_to_free_capacity():
    # changed 2026-11-20: the list stops AT the package that would exceed the capacity (spec 03 / 02 acceptance), it no longer includes it
    entries = [_entry("SO-1", created="2026-11-01", items=[{"Quantity": "5"}]), _entry("SO-2", created="2026-11-02", items=[{"Quantity": "5"}]), _entry("SO-3", created="2026-11-03", items=[{"Quantity": "5"}])]
    out = rank_and_cut_line(entries, capacity_boxes=8)
    assert [(e["sof"]["SO_No"], e["suggestedRelease"]) for e in out] == [("SO-1", True), ("SO-2", False), ("SO-3", False)]


def test_rank_and_cut_line_a_wip_stage_entry_never_gets_suggested_release_or_consumes_capacity_twice():
    entries = [_entry("SO-1", created="2026-11-01", items=[{"Quantity": "100"}], stage="Picking"), _entry("SO-2", created="2026-11-02", items=[{"Quantity": "5"}], stage="Order Readiness")]
    out = rank_and_cut_line(entries, capacity_boxes=200)
    so1 = next(e for e in out if e["sof"]["SO_No"] == "SO-1")
    so2 = next(e for e in out if e["sof"]["SO_No"] == "SO-2")
    assert so1["suggestedRelease"] is False
    assert so2["suggestedRelease"] is True
    assert isinstance(so1["queueRank"], int) and isinstance(so2["queueRank"], int)


def test_rank_and_cut_line_wip_exceeding_capacity_floors_free_capacity_at_0():
    entries = [_entry("SO-1", created="2026-11-01", items=[{"Quantity": "999"}], stage="Crate"), _entry("SO-2", created="2026-11-02", items=[{"Quantity": "1"}], stage="Order Readiness")]
    out = rank_and_cut_line(entries, capacity_boxes=10)
    so2 = next(e for e in out if e["sof"]["SO_No"] == "SO-2")
    assert so2["suggestedRelease"] is False


def test_rank_and_cut_line_determinism_two_runs_on_the_same_unordered_input_give_identical_output():
    entries = [_entry("SO-5", created="2026-11-05"), _entry("SO-1", created="2026-11-01"), _entry("SO-3", created="2026-11-03")]
    a = rank_and_cut_line(entries, capacity_boxes=50)
    b = rank_and_cut_line(list(reversed(entries)), capacity_boxes=50)
    assert [e["sof"]["SO_No"] for e in a] == [e["sof"]["SO_No"] for e in b]
    assert [e["queueRank"] for e in a] == [e["queueRank"] for e in b]


def test_effective_boxes_counted_source_returns_the_real_box_count():
    sof = {"Box_Count": "12", "Box_Count_Source": "counted", "Item_Details1": [{"Quantity": "1"}, {"Quantity": "1"}]}
    assert effective_boxes(sof) == 12


def test_effective_boxes_no_source_falls_back_to_the_line_quantity_sum():
    sof = {"Item_Details1": [{"Quantity": "3"}, {"Quantity": "4"}]}
    assert effective_boxes(sof) == 7


def test_effective_boxes_estimated_source_also_falls_back():
    sof = {"Box_Count_Source": "estimated", "Item_Details1": [{"Quantity": "2"}]}
    assert effective_boxes(sof) == 2


def test_effective_boxes_counted_but_blank_box_count_still_falls_back():
    sof = {"Box_Count_Source": "counted", "Box_Count": "", "Item_Details1": [{"Quantity": "5"}]}
    assert effective_boxes(sof) == 5


@pytest.mark.asyncio
async def test_capacity_for_uses_the_exact_date_row_when_one_exists(store):
    await store.add_record("Capacity_Days", {"Date": "2026-11-17", "People": "5", "Boxes_Per_Hour": "10", "Hours_Per_Day": "8"})
    c = await capacity_for(store, "2026-11-17")
    assert (c["people"], c["boxesPerHour"], c["hoursPerDay"], c["capacityBoxes"]) == (5, 10, 8, 400)


@pytest.mark.asyncio
async def test_capacity_for_falls_back_to_the_most_recent_earlier_row(store):
    await store.add_record("Capacity_Days", {"Date": "2026-11-15", "People": "3", "Boxes_Per_Hour": "9", "Hours_Per_Day": "7"})
    c = await capacity_for(store, "2026-11-17")
    assert (c["people"], c["capacityBoxes"]) == (3, 189)


@pytest.mark.asyncio
async def test_capacity_for_no_row_at_all_falls_back_to_policy_defaults(store):
    c = await capacity_for(store, "2026-11-17")
    assert (c["people"], c["boxesPerHour"], c["hoursPerDay"], c["capacityBoxes"]) == (4, 8, 7, 224)


def test_backlog_days_open_boxes_over_capacity():
    assert backlog_days(224, 224) == 1
    assert backlog_days(448, 224) == 2


def test_backlog_days_zero_capacity_edge_cases():
    assert backlog_days(0, 0) == 0
    assert backlog_days(10, 0) == float("inf")


def test_people_needed_open_boxes_due_over_daily_capacity_times_days():
    assert people_needed(168, 8 * 7, 3) == 1
    assert people_needed(672, 8 * 7, 3) == 4
