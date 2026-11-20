# Fulfillment pipeline, the end of the line: Crate -> To Ship -> For Delivery, and the Pre-Order ->
# Readiness Gate entry. Ported from server/modules/fulfillment/crate-dispatch.mjs. Every write made
# here stays inside Fulfillment: nothing goes to Procurement, Books, Inventory or DMS.
#
#   Crate_Checklist saved      -> stage "Crate" (forward only).
#   Crating Status = Done      -> item goes to To Ship (Order_Aggregation1), For_Crate = true,
#                                  stage "Order Aggregation". Bin/city/email/contact come from the
#                                  item's approved QC record; the quantity is the crate's.
#   Order_Aggregation1 saved   -> Dispatch Selected checked: every item in the grid -> "For
#                                  Delivery"; not checked -> "Order Aggregation". Forward only.
#   Pre_Order_FF saved         -> Received + a Package_Number: the item is in the Readiness Gate
#                                  (one record per SO + SKU + package; an RR replacement is told
#                                  apart by its RR number), values copied as they are.
#
# Differences from Zoho, on purpose: the Crate stage is "Crate" until crating is Done; a stage only
# moves forward; the Pre-Order -> Gate key includes the package (and RR) so an RR replacement never
# overwrites the original item's Gate record.
from app.deluge import blank, truthy
from app.fulfillment.events import log_item_event
from app.fulfillment.pipeline import advance_stage
from app.fulfillment.qc_routing import upsert_to_ship
from app.fulfillment.where import eq
from app.workflows import register


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _count(v) -> int:
    try:
        n = int(float(_text(v)))
        return n if n > 0 else 0
    except ValueError:
        return 0


async def crate_to_ship(args: dict) -> None:
    c, store, user = args["record"], args["store"], args.get("user", "")
    so, sku, pac = _text(c.get("SO")), _text(c.get("SKU")), _text(c.get("Package_Order"))
    if so == "" or sku == "":
        return
    if _text(c.get("Crating_Status1")) != "Done":
        await advance_stage(store, so, c.get("Item_Name"), sku, "Crate")
        return

    if _text((args.get("previous") or {}).get("Crating_Status1")) != "Done":   # package.crated, once, when crating becomes Done
        await log_item_event(store, so, c.get("Item_Name"), sku, "package.crated", actor=user)
    qcs = await store.find("Checker_Checklist", lambda r: _text(r.get("SO")) == so and _text(r.get("SKU")) == sku and _text(r.get("PAC")) == pac and _text(r.get("QC_Status")) == "Approved", criteria=eq("SO", so))
    from_ = qcs[0] if qcs else {}
    await upsert_to_ship(store, user, so, {
        "ORDER_TYPE": c.get("Order_Type"), "Target_Date": c.get("Target_Delivery_Date"), "PR": c.get("PR_if_any"), "DEMO": c.get("Dem_if_any"), "DELIVERY_TYPE": c.get("Delivery_Type"),
        "Customer_Name": c.get("Customer_Name"), "Customer_Address": c.get("Customer_Address"), "Customer_Type": c.get("Customer_Type"),
        "City": from_.get("City"), "Email": from_.get("Email"), "Contact": from_.get("Contact"),
        "Forecast_Delivery": c.get("Forecast_Delivery"), "Forecast_Window": c.get("Forecast_Window"), "Forecast_Status": c.get("Forecast_Status"),
    }, {"Item_Name": c.get("Item_Name"), "SKU": sku, "QTY": _count(c.get("Quantity")), "Bin_Location": _text(from_.get("Bin_Location")), "PAC": pac}, {"For_Crate": True})
    await advance_stage(store, so, c.get("Item_Name"), sku, "Order Aggregation")


register("Crate_Checklist", {"afterAdd": crate_to_ship, "afterUpdate": crate_to_ship})


async def dispatch_stage(args: dict) -> None:
    agg, store = args["record"], args["store"]
    so = _text(agg.get("SO"))
    if so == "":
        return
    stage = "For Delivery" if truthy(agg.get("Dispatch_Selected")) else "Order Aggregation"
    for row in agg.get("Item_Details") or []:
        await advance_stage(store, so, row.get("Item_Name"), _text(row.get("SKU")), stage)


register("Order_Aggregation1", {"afterAdd": dispatch_stage, "afterUpdate": dispatch_stage})


GATE = "Sales_Order_Readiness_Gate"


async def pre_order_to_gate(args: dict) -> None:
    p, store, user = args["record"], args["store"], args.get("user", "")
    so, sku, pkg = _text(p.get("SO")), _text(p.get("SKU")), _text(p.get("Package_Number"))
    if so == "" or sku == "" or pkg == "" or _text(p.get("Pre_Order_Status")) != "Received":
        return

    rr = ", ".join(dict.fromkeys(_text(r.get("RR")) for r in (p.get("Replacement_Request") or []) if _text(r.get("RR")) != ""))
    values = {
        "Order_Type": p.get("Order_Type"), "Package_Order": pkg, "Delivery_Type": p.get("Delivery_Type"), "For_Crate": truthy(p.get("For_Crate")), "payment_status": p.get("Status"),
        "customer_name": _text(p.get("Customer_Name")), "customer_type": p.get("Customer_Type"), "customer_address": _text(p.get("Customer_Address")),
        "pr_number": _text(p.get("PR")), "rr_number": rr, "Item_Name": _text(p.get("Item_Name")), "Quantity": _text(p.get("Qty")), "Bin_Location": _text(p.get("Bin_Location")),
        "Target_Delivery_Date": p.get("Target_Delivery"), "Forecast_Delivery": _text(p.get("Forecast_Delivery")), "Forecast_Window": _text(p.get("Forecast_Window")), "Forecast_Status": _text(p.get("Forecast_Status")),
    }
    keep_if_empty = {"customer_name", "customer_address", "Forecast_Delivery", "Forecast_Window", "Forecast_Status", "Bin_Location"}
    existing = await store.find(GATE, lambda g: _text(g.get("sales_order_number")) == so and _text(g.get("SKU")) == sku and _text(g.get("Package_Order")) == pkg and _text(g.get("rr_number")) == rr, criteria=eq("sales_order_number", so))
    for g in existing:
        patch = {k: v for k, v in values.items() if not (k in keep_if_empty and v == "" and not blank(g.get(k)))}
        await store.update_record(GATE, g["ID"], patch, by_form=True)
    if not existing:
        await store.add_record(GATE, {"sales_order_number": so, "SKU": sku, **values}, user)


register("Pre_Order_FF", {"afterAdd": pre_order_to_gate, "afterUpdate": pre_order_to_gate})
