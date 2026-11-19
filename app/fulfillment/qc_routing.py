# Fulfillment pipeline, Pack & QC -> Crate / To Ship / Exception Control. Ported from
# server/modules/fulfillment/qc-routing.mjs.
#
# Per QC record saved with a QC_Status (Quantity is the number of units that status covers):
#   Rejected  -> Exception Control: one Exception_Control1 record per rejected unit (Qty 1 each,
#                EXC-FF-nnnnn), tagged with the QC record it came from (QC_ID). Grow-only per QC
#                record. A re-check of repaired units that fails again REOPENS its exception.
#   Approved  -> For_Crate -> Crate_Checklist; not crated -> Order_Aggregation1 (To Ship). Stage
#                moves forward to "Crate" or "Order Aggregation".
# A split write is two writes from the Pack & QC page on the same QC record (Rejected share, then
# Approved share). Each write routes its own share. The Approved row's quantity is always the SUM
# of every Approved QC record for that SO + SKU + package.
#
# Differences from Zoho, on purpose: the Readiness Gate quantity is NOT rewritten; here the
# matching To Ship row is updated in place rather than rebuilt.
import re

from app.criteria import zoho_now
from app.deluge import blank
from app.fulfillment.pipeline import advance_stage
from app.fulfillment.where import eq
from app.workflows import register

QC = "Checker_Checklist"
EXC = "Exception_Control1"
CRATE = "Crate_Checklist"
AGG = "Order_Aggregation1"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _count(v) -> int:
    try:
        n = int(float(_text(v)))
        return n if n > 0 else 0
    except ValueError:
        return 0


def _is_crate(v) -> bool:
    return v is True or str(_text(v)).lower() in ("true", "yes", "1")


def _spare_parts(rows) -> dict:
    types, pairs = [], []
    for row in rows or []:
        type_ = _text(row.get("Spare_Part_Type"))
        if type_ == "":
            continue
        other = _text(row.get("Spare_Part_Type_Other"))
        name = other if type_ == "Others" and other != "" else type_
        types.append(name)
        pairs.append(f"{name}: {_text(row.get('Quantity_of_damage_spare_s')) or '—'}")
    return {"type": ", ".join(types), "qty": ", ".join(pairs)}


async def _supplier_of(store, pr) -> str:
    if pr == "":
        return ""
    try:
        rows = await store.find("Purchase_Request1", lambda r: _text(r.get("PR_Number")) == pr or _text(r.get("PR_No")) == pr, criteria=f'{eq("PR_Number", pr)} || {eq("PR_No", pr)}')
        return _text(rows[0].get("Supplier")) if rows else ""
    except Exception:
        return ""


async def _rejected_to_exception(ctx: dict, so, sku, pac, units) -> None:
    qc, store, user, id_ = ctx["record"], ctx["store"], ctx.get("user", ""), ctx.get("id")
    spare = _spare_parts(qc.get("Spare_part_type"))
    shared = {
        "RR_No": qc.get("RR"), "PR": qc.get("PR"), "Demo1": qc.get("Demo"), "Order_Type": qc.get("Order_Type"), "DELIVERY_TYPE": qc.get("Delivery_Type"),
        "Source_Module": "Checker_Checklist (QC Rejected)", "Checker": qc.get("Quality_Checker"), "Remarks": qc.get("Remarks"),
        "Customer_Name": qc.get("Customer_Name"), "Customer_Type": qc.get("Customer_Type"), "Customer_Address": qc.get("Customer_Address"),
        "Item_to_Replace3": qc.get("Item_to_Replace"), "Quantity": qc.get("Quantity_of_Damage_Items"),
        "Item_to_Replace1": spare["type"], "Quantity_of_damage_spare_s": spare["qty"], "Item_Name": qc.get("Item_Name"),
    }
    qc_id = _text(qc.get("ID") or id_)
    back = {str(x) for x in (qc.get("Recheck_Exceptions") if isinstance(qc.get("Recheck_Exceptions"), list) else [])}
    existing = await store.find(EXC, lambda e: _text(e.get("QC_ID")) == qc_id or (len(back) == 0 and _text(e.get("QC_ID")) == "" and _text(e.get("Sales_Order")) == so and _text(e.get("SKU")) == sku and _text(e.get("PAC")) == pac))
    for e in existing:
        await store.update_record(EXC, e["ID"], shared, by_form=True)
    need = units - len(existing)
    if need < 1:
        return

    if back:
        for e in await store.find(EXC, lambda x: str(x["ID"]) in back and _text(x.get("QC_ID")) != qc_id):
            if need < 1:
                break
            await store.update_record(EXC, e["ID"], {**shared, "Status": "Pending", "Rework_Status": "Pending Assessment", "Sent_To_QC": False, "QC_ID": qc_id}, by_form=True)
            need -= 1
        if need < 1:
            return

    supplier = await _supplier_of(store, _text(qc.get("PR")))
    max_num = 0
    for e in await store.find(EXC):
        m = re.match(r"^EXC-FF-(\d+)$", _text(e.get("Exception_Number")))
        if m:
            max_num = max(max_num, int(m.group(1)))
    for i in range(1, need + 1):
        number = f"EXC-FF-{str(max_num + i).zfill(5)}"
        exc_id = await store.add_record(EXC, {"Sales_Order": so, "SKU": sku, "PAC": pac, "Exception_Number": number, "Supplier": supplier, "Qty": 1, "QC_ID": qc_id, **shared}, user)
        try:
            await store.add_record("ExceptionControl_Notifications", {
                "Recipient_Email": "homecartelff@gmail.com", "Notification_Type": "Exception Record Created",
                "Message": f"New Exception Control record — {so} ({_text(qc.get('Item_Name'))}) — {number}.",
                "Created_On": zoho_now(), "Read": False, "Target_URL": "", "Source_Record_No": so, "Source_Record_ID": exc_id,
            }, user)
        except Exception as e:
            print(f"[qc-routing] exception notification: {e}")


async def _approved_total(store, so, sku, pac, fallback) -> int:
    rows = await store.find(QC, lambda c: _text(c.get("SO")) == so and _text(c.get("SKU")) == sku and _text(c.get("PAC")) == pac and _text(c.get("QC_Status")) == "Approved", criteria=eq("SO", so))
    total = sum(_count(c.get("Quantity")) for c in rows)
    return total if total > 0 else fallback


async def _approved_to_crate(ctx: dict, so, sku, pac, units) -> None:
    qc, store, user = ctx["record"], ctx["store"], ctx.get("user", "")
    fields = {
        "PR_if_any": qc.get("PR"), "RR_if_any": qc.get("RR"), "Order_Type": qc.get("Order_Type"), "Target_Delivery_Date": qc.get("Target_Delivery_Date"),
        "Delivery_Type": qc.get("Delivery_Type"), "Customer_Name": qc.get("Customer_Name"), "Customer_Address": qc.get("Customer_Address"), "Customer_Type": qc.get("Customer_Type"),
        "Item_Name": qc.get("Item_Name"), "Quantity": await _approved_total(store, so, sku, pac, units), "Assigned_Checker": qc.get("Quality_Checker"),
        "Forecast_Delivery": qc.get("Forecast_Delivery"), "Forecast_Window": qc.get("Forecast_Window"), "Forecast_Status": qc.get("Forecast_Status"),
    }
    existing = await store.find(CRATE, lambda c: _text(c.get("SO")) == so and _text(c.get("SKU")) == sku and _text(c.get("Package_Order")) == pac, criteria=eq("SO", so))
    if existing:
        for c in existing:
            await store.update_record(CRATE, c["ID"], fields, by_form=True)
    else:
        await store.add_record(CRATE, {"SO": so, "Package_Order": pac, "SKU": sku, **fields}, user)


async def upsert_to_ship(store, user, so, header: dict, item: dict, extra: dict | None = None) -> None:
    extra = extra or {}
    aggs = await store.find(AGG, lambda a: _text(a.get("SO")) == so, criteria=eq("SO", so))
    agg = aggs[0] if aggs else None
    if not agg:
        await store.add_record(AGG, {"SO": so, "PAC": item["PAC"], **header, **extra, "Item_Details": [item]}, user)
        return
    rows = [dict(r) for r in agg.get("Item_Details") or []]
    row = next((r for r in rows if _text(r.get("SKU")) == item["SKU"] and _text(r.get("PAC")) == item["PAC"]), None)
    if row:
        row["QTY"] = item["QTY"]
        if _text(item.get("Bin_Location")) != "":
            row["Bin_Location"] = item["Bin_Location"]
        if _text(item.get("Item_Name")) != "":
            row["Item_Name"] = item["Item_Name"]
    else:
        rows.append(item)
    patch = {"Item_Details": rows, **extra}
    for k in ["City", "Email", "Contact", "Forecast_Delivery", "Forecast_Window", "Forecast_Status"]:
        if _text(header.get(k)) != "" and _text(agg.get(k)) == "":
            patch[k] = header[k]
    await store.update_record(AGG, agg["ID"], patch, by_form=True)


async def _approved_to_ship(ctx: dict, so, sku, pac, units) -> None:
    qc, store, user = ctx["record"], ctx["store"], ctx.get("user", "")
    qty = await _approved_total(store, so, sku, pac, units)
    await upsert_to_ship(store, user, so, {
        "ORDER_TYPE": qc.get("Order_Type"), "Target_Date": qc.get("Target_Delivery_Date"), "PR": qc.get("PR"), "DEMO": qc.get("Demo"), "DELIVERY_TYPE": qc.get("Delivery_Type"),
        "Customer_Name": qc.get("Customer_Name"), "Customer_Address": qc.get("Customer_Address"), "Customer_Type": qc.get("Customer_Type"),
        "City": qc.get("City"), "Email": qc.get("Email"), "Contact": qc.get("Contact"),
        "Forecast_Delivery": qc.get("Forecast_Delivery"), "Forecast_Window": qc.get("Forecast_Window"), "Forecast_Status": qc.get("Forecast_Status"),
    }, {"Item_Name": qc.get("Item_Name"), "SKU": sku, "QTY": qty, "Bin_Location": qc.get("Bin_Location"), "PAC": pac})


async def qc_routing(ctx: dict) -> None:
    qc = ctx["record"]
    status = _text(qc.get("QC_Status"))
    if status not in ("Approved", "Rejected"):
        return
    so, sku, pac, units = _text(qc.get("SO")), _text(qc.get("SKU")), _text(qc.get("PAC")), _count(qc.get("Quantity"))
    if so == "" or sku == "" or units < 1:
        return

    if status == "Rejected":
        await _rejected_to_exception(ctx, so, sku, pac, units)
        return
    if _is_crate(qc.get("For_Crate")):
        await _approved_to_crate(ctx, so, sku, pac, units)
        await advance_stage(ctx["store"], so, qc.get("Item_Name"), sku, "Crate")
    else:
        await _approved_to_ship(ctx, so, sku, pac, units)
        await advance_stage(ctx["store"], so, qc.get("Item_Name"), sku, "Order Aggregation")


register(QC, {"afterAdd": qc_routing, "afterUpdate": qc_routing})
