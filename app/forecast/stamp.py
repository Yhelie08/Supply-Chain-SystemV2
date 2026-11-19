# fc_stamp_by_so_no, ported from zoho-export/parsed/functions/fcStampBySoNo.dg via
# server/forecast/stamp.mjs: works out the forecast of ONE sales order and stamps
# Forecast_Delivery, Forecast_Window and Forecast_Status on the rows that belong to it (up to 9
# forms). The ladder itself is in engine.py (pure); this file gathers the facts and writes the
# result. What it writes: only a value that differs (the write itself can fire the same workflow
# again, and the second pass finds nothing to change, which is what stops the loop).
#
# Quirks kept ("mirrors Zoho"):
#  - Blank text and the word "null": a blank PR number is "null", which no PR has, so rows with
#    another PR number are left out of the stamping; a blank shipment mode is "null" too, so the
#    PR's/shipment's mode is not used as a fallback. NULL_TEXT turns this off in one place.
#  - Only the FIRST Sales_Order_Fulfillment row of the SO is read and stamped.
import re
from datetime import date

from app.deluge import parse_date, today_date
from app.forecast.engine import compute_forecast
from app.forecast.forecast_settings import forecast_settings

NULL_TEXT = True


def _blank(v) -> bool:
    return v is None or v == ""


def txt(v) -> str:
    return ("null" if NULL_TEXT else "") if _blank(v) else str(v)


_MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
_DMY_RE = re.compile(r"^(\d{1,2})-([A-Za-z]{3})-(\d{4})")


def to_date(v) -> date | None:
    if isinstance(v, date):
        return v
    s = str(v or "").strip()
    iso = parse_date(s)
    if iso:
        return iso
    m = _DMY_RE.match(s)
    if m:
        mo = _MONTH_ABBR.index(m.group(2).lower()) if m.group(2).lower() in _MONTH_ABBR else -1
        if mo >= 0:
            return date(int(m.group(3)), mo + 1, int(m.group(1)))
    return None


def _day(v) -> str:
    d = to_date(v)
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}" if d else ""


_AT_PREP = ["For Delivery", "Order Readiness", "Picking", "Pack", "Quality Checking", "Crate"]


def _same_day(a, b) -> bool:
    return _day(a) == _day(b)


async def _stamp_row(store, form: str, row: dict, f: dict) -> None:
    changes = {}
    if not _same_day(row.get("Forecast_Delivery"), f["delivery"]):
        changes["Forecast_Delivery"] = f["delivery"]
    if row.get("Forecast_Window") != f["window"]:
        changes["Forecast_Window"] = f["window"]
    if row.get("Forecast_Status") != f["status"]:
        changes["Forecast_Status"] = f["status"]
    if changes:
        await store.update_record(form, row["ID"], changes, by_form=True)


async def fc_stamp_by_so_no(store, so_no, *, today: date | None = None) -> str:
    today = today or today_date()
    if _blank(so_no) or str(so_no) == "null":
        return "walang SO number na ipinasa"
    so_no = str(so_no)

    settings = await forecast_settings(store)

    sofs = await store.find("Sales_Order_Fulfillment", lambda r: r.get("SO_No") == so_no)
    sof = sofs[0] if sofs else None
    pr_no = stage = otype = mode_val = ""
    client_target = None
    sof_created = None
    if sof:
        pr_no, stage, otype, mode_val = txt(sof.get("PR_No")), txt(sof.get("Fulfillment_Stage")), txt(sof.get("order_type")).upper(), txt(sof.get("Shipment_Mode"))
        client_target = None if _blank(sof.get("target_delivery_date")) else to_date(sof.get("target_delivery_date"))
        sof_created = None if _blank(sof.get("SO_Created_Date")) else to_date(sof.get("SO_Created_Date"))

    gate_recs = await store.find("Sales_Order_Readiness_Gate", lambda r: r.get("sales_order_number") == so_no)
    pick_recs = await store.find("Pick1", lambda r: r.get("SO") == so_no)
    qc_recs = await store.find("Checker_Checklist", lambda r: r.get("SO") == so_no)
    oa_recs = await store.find("Order_Aggregation1", lambda r: r.get("SO") == so_no)
    crate_recs = await store.find("Crate_Checklist", lambda r: r.get("SO") == so_no)

    if not sof and gate_recs:
        g0 = gate_recs[0]
        otype = txt(g0.get("Order_Type")).upper()
        if not _blank(g0.get("Target_Delivery_Date")):
            client_target = to_date(g0.get("Target_Delivery_Date"))
        pr_no = txt(g0.get("pr_number"))
        stage = "Order Readiness"
    if not sof and stage == "":
        po0s = await store.find("Pre_Order_FF", lambda r: r.get("SO") == so_no)
        if po0s:
            po0 = po0s[0]
            otype = txt(po0.get("Order_Type")).upper()
            if not _blank(po0.get("Target_Delivery")):
                client_target = to_date(po0.get("Target_Delivery"))
            pr_no = txt(po0.get("PR"))
    stock_on_hand = "PRE ORDER" not in otype

    pr_added = sourcing = None
    sup_lead = 0
    sourcing = ""
    if pr_no != "":
        prs = await store.find("Purchase_Request1", lambda r: r.get("PR_No") == pr_no)
        if prs:
            pr = prs[0]
            if not _blank(pr.get("Added_Time")):
                pr_added = to_date(pr.get("Added_Time"))
            sourcing = txt(pr.get("Sourcing_Type"))
            if not _blank(pr.get("Required_Days_Lead")):
                try:
                    sup_lead = int(float(pr.get("Required_Days_Lead")))
                except (TypeError, ValueError):
                    sup_lead = 0
            if _blank(mode_val):
                mode_val = txt(pr.get("Shipment_Mode"))

    def _for_pr(r: dict, field: str) -> bool:
        return not (pr_no != "" and not _blank(r.get(field)) and r.get(field) != pr_no)

    prep_start = None
    row_added = None

    def _earlier(cur, d):
        return d if d and (not cur or d < cur) else cur

    for g in gate_recs:
        if _for_pr(g, "pr_number") and not _blank(g.get("Added_Time")):
            a = to_date(g.get("Added_Time"))
            if a:
                prep_start = _earlier(prep_start, a)
                row_added = _earlier(row_added, a)
    for p in pick_recs:
        if _for_pr(p, "PR_if_any") and not _blank(p.get("Added_Time")):
            prep_start = _earlier(prep_start, to_date(p.get("Added_Time")))
    for q in qc_recs:
        if _for_pr(q, "PR") and not _blank(q.get("Added_Time")):
            prep_start = _earlier(prep_start, to_date(q.get("Added_Time")))
    for c in crate_recs:
        if _for_pr(c, "PR_if_any") and not _blank(c.get("Added_Time")):
            prep_start = _earlier(prep_start, to_date(c.get("Added_Time")))

    if not pr_added:
        pr_added = sof_created or row_added or today

    date_shipped = None
    ship_status = ""
    at_prep_stage = stage in _AT_PREP
    need_ship = not (settings["reAnchor"] and at_prep_stage) and not stock_on_hand
    if pr_no != "" and need_ship:
        for sh in await store.find("Shipments"):
            for row in sh.get("Supplier_Shipment_Details") or []:
                if txt(row.get("PR_No")) == pr_no:
                    ship_status = txt(sh.get("Shipment_Status"))
                    if not _blank(row.get("Date_Shipped")):
                        date_shipped = to_date(row.get("Date_Shipped"))
                    if _blank(mode_val):
                        mode_val = txt(row.get("Shipment_Mode"))

    f = compute_forecast({
        "today": today, "settings": settings, "stage": stage, "stockOnHand": stock_on_hand, "modeVal": mode_val,
        "sourcing": sourcing, "supLead": sup_lead, "prAdded": pr_added, "prepStart": prep_start, "prepFound": bool(prep_start),
        "dateShipped": date_shipped, "shipStatus": ship_status, "clientTarget": client_target,
    })
    if f["skip"]:
        return f"{so_no} — walang mapagsimulang petsa, hindi nagtatak"

    stamped = 0

    async def _stamp(form: str, rows: list) -> None:
        nonlocal stamped
        for r in rows:
            await _stamp_row(store, form, r, f)
            stamped += 1

    if sof:
        await _stamp("Sales_Order_Fulfillment", [sof])
    if pr_no != "":
        await _stamp("Purchase_Request1", await store.find("Purchase_Request1", lambda r: r.get("PR_No") == pr_no))
    await _stamp("Sales_Order_Readiness_Gate", [g for g in gate_recs if _for_pr(g, "pr_number")])
    await _stamp("Pre_Order_FF", await store.find("Pre_Order_FF", lambda r: r.get("SO") == so_no))
    await _stamp("Pick1", [p for p in pick_recs if _for_pr(p, "PR_if_any")])
    await _stamp("Checker_Checklist", [q for q in qc_recs if _for_pr(q, "PR")])
    await _stamp("Order_Aggregation1", [o for o in oa_recs if _for_pr(o, "PR")])
    await _stamp("Crate_Checklist", [c for c in crate_recs if _for_pr(c, "PR_if_any")])
    await _stamp("Receiving", await store.find("Receiving", lambda r: r.get("SO_No") == so_no))

    mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    y, m, dd = f["delivery"].split("-")
    return f"{so_no} -> {mon[int(m) - 1]} {dd}, {y} | {f['window']} | {f['status']} | {stamped} record"
