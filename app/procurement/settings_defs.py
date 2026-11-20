# The catalogue of Procurement settings (spec 05 Shared Engines / 08 Control Panel, CP-R1, CP-R2).
# Every number the Procurement code reads is listed here with a plain label, a default, limits and
# one sentence saying what it affects. Code holds the formulas only. A changed value is a row in
# Procurement_Settings (no row = the default); every change is kept in Procurement_Settings_History.
# Defaults: the spec's (Defaults and Open Items section C) for the numbers only Ship & Track uses,
# and what the forecast engine used before for the forecast numbers (below). Ported from
# server/modules/procurement/settings-defs.mjs.
#
# The forecast numbers (transit, customs, fulfillment, delivery, the two switches) are the SAME
# settings the forecast engine reads: see app/forecast/forecast_settings.py. Their "default" is what
# the engine used before, not the spec's example numbers, so saving nothing changes nothing.
import re

from app.forecast.engine import DEFAULT_SETTINGS as E

SETTING_DEFS = [
    # --- planned dates (the feasibility calculator) ---
    {"key": "production_days", "label": "Production days (when no lead time is quoted)", "type": "days", "default": 20, "min": 1, "max": 180, "group": "Planned dates", "affects": "The planned production end of every shipment with no quoted lead time and no supplier default."},
    {"key": "consolidation_days", "label": "Consolidation days (production end to shipout)", "type": "days", "default": 3, "min": 0, "max": 30, "group": "Planned dates", "affects": "The planned shipout date of every shipment."},
    {"key": "receiving_days", "label": "Receiving days (arrival to binned and pickable)", "type": "days", "default": 2, "min": 0, "max": 14, "group": "Planned dates", "affects": "The date the goods are pickable, which is what is compared with the date needed."},
    {"key": "transit_air_min_days", "label": "Transit days, Air: shortest", "type": "days", "default": E["airTMin"], "min": 1, "max": 200, "group": "Forecast and plan: transit", "affects": "The forecast of every order, and the planned arrival of every air shipment (the middle of the shortest and the longest)."},
    {"key": "transit_air_max_days", "label": "Transit days, Air: longest", "type": "days", "default": E["airTMax"], "min": 1, "max": 200, "group": "Forecast and plan: transit", "affects": "The forecast of every order, and the planned arrival of every air shipment (the middle of the shortest and the longest)."},
    {"key": "customs_air_min_days", "label": "Customs to warehouse days, Air: shortest", "type": "days", "default": E["airCMin"], "min": 0, "max": 60, "group": "Forecast and plan: transit", "affects": "The forecast of every order, and the planned arrival of every air shipment (the middle of the shortest and the longest)."},
    {"key": "customs_air_max_days", "label": "Customs to warehouse days, Air: longest", "type": "days", "default": E["airCMax"], "min": 0, "max": 60, "group": "Forecast and plan: transit", "affects": "The forecast of every order, and the planned arrival of every air shipment (the middle of the shortest and the longest)."},
    {"key": "transit_lcl_min_days", "label": "Transit days, LCL (sea, shared container): shortest", "type": "days", "default": E["lclTMin"], "min": 1, "max": 200, "group": "Forecast and plan: transit", "affects": "The forecast of every order, and the planned arrival of every LCL shipment (the middle of the shortest and the longest)."},
    {"key": "transit_lcl_max_days", "label": "Transit days, LCL (sea, shared container): longest", "type": "days", "default": E["lclTMax"], "min": 1, "max": 200, "group": "Forecast and plan: transit", "affects": "The forecast of every order, and the planned arrival of every LCL shipment (the middle of the shortest and the longest)."},
    {"key": "customs_lcl_min_days", "label": "Customs to warehouse days, LCL (sea, shared container): shortest", "type": "days", "default": E["lclCMin"], "min": 0, "max": 60, "group": "Forecast and plan: transit", "affects": "The forecast of every order, and the planned arrival of every LCL shipment (the middle of the shortest and the longest)."},
    {"key": "customs_lcl_max_days", "label": "Customs to warehouse days, LCL (sea, shared container): longest", "type": "days", "default": E["lclCMax"], "min": 0, "max": 60, "group": "Forecast and plan: transit", "affects": "The forecast of every order, and the planned arrival of every LCL shipment (the middle of the shortest and the longest)."},
    {"key": "transit_fcl_min_days", "label": "Transit days, FCL (sea, full container): shortest", "type": "days", "default": E["fclTMin"], "min": 1, "max": 200, "group": "Forecast and plan: transit", "affects": "The forecast of every order, and the planned arrival of every FCL shipment (the middle of the shortest and the longest)."},
    {"key": "transit_fcl_max_days", "label": "Transit days, FCL (sea, full container): longest", "type": "days", "default": E["fclTMax"], "min": 1, "max": 200, "group": "Forecast and plan: transit", "affects": "The forecast of every order, and the planned arrival of every FCL shipment (the middle of the shortest and the longest)."},
    {"key": "customs_fcl_min_days", "label": "Customs to warehouse days, FCL (sea, full container): shortest", "type": "days", "default": E["fclCMin"], "min": 0, "max": 60, "group": "Forecast and plan: transit", "affects": "The forecast of every order, and the planned arrival of every FCL shipment (the middle of the shortest and the longest)."},
    {"key": "customs_fcl_max_days", "label": "Customs to warehouse days, FCL (sea, full container): longest", "type": "days", "default": E["fclCMax"], "min": 0, "max": 60, "group": "Forecast and plan: transit", "affects": "The forecast of every order, and the planned arrival of every FCL shipment (the middle of the shortest and the longest)."},
    {"key": "local_transit_days", "label": "Transit days, local sourcing", "type": "days", "default": E["locTMin"], "min": 0, "max": 30, "group": "Forecast and plan: transit", "affects": "The forecast of orders sourced locally (HC System)."},
    {"key": "local_customs_days", "label": "Customs days, local sourcing", "type": "days", "default": E["locCMin"], "min": 0, "max": 30, "group": "Forecast and plan: transit", "affects": "The forecast of orders sourced locally."},
    {"key": "fulfillment_days", "label": "Fulfillment days (pickable to ready to load: picking, QC, crating)", "type": "days", "default": E["prepMin"], "min": 0, "max": 30, "group": "Forecast and plan: handling", "affects": "The forecast of every order after the goods arrive, and the date needed (target delivery minus fulfillment and delivery days)."},
    {"key": "delivery_days", "label": "Delivery days (ready to load to the customer)", "type": "days", "default": E["delMin"], "min": 0, "max": 30, "group": "Forecast and plan: handling", "affects": "The forecast of every order, and the date needed."},
    {"key": "forecast_reanchor", "label": "Re-anchor the forecast on the latest real event", "type": "yes_no", "default": E["reAnchor"], "group": "Forecast and plan: handling", "affects": "Whether the forecast restarts from the stage an order is really in (shipped, in picking, ...) or from the day the PR was added."},
    {"key": "forecast_include_supplier_lead_time", "label": "Add the supplier lead time to the forecast", "type": "yes_no", "default": E["addSupLead"], "group": "Forecast and plan: handling", "affects": "Whether the quoted lead time of the supplier is added to the procurement leg of the forecast."},
    # --- sorting ---
    {"key": "proc_watch_slack_days", "label": "Watch: slack at or below this many days", "type": "days", "default": 7, "min": 0, "max": 60, "group": "Sorting", "affects": "Which on-track shipments move to Watch, and the At Risk status."},
    {"key": "default_promise_days", "label": "Promise days when an order has no target", "type": "days", "default": 25, "min": 1, "max": 120, "group": "Sorting", "affects": "The target used to rank a shipment whose order has no Target Delivery (order date + this)."},
    # --- supplier ladder ---
    {"key": "ladder_rung1_days", "label": "Ladder rung 1 (call the supplier): days late", "type": "days", "default": 1, "min": 1, "max": 30, "group": "Supplier ladder", "affects": "When the buyer is told to call a late supplier. Late = production not started by PO date + 1."},
    {"key": "ladder_rung2_days", "label": "Ladder rung 2 (ask for a discount): days late", "type": "days", "default": 2, "min": 1, "max": 30, "group": "Supplier ladder", "affects": "When the buyer is told to ask the supplier for a discount in writing."},
    {"key": "ladder_rung3_days", "label": "Ladder rung 3 (decide): days late", "type": "days", "default": 3, "min": 1, "max": 30, "group": "Supplier ladder", "affects": "When the cancel-and-re-source or hold decision is put in the Decisions list."},
    {"key": "arrival_overdue_grace_days", "label": "Arrival alert: days after the transit time", "type": "days", "default": 3, "min": 0, "max": 30, "group": "Supplier ladder", "affects": "When a shipped-out shipment that has not reached the port raises the overdue alert."},
    # --- decisions and alerts ---
    {"key": "po_ack_window_days", "label": "Days the supplier has to acknowledge a PO", "type": "days", "default": 1, "min": 1, "max": 14, "group": "Decisions and alerts", "affects": "When a PO that the supplier has not acknowledged raises an alert for the buyer. A late acknowledgement never moves the production clock (it starts at PO date + 1)."},
    {"key": "inquiry_quote_days", "label": "Days a supplier has to quote an inquiry", "type": "days", "default": 2, "min": 1, "max": 14, "group": "Decisions and alerts", "affects": "When a supplier that has not quoted an inquiry raises an alert for the buyer (spec Inquiry, notifications)."},
    {"key": "rr_default_days", "label": "Days to deliver a replacement", "type": "days", "default": 21, "min": 1, "max": 90, "group": "Decisions and alerts", "affects": "The target of a new Replacement Request when the original target has already passed (today + this many days)."},
    {"key": "rr_ack_window_days", "label": "Days the supplier has to acknowledge a Replacement Request", "type": "days", "default": 1, "min": 1, "max": 14, "group": "Decisions and alerts", "affects": "When a Replacement Request the supplier has not acknowledged raises an alert for the buyer."},
    {"key": "receiving_count_window_days", "label": "Days to count an arrived shipment", "type": "days", "default": 1, "min": 1, "max": 14, "group": "Receiving alerts", "affects": 'When an arrived shipment that nobody has counted raises a "receiving backed up" alert.'},
    {"key": "receiving_bin_window_days", "label": "Days to bin a counted shipment", "type": "days", "default": 1, "min": 1, "max": 14, "group": "Receiving alerts", "affects": "When counted goods with no bin location raise an alert (stock exists but cannot be picked)."},
    {"key": "receiving_available_window_hours", "label": "Hours from binned to available", "type": "hours", "default": 2, "min": 1, "max": 72, "group": "Receiving alerts", "affects": "When binned goods that are still not available raise an alert (something in the readiness step is broken)."},
    {"key": "approval_sla_hours", "label": "Hours to decide before it escalates", "type": "hours", "default": 24, "min": 1, "max": 168, "group": "Decisions and alerts", "affects": "A decision not made in this time is escalated to the supervisor."},
    {"key": "procurement_alert_email", "label": "Alert recipient (until roles exist)", "type": "text", "default": "", "group": "Decisions and alerts", "affects": "Who receives the in-app alerts of the ladder, the overdue arrival and the escalation. Blank = the address the old shipment schedules used."},
    {"key": "sales_agent_alert_email", "label": "Sales agent alert recipient (until roles exist)", "type": "text", "default": "", "group": "Decisions and alerts", "affects": 'Who receives the "tell the customer" alert when a target date is kept late or a new target is accepted. Blank = the same address as the general alert recipient.'},
]

DEFS = {d["key"]: d for d in SETTING_DEFS}
GROUPS = list(dict.fromkeys(d["group"] for d in SETTING_DEFS))  # insertion order, not sorted (matches Node's [...new Set(...)])


def default_settings() -> dict:
    return {d["key"]: d["default"] for d in SETTING_DEFS}


def _is_finite_number(n) -> bool:
    try:
        return n == n and n not in (float("inf"), float("-inf"))
    except TypeError:
        return False


def problem_with(key: str, raw) -> str | None:
    d = DEFS.get(key)
    if not d:
        return f'"{key}" is not a Procurement setting.'
    if d["type"] == "text":
        return "Too long (200 characters at most)." if len(str(raw if raw is not None else "")) > 200 else None
    if d["type"] == "yes_no":
        return None if str(raw).lower() in ("true", "false") else f"{d['label']}: choose yes or no."
    try:
        n = float(raw)
    except (TypeError, ValueError):
        n = float("nan")
    if raw == "" or raw is None or not _is_finite_number(n):
        return f"{d['label']}: enter a number."
    if n != int(n):
        return f"{d['label']}: use whole numbers."
    n = int(n)
    if n < d["min"] or n > d["max"]:
        return f"{d['label']}: {n} is outside the allowed range ({d['min']} to {d['max']})."
    return None


_RANGE_KEY_RE = re.compile(r"^((?:transit|customs)_(?:air|lcl|fcl))_(min|max)_days$")


def range_problem(key: str, raw, values: dict) -> str | None:
    m = _RANGE_KEY_RE.match(key)
    if not m:
        return None
    other_key = f"{m.group(1)}_{'max' if m.group(2) == 'min' else 'min'}_days"
    other = values[other_key]
    n = float(raw)
    if m.group(2) == "min" and n > float(other):
        return f"{DEFS[key]['label']}: the shortest ({int(n)}) cannot be more than the longest ({int(float(other))})."
    if m.group(2) == "max" and n < float(other):
        return f"{DEFS[key]['label']}: the longest ({int(n)}) cannot be less than the shortest ({int(float(other))})."
    return None


def ladder_problem(s: dict) -> str | None:
    if s["ladder_rung1_days"] < s["ladder_rung2_days"] < s["ladder_rung3_days"]:
        return None
    return "The ladder days must go up: rung 1 before rung 2 before rung 3."
