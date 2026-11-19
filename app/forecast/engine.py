# The forecast ladder, ported from server/forecast/engine.mjs (itself from
# zoho-export/parsed/functions/fcStampBySoNo.dg sections 1, 5, 6), as one pure function. No
# database here: callers (stamp.py for one SO, schedule.py for all of them) gather the facts and
# pass them in, so the two ways of computing a forecast cannot drift apart.
#
# Quirks kept ("mirrors Zoho"):
#  - Picking, Pack, Quality Checking and Crate count as prep stages even when re-anchoring is off;
#    only "Order Readiness" and "For Delivery" need the switch.
#  - The middle date is earliest + round(span / 2), rounded half up.
#  - A past-due estimate clamps its dates to today and says "lampas na sa tantiya" in the window.
from datetime import date

from app.deluge import add_days, day_diff

DEFAULT_SETTINGS = {
    "airTMin": 5, "airTMax": 7, "airCMin": 2, "airCMax": 3,
    "lclTMin": 35, "lclTMax": 60, "lclCMin": 7, "lclCMax": 10,
    "fclTMin": 35, "fclTMax": 60, "fclCMin": 7, "fclCMax": 10,
    "locTMin": 0, "locTMax": 0, "locCMin": 0, "locCMax": 0,
    "prepMin": 7, "prepMax": 7, "delMin": 0, "delMax": 0,
    "reAnchor": True, "addSupLead": False,
}


def _blank(v) -> bool:
    return v is None or v == ""


def _long(v, fallback):
    if _blank(v):
        return fallback
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return fallback


def settings_from(record: dict | None) -> dict:
    s = dict(DEFAULT_SETTINGS)
    if record is None:
        return s
    d = DEFAULT_SETTINGS
    s["airTMin"] = _long(record.get("Air_Transit_Min"), d["airTMin"])
    s["airTMax"] = _long(record.get("Air_Transit_Max"), d["airTMax"])
    s["airCMin"] = _long(record.get("Air_Customs_to_WH_Min"), d["airCMin"])
    s["airCMax"] = _long(record.get("Air_Customs_to_WH_Max"), d["airCMax"])
    s["lclTMin"] = _long(record.get("LCL_Transit_Min"), d["lclTMin"])
    s["lclTMax"] = _long(record.get("LCL_Transit_Max"), d["lclTMax"])
    s["lclCMin"] = _long(record.get("LCL_Customs_to_WH_Min"), d["lclCMin"])
    s["lclCMax"] = _long(record.get("LCL_Customs_to_WH_Max"), d["lclCMax"])
    s["fclTMin"] = _long(record.get("FCL_Transit_Min"), d["fclTMin"])
    s["fclTMax"] = _long(record.get("FCL_Transit_Max"), d["fclTMax"])
    s["fclCMin"] = _long(record.get("FCL_Customs_to_WH_Min"), d["fclCMin"])
    s["fclCMax"] = _long(record.get("FCL_Customs_to_WH_Max"), d["fclCMax"])
    if not _blank(record.get("Local_Transit_Days")):
        s["locTMin"] = s["locTMax"] = _long(record.get("Local_Transit_Days"), 0)
    if not _blank(record.get("Local_Customs_Days")):
        s["locCMin"] = s["locCMax"] = _long(record.get("Local_Customs_Days"), 0)
    if not _blank(record.get("Prep_Days_Thru_QC")):
        s["prepMin"] = s["prepMax"] = _long(record.get("Prep_Days_Thru_QC"), d["prepMin"])
    if not _blank(record.get("Delivery_Days")):
        s["delMin"] = s["delMax"] = _long(record.get("Delivery_Days"), 0)
    s["reAnchor"] = str(record.get("Re_anchor_on_Latest_Real_Event") or "").lower() == "true"
    s["addSupLead"] = str(record.get("Include_Supplier_Lead_Time") or "").lower() == "true"
    return s


_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _mmm_dd(d: date) -> str:
    return f"{_MONTHS[d.month - 1]} {d.day:02d}"


def _ymd(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}"


def _gap(a: date, b: date) -> int:
    return abs(day_diff(b, a))


def bucket_of(s: dict, sourcing, mode_val) -> dict:
    mode_key = str(mode_val or "").upper()
    src_key = str(sourcing or "").upper()
    if src_key == "LOCAL":
        return {"tMin": s["locTMin"], "tMax": s["locTMax"], "cMin": s["locCMin"], "cMax": s["locCMax"], "bucket": "Local"}
    if "AIR" in mode_key:
        return {"tMin": s["airTMin"], "tMax": s["airTMax"], "cMin": s["airCMin"], "cMax": s["airCMax"], "bucket": "Air"}
    if mode_key == "FCL":
        return {"tMin": s["fclTMin"], "tMax": s["fclTMax"], "cMin": s["fclCMin"], "cMax": s["fclCMax"], "bucket": "FCL"}
    return {"tMin": s["lclTMin"], "tMax": s["lclTMax"], "cMin": s["lclCMin"], "cMax": s["lclCMax"], "bucket": "LCL" if mode_key == "LCL" else "LCL?"}


def compute_forecast(i: dict) -> dict:
    today, s = i["today"], i["settings"]
    b = bucket_of(s, i.get("sourcing"), i.get("modeVal"))
    t_min, t_max, c_min, c_max, bucket = b["tMin"], b["tMax"], b["cMin"], b["cMax"], b["bucket"]

    anchor = today
    anchor_found = False
    sum_min = sum_max = 0
    position = ""
    stage = i.get("stage") or ""
    prep_stages = ["Picking", "Pack", "Quality Checking", "Crate"]

    if s["reAnchor"] and stage == "For Delivery":
        anchor_found = True
        sum_min, sum_max = s["delMin"], s["delMax"]
        position = "Ready"
    elif (s["reAnchor"] and stage == "Order Readiness") or stage in prep_stages:
        anchor_found = True
        used = _gap(i["prepStart"], today) if i.get("prepFound") and i.get("prepStart") else 0
        left_min = max(0, s["prepMin"] - used)
        left_max = max(0, s["prepMax"] - used)
        sum_min, sum_max = left_min + s["delMin"], left_max + s["delMax"]
        position = stage
    elif i.get("stockOnHand"):
        anchor_found = True
        sum_min, sum_max = s["prepMin"] + s["delMin"], s["prepMax"] + s["delMax"]
        position = "Stock on hand"
    elif s["reAnchor"] and i.get("shipStatus") == "Delivered":
        anchor_found = True
        sum_min, sum_max = s["prepMin"] + s["delMin"], s["prepMax"] + s["delMax"]
        position = "At WH"
    elif s["reAnchor"] and i.get("dateShipped"):
        anchor = i["dateShipped"]
        anchor_found = True
        sum_min = t_min + c_min + s["prepMin"] + s["delMin"]
        sum_max = t_max + c_max + s["prepMax"] + s["delMax"]
        position = "In transit"
    else:
        if i.get("prAdded"):
            anchor = i["prAdded"]
            anchor_found = True
        sum_min = t_min + c_min + s["prepMin"] + s["delMin"]
        sum_max = t_max + c_max + s["prepMax"] + s["delMax"]
        if s["addSupLead"]:
            sum_min += int(i.get("supLead") or 0)
            sum_max += int(i.get("supLead") or 0)
        position = "Procurement"

    if not anchor_found:
        return {"skip": True}

    return finish({
        "today": today, "anchor": anchor, "sumMin": sum_min, "sumMax": sum_max, "bucket": bucket,
        "position": position, "clientTarget": i.get("clientTarget"), "variance": True,
    })


def finish(i: dict) -> dict:
    today, anchor, sum_min, sum_max, bucket, position = i["today"], i["anchor"], i["sumMin"], i["sumMax"], i["bucket"], i["position"]
    earliest = add_days(anchor, sum_min)
    latest = add_days(anchor, sum_max)
    past_its = latest < today
    if earliest < today:
        earliest = today
    if latest < today:
        latest = today
    span = _gap(earliest, latest)
    fc_date = add_days(earliest, round(span / 2))
    window = f"{_mmm_dd(earliest)} - {_mmm_dd(latest)}, {latest.year} | {bucket} | {position}"
    if past_its:
        window += " | lampas na sa tantiya"

    target = i.get("clientTarget")
    if not target:
        status = "No Client Date"
    elif today > target:
        status = "Overdue"
    elif latest <= target:
        status = "On Track"
    elif earliest <= target:
        status = "At Risk"
    else:
        status = "Will Miss"
    if target and i.get("variance"):
        var_days = _gap(target, fc_date)
        if fc_date < target:
            var_days = -var_days
        if var_days > 0:
            window += f" | +{var_days}d vs client"
        elif var_days < 0:
            window += f" | {-var_days}d early"
        else:
            window += " | sakto sa client"
    return {
        "skip": False, "delivery": _ymd(fc_date), "window": window, "status": status,
        "earliest": _ymd(earliest), "latest": _ymd(latest), "position": position, "bucket": bucket,
    }
