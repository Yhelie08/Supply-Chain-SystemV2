# Inquiry_Form workflows, ported from zoho-export/parsed/workflows/form/Inquiry_Form/*.dg.
# Only the events that run when a record is written through the API are here (on validate = before,
# on success = after). Skipped on purpose: INQ_Load_Unit_Choices, INQ_Default_All_Suppliers,
# Disable_Supplier_Quotes_L (on load), INQ_AutoFill_Customer_Type / _Item_Details / _Project_Name and
# Selected_Uncheck_Others (on user input), Notify_Suppliers_on_Inquiry (inactive), Log_Updated_Item (no script).
#
# Order of the hooks follows the order of the workflows in the Zoho app. Ported from
# server/modules/procurement/inquiry.mjs.
import os

from app.criteria import ZohoError, zoho_now
from app.deluge import blank, has_value, id_of, ids_of, inquiry_number, lit, lower, round2, stamp as stamp_token, to_num, truthy, unbracket
from app.procurement.inq_spec import refresh_inquiry_spec
from app.procurement.suppliers import SUPPLIERS, portal_of, quote_books_id, supplier_index
from app.workflows import register

FORM = "Inquiry_Form"


def _text(v) -> str:
    return "" if blank(v) else str(v)


# ----- lookups -----
async def _project_code(store, projects):
    id_ = id_of(projects)
    if not id_:
        return None
    try:
        p = await store.get_record_by_id("Projects", id_, raw=True)
        return p.get("Project_Code")
    except Exception:
        return None


# ----- the supplier-tag <-> quote-row bookkeeping shared by the validate scripts -----
# Adds a "Not Selected" row for every tagged supplier that has no row yet (matched by ID first, then by name).
def _add_missing_quote_rows(rows: list, tagged: list) -> None:
    ids = {x for x in (unbracket(r.get("Supplier_ID")) for r in rows) if x}
    names = {lower(r.get("Suppliers")) for r in rows}
    for t in tagged:
        if t["id"] in ids or t["name_key"] in names:
            continue
        rows.append({"Suppliers": t["name"], "Supplier_ID": f"[{t['id']}]", "Stage": "Not Selected"})
        ids.add(t["id"])
        names.add(t["name_key"])


def _tagged_suppliers(suppliers: dict, supplier_field) -> list:
    out = []
    for id_ in ids_of(supplier_field):
        name = suppliers.get(id_, {}).get("name", "")
        out.append({"id": id_, "name": name, "name_key": lower(name)})
    return out


# ===== INQ_Auto_Populate_Supplier_Quotes (on add, on validate) =====
# The Zoho script also computed INQ_No from the highest existing number; INQ_Generate_Number
# overwrites it from INQ_Seq right after the save, so only the parts that survive are kept here.
async def populate_quotes(args: dict) -> None:
    input_, store = args["input"], args["store"]
    suppliers = await supplier_index(store)
    input_["quote_group"] = (await _project_code(store, input_.get("Projects"))) or ""
    tagged = _tagged_suppliers(suppliers, input_.get("Suppliers"))
    rows = [dict(r) for r in (input_.get("Supplier_Quotes") or [])]
    _add_missing_quote_rows(rows, tagged)
    input_["Supplier_Quotes"] = rows
    input_["Supplier_Quotes_Last_Edited"] = [*(input_.get("Supplier_Quotes_Last_Edited") or []), *[{"Suppliers_Last_Edited": t["name"]} for t in tagged]]


# ===== INQ_Check_Readiness (on add or edit, on validate) =====
# `input` is what the widget sends; on an edit that is only the changed fields, so the whole record
# is rebuilt from the saved one first (Zoho's input is always the whole record). The computed fields
# are written back into `input`.
# Kept as in Zoho: step G reads Collateral_Comple_NA before step H recomputes it, and the project
# roll-up reads the inquiries as they are in the database, before this save.
async def check_readiness(args: dict) -> None:
    import json
    input_, previous, store = args["input"], args.get("previous"), args["store"]
    suppliers = await supplier_index(store)
    rec = {**(previous or {}), **input_}
    quotes_before = json.dumps(rec.get("Supplier_Quotes") or [])
    rows = [dict(r) for r in (rec.get("Supplier_Quotes") or [])]
    out: dict = {}

    def set_(k, v) -> None:
        rec[k] = v
        out[k] = v

    project_id = id_of(rec.get("Projects"))

    # Step 0: backfill quote_group
    if rec.get("quote_group") is None or (rec.get("quote_group") == "" and project_id):
        set_("quote_group", (await _project_code(store, project_id)) or "")

    # Steps A-C: tags removed -> Declined; tags added -> new row
    tagged = _tagged_suppliers(suppliers, rec.get("Suppliers"))
    tagged_ids = {t["id"] for t in tagged}
    tagged_names = {t["name_key"] for t in tagged}
    for qr in rows:
        row_id = unbracket(qr.get("Supplier_ID"))
        if not ((row_id and row_id in tagged_ids) or lower(qr.get("Suppliers")) in tagged_names):
            qr["Stage"] = "Declined"
    _add_missing_quote_rows(rows, tagged)

    # Step D: the selected supplier wins, the others are declined (and restored if the selection is removed)
    winners = [qr for qr in rows if truthy(qr.get("Selected"))]
    winner = winners[-1] if winners else None

    def restore(qr: dict) -> None:
        if qr.get("Stage") == "Declined" and not blank(qr.get("Prev_Stage")):
            qr["Stage"] = qr["Prev_Stage"]
            qr["Prev_Stage"] = ""

    if winner:
        for qr in rows:
            if qr.get("Suppliers") == winner.get("Suppliers"):
                restore(qr)
            else:
                if qr.get("Stage") != "Declined":
                    qr["Prev_Stage"] = qr.get("Stage")
                qr["Stage"] = "Declined"
                qr["Selected"] = False
        set_("Select_Final_Cost", winner.get("Final_Price"))
    else:
        for qr in rows:
            restore(qr)
        set_("Select_Final_Cost", 0)

    # Step E: checklist
    set_("Supplier_Selected", bool(winner))
    set_("Availability", bool(winner) and not blank(winner.get("Availability")))
    set_("Final_Price_Exists", to_num(rec.get("Select_Final_Cost")) > 0 or to_num(rec.get("SRP_Approved1")) > 0)
    set_("SRP_Approved", rec.get("SRP_Status") == "Approved")

    # Step F: margin
    srp = to_num(rec.get("SRP_Approved1"))
    set_("Margin", round2(((srp - to_num(rec.get("Select_Final_Cost"))) / srp) * 100) if srp > 0 else 0)

    # Step G: ready for estimate (uses the collateral flag as it was before this save)
    set_("Ready_for_Estimates", bool(rec.get("Supplier_Selected") and rec.get("Availability") and rec.get("Final_Price_Exists") and rec.get("SRP_Approved") and truthy(rec.get("Collateral_Comple_NA"))))

    # Step H: collateral complete or N/A
    set_("Collateral_Comple_NA", all(rec.get(f) in ("Completed", "N/A") for f in ["Product_Sample", "D_Image", "Specification", "Technical_Drawing"]))

    # Roll up onto the project: are all its inquiries SRP-approved?
    if project_id:
        related = await store.get_records("Inquiry_Form", criteria=f"Projects == {lit(project_id)}", page_size=1000)
        all_approved = all(r.get("SRP_Status") == "Approved" for r in related)
        try:
            await store.update_record("Projects", project_id, {"All_SRP_Approved": all_approved}, by_form=True)
        except Exception:
            pass  # project was deleted

    input_.update(out)
    if json.dumps(rows) != quotes_before:
        input_["Supplier_Quotes"] = rows


# ===== Stage_Inquiry_Changed #1 (on add or edit, on success): the stage of each quote row from its prices =====
async def stage_rows(args: dict) -> None:
    id_, record, store = args.get("id"), args["record"], args["store"]
    rows = record.get("Supplier_Quotes") or []
    changed = False
    next_rows = []
    for sq in rows:
        nego = has_value(sq.get("Negotiated"))
        final = has_value(sq.get("Final_Price"))
        s = "Final" if (nego and final) else ("Negotiating" if (nego or final) else "Not Selected")
        if sq.get("Stage") != s:
            changed = True
        next_rows.append({**sq, "Stage": s})
    if not changed:
        return
    await store.update_record("Inquiry_Form", id_, {"Supplier_Quotes": next_rows}, by_form=True)
    record["Supplier_Quotes"] = next_rows


# ===== Supplier_Populate_From_INQ (on add, on success): a copy of the inquiry for each supplier that was asked =====
async def populate_suppliers(args: dict) -> None:
    record, store, user = args["record"], args["store"], args.get("user", "")
    suppliers = await supplier_index(store)
    item = None
    if id_of(record.get("Items")):
        try:
            item = await store.get_record_by_id("Items", id_of(record.get("Items")), raw=True)
        except Exception:
            item = None
    number = inquiry_number(record.get("INQ_Seq"))
    quotes = record.get("Supplier_Quotes") or []
    attachments = str(record.get("Attachments") if record.get("Attachments") is not None else "")
    for s in SUPPLIERS:
        mine = [q for q in quotes if quote_books_id(q, suppliers) == s["books_id"]]
        if not mine:
            continue
        copy = {
            "INQ_No_Supplier": number, "SKU_Supplier": record.get("sku"), "Target_Date_Supplier": record.get("target_date"), "Items_Supplier": record.get("Items"),
            "Quantity_Supplier": record.get("quantity"), "Unit_Supplier": record.get("unit"), "Description_Supplier": record.get("description"),
            "Date_Created_Supplier": record.get("created_date"), "Open_to_similar_design_Supplier": record.get("Open_to_similar_design"),
            "Additional_Description_Supplier": record.get("Addtional_Description"), "Response_Status": "Waiting", "edit_counter": 1,
            "Supplier_quotes": [{"SupplierName": q.get("Suppliers"), "Availability_Supplier": q.get("Availability"), "Initial_Price_Supplier": q.get("Initial_Price"),
                                 "Negotiated_Supplier": q.get("Negotiated"), "Final_Price_Supplier": q.get("Final_Price"), "Lead_Time_Supplier": q.get("Lead_Time"),
                                 "Stage_Supplier": q.get("Stage"), "Selected_Supplier": q.get("Selected")} for q in mine],
        }
        if not blank((item or {}).get("Image")):
            copy[s["image_field"]] = item["Image"]
        if attachments not in ("", "[]"):
            copy["Image_from_Inq"] = record.get("Attachments")
        new_id = await store.add_record(s["form"], copy, user)

        token = f"INQ-{new_id}-{stamp_token()}"
        await store.add_record(s["notifications"], {
            "Recipient_Email": os.environ.get(s["email_env"], ""),
            "Notification_Type": "New Inquiry added",
            "Message": f"A new inquiry {number} was added.",
            "Created_On": zoho_now(), "Read": False,
            "Target_URL": f"{os.environ.get('APP_BASE_URL', '')}/#Page:{s['page']}?{s['param']}={token}",
            "Source_Record_No": number, "Source_Record_ID": new_id, "Deep_Link_Token": token,
        }, user)


# ===== Stage_Inquiry_Changed #2 and #3 (on add or edit, on success): keep each supplier's copy in step =====
_FREE_CHOICES = {"Required", "HideToSupplier"}


def _fuzzy_match(a, b) -> bool:
    x, y = lower(a), lower(b)
    return y in x or x in y


async def sync_suppliers(args: dict) -> None:
    record, store = args["record"], args["store"]
    suppliers = await supplier_index(store)
    quotes = record.get("Supplier_Quotes") or []
    item = None
    if id_of(record.get("Items")):
        try:
            item = await store.get_record_by_id("Items", id_of(record.get("Items")), raw=True)
        except Exception:
            item = None
    attachments = str(record.get("Attachments") if record.get("Attachments") is not None else "")
    for s in SUPPLIERS:
        copies = await store.find(s["form"], lambda r: r.get("INQ_No_Supplier") == record.get("INQ_No"))
        for r in copies:
            patch = {"Dimension_Supplier": record.get("Dimension"), "Color_Body_Supplier": record.get("Color_Body"), "Voltage_Supplier": record.get("Voltage"), "Lumens_Supplier": record.get("Lumens"),
                     "Color_Temperature_Supplier": record.get("Color_Temperature"), "Type_of_Bulb_Supplier": record.get("Type_of_Bulb")}
            if r.get("Response_Status") != "Completed":
                def _mine(q):
                    id_ = quote_books_id(q, suppliers)
                    if id_ != "":
                        return id_ == s["books_id"]
                    portal = portal_of(q.get("Suppliers"))
                    return bool(portal) and portal["key"] == s["key"]

                any_selected = any(truthy(q.get("Selected")) for q in quotes)
                this_selected = any(_mine(q) and truthy(q.get("Selected")) for q in quotes)
                copy_rows = r.get("Supplier_quotes") or []

                def _matches(sq):
                    return [q for q in quotes if not blank(q.get("Suppliers")) and _fuzzy_match(q.get("Suppliers"), sq.get("SupplierName"))]

                from app.deluge import same_value
                has_changes = any(any(not same_value(sq.get("Availability_Supplier"), q.get("Availability")) or not same_value(sq.get("Initial_Price_Supplier"), q.get("Initial_Price"))
                                       or not same_value(sq.get("Negotiated_Supplier"), q.get("Negotiated")) or not same_value(sq.get("Final_Price_Supplier"), q.get("Final_Price"))
                                       or not same_value(sq.get("Lead_Time_Supplier"), q.get("Lead_Time")) for q in _matches(sq)) for sq in copy_rows)
                status = r.get("Response_Status")
                counter = 0 if blank(r.get("edit_counter")) else int(float(r.get("edit_counter")))
                if has_changes:
                    counter, status = 1, "Submit Response"
                if any_selected:
                    status = "Not Selected"
                if this_selected:
                    status, counter = "Selected", 1
                patch["Response_Status"] = status
                patch["edit_counter"] = counter

                def _row_patch(sq):
                    row = dict(sq)
                    for q in _matches(sq):
                        row.update({"Availability_Supplier": q.get("Availability"), "Initial_Price_Supplier": q.get("Initial_Price"), "Negotiated_Supplier": q.get("Negotiated"),
                                     "Final_Price_Supplier": q.get("Final_Price"), "Lead_Time_Supplier": q.get("Lead_Time"), "Stage_Supplier": q.get("Stage"), "Selected_Supplier": q.get("Selected")})
                    return row

                patch["Supplier_quotes"] = [_row_patch(sq) for sq in copy_rows]

                def _keep(current, incoming):
                    return current if incoming in _FREE_CHOICES else incoming

                patch.update({
                    "SKU_Supplier": record.get("sku"), "Target_Date_Supplier": record.get("target_date"), "Quantity_Supplier": record.get("quantity"), "Description_Supplier": record.get("description"),
                    "Open_to_similar_design_Supplier": record.get("Open_to_similar_design"), "Additional_Description_Supplier": record.get("Addtional_Description"),
                    "Product_Sample_Supplier": _keep(r.get("Product_Sample_Supplier"), record.get("Product_Sample")), "D_Image_Supplier": _keep(r.get("D_Image_Supplier"), record.get("D_Image")),
                    "Specification_Supplier": _keep(r.get("Specification_Supplier"), record.get("Specification")), "Technical_Drawing_Supplier": _keep(r.get("Technical_Drawing_Supplier"), record.get("Technical_Drawing")),
                    "Specification_Details_Supplier": record.get("Specification_Details"),
                })
                if not blank((item or {}).get("Image")):
                    patch[s["image_field"]] = item["Image"]
                if attachments not in ("", "[]"):
                    patch["Image_from_Inq"] = record.get("Attachments")
            await store.update_record(s["form"], r["ID"], patch, by_form=True)


# ===== Stage_Supplier_Changed (Supplier_1/Supplier_2, on edit, on success): push the supplier's
# own submitted quote back up into the matching Inquiry's Supplier_Quotes row, plus the
# collateral/hide-flag fields the native app also pushed up here. Never ported before now -- its
# absence meant a supplier's real Submit Response never reached the buyer's own Inquiry Detail
# view at all (confirmed live: Supplier_2's own row had real Initial_Price_Supplier/Availability_
# Supplier saved, but Inquiry_Form's Supplier_Quotes stayed empty forever). Mirrors
# PASTE_Stage_Supplier_Changed_Production.txt exactly: matched by this supplier's real Books
# vendor id (via the Supplier_Quotes row's own Supplier_ID -> Suppliers table lookup), not by name.
# 2026-11-17: also copies the row's Stage, the Similar Design Photo and the "last edited" rows, like
# the Zoho script (part 2 of Stage_Supplier_Changed). The photo is copied as it is: Zoho wrapped it
# in a list, our upload field holds the path. =====
async def sync_back_to_inquiry(args: dict) -> None:
    s, record, store = args["s"], args["record"], args["store"]
    inq_no = record.get("INQ_No_Supplier")
    if blank(inq_no):
        return
    suppliers = await supplier_index(store)
    quote_rows = record.get("Supplier_quotes") or []
    quote_row = quote_rows[0] if quote_rows else None
    if not quote_row:
        return
    for inq in await store.find("Inquiry_Form", lambda r: r.get("INQ_No") == inq_no):
        done = False  # Zoho stops at the first matching quote row
        quotes = []
        for q in inq.get("Supplier_Quotes") or []:
            if done or quote_books_id(q, suppliers) != s["books_id"]:
                quotes.append(q)
                continue
            done = True
            quotes.append({**q, "Availability": quote_row.get("Availability_Supplier"), "Initial_Price": quote_row.get("Initial_Price_Supplier"),
                            "Negotiated": quote_row.get("Negotiated_Supplier"), "Final_Price": quote_row.get("Final_Price_Supplier"), "Lead_Time": quote_row.get("Lead_Time_Supplier"),
                            "Stage": quote_row.get("Stage_Supplier")})
        patch = {"Supplier_Quotes": quotes}
        if inq.get("Product_Sample") != "HideToSupplier":
            patch["Product_Sample"] = record.get("Product_Sample_Supplier")
        if inq.get("D_Image") != "HideToSupplier":
            patch["D_Image"] = record.get("D_Image_Supplier")
        if inq.get("Specification") != "HideToSupplier":
            patch["Specification"] = record.get("Specification_Supplier")
            patch["Specification_Details"] = record.get("Specification_Details_Supplier")
        if inq.get("Technical_Drawing") != "HideToSupplier":
            patch["Technical_Drawing"] = record.get("Technical_Drawing_Supplier")
        photo = str(record.get("Similar_Design_Photo_Supplier") if record.get("Similar_Design_Photo_Supplier") is not None else "")
        if not blank(record.get("Similar_Design_Photo_Supplier")) and photo not in ("{}", "[]"):
            patch["Similar_Design_Photo"] = record.get("Similar_Design_Photo_Supplier")
        last_edited = inq.get("Supplier_Quotes_Last_Edited") or []
        if last_edited:
            def _le_patch(le):
                sq = next((x for x in reversed(record.get("Supplier_quotes") or []) if le.get("Suppliers_Last_Edited") == x.get("SupplierName")), None)  # the last match wins, as in the loop
                if not sq:
                    return le
                return {**le, "Availability_Last_Edited": sq.get("Availability_Supplier"), "Initial_Price_Last_Edited": sq.get("Initial_Price_Supplier"),
                        "Negotiated_Last_Edited": sq.get("Negotiated_Supplier"), "Final_Price_Last_Edited": sq.get("Final_Price_Supplier"), "Lead_Time_Last_Edited": sq.get("Lead_Time_Supplier")}
            patch["Supplier_Quotes_Last_Edited"] = [_le_patch(le) for le in last_edited]
        await store.update_record("Inquiry_Form", inq["ID"], patch, by_form=True)
        await refresh_inquiry_spec(store, inq["ID"])  # spec v1.4: the stamps, hints, alerts and the cleared price of a quote that cannot be supplied


# ===== Stage_Supplier_Changed, part 1 (Supplier_1/Supplier_2, on add or edit, on success) =====
# Each quote row gets its Stage (Final when Negotiated and Final Price are both set, Negotiating
# when one is, else Not Selected). The copy is locked (edit_counter 0) unless its Response_Status is
# "Selected" or "Submit Response"; a Selected copy with all four collateral fields Completed and
# Specification Details filled in becomes "Completed" (and locked). Returns the record as saved.
def _non_zero(v) -> bool:
    return not blank(v) and to_num(v) != 0


async def stage_supplier_rows(args: dict) -> dict:
    s, id_, record, store = args["s"], args.get("id"), args["record"], args["store"]
    rows = []
    for q in record.get("Supplier_quotes") or []:
        rows.append({**q, "Stage_Supplier": "Final" if (_non_zero(q.get("Negotiated_Supplier")) and _non_zero(q.get("Final_Price_Supplier")))
                     else ("Negotiating" if (_non_zero(q.get("Negotiated_Supplier")) or _non_zero(q.get("Final_Price_Supplier"))) else "Not Selected")})
    patch: dict = {}
    original_rows = record.get("Supplier_quotes") or []
    if any(rows[i].get("Stage_Supplier") != original_rows[i].get("Stage_Supplier") for i in range(len(rows))):
        patch["Supplier_quotes"] = rows
    status = record.get("Response_Status")
    counter = record.get("edit_counter")
    if status not in ("Selected", "Submit Response"):
        counter = 0
    if status == "Selected" and all(record.get(f) == "Completed" for f in ["Product_Sample_Supplier", "D_Image_Supplier", "Specification_Supplier", "Technical_Drawing_Supplier"]) and not blank(record.get("Specification_Details_Supplier")):
        status, counter = "Completed", 0
    if status != record.get("Response_Status"):
        patch["Response_Status"] = status
    if str(counter if counter is not None else "") != str(record.get("edit_counter") if record.get("edit_counter") is not None else ""):
        patch["edit_counter"] = counter
    if not patch:
        return record
    await store.update_record(s["form"], str(record.get("ID") or id_), patch, by_form=True)
    return {**record, **patch}


# ===== Mandatory_Supplier_Fields (Supplier_1/Supplier_2, on edit, on validate) =====
async def mandatory_supplier_fields(args: dict) -> None:
    input_, previous = args["input"], args.get("previous")
    rec = {**(previous or {}), **input_}
    if not blank(rec.get("edit_counter")) and to_num(rec.get("edit_counter")) == 0:
        raise ZohoError(2001, "Editing is locked. Wait for inquiry update.")
    missing = []
    stop = ("Cannot Produce", "Unavailable", "Confirmed")
    for sq in rec.get("Supplier_quotes") or []:
        a = "" if blank(sq.get("Availability_Supplier")) else str(sq.get("Availability_Supplier"))
        if a == "":
            missing.append("Availability")
        if a not in stop:
            if not _non_zero(sq.get("Initial_Price_Supplier")):
                missing.append("Initial Price")
            if not _non_zero(sq.get("Final_Price_Supplier")):
                missing.append("Final Price")
            if blank(sq.get("Lead_Time_Supplier")):
                missing.append("Lead Time")
    if missing:
        raise ZohoError(2001, f"Required fields missing: {', '.join(missing)}")  # repeats kept, like Zoho's message


# ===== Item_Image_Create_Update and INQ_AutoFill_Product_Image (on add or edit, on success) =====
async def product_image(args: dict) -> None:
    id_, record, store = args.get("id"), args["record"], args["store"]
    patch: dict = {}
    if not blank(record.get("sku")):
        matches = await store.get_records("Items", criteria=f"SKU == {lit(record.get('sku'))}", page_size=1)
        by_sku = matches[0] if matches else None
        if by_sku:
            patch["Product_Image"] = by_sku.get("Image")
    current = patch.get("Product_Image") if "Product_Image" in patch else record.get("Product_Image")

    def _empty(v) -> bool:
        s = str(v if v is not None else "")
        return s in ("", "{}", "[]")

    if _empty(current) and id_of(record.get("Items")):
        try:
            item = await store.get_record_by_id("Items", id_of(record.get("Items")), raw=True)
        except Exception:
            item = None
        if not blank((item or {}).get("Image")):
            patch["Product_Image"] = item["Image"]
    if "Product_Image" in patch and patch["Product_Image"] != record.get("Product_Image"):
        await store.update_record("Inquiry_Form", id_, patch, by_form=True)


# ===== INQ_Generate_Number (on add, on success) =====
async def generate_number(args: dict) -> None:
    id_, record, store = args.get("id"), args["record"], args["store"]
    number = inquiry_number(record.get("INQ_Seq"))
    if record.get("INQ_No") != number:
        await store.update_record("Inquiry_Form", id_, {"INQ_No": number}, by_form=True)


# ===== Delete_Item_On_Supplier (on delete, on success): the suppliers' copies go with the inquiry =====
async def delete_supplier_copies(args: dict) -> None:
    previous, store = args.get("previous") or {}, args["store"]
    for s in SUPPLIERS:
        for r in await store.find(s["form"], lambda x: x.get("INQ_No_Supplier") == previous.get("INQ_No")):
            await store.delete_record(s["form"], r["ID"])


register(FORM, {
    "beforeAdd": [populate_quotes, check_readiness],
    "beforeUpdate": [check_readiness],
    "afterAdd": [populate_suppliers, stage_rows, sync_suppliers, product_image, generate_number],
    "afterUpdate": [stage_rows, sync_suppliers, product_image],
    "afterDelete": [delete_supplier_copies],
})

for _s in SUPPLIERS:
    def _make_saved(s):
        async def saved(args: dict) -> None:
            staged = await stage_supplier_rows({**args, "s": s})
            await sync_back_to_inquiry({**args, "s": s, "record": staged})
        return saved

    register(_s["form"], {"beforeUpdate": [mandatory_supplier_fields], "afterAdd": [_make_saved(_s)], "afterUpdate": [_make_saved(_s)]})
