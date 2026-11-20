# Sorting engine, Broken rule (spec v1.4, 05 / 01 Sorting Engine: Broken = "linked to an open RR, a Sales Return redelivery, or a failed/partial
# job with a fault reason"). The Sales Return part: a package whose order has a Sales Return (Delivery's Sales_Returns_Form) that is not finished
# is Broken, the same way an open Replacement Request makes it Broken. Fulfillment only READS that form (owner permission 2026-11-20).
# Open = Return_Status is not credit_note_issued or closed; a blank status (a return made before the status was stamped) counts as open.
# Assumption the spec does not spell out (the owner is asked to confirm): matched by SALES ORDER, like the RR rule and the failed-job rule.
from datetime import datetime, timezone

import pytest

from app.fulfillment.delivery_failures import open_sales_returns
from app.fulfillment.sorter import categorize, rescore_all
from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment  # noqa: F401

SOF, RET = "Sales_Order_Fulfillment", "Sales_Returns_Form"
NOW = datetime(2026, 11, 17, tzinfo=timezone.utc)
PKG = {"SO_No": "SO-1", "target_delivery_date": "2026-12-01", "order_type": "Normal", "Shipping_Address": "1 Main St"}


def _policy(key):
    return None


def _ret(so="SO-1", status="requested", **extra):
    return {"ID": "R1", "Sales_Order": so, "Return_Status": status, "RMA": "RMA-00001", **extra}


def test_a_return_is_open_until_the_credit_note_is_issued_or_it_is_closed():
    statuses = ["requested", "scheduled", "picked_up", "received_back", "credit_note_issued", "closed", ""]
    open_ = [r["Return_Status"] for r in open_sales_returns([_ret(status=s) for s in statuses])]
    assert open_ == ["requested", "scheduled", "picked_up", "received_back", ""]


def test_categorize_broken_when_the_order_has_an_open_sales_return():
    out = categorize(PKG, gates=[], open_exceptions=[], open_returns=[_ret()], now=NOW, policy=_policy)
    assert out["category"] == "broken" and "RMA-00001" in out["priorityReason"]


def test_a_return_of_another_order_does_not_make_this_package_broken():
    out = categorize(PKG, gates=[], open_exceptions=[], open_returns=[_ret(so="SO-2")], now=NOW, policy=_policy)
    assert out["category"] == "on_time"


def test_a_finished_return_does_not_make_it_broken():
    out = categorize(PKG, gates=[], open_exceptions=[], open_returns=open_sales_returns([_ret(status="closed")]), now=NOW, policy=_policy)
    assert out["category"] == "on_time"


def test_blocked_still_wins_over_a_sales_return():
    gates = [{"sales_order_number": "SO-1", "payment_status": "No", "Has_Credit_Terms": False, "Override_Approved": False}]
    out = categorize(PKG, gates=gates, open_exceptions=[], open_returns=[_ret()], now=NOW, policy=_policy)
    assert out["category"] == "blocked"


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def _package(raw_store):
    await raw_store.add_record(SOF, {"SO_No": "SO-1", "Fulfillment_Stage": "Order Readiness", "Package": "PAC-1", "Status": "Yes", "Customer_Type": "Corporate",
                                     "Delivery_Type": "Delivery Only", "order_type": "Normal", "Shipping_Address": "1 Main St", "Contact_No": "0917 000 0000",
                                     "target_delivery_date": "2026-12-30", "Item_Details1": [{"Item": "Lamp", "SKU": "L-1", "Quantity": "1"}]})


async def _category(raw_store):
    return next(s for s in await raw_store.find(SOF) if s["SO_No"] == "SO-1")["Category"]


@pytest.mark.asyncio
async def test_the_scoring_reads_sales_returns_and_clears_the_mark_when_the_return_is_closed(raw_store):
    hooked = create_hooked_store(raw_store)
    await _package(raw_store)
    await rescore_all(raw_store)
    assert await _category(raw_store) != "broken"
    ret = await hooked.add_record(RET, {"Sales_Order": "SO-1", "Return_Status": "requested", "RMA": "RMA-00001"})   # the hook re-scores at once
    assert await _category(raw_store) == "broken"
    await hooked.update_record(RET, ret["ID"] if isinstance(ret, dict) else ret, {"Return_Status": "closed"}, by_form=True)
    assert await _category(raw_store) != "broken"
    assert (await raw_store.find(RET))[0]["Return_Status"] == "closed"   # only read by Fulfillment, never written
