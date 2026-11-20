# Exceptions and Replacement Requests of the HomeCartel spec v1.4 (02 Procurement / 06, 05 Shared
# Engines 01 and 04).
#   RR-R3  the RR carries a Target Delivery (the original target if it is still ahead, else today +
#          rr_default_days) and the original SO's Order Date (set by create_rr_main in
#          replacement_requests.py, which uses target_for / order_date_for below)
#   RR-R4  a replacement is the BROKEN category: first in every queue (sorting.py). Here: the RR's
#          own rank and the forecast of its replacement shipment, written after every scoring (rollup_rr)
#   events exception.raised, rr.created, rr.acknowledged, rr.replacement_received (the first one of
#          each stays: T-6)
#   alert  the buyer is told when an RR is not acknowledged within rr_ack_window_days (daily job)
#   RR-R6  the monthly report (custom API get_rr_report): replacements by cause, by fault origin and
#          by supplier
# The widgets cannot write the server fields (Order_Date, Original_Supplier, ...): a widget write to
# them is dropped. Ported from server/modules/procurement/rr-spec.mjs.
#
# rr-spec.mjs imports isReady from receiving.mjs (Task 10, after this task) -- imported lazily inside
# the one function that needs it, the same forward-reference idiom this plan's ship_track.py split
# already uses, rather than reordering the whole task sequence over one small helper.
import re
from datetime import datetime

from app.criteria import zoho_now
from app.deluge import blank, to_num, parse_date, ymd, add_days, day_diff, today_date
from app.procurement.plan import load_settings
from app.procurement.events import log_event
from app.procurement.decisions_core import notify
from app.procurement.suppliers import portal_of
from app.workflows import register

RR = "Replacement_Request"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _ok_body(message: str, data) -> dict:
    return {"code": 3000, "message": message, "data": data}


SERVER_ONLY = ["Order_Date", "Original_Supplier", "Replacement_Received_At", "Rr_Forecast_Pickable", "Rr_Category", "Rr_Queue_Rank", "Rr_Ack_Alert_At"]
DONE = ["Closed", "Completed", "Cancelled"]


# ---------- RR-R3: target and order date ----------
def target_for(original_target, settings: dict, today=None) -> str:
    today = today or today_date()
    t = parse_date(original_target)
    if t and t > today:
        return ymd(t)
    return ymd(add_days(today, to_num(settings.get("rr_default_days")) or 21))


# The original SO's Order Date: the PR's own Order Date, else the Sales Order's creation date.
async def order_date_for(store, *, pr_no=None, so_no=None) -> str:
    if not blank(pr_no):
        matches = await store.find("Purchase_Request1", lambda p: _text(p.get("PR_No")) == _text(pr_no))
        if matches and not blank(matches[0].get("Order_Date")):
            return _text(matches[0]["Order_Date"])[:10]
    if not blank(so_no):
        matches = await store.find("Sales_Order_Fulfillment", lambda s: _text(s.get("SO_No")) == _text(so_no))
        if matches and not blank(matches[0].get("SO_Created_Date")):
            return _text(matches[0]["SO_Created_Date"])[:10]
    return ""


async def original_target_for(store, *, pr_no=None) -> str:
    if blank(pr_no):
        return ""
    matches = await store.find("Purchase_Request1", lambda p: _text(p.get("PR_No")) == _text(pr_no))
    return _text(matches[0].get("Target_Delivery"))[:10] if matches else ""


# ---------- events ----------
async def log_once(store, *, record_type, record, no=None, event, note="", source="system") -> bool:
    have = await store.find("Stage_Events", lambda e: e.get("Record_Type") == record_type and str(e.get("Record_Id")) == str(record["ID"]) and e.get("Event") == event)
    if have:
        return False
    await log_event(store, record_type=record_type, record_id=record["ID"], record_no=no, event=event, occurred_at=zoho_now(), source=source, note=note)
    return True


async def _before_add_rr(args: dict) -> None:
    input_ = args["input"]
    for f in SERVER_ONLY:
        input_.pop(f, None)


async def _before_update_rr(args: dict) -> None:
    input_ = args["input"]
    for f in SERVER_ONLY:
        input_.pop(f, None)


async def _after_add_rr(args: dict) -> None:
    id_, store = args.get("id"), args["store"]
    rr = await store.get_record_by_id(RR, id_, raw=True)
    await log_once(store, record_type="rr", record=rr, no=rr.get("RR_No"), event="rr.created", note=_text(rr.get("RR_Supplier")))


async def _after_update_rr(args: dict) -> None:
    id_, record, previous, store = args.get("id"), args["record"], args.get("previous") or {}, args["store"]
    if _text(record.get("RR_Status")) == "Acknowledged" and _text(previous.get("RR_Status")) != "Acknowledged":
        rr = await store.get_record_by_id(RR, id_, raw=True)
        await log_once(store, record_type="rr", record=rr, no=rr.get("RR_No"), event="rr.acknowledged", note=_text(rr.get("RR_Supplier")))


register(RR, {"beforeAdd": _before_add_rr, "beforeUpdate": _before_update_rr, "afterAdd": _after_add_rr, "afterUpdate": _after_update_rr})


async def _after_add_exception(args: dict) -> None:
    id_, store = args.get("id"), args["store"]
    exc = await store.get_record_by_id("Exceptions", id_, raw=True)
    await log_once(store, record_type="exception", record=exc, no=exc.get("Exception_No"), event="exception.raised", note=_text(exc.get("Source_Module")))


register("Exceptions", {"afterAdd": _after_add_exception})


# The replacement arrived: stamp the RR once every line of a Receiving record that carries its
# number is counted and binned.
async def stamp_replacement_received(store, rr_no) -> None:
    for rr in await store.find(RR, lambda r: _text(r.get("RR_No")) == _text(rr_no)):
        if not blank(rr.get("Replacement_Received_At")):
            continue
        await store.update_record(RR, rr["ID"], {"Replacement_Received_At": zoho_now()}, by_form=True)
        await log_once(store, record_type="rr", record=rr, no=rr.get("RR_No"), event="rr.replacement_received")


async def _on_receiving(args: dict) -> None:
    from app.procurement.receiving import is_ready
    id_, store = args.get("id"), args["store"]
    rcv = await store.get_record_by_id("Receiving", id_, raw=True)
    for ln in rcv.get("Receiving_Line_Items") or []:
        if not blank(ln.get("RR_No")) and is_ready(ln):
            await stamp_replacement_received(store, ln["RR_No"])


register("Receiving", {"afterAdd": _on_receiving, "afterUpdate": _on_receiving})


# ---------- RR-R4: the RR's own rank (Broken is first), and the forecast of its replacement shipment ----------
# shipments = the shipments as just scored. An open RR is Broken; they are ranked by the original
# Order Date (oldest first), then target.
async def rollup_rr(store, shipments=None) -> None:
    ships = shipments if shipments is not None else await store.find("Shipments")
    open_rrs = [r for r in await store.find(RR) if _text(r.get("RR_Status")) not in DONE]
    order = sorted(open_rrs, key=lambda r: (_text(r.get("Order_Date")) or "9999", _text(r.get("Target_Delivery")) or "9999", _text(r.get("RR_No"))))
    rank_of = {str(r["ID"]): i + 1 for i, r in enumerate(order)}
    for r in await store.find(RR):
        is_open = _text(r.get("RR_Status")) not in DONE
        cloned = _text(r.get("Cloned_Shipment_No"))
        ship = next((s for s in ships if _text(s.get("Shipment_No")) == cloned), None) if cloned != "" else None
        want = {"Rr_Category": "broken" if is_open else "", "Rr_Queue_Rank": rank_of.get(str(r["ID"])) if is_open else "", "Rr_Forecast_Pickable": _text(ship.get("Forecast_Pickable"))[:10] if ship else ""}
        diff = {k: v for k, v in want.items() if _text(r.get(k)) != _text(v)}
        if diff:
            await store.update_record(RR, r["ID"], diff, by_form=True)


# ---------- daily: an RR the supplier has not acknowledged ----------
async def run_rr_daily(store, *, now=None) -> dict:
    now = now or datetime.now()
    settings = await load_settings(store)
    days = to_num(settings.get("rr_ack_window_days")) or 1
    today = today_date()
    alerted = 0
    for rr in await store.find(RR):
        if _text(rr.get("RR_Status")) != "Open" or not blank(rr.get("Rr_Ack_Alert_At")) or blank(rr.get("RR_Date")):
            continue
        made = parse_date(_text(rr.get("RR_Date"))[:10])
        if not made or day_diff(today, made) < days:
            continue
        await notify(store, settings, ship={"Shipment_No": rr.get("RR_No"), "ID": rr.get("ID")}, type="RR Not Acknowledged",
                     message=f"{rr.get('RR_No')} ({_text(rr.get('RR_Supplier')) or 'no supplier'}) has not been acknowledged after {int(days)} day(s). Follow it up.", page="Replacement_Request1")
        await store.update_record(RR, rr["ID"], {"Rr_Ack_Alert_At": zoho_now(now)}, by_form=True)
        alerted += 1
    return {"alerted": alerted}


# ---------- RR-R6: the monthly report ----------
_CAUSE_OF = {"Receiving Damage": "Damage", "Receiving Missing": "Missing part", "QC Failure": "Wrong spec / QC failure", "Management Decision": "Management decision"}


def _count(rows, key_fn) -> list:
    m: dict = {}
    for r in rows:
        k = key_fn(r) or "unknown"
        m[k] = m.get(k, 0) + 1
    return sorted(({"name": name, "count": n} for name, n in m.items()), key=lambda x: (-x["count"], x["name"]))


async def get_rr_report(payload, store) -> dict:
    now = datetime.now()
    month_payload = _text((payload or {}).get("month"))
    month = month_payload if re.match(r"^\d{4}-\d{2}$", month_payload) else f"{now.year:04d}-{now.month:02d}"
    rrs = [r for r in await store.find(RR) if _text(r.get("RR_Date")).startswith(month)]
    try:
        exceptions = await store.find("Exceptions")
    except Exception:
        exceptions = []
    exc_by_no = {_text(e.get("Exception_No")): e for e in exceptions}

    def supplier_name(r):
        portal = portal_of(r.get("RR_Supplier"))
        return portal["name"] if portal else (_text(r.get("RR_Supplier")).strip() or "unknown")

    try:
        rework_jobs = len([e for e in await store.find("Exception_Control1") if _text(e.get("Added_Time")).startswith(month) and (_text(e.get("Rework_Status")) != "" or re.search(r"true", _text(e.get("Rework")), re.IGNORECASE))])
    except Exception:
        rework_jobs = 0
    try:
        packages = len([p for p in await store.find("Package_Shipments") if _text(p.get("Added_Time")).startswith(month)])
    except Exception:
        packages = 0

    return _ok_body("RR report.", {
        "month": month, "total": len(rrs),
        "by_cause": _count(rrs, lambda r: _CAUSE_OF.get(_text(r.get("Source_Type")), _text(r.get("Source_Type")))),
        "by_fault_origin": _count(rrs, lambda r: _text((exc_by_no.get(_text(r.get("Source_Exception_No"))) or {}).get("Fault_Origin"))),
        "by_supplier": _count(rrs, supplier_name),
        "changed_supplier": len([r for r in rrs if _text(r.get("Original_Supplier")) != "" and _text(r.get("Original_Supplier")) != _text(r.get("RR_Supplier"))]),
        "rework": {"replacements": len(rrs), "rework_jobs": rework_jobs, "packages": packages, "rate": (round((len(rrs) + rework_jobs) / packages * 1000) / 10 if packages else None)},
    })
