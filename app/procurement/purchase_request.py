# Purchase_Request1 workflows, ported from zoho-export/parsed/workflows/form/Purchase_Request1/*.dg.
# Only the events that run on API writes are here (on validate = before, on success = after).
# Skipped on purpose: PR_AutoFill_Item_Details, autofill_customer_type, Select_Unselect_Supplier (on
# user input), PR_Lock_UI_Fields (on load), Notify_on_Purchase_Request (inactive).
# PR1_Forecast_Stamp (the forecast of a PR) lives in app/forecast/pr_hooks.py, imported by this
# module's workflows (see the bottom of this file).
#
# All the "on validate" scripts share Zoho's one `input`, and each reads what the one before it
# wrote, so they run as steps of one function in the order of the workflows in Zoho. Most quirks are
# kept, but PR_Check_Readiness was moved after PR_Set_Shipment_Mode (spec v1.4 PR-R5, review item,
# 2026-11-18): in Zoho it ran before the shipment mode default, so a brand-new priced PR needed an
# unrelated second save before Ready for PO turned on. Ported from
# server/modules/procurement/purchase-request.mjs.
import json

from app.criteria import ZohoError, zoho_now
from app.deluge import add_days, blank, day_diff, id_of, lit, lower, parse_date, round2, same_value, to_num, today_date, truthy, ymd
from app.procurement.plan import parse_lead_days
from app.procurement.suppliers import SUPPLIERS, portal_of, quote_books_id, supplier_index
from app.workflows import register

PR = "Purchase_Request1"


def _text(v) -> str:
    return "" if blank(v) else str(v)


def _num(v):
    return None if blank(v) else float(v)


# The pieces that differ per supplier portal copy: Tony's fields end in _Supplier2, Fenteng's in _Supplier1.
_COPIES = [{**s, "sfx": f"_Supplier{s['n']}"} for s in SUPPLIERS]


# Spec v1.4 SP-R1 (review C11): the supplier's copy never carries our selling price. The portal only
# needs to know that a reference price exists (a Confirmed answer may then skip the initial price),
# so the copy gets Yes / No and never the amount.
def ref_price_known(rec: dict) -> str:
    return "Yes" if (not blank(rec.get("SRP_Rate_PR")) and to_num(rec.get("SRP_Rate_PR")) != 0) else "No"


# ===== on validate: everything the Zoho scripts compute before the save =====
async def validate(args: dict) -> None:
    input_, previous, store = args["input"], args.get("previous"), args["store"]
    adding = not previous
    rec = {**(previous or {}), **input_}
    out: dict = {}

    def set_(k, v) -> None:
        rec[k] = v
        out[k] = v

    today = today_date()
    suppliers = await supplier_index(store)
    lb_before = json.dumps(rec.get("Supplier_Load_Balancing") or [])
    sel_before = json.dumps(rec.get("Supplier_Selected") or [])
    lb = [dict(r) for r in (rec.get("Supplier_Load_Balancing") or [])]
    sel = [dict(r) for r in (rec.get("Supplier_Selected") or [])]

    # --- PR_Generate_Number (on add): the next number after the highest existing one ---
    if adding:
        max_n = 0
        for r in await store.find("Purchase_Request1"):
            digits = "".join(c for c in str(r.get("PR_No") or "") if c.isdigit())
            n = int(digits) if digits else 0
            if n > max_n:
                max_n = n
        set_("PR_No", f"PR-{str(max_n + 1).zfill(5)}")

    # --- PR_Sync_Supplier_Load_Bal: which suppliers can do this category, their load, and the recommended one ---
    category = _text(rec.get("category"))
    eligible = []
    for s in suppliers.values():
        raw_cats = s.get("categories")
        if isinstance(raw_cats, list):
            cats = raw_cats
        elif isinstance(raw_cats, str) and raw_cats != "":
            cleaned = raw_cats.replace("\r", "")
            cats = cleaned.split("\n") if "\n" in cleaned else cleaned.split(",")
        else:
            cats = []
        if s.get("handles_all") or any(str(c).strip() == category for c in cats):
            eligible.append(s["id"])

    def _row_supplier(r) -> str:
        return id_of(r.get("Suppliers"))

    for r in lb:
        if _row_supplier(r) not in eligible:
            r["Match_Category"] = "Not Match"
            r["Eligible_Supplier"] = "Removed"
    for sid in eligible:
        if not any(_row_supplier(r) == sid for r in lb):
            name = suppliers[sid]["display_name"]
            lb.append({"Suppliers": {"ID": sid, "display_value": name, "zc_display_value": name}, "Match_Category": "Match"})

    # Live load per supplier: line items on purchase orders that are not Completed or Cancelled
    live_by_name: dict = {}
    active_pos = await store.get_records("Purchase_Order", criteria='PO_Status != "Completed" && PO_Status != "Cancelled"', page_size=1000)
    for po in active_pos:
        for line in po.get("PO_Line_Items") or []:
            live_by_name[line.get("Supplier")] = live_by_name.get(line.get("Supplier"), 0) + 1

    # Recommended: lowest price (negotiated, else initial), then the shortest lead time among equal prices
    recommended = ""
    best_price = -1
    best_lead = -1
    for sid in eligible:
        nm = suppliers[sid]["display_name"]
        price, lead = -1, -1
        for q in sel:
            who = _text(q.get("Suppliers"))
            if who == nm or nm in who:
                if not blank(q.get("Negotiated")) and to_num(q.get("Negotiated")) > 0:
                    price = to_num(q.get("Negotiated"))
                elif not blank(q.get("Initial_Price")) and to_num(q.get("Initial_Price")) > 0:
                    price = to_num(q.get("Initial_Price"))
                lead = _num(q.get("Lead_Time"))
        if price >= 0:
            if best_price == -1 or price < best_price:
                best_price, best_lead, recommended = price, lead, sid
            elif price == best_price and ((lead is not None and best_lead == -1) or (lead is not None and best_lead is not None and lead < best_lead)):
                best_lead, recommended = lead, sid
    for r in lb:
        sid = _row_supplier(r)
        if sid not in eligible:
            continue
        live = live_by_name.get(suppliers[sid]["display_name"], 0)
        cap = to_num(suppliers[sid].get("max_capacity"))
        pct = (live * 100) / cap if cap > 0 else 0
        # Numbers in subform rows are kept as text with Zoho's two decimals, as the rows exported
        # from Zoho have them
        r.update({"Match_Category": "Match", "Active_POs": str(live), "Percent": f"{round2(pct):.2f}", "Load_Status": "Overloaded" if pct >= 100 else ("Near Capacity" if pct >= 80 else "Normal"), "Eligible_Supplier": "Recommended" if sid == recommended else "Available"})

    # --- PR_Sync_Supplier_Selected: one row per matched supplier, one winner, copied up to the PR ---
    if rec.get("Sourcing_Type") == "Local":
        set_("Selected_Supplier", "HC System")
        set_("Required_Days_Lead", 0)
    else:
        matched = []
        for r in lb:
            if r.get("Match_Category") == "Match" and _row_supplier(r) not in matched:
                matched.append(_row_supplier(r))
        existing = []
        for r in sel:
            sid = _text(r.get("Supplier_ID"))
            existing.append(sid)
            if sid not in matched:
                r["Status"] = "Removed"
                r["Selected"] = False
            else:
                r["Status"] = "Active"
        for sid in matched:
            if sid not in existing:
                sel.append({"Supplier_ID": sid, "Suppliers": suppliers.get(sid, {}).get("display_name", ""), "Status": "Active", "Selected": False})
        first = next((i for i, r in enumerate(sel) if truthy(r.get("Selected"))), -1)
        if first >= 0:
            for i, r in enumerate(sel):
                if i != first:
                    r["Selected"] = False
        selected_rows = [r for r in sel if truthy(r.get("Selected"))]
        winner = selected_rows[-1] if selected_rows else None
        if winner:
            set_("Selected_Supplier", winner.get("Suppliers"))
            if to_num(winner.get("Final_Price")) > 0:
                set_("Selcted_Final_Cost", to_num(winner.get("Final_Price")))
            set_("Required_Days_Lead", parse_lead_days(winner.get("Lead_Time")) or to_num(winner.get("Lead_Time")))
        else:
            set_("Selected_Supplier", "")
            set_("Selcted_Final_Cost", 0)
            set_("Required_Days_Lead", 0)
            set_("Followed_Recommendation", "")

    # --- PR_Set_Default_Status ---
    set_("PR_Status", "Open" if blank(rec.get("Link_PO_No")) else "Converted to PO")

    # --- PR_Lock_After_PO: a PR that became a PO may not change its commercial terms ---
    if rec.get("PR_Status") == "Converted to PO" and (previous or {}).get("PR_Status") == "Converted to PO":
        def _snapshot(rows) -> dict:
            return {_text(r.get("Supplier_ID")): f"{truthy(r.get('Selected'))}|{to_num(r.get('Final_Price'))}|{_text(r.get('Status'))}|{_text(r.get('Suppliers'))}" for r in (rows or [])}
        was = _snapshot((previous or {}).get("Supplier_Selected"))
        now = _snapshot(sel)
        changed = any(not same_value(rec.get(k), (previous or {}).get(k)) for k in ["quantity", "Selected_Supplier", "Shipment_Mode", "Target_Delivery", "Selcted_Final_Cost", "Production_Date"]) \
            or len(was) != len(now) or any(was.get(sid) != snap for sid, snap in now.items())
        if changed:
            raise ZohoError(2001, "Warning: this PR is already locked because it has been converted to a PO. The Qty, Supplier, Shipping Mode, Target Date, Final Cost, or Production Date should not be changed. Please revert the changes before saving.")

    # --- PR_Export_Selected_Supplier (on edit only): the selected row's supplier and lead time onto
    # the PR. (The Zoho script also assigns the final price to a variable it never uses, so that part
    # does nothing.) ---
    if not adding:
        for r in sel:
            if truthy(r.get("Selected")):
                set_("Selected_Supplier", r.get("Suppliers"))
                set_("Required_Days_Lead", r.get("Lead_Time"))

    # --- PR_Compute_Shipment_Timeline ---
    production = None
    if rec.get("PR_Status") == "Converted to PO":
        production = parse_date(rec.get("Production_Date"))
    else:
        production = today
        set_("Production_Date", ymd(today))
    if production:
        ship_days = 0 if rec.get("Sourcing_Type") == "Local" else (30 if rec.get("Shipment_Mode") in ("LCL", "FCL") else 14)
        production_end = add_days(production, to_num(rec.get("Required_Days_Lead")))
        target = add_days(production_end, ship_days)
        current = target if today > production_end else production_end
        set_("Remaining_Days", day_diff(current, today))
        # Zoho reads `input.Supplier_Target_Date` here, which this port takes to be the field
        # supplier_target_date as saved before this save.
        supplier_target = parse_date(rec.get("supplier_target_date"))
        set_("Delay_Status", "Delayed" if (supplier_target and today > supplier_target) else ("At Risk" if rec.get("Remaining_Days", 0) <= 3 else "On Track"))

    # --- PR_Set_Shipment_Mode: supplier target date = target delivery - 4 days; LCL if 30+ days away, else airfreight ---
    delivery = parse_date(rec.get("Target_Delivery"))
    if delivery:
        set_("supplier_target_date", ymd(add_days(delivery, -4)))
    if rec.get("PR_Status") != "Converted to PO":
        target_date = parse_date(rec.get("supplier_target_date"))
        if target_date:
            # Spec v1.4 (02 Procurement / 03, PO-R1; review C4): the mode is the BUYER's choice. It is
            # only defaulted when it is blank, and the default is sea: when sea cannot make the date
            # the PR shows `impossible` with the air option, and the buyer decides at Create PO. (The
            # Zoho script switched to air by itself, on every save, whenever the target was under 30
            # days away.)
            if blank(rec.get("Shipment_Mode")):
                set_("Shipment_Mode", "LCL")
            set_("Shipment_Days", 14 if rec.get("Shipment_Mode") == "Airfreight" else 30)

    # --- PR_Check_Readiness: the four conditions and their AND ---
    # Spec v1.4 (02 Procurement / 02, PR-R5): an auto-priced PR reaches Ready for PO without a person
    # waiting on an extra save. Moved below PR_Set_Shipment_Mode (review item, 2026-11-18) so a
    # brand-new PR with a price, a supplier and a target already sees its own just-defaulted
    # Shipment_Mode in the same save, instead of the stale blank one from before this save (which
    # needed an unrelated second touch to flip Ready for PO on). Nothing between here and the old
    # position reads these four fields or PR_READY_FOR_PO, so the reorder is safe.
    set_("Selected_Supplier1", not blank(rec.get("Selected_Supplier")))
    has_price = False
    if not blank(rec.get("SRP_Approved_PR")) and to_num(rec.get("SRP_Approved_PR")) != 0:
        has_price = True
    elif not blank(rec.get("SRP_Rate_PR")) and to_num(rec.get("SRP_Rate_PR")) != 0:
        has_price = True
    elif not blank(rec.get("inquiry_reference")):
        has_price = True
    else:
        items = [] if blank(rec.get("sku")) else await store.get_records("Items", criteria=f"SKU == {lit(rec.get('sku'))}", page_size=1)
        item = items[0] if items else None
        has_price = to_num((item or {}).get("Rate")) != 0 or to_num(rec.get("Selcted_Final_Cost")) > 0
    set_("Final_price_confirmed", has_price)
    set_("Shipping_mode_selected", rec.get("Sourcing_Type") == "Local" or not blank(rec.get("Shipment_Mode")))
    set_("Target_date_exists", not blank(rec.get("Target_Delivery")))
    set_("PR_READY_FOR_PO", bool(rec.get("Selected_Supplier1")) and bool(rec.get("Final_price_confirmed")) and bool(rec.get("Shipping_mode_selected")) and bool(rec.get("Target_date_exists")))

    # --- PR_Compute_Priority ---
    score = 0
    if delivery:
        days = day_diff(delivery, today)
        if days <= 3:
            score += 50
        elif days <= 7:
            score += 30
        elif days <= 14:
            score += 15
    if to_num(rec.get("Order_Value")) >= 500000:
        score += 20
    last_update = parse_date(rec.get("Last_Update"))
    if last_update and day_diff(today, last_update) > 5:
        score += 20
    set_("Priority", "High" if score >= 70 else ("Medium" if score >= 40 else "Low"))
    set_("Priority_Score", score)

    input_.update(out)
    if json.dumps(lb) != lb_before:
        input_["Supplier_Load_Balancing"] = lb
    if json.dumps(sel) != sel_before:
        input_["Supplier_Selected"] = sel


# ===== PR_Populate_From_PR (on add, on success): a copy for each supplier portal that should quote =====
async def populate_copies(args: dict) -> None:
    record, store, user = args["record"], args["store"], args.get("user", "")
    if record.get("Source") == "SO" or record.get("Sourcing_Type") == "Local":
        return
    suppliers = await supplier_index(store)
    inq_no = record.get("inquiry_reference")
    route = {"tony": True, "fenteng": True}
    quote: dict = {}
    if not blank(inq_no):
        # Linked to an inquiry: only the supplier whose quote was selected there; both if none was selected
        route["tony"] = route["fenteng"] = False
        any_selected = False
        matches = await store.find("Inquiry_Form", lambda r: r.get("INQ_No") == inq_no)
        inq = matches[0] if matches else None
        for q in (inq or {}).get("Supplier_Quotes") or []:
            if not truthy(q.get("Selected")):
                continue
            any_selected = True
            for c in _COPIES:
                if quote_books_id(q, suppliers) == c["books_id"]:
                    route[c["key"]] = True
                    quote[c["key"]] = q
        if not any_selected:
            route["tony"] = route["fenteng"] = True
    item = None
    if id_of(record.get("Items")):
        try:
            item = await store.get_record_by_id("Items", id_of(record.get("Items")), raw=True)
        except Exception:
            item = None
    for c in _COPIES:
        if not route[c["key"]]:
            continue
        q = quote.get(c["key"])
        sfx = c["sfx"]
        copy = {
            f"PR_No{sfx}": record.get("PR_No"), f"PR_Date{sfx}": record.get("PR_Date"), f"Items{sfx}": record.get("Items"), f"sku{sfx}": record.get("sku"),
            f"quantity{sfx}": record.get("quantity"), f"Description1{sfx}": record.get("Description1"), f"description{sfx}": record.get("description"),
            f"unit{sfx}": record.get("unit"), f"category{sfx}": record.get("category"), f"Target_Delivery{sfx}": record.get("Target_Delivery"),
            f"Priority_PR{sfx}": record.get("Priority"), f"Ref_Price_Known{sfx}": ref_price_known(record), f"inquiry_reference{sfx}": inq_no,
            "Response_Status": "Selected" if q else "Waiting", "edit_counter": 1,
            f"Supplier_Selected{sfx}": [({f"Suppliers{sfx}": c["name"], f"Availability{sfx}": q.get("Availability"), f"Initial_Price{sfx}": q.get("Initial_Price"), f"Negotiated{sfx}": q.get("Negotiated"),
                                          f"Final_Price{sfx}": q.get("Final_Price"), f"Lead_Time{sfx}": q.get("Lead_Time"), f"Selected{sfx}": True} if q else {f"Suppliers{sfx}": c["name"]})],
        }
        if not blank((item or {}).get("Image")):
            copy[f"Product_Image{sfx}_PR"] = item["Image"]
        await store.add_record(c["pr_form"], copy, user)


# ===== PR_Changed (on edit, on success): stamp Last_Update and bring each supplier's copy up to date =====
async def changed_copies(args: dict) -> None:
    id_, record, store = args.get("id"), args["record"], args["store"]
    await store.update_record("Purchase_Request1", id_, {"Last_Update": zoho_now()}, by_form=True)
    suppliers = await supplier_index(store)
    rows = record.get("Supplier_Selected") or []
    any_selected = any(truthy(r.get("Selected")) for r in rows)
    inq = None
    if not blank(record.get("inquiry_reference")):
        matches = await store.find("Inquiry_Form", lambda r: r.get("INQ_No") == record.get("inquiry_reference"))
        inq = matches[0] if matches else None
    item = None
    if id_of(record.get("Items")):
        try:
            item = await store.get_record_by_id("Items", id_of(record.get("Items")), raw=True)
        except Exception:
            item = None
    for c in _COPIES:
        sfx = c["sfx"]
        for copy in await store.find(c["pr_form"], lambda r: r.get(f"PR_No{sfx}") == record.get("PR_No")):
            has_changes = not same_value(copy.get(f"sku{sfx}"), record.get("sku")) or not same_value(copy.get(f"quantity{sfx}"), record.get("quantity")) \
                or not same_value(copy.get(f"Target_Delivery{sfx}"), record.get("Target_Delivery")) or not same_value(copy.get(f"Description1{sfx}"), record.get("Description1"))
            this_selected = any(truthy(r.get("Selected")) and (portal_of(r.get("Suppliers")) or {}).get("key") == c["key"] for r in rows)
            inquiry_quote = next((q for q in ((inq or {}).get("Supplier_Quotes") or []) if truthy(q.get("Selected")) and quote_books_id(q, suppliers) == c["books_id"]), None)
            status = copy.get("Response_Status")
            counter = 0 if blank(copy.get("edit_counter")) else int(float(copy.get("edit_counter")))
            if has_changes:
                status, counter = "Submit Response", 1
            if any_selected:
                status, counter = "Not Selected", 0
            if this_selected or inquiry_quote:
                status, counter = "Selected", 1
            patch = {
                "Response_Status": status, "edit_counter": counter,
                f"PR_Date{sfx}": record.get("PR_Date"), f"sku{sfx}": record.get("sku"), f"quantity{sfx}": record.get("quantity"), f"Description1{sfx}": record.get("Description1"),
                f"description{sfx}": record.get("description"), f"Target_Delivery{sfx}": record.get("Target_Delivery"), f"Ref_Price_Known{sfx}": ref_price_known(record),
                f"inquiry_reference{sfx}": record.get("inquiry_reference"),
            }
            if inquiry_quote:
                patch[f"Supplier_Selected{sfx}"] = [{**r, f"Availability{sfx}": inquiry_quote.get("Availability"), f"Initial_Price{sfx}": inquiry_quote.get("Initial_Price"), f"Negotiated{sfx}": inquiry_quote.get("Negotiated"),
                                                      f"Final_Price{sfx}": inquiry_quote.get("Final_Price"), f"Lead_Time{sfx}": inquiry_quote.get("Lead_Time"), f"Selected{sfx}": True} for r in (copy.get(f"Supplier_Selected{sfx}") or [])]
            if not blank((item or {}).get("Image")):
                patch[f"Product_Image{sfx}_PR"] = item["Image"]
            await store.update_record(c["pr_form"], copy["ID"], patch, by_form=True)


# ===== PR1_Sync_Own_Image (on add or edit, on success) =====
async def sync_own_image(args: dict) -> None:
    id_, record, store = args.get("id"), args["record"], args["store"]
    item = None
    if id_of(record.get("Items")):
        try:
            item = await store.get_record_by_id("Items", id_of(record.get("Items")), raw=True)
        except Exception:
            item = None
    if not blank((item or {}).get("Image")) and record.get("Product_Image_PR") != item["Image"]:
        await store.update_record("Purchase_Request1", id_, {"Product_Image_PR": item["Image"]}, by_form=True)


# ===== PR_Deleted (on delete, on success): the suppliers' copies go with the PR =====
async def delete_copies(args: dict) -> None:
    previous, store = args.get("previous") or {}, args["store"]
    for c in _COPIES:
        sfx = c["sfx"]
        for copy in await store.find(c["pr_form"], lambda r: r.get(f"PR_No{sfx}") == previous.get("PR_No")):
            await store.delete_record(c["pr_form"], copy["ID"])


register(PR, {
    "beforeAdd": [validate],
    "beforeUpdate": [validate],
    "afterAdd": [populate_copies, sync_own_image],
    "afterUpdate": [changed_copies, sync_own_image],
    "afterDelete": [delete_copies],
})

# PR1_Forecast_Stamp ("on add or edit, on success" of Purchase_Request1): imported by the Procurement
# module (Node: server/modules/procurement/workflows.mjs), not by Fulfillment.
import app.forecast.pr_hooks  # noqa: E402,F401
