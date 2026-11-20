import pytest
from app.books.client import BooksError


def _fake_books(routes: dict):
    """A stand-in for the Books client: routes maps 'METHOD /path' to a response (or an Exception
    to raise, or a callable taking the call's opts and returning a response)."""
    calls: list[dict] = []

    def run(method: str):
        async def call_fn(path, *args, **kwargs):
            opts = dict(kwargs)
            if args:
                opts["body"] = args[0]
            calls.append({"method": method, "path": path, **opts})
            key = f"{method} {path}"
            if key not in routes:
                raise BooksError(f"no route {key}", status=404, code=1002)
            r = routes[key]
            if isinstance(r, Exception):
                raise r
            return r(opts) if callable(r) else r
        return call_fn

    books_service = {"get": run("GET"), "post": run("POST"), "download": run("DOWNLOAD")}
    return {"calls": calls, "books": {"books": books_service}}


CONTACT = {"customerId": "", "custName": "ACME Corp", "custType": "Enduser", "custEmail": "a@acme.test", "custPhone": "1", "custMobile": "2", "companyName": "ACME", "custSubType": "business",
           "salutation": "Mr.", "firstName": "", "lastName": "", "billAddress": "1 Main St", "billCity": "Manila", "billCountry": "PH", "shipAddress": "2 Side St"}


@pytest.fixture
async def store(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def _call(name, payload, ctx, store):
    from app.custom_apis import invoke_custom_api
    import app.procurement.books_apis  # noqa: F401 -- registers the handlers
    return await invoke_custom_api(name, payload, store, ctx)


# Node: 'create_books_contact: sends the contact to Books and links its id into Customer.ID1'
@pytest.mark.asyncio
async def test_create_books_contact_sends_contact_and_links_id1(store):
    customer_id = await store.add_record("Customer", {"customer_name": "ACME Corp"})
    zoho = _fake_books({"POST /contacts": {"code": 0, "contact": {"contact_id": "777"}}})
    out = await _call("create_books_contact", {**CONTACT, "customerId": customer_id}, zoho, store)
    assert out["status"] == "success"
    assert out["contactId"] == "777"
    assert out["message"] == "Books contact created and linked (ID1=777)"
    assert (await store.get_record_by_id("Customer", customer_id, raw=True))["ID1"] == "777"

    sent = zoho["calls"][0]["body"]
    assert sent["contact_name"] == "ACME Corp"
    assert sent["customer_sub_type"] == "business"
    assert sent["contact_type"] == "customer"
    assert sent["custom_fields"] == [{"label": "Customer Type", "value": "End User"}], 'Enduser becomes Books\' "End User"'
    assert sent["contact_persons"][0] == {"salutation": "Mr.", "first_name": "ACME Corp", "last_name": "", "email": "a@acme.test", "phone": "1", "mobile": "2", "is_primary_contact": True}
    assert sent["billing_address"]["address"] == "1 Main St"


# Node: 'create_books_contact: first/last name win when given; Designer maps to Design Partner; individual sub type'
@pytest.mark.asyncio
async def test_create_books_contact_first_last_name_designer_individual(store):
    customer_id = await store.add_record("Customer", {"customer_name": "Jo"})
    zoho = _fake_books({"POST /contacts": {"code": 0, "contact": {"contact_id": "1"}}})
    await _call("create_books_contact", {**CONTACT, "customerId": customer_id, "custType": "Designer", "custSubType": "individual", "firstName": "Jo", "lastName": "Cruz"}, zoho, store)
    sent = zoho["calls"][0]["body"]
    assert sent["customer_sub_type"] == "individual"
    assert sent["custom_fields"][0]["value"] == "Design Partner"
    assert [sent["contact_persons"][0]["first_name"], sent["contact_persons"][0]["last_name"]] == ["Jo", "Cruz"]


# Node: 'create_books_contact: no customer type means no custom field; a missing customerId or Books failure is an error answer'
@pytest.mark.asyncio
async def test_create_books_contact_no_type_no_field_missing_id_or_failure_is_error(store):
    customer_id = await store.add_record("Customer", {"customer_name": "X"})
    zoho = _fake_books({"POST /contacts": {"code": 0, "contact": {"contact_id": "1"}}})
    await _call("create_books_contact", {**CONTACT, "customerId": customer_id, "custType": ""}, zoho, store)
    assert "custom_fields" not in zoho["calls"][0]["body"]

    assert await _call("create_books_contact", {**CONTACT, "customerId": ""}, zoho, store) == {"status": "error", "message": "No customerId provided — cannot backfill ID1."}
    failing = _fake_books({"POST /contacts": BooksError("Contact name already exists.", status=400, code=3062)})
    out = await _call("create_books_contact", {**CONTACT, "customerId": customer_id}, failing, store)
    assert out == {"status": "error", "message": "Books contact creation failed — Contact name already exists."}
    assert (await store.get_record_by_id("Customer", customer_id, raw=True))["ID1"] == "1", "a failed call leaves ID1 as it was"


# Node: 'without a Books client the Books APIs say so instead of failing'
@pytest.mark.asyncio
async def test_without_books_client_apis_say_so(store):
    for name in ["create_books_contact", "add_item_by_id"]:
        out = await _call(name, {"customerId": "1", "itemBooksId": "1"}, {}, store)
        assert out["status"] == "error"
        assert "Books is not available" in out["message"]


ITEM = {
    "name": "Lamp", "sku": "LAMP-1", "cf_oldsku": "OLD-1", "cf_description": "A lamp", "unit": "pcs", "rate": 250, "category_name": "Table Lamps", "image_name": "lamp.png",
    "warehouses": [
        {"warehouse_id": "2680178000042173149", "warehouse_name": "HC WH3 BAESA", "warehouse_actual_available_stock": 5, "is_storage_location_enabled": True},
        {"warehouse_id": "2680178000055220196", "warehouse_name": "HC WH1 BANAWE", "warehouse_actual_available_stock": 0, "is_storage_location_enabled": True},
        {"warehouse_id": "2680178000047672049", "warehouse_name": "INVENTORY", "warehouse_actual_available_stock": 2, "is_storage_location_enabled": False},
    ],
}


def _item_routes(**extra):
    routes = {
        "GET /items/42": {"code": 0, "item": ITEM},
        "GET /settings/warehouses/2680178000042173149/storagelocations": {"storage_locations": [{"name": "A1", "balance_quantity": 3}, {"name": "A2", "balance_quantity": 0}, {"name": "B7", "balance_quantity": 2}]},
        "GET /settings/warehouses/2680178000055220196/storagelocations": {"storage_locations": [{"name": "Z9", "balance_quantity": 0}]},
        "DOWNLOAD /items/42/image": {"buffer": b"png-bytes", "content_type": "image/png"},
    }
    routes.update(extra)
    return routes


# Node: 'add_item_by_id: adds a new Items record with warehouses, bin locations and the image'
@pytest.mark.asyncio
async def test_add_item_by_id_adds_new_record_with_warehouses_bins_image(store):
    saved = []

    async def save_upload(name, buf):
        saved.append([name, buf.decode()])
        return f"/uploads/{name}"

    zoho = _fake_books(_item_routes())
    out = await _call("add_item_by_id", {"itemBooksId": " 42 "}, {**zoho, "user": "staff@example.test", "save_upload": save_upload}, store)
    assert out["status"] == "success"
    assert out["wasUpdate"] is False
    assert out["message"] == "Added new item: Lamp"
    assert out["imageSynced"] is True
    assert out["Warehouse"] == "HC WH3 BAESA, INVENTORY", "warehouses with physical stock"
    assert out["Bin_location"] == "HC WH3 BAESA: A1, B7 | HC WH1 BANAWE: Map Bins", 'bins with stock; "Map Bins" when none; INVENTORY has no storage locations'
    row = await store.get_record_by_id("Items", out["recordId"], raw=True)
    assert [row["ID1"], row["item_name"], row["SKU"], row["Item_ref"], row["Description"], row["Unit"], row["Rate"], row["category"], row["Image"], row["Added_User"]] == \
        ["42", "Lamp", "LAMP-1", "OLD-1", "A lamp", "pcs", "250", "Table Lamps", "/uploads/42.png", "staff@example.test"]
    assert saved == [["42.png", "png-bytes"]]


# Node: 'add_item_by_id: a second call updates the same record and does not fetch the image again'
@pytest.mark.asyncio
async def test_add_item_by_id_second_call_updates_no_refetch_image(store):
    async def save_upload(name, buf=None):
        return f"/uploads/{name}"

    first = await _call("add_item_by_id", {"itemBooksId": "42"}, {**_fake_books(_item_routes()), "save_upload": save_upload}, store)
    zoho = _fake_books(_item_routes(**{"GET /items/42": {"code": 0, "item": {**ITEM, "name": "Lamp v2", "rate": 300}}}))
    again = await _call("add_item_by_id", {"itemBooksId": "42"}, {**zoho, "save_upload": save_upload}, store)
    assert again["wasUpdate"] is True
    assert again["recordId"] == first["recordId"]
    assert again["message"] == "Updated existing item: Lamp v2"
    assert again["imageSynced"] is False
    assert not any(c["method"] == "DOWNLOAD" for c in zoho["calls"]), "the item already has a photo"
    assert len(await store.find("Items")) == 1
    row = await store.get_record_by_id("Items", first["recordId"], raw=True)
    assert [row["item_name"], row["Rate"], row["Image"]] == ["Lamp v2", "300", "/uploads/42.png"]


# Node: 'add_item_by_id: an image failure keeps the item and says so; an unknown item is an error'
@pytest.mark.asyncio
async def test_add_item_by_id_image_failure_keeps_item_unknown_item_is_error(store):
    zoho = _fake_books(_item_routes(**{"DOWNLOAD /items/42/image": BooksError("boom")}))
    out = await _call("add_item_by_id", {"itemBooksId": "42"}, {**zoho, "save_upload": (lambda n, b=None: f"{n}")}, store)
    assert out["status"] == "success"
    assert out["message"] == "Added new item: Lamp (image sync failed — item saved without photo)"
    assert len(await store.find("Items")) == 1

    assert await _call("add_item_by_id", {"itemBooksId": "999"}, _fake_books(_item_routes()), store) == {"status": "error", "message": "Item not found in Books for ID 999 — check the ID and try again."}
    assert await _call("add_item_by_id", {"itemBooksId": "  "}, _fake_books({}), store) == {"status": "error", "message": "Item ID is required."}
