# Fulfillment stage event log (spec: HomeCartel v1.4, 01 Database §8 stage_events). Write-only this
# slice -- logs a Stage_Events row whenever Sales_Order_Fulfillment.Fulfillment_Stage actually
# changes. This hook catches the saves that come through the hooked store (a widget, the API). The
# writes a hook or a sweep makes through the RAW store never fire a hook, so those go through
# stage.set_stage(), which logs the same row (fix 2026-11-20, plan step 7.0; the original Node port
# missed them and logged only a package's first stage).
from app.fulfillment.events import log_package_event
from app.fulfillment.stage import EVENTS, SOF, _text, log_stage_event, stage_slug  # noqa: F401 -- stage_slug is re-exported
from app.fulfillment.where import eq
from app.workflows import register

GATE = "Sales_Order_Readiness_Gate"
STARTING_STAGE = "Waiting For Package"


async def _on_add(args: dict) -> None:
    # a package that is created: package.created, then the stage it starts in (unless that is the first stage, which "created" already says)
    store, id_, stage = args["store"], args.get("id"), _text(args["record"].get("Fulfillment_Stage"))
    await log_package_event(store, id_, "package.created", actor=args.get("user", ""))
    if stage and stage != STARTING_STAGE:
        await log_stage_event(store, id_, stage)


async def _on_update(args: dict) -> None:
    record, previous, store, id_ = args["record"], args.get("previous") or {}, args["store"], args.get("id")
    if _text(record.get("Fulfillment_Stage")) != _text(previous.get("Fulfillment_Stage")):
        await log_stage_event(store, id_, record.get("Fulfillment_Stage"))
    # the real box count became known (PKG-R3: estimated until someone counts)
    if _text(record.get("Box_Count_Source")) == "counted" and _text(previous.get("Box_Count_Source")) != "counted":
        await log_package_event(store, id_, "package.box_counted", note=f"{_text(record.get('Box_Count'))} boxes".strip(), actor=args.get("user", ""))


register(SOF, {"afterAdd": _on_add, "afterUpdate": _on_update})


async def _on_gate_update(args: dict) -> None:
    # a picker is chosen for an item of the package (the first time, or a different one)
    record, previous, store = args["record"], args.get("previous") or {}, args["store"]
    picker = _text(record.get("Assign_Picker"))
    if picker == "" or picker == _text(previous.get("Assign_Picker")):
        return
    so, pkg = _text(record.get("sales_order_number")), _text(record.get("Package_Order"))
    if so == "":
        return
    for sof in await store.find(SOF, lambda r: _text(r.get("SO_No")) == so and (pkg == "" or _text(r.get("Package")) == pkg), criteria=eq("SO_No", so)):
        await log_package_event(store, sof["ID"], "package.picker_assigned", note=f"{_text(record.get('SKU'))}: {picker}", actor=args.get("user", ""))


register(GATE, {"afterUpdate": _on_gate_update})
