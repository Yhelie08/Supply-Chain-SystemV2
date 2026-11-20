# The Procurement Dashboard of the HomeCartel spec v1.4 (02 Procurement / 08): one custom API,
# get_procurement_dashboard, that works out every block, and for every number the link (page +
# query) of the list behind it. Nothing is stored: it is read from the records each time.
#   Today          Act now, Tell the customer, Broken, decisions waiting, PRs needing a manual
#                  quote, POs not acknowledged
#   Born-late rate % of PO lines raised with a shortfall at the gate, weekly (PO-R3)
#   On-time arrival % of shipment lines that arrived by the PLANNED arrival (recomputed from the PO
#                  date and the settings, so a supplier's delay report, which moves the plan, does
#                  not hide a late arrival), overall and by supplier
#   Scorecard      per supplier: lead time planned vs actual, late starts, ladder rungs fired,
#                  reporting lag, damage rate (fault = supplier)
#   Pipeline       lines by stage with the oldest Order Date of each
#   Replacements   open RRs, oldest first, and the rework rate
# Ported from server/modules/procurement/dashboard.mjs.
from urllib.parse import quote

from app.custom_apis import CUSTOM_APIS
from app.deluge import add_days, blank, day_diff, parse_date, to_num, today_date, ymd
from app.procurement.plan import load_settings, planned_chain, supplier_days_from
from app.procurement.po_spec import get_born_late_rate
from app.procurement.rr_spec import get_rr_report
from app.procurement.ship_track import effective_stage
from app.procurement.suppliers import portal_of


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _day(v) -> str:
    return _text(v)[:10]


def _ok_body(message: str, data: dict) -> dict:
    return {"code": 3000, "message": message, "data": data}


def _link(page: str, query: dict | None = None) -> dict:
    query = query or {}
    return {"page": page, "query": "&".join(f"{k}={quote(str(v), safe='')}" for k, v in query.items())}


def _supplier_name(n) -> str:
    portal = portal_of(n)
    return portal["name"] if portal else (_text(n).strip() or "unknown")


def _line_count(s: dict) -> int:
    return max(1, len(s.get("PO_Shipments") or []))


def _avg(xs: list) -> float | None:
    return round((sum(xs) / len(xs)) * 10) / 10 if xs else None


def _pct(a, b) -> float | None:
    return round((a / b) * 1000) / 10 if b else None


_DONE_RR = ["Closed", "Completed", "Cancelled"]
_STAGE_GROUP = {"production": "production", "shipped_out": "shipout", "arrived_port": "transit", "customs_cleared": "transit", "arrived_warehouse": "receive"}


async def get_procurement_dashboard(payload: dict, store) -> dict:
    today = today_date()
    settings = await load_settings(store)
    ships = await store.find("Shipments")
    supplier_rows = await store.find("Suppliers")
    live = [s for s in ships if effective_stage(s) != "received"]

    # ----- Today -----
    def cat(c: str) -> list:
        return [s for s in live if _text(s.get("Category")) == c]

    pending = [i for i in await store.find("Approval_Queue") if _text(i.get("Status")) == "pending"]

    def kind(k: str) -> int:
        return len([i for i in pending if _text(i.get("Kind")) == k])

    manual_quote = len([p for p in await store.find("Purchase_Request1") if _text(p.get("Pricing_Status")) == "needs_manual_quote" and _text(p.get("Pr_State")) in ("open", "ready_for_po", "")])
    not_acked = len([p for p in await store.find("Purchase_Order") if _text(p.get("Po_State")) == "sent"])
    top_rows = sorted([*cat("broken"), *cat("act_now")], key=lambda s: to_num(s.get("Queue_Rank") or 1e9))[:5]
    top = [{"id": str(s["ID"]), "no": _text(s.get("Shipment_No")), "supplier": _supplier_name(s.get("Supplier")), "reason": _text(s.get("Priority_Reason")), "action": _text(s.get("Suggested_Action"))} for s in top_rows]
    today_block = {
        "act_now": {"count": len(cat("act_now")), "link": _link("Shipments1", {"cat": "act_now"})},
        "tell_customer": {"count": len(cat("tell_customer")), "link": _link("Shipments1", {"cat": "tell_customer"})},
        "broken": {"count": len(cat("broken")), "link": _link("Shipments1", {"cat": "broken"})},
        "decisions": {"count": len(pending), "air_upgrade": kind("air_upgrade"), "ladder_day3": kind("ladder_day3"), "forecast_promise_change": kind("forecast_promise_change"), "link": _link("Decisions")},
        "manual_quote": {"count": manual_quote, "link": _link("Purchase_Request", {"pricing": "needs_manual_quote"})},
        "pos_not_acknowledged": {"count": not_acked, "link": _link("Purchase_Order1", {"status": "sent"})},
        "top": top,
    }

    # ----- Born-late rate -----
    born = (await get_born_late_rate({"weeks": 8}, store))["data"]
    born_block = {**born, "link": _link("Purchase_Order1", {"born": "late"})}

    # ----- On-time arrival and the scorecard -----
    per: dict = {}

    def slot(name: str) -> dict:
        if name not in per:
            per[name] = {"supplier": name, "lines": 0, "on_time": 0, "planned": [], "actual": [], "late_starts": 0, "rungs": 0, "lag": [], "damage_qty": 0, "received_qty": 0}
        return per[name]

    by_ship_id = {str(s["ID"]): s for s in ships}
    for s in ships:
        p = slot(_supplier_name(s.get("Supplier")))
        po_date = parse_date(_day(s.get("PO_Date")))
        # the plan as it was made (without any later promise of the supplier)
        eff = {**settings, **(await supplier_days_from(supplier_rows, s.get("Supplier")))}
        plan = planned_chain(eff, po_date=po_date, production_days=s.get("Required_Days_Lead"), mode=_text(s.get("Shipment_Mode")) or "LCL") if po_date else None
        arrived = parse_date(_day(s.get("Arrived_Port_At"))) or parse_date(_day(s.get("Arrived_Warehouse_At")))
        if plan and arrived:
            n = _line_count(s)
            p["lines"] += n
            if arrived <= plan["arrival"]:
                p["on_time"] += n
            p["planned"].append(day_diff(plan["arrival"], po_date))
            p["actual"].append(day_diff(arrived, po_date))
        if po_date:
            due = add_days(po_date, 1)
            started = parse_date(_day(s.get("Production_Started_At")))
            if (started > due) if started else (effective_stage(s) == "production" and today > due):
                p["late_starts"] += 1
    for l in await store.find("Ladder_Events"):
        s = by_ship_id.get(_text(l.get("Record_Id")))
        if s:
            slot(_supplier_name(s.get("Supplier")))["rungs"] += 1
    for e in await store.find("Stage_Events"):
        if e.get("Record_Type") != "shipment" or _text(e.get("Source")) != "supplier":
            continue
        s = by_ship_id.get(_text(e.get("Record_Id")))
        a, b = parse_date(_day(e.get("Occurred_At"))), parse_date(_day(e.get("Reported_At")))
        if s and a and b:
            slot(_supplier_name(s.get("Supplier")))["lag"].append(max(0, day_diff(b, a)))
    for r in await store.find("Receiving"):
        slot(_supplier_name(r.get("Supplier")))["received_qty"] += to_num(r.get("Total_Expected_Qty"))
    for x in await store.find("Exceptions"):
        if _text(x.get("Fault_Origin")) != "supplier":
            continue
        sup = next((c for c in (_text(c.get("Supplier")) for c in (x.get("Product_Context1") or [])) if c), None)
        slot(_supplier_name(sup))["damage_qty"] += to_num(x.get("Affected_Qty"))
    rows = sorted((p for p in per.values() if p["supplier"] != "unknown" or p["lines"] or p["rungs"]), key=lambda p: p["supplier"])
    lines_total = sum(p["lines"] for p in rows)
    on_time_total = sum(p["on_time"] for p in rows)
    on_time_block = {
        "rate": _pct(on_time_total, lines_total), "lines": lines_total, "on_time": on_time_total,
        "by_supplier": [{"supplier": p["supplier"], "lines": p["lines"], "on_time": p["on_time"], "rate": _pct(p["on_time"], p["lines"])} for p in rows if p["lines"]],
        "link": _link("Shipments1", {"stage": "receive"}),
    }
    scorecard = [{
        "supplier": p["supplier"], "lead_planned_days": _avg(p["planned"]), "lead_actual_days": _avg(p["actual"]), "late_starts": p["late_starts"], "ladder_rungs": p["rungs"],
        "reporting_lag_days": _avg(p["lag"]), "damage_rate_supplier_fault": _pct(p["damage_qty"], p["received_qty"]), "damage_qty": p["damage_qty"], "received_qty": p["received_qty"],
    } for p in rows]

    # ----- Pipeline -----
    pipe = {"production": [], "shipout": [], "transit": [], "receive": []}
    for s in live:
        g = _STAGE_GROUP.get(effective_stage(s))
        if g:
            pipe[g].append(s)
    pipeline = []
    for stage, lst in pipe.items():
        dates = sorted(d for d in (_day(s.get("Order_Date")) for s in lst) if d)
        pipeline.append({"stage": stage, "lines": sum(_line_count(s) for s in lst), "shipments": len(lst), "oldest_order_date": dates[0] if dates else "", "link": _link("Shipments1", {"stage": stage})})

    # ----- Replacements -----
    open_rr = sorted(
        [r for r in await store.find("Replacement_Request") if _text(r.get("RR_Status")) not in _DONE_RR],
        key=lambda r: (_day(r.get("Order_Date")) or "9999", _text(r.get("RR_No"))),
    )
    rework = (await get_rr_report({}, store))["data"]["rework"]
    replacements = {
        "open": len(open_rr), "rework": rework, "link": _link("Replacement_Request1"),
        "oldest": [{"no": _text(r.get("RR_No")), "supplier": _text(r.get("RR_Supplier")), "order_date": _day(r.get("Order_Date")), "target": _day(r.get("Target_Delivery")), "forecast": _day(r.get("Rr_Forecast_Pickable"))} for r in open_rr[:5]],
    }

    return _ok_body("Procurement dashboard.", {"today": today_block, "born_late": born_block, "on_time": on_time_block, "scorecard": scorecard, "pipeline": pipeline, "replacements": replacements, "as_of": ymd(today)})


async def _get_procurement_dashboard_api(payload: dict, store, ctx: dict) -> dict:
    return await get_procurement_dashboard(payload or {}, store)


CUSTOM_APIS["get_procurement_dashboard"] = _get_procurement_dashboard_api
