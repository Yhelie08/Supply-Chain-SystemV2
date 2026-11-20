# Form workflows of the Tony Fan / Fenteng Lighting portals, ported from
# zoho-export/parsed/workflows/form:
#   Tony_Shipment / Fenteng_Shipment        Tony_Shipment_Sync / Fenteng_Shipment_Sync   (edit, on success)
#     Each supplier shipment line ticked "Select to ship" and not yet Synced: it gets a shipment id
#     (SHP-AIR-00001 / SHP-LCL-... / SHP-FCL-..., from the Shipment_ID_Counter) and is added to the
#     parent shipment's Supplier_Shipment_Details as "In Transit"; the line is marked Synced (so it
#     is never added twice); the parent shipment gets Ship_Out_Date and Estimated_Warehouse_Arrival
#     (Airfreight + 12 days, FCL + 47, LCL + 67); and the shipment lines of the parent get
#     Shipment_Mode_When_Received by SKU.
#   Tony_Fan_Purchase_Request / Fenteng_Lighting_Purchase_Request
#     Mandatory_PR_Fields_Suppl*   (edit, on validate)   refused while editing is locked (edit_counter
#                                  0) and while the response is missing its Availability, prices
#                                  (unless a catalog price exists, or the supplier cannot produce /
#                                  is unavailable / confirmed) or Lead Time
#     PR_Stage_Supplier_Changed*   (edit, on success)    the supplier's answer (Availability, Initial
#                                  / Negotiated / Final price, Lead Time) is copied onto this
#                                  supplier's row of the buyer's PR (Supplier_Selected)
#     Tony_Sync_Image_PR / Fenteng_Sync_Image_PR (add or edit, on success)  the product image of the item
# Not ported: the Disable_* workflows (on load), Submit_Response_PRbtn / Action buttons (they only
# open the form), the notifications (inactive), and `input.edit_counter = 0` at the end of
# PR_Stage_Supplier_Changed*: Zoho runs it on success, where a change to the form's input is not
# saved, so it never locked anything. Ported from server/modules/procurement/supplier-portal-workflows.mjs.
import json

from app.criteria import ZohoError
from app.deluge import add_days, blank, id_of, parse_date, to_num, truthy, ymd
from app.procurement.plan import customs_days, load_settings, transit_days
from app.procurement.pr_spec import refresh_pr_spec
from app.procurement.ship_track import apply_shipment_event, report_shipment_delay
from app.workflows import register


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _refuse(message: str) -> None:
    raise ZohoError(2001, message)


# ---------------- the supplier's shipment ----------------
_SHIPMENTS = [
    {"form": "Tony_Shipment", "grid": "Supplier2_Shipment_Details"},
    {"form": "Fenteng_Shipment", "grid": "Supplier1_Shipment_Details"},
]
# The days from the ship date to the warehouse now come from Procurement Settings (transit +
# customs + receiving), the same numbers as the plan of Ship & Track. They were fixed here (air 12,
# LCL 67, FCL 47), which gave a second, different arrival date (review C7).
_PREFIX = {"Airfreight": "AIR", "LCL": "LCL", "FCL": "FCL"}


def _make_before_update():
    async def before_update(args: dict) -> None:
        # spec SP-R5: a delay report needs a new date and a reason (the supplier sees the refusal on
        # its own screen)
        input_ = args["input"]
        d, r = _text(input_.get("Delay_New_Date")), _text(input_.get("Delay_Reason")).strip()
        if (d != "" or r != "") and (d == "" or r == ""):
            _refuse("A delay report needs the new expected date and a reason.")
    return before_update


def _make_after_update(form: str, grid: str):
    async def after_update(args: dict) -> None:
        sup, id_, store = args["record"], args.get("id"), args["store"]
        sup_id = _text(sup.get("ID") or id_)
        if _text(sup.get("Delay_New_Date")) != "" and _text(sup.get("Parent_Shipment_ID")) != "":
            date, reason = _text(sup.get("Delay_New_Date")), _text(sup.get("Delay_Reason"))
            await store.update_record(form, sup_id, {"Delay_New_Date": "", "Delay_Reason": ""}, by_form=True)
            try:
                await report_shipment_delay(store, _text(sup.get("Parent_Shipment_ID")), date=date, reason=reason, source="supplier")
            except Exception as e:
                print(f"[ship-track] supplier delay report {e}")
        rows = [dict(r) for r in (sup.get(grid) or [])]
        todo = [r for r in rows if truthy(r.get("Select_To_Ship")) and not truthy(r.get("Synced")) and _text(r.get("Shipment_Mode")) in ("Airfreight", "LCL", "FCL")]
        if not todo:
            return
        parent_id = _text(sup.get("Parent_Shipment_ID"))
        parent = None
        if parent_id != "":
            try:
                parent = await store.get_record_by_id("Shipments", parent_id, raw=True)
            except Exception:
                parent = None
        if not parent:
            return

        counters = await store.find("Shipment_ID_Counter")
        counter = counters[0] if counters else None
        if not counter:
            cid = await store.add_record("Shipment_ID_Counter", {"Air_Counter": 1, "LCL_Counter": 1, "FCL_Counter": 1})
            counter = await store.get_record_by_id("Shipment_ID_Counter", cid, raw=True)
        next_ = {"Airfreight": to_num(counter.get("Air_Counter")) or 1, "LCL": to_num(counter.get("LCL_Counter")) or 1, "FCL": to_num(counter.get("FCL_Counter")) or 1}

        details = list(parent.get("Supplier_Shipment_Details") or [])
        mode_by_sku: dict = {}
        settings = await load_settings(store)
        ship_out, arrival = None, None
        for r in todo:
            mode = _text(r.get("Shipment_Mode"))
            seq = int(next_[mode])
            next_[mode] = seq + 1
            details.append({
                "Shipment_ID": f"SHP-{_PREFIX[mode]}-{str(seq).zfill(5)}", "SO_No": parent.get("Sales_Order"), "PR_No": r.get("PR_No"), "RR_No": r.get("RR_No"), "SKU": r.get("SKU"), "Item_Name": r.get("Item_Name"),
                "Date_Shipped": _text(r.get("Date_Shipped")), "Shipment_Mode": mode, "Status": "In Transit",
            })
            ship_out = _text(r.get("Date_Shipped"))
            d = parse_date(r.get("Date_Shipped"))
            if d:
                arrival = ymd(add_days(d, transit_days(settings, mode) + customs_days(settings, mode) + settings["receiving_days"]))
            mode_by_sku[_text(r.get("SKU"))] = mode
            r["Synced"] = True
        await store.update_record(form, sup_id, {grid: rows}, by_form=True)
        await store.update_record("Shipment_ID_Counter", counter["ID"], {"Air_Counter": next_["Airfreight"], "LCL_Counter": next_["LCL"], "FCL_Counter": next_["FCL"]}, by_form=True)
        patch = {"Supplier_Shipment_Details": details}
        if ship_out:
            patch["Ship_Out_Date"] = ship_out
        if arrival:
            patch["Estimated_Warehouse_Arrival"] = arrival
        patch["PO_Shipments"] = [({**l, "Shipment_Mode_When_Received": mode_by_sku[_text(l.get("SKU"))]} if _text(l.get("SKU")) in mode_by_sku else l) for l in (parent.get("PO_Shipments") or [])]
        await store.update_record("Shipments", parent["ID"], patch, by_form=True)
        # Ship & Track (spec v1.4): the supplier's ship date is a "shipped out" event (it implies
        # production finished, ST-R5). The supplier's own copy cannot refuse the save, so the
        # production-photo rule (ST-R3) is not enforced on this path yet.
        if ship_out:
            try:
                await apply_shipment_event(store, parent["ID"], "shipped_out", occurred_at=ship_out, source="supplier", gate=False)
            except Exception as e:
                print(f"[ship-track] supplier shipout {e}")
    return after_update


for _s in _SHIPMENTS:
    register(_s["form"], {"beforeUpdate": _make_before_update(), "afterUpdate": _make_after_update(_s["form"], _s["grid"])})


# ---------------- the supplier's Purchase Request ----------------
_PR_FORMS = [
    {"form": "Tony_Fan_Purchase_Request", "sfx": "_Supplier2", "name": "Tony Fan"},
    {"form": "Fenteng_Lighting_Purchase_Request", "sfx": "_Supplier1", "name": "Fenteng Lighting"},
]


def _make_pr_hooks(form: str, sfx: str, name: str):
    def f(n: str) -> str:
        return f"{n}{sfx}"

    # Mandatory_PR_Fields_Suppl*: only on an edit
    async def before_update(args: dict) -> None:
        input_, previous = args["input"], args.get("previous")
        rec = {**(previous or {}), **input_}
        if to_num(rec.get("edit_counter")) == 0 and _text(rec.get("edit_counter")) != "":
            _refuse("Editing is locked. Wait for Purchase Request update.")
        missing: list = []

        def note(m: str) -> None:
            if m not in missing:
                missing.append(m)

        has_srp = _text(rec.get(f("Ref_Price_Known"))) == "Yes"
        for row in rec.get(f("Supplier_Selected")) or []:
            avail = _text(row.get(f("Availability")))
            if avail == "":
                note("Availability")
            if avail not in ("Cannot Produce", "Unavailable", "Confirmed") and not has_srp:
                if blank(row.get(f("Initial_Price"))) or to_num(row.get(f("Initial_Price"))) == 0:
                    note("Initial Price")
                if blank(row.get(f("Final_Price"))) or to_num(row.get(f("Final_Price"))) == 0:
                    note("Final Price")
            if avail not in ("Cannot Produce", "Unavailable", "Confirmed") and (blank(row.get(f("Lead_Time"))) or to_num(row.get(f("Lead_Time"))) == 0):
                note("Lead Time")
        if missing:
            _refuse(f"Required fields missing: {', '.join(missing)}")

    # Tony_Sync_Image_PR / Fenteng_Sync_Image_PR
    async def sync_image(args: dict) -> None:
        r, id_, store = args["record"], args.get("id"), args["store"]
        item = None
        if id_of(r.get(f("Items"))) != "":
            try:
                item = await store.get_record_by_id("Items", id_of(r.get(f("Items"))), raw=True)
            except Exception:
                item = None
        if item and not blank(item.get("Image")) and _text(r.get(f"Product_Image{sfx}_PR")) != _text(item.get("Image")):
            await store.update_record(form, _text(r.get("ID") or id_), {f"Product_Image{sfx}_PR": item["Image"]}, by_form=True)

    # PR_Stage_Supplier_Changed*: the answer goes to this supplier's row of the buyer's PR
    async def copy_answer_to_buyer_pr(args: dict) -> None:
        r, store = args["record"], args["store"]
        pr_no = _text(r.get(f("PR_No")))
        rows_in = r.get(f("Supplier_Selected")) or []
        answer = rows_in[0] if rows_in else None
        if pr_no == "" or not answer:
            return
        name_by_id = {str(x["ID"]): _text((x.get("Supplier_Name") or {}).get("first_name") or x.get("Supplier_Name")) for x in await store.find("Suppliers")}
        for pr in await store.find("Purchase_Request1", lambda p: _text(p.get("PR_No")) == pr_no):
            changed = False
            rows = []
            for row in pr.get("Supplier_Selected") or []:
                suppliers_val = row.get("Suppliers")
                s = name_by_id.get(id_of(suppliers_val))
                if s is None:
                    s = _text((suppliers_val or {}).get("display_value") if isinstance(suppliers_val, dict) else suppliers_val)
                if not (s == name or name in s) or changed:
                    rows.append(row)
                    continue
                next_row = {**row, "Availability": answer.get(f("Availability")), "Initial_Price": answer.get(f("Initial_Price")), "Negotiated": answer.get(f("Negotiated")), "Final_Price": answer.get(f("Final_Price")), "Lead_Time": answer.get(f("Lead_Time"))}
                changed = json.dumps(next_row, sort_keys=True, default=str) != json.dumps(row, sort_keys=True, default=str)
                rows.append(next_row)
            if changed:
                await store.update_record("Purchase_Request1", pr["ID"], {"Supplier_Selected": rows}, by_form=True)
                await refresh_pr_spec(store, pr["ID"])

    async def after_add(args: dict) -> None:
        await sync_image(args)

    async def after_update(args: dict) -> None:
        await sync_image(args)
        await copy_answer_to_buyer_pr(args)

    return before_update, after_add, after_update


for _p in _PR_FORMS:
    _before_update, _after_add, _after_update = _make_pr_hooks(_p["form"], _p["sfx"], _p["name"])
    register(_p["form"], {"beforeUpdate": _before_update, "afterAdd": _after_add, "afterUpdate": _after_update})
