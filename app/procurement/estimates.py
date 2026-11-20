# create_estimate, ported from zoho-export/parsed/functions/createEstimateForInquiry.dg.
# One Books estimate per project: the first "Create estimate" creates it from every ready inquiry
# of the project, later ones update it. ctx = {books}.
#
# Differences from the Deluge function, on purpose:
#  - an inquiry with no quote_group is matched to its project only; the Zoho filter
#    `quote_group == rec.quote_group` would otherwise pull in every unrelated inquiry whose
#    quote_group is also empty;
#  - a stored estimate id is cleared only when Books says the estimate does not exist; if Books
#    cannot be reached the call stops, instead of clearing the id and creating a duplicate estimate.
# Ported from server/modules/procurement/estimates.mjs.
import math

from app.books.client import BooksError
from app.criteria import ZohoError, today
from app.custom_apis import CUSTOM_APIS
from app.deluge import blank, id_of, to_num, truthy

COLLATERAL = ["Product_Sample", "D_Image", "Specification", "Technical_Drawing"]


def _text(v) -> str:
    return "" if blank(v) else str(v)


def _collateral_complete(r: dict) -> bool:
    return all(r.get(k) in ("Completed", "N/A") for k in COLLATERAL)


def _srp_approved(r: dict) -> bool:
    return truthy(r.get("SRP_Approved")) or r.get("SRP_Status") == "Approved" or to_num(r.get("SRP_Approved1")) > 0


def _final_price_exists(r: dict) -> bool:
    return truthy(r.get("Final_Price_Exists")) or to_num(r.get("Select_Final_Cost")) > 0 or to_num(r.get("SRP_Approved1")) > 0


def _is_ready(r: dict) -> bool:
    return truthy(r.get("Ready_for_Estimates")) or (
        truthy(r.get("Supplier_Selected")) and truthy(r.get("Availability")) and _final_price_exists(r) and _collateral_complete(r) and _srp_approved(r)
    )


# The Books line description: the inquiry's own text first, then each filled-in specification, one per line.
def _line_description(inq: dict) -> str:
    parts = [
        inq.get("description"), ("Dimension", inq.get("Dimension")), ("Color Body", inq.get("Color_Body")), ("Color Temperature", inq.get("Color_Temperature")),
        ("Type of Bulb", inq.get("Type_of_Bulb")), ("Voltage", inq.get("Voltage")), ("Lumens", inq.get("Lumens")), inq.get("Addtional_Description"),
    ]
    out = []
    for part in parts:
        if isinstance(part, tuple):
            label, value = part
            out.append("" if blank(value) else f"{label}: {value}")
        else:
            out.append(_text(part))
    return "\n".join(p for p in out if p)


def _fail(message: str) -> dict:
    return {"status": "error", "message": message}


async def create_estimate(payload: dict, store, ctx: dict) -> dict:
    p = payload or {}
    inq_no = p.get("inqNo")
    if not ctx.get("books"):
        return _fail("Zoho Books is not available in this backend.")
    books = ctx["books"]["books"]

    def book_err(e, prefix: str):
        return _fail(e.message if e.code == "not_configured" else f"{prefix}{e.message}") if isinstance(e, BooksError) else None

    matches = await store.find("Inquiry_Form", lambda r: r.get("INQ_No") == inq_no)
    rec = matches[0] if matches else None
    if not rec:
        return _fail(f"Inquiry {inq_no} not found")

    # 1. readiness, recomputed from the fields so a stale flag does not block it
    if not _is_ready(rec):
        return _fail(f"Inquiry {inq_no} is not yet ready for estimate. Please verify readiness checklist.")
    if not truthy(rec.get("Ready_for_Estimates")):
        await store.update_record("Inquiry_Form", rec["ID"], {"Ready_for_Estimates": True}, by_form=True)

    # 2. project
    project_id = id_of(rec.get("Projects"))
    if not project_id:
        return _fail("No project assigned. Please assign a project first.")
    try:
        project = await store.get_record_by_id("Projects", project_id, raw=True)
    except Exception:
        project = None
    proj_name = _text((project or {}).get("Project_Name"))
    estimate_id = _text((project or {}).get("Books_Estimate_ID"))
    estimate_no = _text((project or {}).get("Books_Estimate_No"))
    project_customer_id = id_of((project or {}).get("Customer"))

    # 3. customer, falling back to the project's customer
    async def customer_of(id_):
        if not id_:
            return None
        try:
            return await store.get_record_by_id("Customer", id_, raw=True)
        except Exception:
            return None

    customer_id = id_of(rec.get("Customer"))
    customer = await customer_of(customer_id)
    books_customer_id = _text((customer or {}).get("ID1"))
    customer_name = _text((customer or {}).get("customer_name"))
    if not books_customer_id:
        fallback = await customer_of(project_customer_id)
        if fallback:
            books_customer_id = _text(fallback.get("ID1"))
            customer_name = _text(fallback.get("customer_name"))
            customer_id = project_customer_id
            await store.update_record("Inquiry_Form", rec["ID"], {"Customer": project_customer_id}, by_form=True)
    # Not linked yet: look the customer up in Books by name and remember the id
    if not books_customer_id and customer_name:
        try:
            found = (await books["get"]("/contacts", query={"contact_name": customer_name})).get("contacts") or []
            if found:
                books_customer_id = _text(found[0].get("contact_id"))
                link_to = customer_id or project_customer_id
                if link_to:
                    try:
                        await store.update_record("Customer", link_to, {"ID1": books_customer_id}, by_form=True)
                    except ZohoError:
                        pass
        except BooksError as e:
            if e.code == "not_configured":
                return _fail(e.message)
    if not books_customer_id:
        return _fail(f"Customer '{customer_name}' is not linked to Zoho Books (missing contact ID)." if customer_name else "No customer assigned on inquiry or project. Please select a customer.")

    # 4. does the project's estimate still exist in Books?
    current_items = []
    if estimate_id:
        try:
            existing = (await books["get"](f"/estimates/{estimate_id}")).get("estimate")
            if existing:
                current_items = existing.get("line_items") or []
                if _text(existing.get("estimate_number")):
                    estimate_no = _text(existing["estimate_number"])
        except BooksError as e:
            if e.code == "not_configured":
                return _fail(e.message)
            if e.status != 404 and e.code != 1002:
                return _fail(f"Could not check the existing estimate in Books: {e.message}")
            estimate_id = ""
            estimate_no = ""
            await store.update_record("Projects", project_id, {"Books_Estimate_ID": "", "Books_Estimate_No": ""}, by_form=True)

    # 5. line items from every ready inquiry of the project (and of its quote group)
    group = _text(rec.get("quote_group"))
    siblings = await store.find("Inquiry_Form", lambda r: id_of(r.get("Projects")) == project_id or (group != "" and _text(r.get("quote_group")) == group))
    line_items = []
    inq_nos = []
    items = {i["ID"]: i for i in await store.find("Items")}
    items_by_sku = {i["SKU"]: i for i in items.values() if not blank(i.get("SKU"))}
    for inq in siblings:
        if not _is_ready(inq):
            continue
        inq_nos.append(inq.get("INQ_No"))
        item = items.get(id_of(inq.get("Items"))) or items_by_sku.get(inq.get("sku"))
        books_item_id = _text((item or {}).get("ID1"))
        qty = math.trunc(to_num(inq.get("quantity"))) if to_num(inq.get("quantity")) > 0 else 1
        line = {**({"item_id": books_item_id} if books_item_id else {}), "name": _text((item or {}).get("item_name")) or _text(inq.get("sku")), "description": _line_description(inq), "quantity": qty, "rate": to_num(inq.get("SRP_Approved1"))}
        existing_line = books_item_id and next((li for li in current_items if _text(li.get("item_id")) == books_item_id), None)
        if existing_line and _text(existing_line.get("line_item_id")):
            line["line_item_id"] = _text(existing_line["line_item_id"])
        line_items.append(line)

    target_date = _text(rec.get("target_date"))
    custom_fields = [
        {"label": label, "value": value} for label, value in [
            ("Sales Agent", _text(rec.get("Sales_Owner"))), ("Project Name", proj_name), ("Design Company", _text(rec.get("Design_Company"))),
            ("Designer/ Architect", _text(rec.get("Designer_Architect"))), ("Design Partner", _text(rec.get("Design_Partner"))), ("Commission ", _text(rec.get("Commission"))),
            ("Customer Type", "End User" if _text(rec.get("Customer_Type")) == "Enduser" else _text(rec.get("Customer_Type"))), ("Order Type", _text(rec.get("Order_Type"))),
            ("Project Type:", _text(rec.get("Project_Type"))), ("For Bidding? (✓ if yes)", _text(rec.get("For_Bidding"))), ("Additional discount needed", _text(rec.get("Addtl_Disc_Needed1"))),
            ("Target Delivery Date", target_date), ("INQ No", ", ".join(inq_nos)),
        ]
    ]

    # 6. update the estimate, or create it
    updating = bool(estimate_id)
    try:
        if updating:
            saved = await books["put"](f"/estimates/{estimate_id}", {"line_items": line_items, "custom_fields": custom_fields, "expiry_date": target_date})
        else:
            saved = await books["post"]("/estimates", {"customer_id": books_customer_id, "line_items": line_items, "custom_fields": custom_fields, "date": today(), "expiry_date": target_date})
    except BooksError as e:
        out = book_err(e, "Books UPDATE failed: " if updating else "Books CREATE failed: ")
        if out:
            return out
        raise
    if not updating and not (saved or {}).get("estimate"):
        return _fail(f"Books CREATE failed: {(saved or {}).get('message') or ''}")
    if updating:
        if _text((saved or {}).get("estimate", {}).get("estimate_number")):
            estimate_no = _text(saved["estimate"]["estimate_number"])
    else:
        estimate_id = _text(saved["estimate"]["estimate_id"])
        estimate_no = _text(saved["estimate"]["estimate_number"])

    # Every sibling is stamped unconditionally here -- matches Node's own final loop, which does
    # not re-check is_ready() a second time (only the line-items loop above does). A sibling that
    # was not ready still gets Books_Estimate_ID/No/Estimate_Created so it is already linked to
    # this project's estimate once it does become ready.
    for inq in siblings:
        await store.update_record("Inquiry_Form", inq["ID"], {"Books_Estimate_ID": estimate_id, "Books_Estimate_No": estimate_no, "Estimate_Created": True, "Ready_for_Estimates": True}, by_form=True)
    await store.update_record("Projects", project_id, {"Books_Estimate_ID": estimate_id, "Books_Estimate_No": estimate_no}, by_form=True)
    return {
        "status": "success", "estimateId": estimate_id, "estimateNo": estimate_no,
        "message": f"Estimate {estimate_no} updated in Zoho Books" if updating else f"Estimate {estimate_no} created with {len(line_items)} items",
    }


CUSTOM_APIS["create_estimate"] = create_estimate
