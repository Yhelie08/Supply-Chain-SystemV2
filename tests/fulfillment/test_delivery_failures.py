# Sorting engine, Broken rule (spec v1.4, 05 / 01 Sorting Engine and 03 Fulfillment / 02 Order Readiness): a package is Broken when its
# order has a failed/partial DELIVERY job whose reason is damaged_in_transit or refused (the two codes of BROKEN_FAILURE_CODES in Delivery's
# scheduling.mjs). Fulfillment only READS Delivery's Service_Appointment_Form (owner permission 2026-11-20); it never writes it.
# The job is matched to the package by sales order. A failure is "open" until a redelivery of it (Rescheduled_From_SA) is done or archived,
# or the failed job itself is archived. Assumptions (not spelled out in the spec; the owner is asked to confirm): match by sales order only
# (a redo package has a new package number), and done/archived are the "resolved" job statuses.
from datetime import datetime, timezone

import pytest

from app.fulfillment.delivery_failures import broken_failures
from app.fulfillment.sorter import categorize, rescore_all
from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment  # noqa: F401

SOF, SA = "Sales_Order_Fulfillment", "Service_Appointment_Form"
NOW = datetime(2026, 11, 17, tzinfo=timezone.utc)
PKG = {"SO_No": "SO-1", "target_delivery_date": "2026-12-01", "order_type": "Normal", "Shipping_Address": "1 Main St"}


def _policy(key):
    return None


def _job(id_, so="SO-1", code="damaged_in_transit", status="on_site", **extra):
    return {"ID": id_, "Sales_Order": so, "Failure_Reason_Code": code, "Job_Status": status, **extra}


def test_only_the_two_broken_codes_count():
    jobs = [_job("1", code="damaged_in_transit"), _job("2", code="refused"), _job("3", code="not_home"), _job("4", code="gate_refused"), _job("5", code="")]
    assert [j["ID"] for j in broken_failures(jobs)] == ["1", "2"]


def test_a_failure_stays_open_while_its_redelivery_is_not_finished():
    jobs = [_job("1"), _job("2", code="", status="scheduled", Rescheduled_From_SA="1")]
    assert [j["ID"] for j in broken_failures(jobs)] == ["1"]


def test_a_failure_is_resolved_when_its_redelivery_is_done_or_archived():
    for finished in ("done", "archived"):
        jobs = [_job("1"), _job("2", code="", status=finished, Rescheduled_From_SA="1")]
        assert broken_failures(jobs) == []


def test_an_archived_failed_job_is_not_open():
    assert broken_failures([_job("1", status="archived")]) == []


def test_categorize_broken_for_a_package_whose_order_has_an_open_damaged_in_transit_failure():
    out = categorize(PKG, gates=[], open_exceptions=[], failed_jobs=[_job("1")], now=NOW, policy=_policy)
    assert out["category"] == "broken"
    assert "damaged in transit" in out["priorityReason"]


def test_categorize_broken_for_a_refused_job_names_the_reason():
    out = categorize(PKG, gates=[], open_exceptions=[], failed_jobs=[_job("1", code="refused")], now=NOW, policy=_policy)
    assert out["category"] == "broken" and "refused" in out["priorityReason"]


def test_a_failure_of_another_order_does_not_make_this_package_broken():
    out = categorize(PKG, gates=[], open_exceptions=[], failed_jobs=[_job("1", so="SO-2")], now=NOW, policy=_policy)
    assert out["category"] == "on_time"


def test_blocked_still_wins_over_a_failed_job():
    gates = [{"sales_order_number": "SO-1", "payment_status": "No", "Has_Credit_Terms": False, "Override_Approved": False}]
    out = categorize(PKG, gates=gates, open_exceptions=[], failed_jobs=[_job("1")], now=NOW, policy=_policy)
    assert out["category"] == "blocked"


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def _package(raw_store):
    return await raw_store.add_record(SOF, {"SO_No": "SO-1", "Fulfillment_Stage": "Order Readiness", "Package": "PAC-1", "Status": "Yes", "Customer_Type": "Corporate",
                                            "Delivery_Type": "Delivery Only", "order_type": "Normal", "Shipping_Address": "1 Main St", "Contact_No": "0917 000 0000",
                                            "target_delivery_date": "2026-12-30", "Item_Details1": [{"Item": "Lamp", "SKU": "L-1", "Quantity": "1"}]})


async def _category(raw_store):
    return next(s for s in await raw_store.find(SOF) if s["SO_No"] == "SO-1")["Category"]


@pytest.mark.asyncio
async def test_the_nightly_scoring_reads_delivery_jobs_and_marks_the_package_broken(raw_store):
    await _package(raw_store)
    await rescore_all(raw_store)
    assert await _category(raw_store) != "broken"
    await raw_store.add_record(SA, {"Sales_Order": "SO-1", "Failure_Reason_Code": "damaged_in_transit", "Job_Status": "on_site"})
    await rescore_all(raw_store)
    assert await _category(raw_store) == "broken"


@pytest.mark.asyncio
async def test_saving_a_delivery_job_rescores_the_package_at_once(raw_store):
    hooked = create_hooked_store(raw_store)
    await _package(raw_store)
    await rescore_all(raw_store)
    job = await hooked.add_record(SA, {"Sales_Order": "SO-1", "Job_Status": "on_site"})
    assert await _category(raw_store) != "broken"
    await hooked.update_record(SA, job["ID"] if isinstance(job, dict) else job, {"Failure_Reason_Code": "refused"}, by_form=True)
    assert await _category(raw_store) == "broken"
    # and the delivery job was only read, never changed by Fulfillment
    assert (await raw_store.find(SA))[0]["Failure_Reason_Code"] == "refused"
