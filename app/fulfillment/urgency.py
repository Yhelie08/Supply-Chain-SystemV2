# Manual urgency (M1) (spec v1.4, 05 Shared Engines / 01 Sorting Engine section 7, MU-1 to MU-6). The only manual priority.
#   MU-1  needs a name and a written reason. Requested by a sales agent or supervisor, approved by a supervisor (with a name).
#   MU-2  expires after the Target Delivery date, or after 14 days when there is no target (set when it is approved).
#   MU-3  can be raised by hand, never lowered by hand: an approved request cannot be rejected, un-approved or deleted; let it expire or
#         change the target.
#   MU-4  never skips a gate: the sorter checks Blocked first, so an urgent blocked order is still blocked.
#   MU-5  sorts first INSIDE its own category (sorter.rank_and_cut_line); it does not move the order to another category.
#   MU-6  if urgent orders are more than urgency_warning_pct (default 5) of the open orders, the re-score reports a warning.
# Roles are on hold (owner), so "a supervisor approves" is a NAME that must be written, not a login check.
from datetime import date, timedelta

from app.criteria import ZohoError
from app.deluge import blank
from app.workflows import register

FORM = "Urgency_Requests"
SOF = "Sales_Order_Fulfillment"
CODE = 3100
NO_TARGET_DAYS = 14


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v).strip()


def urgent_orders(requests: list, today: str) -> dict:
    """{SO number: reason} for the orders with an approved request that has not expired (the expiry day still counts)."""
    out = {}
    for r in requests:
        if _text(r.get("Status")) == "Approved" and _text(r.get("Expires_On"))[:10] >= today and _text(r.get("SO_No")):
            out.setdefault(_text(r["SO_No"]), _text(r.get("Reason")))
    return out


async def _expiry(store, so: str, today: date) -> str:
    rows = await store.find(SOF, lambda r: _text(r.get("SO_No")) == so)
    target = next((_text(r.get("target_delivery_date"))[:10] for r in rows if _text(r.get("target_delivery_date"))), "")
    return target or (today + timedelta(days=NO_TARGET_DAYS)).isoformat()


async def _before_add(args: dict) -> None:
    input_ = args["input"]
    missing = [what for what, field in (("a name (Requested by)", "Requested_By"), ("a reason", "Reason"), ("the Sales Order", "SO_No")) if not _text(input_.get(field))]
    if missing:
        raise ZohoError(CODE, "An urgency request needs " + ", ".join(missing) + ".")
    today = date.today()
    input_.setdefault("Requested_On", today.isoformat())
    status = _text(input_.get("Status")) or "Requested"
    input_["Status"] = status
    if status == "Approved":
        await _approve(args["store"], input_, input_, today)


async def _approve(store, input_: dict, merged: dict, today: date) -> None:
    if not _text(merged.get("Approved_By")):
        raise ZohoError(CODE, "Approving an urgency request needs the approver's name (Decided by).")
    input_["Approved_On"] = today.isoformat()
    input_["Expires_On"] = await _expiry(store, _text(merged.get("SO_No")), today)


async def _before_update(args: dict) -> None:
    input_, previous, store = args["input"], args.get("previous") or {}, args["store"]
    was, now = _text(previous.get("Status")), _text(input_.get("Status", previous.get("Status")))
    if was == "Approved" and now != "Approved":
        raise ZohoError(CODE, f"An approved urgency cannot be lowered by hand. It expires on {_text(previous.get('Expires_On')) or 'its target date'}; to end it sooner, change the target date.")
    if now == "Approved" and was != "Approved":
        await _approve(store, input_, {**previous, **input_}, date.today())
    elif now == "Rejected" and was != "Rejected" and not _text({**previous, **input_}.get("Approved_By")):
        raise ZohoError(CODE, "Rejecting an urgency request needs the name of the person who decided (Decided by).")


async def _before_delete(args: dict) -> None:
    if _text((args.get("previous") or {}).get("Status")) == "Approved":
        raise ZohoError(CODE, "An approved urgency cannot be deleted by hand. Let it expire, or change the target date.")


async def _rescore(args: dict) -> None:
    from app.fulfillment.sorter import rescore_all   # late import: the sorter reads this module too
    await rescore_all(args["store"])


register(FORM, {"beforeAdd": _before_add, "beforeUpdate": _before_update, "beforeDelete": _before_delete,
                "afterAdd": _rescore, "afterUpdate": _rescore, "afterDelete": _rescore})
