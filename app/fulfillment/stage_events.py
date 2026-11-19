# Fulfillment stage event log (spec: HomeCartel v1.4, 01 Database §8 stage_events). Write-only this
# slice -- logs a Stage_Events row whenever Sales_Order_Fulfillment.Fulfillment_Stage actually
# changes. One generic hook catches every current and future write site (pipeline.py's
# advance_stage and reconcile_fulfillment, workflows.py's stage_on_save and stage_on_gate_save --
# five as of this writing) rather than a logging call added at each one individually. Ported from
# server/modules/fulfillment/stage-events.mjs.
import re

from app.criteria import zoho_now
from app.deluge import blank
from app.workflows import register

SOF = "Sales_Order_Fulfillment"
EVENTS = "Stage_Events"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


# 'Pack & QC' -> 'pack_qc'. Derived from the stage string itself, not a hand-listed table, so it
# can never drift from pipeline.py's STAGE_ORDER.
def stage_slug(stage) -> str:
    s = _text(stage).lower().replace("&", " ").strip()
    return re.sub(r"\s+", "_", s)


async def _log_stage_event(store, id_, stage) -> None:
    slug = stage_slug(stage)
    if slug == "":
        return
    stamp = zoho_now()
    await store.add_record(EVENTS, {
        "Record_Type": "package", "Record_Id": _text(id_), "Event": f"package.{slug}",
        "Occurred_At": stamp, "Reported_At": stamp, "Source": "system",
    })


async def _on_add(args: dict) -> None:
    await _log_stage_event(args["store"], args.get("id"), args["record"].get("Fulfillment_Stage"))


async def _on_update(args: dict) -> None:
    record, previous = args["record"], args.get("previous")
    if _text(record.get("Fulfillment_Stage")) == _text((previous or {}).get("Fulfillment_Stage")):
        return
    await _log_stage_event(args["store"], args.get("id"), record.get("Fulfillment_Stage"))


register(SOF, {"afterAdd": _on_add, "afterUpdate": _on_update})
