# Sorting engine, the spec v1.4 parts that were missing (05 Shared Engines / 01 Sorting Engine, 03 Fulfillment / 02 Order Readiness).
# Written first, 2026-11-20. What each group covers:
#   RANK     categories order the list (broken, late, at risk, on time); blocked is not in the work list; urgent first INSIDE a category
#            only (MU-5); sort_primary_key (SE-4).
#   BLOCKED  OR-R1: items not available (no package yet), contact number missing; the block has a named owner.
#   ACTIONS  suggested_action from a lookup table with built-in defaults (the 3 examples of the spec).
#   URGENCY  M1, MU-1 to MU-6.
#   AGING    sorting engine section 5: 7 / 14 / 21 days in the same stage.
#   RUNS     job_runs for the nightly and manual runs; the "ranking is stale" check (26 hours).
#   EVENTS   re-score on every material event (stage change, exception opened).
from datetime import datetime, timedelta, timezone

import pytest

from app.criteria import ZohoError, zoho_now
from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment  # noqa: F401  (registers every Fulfillment hook)
from app.fulfillment.sorter import capacity_summary, categorize, rank_and_cut_line, rescore_all, ranking_status, suggest_action
from app.fulfillment.aging import aging_level, parse_time
from app.fulfillment.urgency import urgent_orders
from app.fulfillment.pipeline import advance_stage

SOF, URGENCY, ACTIONS, RUNS, NOTES = "Sales_Order_Fulfillment", "Urgency_Requests", "Suggested_Actions", "Job_Runs", "App_Notifications"
NOW = datetime(2026, 11, 17, tzinfo=timezone.utc)


def _policy(**overrides):
    return lambda key: overrides.get(key)


def _entry(so, *, category="on_time", created="2026-11-01", target="", boxes=1, stage="Order Readiness", urgent=False, reason=None, code=None):
    return {"sof": {"SO_No": so, "SO_Created_Date": created, "target_delivery_date": target, "Item_Details1": [{"Quantity": str(boxes)}], "Fulfillment_Stage": stage},
            "category": category, "priorityReason": "x", "blockedReason": reason, "conditionCode": code, "urgent": urgent}


def _order(out):
    return [e["sof"]["SO_No"] for e in out]


# ---------------- RANK ----------------
def test_the_category_orders_the_list_before_the_age_does():
    entries = [_entry("SO-1", category="on_time", created="2026-10-01"), _entry("SO-2", category="late", created="2026-11-05"),
               _entry("SO-3", category="broken", created="2026-11-10"), _entry("SO-4", category="at_risk", created="2026-11-02")]
    assert _order(rank_and_cut_line(entries, capacity_boxes=100)) == ["SO-3", "SO-2", "SO-4", "SO-1"]


def test_inside_one_category_the_oldest_order_date_is_first():
    entries = [_entry("SO-2", category="late", created="2026-11-05"), _entry("SO-1", category="late", created="2026-11-01")]
    assert _order(rank_and_cut_line(entries, capacity_boxes=100)) == ["SO-1", "SO-2"]


def test_blocked_is_not_in_the_work_list_it_comes_after_it_and_is_never_suggested_nor_uses_capacity():
    entries = [_entry("SO-1", category="blocked", created="2026-09-01", boxes=50, reason="Payment not cleared"),
               _entry("SO-2", category="on_time", created="2026-11-01", boxes=5), _entry("SO-3", category="on_time", created="2026-11-02", boxes=5)]
    out = rank_and_cut_line(entries, capacity_boxes=5)   # room for exactly SO-2; the 50 blocked boxes are not counted anywhere
    assert _order(out) == ["SO-2", "SO-3", "SO-1"]
    assert [(e["sof"]["SO_No"], e["suggestedRelease"]) for e in out] == [("SO-2", True), ("SO-3", False), ("SO-1", False)]


def test_urgent_goes_first_inside_its_own_category_but_never_above_a_higher_category():
    entries = [_entry("SO-1", category="late", created="2026-10-01"), _entry("SO-2", category="late", created="2026-11-05", urgent=True),
               _entry("SO-3", category="on_time", created="2026-08-01", urgent=True)]
    assert _order(rank_and_cut_line(entries, capacity_boxes=100)) == ["SO-2", "SO-1", "SO-3"]


def test_sort_primary_key_target_delivery_ranks_by_target_first_inside_a_category():
    entries = [_entry("SO-1", created="2026-10-01", target="2026-12-20"), _entry("SO-2", created="2026-11-01", target="2026-11-25")]
    assert _order(rank_and_cut_line(entries, capacity_boxes=100)) == ["SO-1", "SO-2"]   # default: order date
    assert _order(rank_and_cut_line(entries, capacity_boxes=100, primary_key="target_delivery")) == ["SO-2", "SO-1"]


# ---------------- BLOCKED ----------------
def test_a_package_with_no_contact_number_is_blocked_with_a_named_owner():
    sof = {"SO_No": "SO-1", "Shipping_Address": "1 Main St", "Fulfillment_Stage": "Order Readiness"}
    out = categorize(sof, now=NOW, policy=_policy(), has_contact=False)
    assert (out["category"], out["blockedReason"], out["blockedOwner"], out["conditionCode"]) == ("blocked", "Missing contact number", "Sales agent", "blocked_contact")
    assert categorize(sof, now=NOW, policy=_policy(), has_contact=True)["category"] != "blocked"
    assert categorize(sof, now=NOW, policy=_policy())["category"] != "blocked"   # not told: no check


def test_a_package_still_waiting_for_its_items_is_blocked():
    sof = {"SO_No": "SO-1", "Shipping_Address": "1 Main St", "Fulfillment_Stage": "Waiting For Package"}
    out = categorize(sof, now=NOW, policy=_policy(), has_contact=True)
    assert (out["category"], out["blockedReason"], out["conditionCode"]) == ("blocked", "Items not available yet (no package)", "blocked_items")


def test_every_block_names_who_has_to_act():
    gate = [{"sales_order_number": "SO-1", "payment_status": "No"}]
    pay = categorize({"SO_No": "SO-1", "Shipping_Address": "x"}, gates=gate, now=NOW, policy=_policy())
    assert (pay["blockedOwner"], pay["conditionCode"]) == ("Sales agent", "blocked_payment")
    exc = categorize({"SO_No": "SO-1", "Shipping_Address": "x"}, open_exceptions=[{"Sales_Order": "SO-1", "Status": "Pending"}], now=NOW, policy=_policy())
    assert (exc["blockedOwner"], exc["conditionCode"]) == ("Fulfillment supervisor", "blocked_exception")
    addr = categorize({"SO_No": "SO-1"}, now=NOW, policy=_policy())
    assert (addr["blockedOwner"], addr["conditionCode"]) == ("Sales agent", "blocked_address")


# ---------------- ACTIONS ----------------
def test_the_default_suggested_actions_are_the_three_examples_of_the_spec():
    above = {**_entry("SO-1", category="late"), "suggestedRelease": True}
    below_late = {**_entry("SO-2", category="late"), "suggestedRelease": False}
    blocked_pay = {**_entry("SO-3", category="blocked", reason="Payment not cleared", code="blocked_payment"), "suggestedRelease": False}
    assert suggest_action(above) == "Release today"
    assert suggest_action(below_late) == "Add crew or release over capacity; supervisor decides"
    assert suggest_action(blocked_pay) == "Chase payment with sales agent"
    assert suggest_action({**_entry("SO-4", category="on_time"), "suggestedRelease": False}) == ""   # nothing in the spec: blank, never invented
    assert suggest_action({**_entry("SO-5", stage="Picking"), "suggestedRelease": False}) == ""   # already released


def test_an_admin_row_in_the_lookup_table_overrides_the_default_and_a_blank_category_matches_any():
    rows = [{"Module": "Fulfillment", "Category": "late", "Condition_Code": "above_line", "Action_Text": "Release first thing"},
            {"Module": "Fulfillment", "Category": "", "Condition_Code": "below_line", "Action_Text": "Wait for tomorrow"},
            {"Module": "Delivery", "Category": "late", "Condition_Code": "above_line", "Action_Text": "not ours"}]
    assert suggest_action({**_entry("SO-1", category="late"), "suggestedRelease": True}, rows) == "Release first thing"
    assert suggest_action({**_entry("SO-2", category="on_time"), "suggestedRelease": False}, rows) == "Wait for tomorrow"


# ---------------- URGENCY (pure) ----------------
def test_only_an_approved_request_that_has_not_expired_makes_an_order_urgent():
    rows = [{"SO_No": "SO-1", "Status": "Approved", "Expires_On": "2026-11-20", "Reason": "VIP"},
            {"SO_No": "SO-2", "Status": "Approved", "Expires_On": "2026-11-16", "Reason": "old"},
            {"SO_No": "SO-3", "Status": "Requested", "Expires_On": "", "Reason": "wait"},
            {"SO_No": "SO-4", "Status": "Rejected", "Expires_On": "2026-12-01", "Reason": "no"}]
    assert urgent_orders(rows, "2026-11-17") == {"SO-1": "VIP"}
    assert urgent_orders(rows, "2026-11-20") == {"SO-1": "VIP"}   # the last day still counts


# ---------------- AGING (pure) ----------------
def test_aging_levels_follow_the_settings_7_14_21_by_default():
    assert [aging_level(d, _policy()) for d in (0, 6, 7, 13, 14, 20, 21, 40)] == ["", "", "low", "low", "mid", "mid", "high", "high"]
    assert aging_level(3, _policy(aging_low_days="3", aging_mid_days="5", aging_high_days="9")) == "low"
    assert aging_level(9, _policy(aging_low_days="3", aging_mid_days="5", aging_high_days="9")) == "high"


def test_parse_time_reads_the_formats_the_system_writes():
    assert parse_time("2026-11-17 10:30:05 AM") == datetime(2026, 11, 17, 10, 30, 5)
    assert parse_time("2026-11-17 01:30:05 PM") == datetime(2026, 11, 17, 13, 30, 5)
    assert parse_time("2026-11-17 13:30:05") == datetime(2026, 11, 17, 13, 30, 5)
    assert parse_time("2026-11-17T13:30:05+00:00") == datetime(2026, 11, 17, 13, 30, 5, tzinfo=timezone.utc).astimezone().replace(tzinfo=None)   # a time with a zone becomes local time
    assert parse_time("") is None and parse_time(None) is None and parse_time("nonsense") is None


# ---------------- DATABASE ----------------
@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _package(raw_store, so="SO-1", **extra):
    return await raw_store.add_record(SOF, {"SO_No": so, "Package": f"PAC-{so}", "Status": "Yes", "Fulfillment_Stage": "Order Readiness", "Shipping_Address": "1 Main St",
                                            "Contact_No": "0917", "SO_Created_Date": "2026-11-01", "Item_Details1": [{"Item": "Lamp", "SKU": "L-1", "Quantity": "2"}], **extra})


async def _get(raw_store, id_):
    return await raw_store.get_record_by_id(SOF, id_, raw=True)


async def test_rescore_writes_category_rank_blocked_owner_and_the_suggested_action(raw_store):
    ok = await _package(raw_store, "SO-1", target_delivery_date="2026-11-01")           # late
    nophone = await _package(raw_store, "SO-2", Contact_No="")                           # blocked: no contact
    waiting = await _package(raw_store, "SO-3", Fulfillment_Stage="Waiting For Package")  # blocked: items
    out = await rescore_all(raw_store)
    assert out["scored"] == 3
    a, b, c = await _get(raw_store, ok), await _get(raw_store, nophone), await _get(raw_store, waiting)
    assert (a["Category"], a["Queue_Rank"], a["Suggested_Release"], a["Suggested_Action"]) == ("late", "1", True, "Release today")
    assert (b["Category"], b["Blocked_Reason"], b["Blocked_Owner"]) == ("blocked", "Missing contact number", "Sales agent")
    assert (c["Category"], c["Blocked_Reason"]) == ("blocked", "Items not available yet (no package)")
    assert a["Scored_At"]


async def test_the_contact_can_also_come_from_the_customer_record(raw_store):
    customer = await raw_store.add_record("Customer", {"customer_name": "Sample", "Phone_Number": "0917 000 0000"})
    id_ = await _package(raw_store, "SO-1", Contact_No="", Customer=customer)
    await rescore_all(raw_store)
    assert (await _get(raw_store, id_))["Category"] != "blocked"


async def test_the_sort_primary_key_setting_switches_the_ranking_without_code_changes(raw_store):
    a = await _package(raw_store, "SO-1", SO_Created_Date="2026-10-01", target_delivery_date="2027-03-01")
    b = await _package(raw_store, "SO-2", SO_Created_Date="2026-11-01", target_delivery_date="2027-02-01")
    await rescore_all(raw_store)
    assert ((await _get(raw_store, a))["Queue_Rank"], (await _get(raw_store, b))["Queue_Rank"]) == ("1", "2")
    await raw_store.add_record("Policy_Settings", {"Policy_Key": "sort_primary_key", "Value": "target_delivery"})
    await rescore_all(raw_store)
    assert ((await _get(raw_store, a))["Queue_Rank"], (await _get(raw_store, b))["Queue_Rank"]) == ("2", "1")


# ---- urgency requests (MU-1 to MU-6)
async def _request(hooked_store, **fields):
    return await hooked_store.add_record(URGENCY, {"SO_No": "SO-1", "Reason": "VIP customer", "Requested_By": "Maria (sales)", **fields})


async def test_an_urgency_request_needs_a_name_and_a_reason(hooked_store):
    with pytest.raises(ZohoError) as e:
        await hooked_store.add_record(URGENCY, {"SO_No": "SO-1", "Reason": "", "Requested_By": ""})
    assert "name" in e.value.message and "reason" in e.value.message
    id_ = await _request(hooked_store)
    assert (await hooked_store.get_record_by_id(URGENCY, id_, raw=True))["Status"] == "Requested"


async def test_approving_needs_the_approver_s_name_and_sets_the_expiry_to_the_target_date(hooked_store, raw_store):
    await _package(raw_store, "SO-1", target_delivery_date="2026-12-15")
    id_ = await _request(hooked_store)
    with pytest.raises(ZohoError):
        await hooked_store.update_record(URGENCY, id_, {"Status": "Approved"}, by_form=True)
    await hooked_store.update_record(URGENCY, id_, {"Status": "Approved", "Approved_By": "Supervisor Ben"}, by_form=True)
    r = await hooked_store.get_record_by_id(URGENCY, id_, raw=True)
    assert (r["Status"], r["Expires_On"]) == ("Approved", "2026-12-15") and r["Approved_On"]


async def test_with_no_target_date_the_urgency_expires_after_14_days(hooked_store, raw_store):
    await _package(raw_store, "SO-1")
    id_ = await _request(hooked_store)
    await hooked_store.update_record(URGENCY, id_, {"Status": "Approved", "Approved_By": "Supervisor Ben"}, by_form=True)
    r = await hooked_store.get_record_by_id(URGENCY, id_, raw=True)
    assert r["Expires_On"] == (datetime.now().date() + timedelta(days=14)).isoformat()


async def test_an_approved_urgency_cannot_be_lowered_or_deleted_by_hand(hooked_store, raw_store):
    await _package(raw_store, "SO-1")
    id_ = await _request(hooked_store)
    await hooked_store.update_record(URGENCY, id_, {"Status": "Approved", "Approved_By": "Supervisor Ben"}, by_form=True)
    for status in ("Rejected", "Requested"):
        with pytest.raises(ZohoError) as e:
            await hooked_store.update_record(URGENCY, id_, {"Status": status}, by_form=True)
        assert "expire" in e.value.message
    with pytest.raises(ZohoError):
        await hooked_store.delete_record(URGENCY, id_)
    pending = await _request(hooked_store, SO_No="SO-2")
    await hooked_store.delete_record(URGENCY, pending)   # a request that was never approved can be withdrawn


async def test_an_approved_urgency_puts_the_order_first_inside_its_category_and_marks_it(hooked_store, raw_store):
    old = await _package(raw_store, "SO-1", SO_Created_Date="2026-10-01", target_delivery_date="2027-06-01")   # same category (on time)
    newer = await _package(raw_store, "SO-2", SO_Created_Date="2026-11-10", target_delivery_date="2027-06-01")
    await rescore_all(raw_store)
    assert (await _get(raw_store, old))["Queue_Rank"] == "1"
    id_ = await _request(hooked_store, SO_No="SO-2")
    await hooked_store.update_record(URGENCY, id_, {"Status": "Approved", "Approved_By": "Supervisor Ben"}, by_form=True)   # the save re-scores
    a, b = await _get(raw_store, old), await _get(raw_store, newer)
    assert (b["Queue_Rank"], a["Queue_Rank"]) == ("1", "2")
    assert b["Urgent"] is True and "VIP customer" in b["Priority_Reason"] and a["Urgent"] is not True


async def test_too_many_urgent_orders_raise_the_warning(hooked_store, raw_store):
    for i in range(1, 11):
        await _package(raw_store, f"SO-{i}")
    for i in (1, 2):   # 2 of 10 = 20%, above the 5% default
        id_ = await _request(hooked_store, SO_No=f"SO-{i}")
        await hooked_store.update_record(URGENCY, id_, {"Status": "Approved", "Approved_By": "Supervisor Ben"}, by_form=True)
    out = await rescore_all(raw_store)
    assert out["urgent"] == 2 and out["urgentWarning"] is True and out["urgentPct"] == 20.0


# ---- suggested actions table
async def test_rescore_uses_the_admin_table_over_the_default(raw_store):
    id_ = await _package(raw_store, "SO-1", target_delivery_date="2026-11-01")
    await raw_store.add_record(ACTIONS, {"Module": "Fulfillment", "Category": "late", "Condition_Code": "above_line", "Action_Text": "Release first thing"})
    await rescore_all(raw_store)
    assert (await _get(raw_store, id_))["Suggested_Action"] == "Release first thing"


# ---- aging guard
def _ago(days):
    return zoho_now(datetime.now() - timedelta(days=days))


async def _enter(raw_store, id_, event, days_ago):
    await raw_store.add_record("Stage_Events", {"Record_Type": "package", "Record_Id": str(id_), "Event": event, "Occurred_At": _ago(days_ago), "Reported_At": _ago(days_ago), "Source": "system"})


async def test_aging_counts_from_the_stamp_of_the_stage_the_package_is_in_now(raw_store):
    id_ = await _package(raw_store, "SO-1")
    await _enter(raw_store, id_, "package.order_readiness", 30)   # an old stamp of ANOTHER stage must not count
    await _enter(raw_store, id_, "package.picking", 40)
    await _enter(raw_store, id_, "package.order_readiness", 8)    # the latest entry into this stage
    await rescore_all(raw_store)
    r = await _get(raw_store, id_)
    assert (r["Aging_Days"], r["Aging_Level"]) == ("8", "low")


async def test_a_package_with_no_stamp_counts_from_the_day_it_was_imported_so_go_live_raises_nothing(raw_store):
    id_ = await _package(raw_store, "SO-1", SO_Created_Date="2025-01-01")   # a very old order, just imported
    await rescore_all(raw_store)
    r = await _get(raw_store, id_)
    assert r["Aging_Days"] == "0" and (r["Aging_Level"] or "") == ""
    assert await raw_store.find(NOTES) == []


async def test_14_days_tells_the_supervisor_21_days_escalates_to_the_admin_once_each(raw_store):
    mid = await _package(raw_store, "SO-1")
    high = await _package(raw_store, "SO-2")
    low = await _package(raw_store, "SO-3")
    await _enter(raw_store, mid, "package.order_readiness", 15)
    await _enter(raw_store, high, "package.order_readiness", 22)
    await _enter(raw_store, low, "package.order_readiness", 8)
    await rescore_all(raw_store)
    await rescore_all(raw_store)   # the second run must not tell them again
    notes = await raw_store.find(NOTES)
    kinds = sorted((n["Notification_Type"], n["Source_Record_ID"]) for n in notes)
    assert kinds == sorted([("Aging 14 Days", str(mid)), ("Aging 21 Days", str(high))])   # nothing for 8 days (low = a flag only)
    assert all("Order Readiness" in n["Message"] for n in notes)
    assert [(await _get(raw_store, i))["Aging_Level"] for i in (mid, high, low)] == ["mid", "high", "low"]


async def test_a_package_that_already_left_for_delivery_is_not_aged(raw_store):
    id_ = await _package(raw_store, "SO-1", Fulfillment_Stage="For Delivery")
    await _enter(raw_store, id_, "package.for_delivery", 60)
    await rescore_all(raw_store)
    assert await raw_store.find(NOTES) == []


# ---- job_runs and the stale check
async def test_the_nightly_and_the_manual_run_write_a_job_run_but_a_re_score_after_a_save_does_not(raw_store):
    await _package(raw_store, "SO-1")
    await rescore_all(raw_store)                       # after an event: no row
    assert await raw_store.find(RUNS) == []
    await rescore_all(raw_store, trigger="nightly")
    await rescore_all(raw_store, trigger="manual")
    rows = sorted(await raw_store.find(RUNS), key=lambda r: int(r["ID"]))
    assert [(r["Job_Name"], r["Status"], str(r["Rows_Touched"])) for r in rows] == [("Recalculate_Fulfillment_Queue (nightly)", "ok", "1"), ("Recalculate_Fulfillment_Queue (manual)", "ok", "1")]
    assert rows[0]["Started_At"] and rows[0]["Finished_At"]


async def test_the_nightly_schedule_logs_its_run(raw_store):
    from app.fulfillment import SCHEDULES
    job = next(s for s in SCHEDULES if s["name"] == "Recalculate_Fulfillment_Queue")
    await _package(raw_store, "SO-1")
    await job["run"](raw_store, lambda m: None)
    assert [r["Job_Name"] for r in await raw_store.find(RUNS)] == ["Recalculate_Fulfillment_Queue (nightly)"]


async def test_a_failed_run_is_logged_as_failed_and_re_raised(raw_store):
    class Broken:
        def __getattr__(self, name):
            return getattr(raw_store, name)

        async def find(self, form, *a, **k):
            if form == "Capacity_Days":
                raise RuntimeError("database went away")
            return await raw_store.find(form, *a, **k)
    with pytest.raises(RuntimeError):
        await rescore_all(Broken(), trigger="nightly")
    row = (await raw_store.find(RUNS))[0]
    assert (row["Status"], row["Error"]) == ("failed", "database went away")


async def test_the_ranking_is_stale_when_nothing_was_scored_for_26_hours(raw_store):
    assert (await ranking_status(raw_store))["stale"] is False            # no open packages: nothing to be stale about
    id_ = await _package(raw_store, "SO-1")
    assert (await ranking_status(raw_store))["stale"] is True             # open package, never scored
    await rescore_all(raw_store)
    assert (await ranking_status(raw_store))["stale"] is False
    await raw_store.update_record(SOF, id_, {"Scored_At": _ago(2)}, by_form=True)
    out = await ranking_status(raw_store)
    assert out["stale"] is True and out["staleAfterHours"] == 26 and out["scoredAt"]
    await raw_store.update_record(SOF, id_, {"Scored_At": _ago(0)}, by_form=True)
    assert (await ranking_status(raw_store))["stale"] is False


# ---- re-score on every material event
async def test_a_stage_change_made_inside_a_hook_re_scores(hooked_store, raw_store):
    id_ = await _package(raw_store, "SO-1")
    assert (await _get(raw_store, id_)).get("Scored_At") in (None, "")
    await advance_stage(raw_store, "SO-1", "Lamp", "L-1", "Picking")   # a raw write inside a hook, like Release does
    assert (await _get(raw_store, id_))["Scored_At"]


async def test_opening_an_exception_blocks_the_package_at_once_and_closing_it_brings_it_back(hooked_store, raw_store):
    id_ = await _package(raw_store, "SO-1")
    await rescore_all(raw_store)
    assert (await _get(raw_store, id_))["Category"] != "blocked"
    exc = await hooked_store.add_record("Exception_Control1", {"Sales_Order": "SO-1", "SKU": "L-1", "PAC": "PAC-SO-1", "Status": "Pending", "Item_Name": "Lamp"})
    assert (await _get(raw_store, id_))["Category"] == "blocked"
    await hooked_store.update_record("Exception_Control1", exc, {"Status": "Completed"}, by_form=True)
    assert (await _get(raw_store, id_))["Category"] != "blocked"


# =====================================================================================================================
# Decisions taken 2026-11-20 where the files were silent or ambiguous (owner: "follow the files; where there is none, recommend")
# =====================================================================================================================
# ---- cut line (OR-R3): the list stops at the package that would exceed the capacity
def test_the_specs_own_example_224_boxes_stops_at_the_package_that_would_exceed():
    entries = [_entry(f"SO-{i}", created=f"2026-11-0{i}", boxes=b) for i, b in enumerate([100, 100, 40, 10], start=1)]
    out = rank_and_cut_line(entries, capacity_boxes=224)
    assert [(e["sof"]["SO_No"], e["suggestedRelease"]) for e in out] == [("SO-1", True), ("SO-2", True), ("SO-3", False), ("SO-4", False)]   # 200 fit, 240 would exceed, and the small 10 does not jump the older 40


def test_a_package_that_exactly_fills_the_capacity_is_suggested():
    entries = [_entry("SO-1", created="2026-11-01", boxes=100), _entry("SO-2", created="2026-11-02", boxes=124), _entry("SO-3", created="2026-11-03", boxes=1)]
    assert [e["suggestedRelease"] for e in rank_and_cut_line(entries, capacity_boxes=224)] == [True, True, False]


def test_a_top_package_bigger_than_the_whole_capacity_is_suggested_alone_so_it_is_never_stuck():
    entries = [_entry("SO-1", created="2026-11-01", boxes=300), _entry("SO-2", created="2026-11-02", boxes=5)]
    assert [e["suggestedRelease"] for e in rank_and_cut_line(entries, capacity_boxes=224)] == [True, False]


def test_with_no_free_capacity_nothing_is_suggested_not_even_the_top_package():
    entries = [_entry("SO-1", created="2026-11-01", boxes=500, stage="Picking"), _entry("SO-2", created="2026-11-02", boxes=5)]
    assert [e["suggestedRelease"] for e in rank_and_cut_line(entries, capacity_boxes=224)] == [False, False]


# ---- WIP: released and not yet finished (Picking, Pack & QC, Crate) uses capacity; Order Aggregation is finished work
def test_only_picking_qc_and_crate_use_capacity_and_order_aggregation_does_not():
    for stage, uses in (("Picking", True), ("Pack & QC", True), ("Crate", True), ("Order Aggregation", False)):
        entries = [_entry("SO-1", created="2026-11-01", boxes=200, stage=stage), _entry("SO-2", created="2026-11-02", boxes=20), _entry("SO-3", created="2026-11-03", boxes=20)]
        out = {e["sof"]["SO_No"]: e["suggestedRelease"] for e in rank_and_cut_line(entries, capacity_boxes=224)}
        assert out["SO-1"] is False                                      # already released, never suggested again
        assert out["SO-2"] is True
        assert out["SO-3"] is (not uses), stage                          # 224 - 200 = 24 free if the released one uses capacity: only one of the two 20s fits


# ---- slack = days to target minus the work days still needed (fulfillment_days 3 + delivery_days 2)
def _slack_sof(target, stage="Order Readiness"):
    return {"SO_No": "SO-1", "target_delivery_date": target, "order_type": "Normal", "Shipping_Address": "x", "Fulfillment_Stage": stage}


def test_slack_counts_the_work_days_still_needed_so_a_target_8_days_out_is_already_at_risk():
    assert categorize(_slack_sof("2026-11-25"), now=NOW, policy=_policy())["category"] == "at_risk"     # 8 days - 5 = 3 <= 3
    assert categorize(_slack_sof("2026-11-26"), now=NOW, policy=_policy())["category"] == "on_time"     # 9 days - 5 = 4
    assert "3 day(s) of slack" in categorize(_slack_sof("2026-11-25"), now=NOW, policy=_policy())["priorityReason"]


def test_once_the_warehouse_work_is_done_only_the_delivery_days_are_left():
    assert categorize(_slack_sof("2026-11-22", "Order Aggregation"), now=NOW, policy=_policy())["category"] == "at_risk"   # 5 days - 2 = 3
    assert categorize(_slack_sof("2026-11-23", "Order Aggregation"), now=NOW, policy=_policy())["category"] == "on_time"   # 6 days - 2 = 4


def test_the_work_day_settings_come_from_the_policy_and_late_is_still_just_past_the_target():
    pol = _policy(fulfillment_days="1", delivery_days="1")
    assert categorize(_slack_sof("2026-11-21"), now=NOW, policy=pol)["category"] == "at_risk"    # 4 days - 2 = 2
    assert categorize(_slack_sof("2026-11-22"), now=NOW, policy=pol)["category"] == "at_risk"    # 5 - 2 = 3 (<= 3)
    assert categorize(_slack_sof("2026-11-23"), now=NOW, policy=pol)["category"] == "on_time"    # 6 - 2 = 4
    assert categorize(_slack_sof("2026-11-16"), now=NOW, policy=pol)["category"] == "late"       # today (17th) is past the 16th


# ---- aging: the exception of section 5 (not blocking), High at 21 days, closed when the package moves on
async def _aging_exceptions(raw_store):
    return sorted(await raw_store.find("Exceptions", lambda e: str(e.get("Exception_Line_Key") or "").startswith("aging:")), key=lambda e: int(e["ID"]))


async def test_14_days_in_a_stage_opens_one_exception_that_does_not_block_the_package(raw_store):
    id_ = await _package(raw_store, "SO-1")
    await _enter(raw_store, id_, "package.order_readiness", 15)
    await rescore_all(raw_store)
    await rescore_all(raw_store)   # once only
    excs = await _aging_exceptions(raw_store)
    assert len(excs) == 1
    x = excs[0]
    assert (x["Source_Module"], x["Assigned_Department"], x["Exception_Status"], x["Priority"], x["Sales_Order"]) == ("Fulfillment EXC", "Fulfillment", "Open", "Medium", "SO-1")
    assert x["Exception_No"].startswith("EXC") and "15 days" in x["Exception_Title"] and x["Exception_Line_Key"] == f"aging:{id_}:order_readiness"
    assert (await _get(raw_store, id_))["Category"] != "blocked"   # an aging exception must not bury the package even more


async def test_21_days_raises_the_same_exception_to_high_and_a_package_straight_at_21_gets_it_as_high(raw_store):
    a = await _package(raw_store, "SO-1")
    b = await _package(raw_store, "SO-2")
    await _enter(raw_store, a, "package.order_readiness", 15)
    await rescore_all(raw_store)
    await raw_store.delete_record("Stage_Events", (await raw_store.find("Stage_Events"))[0]["ID"]) if False else None
    await _enter(raw_store, a, "package.order_readiness", 22)   # a later stamp of the same stage: now 22 days
    await _enter(raw_store, b, "package.order_readiness", 23)
    await rescore_all(raw_store)
    by_so = {x["Sales_Order"]: x for x in await _aging_exceptions(raw_store)}
    assert set(by_so) == {"SO-1", "SO-2"}
    assert by_so["SO-2"]["Priority"] == "High"


async def test_the_aging_exception_is_closed_when_the_package_moves_to_another_stage(raw_store):
    id_ = await _package(raw_store, "SO-1")
    await _enter(raw_store, id_, "package.order_readiness", 15)
    await rescore_all(raw_store)
    assert (await _aging_exceptions(raw_store))[0]["Exception_Status"] == "Open"
    await advance_stage(raw_store, "SO-1", "Lamp", "L-1", "Picking")
    x = (await _aging_exceptions(raw_store))[0]
    assert x["Exception_Status"] == "Resolved" and x["Resolved_At"]


async def test_a_package_under_14_days_opens_no_exception(raw_store):
    id_ = await _package(raw_store, "SO-1")
    await _enter(raw_store, id_, "package.order_readiness", 10)
    await rescore_all(raw_store)
    assert await _aging_exceptions(raw_store) == []


# ---- notifications on a CHANGE of category only (OR-R6)
async def test_becoming_late_notifies_and_staying_late_does_not(raw_store):
    id_ = await _package(raw_store, "SO-1", target_delivery_date="2027-06-01")
    await rescore_all(raw_store)                       # first scoring: nothing, whatever the category
    assert await raw_store.find(NOTES) == []
    await raw_store.update_record(SOF, id_, {"target_delivery_date": "2026-11-01"}, by_form=True)
    await rescore_all(raw_store)
    await rescore_all(raw_store)                       # still late: no second message
    late = [n for n in await raw_store.find(NOTES) if n["Notification_Type"] == "Order Late"]
    assert len(late) == 1 and "SO-1" in late[0]["Message"] and "sales agent" in late[0]["Message"]


async def test_becoming_blocked_tells_the_owner_by_name_and_an_already_late_import_tells_nobody(raw_store):
    id_ = await _package(raw_store, "SO-1", target_delivery_date="2027-06-01")
    await _package(raw_store, "SO-2", target_delivery_date="2026-01-01")   # imported already late
    await rescore_all(raw_store)
    await raw_store.update_record(SOF, id_, {"Contact_No": ""}, by_form=True)
    await rescore_all(raw_store)
    kinds = [(n["Notification_Type"], n["Source_Record_No"]) for n in await raw_store.find(NOTES)]
    assert kinds == [("Order Blocked", "SO-1")]
    note = (await raw_store.find(NOTES))[0]
    assert "Missing contact number" in note["Message"] and "Sales agent" in note["Message"]


# ---- the capacity bar and crew sizing numbers
async def test_the_capacity_summary_gives_capacity_progress_suggested_backlog_and_crew(raw_store):
    await raw_store.add_record("Capacity_Days", {"Date": datetime.now().date().isoformat(), "People": "4", "Boxes_Per_Hour": "8", "Hours_Per_Day": "7"})   # 224 boxes
    await _package(raw_store, "SO-1", Fulfillment_Stage="Picking", Box_Count="100", Box_Count_Source="counted", target_delivery_date="2027-06-01")
    await _package(raw_store, "SO-2", Box_Count="60", Box_Count_Source="counted", target_delivery_date="2026-11-01")     # late, waiting
    await _package(raw_store, "SO-3", Box_Count="100", Box_Count_Source="counted", target_delivery_date="2027-06-01")    # on time, waiting
    out = await capacity_summary(raw_store)
    assert out["capacityBoxes"] == 224 and out["inProgressBoxes"] == 100 and out["freeBoxes"] == 124 and out["overCapacityBy"] == 0
    assert out["suggestedBoxes"] == 60 and out["suggestedCount"] == 1                       # 124 free: the late 60 fits, the next 100 would exceed
    assert out["openBoxes"] == 260 and out["backlogDays"] == 1.2                            # 260 / 224
    assert out["dueBoxes"] == 60 and out["crewDays"] == 3 and out["lateOrAtRiskCount"] == 1
    assert out["peopleNeeded"] == 0.4                                                       # 60 / (8 x 7 x 3 days)


async def test_over_capacity_is_reported_when_more_was_released_than_the_day_can_do(raw_store):
    await raw_store.add_record("Capacity_Days", {"Date": datetime.now().date().isoformat(), "People": "1", "Boxes_Per_Hour": "8", "Hours_Per_Day": "7"})   # 56 boxes
    await _package(raw_store, "SO-1", Fulfillment_Stage="Picking", Box_Count="80", Box_Count_Source="counted")
    out = await capacity_summary(raw_store)
    assert out["overCapacityBy"] == 24 and out["freeBoxes"] == 0 and out["suggestedCount"] == 0


async def test_the_capacity_summary_writes_nothing(raw_store):
    id_ = await _package(raw_store, "SO-1")
    await capacity_summary(raw_store)
    assert (await _get(raw_store, id_)).get("Scored_At") in (None, "")
    assert await raw_store.find(NOTES) == [] and await raw_store.find(RUNS) == []


async def test_a_new_qc_rejection_blocks_the_package_even_though_the_exception_has_no_status_yet(hooked_store, raw_store):
    # found in the browser 2026-11-20: the QC routing creates the exception with NO Status, and the Exception Control widget shows a blank
    # status as "Pending"; the sorter did not, so the package stayed workable (EX-3: an open exception holds the package)
    id_ = await _package(raw_store, "SO-1")
    await raw_store.add_record("Exception_Control1", {"Sales_Order": "SO-1", "SKU": "L-1", "PAC": "PAC-SO-1", "Item_Name": "Lamp"})   # Status left blank
    await rescore_all(raw_store)
    r = await _get(raw_store, id_)
    assert (r["Category"], r["Blocked_Reason"], r["Blocked_Owner"]) == ("blocked", "Open exception", "Fulfillment supervisor")
    for closed in ("Completed", "OK", "Unrepairable"):
        exc = (await raw_store.find("Exception_Control1"))[0]
        await raw_store.update_record("Exception_Control1", exc["ID"], {"Status": closed}, by_form=True)
        await rescore_all(raw_store)
        assert (await _get(raw_store, id_))["Category"] != "blocked", closed
