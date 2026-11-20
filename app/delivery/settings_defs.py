# The catalogue of Delivery settings (spec 05 Shared Engines / 08 Control Panel: the "Delivery
# capacity" group). Every number the Delivery code reads from Policy_Settings is listed here with
# a plain label, the default the code already uses, limits, and one sentence on what it affects.
# Code holds the formulas only. A changed value is a Policy_Settings row (no row = the default), so
# every module that already reads policy() keeps working unchanged. Every change is kept in
# Delivery_Settings_History (settings.py).
#
# Only keys the code really reads are here. Fulfillment's own keys (boxes per hour, default
# people, hours per day) are not: they belong to Fulfillment. "shared": "Fulfillment" marks the two
# ranking numbers Fulfillment's sorter reads too. Ported from
# server/modules/delivery-management/settings-defs.mjs.
import re

from app.delivery.scheduling import clock

SETTING_DEFS = [
    # --- scheduling window and workday ---
    {"key": "traffic_buffer_percent", "label": "Traffic buffer", "type": "percent", "default": 15, "min": 0, "max": 100, "group": "Scheduling window and workday", "affects": "How long every job is planned to take: its estimated hours plus this much extra. A bigger buffer fits fewer jobs in a team-day.", "preview": "none"},
    {"key": "max_days_scheduling_window", "label": "Scheduling window", "type": "days", "default": 14, "min": 1, "max": 60, "group": "Scheduling window and workday", "affects": "How many days ahead the scheduling engine looks for a free team-day before it gives up and raises an exception.", "preview": "none"},
    {"key": "workday_start_time", "label": "Workday start", "type": "time", "default": "8:00 AM", "group": "Scheduling window and workday", "affects": "When a team-day begins. With the end time it sets the hours a team can be booked for.", "preview": "none"},
    {"key": "workday_end_time", "label": "Workday end", "type": "time", "default": "5:00 PM", "group": "Scheduling window and workday", "affects": "When a team-day ends. With the start time it sets the hours a team can be booked for.", "preview": "none"},
    {"key": "soft_hold_minutes", "label": "Soft hold on a quoted slot", "type": "minutes", "default": 20, "min": 1, "max": 240, "group": "Scheduling window and workday", "affects": "How long a slot quoted to a customer is kept for them before it is released.", "preview": "none"},
    # --- ranking (the Sorting Engine) ---
    {"key": "default_promise_days", "label": "Promise days when a job has no target", "type": "days", "default": 25, "min": 1, "max": 120, "group": "Ranking", "affects": "The target used to rank a job whose order has no requested delivery date: order date plus this many days.", "shared": "Fulfillment", "preview": "ranking"},
    {"key": "at_risk_slack_days", "label": "At risk: slack at or below this many days", "type": "days", "default": 3, "min": 1, "max": 30, "group": "Ranking", "affects": "Which on-time jobs move to At Risk (days left to the target at or below this number).", "shared": "Fulfillment", "preview": "ranking"},
    # --- capacity ---
    {"key": "delivery_sites_per_team_per_day", "label": "Sites per team per day", "type": "count", "default": 3, "min": 1, "max": 10, "group": "Capacity", "affects": "How many visits (drop-off or installation) one team does in a day. Feeds the backlog calculator on Delivery Analytics.", "preview": "backlog"},
    {"key": "delivery_max_teams", "label": "Field teams (vehicles) at most", "type": "count", "default": 3, "min": 1, "max": 10, "group": "Capacity", "affects": "The most teams that can be out on one day, even if more show as available. Feeds the backlog calculator.", "preview": "backlog"},
    {"key": "delivery_heavy_box_threshold", "label": "Heavy order: boxes at or above", "type": "count", "default": 10, "min": 1, "max": 200, "group": "Capacity", "affects": "From this many boxes, with no lift on site, the suggested crew is 4 people instead of 2.", "preview": "none"},
    {"key": "dropoff_max_wait_days", "label": "Drop-off: longest wait for an own-team slot", "type": "days", "default": 2, "min": 0, "max": 14, "group": "Capacity", "affects": "A drop-off whose own-team slot is later than its target, or more than this many days from today, gets a Book third party approval item.", "preview": "none"},
    # --- team rotation ---
    {"key": "rotation_days_ahead", "label": "Team rotation: days ahead", "type": "days", "default": 14, "min": 1, "max": 60, "group": "Team rotation", "affects": "How far ahead the nightly job fills the team availability. Rows already there are never changed.", "preview": "none"},
    {"key": "rotation_teams_per_day", "label": "Team rotation: teams per day", "type": "count", "default": 3, "min": 1, "max": 10, "group": "Team rotation", "affects": "How many teams the nightly job puts on each work day (never more than the roster allows).", "preview": "none"},
    {"key": "rotation_max_hours", "label": "Team rotation: hours a team can work", "type": "hours", "default": 8, "min": 1, "max": 14, "group": "Team rotation", "affects": "The hours of work stamped on each new team-day row.", "preview": "none"},
    {"key": "rotation_max_so_capacity", "label": "Team rotation: most orders per team-day (blank = no limit)", "type": "count", "default": "", "optional": True, "min": 1, "max": 50, "group": "Team rotation", "affects": "The most orders stamped on each new team-day row. The scheduling engine checks it when it books a job on that team-day.", "preview": "none"},
    # --- alerts and archive ---
    {"key": "approval_sla_hours", "label": "Hours to decide before it escalates", "type": "hours", "default": 24, "min": 1, "max": 168, "group": "Alerts and archive", "affects": "The due time put on every supervisor approval item (schedule shortfall, third-party booking).", "preview": "none"},
    {"key": "redelivery_silence_days", "label": "Failed job with no redelivery: days before the alert", "type": "days", "default": 2, "min": 1, "max": 30, "group": "Alerts and archive", "affects": "When a failed or partial job with no redelivery scheduled raises an alert.", "preview": "none"},
    {"key": "archive_after_days", "label": "Archive a finished job after", "type": "days", "default": 7, "min": 1, "max": 90, "group": "Alerts and archive", "affects": "When a done job leaves the active lists (if it has no open exception).", "preview": "none"},
    {"key": "permit_warn_days", "label": "Permit still pending: warn this many days before the job", "type": "days", "default": 2, "min": 1, "max": 14, "group": "Alerts and archive", "affects": "When a job whose work permit / gate pass is required but still Pending shows in the Delivery Exception Queue (this many days before its date, or past it).", "preview": "none"},
    {"key": "maintenance_warn_days", "label": "Truck maintenance: warn this many days before", "type": "days", "default": 7, "min": 0, "max": 60, "group": "Alerts and archive", "affects": "How early a vehicle that is due for maintenance by date is flagged.", "preview": "none"},
    {"key": "maintenance_warn_km", "label": "Truck maintenance: warn this many km before", "type": "km", "default": 300, "min": 0, "max": 5000, "group": "Alerts and archive", "affects": "How early a vehicle that is due for maintenance by distance is flagged.", "preview": "none"},
]

DEFS = {d["key"]: d for d in SETTING_DEFS}
GROUPS = list(dict.fromkeys(d["group"] for d in SETTING_DEFS))  # insertion order, matches Node's [...new Set(...)]


def is_delivery_key(key: str) -> bool:
    return key in DEFS


# The Type_field the old Policy Settings widget expects on a row.
TYPE_FIELD = {"percent": "Percentage", "time": "Time", "days": "Number", "hours": "Number", "minutes": "Number", "count": "Number", "km": "Number"}


def _blank_text(v) -> bool:
    return v is None or str(v).strip() == ""


def typed(d: dict, raw):
    if d["type"] == "time":
        return str(raw).strip()
    return "" if _blank_text(raw) else float(raw)


_TIME_RE = re.compile(r"^(1[0-2]|0?[1-9]):([0-5]\d)\s(AM|PM)$", re.IGNORECASE)


def problem_with(key: str, raw) -> str | None:
    d = DEFS.get(key)
    if not d:
        return f'"{key}" is not a Delivery setting.'
    if d["type"] == "time":
        raw_text = str(raw if raw is not None else "").strip()
        c = clock(raw_text) if _TIME_RE.match(raw_text) else None
        return None if c else f"{d['label']}: enter a time like 8:00 AM or 5:30 PM."
    if _blank_text(raw):
        return None if d.get("optional") else f"{d['label']}: enter a number."
    try:
        n = float(raw)
    except (TypeError, ValueError):
        return f"{d['label']}: enter a number."
    if n != n or n in (float("inf"), float("-inf")):  # NaN or infinite
        return f"{d['label']}: enter a number."
    if n != int(n):
        return f"{d['label']}: use whole numbers."
    n = int(n)
    if n < d["min"] or n > d["max"]:
        return f"{d['label']}: {n} is outside the allowed range ({d['min']} to {d['max']})."
    return None


def workday_problem(key: str, raw, values: dict) -> str | None:
    if key not in ("workday_start_time", "workday_end_time"):
        return None
    start = clock(raw if key == "workday_start_time" else values.get("workday_start_time"))
    end = clock(raw if key == "workday_end_time" else values.get("workday_end_time"))
    if not start or not end:
        return None
    if end["hour"] * 60 + end["minute"] - (start["hour"] * 60 + start["minute"]) >= 60:
        return None
    return "The workday must end at least one hour after it starts."
