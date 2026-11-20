# What the Ship & Track engine and the Decisions screen share (spec 05 Shared Engines / 06 Approval
# Queue, 05 Alerts): the alert recipient, the in-app notification, and the preparing of
# Approval_Queue items. No hooks here, so ship_track.py can import it without a cycle (the hooks that
# APPLY a decision are in decisions.py). Ported from server/modules/procurement/decisions-core.mjs.
import json
import os
import re
from datetime import datetime, timedelta

from app.criteria import zoho_now
from app.deluge import blank, add_days, ymd, day_diff
from app.procurement.plan import forecast_chain, date_needed, lead_days


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


# Until roles exist (spec section 6) every alert goes to one address: the setting, else the env var,
# else the one the old shipment schedules used.
def alert_recipient(settings: dict | None) -> str:
    return _text((settings or {}).get("procurement_alert_email")) or os.environ.get("PROCUREMENT_ALERT_EMAIL") or "homecartelpacker@gmail.com"


# Same fallback pattern, scoped to "tell the customer" alerts: a separate address can be set until
# roles exist (spec: this should reach the sales agent, not whoever reads the general procurement alert).
def sales_agent_recipient(settings: dict | None) -> str:
    return _text((settings or {}).get("sales_agent_alert_email")) or os.environ.get("SALES_AGENT_ALERT_EMAIL") or alert_recipient(settings)


async def notify(store, settings, *, ship=None, type, message, page="Decisions", to=None) -> str:
    ship = ship or {}
    return await store.add_record("App_Notifications", {
        "Recipient_Email": to or alert_recipient(settings), "Notification_Type": type, "Message": message, "Created_On": zoho_now(), "Read": False,
        "Target_URL": f"{os.environ.get('APP_BASE_URL', '')}/#Page:{page}", "Source_Record_No": ship.get("Shipment_No", ""), "Source_Record_ID": ship.get("ID", ""),
    })


def _due_at(settings: dict, now: datetime | None = None) -> str:
    now = now or datetime.now()
    return zoho_now(now + timedelta(hours=settings["approval_sla_hours"]))


# Prepares one item for a person to decide (AQ-1). `payload` carries the facts the options use.
async def prepare_item(store, settings, *, kind, ship=None, summary, options, payload=None, record_type="shipment", record_id=None, record_no=None) -> str:
    ship = ship or {}
    payload = payload or {}
    return await store.add_record("Approval_Queue", {
        "Kind": kind, "Record_Type": record_type, "Record_Id": str(record_id if record_id is not None else ship.get("ID")),
        "Record_No": record_no if record_no is not None else ship.get("Shipment_No"), "Summary": summary, "Options": json.dumps(options),
        "Payload": json.dumps(payload), "Prepared_By_Type": "system", "Status": "pending", "Due_At": _due_at(settings),
    })


# air_upgrade (spec 05/06): an Act now shipment still in production and not yet by air. Once per
# shipment: a decision, or a "keep the mode", is not asked again. rows = what the sorting engine just
# scored -- each a dict with keys s/scored/stage/mode/po_date/target.
async def sync_air_upgrade_items(store, settings, rows, today) -> int:
    items = await store.find("Approval_Queue", lambda i: i.get("Kind") == "air_upgrade")
    made = 0
    for row in rows:
        s, scored, stage, mode, po_date, target = row["s"], row["scored"], row["stage"], row["mode"], row["po_date"], row["target"]
        if scored.get("category") != "act_now" or stage != "production" or mode == "Airfreight":
            continue
        if any(_text(i.get("Record_Id")) == str(s["ID"]) for i in items):
            continue
        air = forecast_chain(settings, po_date=po_date, production_days=s.get("Required_Days_Lead"), mode="Airfreight", today=today,
                              actual={"production_started": s.get("Production_Started_At"), "production_finished": s.get("Production_Finished_At")})
        needed = date_needed(settings, target)
        saving = lead_days(settings, mode) - lead_days(settings, "Airfreight")
        air_slack = day_diff(needed, air["pickable"]) if (air and needed) else None
        current = forecast_chain(settings, po_date=po_date, production_days=s.get("Required_Days_Lead"), mode=mode, today=today,
                                  actual={"production_started": s.get("Production_Started_At"), "production_finished": s.get("Production_Finished_At")})
        proposed = add_days(current["pickable"], settings["fulfillment_days"] + settings["delivery_days"]) if current else None
        tail = "." if air_slack is None else (", which is on time." if air_slack >= 0 else f", still {-air_slack} days late.")
        await prepare_item(store, settings, kind="air_upgrade", ship=s, options=["upgrade_air", "move_target", "tell_customer"],
                            summary=f"{s.get('Shipment_No')} ({_text(s.get('Supplier'))}) will miss the date needed ({scored.get('date_needed')}). "
                                    f"By air it would save {saving} days: pickable {ymd(air['pickable']) if air else '?'}" + tail + " The extra freight cost is the buyer's to weigh.",
                            payload={"proposed_target": ymd(proposed) if proposed else None, "air_pickable": ymd(air["pickable"]) if air else None, "saving_days": saving, "mode": mode})
        made += 1
    return made


# AQ-4: an item whose record changed is stale and is removed from the list by itself. ships = {id: shipment row}.
async def mark_stale_items(store, ships: dict, stage_of) -> int:
    n = 0
    for it in await store.find("Approval_Queue", lambda i: i.get("Status") == "pending" and (blank(i.get("Record_Type")) or i.get("Record_Type") == "shipment")):
        s = ships.get(_text(it.get("Record_Id")))
        why = ""
        if not s:
            why = "the shipment no longer exists"
        else:
            stage = stage_of(s)
            if it.get("Kind") == "ladder_day3":
                try:
                    payload = json.loads(it.get("Payload") or "{}")
                except (TypeError, ValueError):
                    payload = {}
                if stage != "production":
                    why = "the shipment has shipped out"
                elif payload.get("kind") == "production_start" and not blank(s.get("Production_Started_At")):
                    why = "production has started"
                elif payload.get("kind") == "production_finish" and not blank(s.get("Production_Finished_At")):
                    why = "production has finished"
            elif it.get("Kind") == "air_upgrade":
                if stage != "production":
                    why = "the shipment has shipped out"
                elif _text(s.get("Shipment_Mode")) == "Airfreight":
                    why = "the shipment is already by air"
                elif s.get("Category") and s.get("Category") != "act_now":
                    why = "it is no longer Act now"
            elif it.get("Kind") == "forecast_promise_change":
                try:
                    p = json.loads(it.get("Payload") or "{}")
                except (TypeError, ValueError):
                    p = {}
                if stage == "received":
                    why = "the shipment is received"
                elif p.get("proposed_target") and _text(s.get("Target_Date")) >= p["proposed_target"]:
                    why = "the target date already covers it"
        if why:
            await store.update_record("Approval_Queue", it["ID"], {"Status": "stale", "Result": f"Removed by the system: {why}."}, by_form=True)
            n += 1
    return n


# AQ-3: not decided within approval_sla_hours -> escalate to the supervisor, once.
async def escalate_overdue(store, settings, now: datetime | None = None) -> int:
    now = now or datetime.now()
    n = 0
    for it in await store.find("Approval_Queue", lambda i: i.get("Status") == "pending" and blank(i.get("Escalated_At"))):
        due = parse_zoho(it.get("Due_At"))
        if not due or due > now:
            continue
        await store.update_record("Approval_Queue", it["ID"], {"Escalated_At": zoho_now(now)}, by_form=True)
        await notify(store, settings, ship={"Shipment_No": it.get("Record_No"), "ID": it.get("Record_Id")}, type="Decision Escalated",
                     message=f"Not decided in {settings['approval_sla_hours']} hours, escalated to the supervisor: {_text(it.get('Summary'))}")
        n += 1
    return n


_PARSE_ZOHO_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?", re.IGNORECASE)


# "2026-11-17 10:55:59 AM" or "2026-11-17" -> datetime
def parse_zoho(v) -> datetime | None:
    m = _PARSE_ZOHO_RE.match(_text(v))
    if not m:
        return None
    h = 0 if m.group(4) is None else int(m.group(4))
    if m.group(7):
        h = (h % 12) + (12 if m.group(7).upper() == "PM" else 0)
    return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), h, int(m.group(5) or 0), int(m.group(6) or 0))
