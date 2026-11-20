# Shipments workflows, ported from zoho-export/parsed/workflows/form/Shipments/*.dg.
#   before the save (on validate):
#     Shipment_Generate_Number   (add)   the next SHP-nnnnn
#     Shipment_Autofill_From_PO1 (add or edit)  Sales_Order, Customer from the PO; Supplier when all
#                                the PO lines have the same supplier
#     Shipment_Track_Previous_S  (edit)  Previous_Status = the status the shipment had before this save
#   after the save (on success):
#     Shipment_Populate_Receiving     (add)   the Receiving record of the shipment (see below)
#     Shipment_Edited_Sync_Receiving  (edit)  the Receiving records follow the shipment's SO / PO /
#                                     customer / supplier and get new lines
#     Shipments_Sync_Shipment_Mode    (edit)  Shipment_Mode_When_Received on the shipment lines ->
#                                     the Receiving lines
#     Shipment_Status_Back_Sync       (edit)  the Line_Status of each shipment line -> the supplier's
#                                     copy of the shipment (Fenteng / Tony)
# Skipped on purpose (they only run in the form while a person is typing): Shipment_Autofill_From_PO2,
# Shipment_Refresh_PR_Detai (user input of PO_No: fill the PO_Shipments rows), Shipment_Lock_PO_Fields
# (on load). Not ported: the Shipment_Line_Items list of Shipment_Autofill_From_PO1 (Zoho assigned it
# to a plain variable, so it never stored anything).
#
# "Same RCV" rule (2026-07-20 in Zoho): a second shipment for a PO that already has a Receiving record
# (the replacement shipment) does NOT make a second Receiving record: the existing one is pointed at
# the new shipment. Its lines and Expected_Qty are left alone, so Accepted + Damage + Missing =
# Expected still holds. In the same way an edit of a shipment never changes the Expected_Qty of a
# Receiving line that already exists, only NEW lines (no line with that PR_No + SKU) get their
# Expected_Qty from Shipment_QTY. Ported from server/modules/procurement/shipments.mjs.
#
# Imports ship_track first (not just logically, structurally): both modules register
# beforeAdd/beforeUpdate hooks on Shipments, and confirmed by direct instrumentation of the real
# Node source that ship-track.mjs's hook genuinely runs BEFORE shipments.mjs's own hook in
# production (a transitive import makes ship-track.mjs's register() call evaluate first, despite
# workflows.mjs's own import *list* reading shipments.mjs before ship-track.mjs) -- without this
# explicit import, whichever module some test file happens to import first decides the order for
# the rest of the process, and the wrong order silently blanks Order_Date (ship_track's planPatch
# must see the widget's original Sales_Order before this file's PO-autofill can blank it when the
# PO has no SO_No). Same fix pattern as pr_spec.py's own explicit import of purchase_request.
import app.procurement.ship_track  # noqa: F401,E402

from app.deluge import blank, id_of
from app.procurement.suppliers import portal_of
from app.workflows import register

SHIP = "Shipments"
RCV = "Receiving"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


async def _purchase_order(store, ref):
    id_ = id_of(ref)
    if id_ == "":
        return None
    try:
        return await store.get_record_by_id("Purchase_Order", id_, raw=True)
    except Exception:
        return None


async def _sales_order_number(store, ref) -> str:
    id_ = id_of(ref)
    if id_ == "":
        return ""
    try:
        so = await store.get_record_by_id("Sales_Order", id_, raw=True)
        return _text(so.get("Sales_Order_Number"))
    except Exception:
        return ""


# ---------- before the save ----------
async def before_save(args: dict) -> None:
    input_, previous, store = args["input"], args.get("previous"), args["store"]
    rec = {**(previous or {}), **input_}
    if not previous:
        input_["Shipment_No"] = await store.next_number(SHIP, "Shipment_No", "SHP-")

    # Shipment_Autofill_From_PO1
    po = await _purchase_order(store, rec.get("PO_No"))
    if po:
        input_["Sales_Order"] = await _sales_order_number(store, po.get("SO_No"))
        input_["Customer"] = po.get("Customer")
        suppliers = []
        for line in po.get("PO_Line_Items") or []:
            s = _text(line.get("Supplier"))
            if s not in suppliers:
                suppliers.append(s)
        if len(suppliers) == 1:
            input_["Supplier"] = suppliers[0]

    # Shipment_Track_Previous_Status
    if previous and _text(previous.get("Shipment_Status")) != _text(rec.get("Shipment_Status")):
        input_["Previous_Status"] = previous.get("Shipment_Status")


# ---------- after the save ----------
async def populate_receiving(args: dict) -> None:
    ship, id_, store, user = args["record"], args.get("id"), args["store"], args.get("user", "")
    ship_id = _text(ship.get("ID") or id_)
    po = await _purchase_order(store, ship.get("PO_No"))
    po_no = _text(po.get("PO_No")) if po else ""
    existing = [] if po_no == "" else await store.find(RCV, lambda r: _text(r.get("PO_No")) == po_no)
    if existing:
        for r in existing:
            await store.update_record(RCV, r["ID"], {"Shipments": ship_id}, by_form=True)
    else:
        # (a record added by a script does not run the Receiving workflows, in Zoho either: its
        # number comes from the form's own numbering)
        await store.add_record(RCV, {
            "Receive_No1": await store.next_number(RCV, "Receive_No1", "RCV-"), "Shipments": ship_id, "SO_No": ship.get("Sales_Order"), "PO_No": po_no, "Customer_Name": ship.get("Customer"), "Supplier": ship.get("Supplier"),
            "Receiving_Line_Items": [{"PR_No": li.get("PR_No"), "SKU": li.get("SKU"), "Item_Name": li.get("Item_Name"), "Expected_Qty": li.get("Shipment_QTY")} for li in (ship.get("PO_Shipments") or [])],
        }, user)
    await store.update_record(SHIP, ship_id, {"Receiving_Record_Created": True}, by_form=True)


async def sync_after_edit(args: dict) -> None:
    ship, id_, store = args["record"], args.get("id"), args["store"]
    ship_id = _text(ship.get("ID") or id_)
    po = await _purchase_order(store, ship.get("PO_No"))
    rows = await store.find(RCV, lambda r: id_of(r.get("Shipments")) == ship_id)
    for r in rows:
        patch = {"SO_No": ship.get("Sales_Order"), "PO_No": _text(po.get("PO_No")) if po else "", "Customer_Name": ship.get("Customer"), "Supplier": ship.get("Supplier")}
        # Shipments_Sync_Shipment_Mode_To_Receiving + new lines (existing lines keep their Expected_Qty)
        lines = [dict(l) for l in (r.get("Receiving_Line_Items") or [])]
        for li in ship.get("PO_Shipments") or []:
            if not any(_text(l.get("PR_No")) == _text(li.get("PR_No")) and _text(l.get("SKU")) == _text(li.get("SKU")) for l in lines):
                lines.append({"PR_No": li.get("PR_No"), "SKU": li.get("SKU"), "Item_Name": li.get("Item_Name"), "Expected_Qty": li.get("Shipment_QTY")})
            mode = _text(li.get("Shipment_Mode_When_Received"))
            if _text(li.get("PR_No")) != "" and mode != "":
                for l in lines:
                    if _text(l.get("PR_No")) == _text(li.get("PR_No")) and _text(l.get("Shipment_Mode_When_Received")) != mode:
                        l["Shipment_Mode_When_Received"] = mode
        await store.update_record(RCV, r["ID"], {**patch, "Receiving_Line_Items": lines}, by_form=True)

    # Shipment_Status_Back_Sync: the line status the buyer sets -> the supplier's own copy (matched
    # by PR_No + SKU)
    status_by_line: dict = {}
    for sr in ship.get("PO_Shipments") or []:
        if _text(sr.get("Line_Status")) != "":
            status_by_line[f"{_text(sr.get('PR_No'))}|{_text(sr.get('SKU'))}"] = sr.get("Line_Status")
    if not status_by_line:
        return
    supplier = _text(ship.get("Supplier"))
    portal = portal_of(supplier)
    if portal and portal["key"] == "fenteng":
        copies = ("Fenteng_Shipment", "Supplier1_Shipment_Details")
    elif portal and portal["key"] == "tony":
        copies = ("Tony_Shipment", "Supplier2_Shipment_Details")
    else:
        copies = None
    if not copies:
        return
    form, grid = copies
    for copy in await store.find(form, lambda c: _text(c.get("Parent_Shipment_ID")) == ship_id):
        changed = False
        details = []
        for row in copy.get(grid) or []:
            status = status_by_line.get(f"{_text(row.get('PR_No'))}|{_text(row.get('SKU'))}")
            if status is not None and _text(row.get("Status")) != _text(status):
                changed = True
                details.append({**row, "Status": status})
            else:
                details.append(row)
        if changed:
            await store.update_record(form, copy["ID"], {grid: details}, by_form=True)


register(SHIP, {"beforeAdd": before_save, "beforeUpdate": before_save, "afterAdd": populate_receiving, "afterUpdate": sync_after_edit})
