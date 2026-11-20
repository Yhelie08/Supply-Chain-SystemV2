# Ship & Track on the Shipments form, from the HomeCartel spec v1.4 (02 Procurement / 04 Ship and
# Track, 05 Shared Engines 01 Sorting, 03 Dates and Forecast, 04 Timestamps and Event Log).
# Ported from server/modules/procurement/ship-track.mjs.
#
# What runs when a widget writes a shipment (hooks only run for widget writes; the server's own
# writes go through the plain store):
#   before   - drops every field only the server may write (planned dates, actual stamps, queue
#              columns, Order_Date)   [T-2, ST-R1]
#            - turns Report_Event (or a Stage / Shipment_Status change) into a stage event: forward
#              moves only keep the first stamp, a shipout implies "production finished before ..."
#              [ST-R5, T-5], and leaving Production needs a production photo [ST-R3]
#            - recomputes the planned dates from the PO date + 1 and the settings, and copies Order
#              Date and PO Date  [DT-1]
#   after    - writes the Stage_Events rows (occurred + reported time), then re-scores the whole
#              shipment list [SE-3]
# Schedules (server/schedules.mjs): Shipment_Ladder_Daily = the supplier ladder, silence alert, full re-score.
#
# Older rows that have no Stage (imported from Zoho) are scored for the board but never get ladder
# rungs or silence alerts: the spec says an import must not raise hundreds of alerts on day one (T-9,
# Sorting Engine section 5).
import json

from app.criteria import ZohoError, zoho_now
from app.deluge import add_days, blank, day_diff, num_text, parse_date, to_num, today_date, truthy, ymd
from app.procurement.decisions_core import escalate_overdue, mark_stale_items, notify, prepare_item, sync_air_upgrade_items
from app.procurement.events import SHIPMENT_EVENTS, SHIPMENT_STAGE_OF, SHIPMENT_STAGES, SHIPMENT_STAMP_OF, log_event, occurred_from, parse_when
from app.procurement.plan import load_settings, norm_mode, planned_chain, supplier_days_from, supplier_row_from, transit_days, customs_days
from app.procurement.po_spec import check_pos_acknowledged, rollup_po_categories
from app.procurement.rr_spec import rollup_rr
from app.procurement.sorting import categorise, rank
from app.workflows import register

SHIP = "Shipments"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


# Fields a widget may never write (spec T-2, ST-R1): the server computes them.
SERVER_ONLY = [
    "Stage", "Order_Date", "PO_Date", "Production_Start_Planned", "Production_End_Planned", "Shipout_Planned", "Arrival_Planned", "Receive_Planned",
    "Production_Started_At", "Production_Finished_At", "Shipped_Out_At", "Arrived_Port_At", "Customs_Cleared_At", "Arrived_Warehouse_At", "Received_At",
    "Last_Supplier_Update_At", "Last_Chase_At", "Category", "Blocked_Reason", "Queue_Rank", "Priority_Reason", "Suggested_Action", "Date_Needed",
    "Forecast_Pickable", "Slack_Days", "Days_Late", "Scored_At", "Risk_Status", "Supplier_Expected_Date", "Delay_Reason",
]
TRANSIENT = ["Report_Event", "Report_Occurred_At", "Report_Source", "Report_Note", "Target_Change_Reason", "Report_Delay_Date", "Report_Delay_Reason"]


# Production_Photos held one path, so a second upload (ours or the supplier's) silently erased the
# first. Every write now appends instead: a widget still sends one new path at a time, this turns it
# into the growing list (damage photos already work this way through Evidence_Photos).
def photos_of(v) -> list:
    if v is None or v == "":
        return []
    if isinstance(v, list):
        return v
    try:
        p = json.loads(v)
        return p if isinstance(p, list) else [str(v)]
    except (TypeError, ValueError):
        return [str(v)]


def append_photo(existing, url) -> list:
    lst = photos_of(existing)
    return lst if url in lst else [*lst, url]


_targetPending: dict = {}  # shipment id -> {old, new, reason} to log after the save

# The legacy Shipment_Status values the Zoho widgets still use, kept in step with the stage.
_LEGACY_OF_STAGE = {"production": "Pending", "shipped_out": "In Transit", "arrived_port": "In Transit", "customs_cleared": "In Transit", "arrived_warehouse": "Delivered", "received": "Delivered"}


def effective_stage(r: dict) -> str:
    if r.get("Stage") in SHIPMENT_STAGES:
        return r["Stage"]
    s = _text(r.get("Shipment_Status"))
    if s == "Delivered":
        return "arrived_warehouse"
    if s in ("In Transit", "Arriving In 1 Week") or _text(r.get("Ship_Out_Date")) != "":
        return "shipped_out"
    return "production"


def _stage_index(s) -> int:
    return SHIPMENT_STAGES.index(s) if s in SHIPMENT_STAGES else -1


def _to_day(v):
    w = parse_when(v)
    if w:
        return w["date"].date()
    return parse_date(v)


def _same(a, b) -> bool:
    return _text(a) == _text(b)


# ---------- facts about one shipment ----------
async def _po_of(store, ship):
    id_ = _text(ship.get("PO_No"))
    if id_ == "":
        return None
    try:
        return await store.get_record_by_id("Purchase_Order", id_, raw=True)
    except Exception:
        return None


async def _order_date_of(store, ship):
    so = _text(ship.get("Sales_Order"))
    best = None
    if so != "":
        for r in await store.find("Sales_Order_Fulfillment", lambda x: _text(x.get("SO_No")) == so):
            d = _to_day(r.get("SO_Created_Date"))
            if d and (not best or d < best):
                best = d
    # a shipment of a PO with several Sales Orders: the oldest Order Date among its PRs (spec DT-1)
    pr_nos = [x for x in (_text(l.get("PR_No")) for l in (ship.get("PO_Shipments") or [])) if x]
    if pr_nos:
        for p in await store.find("Purchase_Request1", lambda x: _text(x.get("PR_No")) in pr_nos):
            d = _to_day(p.get("Order_Date"))
            if d and (not best or d < best):
                best = d
    return best


def _po_date_of(po):
    if not po:
        return None
    return _to_day(po.get("PO_Date")) or _to_day(po.get("Sent_On")) or _to_day(po.get("Added_Time"))


def _mode_of(ship) -> str:
    if _text(ship.get("Shipment_Mode")):
        return _text(ship.get("Shipment_Mode"))
    line = next((l for l in (ship.get("PO_Shipments") or []) if _text(l.get("Shipping_Mode"))), None)
    return _text(line.get("Shipping_Mode")) if line else ""


# The server-owned columns that follow from the PO and the settings.
async def plan_patch(store, ship, settings) -> dict:
    patch: dict = {}
    po = await _po_of(store, ship)
    po_date = _po_date_of(po) or _to_day(ship.get("PO_Date"))
    order_date = (await _order_date_of(store, ship)) or _to_day(ship.get("Order_Date"))
    if po_date:
        patch["PO_Date"] = ymd(po_date)
    if order_date:
        patch["Order_Date"] = ymd(order_date)
    mode = _mode_of(ship)
    if mode != "" and _text(ship.get("Shipment_Mode")) == "":
        patch["Shipment_Mode"] = norm_mode(mode)
    eff = {**settings, **(await supplier_days_from(await store.find("Suppliers"), ship.get("Supplier")))}
    plan = planned_chain(eff, po_date=po_date, production_days=ship.get("Required_Days_Lead"), mode=mode) if po_date else None
    if plan:
        patch["Production_Start_Planned"] = ymd(plan["production_start"])
        patch["Production_End_Planned"] = ymd(plan["production_end"])
        patch["Shipout_Planned"] = ymd(plan["shipout"])
        patch["Arrival_Planned"] = ymd(plan["arrival"])
        patch["Receive_Planned"] = ymd(plan["receive"])
        # a delay report (SP-R5): the supplier's new date replaces the computed one for the stage it
        # is in, and the stages after it follow
        promised = _to_day(ship.get("Supplier_Expected_Date"))
        if promised:
            in_production = effective_stage(ship) == "production"
            shipout = promised if in_production else plan["shipout"]
            arrival = add_days(promised, transit_days(eff, mode)) if in_production else promised
            if in_production:
                patch["Production_End_Planned"] = ymd(add_days(promised, -eff["consolidation_days"]))
                patch["Shipout_Planned"] = ymd(shipout)
            patch["Arrival_Planned"] = ymd(arrival)
            patch["Receive_Planned"] = ymd(add_days(arrival, customs_days(eff, mode) + eff["receiving_days"]))
    return patch


# What one event does to a shipment: the columns to write (the first stamp is kept, T-6; the stage
# only moves forward) and the Stage_Events rows. `gate` = the production photo rule (ST-R3): the buyer
# and tracker screens enforce it; the supplier-reported shipout (server write from the supplier's own
# copy) cannot refuse an after-save, so it passes gate=False (gap, see the notes).
def build_event(previous: dict, rec: dict, event: str, occurred: dict, source: str, note: str, *, gate: bool = True) -> dict:
    cur = effective_stage(previous)
    to_stage = SHIPMENT_STAGE_OF[event]
    if gate and cur == "production" and _stage_index(to_stage) > _stage_index("production") and blank(rec.get("Production_Photos")):
        raise ZohoError(2001, "Add at least one production photo before the shipment leaves Production.")
    events: list = []
    patch: dict = {}

    def stamp(ev: str, when, bound: str) -> None:
        col = SHIPMENT_STAMP_OF[ev]
        if blank(previous.get(col)):
            patch[col] = when  # T-6: the first stamp stays
        events.append({"event": ev, "occurred_at": when, "bound": bound, "source": source if ev == event else "system", "note": note if ev == event else f"implied by {event}"})

    # ST-R5 / T-5: a later event implies the earlier ones (but not "production started", which only
    # the supplier knows)
    for ev in SHIPMENT_EVENTS:
        if ev == event:
            break
        if ev == "production_started":
            continue
        if blank(previous.get(SHIPMENT_STAMP_OF[ev])):
            stamp(ev, occurred["text"], "before")
    stamp(event, occurred["text"], occurred["bound"])
    stage = to_stage if _stage_index(to_stage) > _stage_index(cur) else cur
    patch["Stage"] = stage
    legacy = _LEGACY_OF_STAGE[stage]
    if stage != "production" and _text(previous.get("Shipment_Status")) != legacy:
        patch["Previous_Status"] = previous.get("Shipment_Status")
        patch["Shipment_Status"] = legacy
    if source == "supplier":
        patch["Last_Supplier_Update_At"] = zoho_now()
    if event == "shipped_out" and blank(rec.get("Ship_Out_Date")):
        patch["Ship_Out_Date"] = ymd(_to_day(occurred["text"]))
    if event == "arrived_warehouse" and blank(rec.get("Arrival_Date")):
        patch["Arrival_Date"] = ymd(_to_day(occurred["text"]))
    return {"patch": patch, "events": events}


# A delay report (spec SP-R4 / SP-R5): the new expected date and a reason. The date is the supplier's
# promise for the next stage (ship out while the shipment is in Production, arrival after that).
# Nothing else moves: the target date is never changed by a delay (DT-5).
_LAST_STAGES = ["arrived_warehouse", "received"]


def build_delay(ship: dict, date_text, reason, source: str) -> dict:
    date = _to_day(date_text)
    if not date:
        raise ZohoError(2001, "Give the new expected date of the delay.")
    if _text(reason).strip() == "":
        raise ZohoError(2001, "Give a reason for the delay.")
    if date < today_date():
        raise ZohoError(2001, "The new expected date cannot be in the past.")
    if effective_stage(ship) in _LAST_STAGES:
        raise ZohoError(2001, "This shipment has already arrived at the warehouse.")
    patch = {"Supplier_Expected_Date": ymd(date), "Delay_Reason": _text(reason).strip()}
    if source == "supplier":
        patch["Last_Supplier_Update_At"] = zoho_now()
    was = _to_day(ship.get("Supplier_Expected_Date")) or _to_day(ship.get("Shipout_Planned") if effective_stage(ship) == "production" else ship.get("Arrival_Planned"))
    note = f"new expected date {ymd(date)}{f' (was {ymd(was)})' if was else ''}: {_text(reason).strip()}"
    return {"patch": patch, "event": {"event": "delay_reported", "occurred_at": zoho_now(), "bound": "exact", "source": source, "note": note}}


# What the supplier's own copy of a shipment shows on the Production screen. Only what the supplier
# may see (SP-R1): the PO number, the lines (SKU, item, quantity), the planned production dates and
# the stage. Called after every change of the shipment.
_PORTAL_COPIES = ["Tony_Shipment", "Fenteng_Shipment"]


async def refresh_supplier_view(store, ship_id) -> None:
    try:
        ship = await store.get_record_by_id(SHIP, ship_id, raw=True)
    except Exception:
        return
    stage = effective_stage(ship)
    status = "shipped" if stage != "production" else ("finished" if not blank(ship.get("Production_Finished_At")) else ("in_production" if not blank(ship.get("Production_Started_At")) else "not_started"))
    po = await _po_of(store, ship)
    lines_text = "\n".join(f"{_text(l.get('SKU'))} {_text(l.get('Item_Name'))} x{_text(l.get('Shipment_QTY')) or _text(l.get('Ordered_QTY'))}".strip() for l in (ship.get("PO_Shipments") or []))
    view = {
        "Prod_Po_No": _text(po.get("PO_No")) if po else "", "Prod_Status": status,
        "Prod_Planned_Start": _text(ship.get("Production_Start_Planned")), "Prod_Planned_End": _text(ship.get("Production_End_Planned")),
        "Prod_Started_On": _text(ship.get("Production_Started_At")), "Prod_Finished_On": _text(ship.get("Production_Finished_At")), "Prod_Expected_Date": _text(ship.get("Supplier_Expected_Date")),
        "Prod_Lines": lines_text,
    }
    for form in _PORTAL_COPIES:
        for copy in await store.find(form, lambda c: _text(c.get("Parent_Shipment_ID")) == str(ship_id)):
            patch = {k: v for k, v in view.items() if _text(copy.get(k)) != _text(v)}
            if patch:
                await store.update_record(form, copy["ID"], patch, by_form=True)


# The deposit of the PO of a shipment, as a sentence for the day-3 decision (spec 04: "deposit paid
# (amount, buyer only)").
async def deposit_note(store, ship) -> str:
    po = await _po_of(store, ship)
    if not po:
        return "No PO, so no deposit."
    paid = truthy(po.get("Deposit_Paid"))
    amount = to_num(po.get("Deposit_Amount"))
    if paid:
        return f"Deposit paid{f': {num_text(amount)}' if amount > 0 else ''} on {_text(po.get('PO_No'))}."
    return f"No deposit paid on {_text(po.get('PO_No'))}."


# For the server's own writers (the supplier's delay report, Receiving, ...): same rules as the widget path.
async def report_shipment_delay(store, ship_id, *, date=None, reason=None, source: str = "user") -> bool:
    try:
        ship = await store.get_record_by_id(SHIP, ship_id, raw=True)
    except Exception:
        ship = None
    if not ship:
        raise ZohoError(2001, "Shipment not found.")
    built = build_delay(ship, date, reason, source)
    patch, event = built["patch"], built["event"]
    settings = await load_settings(store)
    await store.update_record(SHIP, ship_id, {**patch, **(await plan_patch(store, {**ship, **patch}, settings))}, by_form=True)
    await log_event(store, record_type="shipment", record_id=ship_id, record_no=ship.get("Shipment_No"), event=f"shipment.{event['event']}", occurred_at=event["occurred_at"], bound=event["bound"], source=event["source"], note=event["note"])
    await rescore_shipments(store)
    await refresh_supplier_view(store, ship_id)
    return True


# For the server's own writers (the supplier's shipout sync, Receiving): records the event through
# the plain store. occurred_at blank = now. A "before" bound means only the order of events is known
# (spec T-5).
async def apply_shipment_event(store, ship_id, event: str, *, occurred_at: str = "", source: str = "system", note: str = "", bound: str = "exact", gate: bool = False) -> bool:
    try:
        ship = await store.get_record_by_id(SHIP, ship_id, raw=True)
    except Exception:
        ship = None
    if not ship or event not in SHIPMENT_EVENTS:
        return False
    occurred = {**occurred_from(occurred_at), "bound": bound}
    built = build_event(ship, ship, event, occurred, source, note, gate=gate)
    patch, events = built["patch"], built["events"]
    settings = await load_settings(store)
    await store.update_record(SHIP, ship_id, {**patch, **(await plan_patch(store, {**ship, **patch}, settings))}, by_form=True)
    for e in events:
        await log_event(store, record_type="shipment", record_id=ship_id, record_no=ship.get("Shipment_No"), event=f"shipment.{e['event']}", occurred_at=e["occurred_at"], bound=e["bound"], source=e["source"], note=e["note"])
    await rescore_shipments(store)
    await refresh_supplier_view(store, ship_id)
    return True


# ---------- the hooks ----------
_pending: dict = {}  # shipment id -> events to write after the save


async def _before_save(args: dict) -> None:
    input_, previous, id_, store, user = args["input"], args.get("previous"), args.get("id"), args["store"], args.get("user", "")
    adding = not previous
    settings = await load_settings(store)
    asked = {"status": _text(input_.get("Shipment_Status")), "event": _text(input_.get("Report_Event")), "target_reason": _text(input_.get("Target_Change_Reason")).strip()}
    report_at, source, note = input_.get("Report_Occurred_At"), _text(input_.get("Report_Source")) or "user", _text(input_.get("Report_Note"))
    delay = {"date": _text(input_.get("Report_Delay_Date")), "reason": _text(input_.get("Report_Delay_Reason"))}
    for f in SERVER_ONLY:
        input_.pop(f, None)
    for f in TRANSIENT:
        if f in input_:
            input_[f] = ""
    if isinstance(input_.get("Production_Photos"), str) and input_["Production_Photos"] != "":
        input_["Production_Photos"] = append_photo((previous or {}).get("Production_Photos"), input_["Production_Photos"])

    rec = {**(previous or {}), **input_}
    if adding:
        input_["Stage"] = "production"
    # DT-4: changing a promise needs a reason; it is logged with the old and the new date (the
    # forecast never does this by itself, DT-5)
    if not adding and "Target_Date" in input_ and not blank((previous or {}).get("Target_Date")) and _text(input_.get("Target_Date")) != _text((previous or {}).get("Target_Date")):
        if asked["target_reason"] == "":
            raise ZohoError(2001, "Give a reason for changing the target date.")
        _targetPending[str(id_)] = {"old": _text((previous or {}).get("Target_Date")), "new": _text(input_.get("Target_Date")), "reason": asked["target_reason"]}

    # a stage event asked for: Report_Event, or a Shipment_Status change made the old way (Stage
    # itself is server-only)
    event = asked["event"]
    if not event and not adding:
        if asked["status"] and asked["status"] != _text((previous or {}).get("Shipment_Status")):
            cur = effective_stage(previous)
            if asked["status"] == "In Transit" and _stage_index(cur) < _stage_index("shipped_out"):
                event = "shipped_out"
            elif asked["status"] == "Delivered" and _stage_index(cur) < _stage_index("arrived_warehouse"):
                event = "arrived_warehouse"
    if event:
        if adding:
            raise ZohoError(2001, "Save the shipment first, then report an event on it.")
        if event not in SHIPMENT_EVENTS:
            raise ZohoError(2001, f'Unknown event "{event}".')
        occurred = occurred_from(report_at)
        built = build_event(previous, rec, event, occurred, source, note, gate=True)
        patch, events = built["patch"], built["events"]
        input_.update(patch)
        _pending[str(id_)] = [{**e, "actor": user or ""} for e in events]
        input_["Supplier_Expected_Date"] = ""  # a stage that happened replaces the old promise
    if delay["date"] != "" or delay["reason"].strip() != "":
        if adding:
            raise ZohoError(2001, "Save the shipment first, then report a delay on it.")
        built = build_delay({**rec, **input_}, delay["date"], delay["reason"], source)
        patch, dev = built["patch"], built["event"]
        input_.update(patch)
        _pending[str(id_)] = [*_pending.get(str(id_), []), {**dev, "actor": user or ""}]
    input_.update(await plan_patch(store, {**rec, **input_}, settings))


async def _after_save(args: dict) -> None:
    id_, store, user = args.get("id"), args["store"], args.get("user", "")
    t = _targetPending.get(str(id_))
    if t:
        del _targetPending[str(id_)]
        ship = await store.get_record_by_id(SHIP, id_, raw=True)
        await store.add_record("Target_Date_Changes", {"Record_Type": "shipment", "Record_Id": str(id_), "Record_No": ship.get("Shipment_No"), "Old_Date": t["old"], "New_Date": t["new"], "Reason": t["reason"], "Changed_By": user or "", "Customer_Told": False, "Changed_At": zoho_now(), "Via": "person"})
    events = _pending.get(str(id_))
    if events:
        del _pending[str(id_)]
        ship = await store.get_record_by_id(SHIP, id_, raw=True)
        for e in events:
            await log_event(store, record_type="shipment", record_id=id_, record_no=ship.get("Shipment_No"), event=f"shipment.{e['event']}", occurred_at=e["occurred_at"], bound=e["bound"], source=e["source"], actor=e.get("actor", ""), note=e.get("note", ""))
    await rescore_shipments(store)
    await refresh_supplier_view(store, id_)


register(SHIP, {"beforeAdd": _before_save, "beforeUpdate": _before_save, "afterAdd": _after_save, "afterUpdate": _after_save})


# A PR put on hold (or released / cancelled) changes which shipments are blocked: re-score at once,
# not at the next nightly run.
async def _hold_status_changed(args: dict) -> None:
    record, previous, store = args["record"], args.get("previous"), args["store"]
    if _text(record.get("Hold_Status")) != _text((previous or {}).get("Hold_Status")):
        await rescore_shipments(store)


register("Purchase_Request1", {"afterUpdate": _hold_status_changed})


# A buyer who writes what they did on a ladder rung (called the supplier) stamps the last chase, as
# a side effect (T-4).
async def _ladder_event_actioned(args: dict) -> None:
    record, previous, store = args["record"], args.get("previous"), args["store"]
    if blank((previous or {}).get("Action_Taken")) and not blank(record.get("Action_Taken")) and not blank(record.get("Record_Id")):
        await store.update_record(SHIP, record["Record_Id"], {"Last_Chase_At": zoho_now()}, by_form=True)
        await log_event(store, record_type="shipment", record_id=record["Record_Id"], record_no=record.get("Record_No"), event="shipment.chased", occurred_at=zoho_now(), source="user", note=_text(record.get("Action_Taken")))


register("Ladder_Events", {"afterUpdate": _ladder_event_actioned})


# ---------- scoring (Sorting Engine, Procurement) ----------
def _forecast_of(rows: list, ship) -> str:
    r = next((x for x in rows if x["s"] is ship), None)
    return ymd(r["forecast"]["pickable"]) if (r and r.get("forecast")) else ""


async def _held_prs(store) -> dict:
    held: dict = {}
    for pr in await store.find("Purchase_Request1", lambda r: _text(r.get("Hold_Status")) in ("On Hold", "Cancelled")):
        held[_text(pr.get("PR_No"))] = _text(pr.get("Hold_Status"))
    return held


# Re-scores every open shipment: the whole list is ranked, never only what is on screen (SE-3).
# Writes only what changed. full = also re-read the PO and the Sales Order dates (the nightly run);
# the per-save run uses the dates already on the shipment. settings_try = values to try instead of the
# saved ones; dry_run = write nothing and answer what each shipment would become (the "show the effect
# before saving" of the Control Panel, CP-R4).
async def rescore_shipments(store, *, today=None, full: bool = False, settings_try: dict | None = None, dry_run: bool = False) -> dict:
    today = today or today_date()
    settings = await load_settings(store, settings_try)
    supplier_rows = await store.find("Suppliers")
    ships = await store.find(SHIP)
    held = await _held_prs(store)
    ladder = await store.find("Ladder_Events")
    rung_of: dict = {}
    for l in ladder:
        key = _text(l.get("Record_Id"))
        rung_of[key] = max(rung_of.get(key, 0), to_num(l.get("Rung")))

    # a shipment is BROKEN while an open Replacement Request points at it (RR.Cloned_Shipment_No), spec 06 RR-R4
    broken_by = {}
    for r in await store.find("Replacement_Request", lambda r: _text(r.get("RR_Status")) not in ("Closed", "Completed", "Cancelled") and _text(r.get("Cloned_Shipment_No")) != ""):
        broken_by[_text(r.get("Cloned_Shipment_No"))] = _text(r.get("RR_No"))

    rows = []
    for s in ships:
        row = dict(s)
        if full:
            row.update(await plan_patch(store, s, settings))
        stage = effective_stage(s)
        po_date = _to_day(row.get("PO_Date"))
        mode = _mode_of(row)
        eff = {**settings, **(await supplier_days_from(supplier_rows, s.get("Supplier")))}
        stage_stamp_field = {"production": "production_started", "shipped_out": "shipped_out", "arrived_port": "arrived_port", "customs_cleared": "customs_cleared", "arrived_warehouse": "arrived_warehouse", "received": "received"}[stage]
        forecast = None
        if po_date or s.get("Production_Started_At") or s.get("Production_Finished_At") or s.get("Shipped_Out_At") or s.get("Ship_Out_Date") or s.get("Arrived_Port_At") or s.get("Arrived_Warehouse_At"):
            from app.procurement.plan import forecast_chain
            forecast = forecast_chain(eff, po_date=po_date, production_days=s.get("Required_Days_Lead"), mode=mode, today=today,
                                       expected={"shipout": s.get("Supplier_Expected_Date")} if stage == "production" else {"arrival": s.get("Supplier_Expected_Date")},
                                       actual={"production_started": s.get("Production_Started_At"), "production_finished": s.get("Production_Finished_At"), "shipped_out": s.get("Shipped_Out_At") or s.get("Ship_Out_Date"), "arrived_port": s.get("Arrived_Port_At"), "arrived_warehouse": s.get("Arrived_Warehouse_At") or (s.get("Arrival_Date") if stage == "arrived_warehouse" else None)})
        pr_nos = [x for x in (_text(l.get("PR_No")) for l in (s.get("PO_Shipments") or [])) if x]
        held_nos = [n for n in pr_nos if n in held]
        # days late (spec ladder): production not started by PO + 1, then production not finished by
        # its planned end, then arrival overdue
        started, finished = not blank(s.get("Production_Started_At")), not blank(s.get("Production_Finished_At"))
        days_late = 0
        if stage == "production" and po_date and not started:
            days_late = max(0, day_diff(today, add_days(po_date, 1)))
        elif stage == "production" and not finished and _to_day(row.get("Production_End_Planned")):
            days_late = max(0, day_diff(today, _to_day(row.get("Production_End_Planned"))))
        elif stage == "shipped_out" and _to_day(row.get("Arrival_Planned")):
            days_late = max(0, day_diff(today, _to_day(row.get("Arrival_Planned"))))
        stamp = _to_day(s.get(SHIPMENT_STAMP_OF[stage_stamp_field])) or _to_day(s.get("Added_Time"))
        scored = categorise({
            "stage": stage, "order_date": _to_day(row.get("Order_Date")) or _to_day(s.get("Added_Time")), "target": _to_day(s.get("Target_Date")), "forecast_pickable": forecast["pickable"] if forecast else None, "mode": mode,
            "broken": broken_by.get(_text(s.get("Shipment_No")), ""),
            "held": f"PR {', '.join(held_nos)} is {held.get(held_nos[0])}" if held_nos else "", "no_supplier": _text(s.get("Supplier")) == "",
            "ladder_rung": rung_of.get(str(s["ID"]), 0), "days_late": days_late, "production_started": started, "production_finished": finished,
            "arrival_planned": _to_day(row.get("Arrival_Planned")), "last_supplier_update": day_diff(today, _to_day(s.get("Last_Supplier_Update_At"))) if s.get("Last_Supplier_Update_At") else None,
            "stage_since": max(0, day_diff(today, stamp)) if stamp else None,
        }, settings, today)
        rows.append({"s": s, "row": row, "scored": scored, "days_late": days_late, "forecast": forecast, "stage": stage, "mode": mode, "po_date": po_date, "target": _to_day(s.get("Target_Date")),
                     "item": {"id": str(s["ID"]), "no": s.get("Shipment_No"), "category": scored["category"], "order_date": _to_day(row.get("Order_Date")) or _to_day(s.get("Added_Time")), "target": _to_day(s.get("Target_Date")), "no_rank": stage == "received"}})
    ranks = rank([r["item"] for r in rows])

    if dry_run:
        return {"scored": len(rows), "results": [{"id": str(r["s"]["ID"]), "no": r["s"].get("Shipment_No"), "category": r["scored"]["category"], "slack_days": r["scored"].get("slack_days")} for r in rows]}

    changed = 0
    for r in rows:
        s, row, scored, days_late, forecast, item = r["s"], r["row"], r["scored"], r["days_late"], r["forecast"], r["item"]
        slack = scored.get("slack_days")
        want = {
            "Category": scored["category"], "Blocked_Reason": scored["blocked_reason"], "Queue_Rank": ranks.get(item["id"], ""), "Priority_Reason": scored["priority_reason"],
            "Suggested_Action": scored["suggested_action"], "Date_Needed": scored.get("date_needed") or "", "Forecast_Pickable": ymd(forecast["pickable"]) if forecast else "",
            "Slack_Days": slack if slack is not None else "", "Days_Late": days_late,
            # Risk Status used to be a manual pick; it now follows the forecast: misses the date
            # needed = Delayed, little slack = At Risk
            "Risk_Status": "" if (item["no_rank"] or slack is None) else ("Delayed" if slack < 0 else ("At Risk" if slack <= settings["proc_watch_slack_days"] else "On Track")),
        }
        if full:
            for k in ["PO_Date", "Order_Date", "Production_Start_Planned", "Production_End_Planned", "Shipout_Planned", "Arrival_Planned", "Receive_Planned"]:
                if row.get(k) is not None and not _same(row.get(k), s.get(k)):
                    want[k] = row[k]
        diff = {k: v for k, v in want.items() if not _same(v, s.get(k))}
        if not diff:
            continue
        diff["Scored_At"] = zoho_now()
        await store.update_record(SHIP, s["ID"], diff, by_form=True)
        changed += 1

    # the PO list by category: each PO takes the most urgent category of its shipments (spec 03, PO list)
    await rollup_po_categories(store, [{"po_id": str(r["s"].get("PO_No") or ""), "category": r["scored"]["category"], "rank": ranks.get(r["item"]["id"]), "reason": r["scored"]["priority_reason"], "forecast": _forecast_of(rows, r["s"]), "done": effective_stage(r["s"]) == "received"} for r in rows])
    # the receiving records show the forecast pickable of their shipment (Task 12, not yet wired: skip until it exists)
    try:
        from app.procurement.receiving_spec import rescore_receivings
    except ImportError:
        rescore_receivings = None
    if rescore_receivings:
        await rescore_receivings(store)
    # the replacement requests: their rank and the forecast of their replacement shipment
    ships_with_forecast = [{**r["s"], "Forecast_Pickable": ymd(r["forecast"]["pickable"]) if r["forecast"] else ""} for r in rows]
    await rollup_rr(store, ships_with_forecast)
    # every Sales Order behind the shipment gets its own forecast too, through its PR (spec 05 Shared
    # Engines 03) (Task 14, not yet wired: skip until it exists)
    try:
        from app.procurement.pr_spec import rollup_pr_forecast
    except ImportError:
        rollup_pr_forecast = None
    if rollup_pr_forecast:
        await rollup_pr_forecast(store, ships_with_forecast)
    # decisions the engine prepares, and the ones that went stale (spec 05/06 AQ-4)
    prepared = await sync_air_upgrade_items(store, settings, rows, today)
    stale = await mark_stale_items(store, {str(r["s"]["ID"]): {**r["s"], "Category": r["scored"]["category"]} for r in rows}, effective_stage)
    return {"scored": len(rows), "changed": changed, "prepared": prepared, "stale": stale}


# ---------- the supplier ladder, silence alert, full re-score (daily) ----------
_RUNG_TEXT = {1: "Call the supplier", 2: "Ask the supplier for a discount in writing", 3: "Decide: cancel and re-source, or hold"}


async def run_shipment_ladder(store, *, log=lambda *_a, **_k: None, today=None) -> dict:
    today = today or today_date()
    settings = await load_settings(store)
    out = {"rungs": 0, "decisions": 0, "overdue": 0}
    suppliers = await store.find("Suppliers")
    have = await store.find("Ladder_Events")

    def fired(id_, kind, rung) -> bool:
        return any(_text(l.get("Record_Id")) == str(id_) and l.get("Kind") == kind and to_num(l.get("Rung")) == rung for l in have)

    notices = await store.find("App_Notifications", lambda n: n.get("Notification_Type") == "Shipment Overdue")
    await rescore_shipments(store, today=today, full=True)

    for s in await store.find(SHIP):
        if s.get("Stage") not in SHIPMENT_STAGES:
            continue  # older rows: no alerts (T-9)
        po_date = _to_day(s.get("PO_Date"))
        stage = s.get("Stage")
        kind, late = "", 0
        if stage == "production" and po_date and blank(s.get("Production_Started_At")):
            kind, late = "production_start", day_diff(today, add_days(po_date, 1))
        elif stage == "production" and blank(s.get("Production_Finished_At")) and _to_day(s.get("Production_End_Planned")):
            kind, late = "production_finish", day_diff(today, _to_day(s.get("Production_End_Planned")))
        if kind and late >= 1:
            for rung in (1, 2, 3):
                if late < settings[f"ladder_rung{rung}_days"] or fired(s["ID"], kind, rung):
                    continue
                action = "Decide: hold, or upgrade the mode" if (rung == 3 and kind == "production_finish") else _RUNG_TEXT[rung]
                await store.add_record("Ladder_Events", {"Record_Type": "shipment", "Record_Id": str(s["ID"]), "Record_No": s.get("Shipment_No"), "PO_No": _text((await _po_of(store, s)) and (await _po_of(store, s)).get("PO_No")), "Supplier": s.get("Supplier"), "Kind": kind, "Rung": rung, "Days_Late": late, "Fired_At": zoho_now(), "Action_Text": action})
                await notify(store, settings, ship=s, type="Supplier Ladder", message=f"{s.get('Shipment_No')} ({_text(s.get('Supplier'))}): {'production has not started' if kind == 'production_start' else 'production is not finished'}, {late} day(s) late. Rung {rung}: {action}.")
                out["rungs"] += 1
                if rung == 3:
                    # LD-R2: never an automatic cancel; day 3 is a prepared decision
                    options = ["cancel_resource", "hold"] if kind == "production_start" else ["hold", "upgrade_mode"]
                    main = truthy((supplier_row_from(suppliers, s.get("Supplier")) or {}).get("Is_Main_Supplier"))
                    await prepare_item(store, settings, kind="ladder_day3", ship=s, options=options, payload={"kind": kind, "rung": rung, "days_late": late, "main_supplier": main},
                                        summary=f"{s.get('Shipment_No')} ({_text(s.get('Supplier'))}): {late} days late. Options: {' / '.join(options)}.{' Main supplier: the supervisor decides too.' if main else ''} {await deposit_note(store, s)} Taobao alternative is not recorded yet.")
                    out["decisions"] += 1
        # silence is an alert: shipped out, not at the port within transit days + 3 (expected window, spec Timestamps)
        if stage == "shipped_out":
            out_at = _to_day(s.get("Shipped_Out_At")) or _to_day(s.get("Ship_Out_Date"))
            if out_at and today > add_days(out_at, transit_days(settings, _mode_of(s)) + settings["arrival_overdue_grace_days"]) and not any(_text(n.get("Source_Record_No")) == _text(s.get("Shipment_No")) for n in notices):
                await notify(store, settings, ship=s, type="Shipment Overdue", message=f"{s.get('Shipment_No')} has not arrived at the port. Ask the forwarder for tracking.")
                out["overdue"] += 1
    out["escalated"] = await escalate_overdue(store, settings)
    out["unacknowledged"] = await check_pos_acknowledged(store, settings, today)
    log(f"{out['rungs']} ladder rung(s), {out['decisions']} decision(s), {out['overdue']} overdue alert(s), {out['escalated']} escalated, {out['unacknowledged']} PO(s) not acknowledged")
    return out
