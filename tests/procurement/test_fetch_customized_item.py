import pytest
from app.books.client import BooksError


def _fake_inventory(routes: dict):
    """Same shape as test_books_apis.py's _fake_books, but for the Inventory service: routes maps
    'METHOD /path' to a response (or an Exception to raise)."""
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

    inventory_service = {"get": run("GET"), "post": run("POST")}
    return {"calls": calls, "books": {"inventory": inventory_service}}


ITEM = {"name": "Custom Chandelier", "sku": "CUST-1", "cf_oldsku": "", "cf_description": "A custom chandelier", "unit": "pcs", "rate": 5000, "category_name": "Customized"}


@pytest.fixture
async def store(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def _call(payload, ctx, store):
    from app.custom_apis import invoke_custom_api
    import app.procurement.books_apis  # noqa: F401 -- registers the handler
    return await invoke_custom_api("fetch_customized_item_from_inventory", payload, store, ctx)


async def test_without_books_client_says_so(store):
    out = await _call({"itemId": "42"}, {}, store)
    assert out == {"status": "error", "message": "Zoho Inventory is not available in this backend."}


async def test_missing_item_id_is_error(store):
    out = await _call({"itemId": "  "}, _fake_inventory({}), store)
    assert out == {"status": "error", "message": "Item ID is required."}


async def test_unknown_item_is_error(store):
    out = await _call({"itemId": "999"}, _fake_inventory({"GET /items/42": {"code": 0, "item": ITEM}}), store)
    assert out == {"status": "error", "message": "Item not found in Zoho Inventory for ID 999 — check the ID and try again."}


async def test_non_customized_category_is_refused(store):
    inv = _fake_inventory({"GET /items/42": {"code": 0, "item": {**ITEM, "category_name": "Table Lamps"}}})
    out = await _call({"itemId": "42"}, inv, store)
    assert out == {"status": "error", "message": "Item 42 is not in the Customized category."}
    assert len(await store.find("Items")) == 0


async def test_adds_new_item_once_and_caches_it(store):
    inv = _fake_inventory({"GET /items/42": {"code": 0, "item": ITEM}})
    out = await _call({"itemId": "42"}, {**inv, "user": "staff@example.test"}, store)
    assert out["status"] == "success"
    assert out["wasUpdate"] is False
    assert out["message"] == "Added new item: Custom Chandelier"
    row = await store.get_record_by_id("Items", out["recordId"], raw=True)
    assert [row["ID1"], row["item_name"], row["SKU"], row["Description"], row["Unit"], row["Rate"], row["category"], row["Added_User"]] == \
        ["42", "Custom Chandelier", "CUST-1", "A custom chandelier", "pcs", "5000", "Customized", "staff@example.test"]


async def test_second_lookup_of_the_same_id_never_calls_zoho_again(store):
    first_inv = _fake_inventory({"GET /items/42": {"code": 0, "item": ITEM}})
    first = await _call({"itemId": "42"}, first_inv, store)

    second_inv = _fake_inventory({})  # no routes at all -- a real call would raise "no route"
    second = await _call({"itemId": "42"}, second_inv, store)
    assert second["status"] == "success"
    assert second["wasUpdate"] is True
    assert second["recordId"] == first["recordId"]
    assert second["message"] == "Already cached: Custom Chandelier"
    assert len(second_inv["calls"]) == 0, "the cached path never calls Zoho"


async def test_cached_item_that_is_not_customized_is_refused_without_calling_zoho(store):
    await store.add_record("Items", {"ID1": "42", "item_name": "Lamp", "category": "Table Lamps"}, "")
    inv = _fake_inventory({})
    out = await _call({"itemId": "42"}, inv, store)
    assert out == {"status": "error", "message": "Item 42 is not in the Customized category."}
    assert len(inv["calls"]) == 0


# ---------- sync_customized_items_from_inventory ----------
CAT_RESP = {"categories": [{"category_id": "CAT-1", "name": "Customized"}, {"category_id": "CAT-2", "name": "Customized Alt"}]}


async def _call_sync(payload, ctx, store):
    from app.custom_apis import invoke_custom_api
    import app.procurement.books_apis  # noqa: F401
    return await invoke_custom_api("sync_customized_items_from_inventory", payload, store, ctx)


async def test_sync_without_books_client_says_so(store):
    out = await _call_sync({}, {}, store)
    assert out == {"status": "error", "message": "Zoho Inventory is not available in this backend."}


async def test_sync_no_customized_category_found_is_error(store):
    inv = _fake_inventory({"GET /categories": {"categories": []}})
    out = await _call_sync({}, inv, store)
    assert out == {"status": "error", "message": 'No "Customized" category found in Zoho Inventory.'}


async def test_sync_adds_and_updates_and_paginates(store):
    await store.add_record("Items", {"ID1": "1", "item_name": "Old Name", "category": "Customized"}, "")
    page1 = {"items": [{"item_id": "1", "name": "New Name", "sku": "C-1", "category_name": "Customized", "unit": "pcs", "rate": 100}], "page_context": {"has_more_page": True}}
    page2 = {"items": [{"item_id": "2", "name": "Second", "sku": "C-2", "category_name": "Customized", "unit": "pcs", "rate": 200}], "page_context": {"has_more_page": False}}
    calls = []

    def page_route(opts):
        calls.append(opts.get("query", {}).get("page"))
        return page1 if opts.get("query", {}).get("page") == 1 else page2

    inv = _fake_inventory({"GET /categories": CAT_RESP, "GET /items": page_route})
    out = await _call_sync({}, inv, store)
    assert out["status"] == "success"
    assert out["added"] == 1
    assert out["updated"] == 1
    assert calls == [1, 2]

    rows = await store.find("Items")
    assert len(rows) == 2
    updated_row = next(r for r in rows if r["ID1"] == "1")
    assert updated_row["item_name"] == "New Name"


async def test_sync_dry_run_counts_without_writing(store):
    inv = _fake_inventory({"GET /categories": CAT_RESP, "GET /items": {"items": [{"item_id": "1", "name": "X", "category_name": "Customized"}], "page_context": {"has_more_page": False}}})
    out = await _call_sync({"dryRun": True}, inv, store)
    assert out["status"] == "success"
    assert out["dryRun"] is True
    assert len(await store.find("Items")) == 0
