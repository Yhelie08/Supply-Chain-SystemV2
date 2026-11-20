# The package event log with the names of spec v1.4 (05 Shared Engines / 04 Timestamps and Event Log, "Package" row; owner decision
# 2026-11-20: follow the document). One place writes a Stage_Events row for a package: log_package_event().
#
# Two kinds of event:
#   - ENTERING A STAGE (T-1, one stamp each time a package enters a stage). The stage decides the name, see STAGE_EVENT.
#   - A THING THAT HAPPENED, which is not a stage change: qc_passed, qc_rejected, rework_done, crated, box_counted, picker_assigned,
#     blocked, unblocked. They are logged by the code that does that work (T-4: a side effect of real work, never a button).
#
# T-6: an event stamp is set the first time; coming back is a NEW row with visit_no 2, 3, ... and the first row is never touched.
#
# Rows written before 2026-11-20 carry the old name package.<stage> (package.order_aggregation, package.picking, ...). They are still
# understood: stage_event_names() gives both names for a stage and event_aliases() both for an event, so the aging guard and the visit
# count read old and new rows alike. Nothing rewrites the old rows (the log is history).
#
# NOT built, because nothing in today's flow marks the moment (T-4): package.entered_queue (it is the same moment as package.ready),
# qc_started, rework_started. "Aggregated" is stamped when the package ARRIVES at Order Aggregation, because the separate "confirm all
# boxes are at the loading area" step (OA-R2) does not exist yet.
import re

from app.criteria import zoho_now
from app.deluge import blank
from app.fulfillment.where import eq

EVENTS = "Stage_Events"
SOF = "Sales_Order_Fulfillment"

# entering this stage stamps this event
STAGE_EVENT = {
    "Waiting For Package": "package.created",
    "Need Approval": "package.need_approval",   # not in the spec's list; kept so the aging guard can count the days in it
    "Order Readiness": "package.ready",
    "Picking": "package.released",
    "Pack & QC": "package.picked",
    "Crate": "package.crate",                    # not in the spec's list ("crated" = crating done, see events below)
    "Order Aggregation": "package.aggregated",
    "For Delivery": "package.dispatched",
}
_STAGE_OF_EVENT = {v: k for k, v in STAGE_EVENT.items()}


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def stage_slug(stage) -> str:
    """'Pack & QC' -> 'pack_qc'. Derived from the stage text itself, so it cannot drift from the pipeline's stage list."""
    s = _text(stage).lower().replace("&", " ").strip()
    return re.sub(r"\s+", "_", s)


def legacy_event_name(stage) -> str:
    """The name rows written before 2026-11-20 carry for entering this stage."""
    slug = stage_slug(stage)
    return f"package.{slug}" if slug else ""


def stage_event_name(stage) -> str:
    """The event stamped when a package enters `stage` ('' for a blank stage)."""
    return STAGE_EVENT.get(_text(stage)) or legacy_event_name(stage)


def stage_event_names(stage) -> set[str]:
    """New and old name of the stage-entry event (old rows count as the same event)."""
    names = {stage_event_name(stage), legacy_event_name(stage)}
    names.discard("")
    return names


def event_aliases(event: str) -> set[str]:
    """The event and, for a stage-entry event, its old name."""
    stage = _STAGE_OF_EVENT.get(event)
    return {event, legacy_event_name(stage)} if stage else {event}


async def log_package_event(store, id_, event: str, *, note: str = "", actor: str = "") -> int:
    """Writes one Stage_Events row for the package `id_` (the Sales_Order_Fulfillment record id) and returns its visit number.
    The server stamps the time (T-2), both times are the same because the system itself is the reporter (T-3)."""
    if not event:
        return 0
    names = event_aliases(event)
    pid = _text(id_)
    seen = await store.find(EVENTS, lambda r: _text(r.get("Record_Type")) == "package" and _text(r.get("Record_Id")) == pid and _text(r.get("Event")) in names,
                            criteria=eq("Record_Id", pid))
    visit = len(seen) + 1
    stamp = zoho_now()
    await store.add_record(EVENTS, {
        "Record_Type": "package", "Record_Id": pid, "Event": event, "Occurred_At": stamp, "Reported_At": stamp, "Occurred_Bound": "exact",
        "Source": "system", "Visit_No": visit, "Note": note, "Actor": actor,
    })
    return visit


async def packages_holding_item(store, so, item_name, sku) -> list[dict]:
    """The package record(s) of sales order `so` whose item list holds this item (the same lookup advance_stage uses)."""
    out = []
    for sof in await store.find(SOF, lambda r: r.get("SO_No") == so, criteria=eq("SO_No", so)):
        if any(_text(row.get("Item")) == _text(item_name) and _text(row.get("SKU")) == _text(sku) for row in sof.get("Item_Details1") or []):
            out.append(sof)
    return out


async def log_item_event(store, so, item_name, sku, event: str, *, note: str = "", actor: str = "") -> None:
    """A package event caused by one item (a QC decision, a crate): logged on each package that holds the item, with the SKU in the note."""
    text = f"{sku}" + (f": {note}" if note else "")
    for sof in await packages_holding_item(store, so, item_name, sku):
        await log_package_event(store, sof["ID"], event, note=text, actor=actor)
