# The purchase-request side of the forecast, ported from server/forecast/purchase-request.mjs
# (itself from zoho-export/parsed/functions/fcStampPurchaseRequest.dg and fcPrToPreOrder.dg),
# called by the workflow PR1_Forecast_Stamp ("on add or edit, on success" of Purchase_Request1).
#
# A SECOND version of the ladder, not a copy of fc_stamp_by_so_no ("mirrors Zoho", kept as written):
#  - Nothing is stamped until the PR has a shipment mode (Local sourcing is exempt).
#  - The window text has no "+Nd vs client" part; only the status uses the client date.
#  - The supplier lead time is added only when the shipment branch is NOT taken.
#  - The shipment branch loops all shipment rows with this PR; each row overrides the one before.
#  - With no Sales_Order_Fulfillment row the PR is never stock on hand.
#  - It always writes the PR and the SOF row (here only a value that differs).
from datetime import date

from app.deluge import today_date
from app.forecast.engine import bucket_of, finish
from app.forecast.forecast_settings import forecast_settings
from app.forecast.stamp import to_date, txt

_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _blank(v) -> bool:
    return v is None or v == ""


def _day_of(v) -> str:
    d = to_date(v)
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}" if d else ""


def _long_date(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{_MON[int(m) - 1]} {d}, {y}"


_PREP = ["Picking", "Pack", "Quality Checking", "Crate"]


async def _stamp_if_different(store, form: str, row: dict, f: dict) -> None:
    changes = {}
    if _day_of(row.get("Forecast_Delivery")) != f["delivery"]:
        changes["Forecast_Delivery"] = f["delivery"]
    if row.get("Forecast_Window") != f["window"]:
        changes["Forecast_Window"] = f["window"]
    if row.get("Forecast_Status") != f["status"]:
        changes["Forecast_Status"] = f["status"]
    if changes:
        await store.update_record(form, row["ID"], changes, by_form=True)


async def fc_stamp_purchase_request(store, pr_id, *, today: date | None = None) -> str:
    today = today or today_date()
    settings = await forecast_settings(store)
    id_ = str(pr_id or "")
    prs = await store.find("Purchase_Request1", lambda r: r.get("ID") == id_)
    pr = prs[0] if prs else None

    pr_no = txt(pr.get("PR_No")) if pr else ""
    mode_val = txt(pr.get("Shipment_Mode")) if pr else ""
    src_val = txt(pr.get("Sourcing_Type")).upper() if pr else ""
    sup_lead = 0
    if pr and not _blank(pr.get("Required_Days_Lead")):
        try:
            sup_lead = int(float(pr.get("Required_Days_Lead")))
        except (TypeError, ValueError):
            sup_lead = 0
    if not pr or _blank(pr.get("Added_Time")) or not to_date(pr.get("Added_Time")):
        return f"walang PR o walang Added_Time: {id_}"
    anchor = to_date(pr.get("Added_Time"))

    sof = None
    so_no = stage = ""
    stock_on_hand = False
    client_target = None
    if pr_no != "":
        sofs = await store.find("Sales_Order_Fulfillment", lambda r: r.get("PR_No") == pr_no)
        if sofs:
            sof = sofs[0]
            so_no = txt(sof.get("SO_No"))
            stage = txt(sof.get("Fulfillment_Stage"))
            stock_on_hand = "PRE ORDER" not in txt(sof.get("order_type")).upper()
            client_target = None if _blank(sof.get("target_delivery_date")) else to_date(sof.get("target_delivery_date"))

    prep_start = None
    if so_no != "":
        rows = (
            await store.find("Sales_Order_Readiness_Gate", lambda r: r.get("sales_order_number") == so_no)
            + await store.find("Pick1", lambda r: r.get("SO") == so_no)
            + await store.find("Checker_Checklist", lambda r: r.get("SO") == so_no)
            + await store.find("Crate_Checklist", lambda r: r.get("SO") == so_no)
        )
        for r in rows:
            d = None if _blank(r.get("Added_Time")) else to_date(r.get("Added_Time"))
            if d and (not prep_start or d < prep_start):
                prep_start = d

    if mode_val.upper() == "" and src_val != "LOCAL":
        return f"wala pang Shipment Mode ang {pr_no} — hindi muna nagtatatak"
    b = bucket_of(settings, src_val, mode_val)
    t_min, t_max, c_min, c_max, bucket = b["tMin"], b["tMax"], b["cMin"], b["cMax"], b["bucket"]

    position = "Procurement"
    s_min = t_min + c_min + settings["prepMin"] + settings["delMin"]
    s_max = t_max + c_max + settings["prepMax"] + settings["delMax"]
    laddered = False
    if settings["reAnchor"] and stage == "For Delivery":
        anchor = today
        s_min, s_max = settings["delMin"], settings["delMax"]
        position = "Ready"
        laddered = True
    elif (settings["reAnchor"] and stage == "Order Readiness") or stage in _PREP:
        anchor = today
        used = abs((today - prep_start).days) if prep_start else 0
        s_min = max(0, settings["prepMin"] - used) + settings["delMin"]
        s_max = max(0, settings["prepMax"] - used) + settings["delMax"]
        position = stage
        laddered = True
    if not laddered and stock_on_hand:
        anchor = today
        s_min, s_max = settings["prepMin"] + settings["delMin"], settings["prepMax"] + settings["delMax"]
        position = "Stock on hand"
        laddered = True
    if not laddered and settings["reAnchor"] and pr_no != "":
        for sh in await store.find("Shipments"):
            for row in sh.get("Supplier_Shipment_Details") or []:
                if txt(row.get("PR_No")) != pr_no:
                    continue
                shipped = None if _blank(row.get("Date_Shipped")) else to_date(row.get("Date_Shipped"))
                if txt(sh.get("Shipment_Status")) == "Delivered":
                    anchor = today
                    s_min, s_max = settings["prepMin"] + settings["delMin"], settings["prepMax"] + settings["delMax"]
                    position = "At WH"
                elif shipped:
                    anchor = shipped
                    position = "In transit"
    elif not laddered and settings["addSupLead"]:
        s_min += sup_lead
        s_max += sup_lead

    f = finish({"today": today, "anchor": anchor, "sumMin": s_min, "sumMax": s_max, "bucket": bucket, "position": position, "clientTarget": client_target, "variance": False})
    await _stamp_if_different(store, "Purchase_Request1", pr, f)
    if sof:
        await _stamp_if_different(store, "Sales_Order_Fulfillment", sof, f)
    return f"{pr_no} -> {_long_date(f['delivery'])} | {f['window']} | {f['status']}"


async def fc_pr_to_pre_order(store, pr_id, *, today: date | None = None) -> str:
    engine_said = await fc_stamp_purchase_request(store, pr_id, today=today)
    prs = await store.find("Purchase_Request1", lambda r: r.get("ID") == str(pr_id or ""))
    pr = prs[0] if prs else None
    pr_no = txt(pr.get("PR_No")) if pr else ""
    if not pr or pr_no == "":
        return f"walang PR na {pr_id}"
    fc_date = None if _blank(pr.get("Forecast_Delivery")) else _day_of(pr.get("Forecast_Delivery"))
    fc_window = pr.get("Forecast_Window") or ""
    fc_status = pr.get("Forecast_Status") or ""
    if fc_date is None and fc_status == "":
        return f"{pr_no} — wala pang forecast ang PR mismo. {engine_said}"
    hit = 0
    for po in await store.find("Pre_Order_FF", lambda r: r.get("PR") == pr_no):
        changes = {}
        if _day_of(po.get("Forecast_Delivery")) != (fc_date or ""):
            changes["Forecast_Delivery"] = fc_date or ""
        if po.get("Forecast_Window") != fc_window:
            changes["Forecast_Window"] = fc_window
        if po.get("Forecast_Status") != fc_status:
            changes["Forecast_Status"] = fc_status
        if changes:
            await store.update_record("Pre_Order_FF", po["ID"], changes, by_form=True)
        hit += 1
    return f"{pr_no} -> {hit} pre-order row | {fc_window} | {fc_status}"
