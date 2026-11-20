# The Sorting Engine for Procurement (spec 05 Shared Engines / 01): scan -> categorise -> sort -> suggest.
# Plain code, no AI: the same input always gives the same answer, so "why is this first?" has one reply.
#
# Categories (Procurement): act_now, tell_customer, watch, on_track, plus blocked (a separate list
# with a reason).
#   broken        a replacement for a damaged / missing item (an RR): first in every queue
#   act_now       the forecast pickable date misses the date needed AND something can still change it
#   tell_customer it will miss and nothing is left to change
#   watch         on track but the slack is <= proc_watch_slack_days
#   blocked       cannot be worked: a PR on hold or cancelled, no supplier
# Sort inside a category: manual urgency, then Order Date ascending (oldest first), then target, then
# record number (SE-1 .. SE-5). Pure functions: ship_track.py gathers the facts and writes the result.
# Ported from server/modules/procurement/sorting.mjs. Field names are snake_case here (order_date,
# forecast_pickable, no_supplier, ladder_rung, days_late, production_started, production_finished,
# arrival_planned, last_supplier_update, stage_since, broken), matching this port's own convention.
import re

from app.deluge import add_days, day_diff, ymd
from app.procurement.plan import date_needed, norm_mode

CATEGORY_ORDER = ["broken", "act_now", "tell_customer", "watch", "on_track"]
_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _dm(d) -> str:
    return f"{d.day} {_MON[d.month - 1]}"


# row: {stage, order_date, target, forecast_pickable, mode, held (reason text | ''), no_supplier,
#       ladder_rung, days_late, production_started, production_finished, arrival_planned,
#       last_supplier_update, stage_since, broken}
# -> {category, blocked_reason, priority_reason, suggested_action, date_needed, slack_days, no_target}
def categorise(row: dict, settings: dict, today) -> dict:
    out = _categorise_base(row, settings, today)
    # spec 06 RR-R4: a replacement (the shipment carries an RR) is BROKEN: first in every queue,
    # above Act now. A blocked one stays blocked.
    if row.get("broken") and out["category"] != "blocked" and row.get("stage") != "received":
        out["category"] = "broken"
        out["priority_reason"] = " · ".join(x for x in [f"Replacement {row['broken']}", out["priority_reason"]] if x)
    return out


def _categorise_base(row: dict, settings: dict, today) -> dict:
    out = {"category": "on_track", "blocked_reason": "", "priority_reason": "", "suggested_action": "", "date_needed": None, "slack_days": None, "no_target": False}
    parts = []

    if row.get("order_date"):
        parts.append(f"SO dated {_dm(row['order_date'])} ({day_diff(today, row['order_date'])} days)")
    else:
        parts.append("no order date")

    if row.get("stage") == "received":
        out["priority_reason"] = "Received"
        return out

    # Blocked is checked first (spec: a blocked record is not in the work list whatever its age)
    reason = row.get("held") or ("No supplier on the shipment" if row.get("no_supplier") else "")
    if reason:
        return {**out, "category": "blocked", "blocked_reason": reason, "priority_reason": " · ".join([*parts, f"Blocked: {reason}"]), "suggested_action": f"Clear the block: {reason}"}

    # A record with no Target Delivery uses order date + default_promise_days, and says so; it is
    # never pushed to the bottom.
    target = row.get("target")
    if not target and row.get("order_date"):
        target = add_days(row["order_date"], settings["default_promise_days"])
        out["no_target"] = True
        parts.append("no target set")
    if not target:
        out["priority_reason"] = " · ".join([*parts, "no target to compare"])
        return out

    needed = date_needed(settings, target)
    out["date_needed"] = ymd(needed)
    forecast = row.get("forecast_pickable")
    if not forecast:
        out["priority_reason"] = " · ".join([*parts, "no forecast yet"])
        return out
    slack = day_diff(needed, forecast)
    out["slack_days"] = slack
    miss = slack < 0

    shipped_out = row.get("stage") != "production"
    air = norm_mode(row.get("mode")) == "Airfreight"
    changeable = not shipped_out and (not air or not row.get("production_started") or (row.get("ladder_rung") or 0) > 0)

    if miss and changeable:
        out["category"] = "act_now"
    elif miss:
        out["category"] = "tell_customer"
    elif slack <= settings["proc_watch_slack_days"]:
        out["category"] = "watch"

    parts.append(f"forecast {-slack} days past the date needed" if miss else f"{slack} days of slack")
    parts.append(str(row.get("stage")).replace("_", " "))
    if row.get("stage_since") is not None and row["stage_since"] >= 1:
        parts.append(f"{row['stage_since']} days in this stage")
    out["priority_reason"] = " · ".join(parts)

    out["suggested_action"] = _suggested_action(row, out, settings, today, air)
    return out


# The lookup of suggested actions (spec: a table editable by Admin; fixed here until the Control
# Panel exists).
def _suggested_action(row: dict, out: dict, settings: dict, today, air: bool) -> str:
    if row.get("stage") == "production":
        if not row.get("production_started") and (row.get("days_late") or 0) >= 1:
            days_late = row["days_late"]
            if days_late == 1:
                return "Call the supplier (ladder rung 1)"
            if days_late == 2:
                return "Ask the supplier for a discount in writing (ladder rung 2)"
            return "Decide: cancel and re-source, or hold (ladder rung 3)"
        if row.get("production_finished"):
            return "Request booking"
        if row.get("last_supplier_update") is not None and row["last_supplier_update"] >= 7:
            return "Escalate: no supplier response for 7 days"
    elif row.get("stage") == "shipped_out" and row.get("arrival_planned") and today > row["arrival_planned"]:
        return "Ask the forwarder for tracking"
    if out["category"] == "act_now":
        return "Move the target date or tell the customer" if air else "Upgrade to air (saves 16 days) or move the target"
    if out["category"] == "tell_customer":
        return "Tell the sales agent and the customer"
    return ""


def _natural_key(s: str):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", str(s))]


# Ranks the whole list (SE-3): category order first, then manual urgency, Order Date ascending,
# target ascending, record number. items: [{id, no, category, order_date, target, urgent, no_rank}]
# -> {id: rank}. Blocked and on_track/received do not take part in the work-list rank: blocked
# records are ranked among themselves.
def rank(items: list) -> dict:
    def cmp_key(i):
        # None sorts after any real date (matches JS's Infinity fallback for a missing date)
        order_date = i.get("order_date")
        target = i.get("target")
        urgent = 0 if i.get("urgent") else 1
        return (urgent, (0, order_date) if order_date else (1, None), (0, target) if target else (1, None), _natural_key(i.get("no", "")))

    ranks: dict = {}
    n = 0
    for cat in [*CATEGORY_ORDER, "blocked"]:
        group = sorted((i for i in items if i.get("category") == cat and not i.get("no_rank")), key=cmp_key)
        if cat == "blocked":
            n = 0  # blocked is a separate list
        for i in group:
            n += 1
            ranks[i["id"]] = n
    return ranks
