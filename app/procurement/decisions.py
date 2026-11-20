# The Decisions list (spec 05 Shared Engines / 06 Approval Queue): the system prepares, a person
# decides with one click.
#   AQ-1  each item has a summary and one-click options (the Decisions tab shows them)
#   AQ-2  the decision is stamped: who, when, which option, decided_by_type (set here, never typed)
#   AQ-3  not decided within approval_sla_hours -> escalated (daily job)   AQ-4  a record that
#         changed makes its item stale
# Applying an option does exactly what the option says and nothing more: "cancel and re-source" is
# recorded for the buyer; the system never cancels a PO line by itself (decision D15, LD-R2). Ported
# from server/modules/procurement/decisions.mjs.
import json

from app.criteria import ZohoError, zoho_now
from app.deluge import blank
from app.procurement.decisions_core import notify, prepare_item, sales_agent_recipient
from app.procurement.events import log_event
from app.procurement.plan import load_settings
from app.procurement.ship_track import plan_patch, rescore_shipments
from app.workflows import register


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _parse(s, fallback):
    try:
        return json.loads(s)
    except (TypeError, ValueError):
        return fallback


# What a widget may never write: everything but the decision itself.
SERVER_ONLY = ["Kind", "Record_Type", "Record_Id", "Record_No", "Summary", "Options", "Payload", "Prepared_By_Type", "Status", "Due_At", "Escalated_At", "Decided_By", "Decided_By_Type", "Decided_At", "Result"]


async def _before_add(args: dict) -> None:
    raise ZohoError(2001, "Decisions are prepared by the system, not typed.")


async def _before_delete(args: dict) -> None:
    raise ZohoError(2001, "A decision is kept for the record: it cannot be deleted.")


async def _before_update(args: dict) -> None:
    input_, previous, user = args["input"], args.get("previous") or {}, args.get("user", "")
    for f in SERVER_ONLY:
        input_.pop(f, None)
    if blank(input_.get("Decision")):
        input_.pop("Decision", None)
        return
    if previous.get("Status") != "pending":
        raise ZohoError(2001, "This item is stale (the record changed). It was removed from the list." if previous.get("Status") == "stale" else "This has already been decided.")
    options = _parse(previous.get("Options"), [])
    if input_.get("Decision") not in options:
        raise ZohoError(2001, f'"{input_.get("Decision")}" is not one of the options: {", ".join(options)}.')
    input_.update({"Status": "decided", "Decided_By": user or "", "Decided_By_Type": "human", "Decided_At": zoho_now()})


async def _after_update(args: dict) -> None:
    id_, record, previous, store = args.get("id"), args["record"], args.get("previous"), args["store"]
    if (previous or {}).get("Status") != "pending" or record.get("Status") != "decided":
        return
    result = await apply(store, record)
    if result:
        await store.update_record("Approval_Queue", id_, {"Result": result}, by_form=True)


register("Approval_Queue", {"beforeAdd": _before_add, "beforeDelete": _before_delete, "beforeUpdate": _before_update, "afterUpdate": _after_update})


# Changes the shipment to air (the buyer's decision; the extra freight cost is theirs to weigh), and
# plans the dates again.
async def upgrade_to_air(store, ship: dict, settings: dict, who: str) -> None:
    patch = {"Shipment_Mode": "Airfreight"}
    await store.update_record("Shipments", ship["ID"], {**patch, **(await plan_patch(store, {**ship, **patch}, settings))}, by_form=True)
    await log_event(store, record_type="shipment", record_id=ship["ID"], record_no=ship.get("Shipment_No"), event="shipment.mode_upgraded", occurred_at=zoho_now(), source="user", actor=who, note=f"{_text(ship.get('Shipment_Mode')) or 'LCL'} -> Airfreight")


# A target change proposed for a PR (Create PO option B): accepting it changes the PR's target date
# and logs why.
async def apply_pr(store, item: dict) -> str:
    try:
        pr = await store.get_record_by_id("Purchase_Request1", item.get("Record_Id"), raw=True)
    except Exception:
        pr = None
    if not pr:
        return "The PR no longer exists."
    payload = _parse(item.get("Payload"), {})
    if item.get("Decision") == "accept_target" and payload.get("proposed_target"):
        await store.update_record("Purchase_Request1", pr["ID"], {"Target_Delivery": payload["proposed_target"]}, by_form=True)
        await store.add_record("Target_Date_Changes", {"Record_Type": "pr", "Record_Id": str(pr["ID"]), "Record_No": pr.get("PR_No"), "Old_Date": _text(pr.get("Target_Delivery")), "New_Date": payload["proposed_target"], "Reason": "Accepted a proposed change from Create PO", "Changed_By": item.get("Decided_By"), "Customer_Told": False, "Changed_At": zoho_now(), "Via": "approval_queue"})
        settings = await load_settings(store)
        await notify(store, settings, ship={"Shipment_No": pr.get("PR_No"), "ID": pr["ID"]}, type="Tell The Customer", message=f"{pr.get('PR_No')}: the target changed to {payload['proposed_target']}. Tell the customer.", page="Purchase_Request1", to=sales_agent_recipient(settings))
        return f"Target changed to {payload['proposed_target']}. Tell the customer."
    return "Target kept."


async def apply(store, item: dict) -> str:
    if item.get("Record_Type") == "pr":
        return await apply_pr(store, item)
    # Not ours: Approval_Queue is the shared 05/06 engine, and Delivery also prepares items on it
    # (Record_Type 'service_appointment' -- schedule_shortfall, third_party_booking, force_close).
    # Before this guard, any Delivery item that got decided fell through to the Shipments lookup
    # below and wrongly stamped "The shipment no longer exists." Its own afterUpdate hook
    # (approval-decisions.mjs) handles those instead.
    if item.get("Record_Type") != "shipment":
        return ""
    settings = await load_settings(store)
    try:
        ship = await store.get_record_by_id("Shipments", item.get("Record_Id"), raw=True)
    except Exception:
        ship = None
    if not ship:
        return "The shipment no longer exists."
    payload = _parse(item.get("Payload"), {})
    who = item.get("Decided_By")
    result = ""
    record_id = _text(item.get("Record_Id"))
    if item.get("Kind") == "ladder_day3":
        for l in await store.find("Ladder_Events", lambda e: _text(e.get("Record_Id")) == record_id and int(float(e.get("Rung") or 0)) == 3 and e.get("Kind") == payload.get("kind")):
            await store.update_record("Ladder_Events", l["ID"], {"Decision": item.get("Decision"), "Decided_By": who, "Decided_At": zoho_now()}, by_form=True)
        if item.get("Decision") == "upgrade_mode":
            await upgrade_to_air(store, ship, settings, who)
            result = "Changed to air and the dates were planned again."
        elif item.get("Decision") == "cancel_resource":
            result = "Recorded: cancel and re-source. Nothing was cancelled by the system: cancel the PO line and re-source it yourself."
        else:
            result = "Recorded: hold."
        await log_event(store, record_type="shipment", record_id=ship["ID"], record_no=ship.get("Shipment_No"), event="shipment.ladder_decision", occurred_at=zoho_now(), source="user", actor=who, note=item.get("Decision"))
    elif item.get("Kind") == "air_upgrade":
        if item.get("Decision") == "upgrade_air":
            await upgrade_to_air(store, ship, settings, who)
            result = "Changed to air and the dates were planned again."
        elif item.get("Decision") == "move_target":
            if payload.get("proposed_target"):
                await prepare_item(store, settings, kind="forecast_promise_change", ship=ship, options=["accept_target", "keep_target"], payload={"proposed_target": payload["proposed_target"], "from": "air_upgrade"},
                                    summary=f"{ship.get('Shipment_No')}: the forecast says the goods can be delivered by {payload['proposed_target']}, not {_text(ship.get('Target_Date')) or 'the current target'}. Accept the new target (and tell the customer), or keep it.")
                result = "Kept the mode. A target change was sent for approval."
            else:
                result = "Kept the mode. There is no forecast date to propose yet."
        else:
            await notify(store, settings, ship=ship, type="Tell The Customer", message=f"{ship.get('Shipment_No')}: keep the mode and tell the customer it will be late (pickable about {payload.get('air_pickable') or 'later'} by air, later by sea).", to=sales_agent_recipient(settings))
            result = "Kept the mode. The sales agent alert recipient was asked to tell the customer."
    elif item.get("Kind") == "forecast_promise_change":
        if item.get("Decision") == "accept_target" and payload.get("proposed_target"):
            await store.update_record("Shipments", ship["ID"], {"Target_Date": payload["proposed_target"]}, by_form=True)
            await store.add_record("Target_Date_Changes", {"Record_Type": "shipment", "Record_Id": str(ship["ID"]), "Record_No": ship.get("Shipment_No"), "Old_Date": _text(ship.get("Target_Date")), "New_Date": payload["proposed_target"], "Reason": "Accepted a proposed change from the forecast", "Changed_By": who, "Customer_Told": False, "Changed_At": zoho_now(), "Via": "approval_queue"})
            await notify(store, settings, ship=ship, type="Tell The Customer", message=f"{ship.get('Shipment_No')}: the target changed to {payload['proposed_target']}. Tell the customer.", to=sales_agent_recipient(settings))
            result = f"Target changed to {payload['proposed_target']}. Tell the customer."
        else:
            result = "Target kept."
    await rescore_shipments(store)
    return result
