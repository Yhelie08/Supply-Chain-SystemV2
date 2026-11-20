# "Create RR" of the Exceptions page, ported from zoho-export/parsed/functions:
#   create_rr_main               (custom API create_rr_main)      one Replacement_Request per SKU +
#                                 type of the exception's damaged / missing items
#   create_rr_supplier('Tony'/'Fenteng')   the supplier's copy of each of those RRs, with the SAME
#                                 RR number (custom APIs create_rr_tony / create_rr_fenteng)
# No Zoho Books call. Run with the raw store (no workflow hooks), like the Deluge functions, so the
# numbers and dates are set here.
#
# Once only: an RR that already exists for the same exception + SKU + source type is not made again
# (the answer says "No new RR needed"), and a supplier copy is never made twice, nor for a supplier
# different from the one the main RR was sent to. Items that are damaged but repairable, and were not
# marked "Not Fixed", are not replaced (they go back through repair, see Exception Control).
# Ported from server/modules/procurement/replacement-requests.mjs.
from app.custom_apis import CUSTOM_APIS
from app.deluge import blank, to_num, today_date, ymd
from app.procurement.plan import load_settings
from app.procurement.rr_spec import log_once, order_date_for, original_target_for, rollup_rr, target_for
from app.procurement.suppliers import portal_of


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _today() -> str:
    return ymd(today_date())


async def _exception_of(store, exception_id) -> dict | None:
    id_ = _text(exception_id)
    if id_ == "":
        return None
    matches = await store.find("Exceptions", lambda e: str(e["ID"]) == id_)
    return matches[0] if matches else None


# "Shade: 2, Base: 1" -> the spare part types and the "type: qty" pairs
def spare_parts(raw, other) -> dict | None:
    value = _text(raw)
    if value == "":
        return None
    types, pairs = [], []
    for seg in value.split(","):
        s = seg.strip()
        i = s.find(":")
        type_ = (s if i < 0 else s[:i]).strip()
        qty = ("" if i < 0 else s[i + 1:]).strip()
        if qty in ("", "null"):
            qty = "—"
        if type_ == "Others" and _text(other) != "":
            type_ = _text(other)
        types.append(type_)
        pairs.append(f"{type_}: {qty}")
    return {"type": ", ".join(types), "pairs": ", ".join(pairs)}


# The exception's Product_Context rows grouped by SKU + type (Damage / Missing), skipping the
# repairable damage that is not "Not Fixed".
def groups(exc: dict, supplier_override: str = "") -> list[dict]:
    out: dict = {}
    for pc in exc.get("Product_Context1") or []:
        if _text(pc.get("Type_field")) == "Damage" and _text(pc.get("Repairable")) == "Yes" and _text(pc.get("Repair_Outcome")) != "Not Fixed":
            continue
        key = f"{_text(pc.get('SKU'))}||{_text(pc.get('Type_field'))}"
        if key not in out:
            out[key] = {"sku": _text(pc.get("SKU")), "item": pc.get("Item"), "supplier": supplier_override if supplier_override != "" else pc.get("Supplier"),
                        "original": _text(pc.get("Supplier")), "pr_no": "", "type": _text(pc.get("Type_field")), "qty": 0, "spare_type": "", "spairs": ""}
        g = out[key]
        if g["pr_no"] == "" and _text(pc.get("PR_No")) != "":
            g["pr_no"] = _text(pc.get("PR_No"))
        g["qty"] += 0 if blank(pc.get("Qty")) else to_num(pc.get("Qty"))
        sp = spare_parts(pc.get("Quantity_of_damage_spare_s"), pc.get("Spare_Part_Type_Other"))
        if sp:
            g["spare_type"] = sp["type"] if g["spare_type"] == "" else f"{g['spare_type']}, {sp['type']}"
            g["spairs"] = sp["pairs"] if g["spairs"] == "" else f"{g['spairs']}, {sp['pairs']}"
    return list(out.values())


def source_type_of(exc: dict, g: dict) -> str:
    if _text(exc.get("Source_Module")) == "Receiving":
        return "Receiving Damage" if g["type"] == "Damage" else "Receiving Missing"
    if _text(exc.get("Source_Module")) == "Fulfillment QC":
        return "QC Failure"
    return "Management Decision"


def summary_row(exc: dict, g: dict) -> dict:
    return {"PR_No": exc.get("Receiving_Line_ID"), "Supplier": g["supplier"], "SKU": g["sku"], "Item": g["item"], "SO_No": exc.get("Sales_Order"), "Original_PO_No": exc.get("PO_No"), "Priority": exc.get("Priority"), "RR_Qty": g["qty"]}


def _fail(message: str) -> dict:
    return {"status": "error", "message": message}


# ---------------- create_rr_main ----------------
async def create_rr_main(payload: dict, store, ctx: dict | None = None) -> dict:
    ctx = ctx or {}
    exc = await _exception_of(store, (payload or {}).get("exceptionId"))
    if not exc:
        return _fail("Exception not found.")
    made = set()
    for rr in await store.find("Replacement_Request", lambda x: _text(x.get("Source_Exception_No")) == _text(exc.get("Exception_No"))):
        for row in rr.get("Replacement_Summary") or []:
            made.add(f"{_text(row.get('SKU'))}||{_text(rr.get('Source_Type'))}")

    # spec RR-R1: the supplier chosen in the dialog (kept on the exception), the original one is
    # recorded; a reason when it was changed
    override = _text(exc.get("RR_Supplier_Override")).strip()
    reason = _text(exc.get("RR_Supplier_Change_Reason")).strip()
    todo = [g for g in groups(exc, override) if f"{g['sku']}||{source_type_of(exc, g)}" not in made]

    def _same_supplier(a, b) -> bool:
        pa, pb = portal_of(a), portal_of(b)
        if pa and pb:
            return pa["key"] == pb["key"]
        return _text(a).strip().lower() == _text(b).strip().lower()

    def _changed(g) -> bool:
        return override != "" and _text(g["original"]).strip() != "" and not _same_supplier(g["original"], g["supplier"])

    if any(_changed(g) for g in todo) and reason == "":
        return _fail("Give a reason for changing the supplier.")

    settings = await load_settings(store)
    created = 0
    for g in todo:
        source_type = source_type_of(exc, g)
        key = f"{g['sku']}||{source_type}"
        if key in made:
            continue
        # RR-R3: the target (the original one if it is still ahead, else today + rr_default_days) and
        # the original SO's Order Date
        target = target_for(await original_target_for(store, pr_no=g["pr_no"]), settings)
        order_date = await order_date_for(store, pr_no=g["pr_no"], so_no=exc.get("Sales_Order"))
        rr_id = await store.add_record("Replacement_Request", {
            "Target_Delivery": target, "Order_Date": order_date, "Original_Supplier": _text(g["original"]), "Supplier_Change_Reason": reason if _changed(g) else "",
            "RR_No": await store.next_number("Replacement_Request", "RR_No", "RR-"), "RR_Date": _today(), "RR_Status": "Open", "Source_Type": source_type, "Source_Exception_No": exc.get("Exception_No"),
            "Last_Updated": _today(), "RR_Supplier": g["supplier"], "RR_SKU": g["sku"], "RR_Item_Name": g["item"], "RR_Qty_Value": g["qty"], "RR_PR_No": exc.get("Receiving_Line_ID"),
            "RR_Item_to_Replace": g["spare_type"], "RR_Damage_Qty": g["qty"], "RR_Spare_Parts": g["spairs"], "Replacement_Summary": [summary_row(exc, g)],
        }, ctx.get("user", ""))
        rr = await store.get_record_by_id("Replacement_Request", rr_id, raw=True)
        was_note = f" (was {g['original']})" if _changed(g) else ""
        await log_once(store, record_type="rr", record=rr, no=rr.get("RR_No"), event="rr.created", note=f"{g['supplier']}{was_note}")
        made.add(key)
        created += 1
        # the original PO remembers which SKUs are missing / damaged
        for po in await store.find("Purchase_Order", lambda p: _text(p.get("PO_No")) == _text(exc.get("PO_No"))):
            await store.update_record("Purchase_Order", po["ID"], {"Missing_SKUs": g["sku"]} if source_type == "Receiving Missing" else {"Damage_SKUs": g["sku"]}, by_form=True)

    if created > 0:
        await store.update_record("Exceptions", exc["ID"], {"Exception_Status": "Under Review"}, by_form=True)
        await rollup_rr(store)  # the new RRs are Broken and ranked at once, not at the next scoring
    return {"status": "success", "created": created, "message": f"{created} RR(s) created." if created > 0 else "No new RR needed — every item already has one."}


# ---------------- create_rr_supplier ----------------
_SUPPLIER = {
    "Tony": {"name": "Tony Fan", "form": "Tony_Fan_Replacement_Request", "po": "Tony_Fan_Purchase_Order", "sfx": "_Supplier2"},
    "Fenteng": {"name": "Fenteng Lighting", "form": "Fenteng_Lighting_Replacement_Request", "po": "Fenteng_Lighting_Purchase_Order", "sfx": "_Supplier1"},
}


async def create_rr_supplier(key: str, payload: dict, store, ctx: dict | None = None) -> dict:
    ctx = ctx or {}
    s = _SUPPLIER[key]
    exc = await _exception_of(store, (payload or {}).get("exceptionId"))
    if not exc:
        return _fail("Exception not found.")
    made = set()
    for rr in await store.find(s["form"], lambda x: _text(x.get("Source_Exception_No")) == _text(exc.get("Exception_No"))):
        for row in rr.get("Replacement_Summary") or []:
            made.add(f"{_text(row.get('SKU'))}||{_text(rr.get('Source_Type'))}")
    parents = await store.find("Replacement_Request", lambda x: _text(x.get("Source_Exception_No")) == _text(exc.get("Exception_No")))
    created = 0
    for g in groups(exc, _text(exc.get("RR_Supplier_Override")).strip()):
        portal = portal_of(g["supplier"])
        if not portal or portal["name"] != s["name"]:
            continue
        source_type = source_type_of(exc, g)
        key_ = f"{g['sku']}||{source_type}"
        if key_ in made:
            continue
        parent_no, parent_supplier = "", ""
        for p in parents:
            if _text(p.get("Source_Type")) != source_type:
                continue
            if any(_text(row.get("SKU")) == g["sku"] for row in (p.get("Replacement_Summary") or [])):
                parent_no, parent_supplier = _text(p.get("RR_No")), _text(p.get("RR_Supplier"))
        # a supplier's copy never disagrees with its parent RR about who the supplier is (a blank
        # parent supplier is allowed: older RRs have none)
        if parent_no != "" and parent_supplier.strip() != "":
            pp = portal_of(parent_supplier)
            if not pp or pp["name"] != s["name"]:
                continue
        if parent_no == "":
            continue
        await store.add_record(s["form"], {
            "RR_No": parent_no, "RR_Date": _today(), "RR_Status": "Open", "Source_Type": source_type, "Source_Exception_No": exc.get("Exception_No"), "Last_Updated": _today(),
            "RR_Item_to_Replace": g["spare_type"], "RR_Damage_Qty": g["qty"], "RR_Spare_Parts": g["spairs"], "Replacement_Summary": [summary_row(exc, g)],
        }, ctx.get("user", ""))
        made.add(key_)
        created += 1
        for po in await store.find(s["po"], lambda p: _text(p.get(f"PO_No{s['sfx']}")) == _text(exc.get("PO_No"))):
            await store.update_record(s["po"], po["ID"], {f"Missing_SKUs{s['sfx']}": g["sku"]} if source_type == "Receiving Missing" else {f"Damage_SKUs{s['sfx']}": g["sku"]}, by_form=True)
    return {"status": "success", "created": created, "message": f"{created} {s['name']} RR(s) created"}


# ---------------- custom-API wrappers ----------------
async def create_rr_tony_api(payload: dict, store, ctx: dict) -> dict:
    return await create_rr_supplier("Tony", payload or {}, store, ctx)


async def create_rr_fenteng_api(payload: dict, store, ctx: dict) -> dict:
    return await create_rr_supplier("Fenteng", payload or {}, store, ctx)


async def create_rr_main_api(payload: dict, store, ctx: dict) -> dict:
    return await create_rr_main(payload or {}, store, ctx)


CUSTOM_APIS["create_rr_main"] = create_rr_main_api
CUSTOM_APIS["create_rr_tony"] = create_rr_tony_api
CUSTOM_APIS["create_rr_fenteng"] = create_rr_fenteng_api
