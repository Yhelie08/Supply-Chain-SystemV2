# The procurement feasibility calculator and the planned / forecast chain of one shipment, from the
# HomeCartel spec v1.4: 05 Shared Engines / 02 Calculators section 3, 03 Dates and Forecast,
# 02 Procurement / 04 Ship and Track. Plain arithmetic: no database in the chain functions, every
# number is a setting (the Procurement Settings page). Ported from server/modules/procurement/plan.mjs.
#
#   planned_arrival = PO_date + 1 (production starts) + production_days + consolidation_days + transit_days(mode) [+ customs_days(mode)] + receiving_days
#   feasible_by     = planned_arrival + fulfillment_days + delivery_days
#   shortfall_days  = feasible_by - target_delivery            (positive = will be late)
import math
import re
from datetime import date

from app.deluge import add_days, day_diff, parse_date, to_num, today_date, blank, ymd
from app.procurement.settings_defs import default_settings, problem_with

# Settings = the catalogue (settings_defs.py) + the numbers derived from the forecast settings, so
# the plan and the forecast engine read the SAME values (forecast_settings.py). What an unconfigured
# system resolves to is what the forecast engine used before.
from app.forecast.forecast_settings import forecast_settings, plan_numbers, is_forecast_key
from app.forecast.engine import DEFAULT_SETTINGS as ENGINE_DEFAULTS

# The spec's own example numbers (Calculators section 3). Not the defaults: only what the calculator
# tests use, to check the arithmetic against the spec's worked example (target 20 days away, lead 20,
# LCL: 41 days short, Air still 25 short).
SPEC_NUMBERS = {"transit_lcl_days": 30, "transit_fcl_days": 30, "transit_air_days": 14, "customs_lcl_days": 0, "customs_fcl_days": 0, "customs_air_days": 0, "fulfillment_days": 3, "delivery_days": 2}

DEFAULT_SETTINGS = {**default_settings(), **plan_numbers(ENGINE_DEFAULTS)}


# Procurement_Settings rows (Setting_Key / Value) over the defaults. A row whose value is not valid
# keeps the default (CP-R6 refuses bad values at save; this only protects the plan from a row written
# some other way). `try_out` = {key: value} on top of what is saved: the "show the effect before
# saving" preview (CP-R4).
async def load_settings(store, try_out: dict | None = None) -> dict:
    s = dict(DEFAULT_SETTINGS)
    try:
        rows = await store.find("Procurement_Settings")
    except Exception:
        rows = []
    settings_set: dict[str, str] = {str(r.get("Setting_Key") or "").strip(): r.get("Value") for r in rows}
    for k, v in (try_out or {}).items():
        settings_set[k] = v
    for key, value in settings_set.items():
        if key not in s or is_forecast_key(key):
            continue
        if isinstance(DEFAULT_SETTINGS[key], str):
            s[key] = str(value if value is not None else "")
        elif not blank(value) and problem_with(key, value) is None:
            s[key] = float(value)
    s.update(plan_numbers(await forecast_settings(store, {k: v for k, v in settings_set.items() if is_forecast_key(k)})))
    return s


# A supplier's own production / consolidation days (Suppliers form), matched by its exact name;
# blank = use the global setting.
def _norm(v) -> str:
    return re.sub(r"\s+", " ", str(v if v is not None else "").strip().lower())


def _names_of(r: dict) -> list[str]:
    name = r.get("Supplier_Name") or {}
    first, last = name.get("first_name"), name.get("last_name")
    out = [first, last, " ".join(x for x in [first, last] if x)]
    return [_norm(x) for x in out if x]


def _aliases_of(r: dict) -> list[str]:
    return [_norm(x) for x in re.split(r"[,;|]", str(r.get("Name_Aliases") or "")) if _norm(x)]


# A supplier is found by its name or one of its listed other names. As a last, careful step a name
# that is the START (whole words) of exactly one supplier's name, or the other way round ("Tony" ->
# "Tony Fan"), is accepted when no other supplier fits: never a part of a word, never two.
# Returns {"row": ..., "how": ...} or None. (Spec INQ-R6: the old text matching must not come back.)
def resolve_supplier(rows: list, name) -> dict | None:
    want = _norm(name)
    if want == "":
        return None
    exact = next((r for r in rows if want in _names_of(r)), None)
    if exact:
        return {"row": exact, "how": "name"}
    alias = next((r for r in rows if want in _aliases_of(r)), None)
    if alias:
        return {"row": alias, "how": "alias"}

    def starts_with(a, b):
        return a == b or a.startswith(b + " ")

    near = [r for r in rows if any(starts_with(n, want) or starts_with(want, n) for n in [*_names_of(r), *_aliases_of(r)])]
    return {"row": near[0], "how": "start of the name"} if len(near) == 1 else None


def supplier_row_from(rows: list, name) -> dict | None:
    resolved = resolve_supplier(rows, name)
    return resolved["row"] if resolved else None


async def supplier_days_from(rows: list, name) -> dict:
    row = supplier_row_from(rows, name)
    if not row:
        return {}
    out = {}
    if to_num(row.get("Default_Production_Days")) > 0:
        out["production_days"] = to_num(row.get("Default_Production_Days"))
    if not blank(row.get("Default_Consolidation_Days")):
        out["consolidation_days"] = to_num(row.get("Default_Consolidation_Days"))
    return out


async def supplier_days(store, name) -> dict:
    try:
        rows = await store.find("Suppliers")
    except Exception:
        rows = []
    return await supplier_days_from(rows, name)


# A supplier's lead time is typed as text ("20", "20 days", "3 weeks", "2-3 weeks", "1 month", "20天"):
# read it as a number of days (spec INQ-R3: it becomes the production days of the feasibility
# calculator). A range takes the larger number. 0 = not understood.
_LEAD_NUM_RE = re.compile(r"\d+(?:\.\d+)?")


def parse_lead_days(v) -> int:
    t = str(v if v is not None else "").lower().replace(",", "")
    nums = _LEAD_NUM_RE.findall(t)
    if not nums:
        return 0
    n = float(nums[-1])
    if re.search(r"week|wk|周|週", t):
        days = n * 7
    elif re.search(r"month|mo\b|月", t):
        days = n * 30
    else:
        days = n
    return math.ceil(days)


MODES = ["Airfreight", "LCL", "FCL"]


# "Air", "Airfreight", "AIR" -> Airfreight; "sea" / blank and anything unknown -> LCL (the slow, safe assumption).
def norm_mode(m) -> str:
    t = str(m if m is not None else "").strip().upper()
    if "AIR" in t:
        return "Airfreight"
    if t == "FCL":
        return "FCL"
    return "LCL"


def transit_days(s: dict, mode) -> float:
    return {"Airfreight": s["transit_air_days"], "FCL": s["transit_fcl_days"], "LCL": s["transit_lcl_days"]}[norm_mode(mode)]


def customs_days(s: dict, mode) -> float:
    return {"Airfreight": s["customs_air_days"], "FCL": s["customs_fcl_days"], "LCL": s["customs_lcl_days"]}.get(norm_mode(mode)) or 0


# shipout to the warehouse door: what an upgrade to air saves is the difference of these
def lead_days(s: dict, mode) -> float:
    return transit_days(s, mode) + customs_days(s, mode)


def _as_date(v):
    return v if isinstance(v, date) else parse_date(v)


# The plan from the PO date: every stage's planned date. Never typed by a person (spec ST-R1).
def planned_chain(s: dict, *, po_date, production_days=None, mode) -> dict | None:
    po = _as_date(po_date)
    if not po:
        return None
    days = to_num(production_days) if to_num(production_days) > 0 else s["production_days"]
    production_start = add_days(po, 1)
    production_end = add_days(production_start, days)
    shipout = add_days(production_end, s["consolidation_days"])
    arrival = add_days(shipout, transit_days(s, mode))
    receive = add_days(arrival, customs_days(s, mode) + s["receiving_days"])
    return {"production_start": production_start, "production_end": production_end, "shipout": shipout, "arrival": arrival, "receive": receive, "production_days": days}


# The forecast: actual dates where they exist, planned where they do not. A stage that has not
# happened cannot be in the past, so each such date is moved to today and the later stages follow it
# ("latest actual or planned arrival", spec DT / forecast table).
# actual = {production_started, production_finished, shipped_out, arrived_port, arrived_warehouse} (dates or yyyy-MM-dd text)
def forecast_chain(s: dict, *, po_date, production_days=None, mode, actual=None, expected=None, today=None) -> dict | None:
    today = today or today_date()
    actual = actual or {}
    expected = expected or {}
    po = _as_date(po_date)
    a = {k: _as_date(v) for k, v in actual.items()}
    days = to_num(production_days) if to_num(production_days) > 0 else s["production_days"]
    if not po and not a.get("production_started") and not a.get("production_finished") and not a.get("shipped_out") and not a.get("arrived_port") and not a.get("arrived_warehouse"):
        return None

    def not_before(d):
        return today if d < today else d

    production_start = a.get("production_started") or (add_days(po, 1) if po else today)
    if not a.get("production_started"):
        production_start = not_before(production_start)
    production_end = a.get("production_finished") or add_days(production_start, days)
    if not a.get("production_finished"):
        production_end = not_before(production_end)
    x = {k: _as_date(v) for k, v in expected.items()}
    shipout = a.get("shipped_out") or x.get("shipout") or add_days(production_end, s["consolidation_days"])
    if not a.get("shipped_out"):
        shipout = not_before(shipout)
    arrival = a.get("arrived_port") or x.get("arrival") or add_days(shipout, transit_days(s, mode))
    if not a.get("arrived_port"):
        arrival = not_before(arrival)
    warehouse = a.get("arrived_warehouse") or None
    pickable = add_days(warehouse or arrival, (0 if warehouse else customs_days(s, mode)) + s["receiving_days"])
    return {
        "production_start": production_start, "production_end": production_end, "shipout": shipout, "arrival": arrival,
        "pickable": today if (not warehouse and pickable < today) else pickable,
    }


# The date the goods must be pickable so the order still reaches the customer on time (Sorting Engine 01, Procurement).
def date_needed(s: dict, target):
    t = _as_date(target)
    return add_days(t, -(s["fulfillment_days"] + s["delivery_days"])) if t else None


# Feasibility of a line (PR and PO gate): can it arrive in time for the promise?
#   feasible    shortfall <= 0 and slack >= proc_watch_slack_days
#   at_risk     shortfall <= 0 but the slack is small
#   impossible  shortfall > 0: also the earliest feasible date and the Air option
def feasibility(s: dict, *, po_date, production_days=None, mode, target) -> dict:
    t = _as_date(target)
    plan = planned_chain(s, po_date=po_date, production_days=production_days, mode=mode)
    if not plan or not t:
        return {"feasibility": None, "reason": "no PO date" if not plan else "no target"}
    feasible_by = add_days(plan["receive"], s["fulfillment_days"] + s["delivery_days"])
    shortfall = day_diff(feasible_by, t)
    slack = -shortfall
    out = {
        "feasibility": "impossible" if shortfall > 0 else ("at_risk" if slack < s["proc_watch_slack_days"] else "feasible"),
        "shortfall_days": shortfall, "slack_days": slack, "feasible_by": ymd(feasible_by),
        "earliest_feasible_date": ymd(feasible_by) if shortfall > 0 else None,
    }
    if shortfall > 0 and norm_mode(mode) != "Airfreight":
        air = planned_chain(s, po_date=po_date, production_days=production_days, mode="Airfreight")
        air_by = add_days(air["receive"], s["fulfillment_days"] + s["delivery_days"])
        air_shortfall = day_diff(air_by, t)
        out["air_saving_days"] = lead_days(s, mode) - lead_days(s, "Airfreight")
        out["air_shortfall_days"] = air_shortfall
        out["air_feasible_by"] = ymd(air_by)
        out["air_option"] = f"Air saves {out['air_saving_days']} days -> feasible" if air_shortfall <= 0 else f"Even by air, earliest is {ymd(air_by)} ({air_shortfall} days short)"
    return out
