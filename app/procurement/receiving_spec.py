# Receiving, from the HomeCartel spec v1.4 (02 Procurement / 05 Receiving, 05 Shared Engines 01, 04, 05):
#   the four events as SERVER stamps: arrived (gate log, or "before the first count", T-5), counted
#   (the first saved quantity), binned (a bin location is written), available (counted in full AND
#   binned = pickable). "Received" now means pickable (D12, RCV-R4).
#   RCV-R3  an exception found at receiving records where it was found and who is at fault
#           (supplier / transit / unknown)
#   RCV-R6  silence alerts: arrived -> counted, counted -> binned, binned -> available
#   RCV-R7  received less than ordered -> the suggested action "Raise a replacement request" (and
#           the buyer is told once)
#   the Arrivals list: expected this week + arrived but not worked, oldest Sales Order first (SE-1..5)
# Not here: the Purchase Receive in Zoho Books for the quantity of each save (RCV-R1, RCV-R2): the
# Books calls are on hold. Ported from server/modules/procurement/receiving-spec.mjs.
import json
from datetime import datetime

from app.criteria import zoho_now
from app.deluge import add_days, blank, day_diff, parse_date, to_num, today_date, ymd
from app.procurement.decisions_core import notify, parse_zoho
from app.procurement.events import log_event, occurred_from, parse_when
from app.procurement.plan import load_settings
from app.procurement.receiving import is_binned, is_ready
from app.procurement.ship_track import apply_shipment_event
from app.workflows import register

RCV = "Receiving"
_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _n(v) -> float:
    return 0.0 if blank(v) else to_num(v)


def _to_day(v):
    w = parse_when(v)
    if w:
        return w["date"].date()
    return parse_date(v)


def _dm(d) -> str:
    return f"{d.day} {_MON[d.month - 1]}"


# Root cause of a damage / missing row -> who is at fault (RCV-R3)
FAULT_OF = {
    "Production Damage": "supplier", "Different product inside the box vs label": "supplier", "Wrong Item Sent": "supplier", "Wrong Quantity": "supplier",
    "Missing from Shipment": "supplier", "Late Delivery": "supplier", "Shipping Damage": "transit",
}

SERVER_ONLY = ["Order_Date", "Arrived_At", "Counted_At", "Binned_At", "Available_At", "Rcv_State", "Days_Waiting", "Queue_Rank", "Priority_Reason", "Suggested_Action", "Line_Stamps", "Rcv_Forecast_Pickable"]


def _line_key(l: dict) -> str:
    return f"{_text(l.get('PR_No'))}|{_text(l.get('SKU'))}"


def _counted(l: dict) -> bool:
    return _n(l.get("Accepted_Qty")) + _n(l.get("Damage_Qty")) + _n(l.get("Missing_Qty")) > 0


def _fully_counted(l: dict) -> bool:
    return _n(l.get("Expected_Qty")) > 0 and _n(l.get("Accepted_Qty")) + _n(l.get("Damage_Qty")) + _n(l.get("Missing_Qty")) >= _n(l.get("Expected_Qty"))


_pending: dict = {}  # receiving id -> events to write after the save


# ---------- before the save: the stamps ----------
async def _before_save(args: dict) -> None:
    input_, previous, id_ = args["input"], args.get("previous"), args.get("id")
    arrived_report = input_.get("Report_Arrived_On")
    for f in SERVER_ONLY:
        input_.pop(f, None)
    input_["Report_Arrived_On"] = ""
    rec = {**(previous or {}), **input_}
    lines = rec.get("Receiving_Line_Items") or []
    try:
        was = json.loads((previous or {}).get("Line_Stamps") or "{}")
    except (TypeError, ValueError):
        was = {}
    stamps = dict(was)
    now = zoho_now()
    events: list = []

    def keep(v) -> bool:
        return _text(v) != ""

    # arrived: the gate log if a person gave it; else it is derived "before the first count" (T-5):
    # the exact time is not known
    arrived_at = _text((previous or {}).get("Arrived_At"))
    if not blank(arrived_report):
        o = occurred_from(arrived_report)
        if not arrived_at:
            arrived_at = o["text"]
            input_["Arrived_At"] = o["text"]
            events.append({"event": "receiving.arrived", "occurred_at": o["text"], "bound": "exact", "source": "user"})
    first_count = False
    for l in lines:
        k = _line_key(l)
        s = stamps[k] = dict(stamps.get(k) or {})
        if not keep(s.get("counted_at")) and _counted(l):
            s["counted_at"] = now
            first_count = True
        if not keep(s.get("binned_at")) and is_binned(l):
            s["binned_at"] = now
        if not keep(s.get("available_at")) and is_ready(l):
            s["available_at"] = now
    if not arrived_at and first_count:
        arrived_at = now
        input_["Arrived_At"] = now
        events.append({"event": "receiving.arrived", "occurred_at": now, "bound": "before", "source": "system", "note": "before the first count"})

    def all_(field: str) -> bool:
        return len(lines) > 0 and all(keep((stamps.get(_line_key(l)) or {}).get(field)) for l in lines)

    def any_(field: str) -> bool:
        return any(keep((stamps.get(_line_key(l)) or {}).get(field)) for l in lines)

    if not _text((previous or {}).get("Counted_At")) and any_("counted_at"):
        input_["Counted_At"] = now
        events.append({"event": "receiving.counted", "occurred_at": now, "bound": "exact", "source": "user"})
    if not _text((previous or {}).get("Binned_At")) and all_("binned_at"):
        input_["Binned_At"] = now
        events.append({"event": "receiving.binned", "occurred_at": now, "bound": "exact", "source": "user"})
    if not _text((previous or {}).get("Available_At")) and all_("available_at"):
        input_["Available_At"] = now
        events.append({"event": "receiving.available", "occurred_at": now, "bound": "exact", "source": "system"})
    input_["Line_Stamps"] = json.dumps(stamps)

    # RCV-R7: every line counted and something short or damaged -> suggest a replacement request
    short = len(lines) > 0 and all(_fully_counted(l) for l in lines) and any(_n(l.get("Missing_Qty")) > 0 or _n(l.get("Damage_Qty")) > 0 or _n(l.get("Accepted_Qty")) < _n(l.get("Expected_Qty")) for l in lines)
    input_["Suggested_Action"] = "Raise a replacement request: received less than ordered (shortage or damage)" if short else ""
    _pending[str(id_) if id_ else "new"] = events


# ---------- after the save ----------
async def _after_save(args: dict) -> None:
    id_, record, previous, store, user = args.get("id"), args["record"], args.get("previous"), args["store"], args.get("user", "")
    events = _pending.pop(str(id_), _pending.pop("new", []))
    for e in events:
        await log_event(store, record_type="receiving", record_id=id_, record_no=record.get("Receive_No1"), event=e["event"], occurred_at=e["occurred_at"], bound=e["bound"], source=e["source"], actor=user or "", note=e.get("note", ""))
    settings = await load_settings(store)

    # RCV-R3: the exceptions of this receiving: found at receiving, fault origin from the root cause, the quantity
    receive_no = _text(record.get("Receive_No1"))
    if receive_no != "":
        for exc in await store.find("Exceptions", lambda e: _text(e.get("Receive_No")) == receive_no):
            line_sku = str(exc.get("Exception_Line_Key") or "").split("||")
            line_sku = line_sku[1] if len(line_sku) > 1 else ""
            rows = [d for d in (record.get("Damage_Missing_Details") or []) if _text(d.get("SKU")) == line_sku or _text(d.get("PR_No")) == _text(exc.get("Receiving_Line_ID"))]
            origins = [FAULT_OF[_text(d.get("Root_Cause_Category"))] for d in rows if FAULT_OF.get(_text(d.get("Root_Cause_Category")))]
            patch = {"Found_Stage": "receiving", "Affected_Qty": sum((1 if blank(d.get("Qty")) else _n(d.get("Qty"))) for d in rows)}
            if blank(exc.get("Fault_Origin")):
                patch["Fault_Origin"] = origins[0] if origins else "unknown"
            if blank(exc.get("Caused_Stage")):
                patch["Caused_Stage"] = patch.get("Fault_Origin") or exc.get("Fault_Origin") or "unknown"
            await store.update_record("Exceptions", exc["ID"], patch, by_form=True)
            if not await store.find("Stage_Events", lambda e: e.get("Record_Type") == "exception" and str(e.get("Record_Id")) == str(exc["ID"])):
                await log_event(store, record_type="exception", record_id=exc["ID"], record_no=exc.get("Exception_No"), event="exception.raised", occurred_at=zoho_now(), source="system", note=f"found at receiving {receive_no}")

    # the shipment is received when every line is pickable
    ship_field = record.get("Shipments")
    ship_id = _text(ship_field.get("ID") if isinstance(ship_field, dict) else ship_field)
    if ship_id and _text(record.get("Receive_Status")) == "Received" and _text((previous or {}).get("Receive_Status")) != "Received":
        try:
            await apply_shipment_event(store, ship_id, "received", source="system", note="every line counted and binned")
        except Exception as e:
            print(f"[receiving] received event {e}")
    if _text(record.get("Suggested_Action")) != "" and _text((previous or {}).get("Suggested_Action")) == "":
        await notify(store, settings, ship={"Shipment_No": record.get("Receive_No1"), "ID": id_}, type="Receiving Shortage", message=f"{record.get('Receive_No1')}: received less than ordered. Raise a replacement request.")
    await rescore_receivings(store)


register(RCV, {"beforeAdd": _before_save, "beforeUpdate": _before_save, "afterAdd": _after_save, "afterUpdate": _after_save})


# Exceptions: where it was found is the server's; when it was resolved is stamped, never typed (T-2).
async def _exc_before_add(args: dict) -> None:
    input_ = args["input"]
    input_.pop("Found_Stage", None)
    input_.pop("Resolved_At", None)


async def _exc_before_update(args: dict) -> None:
    input_, previous = args["input"], args.get("previous") or {}
    input_.pop("Found_Stage", None)
    input_.pop("Resolved_At", None)
    if _text(input_.get("Exception_Status")) == "Resolved" and _text(previous.get("Exception_Status")) != "Resolved" and blank(previous.get("Resolved_At")):
        input_["Resolved_At"] = zoho_now()


async def _exc_after_update(args: dict) -> None:
    id_, record, previous, store, user = args.get("id"), args["record"], args.get("previous") or {}, args["store"], args.get("user", "")
    if _text(record.get("Exception_Status")) == "Resolved" and _text(previous.get("Exception_Status")) != "Resolved":
        await log_event(store, record_type="exception", record_id=id_, record_no=record.get("Exception_No"), event="exception.resolved", occurred_at=zoho_now(), source="user", actor=user or "")


register("Exceptions", {"beforeAdd": _exc_before_add, "beforeUpdate": _exc_before_update, "afterUpdate": _exc_after_update})


# ---------- the Arrivals list (the sorting engine for Receiving) ----------
_STATE_RANK = {"arrived": 0, "counted": 1, "binned": 2, "expected": 3}


async def rescore_receivings(store, *, today=None) -> dict:
    today = today or today_date()
    open_rows = await store.find(RCV, lambda r: _text(r.get("Available_At")) == "" or _text(r.get("Rcv_State")) != "available")
    ships = {str(s["ID"]): s for s in await store.find("Shipments")}
    rows = []
    for r in open_rows:
        lines = r.get("Receiving_Line_Items") or []
        ship_field = r.get("Shipments")
        ship = ships.get(_text(ship_field.get("ID") if isinstance(ship_field, dict) else ship_field))
        if _text(r.get("Available_At")):
            state = "available"
        elif _text(r.get("Binned_At")):
            state = "binned"
        elif _text(r.get("Counted_At")):
            state = "counted"
        elif _text(r.get("Arrived_At")) or (ship and (_text(ship.get("Arrived_Warehouse_At")) or _text(ship.get("Stage")) == "arrived_warehouse")):
            state = "arrived"
        else:
            state = "expected"
        if state == "binned" and lines and all(is_ready(l) for l in lines):
            state = "available"
        since_v = r.get("Counted_At") if state == "counted" else (r.get("Binned_At") if state == "binned" else (_text(r.get("Arrived_At")) or (ship.get("Arrived_Warehouse_At") if ship else "")))
        since = _to_day(since_v)
        waiting = max(0, day_diff(today, since)) if since else None
        order = None
        pr_nos = [x for x in (_text(l.get("PR_No")) for l in lines) if x]
        if pr_nos:
            for p in await store.find("Purchase_Request1", lambda x: _text(x.get("PR_No")) in pr_nos):
                d = _to_day(p.get("Order_Date"))
                if d and (not order or d < order):
                    order = d
        if not order and ship and _text(ship.get("Order_Date")):
            order = _to_day(ship.get("Order_Date"))
        planned = _to_day((ship.get("Receive_Planned") or ship.get("Arrival_Planned")) if ship else None)
        forecast = _text(ship.get("Forecast_Pickable"))[:10] if ship else ""
        rows.append({"r": r, "state": state, "waiting": waiting, "order": order, "planned": planned, "forecast": forecast})
    live = [x for x in rows if x["state"] != "available"]

    def _natural(s: str):
        import re
        return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", str(s))]

    ordered = sorted(live, key=lambda x: (_STATE_RANK[x["state"]], x["order"] or datetime.max.date(), _natural(x["r"].get("Receive_No1", ""))))
    rank = {str(x["r"]["ID"]): i + 1 for i, x in enumerate(ordered)}
    changed = 0
    for x in rows:
        r = x["r"]
        reason_parts = [f"SO dated {_dm(x['order'])} ({day_diff(today, x['order'])} days)" if x["order"] else "no order date"]
        waiting_text = f" {x['waiting']} day(s) ago" if x["waiting"] is not None else ""
        if x["state"] == "expected":
            reason_parts.append(f"expected {_dm(x['planned']) if x['planned'] else 'date not known'}")
        elif x["state"] == "arrived":
            reason_parts.append(f"arrived{waiting_text}, not counted")
        elif x["state"] == "counted":
            reason_parts.append(f"counted{waiting_text}, not binned")
        elif x["state"] == "binned":
            reason_parts.append("binned, becoming available")
        else:
            reason_parts.append("available")
        action = _text(r.get("Suggested_Action")) or ("Count and inspect it" if x["state"] == "arrived" else ("Write the bin location" if x["state"] == "counted" else ""))
        want = {
            "Rcv_State": x["state"], "Days_Waiting": x["waiting"] if x["waiting"] is not None else "", "Queue_Rank": "" if x["state"] == "available" else rank.get(str(r["ID"]), ""),
            "Rcv_Forecast_Pickable": x["forecast"], "Priority_Reason": " · ".join(reason_parts), "Suggested_Action": action, "Order_Date": ymd(x["order"]) if x["order"] else "",
        }
        diff = {k: v for k, v in want.items() if _text(v) != _text(r.get(k))}
        if not diff:
            continue
        await store.update_record(RCV, r["ID"], diff, by_form=True)
        changed += 1
    return {"scored": len(rows), "changed": changed}


# ---------- silence alerts (RCV-R6) ----------
async def check_receiving_silence(store, settings, now: datetime | None = None) -> int:
    now = now or datetime.now()
    made = 0
    told = await store.find("App_Notifications", lambda x: x.get("Notification_Type") in ("Receiving Backed Up", "Receiving Not Binned", "Receiving Not Available"))

    async def once(r, type_, message) -> None:
        nonlocal made
        if any(x.get("Notification_Type") == type_ and _text(x.get("Source_Record_No")) == _text(r.get("Receive_No1")) for x in told):
            return
        await notify(store, settings, ship={"Shipment_No": r.get("Receive_No1"), "ID": r.get("ID")}, type=type_, message=message)
        made += 1

    def hours(v) -> float | None:
        d = parse_zoho(v)
        return (now - d).total_seconds() / 3600 if d else None

    for r in await store.find(RCV, lambda x: _text(x.get("Available_At")) == ""):
        arrived, counted, binned = hours(r.get("Arrived_At")), hours(r.get("Counted_At")), hours(r.get("Binned_At"))
        if not _text(r.get("Counted_At")) and arrived is not None and arrived >= settings["receiving_count_window_days"] * 24:
            await once(r, "Receiving Backed Up", f"{r.get('Receive_No1')} arrived {int(arrived // 24)} day(s) ago and has not been counted.")
        if _text(r.get("Counted_At")) and not _text(r.get("Binned_At")) and counted is not None and counted >= settings["receiving_bin_window_days"] * 24:
            await once(r, "Receiving Not Binned", f"{r.get('Receive_No1')} was counted {int(counted // 24)} day(s) ago but has no bin location: the stock cannot be picked.")
        if _text(r.get("Binned_At")) and binned is not None and binned >= settings["receiving_available_window_hours"]:
            await once(r, "Receiving Not Available", f"{r.get('Receive_No1')} was binned {int(binned)} hour(s) ago and is still not available: check the readiness step.")
    return made


# The daily run (Receiving_Silence_Daily): re-rank the Arrivals list and raise the silence alerts.
async def run_receiving_daily(store, *, log=lambda *_a, **_k: None, now: datetime | None = None) -> dict:
    now = now or datetime.now()
    settings = await load_settings(store)
    r = await rescore_receivings(store, today=now.date())
    alerts = await check_receiving_silence(store, settings, now)
    log(f"{r['scored']} receiving(s) scored, {alerts} alert(s)")
    return {**r, "alerts": alerts}
