# Fulfillment pipeline, Exception Control -> back to Pack & QC. Ported from
# server/modules/fulfillment/exception-recheck.mjs (the server-side version of the Exception
# Control widget's old "Completed -> Quality Check" hand-off).
#
# An exception unit (Exception_Control1 record, Qty 1) whose Status becomes "Completed" goes back
# to Pack & QC:
#   - ONLY the repaired units go back: the QC quantity is the number of repaired units.
#   - ONE pending QC record per item and package collects them: the first repaired unit creates it
#     (Quantity 1), the next adds to its Quantity while still pending (QC_Status blank). Once
#     decided, a later repair gets a new QC record. The record carries the exceptions it re-checks
#     (Recheck_Exceptions) so a second rejection reopens the SAME exception.
#   - Each exception is sent once (Sent_To_QC). Saving it again, or setting Completed again,
#     creates nothing.
# The QC record copies the header from the QC record that rejected the unit; the checker is the
# exception's "Checked By".
from app.deluge import blank, truthy
from app.fulfillment.events import log_item_event
from app.fulfillment.pipeline import advance_stage, next_visit_no
from app.fulfillment.where import eq
from app.workflows import register

EXC = "Exception_Control1"
QC = "Checker_Checklist"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _count(v) -> int:
    try:
        n = int(float(_text(v)))
        return n if n > 0 else 0
    except ValueError:
        return 0


async def repaired_to_qc(args: dict) -> None:
    exc, previous, store, user, id_ = args["record"], args.get("previous"), args["store"], args.get("user", ""), args.get("id")
    if _text(exc.get("Status")) != "Completed" or _text((previous or {}).get("Status")) == "Completed" or truthy(exc.get("Sent_To_QC")):
        return
    so, sku, pac, rr = _text(exc.get("Sales_Order")), _text(exc.get("SKU")), _text(exc.get("PAC")), _text(exc.get("RR_No"))
    if so == "" or sku == "":
        return
    exc_id = _text(exc.get("ID") or id_)

    origin = None
    if _text(exc.get("QC_ID")) != "":
        try:
            origin = await store.get_record_by_id(QC, _text(exc.get("QC_ID")), raw=True)
        except Exception:
            origin = None
    if not origin:
        all_qc = await store.find(QC, lambda c: _text(c.get("SO")) == so and _text(c.get("SKU")) == sku and _text(c.get("PAC")) == pac, criteria=eq("SO", so))
        origin = all_qc[-1] if all_qc else {}

    header = {
        "PR": origin.get("PR"), "Demo": origin.get("Demo"), "RR": origin.get("RR") if origin.get("RR") is not None else exc.get("RR_No"),
        "Order_Type": origin.get("Order_Type"), "Delivery_Type": origin.get("Delivery_Type"), "Target_Delivery_Date": origin.get("Target_Delivery_Date"),
        "For_Crate": origin.get("For_Crate"), "Bin_Location": origin.get("Bin_Location"),
        "Customer_Name": origin.get("Customer_Name") or exc.get("Customer_Name"), "Customer_Type": origin.get("Customer_Type") or exc.get("Customer_Type"),
        "Customer_Address": origin.get("Customer_Address") or exc.get("Customer_Address"), "Item_Name": origin.get("Item_Name") or exc.get("Item_Name"),
        "City": origin.get("City"), "Email": origin.get("Email"), "Contact": origin.get("Contact"),
        "Forecast_Delivery": origin.get("Forecast_Delivery"), "Forecast_Window": origin.get("Forecast_Window"), "Forecast_Status": origin.get("Forecast_Status"),
    }
    units = _count(exc.get("Qty")) or 1

    pending_rows = await store.find(QC, lambda c: _text(c.get("SO")) == so and _text(c.get("SKU")) == sku and _text(c.get("PAC")) == pac and _text(c.get("RR")) == _text(header["RR"]) and _text(c.get("QC_Status")) == "" and isinstance(c.get("Recheck_Exceptions"), list), criteria=eq("SO", so))
    pending = pending_rows[0] if pending_rows else None
    if pending:
        qc_id = pending["ID"]
        linked = [str(x) for x in pending["Recheck_Exceptions"]]
        if exc_id not in linked:
            await store.update_record(QC, pending["ID"], {"Quantity": str(_count(pending.get("Quantity")) + units), "Recheck_Exceptions": [*linked, exc_id]}, by_form=True)
    else:
        visit_no = await next_visit_no(store, so, sku, pac)
        qc_id = await store.add_record(QC, {"SO": so, "PAC": pac, "SKU": sku, "Visit_No": visit_no, **header, "Quantity": str(units), "Quality_Checker": _text(exc.get("Checker")), "Recheck_Exceptions": [exc_id]}, user)

    await store.update_record(EXC, exc_id, {"Sent_To_QC": True, "QC_Record": str(qc_id)}, by_form=True)
    await log_item_event(store, so, header["Item_Name"], sku, "package.rework_done", actor=user)   # the repair is finished and the unit goes back to QC
    await advance_stage(store, so, header["Item_Name"], sku, "Pack & QC")


register(EXC, {"afterAdd": repaired_to_qc, "afterUpdate": repaired_to_qc})
