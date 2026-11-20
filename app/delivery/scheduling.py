# The scheduling engine, ported from zoho-export/parsed/functions/dmsScheduleSlot.dg (521 lines of
# Deluge, via Node's server/modules/delivery-management/scheduling.mjs). It finds a team and a day
# for a Service Appointment, writes the suggestion, flags an exception when there is no room, and
# confirms a Priority order by itself. Callers: the custom API dms_reschedule (is_rerun=True), the
# SA_Scheduling_Engine workflow (scheduling_engine.py, is_rerun=False).
#
# Compared with Zoho Development: the script is ported as written, quirks included ("mirrors
# Zoho"), with ONE deliberate difference, the clock (3).
#  1. Hours already used by a team: a team is charged for its OWN jobs of the day that are
#     Confirmed or Suggested, not Failed, not this record.
#  2. The winner test is `fits && remaining > best || (remaining == best && fewer jobs)`: the tie
#     clause does not re-check the SO cap or that the job fits.
#  3. DELIBERATE DIFFERENCE, a Zoho bug: ctsTotalMin / 60 is a decimal division in Zoho, which can
#     produce an invalid time string and fail the whole script. Here it is whole minutes.
#  4. Hours are printed with two decimals ("2.30 hrs"), and a blank driver or fleet prints "null".
#  5. "today" is the server's date, so the server must run with TZ=Asia/Manila.
# Teams and records are looped in ID order, like Zoho. Times are stored as "08:00:00 AM" (what
# Zoho's time field keeps) while summary text keeps "8:00 AM".
import re

from app.criteria import zoho_now
from app.custom_apis import CUSTOM_APIS
from app.delivery.locks import with_lock
from app.deluge import add_days, blank, id_of, parse_date, to_num, today_date, truthy, ymd

SA = "Service_Appointment_Form"
_EXC = "DMS_Exception_Queue"

# Shared between failure-redelivery.py (Phase 5, raises the exception) and exception-queue.py
# (Phase 5, creates the redelivery on resolve): which failure reason codes categorise a redelivery
# as Broken for sorter.py's isBroken() (Phase 3).
BROKEN_FAILURE_CODES = {"damaged_in_transit", "refused"}


def r6(x: float) -> float:
    return round(x * 1e6) / 1e6


def hrs(x: float) -> str:
    return f"{x:.2f}"


def null_text(v) -> str:
    return "null" if blank(v) else str(v)


def day(v) -> str:
    return "" if v is None else str(v)[:10]


def customer_name(rec: dict) -> str:
    c = rec.get("Customer_Name")
    if not c or not isinstance(c, dict):
        return c.strip() if isinstance(c, str) else ""
    return f"{c.get('first_name') or ''} {c.get('last_name') or ''}".strip()


def clock(text) -> dict | None:
    parts = str(text if text is not None else "").strip().split(" ")
    if len(parts) != 2:
        return None
    hm = parts[0].split(":")
    if len(hm) < 2:
        return None
    try:
        hour = int(hm[0])
        minute = int(hm[1])
    except ValueError:
        return None
    ap = parts[1].upper()
    if ap == "PM" and hour != 12:
        hour += 12
    if ap == "AM" and hour == 12:
        hour = 0
    return {"hour": hour, "minute": minute}


_STORED_CLOCK_RE = re.compile(r"^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$", re.IGNORECASE)


def stored_clock(text) -> str:
    m = _STORED_CLOCK_RE.match(str(text if text is not None else "").strip())
    if not m:
        return text
    return f"{m.group(1).zfill(2)}:{m.group(2)}:00 {m.group(3).upper()}"


def slot_text(start_text, used_hours: float) -> str:
    base = "8:00 AM" if blank(start_text) else str(start_text)
    c = clock(base)
    if not c:
        return base
    total = c["hour"] * 60 + c["minute"] + int(r6(used_hours * 60))
    hr24 = total // 60
    minute = total - hr24 * 60
    shown = 12 if hr24 == 0 else (hr24 - 12 if hr24 > 12 else hr24)
    return f"{shown}:{str(minute).zfill(2)} {'PM' if hr24 >= 12 else 'AM'}"


async def policy_reader(store, overrides: dict | None = None):
    overrides = overrides or {}
    rows = await store.find("Policy_Settings")

    def read(key: str) -> str | None:
        if key in overrides:
            return None if blank(overrides[key]) else str(overrides[key])
        r = next((p for p in rows if p.get("Policy_Key") == key), None)
        return str(r["Value"]) if r and not blank(r.get("Value")) else None
    return read


def to_long(v, fallback: int) -> int:
    if blank(v):
        return fallback
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return fallback


def workday_length(policy) -> int:
    s = policy("workday_start_time")
    e = policy("workday_end_time")
    if s and e:
        a = clock(s)
        b = clock(e)
        if a and b and b["hour"] > a["hour"]:
            return b["hour"] - a["hour"]
    return 9


def default_duration(d_type: str) -> int:
    if d_type == "With Installation":
        return 4
    if d_type == "Full-Day Install":
        return 8
    if d_type == "Site Visit":
        return 1
    return 2


def normalize_type(raw) -> str:
    if raw == "Delivery and Installation":
        return "With Installation"
    if raw == "Pull Out":
        return "Pullout"
    return raw if raw is not None else ""


async def raise_exception(store, rec: dict, *, stage: str, reason: str, severity: str, user: str = "") -> bool:
    open_ = await store.find(_EXC, lambda r: id_of(r.get("Sales_Order_Reference")) == str(rec["ID"]) and r.get("Exception_Reason") == reason and r.get("Status") == "Open")
    if open_:
        return False
    await store.add_record(_EXC, {
        "Sales_Order_Reference": rec["ID"], "Customer_Name": customer_name(rec), "Exception_Stage": stage, "Exception_Reason": reason,
        "Severity": severity, "Raised_By": "System", "Date_Raised": zoho_now(), "Status": "Open",
    }, user)
    return True


def schedule_slot(store, record_id, is_rerun: bool, options: dict | None = None):
    return with_lock("scheduling", lambda: _schedule_slot_now(store, record_id, is_rerun, options))


async def _schedule_slot_now(store, record_id, is_rerun: bool, options: dict | None = None) -> dict:
    user = (options or {}).get("user", "")
    sa_id = str(record_id if record_id is not None else "").strip()
    everything = await store.find(SA) if sa_id.isdigit() else []
    rec = next((r for r in everything if str(r["ID"]) == sa_id), None)
    if not rec:
        return {"status": "error", "message": "Record not found."}

    changes: dict = {}

    def set_(k, v):
        rec[k] = v
        changes[k] = v

    async def finish(resp):
        if changes:
            await store.update_record(SA, sa_id, changes, by_form=True)
        return resp

    async def flag(reason, stage, severity):
        set_("Exception_Status", "Flagged")
        set_("Exception_Reason", reason)
        await raise_exception(store, rec, stage=stage, reason=reason, severity=severity, user=user)

    # GUARD 1: the job is finished. GUARD 2: Pick Up needs no team.
    if rec.get("Appointment_Status") in ("Completed", "Failed"):
        return {"status": "blocked", "message": "Hindi na maaaring i-schedule - tapos na ang delivery na ito."}
    if rec.get("Type_of_Delivery") == "Pick Up":
        return {"status": "skipped", "message": "Pick Up - i-set na lang diretso ang Confirmed Date at Time."}
    # GUARD 3: a Flagged exception stops the automatic run; a manual re-schedule resolves it on purpose.
    if rec.get("Exception_Status") == "Flagged":
        if is_rerun:
            set_("Exception_Status", "Resolved")
        else:
            return {"status": "blocked", "message": "Naka-Flagged pa ang Exception - i-resolve muna."}

    d_type_raw = rec.get("Type_of_Delivery") or ""
    d_type = normalize_type(d_type_raw)
    if d_type == "Multi-Day Install":
        await flag("Requires Manual Planning", "Scheduling", "Medium")
        return await finish({"status": "flagged", "message": "Multi-Day Install - kailangan ng manual planning."})

    is_full_day = d_type == "Full-Day Install"
    fleet_assignment = "Own Fleet"
    est_duration = to_num(rec.get("Estimated_Duration"))
    if est_duration == 0:
        est_duration = default_duration(d_type)
        set_("Estimated_Duration", est_duration)

    policy = await policy_reader(store)
    buffer_pct = to_long(policy("traffic_buffer_percent"), 15)
    factor = 1 + buffer_pct / 100
    buffered_duration = 8 if is_full_day else r6(est_duration * factor)
    max_window = to_long(policy("max_days_scheduling_window"), 14)
    workday_hours = workday_length(policy)

    search_start = today_date()
    requested = day(rec.get("Requested_Delivery_Date"))
    if requested != "" and requested >= ymd(search_start):
        search_start = parse_date(requested)
    availability = await store.find("Daily_Team_Availability")
    found = None
    n = 0
    while n < max_window and not found:
        candidate = ymd(add_days(search_start, n))
        teams = [t for t in availability if day(t.get("Availability_Date")) == candidate and t.get("Availability_Status") != "Not Available"]
        best = None
        best_remaining = -1
        best_so_count = 999999
        for t in teams:
            cap = to_num(t.get("Max_Capacity_Hours"))
            if cap <= 0:
                cap = workday_hours
            used_recs = [r for r in everything if r.get("Installer") == t.get("Installer")
                         and (day(r.get("Confirmed_Schedule_Date")) == candidate or day(r.get("Suggested_Schedule_Date")) == candidate)
                         and r.get("Appointment_Status") != "Failed" and str(r["ID"]) != sa_id]
            used = 0.0
            for u in used_recs:
                used = r6(used + (8 if u.get("Type_of_Delivery") == "Full-Day Install" else r6(to_num(u.get("Estimated_Duration")) * factor)))
            so_count_today = len(used_recs)
            remaining = r6(cap - used)
            max_so = to_num(t.get("Max_SO_Capacity"))
            so_cap_ok = not (max_so > 0 and so_count_today >= max_so)
            if (so_cap_ok and buffered_duration <= remaining and remaining > best_remaining) or (remaining == best_remaining and so_count_today < best_so_count):
                best = {"installer": t.get("Installer"), "driver": t.get("Driver"), "vehicle": t.get("Vehicle"), "start": t.get("Start_Time1"), "used": used, "cap": cap}
                best_remaining = remaining
                best_so_count = so_count_today
        if best:
            found = {**best, "date": candidate}
        n += 1

    fail_reason = ""
    if not found:
        fail_reason = "Calendar Full"
    elif r6(found["used"] + buffered_duration) > workday_hours and fleet_assignment == "Own Fleet":
        fail_reason = "Slot Pushed — Overtime Declined"
    if fail_reason:
        set_("Suggested_Schedule_Date", "")
        set_("Suggested_Time_Slot", "")
        set_("Installer", "")
        set_("Assigned_to_Driver", "")
        set_("Fleet_Assignment", "")
        await flag(fail_reason, "Scheduling", "Medium")
        return await finish({"status": "flagged", "message": f"{fail_reason} - walang available na team sa loob ng {max_window} araw."})

    time_slot = slot_text(found["start"], found["used"])
    fleet_display = fleet_assignment if blank(found["vehicle"]) else found["vehicle"]
    set_("Suggested_Schedule_Date", found["date"])
    set_("Suggested_Time_Slot", stored_clock(time_slot))
    set_("Fleet_Assignment", fleet_display)
    set_("Installation_Required", d_type in ("With Installation", "Full-Day Install"))
    set_("Calendar_Entry_Created", False)
    set_("Appointment_Status", "Queued")
    set_("Installer", found["installer"])
    set_("Assigned_to_Driver", found["driver"] or "")
    set_("Original_System_Suggestion", f"System suggested: {found['installer']} / {null_text(found['driver'])} on {found['date']} ({fleet_display})")

    resp = {"status": "success"}
    if truthy(rec.get("Priority")):
        others = [r for r in everything if r.get("Installer") == found["installer"] and day(r.get("Confirmed_Schedule_Date")) == found["date"] and truthy(r.get("Calendar_Entry_Created")) and str(r["ID"]) != sa_id]
        other_hours = 0.0
        for o in others:
            other_hours = r6(other_hours + (8 if o.get("Type_of_Delivery") == "Full-Day Install" else r6(to_num(o.get("Estimated_Duration")) * factor)))
        if r6(other_hours + buffered_duration) <= found["cap"]:
            city_suffix = "" if blank(rec.get("City")) else f", {rec.get('City')}"
            where = f"{rec.get('Customer_Address') or ''}{city_suffix}"
            set_("Confirmed_Schedule_Date", found["date"])
            set_("Confirmed_Time_Slot", stored_clock(time_slot))
            set_("Calendar_Event_Summary", f"Title: {rec.get('Sales_Order')} - {customer_name(rec)} | Date: {found['date']} | Time: {time_slot} ({buffered_duration if is_full_day else hrs(buffered_duration)} hrs) | Team: {found['installer']} / {null_text(found['driver'])} | Fleet: {fleet_display} | Type: {'-' if blank(d_type_raw) else d_type_raw} | Location: {where} | Notes: Auto-confirmed (Priority)")
            set_("Calendar_Entry_Created", True)
            set_("Appointment_Status", "Scheduled")
    return await finish({
        **resp,
        "message": f"Suggested: {found['installer']} / {null_text(found['driver'])} - {found['date']} {time_slot}",
        "date": found["date"], "time": time_slot, "installer": found["installer"],
    })


async def _dms_reschedule_api(payload: dict, store, ctx: dict) -> dict:
    return await schedule_slot(store, (payload or {}).get("recordId"), True, {"user": ctx.get("user", "")})


CUSTOM_APIS["dms_reschedule"] = _dms_reschedule_api
