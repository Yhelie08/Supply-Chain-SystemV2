import pytest


async def _exception(store, extra=None):
    await store.add_record("Purchase_Order", {"PO_No": "PO-00001"})
    await store.add_record("Tony_Fan_Purchase_Order", {"PO_No_Supplier2": "PO-00001"})
    return await store.add_record("Exceptions", {
        "Exception_No": "EXC-00001", "Source_Module": "Receiving", "Exception_Status": "Open", "Sales_Order": "SO-A",
        "PO_No": "PO-00001", "Receiving_Line_ID": "PR-1",
        "Product_Context1": [
            {"SKU": "L-1", "Item": "Lamp", "Supplier": "Tony", "Type_field": "Damage", "Qty": 1, "Repairable": "No",
             "Quantity_of_damage_spare_s": "Shade: 2, Others: 1", "Spare_Part_Type_Other": "Cable"},
            {"SKU": "L-1", "Item": "Lamp", "Supplier": "Tony", "Type_field": "Damage", "Qty": 1, "Repairable": "No"},
            {"SKU": "S-1", "Item": "Shade", "Supplier": "Tony", "Type_field": "Missing", "Qty": 2},
            {"SKU": "B-1", "Item": "Base", "Supplier": "Tony", "Type_field": "Damage", "Qty": 1, "Repairable": "Yes", "Repair_Outcome": "Pending"},
        ],
        **(extra or {}),
    })


# Node: 'Create RR (main): one RR per SKU + type, repairable damage that is not "Not Fixed" is left out, the PO is stamped, nothing is made twice'
@pytest.mark.asyncio
async def test_create_rr_main_makes_one_rr_per_sku_and_type_and_stamps_the_po(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.procurement.replacement_requests import create_rr_main

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    exc_id = await _exception(store)
    res = await create_rr_main({"exceptionId": str(exc_id)}, store)
    assert res["created"] == 2
    rrs = await store.find("Replacement_Request")
    assert [(r["RR_No"], r["Source_Type"], r["RR_SKU"], float(r["RR_Qty_Value"]), r["RR_Status"]) for r in rrs] == [
        ("RR-00001", "Receiving Damage", "L-1", 2, "Open"), ("RR-00002", "Receiving Missing", "S-1", 2, "Open")]
    assert rrs[0]["RR_Item_to_Replace"] == "Shade, Cable"
    assert rrs[0]["RR_Spare_Parts"] == "Shade: 2, Cable: 1"
    po = (await store.find("Purchase_Order"))[0]
    assert po["Damage_SKUs"] == "L-1"
    assert po["Missing_SKUs"] == "S-1"
    assert (await store.find("Exceptions"))[0]["Exception_Status"] == "Under Review"
    again = await create_rr_main({"exceptionId": str(exc_id)}, store)
    assert again["created"] == 0
    assert "No new RR needed" in again["message"]
    assert len(await store.find("Replacement_Request")) == 2


# Node: 'Create RR (Tony): the copy takes the number of its main RR, once, and stamps the supplier PO; a different supplier gets none'
@pytest.mark.asyncio
async def test_create_rr_supplier_copies_use_the_main_rr_number_once_each(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.procurement.replacement_requests import create_rr_main, create_rr_supplier

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    exc_id = await _exception(store)
    await create_rr_main({"exceptionId": str(exc_id)}, store)
    res = await create_rr_supplier("Tony", {"exceptionId": str(exc_id)}, store)
    assert res["created"] == 2
    copies = await store.find("Tony_Fan_Replacement_Request")
    assert [(c["RR_No"], c["Source_Type"], c["RR_Status"]) for c in copies] == [
        ("RR-00001", "Receiving Damage", "Open"), ("RR-00002", "Receiving Missing", "Open")]
    spo = (await store.find("Tony_Fan_Purchase_Order"))[0]
    assert spo["Damage_SKUs_Supplier2"] == "L-1"
    assert spo["Missing_SKUs_Supplier2"] == "S-1"
    assert (await create_rr_supplier("Tony", {"exceptionId": str(exc_id)}, store))["created"] == 0
    assert len(await store.find("Tony_Fan_Replacement_Request")) == 2
    assert (await create_rr_supplier("Fenteng", {"exceptionId": str(exc_id)}, store))["created"] == 0
    assert len(await store.find("Fenteng_Lighting_Replacement_Request")) == 0


# Node: 'Create RR: an exception that does not exist is refused'
@pytest.mark.asyncio
async def test_create_rr_main_refuses_an_unknown_exception(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.procurement.replacement_requests import create_rr_main

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    assert (await create_rr_main({"exceptionId": "99999999"}, store))["message"] == "Exception not found."
