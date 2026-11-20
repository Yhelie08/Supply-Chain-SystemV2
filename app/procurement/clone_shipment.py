# clone_shipment_for_replacement, ported from zoho-export/parsed/functions/cloneShipmentForReplacement.dg.
# The "Clone for Replacement" button on a Replacement_Request: logs a replacement shipment for an
# acknowledged RR. Writes go through the raw store (no workflow re-fire), so every number, line,
# total and date is set explicitly here, exactly as the Deluge does. The 2026-08-07 supplier
# contains() fix and the 2026-10-13 HC System (Local) branch are kept. Ported from
# server/modules/procurement/clone-shipment.mjs.
from app.custom_apis import CUSTOM_APIS
from app.deluge import blank, id_of
from app.procurement.suppliers import portal_of

SHIP = "Shipments"
RCV = "Receiving"
ACKNOWLEDGED = ["Acknowledged", "In Production", "Shipped", "Completed"]


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _fail(message: str) -> dict:
    return {"status": "error", "message": message}


async def _by_id(store, form, ref):
    id_ = id_of(ref)
    if id_ == "":
        return None
    try:
        return await store.get_record_by_id(form, id_, raw=True)
    except Exception:
        return None


async def clone_shipment_for_replacement(payload: dict, store, ctx: dict | None = None) -> dict:
    ctx = ctx or {}
    r = await _by_id(store, "Replacement_Request", (payload or {}).get("rrRecordId"))
    if not r:
        return _fail("Replacement Request not found.")
    if _text(r.get("Cloned_Shipment_No")) != "":
        return _fail(f"A replacement shipment ({r.get('Cloned_Shipment_No')}) was already logged for this RR.")

    # The supplier's acknowledgement status + ship mode, read from its OWN copy of the RR (matched
    # by RR_No). contains() rather than == : RR_Supplier can be the short name or the full
    # Suppliers-form name (2026-08-07 fix).
    supplier = _text(r.get("RR_Supplier"))
    sup_status = ""
    sup_ship_mode = ""
    portal = portal_of(supplier)
    rr_no = _text(r.get("RR_No"))
    if portal and portal["key"] == "fenteng":
        for sm in await store.find("Fenteng_Lighting_Replacement_Request", lambda c: _text(c.get("RR_No")) == rr_no):
            sup_status, sup_ship_mode = _text(sm.get("RR_Status")), _text(sm.get("Shipment_Mode"))
    elif portal and portal["key"] == "tony":
        for sm in await store.find("Tony_Fan_Replacement_Request", lambda c: _text(c.get("RR_No")) == rr_no):
            sup_status, sup_ship_mode = _text(sm.get("RR_Status")), _text(sm.get("Shipment_Mode"))
    elif "HC System" in supplier:
        sup_status = _text(r.get("RR_Status"))  # local team acknowledges on the main record; no supplier portal, no ship mode (mirrors Zoho 2026-10-13)
    if sup_status not in ACKNOWLEDGED:
        if "HC System" in supplier:
            return _fail("This HC System (Local) RR must be Acknowledged first — open the Replacement Request widget, Local (HC System) tab, and click Acknowledge (ETA required).")
        return _fail("This RR must be Acknowledged by the supplier (Shipment Mode/Expected Ship Date/ETA filled on their own portal) before a replacement shipment can be logged.")

    # Trace back to the original PO number: the linked Exception's PO_No, or (Fulfillment EXC)
    # Exception_Control1 -> PR -> Link_PO_No.
    orig_po_no = ""
    source_exc_no = _text(r.get("Source_Exception_No"))
    for em in await store.find("Exceptions", lambda e: _text(e.get("Exception_No")) == source_exc_no):
        orig_po_no = _text(em.get("PO_No"))
    if orig_po_no == "" and _text(r.get("Source_Module")) == "Fulfillment EXC":
        ec_pr_no = ""
        for ecm in await store.find("Exception_Control1", lambda e: _text(e.get("Exception_Number")) == source_exc_no):
            ec_pr_no = _text(ecm.get("PR"))
        if ec_pr_no != "":
            for pr in await store.find("Purchase_Request1", lambda p: _text(p.get("PR_No")) == ec_pr_no):
                orig_po_no = _text(pr.get("Link_PO_No"))

    # Stock item (Fulfillment EXC, no PO ever raised): the customer comes from Sales_Order_Fulfillment,
    # then Pre_Order_FF.
    po_free_customer_name = ""
    rr_so = _text(r.get("RR_SO"))
    if orig_po_no == "" and _text(r.get("Source_Module")) == "Fulfillment EXC":
        for sof in await store.find("Sales_Order_Fulfillment", lambda s: _text(s.get("SO_No")) == rr_so):
            cust = await _by_id(store, "Customer", sof.get("Customer"))  # Customer is a lookup -> its customer_name display text
            cn = _text((cust or {}).get("customer_name"))
            if cn != "":
                po_free_customer_name = cn
        if po_free_customer_name == "":
            for pom in await store.find("Pre_Order_FF", lambda p: _text(p.get("SO")) == rr_so):
                cn = _text(pom.get("Customer_Name"))
                if cn != "":
                    po_free_customer_name = cn
    elif orig_po_no == "":
        return _fail("Could not trace back to the original PO — check Source_Exception_No on this RR and PO_No on the linked Exception (or PR on the linked Exception_Control1 item).")

    # The original shipment to clone from: the highest-ID shipment of the original PO (IDs compared
    # as integers, never float).
    orig_ship = None
    if orig_po_no != "":
        orig_po_matches = await store.find("Purchase_Order", lambda p: _text(p.get("PO_No")) == orig_po_no)
        orig_po = orig_po_matches[-1] if orig_po_matches else None
        if not orig_po:
            return _fail(f"Could not resolve the original Purchase_Order record for {orig_po_no}.")
        for os_ in await store.find(SHIP, lambda s: id_of(s.get("PO_No")) == _text(orig_po["ID"])):
            if orig_ship is None or int(os_["ID"]) > int(orig_ship["ID"]):
                orig_ship = os_
        if not orig_ship:
            return _fail(f"No existing Shipment found for PO {orig_po_no} to clone from.")

    # The replacement shipment: clone the original's identity, or a fresh one for a stock item (no
    # PO / Sales_Owner / target dates).
    if orig_ship:
        new_ship_fields = {
            "PO_No": orig_ship.get("PO_No"), "Sales_Order": orig_ship.get("Sales_Order"), "Customer": orig_ship.get("Customer"), "Supplier": r.get("RR_Supplier"),
            "Sales_Owner": orig_ship.get("Sales_Owner"), "Shipment_Status": "Pending", "Target_Date": orig_ship.get("Target_Date"), "Supplier_Target_Date": orig_ship.get("Supplier_Target_Date"),
            "ETD": r.get("Expected_Ship_Date"), "ETA": r.get("ETA"), "Source_Module": r.get("Source_Module"), "Exception_Number": r.get("Source_Exception_No"),
        }
    else:
        new_ship_fields = {
            "Sales_Order": r.get("RR_SO"), "Customer": po_free_customer_name, "Supplier": r.get("RR_Supplier"), "Shipment_Status": "Pending",
            "ETD": r.get("Expected_Ship_Date"), "ETA": r.get("ETA"), "Source_Module": r.get("Source_Module"), "Exception_Number": r.get("Source_Exception_No"),
        }
    new_ship_id = await store.add_record(SHIP, new_ship_fields, ctx.get("user", ""))
    shipment_no = await store.next_number(SHIP, "Shipment_No", "SHP-")

    # One replacement line for the RR's item; Shipping_Mode inherited from the original line (by
    # PR_No, else the last line), or the supplier's own RR-level pick for a stock item.
    # Shipment_Mode_When_Received only for Fulfillment EXC.
    qty = r.get("RR_Qty_Value")
    new_line = {"SKU": r.get("RR_SKU"), "Item_Name": r.get("RR_Item_Name"), "Shipment_QTY": qty, "PR_No": r.get("RR_PR_No"), "Ordered_QTY": qty, "Remaining_QTY": qty}
    rr_pr_no = _text(r.get("RR_PR_No"))
    if orig_ship:
        mode = ""
        for ol in orig_ship.get("PO_Shipments") or []:
            if _text(ol.get("PR_No")) == rr_pr_no:
                mode = _text(ol.get("Shipping_Mode"))
        if mode == "":
            for ol in orig_ship.get("PO_Shipments") or []:
                mode = _text(ol.get("Shipping_Mode"))
        if mode != "":
            new_line["Shipping_Mode"] = mode
    elif sup_ship_mode != "":
        new_line["Shipping_Mode"] = sup_ship_mode
    if _text(r.get("Source_Module")) == "Fulfillment EXC" and sup_ship_mode != "":
        new_line["Shipment_Mode_When_Received"] = sup_ship_mode
    await store.update_record(SHIP, new_ship_id, {"Shipment_No": shipment_no, "PO_Shipments": [new_line]}, by_form=True)

    if _text(r.get("Source_Module")) == "Fulfillment EXC":
        # A Fulfillment EXC replacement gets its OWN new Receiving, with the totals spelled out (a
        # script-added record runs no workflows).
        orig_recv_for_identity = None
        if orig_po_no != "":
            arr = await store.find(RCV, lambda x: _text(x.get("PO_No")) == orig_po_no)
            if arr:
                orig_recv_for_identity = arr[-1]
        fulf_line = {"PR_No": r.get("RR_PR_No"), "SKU": r.get("RR_SKU"), "Item_Name": r.get("RR_Item_Name"), "Expected_Qty": qty}
        if sup_ship_mode != "":
            fulf_line["Shipment_Mode_When_Received"] = sup_ship_mode
        recv_no = await store.next_number(RCV, "Receive_No1", "RCV-")
        await store.add_record(RCV, {
            "Receive_No1": recv_no, "Shipments": new_ship_id, "SO_No": _text(new_ship_fields.get("Sales_Order")), "PO_No": orig_po_no,
            "Customer_Name": _text(orig_recv_for_identity.get("Customer_Name")) if orig_recv_for_identity else po_free_customer_name,
            "Supplier": r.get("RR_Supplier"), "Source_Module": "Fulfillment EXC", "Exception_Number": r.get("Source_Exception_No"), "Receiving_Line_Items": [fulf_line],
            "Total_Expected_Qty": qty, "Total_Accepted_Qty": 0, "Total_Damage_Qty": 0, "Total_Missing_Qty": 0,
            "Total_Lines": 1, "Incomplete_Lines": 1, "Ready_for_Fulfillment1": 0, "Receive_Status": "Pending",
        }, ctx.get("user", ""))
    elif orig_po_no != "":
        # Same-RCV rule: the PO's existing Receiving record is re-pointed at the replacement shipment;
        # its lines / Expected_Qty stay put.
        for ex in await store.find(RCV, lambda x: _text(x.get("PO_No")) == orig_po_no):
            await store.update_record(RCV, ex["ID"], {"Shipments": new_ship_id}, by_form=True)
    await store.update_record(SHIP, new_ship_id, {"Receiving_Record_Created": True}, by_form=True)

    # The supplier's own copy of the replacement shipment (Fenteng / Tony), one detail row per
    # shipment line, RR_No blank.
    details = [{"SKU": new_line.get("SKU"), "Item_Name": new_line.get("Item_Name"), "PR_No": new_line.get("PR_No"), "RR_No": ""}]
    if portal and portal["key"] == "fenteng":
        copy_id = await store.add_record("Fenteng_Shipment", {"Shipment_No": shipment_no, "Parent_Shipment_ID": str(new_ship_id)}, ctx.get("user", ""))
        await store.update_record("Fenteng_Shipment", copy_id, {"Supplier1_Shipment_Details": details}, by_form=True)
    elif portal and portal["key"] == "tony":
        copy_id = await store.add_record("Tony_Shipment", {"Shipment_No": shipment_no, "Parent_Shipment_ID": str(new_ship_id)}, ctx.get("user", ""))
        await store.update_record("Tony_Shipment", copy_id, {"Supplier2_Shipment_Details": details}, by_form=True)

    await store.update_record("Replacement_Request", r["ID"], {"Cloned_Shipment_No": shipment_no}, by_form=True)
    message = (f"Replacement Shipment {shipment_no} created for PO {orig_po_no}." if orig_ship
               else f"Replacement Shipment {shipment_no} created (stock item — no original PO, PO_No/Sales_Owner left blank).")
    return {"status": "success", "message": message, "shipmentId": str(new_ship_id)}


CUSTOM_APIS["clone_shipment_for_replacement"] = clone_shipment_for_replacement
