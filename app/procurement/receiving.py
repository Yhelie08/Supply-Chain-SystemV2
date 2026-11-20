# Receiving workflows, ported from zoho-export/parsed/workflows/form/Receiving/*.dg.
# Nothing here calls Zoho Books or Zoho Inventory (Create_Bin_Receiving, the button that books the
# receipt, is not ported).
#
#   before the save (on validate, in Zoho's order; each step sees what the one before it wrote):
#     Receiving_Compute_Totals     Total_Expected / Accepted / Damage / Missing_Qty, Total_Lines,
#                                  Incomplete_Lines, Ready_for_Fulfillment1 (counted from the lines as
#                                  they came in: Line_Result is only worked out by the next step)
#     Receiving_Set_Line_Result    each line: Complete + Ready_for_Fulfillment when Accepted =
#                                  Expected and Accepted + Damage + Missing = Expected
#     Receiving_Validate_Qty       Accepted + Damaged + Missing cannot be more than Expected
#                                  (refused otherwise)
#     Receiving_Auto_Exception     "Create Exception" ticked: one Exceptions record per line with
#                                  damage or missing units, found again by Receive_No + SKU (never a
#                                  second one), Has_Exceptions on the line, Exception_Count; the
#                                  request is cleared
#     Receiving_Set_Receive_Sta    Receive_Status Pending / Partial Received / Received; the shipment
#                                  becomes Delivered (Previous_Status kept) and Need_Attention1 when a
#                                  line has damage or missing units
#   after the save (on success):
#     Damage_Missing_Details       one row per damaged / missing unit, up to the line's quantity
#                                  (never more than are needed)
#     Receiving_Sync_Product_Context  the exception's Product_Context1 rows follow the damage /
#                                  missing details (Repair_Outcome kept by position), and an empty
#                                  exception title / description is filled
#     Receiving_Sync_Shipment_Mode_To_Shipment   Shipment_Mode_When_Received of the lines -> the
#                                  shipment's lines (by PR_No)
#     Receiving_Sync_Shipment_Arrived  lines with no missing units -> the supplier's copy of the
#                                  shipment (Fenteng / Tony), status Arrived
#     Notify_on_Receiving_Quantity_Mismatch  Accepted total different from Expected total: an
#                                  App_Notifications record
# Not ported: Receiving_Populate_From_S (user input of Shipments), Notify_on_Receiving_Complete
# (inactive in Zoho), Create_Bin_Receiving (Books / Inventory).
# Differences on purpose: Damage_Missing_Details matches a line by PR_No AND SKU (Zoho used PR_No
# only, so two lines with the same or no PR_No shared each other's rows); a new Receiving record with
# no number gets the next RCV-nnnnn (Zoho's form numbers it by itself).
# Ported from server/modules/procurement/receiving.mjs.
#
# applyShipmentEvent (ship_track.py, Task 11) is imported lazily inside the one before-save step that
# needs it -- the same forward-reference idiom this plan uses to break the receiving.py <-> ship_track.py
# cycle (ship_track.py's own second pass, Task 18, imports FROM receiving/po_spec/rr_spec/sorting).
from app.criteria import ZohoError, zoho_now
from app.deluge import blank, id_of, truthy, to_num, today_date
from app.procurement.suppliers import portal_of
from app.workflows import register

SHIP = "Shipments"
EXC = "Exceptions"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _n(v) -> float:
    return 0 if blank(v) else to_num(v)


_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _d_mmm_yyyy(d) -> str:
    return f"{d.day:02d}-{_MONTHS[d.month - 1]}-{d.year}"


def _damaged(l: dict) -> float:
    return _n(l.get("Damage_Qty"))


def _missing(l: dict) -> float:
    return _n(l.get("Missing_Qty"))


def _is_complete(l: dict) -> bool:
    return _n(l.get("Accepted_Qty")) + _n(l.get("Damage_Qty")) + _n(l.get("Missing_Qty")) == _n(l.get("Expected_Qty")) and _n(l.get("Accepted_Qty")) == _n(l.get("Expected_Qty"))


# Spec v1.4 (D12, RCV-R4): "received" means counted AND binned, i.e. pickable. 'Receiving Area' is
# where goods wait, not a bin.
def is_binned(l: dict) -> bool:
    loc = _text(l.get("Bin_location")).strip()
    return loc != "" and loc != "Receiving Area"


def is_ready(l: dict) -> bool:
    return _is_complete(l) and is_binned(l)


# The Exceptions record of a receiving line: by Receive_No + SKU, else (older ones) by PR_No +
# Receive_No, which then gets the key.
async def exception_of_line(store, receive_no, line: dict, *, stamp: bool = False) -> dict:
    key = f"{receive_no}||{_text(line.get('SKU'))}"
    by_key = await store.find(EXC, lambda e: _text(e.get("Exception_Line_Key")) == key)
    if by_key:
        return {"exc": by_key[-1], "key": key}
    pr = _text(line.get("PR_No")).strip()
    if pr != "":
        old = await store.find(EXC, lambda e: _text(e.get("Receiving_Line_ID")) == pr and _text(e.get("Receive_No")) == receive_no)
        if old:
            if stamp:
                await store.update_record(EXC, old[-1]["ID"], {"Exception_Line_Key": key}, by_form=True)
            return {"exc": old[-1], "key": key}
    return {"exc": None, "key": key}


# ---------- before the save ----------
async def _before_save(args: dict) -> None:
    from app.procurement.ship_track import apply_shipment_event

    input_, previous, store = args["input"], args.get("previous"), args["store"]
    rec = {**(previous or {}), **input_}
    if not previous and _text(rec.get("Receive_No1")) == "":
        input_["Receive_No1"] = await store.next_number("Receiving", "Receive_No1", "RCV-")
        rec["Receive_No1"] = input_["Receive_No1"]
    lines = [dict(l) for l in (rec.get("Receiving_Line_Items") or [])]

    # Receiving_Compute_Totals
    input_["Total_Expected_Qty"] = sum(_n(l.get("Expected_Qty")) for l in lines)
    input_["Total_Accepted_Qty"] = sum(_n(l.get("Accepted_Qty")) for l in lines)
    input_["Total_Damage_Qty"] = sum(_damaged(l) for l in lines)
    input_["Total_Missing_Qty"] = sum(_missing(l) for l in lines)
    input_["Total_Lines"] = len(lines)
    input_["Incomplete_Lines"] = len([l for l in lines if _text(l.get("Line_Result")) == "Incomplete"])
    input_["Ready_for_Fulfillment1"] = len([l for l in lines if truthy(l.get("Ready_for_Fulfillment"))])

    # Receiving_Set_Line_Result
    for l in lines:
        l["Line_Result"] = "Complete" if _is_complete(l) else "Incomplete"
        l["Ready_for_Fulfillment"] = is_ready(l)

    # Receiving_Validate_Qty
    for l in lines:
        total = _n(l.get("Accepted_Qty")) + _damaged(l) + _missing(l)
        if _n(l.get("Expected_Qty")) > 0 and total > _n(l.get("Expected_Qty")):
            raise ZohoError(2001, f"Quantity mismatch on line {_text(l.get('PR_No'))} — Accepted + Damaged + Missing ({total}) cannot exceed Expected Qty ({_n(l.get('Expected_Qty'))}). Please correct before saving.")

    # Receiving_Auto_Exception
    if truthy(rec.get("Create_Exception_Requested")):
        ship_id = id_of(rec.get("Shipments"))
        ship = None
        if ship_id != "":
            try:
                ship = await store.get_record_by_id(SHIP, ship_id, raw=True)
            except Exception:
                ship = None
        for l in lines:
            if _damaged(l) > 0 or _missing(l) > 0:
                result = await exception_of_line(store, _text(rec.get("Receive_No1")), l, stamp=True)
                if not result["exc"]:
                    await store.add_record(EXC, {
                        "Exception_No": await store.next_number(EXC, "Exception_No", "EXC-"), "Source_Module": "Receiving", "Exception_Status": "Open",
                        "Sales_Order": rec.get("SO_No"), "PO_No": rec.get("PO_No"), "Shipment_No": _text((ship or {}).get("Shipment_No")), "Receive_No": rec.get("Receive_No1"),
                        "Receiving_Line_ID": l.get("PR_No"), "Exception_Line_Key": result["key"], "Opened_On": _d_mmm_yyyy(today_date()),
                    })
                l["Has_Exceptions"] = True
        input_["Create_Exception_Requested"] = False  # one-shot: the next plain save does not create again
    input_["Exception_Count"] = len([l for l in lines if truthy(l.get("Has_Exceptions"))])

    # Receiving_Set_Receive_Status
    acc = dmg = mis = 0.0
    incomplete = 0
    has_exception = False
    for l in lines:
        acc += _n(l.get("Accepted_Qty"))
        dmg += _damaged(l)
        mis += _missing(l)
        if not is_ready(l):
            incomplete += 1
        if _damaged(l) > 0 or _missing(l) > 0:
            has_exception = True
    status = "Pending" if (len(lines) == 0 or (acc == 0 and dmg == 0 and mis == 0)) else ("Received" if incomplete == 0 else "Partial Received")
    input_["Receive_Status"] = status
    ship_id = id_of(rec.get("Shipments"))
    if status != "Pending" and ship_id != "":
        try:
            ship = await store.get_record_by_id(SHIP, ship_id, raw=True)
        except Exception:
            ship = None
        if ship:
            patch = {}
            if _text(ship.get("Shipment_Status")) != "Delivered":
                patch["Previous_Status"] = ship.get("Shipment_Status")
                patch["Shipment_Status"] = "Delivered"
            if has_exception and not truthy(ship.get("Need_Attention1")):
                patch["Need_Attention1"] = True
            if patch:
                await store.update_record(SHIP, ship_id, patch, by_form=True)
            # Ship & Track (spec v1.4): the first count is the best sign of arrival, so the shipment
            # arrived "before" it (T-5)
            try:
                await apply_shipment_event(store, ship_id, "arrived_warehouse", source="system", bound="before", note="before the first count")
            except Exception as e:
                print(f"[ship-track] {e}")
    input_["Receiving_Line_Items"] = lines


# ---------- after the save ----------
async def _after_save(args: dict) -> None:
    r, id_, store, user = args["record"], args.get("id"), args["store"], args.get("user", "")
    rcv_id = _text(r.get("ID") or id_)
    lines = r.get("Receiving_Line_Items") or []

    # Damage_Missing_Details: one row per damaged / missing unit, never more than the line has
    details = [dict(d) for d in (r.get("Damage_Missing_Details") or [])]
    added = False
    for l in lines:
        if _damaged(l) <= 0 and _missing(l) <= 0:
            continue
        for type_, want in [("Damage", _damaged(l)), ("Missing", _missing(l))]:
            have = len([d for d in details if _text(d.get("PR_No")) == _text(l.get("PR_No")) and _text(d.get("SKU")) == _text(l.get("SKU")) and _text(d.get("Type_field")) == type_])
            for _ in range(have, min(int(want), 10)):
                details.append({"PR_No": l.get("PR_No"), "SKU": l.get("SKU"), "Type_field": type_, "Qty": 1})
                added = True
    if added:
        await store.update_record("Receiving", rcv_id, {"Damage_Missing_Details": details}, by_form=True)

    # Receiving_Sync_Product_Context
    for l in lines:
        dmg, mis = _damaged(l), _missing(l)
        if dmg <= 0 and mis <= 0:
            continue
        result = await exception_of_line(store, _text(r.get("Receive_No1")), l)
        exc = result["exc"]
        if not exc:
            continue
        category = ""
        items = await store.find("Items", lambda i: _text(i.get("SKU")) == _text(l.get("SKU")))
        if items:
            category = _text(items[0].get("category"))

        def mine(type_: str) -> list:
            return [d for d in details if _text(d.get("PR_No")) == _text(l.get("PR_No")) and _text(d.get("SKU")) == _text(l.get("SKU")) and _text(d.get("Type_field")) == type_]

        old_outcomes = [p.get("Repair_Outcome") for p in (exc.get("Product_Context1") or []) if _text(p.get("PR_No")) == _text(l.get("PR_No"))]
        rows = []
        desc_parts = []
        if dmg > 0:
            for i, d in enumerate(mine("Damage")):
                rows.append({
                    "PR_No": l.get("PR_No"), "SKU": d.get("SKU"), "Item": l.get("Item_Name"), "Category": category, "Qty": d.get("Qty"), "Type_field": "Damage", "Supplier": r.get("Supplier"),
                    "Affected_Missing_Part": d.get("Affected_Missing_Part"), "Damage_Missing_Category": d.get("Damage_Missing_Category"), "Root_Cause_Category": d.get("Root_Cause_Category"),
                    "Description": d.get("Description"), "Action_Required": d.get("Action_Required"), "Repairable": d.get("Repairable"), "Spare_Part_Type": d.get("Spare_Part_Type"),
                    "Quantity_of_damage_spare_s": d.get("Quantity_of_damage_spare_s"), "Spare_Part_Type_Other": d.get("Spare_Part_Type_Other"),
                    "Repair_Outcome": "Pending" if (i >= len(old_outcomes) or _text(old_outcomes[i]) == "") else old_outcomes[i],
                })
                if _text(d.get("Description")) != "":
                    desc_parts.append(d["Description"])
        if mis > 0:
            missing_rows = mine("Missing")
            m = missing_rows[-1] if missing_rows else {}
            rows.append({
                "PR_No": l.get("PR_No"), "SKU": l.get("SKU"), "Item": l.get("Item_Name"), "Category": category, "Qty": mis, "Type_field": "Missing", "Supplier": r.get("Supplier"),
                "Affected_Missing_Part": m.get("Affected_Missing_Part"), "Damage_Missing_Category": m.get("Damage_Missing_Category"), "Root_Cause_Category": m.get("Root_Cause_Category"),
                "Description": m.get("Description"), "Action_Required": m.get("Action_Required"),
            })
            if _text(m.get("Description")) != "":
                desc_parts.append(m["Description"])
        patch = {"Product_Context1": rows}
        if _text(exc.get("Exception_Title")) == "":
            patch["Exception_Title"] = f"{'Damage + Missing' if (dmg > 0 and mis > 0) else ('Damage' if dmg > 0 else 'Missing')} — {_text(l.get('Item_Name'))}"
        if _text(exc.get("Exception_Description")) == "" and desc_parts:
            patch["Exception_Description"] = "; ".join(desc_parts)
        await store.update_record(EXC, exc["ID"], patch, by_form=True)

    # Receiving_Sync_Shipment_Mode_To_Shipment
    ship_id = id_of(r.get("Shipments"))
    ship = None
    if ship_id != "":
        try:
            ship = await store.get_record_by_id(SHIP, ship_id, raw=True)
        except Exception:
            ship = None
    if ship:
        mode_by_pr = {}
        for l in lines:
            if _text(l.get("PR_No")) != "" and _text(l.get("Shipment_Mode_When_Received")) != "":
                mode_by_pr[_text(l.get("PR_No"))] = l["Shipment_Mode_When_Received"]
        if mode_by_pr:
            changed = False
            rows = []
            for s in ship.get("PO_Shipments") or []:
                mode = mode_by_pr.get(_text(s.get("PR_No")))
                if mode is not None and _text(s.get("Shipment_Mode_When_Received")) != _text(mode):
                    changed = True
                    rows.append({**s, "Shipment_Mode_When_Received": mode})
                else:
                    rows.append(s)
            if changed:
                await store.update_record(SHIP, ship_id, {"PO_Shipments": rows}, by_form=True)

        # Receiving_Sync_Shipment_Arrived: lines with nothing missing -> Arrived on the supplier's copy of the shipment
        arrived = set()
        for l in lines:
            if _text(l.get("PR_No")) != "" and _n(l.get("Expected_Qty")) > 0 and _missing(l) == 0:
                arrived.add(f"{_text(l.get('PR_No'))}|{_text(l.get('RR_No'))}|{_text(l.get('SKU'))}")
        supplier = _text(ship.get("Supplier"))
        portal = portal_of(supplier)
        copy = ("Fenteng_Shipment", "Supplier1_Shipment_Details") if (portal and portal["key"] == "fenteng") else (("Tony_Shipment", "Supplier2_Shipment_Details") if (portal and portal["key"] == "tony") else None)
        if arrived and copy:
            form, grid = copy
            for c in await store.find(form, lambda x: _text(x.get("Parent_Shipment_ID")) == _text(ship.get("ID"))):
                changed = False
                rows = []
                for row in c.get(grid) or []:
                    key = f"{_text(row.get('PR_No'))}|{_text(row.get('RR_No'))}|{_text(row.get('SKU'))}"
                    if key in arrived and _text(row.get("Status")) != "Arrived":
                        changed = True
                        rows.append({**row, "Status": "Arrived"})
                    else:
                        rows.append(row)
                if changed:
                    await store.update_record(form, c["ID"], {grid: rows}, by_form=True)

    # Notify_on_Receiving_Quantity_Mismatch
    # (one notification per receiving record: a later save while it still does not match does not send it again)
    already = await store.find("App_Notifications", lambda a: _text(a.get("Source_Record_ID")) == rcv_id and _text(a.get("Notification_Type")) == "Receiving Quantity Mismatch")
    if _n(r.get("Total_Accepted_Qty")) != _n(r.get("Total_Expected_Qty")) and not already:
        await store.add_record("App_Notifications", {
            "Recipient_Email": "homecartelpacker@gmail.com", "Notification_Type": "Receiving Quantity Mismatch",
            "Message": f"Received quantity for {_text(r.get('Receive_No1'))} does not match expected quantity.", "Created_On": zoho_now(), "Read": False,
            "Source_Record_No": r.get("Receive_No1"), "Source_Record_ID": rcv_id,
        }, user)


register("Receiving", {"beforeAdd": _before_save, "beforeUpdate": _before_save, "afterAdd": _after_save, "afterUpdate": _after_save})
