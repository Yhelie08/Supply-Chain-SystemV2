# Fulfillment workflow ports. Ported from server/modules/fulfillment/workflows.mjs.
#
# The seven Instant Forecast workflows (the forecast of an order is worked out when its Gate, Pick,
# QC, Crate, Order Aggregation, Pre Order or Fulfillment row is saved) are shared forecast code:
# app/forecast/hooks.py.
import app.forecast.hooks  # noqa: F401 -- side effect: registers the 7 Instant Forecast hooks
#
# Stage rule for a package (Sales_Order_Fulfillment record):
#   - No package number (PAC#) yet                           -> "Waiting For Package"
#   - Package number and PAID (Status "Yes")                 -> "Order Readiness" (credit terms count too)
#   - Package number but Partial/unpaid, NOT approved yet    -> "Need Approval"
#   - Approved (every Gate record of the package has a valid Override_Approved for ITS payment
#     status) -> "Order Readiness". "Valid" = approved for the payment status the record has NOW.
# Only these three stages are managed here. A record already further along (Picking, Pack & QC,
# Crate, For Delivery) is never moved back or forward by this rule.
from app.deluge import blank, truthy
from app.fulfillment.where import eq
from app.workflows import register

SOF = "Sales_Order_Fulfillment"
GATE = "Sales_Order_Readiness_Gate"
WAITING = "Waiting For Package"
NEED_APPROVAL = "Need Approval"
READINESS = "Order Readiness"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _has_package(v) -> bool:
    return _text(v).strip() != ""


def needs_payment_approval(gate: dict) -> bool:
    paid = _text(gate.get("payment_status"))
    if paid in ("", "Yes"):
        return False
    if truthy(gate.get("Has_Credit_Terms")):
        return False
    return not (truthy(gate.get("Override_Approved")) and _text(gate.get("Override_Approved_For_Status")) == paid)


async def package_stage(store, sof: dict) -> str | None:
    stage = sof.get("Fulfillment_Stage")
    if stage not in (WAITING, NEED_APPROVAL, READINESS):
        return stage
    if not _has_package(sof.get("Package")):
        return WAITING
    if sof.get("Status") == "Yes" or truthy(sof.get("Has_Credit_Terms")):
        return READINESS
    so_no = _text(sof.get("SO_No"))
    gates = await store.find(GATE, lambda g: _text(g.get("sales_order_number")) == so_no and _text(g.get("Package_Order")) == _text(sof.get("Package")), criteria=eq("sales_order_number", so_no))
    paid = _text(sof.get("Status"))
    ok = gates and all(not needs_payment_approval({**g, "payment_status": paid or g.get("payment_status")}) for g in gates)
    return READINESS if ok else NEED_APPROVAL


async def _stage_on_save(args: dict) -> None:
    input_, previous, store = args["input"], args.get("previous"), args["store"]
    next_stage = await package_stage(store, {**(previous or {}), **input_})
    current = input_.get("Fulfillment_Stage", (previous or {}).get("Fulfillment_Stage"))
    if next_stage is not None and next_stage != current:
        input_["Fulfillment_Stage"] = next_stage


register(SOF, {"beforeAdd": _stage_on_save, "beforeUpdate": _stage_on_save})


async def _stage_on_gate_save(args: dict) -> None:
    gate, store = args["record"], args["store"]
    so, pkg = _text(gate.get("sales_order_number")), _text(gate.get("Package_Order"))
    if so == "" or pkg == "":
        return
    for sof in await store.find(SOF, lambda r: _text(r.get("SO_No")) == so and _text(r.get("Package")) == pkg, criteria=eq("SO_No", so)):
        want = await package_stage(store, sof)
        if want != sof.get("Fulfillment_Stage"):
            await store.update_record(SOF, sof["ID"], {"Fulfillment_Stage": want}, by_form=True)


register(GATE, {"afterAdd": _stage_on_gate_save, "afterUpdate": _stage_on_gate_save})


# Warehouse_Request_Item_Im (Warehouse_Request, on add or edit, on success): an item row with no
# image takes the image of its item.
def _empty(v) -> bool:
    s = _text(v)
    return s in ("", "{}", "[]")


async def _item_images(args: dict) -> None:
    record, store = args["record"], args["store"]
    changed = False
    rows = []
    for row in record.get("Item") or []:
        items_val = row.get("Items")
        item_id = _text(items_val.get("ID") if isinstance(items_val, dict) else items_val)
        if _empty(row.get("Image")) and item_id != "":
            try:
                item = await store.get_record_by_id("Items", item_id, raw=True)
            except Exception:
                item = None
            if item and not blank(item.get("Image")):
                rows.append({**row, "Image": item["Image"]})
                changed = True
                continue
        rows.append(row)
    if changed:
        await store.update_record("Warehouse_Request", _text(record.get("ID") or args.get("id")), {"Item": rows}, by_form=True)


register("Warehouse_Request", {"afterAdd": _item_images, "afterUpdate": _item_images})
