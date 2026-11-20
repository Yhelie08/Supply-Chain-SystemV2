# Inquiry of the HomeCartel spec v1.4 (02 Procurement / 01 Inquiry, 05 Shared Engines 04), on the
# Inquiry_Form.
#   INQ-R2   a line the supplier marks Unavailable or Cannot Produce has no price and no lead time
#            (the server clears them: the screens only disable the fields)
#   INQ-R3   the selected quote's lead time is the production-day count, as a NUMBER (text like
#            "3 weeks" is read): Selected_Lead_Days
#   INQ-R6   a quote row is matched by its supplier ID; the name is used only for old rows that have
#            no ID (see portal_of)
#   INQ-R7   when the sales agent gave a needed-by date, each quote gets a feasibility hint: "Lead 20
#            days + sea -> earliest about 18 Jan"
#   stamps   Sent_At, First_Quote_At, Selected_At, Estimate_Pushed_At (the first stamp stays) and the
#            events inquiry.sent, first_quote_received, supplier_selected, estimate_pushed in the
#            event log
#   alerts   the buyer is told when every quote is in, and when a supplier has not quoted after
#            inquiry_quote_days (daily job)
# Not here (needs the roles or Books): the sales agent's "My inquiries" without prices (C12), the
# Estimate becoming a Sales Order (INQ-R5). Ported from server/modules/procurement/inq-spec.mjs.
from datetime import datetime

from app.criteria import zoho_now
from app.deluge import blank, parse_date, to_num, today_date, truthy, ymd, day_diff
from app.procurement.decisions_core import notify
from app.procurement.events import log_event
from app.procurement.plan import feasibility, load_settings, parse_lead_days
from app.workflows import register

FORM = "Inquiry_Form"
SERVER_ONLY = ["Sent_At", "First_Quote_At", "Selected_At", "Estimate_Pushed_At", "Selected_Lead_Days", "Selected_Supplier_Id", "Feasibility_Hints", "Quotes_Alert_At"]
NO_QUOTE = ["Unavailable", "Cannot Produce"]
_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _nice(d) -> str:
    x = d if hasattr(d, "year") else parse_date(d)
    return f"{x.day} {_MON[x.month - 1]}" if x else ""


def _unbr(v) -> str:
    s = _text(v)
    if s.startswith("["):
        s = s[1:]
    if s.endswith("]"):
        s = s[:-1]
    return s


# a row counts as answered once the supplier gave an availability other than Pending, or any price
def _row_answered(q: dict) -> bool:
    return (not blank(q.get("Availability")) and _text(q.get("Availability")) != "Pending") or to_num(q.get("Initial_Price")) > 0 or to_num(q.get("Negotiated")) > 0 or to_num(q.get("Final_Price")) > 0


# INQ-R2: the price and the lead time of a line that cannot be supplied are blanked
def clear_unavailable(rows: list) -> dict:
    changed = False
    out = []
    for q in rows or []:
        if _text(q.get("Availability")) not in NO_QUOTE:
            out.append(q)
            continue
        if blank(q.get("Initial_Price")) and blank(q.get("Negotiated")) and blank(q.get("Final_Price")) and blank(q.get("Lead_Time")):
            out.append(q)
            continue
        changed = True
        out.append({**q, "Initial_Price": "", "Negotiated": "", "Final_Price": "", "Lead_Time": ""})
    return {"rows": out, "changed": changed}


async def before_save(args: dict) -> None:
    input_ = args["input"]
    for f in SERVER_ONLY:
        input_.pop(f, None)
    if isinstance(input_.get("Supplier_Quotes"), list):
        input_["Supplier_Quotes"] = clear_unavailable(input_["Supplier_Quotes"])["rows"]


# INQ-R7: "Lead 20 days + sea -> earliest about 18 Jan (5 days after the date you need; by air about 4 Jan)"
def hints_for(settings: dict, rec: dict, today=None) -> str:
    today = today or today_date()
    target = parse_date(rec.get("target_date"))
    if not target:
        return ""
    lines = []
    for q in rec.get("Supplier_Quotes") or []:
        lead = parse_lead_days(q.get("Lead_Time"))
        if _text(q.get("Availability")) in NO_QUOTE or lead <= 0:
            continue
        sea = feasibility(settings, po_date=today, production_days=lead, mode="LCL", target=target)
        if not sea.get("feasible_by"):
            continue
        line = f"{_text(q.get('Suppliers'))}: Lead {lead} days + sea -> earliest about {_nice(sea['feasible_by'])}"
        if sea["feasibility"] == "impossible":
            line += f" ({sea['shortfall_days']} days after the {_nice(target)} you need"
            if sea.get("air_feasible_by"):
                air_shortfall = sea["air_shortfall_days"]
                air_text = ", in time" if air_shortfall <= 0 else f", still {air_shortfall} days late"
                line += f"; by air about {_nice(sea['air_feasible_by'])}{air_text})"
            else:
                line += ")"
        else:
            line += f" (in time for {_nice(target)})"
        lines.append(line)
    return "\n".join(lines)


async def after_save(args: dict) -> None:
    id_, store = args.get("id"), args["store"]
    rec = await store.get_record_by_id(FORM, id_, raw=True)
    quotes = rec.get("Supplier_Quotes") or []
    patch: dict = {}
    events: list = []
    now = zoho_now()

    def stamp(col: str, ev, note: str = "") -> None:
        if blank(rec.get(col)):
            patch[col] = now
            if ev:
                events.append({"event": ev, "note": note})

    # sent: the inquiry went to its suppliers (a row for each one)
    if len(quotes) > 0:
        stamp("Sent_At", "inquiry.sent", f"{len(quotes)} supplier(s)")
    # the first quote that came back
    if any(_row_answered(q) for q in quotes):
        stamp("First_Quote_At", "inquiry.first_quote_received")
    # the selected supplier (every change is an event; the stamp is the first)
    sel = next((q for q in quotes if truthy(q.get("Selected"))), None)
    sel_id = (_unbr(sel.get("Supplier_ID")) or _text(sel.get("Suppliers"))) if sel else ""
    if sel_id != _text(rec.get("Selected_Supplier_Id")):
        patch["Selected_Supplier_Id"] = sel_id
        patch["Selected_Lead_Days"] = (parse_lead_days(sel.get("Lead_Time")) or "") if sel else ""
        if sel:
            stamp("Selected_At", None)
            events.append({"event": "inquiry.supplier_selected", "note": _text(sel.get("Suppliers"))})
    elif sel and to_num(rec.get("Selected_Lead_Days")) != parse_lead_days(sel.get("Lead_Time")):
        patch["Selected_Lead_Days"] = parse_lead_days(sel.get("Lead_Time")) or ""  # the supplier changed the lead time of the selected quote
    if truthy(rec.get("Estimate_Created")):
        stamp("Estimate_Pushed_At", "inquiry.estimate_pushed", _text(rec.get("Books_Estimate_No")))

    # INQ-R7
    settings = await load_settings(store)
    hints = hints_for(settings, rec)
    if hints != _text(rec.get("Feasibility_Hints")):
        patch["Feasibility_Hints"] = hints

    # the buyer is told once when every supplier has answered
    if len(quotes) > 0 and all(_row_answered(q) for q in quotes) and blank(rec.get("Quotes_Alert_At")):
        patch["Quotes_Alert_At"] = now
        await notify(store, settings, ship={"Shipment_No": rec.get("INQ_No"), "ID": rec.get("ID")}, type="Inquiry Quotes Complete", message=f"{rec.get('INQ_No')}: every supplier has quoted. You can select one.", page="Inquiry")

    if patch:
        await store.update_record(FORM, id_, patch, by_form=True)
    for e in events:
        await log_event(store, record_type="inquiry", record_id=id_, record_no=rec.get("INQ_No"), event=e["event"], occurred_at=now, source="system", note=e.get("note", ""))


register(FORM, {"beforeAdd": before_save, "beforeUpdate": before_save, "afterAdd": after_save, "afterUpdate": after_save})


# A supplier's answer reaches the inquiry through the server's own write (no hooks), so the steps
# above would wait for the buyer's next save. This runs them at once: clear the price of a line that
# cannot be supplied (INQ-R2), then the stamps, events, hints and alerts.
async def refresh_inquiry_spec(store, inquiry_id) -> None:
    rec = await store.get_record_by_id(FORM, inquiry_id, raw=True)
    cleared = clear_unavailable(rec.get("Supplier_Quotes") or [])
    if cleared["changed"]:
        await store.update_record(FORM, inquiry_id, {"Supplier_Quotes": cleared["rows"]}, by_form=True)
    await after_save({"id": inquiry_id, "store": store})


# Daily: a supplier that has not quoted after inquiry_quote_days (spec: Buyer notification, DEFAULT
# 2 days). One alert per inquiry.
async def run_inquiry_daily(store, *, now: datetime | None = None) -> dict:
    now = now or datetime.now()
    settings = await load_settings(store)
    days = to_num(settings.get("inquiry_quote_days")) or 2
    today = today_date()
    alerted = 0
    for inq in await store.find(FORM):
        if blank(inq.get("Sent_At")) or truthy(inq.get("Estimate_Created")):
            continue
        quotes = inq.get("Supplier_Quotes") or []
        waiting = [q for q in quotes if not _row_answered(q)]
        if not waiting:
            continue
        sent = parse_date(str(inq.get("Sent_At"))[:10])
        if not sent or day_diff(today, sent) < days:
            continue
        done = await store.find("Stage_Events", lambda e: e.get("Record_Type") == "inquiry" and str(e.get("Record_Id")) == str(inq["ID"]) and e.get("Event") == "inquiry.no_quote_alert")
        if done:
            continue
        names = ", ".join(_text(q.get("Suppliers")) for q in waiting)
        await notify(store, settings, ship={"Shipment_No": inq.get("INQ_No"), "ID": inq.get("ID")}, type="Inquiry No Quote", message=f"{inq.get('INQ_No')}: no quote from {names} after {int(days)} days. Call them.", page="Inquiry")
        await log_event(store, record_type="inquiry", record_id=inq["ID"], record_no=inq.get("INQ_No"), event="inquiry.no_quote_alert", occurred_at=zoho_now(now), source="system", note=names)
        alerted += 1
    return {"alerted": alerted}
