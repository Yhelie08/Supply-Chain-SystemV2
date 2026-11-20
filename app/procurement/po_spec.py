# Purchase Order, from the HomeCartel spec v1.4 (02 Procurement / 03 Purchase Order and Feasibility
# Gate, 05 Shared Engines 04):
#   one state (draft / sent / acknowledged / closed / cancelled), stamped as events (po.created /
#   sent / acknowledged / closed / cancelled)
#   PO-R5  the buyer is told when a PO is not acknowledged within po_ack_window_days; a late
#          acknowledgement never moves the production clock
#   PO-R8  the PO closes by itself when every line is fully received
#   a PO is never deleted (cancel it); the fields below are written by the server, a widget write to
#   them is dropped
# The Create PO function itself (the feasibility gate, grouping by supplier + mode) is po_create.py.
# Ported from server/modules/procurement/po-spec.mjs.
from datetime import datetime, timedelta

from app.criteria import ZohoError, zoho_now
from app.deluge import blank, id_of, to_num, parse_date, day_diff, today_date
from app.procurement.events import log_event, parse_when
from app.procurement.decisions_core import notify
from app.workflows import register

PO = "Purchase_Order"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


PO_SERVER_ONLY = [
    "Supplier_Id", "Supplier_Name", "Shipment_Mode", "Earliest_Order_Date", "Earliest_Target", "Born_Late", "Shortfall_Days", "Feasibility_Note", "Po_State", "Cancelled_At",
    "Lines_Raised", "Lines_Born_Late", "Po_Category", "Po_Queue_Rank", "Po_Priority_Reason", "Po_Forecast_Pickable", "Po_Scored_At",
]


def po_state(po: dict) -> str:
    status = _text(po.get("PO_Status"))
    if status == "Cancelled":
        return "cancelled"
    if status == "Completed" or _text(po.get("Completed_On")) != "":
        return "closed"
    if _text(po.get("Acknowledge_On")) != "" or status.startswith("Confirmed"):
        return "acknowledged"
    if _text(po.get("Sent_On")) != "" or status == "Sent":
        return "sent"
    return "draft"


async def _before_update(args: dict) -> None:
    input_, previous = args["input"], args.get("previous") or {}
    for f in PO_SERVER_ONLY:
        input_.pop(f, None)
    rec = {**previous, **input_}
    input_["Po_State"] = po_state(rec)
    if input_["Po_State"] == "cancelled" and po_state(previous) != "cancelled":
        input_["Cancelled_At"] = zoho_now()


async def _before_add(args: dict) -> None:
    input_ = args["input"]
    for f in PO_SERVER_ONLY:
        input_.pop(f, None)


async def _before_delete(args: dict) -> None:
    raise ZohoError(2001, "A PO is never deleted: cancel it (PO Status = Cancelled).")


async def _after_add(args: dict) -> None:
    id_, record, store, user = args.get("id"), args["record"], args["store"], args.get("user", "")
    await log_event(store, record_type="po", record_id=id_, record_no=record.get("PO_No"), event="po.created", occurred_at=zoho_now(), source="user", actor=user or "")


async def _after_update(args: dict) -> None:
    id_, record, previous, store, user = args.get("id"), args["record"], args.get("previous") or {}, args["store"], args.get("user", "")

    async def log(event: str) -> None:
        await log_event(store, record_type="po", record_id=id_, record_no=record.get("PO_No"), event=event, occurred_at=zoho_now(), source="user", actor=user or "")

    if blank(previous.get("Sent_On")) and not blank(record.get("Sent_On")):
        await log("po.sent")
    if blank(previous.get("Acknowledge_On")) and not blank(record.get("Acknowledge_On")):
        await log("po.acknowledged")
    if blank(previous.get("Completed_On")) and not blank(record.get("Completed_On")):
        await log("po.closed")
    if po_state(previous) != "cancelled" and po_state(record) == "cancelled":
        await log("po.cancelled")


register(PO, {"beforeUpdate": _before_update, "beforeAdd": _before_add, "beforeDelete": _before_delete, "afterAdd": _after_add, "afterUpdate": _after_update})


# The supplier acknowledged (set by the supplier portal function, a server write that fires no
# hooks): stamp the state and the event.
async def record_po_acknowledged(store, po_id, who: str = "") -> None:
    try:
        po = await store.get_record_by_id(PO, po_id, raw=True)
    except Exception:
        po = None
    if not po:
        return
    await store.update_record(PO, po["ID"], {"Po_State": "acknowledged"}, by_form=True)
    await log_event(store, record_type="po", record_id=po["ID"], record_no=po.get("PO_No"), event="po.acknowledged",
                     occurred_at=_text(po.get("Acknowledge_On")) or zoho_now(), source="supplier", actor=who, note="reported in the supplier portal")


# PO-R5: sent but not acknowledged within the window -> one alert for the buyer (the production
# clock is not moved).
async def check_pos_acknowledged(store, settings, today=None) -> int:
    today = today or today_date()
    n = 0
    told = await store.find("App_Notifications", lambda x: x.get("Notification_Type") == "PO Not Acknowledged")
    for po in await store.find(PO, lambda p: po_state(p) == "sent"):
        when = parse_when(po.get("Sent_On"))
        sent = when["date"].date() if when else parse_date(po.get("Sent_On"))
        if not sent:
            continue
        days = day_diff(today, sent)
        if days < settings["po_ack_window_days"] or any(_text(x.get("Source_Record_No")) == _text(po.get("PO_No")) for x in told):
            continue
        line0 = (po.get("PO_Line_Items") or [{}])[0] if po.get("PO_Line_Items") else {}
        await notify(store, settings, ship={"Shipment_No": po.get("PO_No"), "ID": po.get("ID")}, type="PO Not Acknowledged",
                     message=f"{po.get('PO_No')} ({_text(po.get('Supplier_Name')) or _text(line0.get('Supplier'))}) was sent {days} day(s) ago and the supplier has not acknowledged it.")
        n += 1
    return n


# PO-R8: closes when every line is fully received (accepted quantity of its PR number across the
# receivings >= the ordered quantity).
async def close_po_if_received(store, po_no) -> bool:
    matches = await store.find(PO, lambda p: _text(p.get("PO_No")) == _text(po_no))
    po = matches[0] if matches else None
    if not po or po_state(po) in ("closed", "cancelled"):
        return False
    lines = po.get("PO_Line_Items") or []
    if not lines:
        return False
    got: dict = {}
    for r in await store.find("Receiving", lambda x: _text(x.get("PO_No")) == _text(po_no)):
        for ln in r.get("Receiving_Line_Items") or []:
            key = _text(ln.get("PR_No"))
            got[key] = got.get(key, 0) + to_num(ln.get("Accepted_Qty"))
    if not all(got.get(_text(ln.get("PR_No")), 0) >= to_num(ln.get("QTY")) and to_num(ln.get("QTY")) > 0 for ln in lines):
        return False
    await store.update_record(PO, po["ID"], {"PO_Status": "Completed", "Completed_On": zoho_now(), "Po_State": "closed"}, by_form=True)
    await log_event(store, record_type="po", record_id=po["ID"], record_no=po.get("PO_No"), event="po.closed", occurred_at=zoho_now(), source="system", note="every line received")
    return True


async def _on_receiving_add(args: dict) -> None:
    await close_po_if_received(args["store"], args["record"].get("PO_No"))


async def _on_receiving_update(args: dict) -> None:
    await close_po_if_received(args["store"], args["record"].get("PO_No"))


register("Receiving", {"afterAdd": _on_receiving_add, "afterUpdate": _on_receiving_update})


# ---------- the PO list by category (spec 03 Screens: PO list, Act now / Tell customer / Watch / On track) ----------
URGENCY = ["broken", "act_now", "tell_customer", "watch", "on_track", "blocked"]


# items = one per scored shipment: {po_id, category, rank, reason, forecast, done}. A PO takes the
# most urgent category of its shipments that are still going; a PO whose shipments are all received
# has none.
async def rollup_po_categories(store, items: list) -> None:
    by_po: dict = {}
    for it in items:
        if blank(it.get("po_id")) or it.get("done"):
            continue
        by_po.setdefault(str(it["po_id"]), []).append(it)
    for po in await store.find(PO):
        mine = by_po.get(str(po["ID"]), [])
        cat = next((c for c in URGENCY if any(m.get("category") == c for m in mine)), "")
        best_candidates = sorted((m for m in mine if m.get("category") == cat), key=lambda m: m.get("rank") if m.get("rank") is not None else 1e9)
        best = best_candidates[0] if best_candidates else None
        forecasts = sorted(x for x in (_text(m.get("forecast")) for m in mine) if x)
        forecast = forecasts[-1] if forecasts else ""
        want = {
            "Po_Category": cat,
            "Po_Queue_Rank": best["rank"] if (best and best.get("rank") is not None and best.get("rank") != "") else "",
            "Po_Priority_Reason": (best or {}).get("reason") or "",
            "Po_Forecast_Pickable": forecast,
        }
        diff = {k: v for k, v in want.items() if _text(po.get(k)) != _text(v)}
        if diff:
            await store.update_record(PO, po["ID"], {**diff, "Po_Scored_At": zoho_now()}, by_form=True)


# ---------- read APIs for the PO screen and the Dashboard ----------
def _ok_body(message: str, data) -> dict:
    return {"code": 3000, "message": message, "data": data}


def _iso_day(v) -> str:
    return _text(v)[:10]


# Custom API: born-late rate (spec PO-R3): lines born late / lines raised, per week of the PO date,
# newest week first.
async def get_born_late_rate(payload, store) -> dict:
    weeks = min(52, max(1, int((payload or {}).get("weeks") or 4)))
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    def week_start(d: datetime) -> datetime:
        x = d.replace(hour=0, minute=0, second=0, microsecond=0)
        return x - timedelta(days=(x.weekday()))  # Monday

    this_week = week_start(today)
    rows = []
    for w in range(weeks):
        frm = this_week - timedelta(days=7 * w)
        to = frm + timedelta(days=7)
        rows.append({"week_start": frm.strftime("%Y-%m-%d"), "from": frm, "to": to, "raised": 0, "born_late": 0})
    for po in await store.find(PO):
        if _text(po.get("PO_Status")) == "Cancelled" or blank(po.get("Lines_Raised")):
            continue
        try:
            d = datetime.strptime(_iso_day(po.get("PO_Date")), "%Y-%m-%d")
        except ValueError:
            continue
        w = next((r for r in rows if r["from"] <= d < r["to"]), None)
        if w:
            w["raised"] += to_num(po.get("Lines_Raised")) or 0
            w["born_late"] += to_num(po.get("Lines_Born_Late")) or 0
    raised = sum(r["raised"] for r in rows)
    late = sum(r["born_late"] for r in rows)
    return _ok_body("Born-late rate.", {
        "weeks": [{"week_start": r["week_start"], "raised": r["raised"], "born_late": r["born_late"], "rate": (round(r["born_late"] / r["raised"] * 1000) / 10 if r["raised"] else None)} for r in rows],
        "raised": raised, "born_late": late, "rate": (round(late / raised * 1000) / 10 if raised else None),
    })


# Custom API: what the PO detail shows about its shipments: planned vs actual dates, the category,
# the supplier ladder and the event log.
async def get_po_tracking(payload, store) -> dict:
    po_id = _text((payload or {}).get("po_id"))
    if po_id == "":
        return _ok_body("No PO.", {"shipments": []})
    ships = [s for s in await store.find("Shipments") if _text(id_of(s.get("PO_No"))) == po_id]
    out = []
    for s in ships:
        id_ = str(s["ID"])
        ladder = sorted(await store.find("Ladder_Events", lambda l: _text(l.get("Record_Id")) == id_), key=lambda l: int(l["ID"]), reverse=True)
        events = sorted(await store.find("Stage_Events", lambda e: _text(e.get("Record_Id")) == id_), key=lambda e: int(e["ID"]), reverse=True)[:30]
        out.append({
            "id": id_, "shipment_no": _text(s.get("Shipment_No")), "stage": _text(s.get("Stage")), "mode": _text(s.get("Shipment_Mode")), "category": _text(s.get("Category")), "reason": _text(s.get("Priority_Reason")),
            "suggested_action": _text(s.get("Suggested_Action")), "forecast_pickable": _text(s.get("Forecast_Pickable")), "expected_date": _text(s.get("Supplier_Expected_Date")), "delay_reason": _text(s.get("Delay_Reason")),
            "planned": {"production_start": _text(s.get("Production_Start_Planned")), "production_end": _text(s.get("Production_End_Planned")), "shipout": _text(s.get("Shipout_Planned")), "arrival": _text(s.get("Arrival_Planned")), "receive": _text(s.get("Receive_Planned"))},
            "actual": {"production_started": _text(s.get("Production_Started_At")), "production_finished": _text(s.get("Production_Finished_At")), "shipped_out": _text(s.get("Shipped_Out_At")), "arrived_port": _text(s.get("Arrived_Port_At")), "customs_cleared": _text(s.get("Customs_Cleared_At")), "arrived_warehouse": _text(s.get("Arrived_Warehouse_At")), "received": _text(s.get("Received_At"))},
            "ladder": [{"rung": _text(l.get("Rung")), "at": _text(l.get("Added_Time")), "action": _text(l.get("Action_Taken")), "note": _text(l.get("Note"))} for l in ladder],
            "events": [{"event": _text(e.get("Event")), "occurred_at": _text(e.get("Occurred_At")), "reported_at": _text(e.get("Reported_At")), "source": _text(e.get("Source")), "note": _text(e.get("Note"))} for e in events],
        })
    return _ok_body("PO tracking.", {"shipments": out})
