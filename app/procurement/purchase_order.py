# Purchase_Order workflows, ported from zoho-export/parsed/workflows/form/Purchase_Order/*.dg
# (on validate = before the save).
#   PO_Generate_Number    (on add)          the next PO-nnnnn after the highest existing one
#   PO_Compute_Totals     (add or edit)     Total_PO_Value = sum of the line totals, Total_Lines = number of lines
#   PO_Detect_Mixed       (add or edit)     Mixed_Shipping = the lines do not all have the same shipping mode
#   PO_Status_Timestamps  (add or edit)     Sent_On / Completed_On when the status BECOMES Sent / Completed
# Skipped on purpose: PO_Lock_UI_Fields (on load, only disables fields on the form).
#
# Quirk kept from Zoho: for "Acknowledged" the script assigns a plain variable (no `input.`), so it
# never stored anything; Acknowledge_On is set by the acknowledge function (acknowledgePO*, po-approval.py).
#
# The Fenteng copy of the form (Fenteng_Lighting_Purchase_Order, every field ends in _Supplier1) has
# the same totals / mixed / timestamps scripts. Its number script counts the MAIN Purchase_Order
# table; the copy normally carries the number of the PO it was made from (set by approve_po_fenteng,
# po-approval.py), so it is ported for a hand-made copy only (fenteng_number below). Differences on
# purpose: its timestamps compare with the copy's OWN previous status.
# Ported from server/modules/procurement/purchase-order.mjs.
from app.criteria import zoho_now
from app.deluge import blank, round2, to_num, today_date, ymd
from app.workflows import register

PO = "Purchase_Order"


def _text(v) -> str:
    return "" if blank(v) else str(v)


# Field names per copy of the form: the main one has plain names, Fenteng's end in _Supplier1.
MAIN = {"number": "PO_No", "status": "PO_Status", "lines": "PO_Line_Items", "line_total": "Line_Total", "mode": "Shipping_Mode", "value": "Total_PO_Value", "count": "Total_Lines", "mixed": "Mixed_Shipping", "sent": "Sent_On", "done": "Completed_On"}
FENTENG = {k: f"{v}_Supplier1" for k, v in MAIN.items()}


def steps(f: dict, *, with_number: bool = False):
    async def validate(args: dict) -> None:
        input_, previous, store = args["input"], args.get("previous"), args["store"]
        rec = {**(previous or {}), **input_}
        if with_number and not previous:
            input_[f["number"]] = await store.next_number(PO, f["number"], "PO-")

        # PO_Compute_Totals
        value = 0.0
        lines = rec.get(f["lines"]) or []
        for ln in lines:
            if not blank(ln.get(f["line_total"])):
                value += to_num(ln.get(f["line_total"]))
        input_[f["value"]] = round2(value)
        input_[f["count"]] = len(lines)

        # PO_Detect_Mixed
        first = ""
        mixed = False
        for ln in lines:
            mode = ln.get(f["mode"])
            if first == "":
                first = mode
            elif mode != first:
                mixed = True
        input_[f["mixed"]] = mixed

        # PO_Status_Timestamps: only the save that CHANGES the status stamps the date
        before = _text((previous or {}).get(f["status"]))
        now = _text(rec.get(f["status"]))
        if now == "Sent" and before != "Sent":
            input_[f["sent"]] = ymd(today_date())
        if now == "Completed" and before != "Completed":
            input_[f["done"]] = ymd(today_date())

    return validate


register(PO, {"beforeAdd": steps(MAIN, with_number=True), "beforeUpdate": steps(MAIN, with_number=False)})


# PO_Generate_Number2 (Fenteng copy, on add): PO_No_Supplier1 = one more than the highest PO_No of
# the MAIN Purchase_Order table, as in Zoho. Difference on purpose: only when the add has no number.
# approve_po_fenteng adds the copy with the raw store (no hooks) and the main PO's number, so this
# only runs for a Fenteng PO added by hand; it reads the highest number, it does not take one from
# the series.
async def _fenteng_number(args: dict) -> None:
    input_, store = args["input"], args["store"]
    if not blank(input_.get("PO_No_Supplier1")):
        return
    max_n = 0
    for po in await store.find(PO):
        try:
            n = int(str(po.get("PO_No") or "").replace("PO-", ""))
        except ValueError:
            continue
        if n > max_n:
            max_n = n
    input_["PO_No_Supplier1"] = f"PO-{str(max_n + 1).zfill(5)}"


register("Fenteng_Lighting_Purchase_Order", {"beforeAdd": [_fenteng_number, steps(FENTENG, with_number=False)], "beforeUpdate": steps(FENTENG, with_number=False)})
