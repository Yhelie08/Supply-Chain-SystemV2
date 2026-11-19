# Fulfillment sorting engine (spec: HomeCartel v1.4, 05 Shared Engines / 01 Sorting Engine; this
# module covers Fulfillment only). categorize(): what kind of attention a package needs.
# rank_and_cut_line(): oldest-SO-first order plus today's cut line. Pure where possible:
# categorize() takes everything it needs as arguments so it is trivially testable and so a second
# run on identical input always gives the identical answer (determinism is an explicit acceptance
# requirement). Ported from server/modules/fulfillment/sorter.mjs.
import re
from datetime import date, datetime, timedelta, timezone

from app.deluge import blank
from app.fulfillment.pipeline import STAGE_ORDER
from app.fulfillment.workflows import needs_payment_approval
from app.policy import policy_reader

SOF_NAME = "Sales_Order_Fulfillment"


def _open_stage(stage) -> bool:
    return stage != "For Delivery"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _to_num(v) -> float:
    try:
        return float(_text(v))
    except ValueError:
        return 0.0


async def capacity_for(store, date_str: str) -> dict:
    rows = await store.find("Capacity_Days")
    exact = next((r for r in rows if _text(r.get("Date")) == date_str), None)
    earlier = sorted((r for r in rows if _text(r.get("Date")) != "" and r.get("Date") < date_str), key=lambda r: r["Date"], reverse=True)
    row = exact or (earlier[0] if earlier else None)
    policy = await policy_reader(store)
    people = _to_num(row["People"]) if row else (float(policy("fulfillment_default_people") or 0) or 4)
    boxes_per_hour = _to_num(row["Boxes_Per_Hour"]) if row else (float(policy("fulfillment_boxes_per_hour") or 0) or 8)
    hours_per_day = _to_num(row["Hours_Per_Day"]) if row else (float(policy("fulfillment_hours_per_day") or 0) or 7)
    return {"people": people, "boxesPerHour": boxes_per_hour, "hoursPerDay": hours_per_day, "capacityBoxes": people * boxes_per_hour * hours_per_day}


_OPEN_EXCEPTION_STATUSES = {"Pending", "In Rework"}
_BROKEN_ORDER_TYPES = {"Complaint", "Replacement"}
_RR_DONE_STATUSES = {"Closed", "Completed", "Cancelled"}


def _days_until(date_str, now) -> int | None:
    if blank(date_str):
        return None
    try:
        d = datetime.strptime(str(date_str)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return round((d - today).total_seconds() / 86400)


def _effective_target(sof, policy):
    if not blank(sof.get("target_delivery_date")):
        return sof["target_delivery_date"]
    if blank(sof.get("SO_Created_Date")):
        return None
    days = int(policy("default_promise_days") or 0) or 25
    try:
        d = datetime.strptime(str(sof["SO_Created_Date"])[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    d = d + timedelta(days=days)
    return d.strftime("%Y-%m-%d")


def _blocked_check(sof, gates, open_exceptions) -> str | None:
    so = _text(sof.get("SO_No"))
    if any(_text(g.get("sales_order_number")) == so and needs_payment_approval(g) for g in gates):
        return "Payment not cleared"
    if any(_text(e.get("Sales_Order")) == so and _text(e.get("Status")) in _OPEN_EXCEPTION_STATUSES for e in open_exceptions):
        return "Open exception"
    if blank(sof.get("Shipping_Address")) and blank(sof.get("Billing_Address")):
        return "Missing delivery address"
    return None


def categorize(sof: dict, *, gates=None, open_exceptions=None, open_rrs=None, now=None, policy=None) -> dict:
    gates = gates or []
    open_exceptions = open_exceptions or []
    open_rrs = open_rrs or []
    now = now or datetime.now(timezone.utc)
    policy = policy or (lambda k: None)

    blocked_reason = _blocked_check(sof, gates, open_exceptions)
    if blocked_reason:
        return {"category": "blocked", "blockedReason": blocked_reason, "priorityReason": blocked_reason}

    open_rr = next((rr for rr in open_rrs if _text(rr.get("RR_SO")) == _text(sof.get("SO_No"))), None)
    if open_rr:
        return {"category": "broken", "blockedReason": None, "priorityReason": f"Replacement request {_text(open_rr.get('RR_No')) or 'open'}"}

    is_broken = _text(sof.get("order_type")) in _BROKEN_ORDER_TYPES
    target = _effective_target(sof, policy)
    no_target_set = blank(sof.get("target_delivery_date"))
    slack = _days_until(target, now)

    if is_broken:
        return {"category": "broken", "blockedReason": None, "priorityReason": "Replacement, no target set" if no_target_set else "Replacement / complaint"}
    if slack is not None and slack < 0:
        return {"category": "late", "blockedReason": None, "priorityReason": f"{abs(slack)} day(s) past target"}
    forecast_misses = not blank(sof.get("Forecast_Delivery")) and not blank(target) and sof["Forecast_Delivery"] > target
    at_risk_slack_days = int(policy("at_risk_slack_days") or 0) or 3
    if forecast_misses or (slack is not None and slack <= at_risk_slack_days):
        return {"category": "at_risk", "blockedReason": None, "priorityReason": "Forecast misses target" if forecast_misses else f"{slack} day(s) of slack left"}
    return {"category": "on_time", "blockedReason": None, "priorityReason": "On time (no target set)" if no_target_set else "On time"}


def _estimated_boxes(sof) -> float:
    return sum(_to_num(row.get("Quantity")) for row in sof.get("Item_Details1") or [])


def effective_boxes(sof) -> float:
    if _text(sof.get("Box_Count_Source")) == "counted" and not blank(sof.get("Box_Count")):
        return _to_num(sof["Box_Count"])
    return _estimated_boxes(sof)


_TRAILING_DIGITS_RE = re.compile(r"(\d+)\s*$")


def _record_number_key(so_no) -> float:
    m = _TRAILING_DIGITS_RE.search(_text(so_no))
    return float(m.group(1)) if m else float("inf")


def _compare_key(e: dict) -> tuple:
    urgent = 0  # always false this slice (no urgency_requests table yet)
    created = _text(e["sof"].get("SO_Created_Date")) or "9999-99-99"
    target = _text(e["sof"].get("target_delivery_date")) or "9999-99-99"
    return (urgent, created, target, _record_number_key(e["sof"].get("SO_No")), _text(e["sof"].get("SO_No")))


_WIP_STAGES = set(STAGE_ORDER[STAGE_ORDER.index("Picking"):STAGE_ORDER.index("Order Aggregation") + 1])


def _is_wip(sof) -> bool:
    return _text(sof.get("Fulfillment_Stage")) in _WIP_STAGES


def rank_and_cut_line(entries: list, *, capacity_boxes: float) -> list:
    sorted_entries = sorted(entries, key=_compare_key)
    wip_boxes = sum(effective_boxes(e["sof"]) for e in sorted_entries if _is_wip(e["sof"]))
    free_capacity = max(0, capacity_boxes - wip_boxes)
    used = 0.0
    out = []
    for i, e in enumerate(sorted_entries):
        if _is_wip(e["sof"]):
            out.append({**e, "queueRank": i + 1, "suggestedRelease": False})
            continue
        boxes = effective_boxes(e["sof"])
        fits_before = used < free_capacity
        used += boxes
        out.append({**e, "queueRank": i + 1, "suggestedRelease": fits_before})
    return out


def backlog_days(open_boxes, capacity_boxes):
    if open_boxes == 0:
        return 0
    if capacity_boxes == 0:
        return float("inf")
    return open_boxes / capacity_boxes


def people_needed(open_boxes_due, per_person_daily_boxes, days_available):
    if open_boxes_due == 0:
        return 0
    if per_person_daily_boxes == 0 or days_available == 0:
        return float("inf")
    return open_boxes_due / (per_person_daily_boxes * days_available)


async def _score_all_open_packages(store) -> list:
    sofs = await store.find(SOF_NAME, lambda r: _open_stage(r.get("Fulfillment_Stage")))
    gates = await store.find("Sales_Order_Readiness_Gate")
    exceptions = await store.find("Exception_Control1")
    rrs = await store.find("Replacement_Request")
    policy = await policy_reader(store)
    capacity = await capacity_for(store, date.today().strftime("%Y-%m-%d"))

    open_exceptions = [e for e in exceptions if _text(e.get("Status")) in _OPEN_EXCEPTION_STATUSES]
    open_rrs = [r for r in rrs if _text(r.get("RR_Status")) not in _RR_DONE_STATUSES]
    now = datetime.now(timezone.utc)
    entries = [{"sof": sof, **categorize(sof, gates=gates, open_exceptions=open_exceptions, open_rrs=open_rrs, now=now, policy=policy)} for sof in sofs]
    return rank_and_cut_line(entries, capacity_boxes=capacity["capacityBoxes"])


async def rescore_all(store) -> dict:
    from app.criteria import zoho_now
    scored = await _score_all_open_packages(store)
    stamp = zoho_now()
    for e in scored:
        await store.update_record(SOF_NAME, e["sof"]["ID"], {
            "Category": e["category"], "Blocked_Reason": e["blockedReason"] or "", "Queue_Rank": str(e["queueRank"]),
            "Priority_Reason": e["priorityReason"], "Suggested_Action": "", "Suggested_Release": e["suggestedRelease"], "Scored_At": stamp,
        }, by_form=True)
    return {"scored": len(scored)}


async def rescore_one(store, _so_no=None) -> dict:
    return await rescore_all(store)
