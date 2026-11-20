# Custom APIs that talk to Zoho Books, ported from zoho-export/parsed/functions/:
#   create_books_contact  <- createBooksContact.dg
#   add_item_by_id        <- addItemByIdBooks.dg
#   fetch_customer_from_books
# Each handler is (payload, store, ctx): ctx carries books (a create_zoho_api() result or None),
# user (str), save_upload (an async callable (name, buf) -> str, or None). They answer like the
# Deluge functions did: {status: 'success' | 'error', message, ...}.
# Ported from server/modules/procurement/books-apis.mjs.
#
# fetch_customized_item_from_inventory is NOT a Node port -- it's a new feature (owner, 2026-11-20):
# New Inquiry's item picker for Customized-category items, which live in Zoho Inventory, not Akeneo.
# See its own docstring below for why it's an exact-ID lookup, not live search.
from app.criteria import ZohoError
from app.books.client import BooksError
from app.custom_apis import CUSTOM_APIS


def _ok(message: str, extra: dict | None = None) -> dict:
    return {"status": "success", "message": message, **(extra or {})}


def _fail(message: str) -> dict:
    return {"status": "error", "message": message}


def _text(v) -> str:
    return "" if v is None else str(v)


# ---------- create_books_contact ----------
async def create_books_contact(payload: dict, store, ctx: dict) -> dict:
    p = payload or {}
    if not ctx.get("books"):
        return _fail("Zoho Books is not available in this backend.")
    if not p.get("customerId"):
        return _fail("No customerId provided — cannot backfill ID1.")

    # If the officer filled in First/Last Name use those; otherwise the whole Customer Name is the first name.
    if p.get("firstName"):
        person = {"first": p["firstName"], "last": p.get("lastName")}
    else:
        person = {"first": p.get("custName"), "last": ""}
    body = {
        "contact_name": p.get("custName"),
        "company_name": p.get("companyName"),
        "customer_sub_type": "individual" if p.get("custSubType") == "individual" else "business",
        "contact_type": "customer",
        "email": p.get("custEmail"), "phone": p.get("custPhone"), "mobile": p.get("custMobile"),
        "contact_persons": [{"salutation": p.get("salutation"), "first_name": person["first"], "last_name": person["last"], "email": p.get("custEmail"), "phone": p.get("custPhone"), "mobile": p.get("custMobile"), "is_primary_contact": True}],
        "billing_address": {"attention": p.get("billAttention"), "address": p.get("billAddress"), "city": p.get("billCity"), "state": p.get("billState"), "zip": p.get("billZip"), "country": p.get("billCountry"), "phone": p.get("billPhone"), "fax": p.get("billFax")},
        "shipping_address": {"attention": p.get("shipAttention"), "address": p.get("shipAddress"), "city": p.get("shipCity"), "state": p.get("shipState"), "zip": p.get("shipZip"), "country": p.get("shipCountry"), "phone": p.get("shipPhone"), "fax": p.get("shipFax")},
    }
    # Our Customer_Type values onto Books' own "Customer Type" dropdown.
    customer_type = {"Enduser": "End User", "Designer": "Design Partner"}.get(p.get("custType"), p.get("custType"))
    if customer_type:
        body["custom_fields"] = [{"label": "Customer Type", "value": customer_type}]

    try:
        created = await ctx["books"]["books"]["post"]("/contacts", body)
    except BooksError as e:
        return _fail(e.message if e.code == "not_configured" else f"Books contact creation failed — {e.message}")

    contact_id = _text((created or {}).get("contact", {}).get("contact_id"))
    if not contact_id:
        return _fail(f"Books contact creation failed — {(created or {}).get('message') or created}")

    # Link: the Books contact id goes into the customer's ID1.
    try:
        await store.update_record("Customer", p["customerId"], {"ID1": contact_id}, by_form=True)
    except ZohoError as e:
        if e.code != 9280:
            raise
    return _ok(f"Books contact created and linked (ID1={contact_id})", {"contactId": contact_id})


# ---------- add_item_by_id ----------
# The three real storage warehouses whose bin locations are listed.
BIN_WAREHOUSES = [
    {"id": "2680178000042173149", "label": "HC WH3 BAESA"},
    {"id": "2680178000055220196", "label": "HC WH1 BANAWE"},
    {"id": "2680178000047672049", "label": "INVENTORY"},
]


async def add_item_by_id(payload: dict, store, ctx: dict) -> dict:
    p = payload or {}
    if not ctx.get("books"):
        return _fail("Zoho Books is not available in this backend.")
    item_id = _text(p.get("itemBooksId")).strip()
    if not item_id:
        return _fail("Item ID is required.")

    detail = None
    try:
        detail = (await ctx["books"]["books"]["get"](f"/items/{item_id}")).get("item")
    except BooksError as e:
        if e.code == "not_configured":
            return _fail(e.message)
        detail = None
    if not detail:
        return _fail(f"Item not found in Books for ID {item_id} — check the ID and try again.")

    item = {
        "item_name": detail.get("name") or "", "SKU": detail.get("sku") or "", "Item_ref": detail.get("cf_oldsku") or "", "Description": detail.get("cf_description") or "",
        "Unit": detail.get("unit") or "", "Rate": detail.get("rate") if detail.get("rate") is not None else 0, "category": detail.get("category_name") or "",
    }

    # Warehouses holding physical stock (actual available stock, not accounting stock on hand).
    warehouses = detail.get("warehouses") or []
    item["Warehouse"] = ", ".join(_text(w.get("warehouse_name")) for w in warehouses if w.get("warehouse_actual_available_stock") is not None and w.get("warehouse_actual_available_stock") != 0)

    # Bin locations with stock, per storage warehouse; "Map Bins" when the item has no bin yet.
    segments = []
    for bw in BIN_WAREHOUSES:
        wh = next((w for w in warehouses if _text(w.get("warehouse_id")) == bw["id"]), None)
        if not wh or wh.get("is_storage_location_enabled") is not True:
            continue
        try:
            locations = (await ctx["books"]["books"]["get"](f"/settings/warehouses/{bw['id']}/storagelocations", query={"item_id": item_id})).get("storage_locations") or []
        except BooksError:
            locations = []  # treated as no bins
        bins = ", ".join(_text(l.get("name")) for l in locations if l.get("balance_quantity") is not None and l.get("balance_quantity") > 0)
        segments.append(f"{bw['label']}: {bins or 'Map Bins'}")
    item["Bin_location"] = " | ".join(segments)

    # Upsert into Items, matched by ID1 (the Books item id).
    matches = await store.find("Items", lambda r: r.get("ID1") == item_id)
    existing = matches[-1] if matches else None
    was_update = bool(existing)
    if existing:
        record_id = existing["ID"]
        await store.update_record("Items", existing["ID"], item, by_form=True)
    else:
        record_id = await store.add_record("Items", {"ID1": item_id, **item}, ctx.get("user") or "")

    # Image: best effort, only when Books has one and the record has none; a failure never undoes the item.
    should_fetch_image = bool(_text(detail.get("image_name"))) and _text((existing or {}).get("Image")) == ""
    image_synced = False
    if should_fetch_image and ctx.get("save_upload"):
        try:
            file = await ctx["books"]["books"]["download"](f"/items/{item_id}/image")
            content_type = file.get("content_type") or ""
            ext = "png" if "png" in content_type else "gif" if "gif" in content_type else "webp" if "webp" in content_type else "jpg"
            url = await ctx["save_upload"](f"{item_id}.{ext}", file["buffer"])
            await store.update_record("Items", record_id, {"Image": url}, by_form=True)
            image_synced = True
        except Exception:
            image_synced = False
    failed_image = should_fetch_image and not image_synced
    return _ok(
        f"{'Updated existing item' if was_update else 'Added new item'}: {item['item_name']}{' (image sync failed — item saved without photo)' if failed_image else ''}",
        {"imageSynced": image_synced, "wasUpdate": was_update, "recordId": str(record_id), "ID1": item_id, "item_name": item["item_name"], "SKU": item["SKU"], "Rate": item["Rate"],
         "Unit": item["Unit"], "Description": item["Description"], "category": item["category"], "Warehouse": item["Warehouse"], "Bin_location": item["Bin_location"]},
    )


# ---------- fetch_customer_from_books ----------
# Called when a customer is picked in the New Inquiry / Detail Edit form (not bulk -- avoids
# burning Books API quota on every row of a 10k+ customer list). Looks up the live Books contact
# by the local Customer record's ID1 (the Books contact_id, same linking convention
# create_books_contact writes), refreshes address/email/phone/Design fields from Books, and picks
# up Customer Type from the custom field labeled "Customer Type" if Books has it set (same field
# create_books_contact writes to).
def _build_addr(a: dict | None) -> dict:
    a = a or {}
    return {"address_line_1": _text(a.get("address")), "address_line_2": _text(a.get("street2")), "district_city": _text(a.get("city")), "state_province": _text(a.get("state")), "postal_Code": _text(a.get("zip")), "country": _text(a.get("country"))}


async def fetch_customer_from_books(payload: dict, store, ctx: dict) -> dict:
    p = payload or {}
    if not ctx.get("books"):
        return _fail("Zoho Books is not available in this backend.")
    if not p.get("customerId"):
        return _fail("No customerId provided.")
    try:
        local = await store.get_record_by_id("Customer", p["customerId"])
    except Exception:
        local = None
    contact_id = _text((local or {}).get("ID1")).strip()
    if not contact_id:
        return _ok("No linked Books contact for this customer (ID1 is blank).", {"linked": False, "customerId": _text(p.get("customerId"))})

    try:
        contact = (await ctx["books"]["books"]["get"](f"/contacts/{contact_id}")).get("contact")
    except BooksError as e:
        if e.code == "not_configured":
            return _fail(e.message)
        return _ok(f"Books contact {contact_id} not found — {e.message}", {"linked": False, "customerId": _text(p.get("customerId"))})
    if not contact:
        return _ok(f"Books contact {contact_id} not found.", {"linked": False, "customerId": _text(p.get("customerId"))})

    type_field = next((f for f in (contact.get("custom_fields") or []) if _text(f.get("label")).strip().lower() == "customer type"), None)
    books_type = ({"End User": "Enduser", "Design Partner": "Designer"}.get(_text(type_field.get("value")), _text(type_field.get("value"))) if type_field else "")

    update = {
        "Email": _text(contact.get("email")), "Phone_Number": _text(contact.get("phone")), "Mobile": _text(contact.get("mobile")),
        "Billing_Address": _build_addr(contact.get("billing_address")), "Shipping_Address": _build_addr(contact.get("shipping_address")),
    }
    if books_type:
        update["Customer_Type"] = books_type
    try:
        await store.update_record("Customer", p["customerId"], update, by_form=True)
    except Exception:
        pass  # best effort -- the pick still returns fresh values below

    return _ok(f"Refreshed from Books contact {contact_id}.", {
        "linked": True, "customerId": _text(p.get("customerId")), "Email": update["Email"], "Phone_Number": update["Phone_Number"], "Mobile": update["Mobile"],
        "Customer_Type": books_type, "Billing_Address": update["Billing_Address"], "Shipping_Address": update["Shipping_Address"],
    })


# ---------- fetch_customized_item_from_inventory ----------
# New Inquiry's item picker, Customized category only (owner, 2026-11-20): these items are not in
# Akeneo, and Zoho's API quota is tight, so this is an exact-SKU/ID lookup (no live search-as-you-
# type against Zoho), fetched once and cached into Items like add_item_by_id -- a second lookup of
# the same ID never calls Zoho again. Uses the Inventory items endpoint (not Books'), since these
# items live in Zoho Inventory, not Books.
async def fetch_customized_item_from_inventory(payload: dict, store, ctx: dict) -> dict:
    p = payload or {}
    if not ctx.get("books"):
        return _fail("Zoho Inventory is not available in this backend.")
    item_id = _text(p.get("itemId")).strip()
    if not item_id:
        return _fail("Item ID is required.")

    # Cached already? Never re-hits Zoho for an item this app has already fetched.
    cached = await store.find("Items", lambda r: r.get("ID1") == item_id)
    if cached:
        c = cached[-1]
        if _text(c.get("category")).strip().lower() != "customized":
            return _fail(f"Item {item_id} is not in the Customized category.")
        return _ok(f"Already cached: {c.get('item_name')}", {
            "wasUpdate": True, "recordId": str(c["ID"]), "ID1": item_id, "item_name": c.get("item_name"), "SKU": c.get("SKU"),
            "Rate": c.get("Rate"), "Unit": c.get("Unit"), "Description": c.get("Description"), "category": c.get("category"),
        })

    detail = None
    try:
        detail = (await ctx["books"]["inventory"]["get"](f"/items/{item_id}")).get("item")
    except BooksError as e:
        if e.code == "not_configured":
            return _fail(e.message)
        detail = None
    if not detail:
        return _fail(f"Item not found in Zoho Inventory for ID {item_id} — check the ID and try again.")
    if _text(detail.get("category_name")).strip().lower() != "customized":
        return _fail(f"Item {item_id} is not in the Customized category.")

    item = {
        "item_name": detail.get("name") or "", "SKU": detail.get("sku") or "", "Item_ref": detail.get("cf_oldsku") or "", "Description": detail.get("cf_description") or "",
        "Unit": detail.get("unit") or "", "Rate": detail.get("rate") if detail.get("rate") is not None else 0, "category": detail.get("category_name") or "",
    }
    record_id = await store.add_record("Items", {"ID1": item_id, **item}, ctx.get("user") or "")
    return _ok(f"Added new item: {item['item_name']}", {
        "wasUpdate": False, "recordId": str(record_id), "ID1": item_id, "item_name": item["item_name"], "SKU": item["SKU"],
        "Rate": item["Rate"], "Unit": item["Unit"], "Description": item["Description"], "category": item["category"],
    })


# ---------- sync_customized_items_from_inventory ----------
# Manual refresh button (Procurement Settings), owner, 2026-11-20: pre-loads the whole Customized
# category from Zoho Inventory into Items so New Inquiry's item picker can search it locally (same
# instant, zero-Zoho-call search Akeneo already gets) instead of live-querying Zoho per keystroke.
# Not scheduled -- an admin clicks it when the Customized catalog has changed. Resolves the category
# name to its id once (categories?name_contains=), then pages through
# items?category_id=...&page=N (200/page) until Zoho reports no more pages.
PAGE_SIZE = 200


async def sync_customized_items_from_inventory(payload: dict, store, ctx: dict) -> dict:
    p = payload or {}
    dry_run = bool(p.get("dryRun"))
    if not ctx.get("books"):
        return _fail("Zoho Inventory is not available in this backend.")
    inventory = ctx["books"]["inventory"]

    try:
        cat_resp = await inventory["get"]("/categories", query={"name_contains": "Customized"})
    except BooksError as e:
        return _fail(f"Could not look up the Customized category — {e.message}")
    categories = cat_resp.get("categories") or []
    category = next((c for c in categories if _text(c.get("name")).strip().lower() == "customized"), None)
    if not category:
        return _fail('No "Customized" category found in Zoho Inventory.')
    category_id = _text(category.get("category_id"))

    added, updated, page = 0, 0, 1
    while True:
        try:
            resp = await inventory["get"]("/items", query={"category_id": category_id, "page": page, "per_page": PAGE_SIZE})
        except BooksError as e:
            return _fail(f"Zoho Inventory sync failed on page {page} — {e.message}")
        items = resp.get("items") or []
        for detail in items:
            item_id = _text(detail.get("item_id"))
            if not item_id:
                continue
            item = {
                "item_name": detail.get("name") or "", "SKU": detail.get("sku") or "", "Item_ref": detail.get("cf_oldsku") or "", "Description": detail.get("cf_description") or "",
                "Unit": detail.get("unit") or "", "Rate": detail.get("rate") if detail.get("rate") is not None else 0, "category": detail.get("category_name") or "",
            }
            if dry_run:
                added += 1
                continue
            matches = await store.find("Items", lambda r: r.get("ID1") == item_id)
            if matches:
                await store.update_record("Items", matches[-1]["ID"], item, by_form=True)
                updated += 1
            else:
                await store.add_record("Items", {"ID1": item_id, **item}, ctx.get("user") or "")
                added += 1
        has_more = (resp.get("page_context") or {}).get("has_more_page")
        if not has_more or not items:
            break
        page += 1

    verb = "Found" if dry_run else "Synced"
    return _ok(f"{verb} {added + updated} Customized item(s): {added} added, {updated} updated.", {"added": added, "updated": updated, "dryRun": dry_run})


CUSTOM_APIS["create_books_contact"] = create_books_contact
CUSTOM_APIS["add_item_by_id"] = add_item_by_id
CUSTOM_APIS["fetch_customer_from_books"] = fetch_customer_from_books
CUSTOM_APIS["fetch_customized_item_from_inventory"] = fetch_customized_item_from_inventory
CUSTOM_APIS["sync_customized_items_from_inventory"] = sync_customized_items_from_inventory
