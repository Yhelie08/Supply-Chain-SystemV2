import re
import pytest


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("TONY_PORTAL_EMAIL", "tony@example.test")
    monkeypatch.setenv("FENTENG_PORTAL_EMAIL", "fenteng@example.test")


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def store(raw):
    from app.workflows import create_hooked_store
    import app.procurement.inquiry  # noqa: F401
    return create_hooked_store(raw)


@pytest.fixture
async def seed(raw):
    from app.procurement.suppliers import SUPPLIERS
    tony_s, fenteng_s = SUPPLIERS[0], SUPPLIERS[1]
    tony = await raw.add_record("Suppliers", {"Supplier_ID": tony_s["books_id"], "Supplier_Name": {"first_name": "Tony", "last_name": "Fan"}})
    fenteng = await raw.add_record("Suppliers", {"Supplier_ID": fenteng_s["books_id"], "Supplier_Name": {"first_name": "Fenteng"}})
    project = await raw.add_record("Projects", {"Project_Code": "PRJ-1", "Project_Name": "Mall"})
    item = await raw.add_record("Items", {"SKU": "LAMP-1", "item_name": "Lamp", "Image": "/api/v2.1/lamp.png"})
    return {"tony": tony, "fenteng": fenteng, "project": project, "item": item}


def base(seed, **extra):
    return {"sku": "LAMP-1", "quantity": 3, "unit": "pcs", "target_date": "2026-12-01", "description": "A lamp", "Items": seed["item"], "Projects": seed["project"], "Suppliers": [seed["tony"], seed["fenteng"]], **extra}


async def _inquiry(raw, id_):
    return await raw.get_record_by_id("Inquiry_Form", id_, raw=True)


async def _copies_of(raw, form, no):
    return await raw.find(form, lambda r: r.get("INQ_No_Supplier") == no)


# Node: 'a new inquiry gets its number, project group, quote rows and product image'
@pytest.mark.asyncio
async def test_new_inquiry_gets_number_project_group_quote_rows_and_image(raw, store, seed):
    id_ = await store.add_record("Inquiry_Form", base(seed), "staff@example.test")
    rec = await _inquiry(raw, id_)
    assert re.match(r"^INQ-\d{5}$", rec["INQ_No"])
    assert rec["INQ_No"] == f"INQ-{str(rec['INQ_Seq']).zfill(5)}"
    assert rec["quote_group"] == "PRJ-1"
    assert [(q["Suppliers"], q["Supplier_ID"], q["Stage"]) for q in rec["Supplier_Quotes"]] == [("Tony", f"[{seed['tony']}]", "Not Selected"), ("Fenteng", f"[{seed['fenteng']}]", "Not Selected")]
    assert [q["Suppliers_Last_Edited"] for q in rec["Supplier_Quotes_Last_Edited"]] == ["Tony", "Fenteng"]
    assert rec["Product_Image"] == "/api/v2.1/lamp.png"


# Node: 'each asked supplier gets a copy of the inquiry and a notification'
@pytest.mark.asyncio
async def test_each_asked_supplier_gets_a_copy_and_a_notification(raw, store, seed):
    from app.procurement.suppliers import SUPPLIERS
    id_ = await store.add_record("Inquiry_Form", base(seed), "staff@example.test")
    inq_no = (await _inquiry(raw, id_))["INQ_No"]
    for s, supplier_name, email, page in [(SUPPLIERS[0], "Tony", "tony@example.test", "Tony_Fan_Inquiries"), (SUPPLIERS[1], "Fenteng", "fenteng@example.test", "Fenteng_Lighting_Inquiries")]:
        copies = await _copies_of(raw, s["form"], inq_no)
        assert copies, f"{s['form']} has a copy"
        copy = copies[0]
        assert copy["Response_Status"] == "Waiting"
        assert copy["edit_counter"] == "1"
        assert copy["SKU_Supplier"] == "LAMP-1"
        assert copy["Quantity_Supplier"] == "3"
        assert copy["Added_User"] == "staff@example.test"
        assert copy[s["image_field"]] == "/api/v2.1/lamp.png"
        assert [q["SupplierName"] for q in copy["Supplier_quotes"]] == [supplier_name], "only that supplier's quote row"
        notes = await raw.find(s["notifications"])
        note = notes[0]
        assert note["Recipient_Email"] == email
        assert note["Message"] == f"A new inquiry {inq_no} was added."
        assert str(note["Source_Record_ID"]) == str(copy["ID"])
        assert re.search(rf"#Page:{page}\?{s['param']}=INQ-{copy['ID']}-\d{{14}}$", note["Target_URL"])
        assert note["Read"] is False


# Node: 'only the suppliers that were asked get a copy'
@pytest.mark.asyncio
async def test_only_asked_suppliers_get_a_copy(raw, store, seed):
    id_ = await store.add_record("Inquiry_Form", base(seed, Suppliers=[seed["tony"]]))
    inq_no = (await _inquiry(raw, id_))["INQ_No"]
    assert len(await _copies_of(raw, "Supplier_2", inq_no)) == 1
    assert len(await _copies_of(raw, "Supplier_1", inq_no)) == 0
    assert len(await raw.find("Fenteng_Notifications")) == 0


# Node: 'a custom item (no catalog Items, typed sku/description) carries its own photos to every supplier copy'
@pytest.mark.asyncio
async def test_custom_item_carries_own_photos_to_every_supplier_copy(raw, store, seed):
    import json
    from app.procurement.suppliers import SUPPLIERS
    photos = ["/api/v2.1/custom-lamp.jpg", "/api/v2.1/custom-spec.pdf"]
    id_ = await store.add_record("Inquiry_Form", base(seed, Items="", sku="CUSTOM-9", description="A one-off fixture, no catalog match", Attachments=photos), "staff@example.test")
    rec = await _inquiry(raw, id_)
    assert rec["Product_Image"] == "", "no catalog item means no product image"
    inq_no = rec["INQ_No"]
    for s in SUPPLIERS:
        copies = await _copies_of(raw, s["form"], inq_no)
        assert copies, f"{s['form']} has a copy"
        copy = copies[0]
        assert copy["SKU_Supplier"] == "CUSTOM-9"
        assert copy["Description_Supplier"] == "A one-off fixture, no catalog match"
        assert json.loads(copy["Image_from_Inq"]) == photos, "the buyer's own photos, not a catalog image"
        assert copy[s["image_field"]] == "", "no catalog item to pull a product image from"


# Node: "editing a custom item's attachments updates the supplier copy too"
@pytest.mark.asyncio
async def test_editing_custom_item_attachments_updates_supplier_copy(raw, store, seed):
    import json
    id_ = await store.add_record("Inquiry_Form", base(seed, Items="", Attachments=["/api/v2.1/first.jpg"]))
    inq_no = (await _inquiry(raw, id_))["INQ_No"]
    await store.update_record("Inquiry_Form", id_, {"Attachments": ["/api/v2.1/first.jpg", "/api/v2.1/second.jpg"]}, by_form=True)
    copy = (await _copies_of(raw, "Supplier_2", inq_no))[0]
    assert json.loads(copy["Image_from_Inq"]) == ["/api/v2.1/first.jpg", "/api/v2.1/second.jpg"]


# Node: 'prices: a quote with both negotiated and final price is Final, with one it is Negotiating'
@pytest.mark.asyncio
async def test_quote_stage_final_vs_negotiating(raw, store, seed):
    id_ = await store.add_record("Inquiry_Form", base(seed))
    rec = await _inquiry(raw, id_)
    t, f = rec["Supplier_Quotes"]
    await store.update_record("Inquiry_Form", id_, {"Supplier_Quotes": [{**t, "Negotiated": "100", "Final_Price": "90"}, {**f, "Negotiated": "120"}]}, by_form=True)
    after = await _inquiry(raw, id_)
    assert [q["Stage"] for q in after["Supplier_Quotes"]] == ["Final", "Negotiating"]


# Node: 'a change in the quotes moves the supplier copy to "Submit Response" and copies the prices'
@pytest.mark.asyncio
async def test_quote_change_moves_supplier_copy_to_submit_response(raw, store, seed):
    id_ = await store.add_record("Inquiry_Form", base(seed))
    rec = await _inquiry(raw, id_)
    inq_no, (t, f) = rec["INQ_No"], rec["Supplier_Quotes"]
    await store.update_record("Inquiry_Form", id_, {"Supplier_Quotes": [{**t, "Initial_Price": "95"}, f]}, by_form=True)
    tony_copy = (await _copies_of(raw, "Supplier_2", inq_no))[0]
    fenteng_copy = (await _copies_of(raw, "Supplier_1", inq_no))[0]
    assert tony_copy["Response_Status"] == "Submit Response"
    assert tony_copy["Supplier_quotes"][0]["Initial_Price_Supplier"] == "95"
    assert fenteng_copy["Response_Status"] == "Waiting", "the other supplier is untouched"


# Node: 'selecting a supplier: that copy is "Selected", the other "Not Selected"; the checklist follows'
@pytest.mark.asyncio
async def test_selecting_a_supplier_updates_checklist_and_copies(raw, store, seed):
    id_ = await store.add_record("Inquiry_Form", base(seed))
    rec = await _inquiry(raw, id_)
    inq_no, (t, f) = rec["INQ_No"], rec["Supplier_Quotes"]
    await store.update_record("Inquiry_Form", id_, {"Supplier_Quotes": [{**t, "Final_Price": "600", "Availability": "Confirmed", "Selected": True}, f]}, by_form=True)
    rec = await _inquiry(raw, id_)
    assert rec["Supplier_Selected"] is True
    assert rec["Availability"] is True
    assert rec["Final_Price_Exists"] is True
    assert rec["Select_Final_Cost"] == "600"
    assert (await _copies_of(raw, "Supplier_2", inq_no))[0]["Response_Status"] == "Selected"
    assert (await _copies_of(raw, "Supplier_1", inq_no))[0]["Response_Status"] == "Not Selected"


# Node: 'margin = (SRP - final cost) / SRP * 100, and 0 without an SRP'
@pytest.mark.asyncio
async def test_margin_formula_and_zero_without_srp(raw, store, seed):
    id_ = await store.add_record("Inquiry_Form", base(seed))
    rec = await _inquiry(raw, id_)
    t, f = rec["Supplier_Quotes"]
    await store.update_record("Inquiry_Form", id_, {"Supplier_Quotes": [{**t, "Final_Price": "600", "Selected": True}, f], "SRP_Approved1": 1000}, by_form=True)
    assert (await _inquiry(raw, id_))["Margin"] == "40"
    await store.update_record("Inquiry_Form", id_, {"SRP_Approved1": 0}, by_form=True)
    assert (await _inquiry(raw, id_))["Margin"] == "0"


# Node: 'mirrors Zoho: "ready for estimate" reads the collateral flag from before this save, so it lags one save'
@pytest.mark.asyncio
async def test_ready_for_estimate_lags_one_save_mirrors_zoho(raw, store, seed):
    id_ = await store.add_record("Inquiry_Form", base(seed))
    rec = await _inquiry(raw, id_)
    t, f = rec["Supplier_Quotes"]
    everything = {"Supplier_Quotes": [{**t, "Final_Price": "600", "Availability": "Confirmed", "Selected": True}, f], "SRP_Approved1": 1000, "SRP_Status": "Approved",
                  "Product_Sample": "Completed", "D_Image": "N/A", "Specification": "Completed", "Technical_Drawing": "Completed"}
    await store.update_record("Inquiry_Form", id_, everything, by_form=True)
    rec = await _inquiry(raw, id_)
    assert rec["Collateral_Comple_NA"] is True
    assert rec["SRP_Approved"] is True
    assert rec["Ready_for_Estimates"] is False, "first save: collateral was not complete yet"
    await store.update_record("Inquiry_Form", id_, {"description": "touched"}, by_form=True)
    rec = await _inquiry(raw, id_)
    assert rec["Ready_for_Estimates"] is True, "second save sees the collateral flag"


# Node: 'mirrors Zoho: the project roll-up reads the inquiries as saved before this one, so it also lags'
@pytest.mark.asyncio
async def test_project_rollup_lags_mirrors_zoho(raw, store, seed):
    a = await store.add_record("Inquiry_Form", base(seed))
    assert (await raw.get_record_by_id("Projects", seed["project"], raw=True))["All_SRP_Approved"] is True, "a new inquiry is not in the database yet, so nothing disagrees"
    await store.update_record("Inquiry_Form", a, {"SRP_Status": "Approved"}, by_form=True)
    assert (await raw.get_record_by_id("Projects", seed["project"], raw=True))["All_SRP_Approved"] is False, "still the old status of this inquiry"
    await store.update_record("Inquiry_Form", a, {"description": "touched"}, by_form=True)
    assert (await raw.get_record_by_id("Projects", seed["project"], raw=True))["All_SRP_Approved"] is True


# Node: "deleting an inquiry removes the suppliers' copies"
@pytest.mark.asyncio
async def test_deleting_an_inquiry_removes_supplier_copies(raw, store, seed):
    id_ = await store.add_record("Inquiry_Form", base(seed))
    inq_no = (await _inquiry(raw, id_))["INQ_No"]
    before = len(await _copies_of(raw, "Supplier_2", inq_no)) + len(await _copies_of(raw, "Supplier_1", inq_no))
    assert before == 2
    await store.delete_record("Inquiry_Form", id_)
    after = len(await _copies_of(raw, "Supplier_2", inq_no)) + len(await _copies_of(raw, "Supplier_1", inq_no))
    assert after == 0


# Node: 'a second inquiry gets the next number and its own supplier copies'
@pytest.mark.asyncio
async def test_second_inquiry_gets_next_number_and_own_copies(raw, store, seed):
    first = await store.add_record("Inquiry_Form", base(seed))
    second = await store.add_record("Inquiry_Form", base(seed))
    a, b = await _inquiry(raw, first), await _inquiry(raw, second)
    assert int(b["INQ_Seq"]) == int(a["INQ_Seq"]) + 1
    assert a["INQ_No"] != b["INQ_No"]
    assert len(await _copies_of(raw, "Supplier_2", b["INQ_No"])) == 1
