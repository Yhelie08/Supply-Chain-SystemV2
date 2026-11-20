# Earliest available date, with a reason, and a soft hold (spec v1.4, Delivery 01, "Earliest
# available date"). find_earliest_slot reuses the SAME capacity math scheduling.py's schedule_slot
# uses (team hours, the traffic buffer, the working day length) in a read-only, callable-before-
# an-SR-exists form, and adds two things schedule_slot does not do: a plain-words reason for the
# date it picked (or did not), and a short soft hold so two sales agents quoting at once cannot
# both walk away promising the same last slot. The real scheduling engine itself is not changed.
# Ported from server/modules/delivery-management/earliest-slot.mjs.
import re
from datetime import datetime, timedelta

from app.criteria import zoho_now
from app.deluge import add_days, blank, parse_date, to_num, today_date, truthy, ymd
from app.delivery.scheduling import SA, day, default_duration, normalize_type, policy_reader, r6, to_long, workday_length

_HOLDS = "Schedule_Holds"
_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _dm(iso: str) -> str:
    d = datetime.strptime(iso, "%Y-%m-%d")
    return f"{d.day} {_MON[d.month - 1]}"


_PARSE_ZOHO_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?", re.IGNORECASE)


def _parse_zoho(v) -> datetime | None:
    """"2026-11-18 10:55:59 AM" -> datetime. Local to this file (Delivery has no shared one), like
    Node's own decisions-core.mjs parseZoho in Procurement -- kept separate on purpose."""
    m = _PARSE_ZOHO_RE.match(_text(v))
    if not m:
        return None
    h = 0 if m.group(4) is None else int(m.group(4))
    if m.group(7):
        h = (h % 12) + (12 if m.group(7).upper() == "PM" else 0)
    return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), h, int(m.group(5) or 0), int(m.group(6) or 0))


async def _active_hold_hours(store, now: datetime) -> dict:
    holds = await store.find(_HOLDS, lambda h: not truthy(h.get("Released")))
    by_key: dict = {}
    for h in holds:
        expires = _parse_zoho(h.get("Expires_At"))
        if expires and expires <= now:
            continue
        key = f"{_text(h.get('Installer'))}|{day(h.get('Hold_Date'))}"
        by_key[key] = by_key.get(key, 0) + to_num(h.get("Hours"))
    return by_key


async def find_earliest_slot(store, *, job_type=None, est_minutes=None, from_date=None, now=None) -> dict:
    now = now or datetime.now()
    d_type = normalize_type(job_type or "")
    is_full_day = d_type == "Full-Day Install"
    policy = await policy_reader(store)
    buffer_pct = to_long(policy("traffic_buffer_percent"), 15)
    factor = 1 + buffer_pct / 100
    est_hours = (float(est_minutes) / 60) if est_minutes is not None else default_duration(d_type)
    buffered_duration = 8 if is_full_day else r6(est_hours * factor)
    max_window = to_long(policy("max_days_scheduling_window"), 14)
    workday_hours = workday_length(policy)

    search_start = parse_date(from_date) if from_date else today_date()
    if search_start < today_date():
        search_start = today_date()

    availability = await store.find("Daily_Team_Availability")
    everything = await store.find(SA)
    held_hours = await _active_hold_hours(store, now)

    trail = []
    for n in range(max_window):
        candidate = ymd(add_days(search_start, n))
        teams_today = [t for t in availability if day(t.get("Availability_Date")) == candidate]
        if not teams_today:
            trail.append(f"{_dm(candidate)} no team scheduled")
            continue
        on_leave = [t.get("Installer") for t in teams_today if t.get("Availability_Status") == "Not Available"]
        active = [t for t in teams_today if t.get("Availability_Status") != "Not Available"]
        if not active:
            trail.append(f"{_dm(candidate)} {', '.join(on_leave)} on leave")
            continue

        best = None
        best_remaining = -1
        full_count = 0
        for t in active:
            cap = to_num(t.get("Max_Capacity_Hours")) or workday_hours
            used_recs = [r for r in everything if r.get("Installer") == t.get("Installer")
                         and (day(r.get("Confirmed_Schedule_Date")) == candidate or day(r.get("Suggested_Schedule_Date")) == candidate) and r.get("Appointment_Status") != "Failed"]
            used = 0.0
            for u in used_recs:
                used = r6(used + (8 if u.get("Type_of_Delivery") == "Full-Day Install" else r6(to_num(u.get("Estimated_Duration")) * factor)))
            used = r6(used + held_hours.get(f"{t.get('Installer')}|{candidate}", 0))
            remaining = r6(cap - used)
            fits = buffered_duration <= remaining and r6(used + buffered_duration) <= workday_hours
            if fits:
                if remaining > best_remaining:
                    best = {**t, "used": used, "cap": cap}
                    best_remaining = remaining
            else:
                full_count += 1
        if best:
            reason = f"Earliest is {_dm(candidate)}: {', '.join(trail)}." if trail else f"Earliest is {_dm(candidate)}."
            return {"found": True, "date": candidate, "installer": best.get("Installer"), "driver": best.get("Driver"), "vehicle": best.get("Vehicle"), "reason": reason}
        leave_note = f", {', '.join(on_leave)} on leave" if on_leave else ""
        trail.append(f"{_dm(candidate)} full ({full_count} of {len(active)} jobs){leave_note}")
    return {"found": False, "date": None, "reason": f"No team available within {max_window} days: {'; '.join(trail)}."}


async def teams_with_room_on(store, date: str, *, job_type=None, est_minutes=None, now=None) -> list[dict]:
    now = now or datetime.now()
    d_type = normalize_type(job_type or "")
    is_full_day = d_type == "Full-Day Install"
    policy = await policy_reader(store)
    buffer_pct = to_long(policy("traffic_buffer_percent"), 15)
    factor = 1 + buffer_pct / 100
    est_hours = (float(est_minutes) / 60) if est_minutes is not None else default_duration(d_type)
    buffered_duration = 8 if is_full_day else r6(est_hours * factor)
    workday_hours = workday_length(policy)

    teams_today = await store.find("Daily_Team_Availability", lambda t: day(t.get("Availability_Date")) == date)
    everything = await store.find(SA)
    held_hours = await _active_hold_hours(store, now)
    active = [t for t in teams_today if t.get("Availability_Status") != "Not Available"]
    fitting = []
    for t in active:
        cap = to_num(t.get("Max_Capacity_Hours")) or workday_hours
        used_recs = [r for r in everything if r.get("Installer") == t.get("Installer")
                     and (day(r.get("Confirmed_Schedule_Date")) == date or day(r.get("Suggested_Schedule_Date")) == date) and r.get("Appointment_Status") != "Failed"]
        used = 0.0
        for u in used_recs:
            used = r6(used + (8 if u.get("Type_of_Delivery") == "Full-Day Install" else r6(to_num(u.get("Estimated_Duration")) * factor)))
        used = r6(used + held_hours.get(f"{t.get('Installer')}|{date}", 0))
        remaining = r6(cap - used)
        if buffered_duration <= remaining and r6(used + buffered_duration) <= workday_hours:
            fitting.append({"installer": t.get("Installer"), "driver": t.get("Driver"), "vehicle": t.get("Vehicle"), "remaining": remaining})
    return sorted(fitting, key=lambda f: -f["remaining"])


async def quote_and_hold(store, *, job_type=None, est_minutes=None, from_date=None, quoted_by="", sr_no="") -> dict:
    policy = await policy_reader(store)
    hold_minutes = to_long(policy("soft_hold_minutes"), 20)
    now = datetime.now()
    result = await find_earliest_slot(store, job_type=job_type, est_minutes=est_minutes, from_date=from_date, now=now)
    if not result["found"]:
        return result
    d_type = normalize_type(job_type or "")
    est_hours = (float(est_minutes) / 60) if est_minutes is not None else default_duration(d_type)
    buffer_pct = to_long(policy("traffic_buffer_percent"), 15)
    hours = 8 if d_type == "Full-Day Install" else r6(est_hours * (1 + buffer_pct / 100))
    hold_id = await store.add_record(_HOLDS, {
        "Installer": result["installer"], "Hold_Date": result["date"], "Hours": hours,
        "Expires_At": zoho_now(now + timedelta(minutes=hold_minutes)), "Quoted_By": quoted_by, "Service_Request_No": sr_no, "Released": False,
    })
    return {**result, "holdId": str(hold_id), "holdMinutes": hold_minutes}


async def release_hold(store, hold_id) -> None:
    if blank(hold_id):
        return
    await store.update_record(_HOLDS, hold_id, {"Released": True}, by_form=True)
