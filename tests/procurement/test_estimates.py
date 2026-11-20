import pytest
from app.books.client import BooksError
from app.criteria import today


def _fake_books(routes: dict):
    calls: list[dict] = []

    def run(method: str):
        async def call_fn(path, *args, **kwargs):
            if method in ("POST", "PUT"):
                opts = {"body": args[0] if args else kwargs.get("body")}
            else:
                opts = dict(kwargs)
            calls.append({"method": method, "path": path, **opts})
            r = routes.get(f"{method} {path}")
            if r is None:
                raise BooksError(f"no route {method} {path}", status=404, code=1002)
            if isinstance(r, Exception):
                raise r
            return r
        return call_fn

    return {"calls": calls, "books": {"books": {"get": run("GET"), "post": run("POST"), "put": run("PUT")}}}


def _estimate(id_: str, no: str, **extra) -> dict:
    return {"code": 0, "estimate": {"estimate_id": id_, "estimate_number": no, **extra}}


@pytest.fixture
async def store(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
async def seed(store):
    customer = await store.add_record("Customer", {"customer_name": "ACME", "ID1": "C100"})
    project = await store.add_record("Projects", {"Project_Name": "Mall", "Customer": customer})
    item = await store.add_record("Items", {"ID1": "B1", "item_name": "Lamp", "SKU": "LAMP-1"})
    return {"customer": customer, "project": project, "item": item}


async def _inquiry(store, seed, **extra):
    payload = {
        "INQ_No": "INQ-00001", "Projects": seed["project"], "Customer": seed["customer"], "Items": seed["item"], "sku": "LAMP-1", "quantity": "3", "SRP_Approved1": 1000, "description": "A lamp", "Dimension": "10x10",
        "quote_group": "PRJ-1", "Sales_Owner": "HC Sales 7", "Customer_Type": "Enduser", "target_date": "2026-12-01", "Supplier_Selected": True, "Availability": True, "Final_Price_Exists": True,
        "SRP_Approved": True, "Product_Sample": "Completed", "D_Image": "N/A", "Specification": "Completed", "Technical_Drawing": "Completed", "Ready_for_Estimates": True, **extra,
    }
    return await store.add_record("Inquiry_Form", payload)


async def _call(inq_no, ctx, store):
    from app.custom_apis import invoke_custom_api
    import app.procurement.estimates  # noqa: F401
    return await invoke_custom_api("create_estimate", {"inqNo": inq_no}, store, ctx)


async def _read(store, form, id_):
    return await store.get_record_by_id(form, id_, raw=True)


# Node: 'first estimate for a project: created in Books from the ready inquiries, ids saved on inquiry and project'
@pytest.mark.asyncio
async def test_first_estimate_created_from_ready_inquiries_ids_saved(store, seed):
    id_ = await _inquiry(store, seed)
    zoho = _fake_books({"POST /estimates": _estimate("E1", "EST-0001")})
    out = await _call("INQ-00001", zoho, store)
    assert out == {"status": "success", "estimateId": "E1", "estimateNo": "EST-0001", "message": "Estimate EST-0001 created with 1 items"}

    body = zoho["calls"][0]["body"]
    assert body["customer_id"] == "C100"
    assert body["date"] == today()
    assert body["expiry_date"] == "2026-12-01"
    assert body["line_items"] == [{"item_id": "B1", "name": "Lamp", "description": "A lamp\nDimension: 10x10", "quantity": 3, "rate": 1000}]
    assert [f["label"] for f in body["custom_fields"]] == ["Sales Agent", "Project Name", "Design Company", "Designer/ Architect", "Design Partner", "Commission ",
                                                             "Customer Type", "Order Type", "Project Type:", "For Bidding? (✓ if yes)", "Additional discount needed", "Target Delivery Date", "INQ No"]

    def field(label):
        return next(f for f in body["custom_fields"] if f["label"] == label)["value"]

    assert [field("Sales Agent"), field("Project Name"), field("Customer Type"), field("INQ No")] == ["HC Sales 7", "Mall", "End User", "INQ-00001"]

    rec = await _read(store, "Inquiry_Form", id_)
    assert [rec["Books_Estimate_ID"], rec["Books_Estimate_No"], rec["Estimate_Created"]] == ["E1", "EST-0001", True]
    proj = await _read(store, "Projects", seed["project"])
    assert [proj["Books_Estimate_ID"], proj["Books_Estimate_No"]] == ["E1", "EST-0001"]


# Node: 'later estimate for the same project: the existing estimate is updated, keeping its line item ids'
@pytest.mark.asyncio
async def test_later_estimate_updates_existing_keeps_line_item_ids(store, seed):
    await _inquiry(store, seed)
    await store.update_record("Projects", seed["project"], {"Books_Estimate_ID": "E1", "Books_Estimate_No": "EST-0001"}, by_form=True)
    zoho = _fake_books({
        "GET /estimates/E1": _estimate("E1", "EST-0001", line_items=[{"item_id": "B1", "line_item_id": "L1"}, {"item_id": "OTHER", "line_item_id": "L2"}]),
        "PUT /estimates/E1": _estimate("E1", "EST-0001"),
    })
    out = await _call("INQ-00001", zoho, store)
    assert out == {"status": "success", "estimateId": "E1", "estimateNo": "EST-0001", "message": "Estimate EST-0001 updated in Zoho Books"}
    put = next(c for c in zoho["calls"] if c["method"] == "PUT")["body"]
    assert put["line_items"][0]["line_item_id"] == "L1"
    assert "customer_id" not in put
    assert not any(c["method"] == "POST" for c in zoho["calls"])


# Node: 'only ready inquiries of the project are in the estimate; an unrelated inquiry with an empty group is left out'
@pytest.mark.asyncio
async def test_only_ready_inquiries_included_empty_group_other_project_left_out(store, seed):
    await _inquiry(store, seed)
    await _inquiry(store, seed, INQ_No="INQ-00002", quantity="0", sku="OTHER", Items="")  # same project, ready: quantity falls back to 1
    await _inquiry(store, seed, INQ_No="INQ-00003", Ready_for_Estimates=False, Supplier_Selected=False)  # same project, not ready
    other_project = await store.add_record("Projects", {"Project_Name": "Other"})
    await _inquiry(store, seed, INQ_No="INQ-00004", Projects=other_project, quote_group="")  # other project
    zoho = _fake_books({"POST /estimates": _estimate("E1", "EST-0001")})
    out = await _call("INQ-00001", zoho, store)
    assert out["message"] == "Estimate EST-0001 created with 2 items"
    assert next(f for f in zoho["calls"][0]["body"]["custom_fields"] if f["label"] == "INQ No")["value"] == "INQ-00001, INQ-00002"
    assert zoho["calls"][0]["body"]["line_items"][1]["quantity"] == 1
    assert zoho["calls"][0]["body"]["line_items"][1]["name"] == "OTHER", "no matching item: the SKU is the name"
    assert "item_id" not in zoho["calls"][0]["body"]["line_items"][1]


# Node: 'refuses when the inquiry is missing, not ready, or has no project'
@pytest.mark.asyncio
async def test_refuses_when_inquiry_missing_not_ready_or_no_project(store, seed):
    none_ = _fake_books({})
    assert await _call("INQ-99999", none_, store) == {"status": "error", "message": "Inquiry INQ-99999 not found"}
    await _inquiry(store, seed, Ready_for_Estimates=False, Supplier_Selected=False)
    assert "not yet ready for estimate" in (await _call("INQ-00001", none_, store))["message"]


# Node: 'a stale "ready" flag is healed when the fields say it is ready'
@pytest.mark.asyncio
async def test_stale_ready_flag_healed_when_fields_say_ready(store, seed):
    id_ = await _inquiry(store, seed, Ready_for_Estimates=False)
    out = await _call("INQ-00001", _fake_books({"POST /estimates": _estimate("E1", "EST-0001")}), store)
    assert out["status"] == "success"
    assert (await _read(store, "Inquiry_Form", id_))["Ready_for_Estimates"] is True


# Node: 'customer: falls back to the project customer, then looks it up in Books by name'
@pytest.mark.asyncio
async def test_customer_falls_back_to_project_then_books_lookup_by_name(store, seed):
    id_ = await _inquiry(store, seed, Customer="")
    zoho = _fake_books({"POST /estimates": _estimate("E1", "EST-0001")})
    assert (await _call("INQ-00001", zoho, store))["status"] == "success"
    assert zoho["calls"][0]["body"]["customer_id"] == "C100"
    assert (await _read(store, "Inquiry_Form", id_))["Customer"] == seed["customer"], "the inquiry now has the project's customer"


# Node: 'customer not in Books: a clear error and nothing is created'
@pytest.mark.asyncio
async def test_customer_not_in_books_clear_error_nothing_created(store, seed):
    await _inquiry(store, seed)
    await store.update_record("Customer", seed["customer"], {"ID1": ""}, by_form=True)
    zoho = _fake_books({"GET /contacts": {"code": 0, "contacts": []}})
    assert (await _call("INQ-00001", zoho, store))["message"] == "Customer 'ACME' is not linked to Zoho Books (missing contact ID)."
    assert not any(c["method"] == "POST" for c in zoho["calls"])


# Node: 'an estimate Books no longer has is forgotten and a new one is created; a Books outage is not mistaken for that'
@pytest.mark.asyncio
async def test_gone_estimate_forgotten_new_created_outage_not_mistaken(store, seed):
    await _inquiry(store, seed)
    await store.update_record("Projects", seed["project"], {"Books_Estimate_ID": "GONE", "Books_Estimate_No": "EST-0009"}, by_form=True)
    gone = _fake_books({"GET /estimates/GONE": BooksError("The estimate does not exist.", status=404, code=1002), "POST /estimates": _estimate("E3", "EST-0010")})
    assert (await _call("INQ-00001", gone, store))["message"] == "Estimate EST-0010 created with 1 items"
    assert (await _read(store, "Projects", seed["project"]))["Books_Estimate_ID"] == "E3"

    await store.update_record("Projects", seed["project"], {"Books_Estimate_ID": "E3", "Books_Estimate_No": "EST-0010"}, by_form=True)
    down = _fake_books({"GET /estimates/E3": BooksError("Service unavailable", status=503)})
    out = await _call("INQ-00001", down, store)
    assert out["status"] == "error"
    assert "Could not check the existing estimate in Books: Service unavailable" in out["message"]
    assert not any(c["method"] == "POST" for c in down["calls"]), "no duplicate estimate"
    assert (await _read(store, "Projects", seed["project"]))["Books_Estimate_ID"] == "E3", "the stored id is kept"


# Node: 'Books rejecting the estimate is reported with its message and nothing is saved'
@pytest.mark.asyncio
async def test_books_rejecting_estimate_reported_nothing_saved(store, seed):
    id_ = await _inquiry(store, seed)
    out = await _call("INQ-00001", _fake_books({"POST /estimates": BooksError("Invalid value passed for expiry_date.", status=400, code=4)}), store)
    assert out == {"status": "error", "message": "Books CREATE failed: Invalid value passed for expiry_date."}
    assert (await _read(store, "Inquiry_Form", id_))["Estimate_Created"] is False
    assert (await _read(store, "Projects", seed["project"]))["Books_Estimate_ID"] == ""
