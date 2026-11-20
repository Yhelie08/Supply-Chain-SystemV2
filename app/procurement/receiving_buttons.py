# create_receiving_from_shipment, ported from zoho-export/parsed/functions/createReceivingFromShipmentWidget.dg.
# The "Create Receiving" button on a Shipment: builds the Receiving record (header + lines) by hand.
# Like every script-added Receiving in Zoho, this does NOT run the Receiving form workflows -- it
# sets the header and the lines only (no totals / status computation), exactly as the Deluge does.
# Writes go through the raw store, so nothing re-fires. Ported from
# server/modules/procurement/receiving-buttons.mjs.
from app.custom_apis import CUSTOM_APIS
from app.deluge import blank, id_of


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


async def create_receiving_from_shipment(payload: dict, store, ctx: dict) -> dict:
    id_ = id_of(payload.get("shipmentId"))
    ship = None
    if id_ != "":
        try:
            ship = await store.get_record_by_id("Shipments", id_, raw=True)
        except Exception:
            ship = None
    if not ship:
        return {"status": "error", "message": f"Shipment not found: {payload.get('shipmentId')}"}
    ship_id = _text(ship["ID"])

    # One Receiving per shipment: a second click answers "already" with the existing record (mirrors Zoho).
    already = await store.find("Receiving", lambda r: id_of(r.get("Shipments")) == ship_id)
    if already:
        return {"status": "already", "message": "Receiving already exists for this Shipment.", "receivingId": already[-1]["ID"]}

    po = None
    if id_of(ship.get("PO_No")) != "":
        try:
            po = await store.get_record_by_id("Purchase_Order", id_of(ship.get("PO_No")), raw=True)
        except Exception:
            po = None
    lines = []
    sales_owner = ""
    for li in ship.get("PO_Shipments") or []:
        lines.append({"PR_No": li.get("PR_No"), "SKU": li.get("SKU"), "Item_Name": li.get("Item_Name"), "Expected_Qty": li.get("Shipment_QTY"), "Bin_location": "Receiving Area"})
        # Sales_Owner: the line's PR owner when it has a PR, else the shipment's; the last line wins
        # (mirrors Zoho).
        if _text(li.get("PR_No")) != "":
            matches = await store.find("Purchase_Request1", lambda p: _text(p.get("PR_No")) == _text(li.get("PR_No")))
            if matches:
                sales_owner = _text(matches[0].get("Sales_Owner"))
        else:
            sales_owner = _text(ship.get("Sales_Owner"))

    receive_no = await store.next_number("Receiving", "Receive_No1", "RCV-")
    receiving_id = await store.add_record("Receiving", {
        "Receive_No1": receive_no, "Shipments": ship_id, "SO_No": ship.get("Sales_Order"), "PO_No": _text(po.get("PO_No")) if po else "",
        "Customer_Name": ship.get("Customer"), "Supplier": ship.get("Supplier"), "Sales_Owner": sales_owner, "Receiving_Line_Items": lines,
    }, ctx.get("user", ""))
    await store.update_record("Shipments", ship_id, {"Receiving_Record_Created": True}, by_form=True)
    return {"status": "success", "receivingId": receiving_id, "receiveNo": receive_no}


CUSTOM_APIS["create_receiving_from_shipment"] = create_receiving_from_shipment
