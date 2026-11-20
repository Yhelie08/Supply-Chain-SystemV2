# "Create PO" of the Purchase Request page, ported from zoho-export/parsed/functions:
#   approve_po_main    (custom API approve_po_main)    the approved PRs of one sales order become
#                       lines of the PURCHASE ORDER -- lives in po_create.py (spec v1.4: the
#                       feasibility gate, one PO = one supplier + one mode)
#   approve_po_tony / approve_po_fenteng (approve_supplier_po('Tony'/'Fenteng', ...))
#                       the same lines go to the supplier's own copy of the PO, the shipment is made,
#                       and the Receiving record
#   approve_po_hc       (Approve_P_O_H_C)               the local (HC System) POs: shipment +
#                       Receiving, PO Confirmed
# Not ported: the second half of the Tony / Fenteng functions, which books the PO in Zoho Books (on
# hold). Everything before it is here. The handlers write with the raw store (no workflow hooks), as
# the Deluge functions do, so the totals, numbers and dates are worked out here, in the same order as
# the scripts.
#
# "Once only": a PR that is already approved is not picked up again, a line (PR_No) is never added
# twice to a PO, to the supplier copy, to a shipment or to a Receiving record, and a supplier copy /
# shipment / Receiving record is found again, never duplicated. Ported from
# server/modules/procurement/po-approval.mjs.
from app.criteria import zoho_now
from app.custom_apis import CUSTOM_APIS
from app.deluge import blank, id_of, num_text, to_num, today_date, truthy, ymd
from app.procurement.po_create import approve_po_main
from app.procurement.suppliers import portal_of

PO = "Purchase_Order"
PR = "Purchase_Request1"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _today() -> str:
    return ymd(today_date())


def _round0(v) -> int:
    return round(to_num(v))


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


# A Name-type field comes back as a text or as {first_name, last_name}.
def _name_of(v) -> str:
    if isinstance(v, dict):
        return _text(v.get("first_name")) or _text(v.get("zc_display_value")) or _text(v.get("display_value"))
    return _text(v)


# The sales order's number for a PO (SO_No is a lookup to Sales_Order).
async def _so_number_of(store, po: dict) -> str:
    so = await _by_id(store, "Sales_Order", po.get("SO_No"))
    return _text((so or {}).get("Sales_Order_Number"))


SUPPLIER = {
    "Tony": {"name": "Tony Fan", "copy": "Tony_Fan_Purchase_Order", "sfx": "_Supplier2", "ship": "Tony_Shipment", "grid": "Supplier2_Shipment_Details"},
    "Fenteng": {"name": "Fenteng Lighting", "copy": "Fenteng_Lighting_Purchase_Order", "sfx": "_Supplier1", "ship": "Fenteng_Shipment", "grid": "Supplier1_Shipment_Details"},
}


# Totals / status of a Receiving record from its lines (Receiving_Compute_Totals + Set_Line_Result +
# Set_Receive_Status).
def receiving_totals(lines: list) -> dict:
    def n(v):
        return 0 if blank(v) else to_num(v)

    out = [dict(l) for l in lines]
    exp = acc = dmg = mis = incomplete = ready = 0
    for l in out:
        exp += n(l.get("Expected_Qty"))
        acc += n(l.get("Accepted_Qty"))
        dmg += n(l.get("Damage_Qty"))
        mis += n(l.get("Missing_Qty"))
        complete = n(l.get("Accepted_Qty")) + n(l.get("Damage_Qty")) + n(l.get("Missing_Qty")) == n(l.get("Expected_Qty")) and n(l.get("Accepted_Qty")) == n(l.get("Expected_Qty"))
        binned = _text(l.get("Bin_location")).strip() not in ("", "Receiving Area")  # spec D12: ready = counted AND binned
        l["Line_Result"] = "Complete" if complete else "Incomplete"
        l["Ready_for_Fulfillment"] = complete and binned
        if complete and binned:
            ready += 1
        else:
            incomplete += 1
    status = "Pending" if (len(out) == 0 or (acc == 0 and dmg == 0 and mis == 0)) else ("Received" if incomplete == 0 else "Partial Received")
    return {"lines": out, "totals": {"Total_Expected_Qty": exp, "Total_Accepted_Qty": acc, "Total_Damage_Qty": dmg, "Total_Missing_Qty": mis, "Total_Lines": len(out), "Incomplete_Lines": incomplete, "Ready_for_Fulfillment1": ready, "Receive_Status": status}}


async def approve_supplier_po(key: str, payload: dict, store, ctx: dict | None = None) -> dict:
    ctx = ctx or {}
    s = SUPPLIER[key]
    sfx = s["sfx"]
    so_no = _text((payload or {}).get("soNo"))
    if so_no == "":
        return _fail("soNo is required.")
    processed = 0
    touched = []
    prs = await store.find(PR, lambda p: _text(p.get("Sales_Order")) == so_no and truthy(p.get("PR_Approved")) and _text(p.get("Link_PO_No")) != "")
    for pr in prs:
        supplier = _text(pr.get("Selected_Supplier"))
        portal = portal_of(supplier)
        if not portal or portal["name"] != s["name"]:
            continue
        item = await _by_id(store, "Items", pr.get("Items"))
        po_no = _text(pr.get("Link_PO_No"))
        copies = await store.find(s["copy"], lambda c: _text(c.get(f"PO_No{sfx}")) == po_no)
        copy = copies[0] if copies else None
        if not copy:
            id_ = await store.add_record(s["copy"], {f"PO_No{sfx}": po_no, f"PO_Date{sfx}": _today(), f"PO_Status{sfx}": "Draft"}, ctx.get("user", ""))
            copy = await store.get_record_by_id(s["copy"], id_, raw=True)

        def _note() -> None:
            if copy.get(f"PO_No{sfx}") not in touched:
                touched.append(copy.get(f"PO_No{sfx}"))

        if any(_text(ln.get(f"PR_No{sfx}")) == _text(pr.get("PR_No")) for ln in (copy.get(f"PO_Line_Items{sfx}") or [])):
            _note()
            continue
        rate = 0 if blank(pr.get("Selcted_Final_Cost")) else to_num(pr.get("Selcted_Final_Cost"))
        # spec SP-R1: the supplier sees "our PO price to them", never a customer price. Item_Price used
        # to be our SRP, then the catalog rate; it is now the supplier's own price of the line (the
        # same number as Final_Price). Nothing reads it back on the buyer's side.
        item_price = rate
        qty = _round0(pr.get("quantity"))
        line = {
            f"PR_No{sfx}": pr.get("PR_No"), f"Supplier{sfx}": supplier, f"Item{sfx}": _text((item or {}).get("item_name")), f"SKU{sfx}": pr.get("sku"), f"QTY{sfx}": qty, f"Unit{sfx}": pr.get("unit"),
            f"Final_Price{sfx}": rate, f"Item_Price{sfx}": num_text(item_price), f"Line_Total{sfx}": qty * _round0(rate), f"Shipping_Mode{sfx}": pr.get("Shipment_Mode"),
            f"Target_Delivery{sfx}": pr.get("Target_Delivery"), f"supplier_target_date{sfx}": pr.get("supplier_target_date"), f"Delay_Status{sfx}": pr.get("Delay_Status"),
            f"Followed_Recommendation{sfx}": pr.get("Followed_Recommendation"), f"Override_Reason{sfx}": pr.get("Override_Reason"),
        }
        lines = [*(copy.get(f"PO_Line_Items{sfx}") or []), line]
        await store.update_record(s["copy"], copy["ID"], {
            f"PO_Line_Items{sfx}": lines, f"Total_PO_Value{sfx}": sum(0 if blank(l.get(f"Line_Total{sfx}")) else to_num(l.get(f"Line_Total{sfx}")) for l in lines),
            f"Total_Lines{sfx}": len(lines), f"Sent_On{sfx}": zoho_now(), f"Is_Locked{sfx}": True,
        }, by_form=True)
        copy = await store.get_record_by_id(s["copy"], copy["ID"], raw=True)
        processed += 1
        _note()

    # for each supplier PO touched: its shipment (a Pending one of the PO is re-used) and the
    # Receiving record, lines added once
    for po_no in touched:
        await shipment_and_receiving_for(store, ctx, s, po_no)
    return {"status": "success", "processed": processed, "message": f"{processed} {s['name']} line(s) synced"}


# The shipment of a supplier PO (a Pending one is re-used, else a new one + the supplier's copy of
# it) and its Receiving record, with the lines that are not there yet. Safe to run again: nothing is
# added twice. ship_extra = fields to put on the shipment (ETD / ETA).
async def shipment_and_receiving_for(store, ctx: dict, s: dict, po_no: str, ship_extra: dict | None = None) -> None:
    ship_extra = ship_extra or {}
    apo_matches = await store.find(PO, lambda p: _text(p.get("PO_No")) == po_no)
    apo = apo_matches[0] if apo_matches else None
    if not apo:
        return
    so_text = await _so_number_of(store, apo)
    ship_matches = await store.find("Shipments", lambda x: id_of(x.get("PO_No")) == str(apo["ID"]) and _text(x.get("Shipment_Status")) == "Pending")
    ship = ship_matches[0] if ship_matches else None
    is_new_shipment = False
    if not ship:
        id_ = await store.add_record("Shipments", {
            "Shipment_No": await store.next_number("Shipments", "Shipment_No", "SHP-"), "PO_No": apo["ID"], "Sales_Order": so_text, "Customer": apo.get("Customer"), "Supplier": s["name"], "Shipment_Status": "Pending",
        }, ctx.get("user", ""))
        ship = await store.get_record_by_id("Shipments", id_, raw=True)
        is_new_shipment = True
    ship_patch = dict(ship_extra)
    ship_lines = [dict(l) for l in (ship.get("PO_Shipments") or [])]
    for ln in apo.get("PO_Line_Items") or []:
        ship_patch["Required_Days_Lead"] = ln.get("Required_Days_Lead")
        ship_patch["Remaining_Days"] = ln.get("Remaining_Days")
        # a PO can carry several Sales Orders (spec PO-R4): the shipment takes the EARLIEST target
        if not blank(ln.get("Target_Delivery")) and (blank(ship_patch.get("Target_Date")) or _text(ln.get("Target_Delivery")) < _text(ship_patch.get("Target_Date"))):
            ship_patch["Target_Date"] = ln.get("Target_Delivery")
        ship_patch["Supplier_Target_Date"] = ln.get("supplier_target_date")
        ship_patch["Production_Date"] = ln.get("Production_Date")
        if _text(ln.get("PR_No")) != "":
            pr_matches = await store.find(PR, lambda p: _text(p.get("PR_No")) == _text(ln.get("PR_No")))
            if pr_matches:
                ship_patch["Shipment_Days"] = pr_matches[0].get("Shipment_Days")
                ship_patch["Sales_Owner"] = pr_matches[0].get("Sales_Owner")
        else:
            ship_patch["Sales_Owner"] = apo.get("Sales_Owner")
        if not any(_text(l.get("PR_No")) == _text(ln.get("PR_No")) for l in ship_lines):
            ship_lines.append({"PR_No": ln.get("PR_No"), "SKU": ln.get("SKU"), "Item_Name": ln.get("Item"), "Ordered_QTY": ln.get("QTY"), "Shipment_QTY": ln.get("QTY"), "Remaining_QTY": ln.get("QTY"), "Shipping_Mode": ln.get("Shipping_Mode")})
    await store.update_record("Shipments", ship["ID"], {**ship_patch, "PO_Shipments": ship_lines}, by_form=True)

    # spec v1.4: the planned dates (PO date + 1 + production + ...), the order date and the rank are
    # set now, not at the next scoring
    from app.procurement.ship_track import plan_patch, rescore_shipments
    from app.procurement.plan import load_settings
    fresh = await store.get_record_by_id("Shipments", ship["ID"], raw=True)
    plan = await plan_patch(store, fresh, await load_settings(store))
    if plan:
        await store.update_record("Shipments", ship["ID"], plan, by_form=True)
    await rescore_shipments(store)

    if is_new_shipment and s.get("ship"):  # HC System (local) has no supplier copy of the shipment
        await store.add_record(s["ship"], {
            "Shipment_No": ship["Shipment_No"], "Parent_Shipment_ID": str(ship["ID"]),
            s["grid"]: [{"SKU": l.get("SKU"), "Item_Name": l.get("Item_Name"), "PR_No": l.get("PR_No"), "RR_No": ""} for l in ship_lines],
        }, ctx.get("user", ""))
        from app.procurement.ship_track import refresh_supplier_view
        await refresh_supplier_view(store, ship["ID"])  # the Production screen of the supplier portal

    rcv_matches = await store.find("Receiving", lambda r: id_of(r.get("Shipments")) == str(ship["ID"]))
    rcv = rcv_matches[0] if rcv_matches else None
    if not rcv:
        id_ = await store.add_record("Receiving", {
            "Receive_No1": await store.next_number("Receiving", "Receive_No1", "RCV-"), "Shipments": ship["ID"], "SO_No": so_text, "PO_No": apo.get("PO_No"), "Customer_Name": apo.get("Customer"), "Supplier": s["name"],
        }, ctx.get("user", ""))
        rcv = await store.get_record_by_id("Receiving", id_, raw=True)
    rcv_lines = [dict(l) for l in (rcv.get("Receiving_Line_Items") or [])]
    rcv_patch: dict = {}
    for ln in apo.get("PO_Line_Items") or []:
        if _text(ln.get("PR_No")) != "":
            pr_matches = await store.find(PR, lambda p: _text(p.get("PR_No")) == _text(ln.get("PR_No")))
            if pr_matches:
                rcv_patch["Sales_Owner"] = pr_matches[0].get("Sales_Owner")
        else:
            rcv_patch["Sales_Owner"] = apo.get("Sales_Owner")
        if not any(_text(l.get("PR_No")) == _text(ln.get("PR_No")) for l in rcv_lines):
            rcv_lines.append({"PR_No": ln.get("PR_No"), "SKU": ln.get("SKU"), "Item_Name": ln.get("Item"), "Expected_Qty": ln.get("QTY")})
    computed = receiving_totals(rcv_lines)
    await store.update_record("Receiving", rcv["ID"], {**rcv_patch, **computed["totals"], "Receiving_Line_Items": computed["lines"]}, by_form=True)


# ---------------- approve_po_hc (custom API Approve_P_O_H_C): the local (HC System) POs ----------------
# Every PO linked to an approved Local PR of the sales order gets its shipment (a Pending one is
# re-used) and its Receiving record, with the lines that are not there yet, and the PO becomes
# Confirmed. No supplier copy: HC System is our own sourcing.
async def approve_po_hc(payload: dict, store, ctx: dict | None = None) -> dict:
    ctx = ctx or {}
    so_no = _text((payload or {}).get("soNo"))
    if so_no == "":
        return _fail("soNo is required.")
    prs = await store.find(PR, lambda p: _text(p.get("Sales_Order")) == so_no and truthy(p.get("PR_Approved")) and _text(p.get("Link_PO_No")) != "" and _text(p.get("Sourcing_Type")) == "Local")
    processed = 0
    for po_no in dict.fromkeys(_text(p.get("Link_PO_No")) for p in prs):
        apo_matches = await store.find(PO, lambda p: _text(p.get("PO_No")) == po_no)
        apo = apo_matches[0] if apo_matches else None
        if not apo:
            continue  # Zoho would stop with an error on a missing PO; here it is skipped
        await shipment_and_receiving_for(store, ctx, {"name": "HC System"}, po_no)
        await store.update_record(PO, apo["ID"], {"PO_Status": "Confirmed"}, by_form=True)
        processed += 1
    return {"status": "success", "processed": processed, "message": f"{processed} HC System PO(s) synced"}


async def _approve_po_hc_api(payload: dict, store, ctx: dict) -> dict:
    return await approve_po_hc(payload or {}, store, ctx)


async def _approve_po_main_api(payload: dict, store, ctx: dict) -> dict:
    return await approve_po_main(payload or {}, store, ctx)


async def _approve_po_tony_api(payload: dict, store, ctx: dict) -> dict:
    return await approve_supplier_po("Tony", payload or {}, store, ctx)


async def _approve_po_fenteng_api(payload: dict, store, ctx: dict) -> dict:
    return await approve_supplier_po("Fenteng", payload or {}, store, ctx)


CUSTOM_APIS["Approve_P_O_H_C"] = _approve_po_hc_api
CUSTOM_APIS["approve_po_main"] = _approve_po_main_api
CUSTOM_APIS["approve_po_tony"] = _approve_po_tony_api
CUSTOM_APIS["approve_po_fenteng"] = _approve_po_fenteng_api
