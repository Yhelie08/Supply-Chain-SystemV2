# Suggesting a schedule (spec v1.4, Delivery 02 §3): for a ranked job -- drop-off or installation,
# find the earliest slot, a city tie-break among every team with room that day, "Book third party"
# for a drop-off whose own-team slot is too late, and a supervisor approval item when an
# installation cannot meet its target any other way.
#
# This sits ALONGSIDE the existing scheduling engine (scheduling_engine.py / scheduling.py), not
# instead of it: that engine still writes the Suggested_Schedule_Date a dispatcher approves today,
# and nothing here changes it. This is the new, read-mostly "what should the dispatcher see" layer
# the spec asks for -- it only writes when it prepares an Approval_Queue item.
# Ported from server/modules/delivery-management/suggest-schedule.mjs.
import json
from datetime import datetime, timedelta

from app.criteria import zoho_now
from app.deluge import add_days, blank, parse_date, to_num, today_date, ymd
from app.delivery.earliest_slot import find_earliest_slot, teams_with_room_on
from app.delivery.scheduling import SA, day, policy_reader, to_long

_AQ = "Approval_Queue"
_INSTALL_TYPES = {"With Installation", "Full-Day Install", "Multi-Day Install"}


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


# Tracked duplicate of sorter.mjs's effectiveTarget (Phase 3, not yet ported) -- a small,
# self-contained function with no further sorter.mjs dependency. Re-point this at Phase 3's real
# app.delivery.sorter.effective_target once that phase ships, and delete this copy.
def _effective_target(sa: dict, policy) -> str | None:
    if not blank(sa.get("Requested_Delivery_Date")):
        return sa.get("Requested_Delivery_Date")
    if blank(sa.get("Order_Date")):
        return None
    days = to_num(policy("default_promise_days")) or 25
    d = parse_date(day(sa.get("Order_Date")))
    if d is None:
        return None
    return ymd(add_days(d, int(days)))


async def _prepare_approval(store, *, kind: str, sa: dict, summary: str, options: list, payload: dict):
    existing = await store.find(_AQ, lambda i: i.get("Kind") == kind and _text(i.get("Record_Id")) == str(sa["ID"]) and i.get("Status") == "pending")
    if existing:
        return existing[0]["ID"]
    policy = await policy_reader(store)
    sla_hours = to_long(policy("approval_sla_hours"), 24)
    return await store.add_record(_AQ, {
        "Kind": kind, "Record_Type": "service_appointment", "Record_Id": str(sa["ID"]), "Record_No": _text(sa.get("Sales_Order")),
        "Summary": summary, "Options": json.dumps(options), "Payload": json.dumps(payload),
        "Prepared_By_Type": "system", "Status": "pending", "Due_At": zoho_now(datetime.now() + timedelta(hours=sla_hours)),
    })


async def _pick_team_for_city(store, date: str, city, candidates: list) -> str | None:
    if not candidates:
        return None
    if blank(city) or len(candidates) == 1:
        return candidates[0]["installer"]
    that_day = await store.find(SA, lambda r: (day(r.get("Confirmed_Schedule_Date")) == date or day(r.get("Suggested_Schedule_Date")) == date) and r.get("Appointment_Status") != "Failed")
    same_city = next((c for c in candidates if any(r.get("Installer") == c["installer"] and not blank(r.get("City")) and str(r.get("City")).strip().lower() == str(city).strip().lower() for r in that_day)), None)
    return (same_city or candidates[0])["installer"]


async def suggest_schedule(store, sa_id, *, now=None, from_date=None) -> dict:
    now = now or datetime.now()
    try:
        sa = await store.get_record_by_id(SA, sa_id, raw=True)
    except Exception:
        sa = None
    if not sa:
        return {"status": "not_found"}
    d_type = sa.get("Type_of_Delivery") or ""
    if d_type == "Pick Up":
        return {"status": "no_team_needed", "reason": "Pick Up has no team to schedule."}
    is_install = d_type in _INSTALL_TYPES
    policy = await policy_reader(store)
    est_minutes = to_num(sa.get("Estimated_Duration")) * 60 if to_num(sa.get("Estimated_Duration")) else None

    slot = await find_earliest_slot(store, job_type=d_type, est_minutes=est_minutes, from_date=from_date, now=now)
    if not slot["found"]:
        if not is_install:
            return {"status": "no_slot", "reason": slot["reason"]}
        id_ = await _prepare_approval(store, kind="schedule_shortfall", sa=sa,
                                       summary=f"{_text(sa.get('Sales_Order'))}: no team-day found within the scheduling window for an installation.",
                                       options=["Add a team-day (overtime, extra installer)", "Tell the customer (proposed new date)"],
                                       payload={"reason": slot["reason"]})
        return {"status": "escalated", "approvalId": str(id_), "reason": slot["reason"]}

    candidates = await teams_with_room_on(store, slot["date"], job_type=d_type, est_minutes=est_minutes, now=now)
    installer = await _pick_team_for_city(store, slot["date"], sa.get("City"), candidates if candidates else [{"installer": slot["installer"]}])
    chosen = next((c for c in candidates if c["installer"] == installer), {"driver": slot.get("driver"), "vehicle": slot.get("vehicle")})

    if not is_install:
        max_wait_days = to_long(policy("dropoff_max_wait_days"), 2)
        target = parse_date(_effective_target(sa, policy))
        slot_date = parse_date(slot["date"])
        past_target = target is not None and slot_date > target
        past_max_wait = slot_date > add_days(today_date(), max_wait_days)
        if past_target or past_max_wait:
            target_text = f" (target {ymd(target)})" if target else ""
            id_ = await _prepare_approval(store, kind="third_party_booking", sa=sa,
                                           summary=f"{_text(sa.get('Sales_Order'))}: own-team slot is {slot['date']}{target_text} — book a third party instead?",
                                           options=["Book third party", f"Keep own team on {slot['date']}"],
                                           payload={"ownTeamDate": slot["date"], "installer": installer, "target": _effective_target(sa, policy) or ""})
            return {"status": "third_party_suggested", "approvalId": str(id_), "date": slot["date"], "installer": installer, "reason": slot["reason"]}

    return {"status": "suggested", "date": slot["date"], "installer": installer, "driver": chosen.get("driver"), "vehicle": chosen.get("vehicle"), "reason": slot["reason"]}
