# Fulfillment sorting engine (spec: HomeCartel v1.4, 05 Shared Engines / 01 Sorting Engine; this
# module covers Fulfillment only). categorize(): what kind of attention a package needs.
# rank_and_cut_line(): oldest-SO-first order plus today's cut line. Pure where possible:
# categorize() takes everything it needs as arguments so it is trivially testable and so a second
# run on identical input always gives the identical answer (determinism is an explicit acceptance
# requirement). Ported from server/modules/fulfillment/sorter.mjs.
import re
from datetime import date, datetime, timedelta, timezone

from app.criteria import zoho_now
from app.deluge import blank
from app.fulfillment.delivery_failures import FAILURE_LABEL, broken_failures, open_sales_returns
from app.fulfillment.aging import log_block_change, aging_level, close_left_behind_aging_exceptions, days_in_stage, parse_time, tell_about_aging, tell_about_category_change, tell_about_at_risk_morning_list
from app.fulfillment.silence import check_silence
from app.fulfillment.pipeline import STAGE_ORDER
from app.fulfillment.urgency import urgent_orders
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


def _is_open_exception(e: dict) -> bool:
    """Open = Pending or In Rework. A BLANK status is Pending (the QC routing creates the exception without one, and the Exception Control
    widget shows a blank status as Pending): treating it as closed left a package with a fresh QC rejection unblocked."""
    status = _text(e.get("Status"))
    return status == "" or status in _OPEN_EXCEPTION_STATUSES
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


# Slack (spec 05 / 01 section 1) = days to the target - the work days still needed. From the Calculators: fulfillment_days (default 3,
# the warehouse work, counted only while the package is still before Order Aggregation) + delivery_days (default 2). Late is still
# "today is past the target"; slack only decides At risk (slack <= at_risk_slack_days).
def _setting_days(policy, key: str, default: int) -> int:
    try:
        n = int(float(policy(key) or 0))
    except ValueError:
        n = 0
    return n if n > 0 else default


def _work_days_needed(sof, policy) -> int:
    stage = _text(sof.get("Fulfillment_Stage"))
    in_warehouse = stage not in ("Order Aggregation", "For Delivery")
    return (_setting_days(policy, "fulfillment_days", 3) if in_warehouse else 0) + _setting_days(policy, "delivery_days", 2)


def _slack_days(sof, target, now, policy):
    left = _days_until(target, now)
    return None if left is None else left - _work_days_needed(sof, policy)


# Who has to act on each kind of block (spec: the block "shows its owner", e.g. payment -> sales agent). Roles are on hold, so this
# is the NAME OF THE ROLE to chase, not a login.
BLOCK_OWNER = {
    "blocked_payment": "Sales agent", "blocked_items": "Procurement / Receiving", "blocked_exception": "Fulfillment supervisor",
    "blocked_address": "Sales agent", "blocked_contact": "Sales agent",
}


def _blocked_check(sof, gates, open_exceptions, has_contact=None):
    """(reason, condition code) when the package cannot be worked (OR-R1), else None. Order: payment, items, exception, address, contact.
    has_contact: None = not told (no check), True / False = the caller looked for a phone number."""
    so = _text(sof.get("SO_No"))
    if any(_text(g.get("sales_order_number")) == so and needs_payment_approval(g) for g in gates):
        return "Payment not cleared", "blocked_payment"
    if _text(sof.get("Fulfillment_Stage")) == "Waiting For Package":
        return "Items not available yet (no package)", "blocked_items"
    if any(_text(e.get("Sales_Order")) == so and _is_open_exception(e) for e in open_exceptions):
        return "Open exception", "blocked_exception"
    if blank(sof.get("Shipping_Address")) and blank(sof.get("Billing_Address")):
        return "Missing delivery address", "blocked_address"
    if has_contact is False:
        return "Missing contact number", "blocked_contact"
    return None


def categorize(sof: dict, *, gates=None, open_exceptions=None, open_rrs=None, failed_jobs=None, open_returns=None, now=None, policy=None, has_contact=None) -> dict:
    gates = gates or []
    open_exceptions = open_exceptions or []
    open_rrs = open_rrs or []
    now = now or datetime.now(timezone.utc)
    policy = policy or (lambda k: None)

    blocked = _blocked_check(sof, gates, open_exceptions, has_contact)
    if blocked:
        reason, code = blocked
        return {"category": "blocked", "blockedReason": reason, "blockedOwner": BLOCK_OWNER[code], "conditionCode": code, "priorityReason": reason}

    open_rr = next((rr for rr in open_rrs if _text(rr.get("RR_SO")) == _text(sof.get("SO_No"))), None)
    if open_rr:
        return {"category": "broken", "blockedReason": None, "blockedOwner": None, "conditionCode": None, "priorityReason": f"Replacement request {_text(open_rr.get('RR_No')) or 'open'}"}

    # a failed delivery job (damaged in transit / refused) of this order, still open: the package is redone first (spec 05 / 01, Broken)
    failed = next((j for j in (failed_jobs or []) if _text(j.get("Sales_Order")) == _text(sof.get("SO_No"))), None)
    if failed:
        why = FAILURE_LABEL.get(_text(failed.get("Failure_Reason_Code")), _text(failed.get("Failure_Reason_Code")))
        return {"category": "broken", "blockedReason": None, "blockedOwner": None, "conditionCode": None, "priorityReason": f"Delivery job failed: {why}"}

    # an unfinished Sales Return of this order (a redelivery after a return): the package is redone first, like an open Replacement Request
    ret = next((r for r in (open_returns or []) if _text(r.get("Sales_Order")) == _text(sof.get("SO_No"))), None)
    if ret:
        return {"category": "broken", "blockedReason": None, "blockedOwner": None, "conditionCode": None, "priorityReason": f"Sales return {_text(ret.get('RMA')) or 'open'}"}

    is_broken = _text(sof.get("order_type")) in _BROKEN_ORDER_TYPES
    target = _effective_target(sof, policy)
    no_target_set = blank(sof.get("target_delivery_date"))
    days_left = _days_until(target, now)   # late = the target day has passed, whatever the work days
    slack = _slack_days(sof, target, now, policy)

    if is_broken:
        return {"category": "broken", "blockedReason": None, "blockedOwner": None, "conditionCode": None, "priorityReason": "Replacement, no target set" if no_target_set else "Replacement / complaint"}
    if days_left is not None and days_left < 0:
        return {"category": "late", "blockedReason": None, "blockedOwner": None, "conditionCode": None, "priorityReason": f"{abs(days_left)} day(s) past target"}
    forecast_misses = not blank(sof.get("Forecast_Delivery")) and not blank(target) and sof["Forecast_Delivery"] > target
    at_risk_slack_days = int(policy("at_risk_slack_days") or 0) or 3
    if forecast_misses or (slack is not None and slack <= at_risk_slack_days):
        return {"category": "at_risk", "blockedReason": None, "blockedOwner": None, "conditionCode": None, "priorityReason": "Forecast misses target" if forecast_misses else f"{slack} day(s) of slack left"}
    return {"category": "on_time", "blockedReason": None, "blockedOwner": None, "conditionCode": None, "priorityReason": "On time (no target set)" if no_target_set else "On time"}


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


# The order of the work list (spec 05 / 01 section 1 and 2): the category first (broken, late, at risk, on time), and INSIDE a category
# urgent first (MU-5), then the primary key (order date, or the target date when the setting sort_primary_key says so), then the other
# date, then the record number (always unique, so two runs never swap two orders).
CATEGORY_ORDER = {"broken": 0, "late": 1, "at_risk": 2, "on_time": 3}


def _compare_key(e: dict, primary_key: str = "order_date") -> tuple:
    created = _text(e["sof"].get("SO_Created_Date")) or "9999-99-99"
    target = _text(e["sof"].get("target_delivery_date")) or "9999-99-99"
    first, second = (target, created) if primary_key == "target_delivery" else (created, target)
    return (0 if e.get("urgent") else 1, first, second, _record_number_key(e["sof"].get("SO_No")), _text(e["sof"].get("SO_No")))


# A package that was released and is not yet at the loading area uses capacity (spec 05 / 01 section 4: "boxes already released and not
# yet aggregated"; 05 / 02: boxes per hour counts boxes FINISHED through pick, QC and crate). Order Aggregation (To Ship) is finished
# work, so it no longer uses capacity, but it is released: never suggested again.
_WIP_STAGES = set(STAGE_ORDER[STAGE_ORDER.index("Picking"):STAGE_ORDER.index("Crate") + 1])
_RELEASED_STAGES = set(STAGE_ORDER[STAGE_ORDER.index("Picking"):STAGE_ORDER.index("Order Aggregation") + 1])


def _is_wip(sof) -> bool:
    return _text(sof.get("Fulfillment_Stage")) in _WIP_STAGES


def _is_released(sof) -> bool:
    return _text(sof.get("Fulfillment_Stage")) in _RELEASED_STAGES


def rank_and_cut_line(entries: list, *, capacity_boxes: float, primary_key: str = "order_date") -> list:
    """The work list first, in the order above, then the Blocked ones (a blocked package is not in the work list whatever its age: it is
    never suggested and uses no capacity).
    The cut line (OR-R3): walk the work list adding box counts; the list of Suggested Release STOPS at the first package that would
    exceed the free capacity (spec acceptance: 224 boxes -> "stops at the package that would exceed 224"), and nothing after it is
    suggested, so a newer small order never jumps an older big one. One exception, so a very big order is never stuck forever: when
    the top package alone is bigger than the free capacity it is suggested on its own (the supervisor may always release beyond the line)."""
    work = sorted((e for e in entries if e["category"] != "blocked"), key=lambda e: (CATEGORY_ORDER.get(e["category"], 3), *_compare_key(e, primary_key)))
    blocked = sorted((e for e in entries if e["category"] == "blocked"), key=lambda e: _compare_key(e, primary_key))
    ordered = work + blocked
    wip_boxes = sum(effective_boxes(e["sof"]) for e in ordered if _is_wip(e["sof"]))
    free_capacity = max(0, capacity_boxes - wip_boxes)
    used = 0.0
    closed = False
    out = []
    for i, e in enumerate(ordered):
        if e["category"] == "blocked" or _is_released(e["sof"]):
            out.append({**e, "queueRank": i + 1, "suggestedRelease": False})
            continue
        boxes = effective_boxes(e["sof"])
        fits = (not closed) and free_capacity > 0 and (used + boxes <= free_capacity or used == 0)
        if fits:
            used += boxes
        else:
            closed = True
        out.append({**e, "queueRank": i + 1, "suggestedRelease": fits})
    return out


# ---------- Suggested action (spec 05 / 01 section 3): a lookup table, editable by Admin; the built-in defaults are the spec's own examples ----------
DEFAULT_ACTIONS = {
    ("", "above_line"): "Release today",
    ("late", "below_line"): "Add crew or release over capacity; supervisor decides",
    ("blocked", "blocked_payment"): "Chase payment with sales agent",
}


def condition_code(e: dict) -> str:
    """What to look the action up by: the block kind, 'above_line' / 'below_line' for a package that can be released, '' once it is released."""
    if e["category"] == "blocked":
        return _text(e.get("conditionCode"))
    if _is_released(e["sof"]):
        return ""
    return "above_line" if e.get("suggestedRelease") else "below_line"


def suggest_action(e: dict, rows=None) -> str:
    code = condition_code(e)
    if not code:
        return ""
    cat = e["category"]
    mine = [r for r in rows or [] if _text(r.get("Module")) == "Fulfillment" and _text(r.get("Condition_Code")) == code and _text(r.get("Category")) in (cat, "")]
    for r in sorted(mine, key=lambda r: _text(r.get("Category")) == ""):   # the row for this category before the "any category" row
        if _text(r.get("Action_Text")):
            return _text(r["Action_Text"])
    return DEFAULT_ACTIONS.get((cat, code)) or DEFAULT_ACTIONS.get(("", code)) or ""


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


async def _score_all_open_packages(store, now=None):
    """Scores every open package (SE-3: the whole list, then the screens filter). Returns the ranked entries and the urgency figures."""
    sofs = await store.find(SOF_NAME, lambda r: _open_stage(r.get("Fulfillment_Stage")))
    gates = await store.find("Sales_Order_Readiness_Gate")
    exceptions = await store.find("Exception_Control1")
    rrs = await store.find("Replacement_Request")
    failed_jobs = broken_failures(await store.find("Service_Appointment_Form"))   # Delivery's jobs: read only
    open_returns = open_sales_returns(await store.find("Sales_Returns_Form"))   # Delivery's sales returns: read only
    customers = await store.find("Customer")
    urgency_rows = await store.find("Urgency_Requests")
    events = await store.find("Stage_Events", lambda r: _text(r.get("Record_Type")) == "package")
    action_rows = await store.find("Suggested_Actions")
    policy = await policy_reader(store)
    capacity = await capacity_for(store, date.today().strftime("%Y-%m-%d"))

    phone_of = {str(c["ID"]): _text(c.get("Phone_Number")) for c in customers}
    urgent = urgent_orders(urgency_rows, date.today().isoformat())
    local_now = now or datetime.now()
    open_exceptions = [e for e in exceptions if _is_open_exception(e)]
    open_rrs = [r for r in rrs if _text(r.get("RR_Status")) not in _RR_DONE_STATUSES]
    utc_now = datetime.now(timezone.utc)
    entries = []
    for sof in sofs:
        has_contact = not blank(sof.get("Contact_No")) or phone_of.get(_text(sof.get("Customer")), "") != ""
        e = {"sof": sof, **categorize(sof, gates=gates, open_exceptions=open_exceptions, open_rrs=open_rrs, failed_jobs=failed_jobs, open_returns=open_returns, now=utc_now, policy=policy, has_contact=has_contact)}
        so = _text(sof.get("SO_No"))
        e["urgent"] = so in urgent
        if e["urgent"]:
            e["priorityReason"] = f"{e['priorityReason']} · urgent: {urgent[so]}" if urgent[so] else f"{e['priorityReason']} · urgent"
        e["agingDays"] = days_in_stage(sof, events, local_now)
        e["agingLevel"] = aging_level(e["agingDays"], policy)
        entries.append(e)

    ranked = rank_and_cut_line(entries, capacity_boxes=capacity["capacityBoxes"], primary_key="target_delivery" if _text(policy("sort_primary_key")) == "target_delivery" else "order_date")
    for e in ranked:
        e["suggestedAction"] = suggest_action(e, action_rows)
    try:
        warn_pct = float(policy("urgency_warning_pct") or 0) or 5.0
    except ValueError:
        warn_pct = 5.0
    n_urgent = sum(1 for e in ranked if e["urgent"])
    pct = round(100 * n_urgent / len(ranked), 1) if ranked else 0.0
    return ranked, {"urgent": n_urgent, "urgentPct": pct, "urgentWarning": pct > warn_pct}


async def _log_run(store, trigger: str, started: str, status: str, rows: int, error: str) -> None:
    await store.add_record("Job_Runs", {"Job_Name": f"Recalculate_Fulfillment_Queue ({trigger})", "Started_At": started, "Finished_At": zoho_now(), "Status": status, "Rows_Touched": rows, "Error": error})


async def rescore_all(store, *, trigger: str = "event", now=None) -> dict:
    """Scores and writes every open package. trigger: 'event' (after a save or a stage change: no log row), 'nightly' or 'manual'
    (one Job_Runs row, 'failed' with the error when it fails, and the error is raised again)."""
    started = zoho_now()
    try:
        scored, meta = await _score_all_open_packages(store, now)
        stamp = zoho_now()
        for e in scored:
            await store.update_record(SOF_NAME, e["sof"]["ID"], {
                "Category": e["category"], "Blocked_Reason": e["blockedReason"] or "", "Blocked_Owner": e.get("blockedOwner") or "", "Queue_Rank": str(e["queueRank"]),
                "Priority_Reason": e["priorityReason"], "Suggested_Action": e["suggestedAction"], "Suggested_Release": e["suggestedRelease"], "Urgent": e["urgent"],
                "Aging_Days": str(e["agingDays"]), "Aging_Level": e["agingLevel"], "Scored_At": stamp,
            }, by_form=True)
            await tell_about_aging(store, e["sof"], e["agingLevel"], e["agingDays"])
            await tell_about_category_change(store, e["sof"], e["category"], e)
            await log_block_change(store, e["sof"], e["category"], e)
        await close_left_behind_aging_exceptions(store, scored)
        await check_silence(store, scored, now or datetime.now())
        await tell_about_at_risk_morning_list(store, scored, now or datetime.now())
    except Exception as err:
        if trigger != "event":
            await _log_run(store, trigger, started, "failed", 0, str(err))
        raise
    if trigger != "event":
        await _log_run(store, trigger, started, "ok", len(scored), "")
    return {"scored": len(scored), **meta}


async def rescore_one(store, _so_no=None) -> dict:
    return await rescore_all(store)


STALE_AFTER_HOURS = 26


async def ranking_status(store, now=None) -> dict:
    """The 'ranking is stale' banner (spec 05 / 01 section 6): stale when there are open packages and the newest scoring is older than
    26 hours (or there is none)."""
    sofs = await store.find(SOF_NAME, lambda r: _open_stage(r.get("Fulfillment_Stage")))
    if not sofs:
        return {"stale": False, "scoredAt": "", "staleAfterHours": STALE_AFTER_HOURS}
    stamps = [(parse_time(r.get("Scored_At")), _text(r.get("Scored_At"))) for r in sofs]
    stamps = [x for x in stamps if x[0]]
    newest = max(stamps, default=(None, ""))
    local_now = now or datetime.now()
    stale = newest[0] is None or (local_now - newest[0]) > timedelta(hours=STALE_AFTER_HOURS)
    return {"stale": stale, "scoredAt": newest[1], "staleAfterHours": STALE_AFTER_HOURS}


async def capacity_summary(store, *, days: int = 3) -> dict:
    """The numbers of the capacity bar and the crew sizing line on the Order Readiness screen (spec 03 / 02 screens, 05 / 02 section 1).
    Read only: it scores in memory and writes nothing."""
    ranked, meta = await _score_all_open_packages(store)
    cap = await capacity_for(store, date.today().strftime("%Y-%m-%d"))
    boxes = lambda es: sum(effective_boxes(e["sof"]) for e in es)  # noqa: E731
    wip_entries = [e for e in ranked if _is_wip(e["sof"])]
    wip = boxes(wip_entries)
    # PKG-R3 acceptance: "a package without a counted box count shows 'estimated' in every capacity figure" --
    # inProgressBoxes blends counted and estimated numbers (effective_boxes), so this count lets the widget flag it.
    wip_estimated_count = sum(1 for e in wip_entries if _text(e["sof"].get("Box_Count_Source")) != "counted")
    open_boxes = boxes(e for e in ranked if not _is_released(e["sof"]) or _is_wip(e["sof"]))   # not yet finished: waiting to be released, or in the warehouse
    due = boxes(e for e in ranked if e["category"] in ("broken", "late", "at_risk") and (not _is_released(e["sof"]) or _is_wip(e["sof"])))
    per_person_day = cap["boxesPerHour"] * cap["hoursPerDay"]
    needed = people_needed(due, per_person_day, days)
    backlog = backlog_days(open_boxes, cap["capacityBoxes"])
    return {
        "capacityBoxes": cap["capacityBoxes"], "people": cap["people"], "boxesPerHour": cap["boxesPerHour"], "hoursPerDay": cap["hoursPerDay"],
        "inProgressBoxes": wip, "inProgressEstimatedCount": wip_estimated_count, "freeBoxes": max(0, cap["capacityBoxes"] - wip), "overCapacityBy": max(0, wip - cap["capacityBoxes"]),
        "suggestedBoxes": boxes(e for e in ranked if e["suggestedRelease"]), "suggestedCount": sum(1 for e in ranked if e["suggestedRelease"]),
        "openBoxes": open_boxes, "backlogDays": None if backlog == float("inf") else round(backlog, 1),
        "dueBoxes": due, "crewDays": days, "peopleNeeded": None if needed == float("inf") else round(needed, 1),
        "lateOrAtRiskCount": sum(1 for e in ranked if e["category"] in ("broken", "late", "at_risk")), **meta,
    }
