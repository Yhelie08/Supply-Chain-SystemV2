import pytest


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def _seed(raw, supplier="Tony"):
    customer = await raw.add_record("Customer", {"customer_name": "Sample Customer"})
    lamp = await raw.add_record("Items", {"item_name": "Lamp", "SKU": "L-1", "Rate": 150})
    shade = await raw.add_record("Items", {"item_name": "Shade", "SKU": "S-1", "Rate": 0})
    await raw.add_record("Suppliers", {"Supplier_Name": {"first_name": f"{supplier} Fan", "last_name": ""}, "Active_PO_Count": 0})

    async def pr(no, item, sku, qty, **extra):
        return await raw.add_record("Purchase_Request1", {
            "PR_No": no, "Sales_Order": "SO-A", "PR_Approved": False, "PR_READY_FOR_PO": True, "Selected_Supplier": supplier, "Customer": customer, "Items": item, "sku": sku, "quantity": qty, "unit": "pcs",
            "Selcted_Final_Cost": 100, "Shipment_Mode": "Air", "Followed_Recommendation": "Yes", "Sales_Owner": "HC Sales 1", "Customer_Type": "customer", **extra,
        })

    await pr("PR-1", lamp, "L-1", 2)
    await pr("PR-2", shade, "S-1", 1)
    return {"customer": customer}


# Node: 'Create PO: the ready PRs of the sales order become ONE PO with their lines, the PRs are approved, nothing is made twice'
@pytest.mark.asyncio
async def test_create_po_groups_ready_prs_into_one_po_approves_them_once(raw):
    from app.procurement.po_create import approve_po_main
    await _seed(raw)
    res = await approve_po_main({"soNo": "SO-A"}, raw)
    assert res["status"] == "success", res
    pos = await raw.find("Purchase_Order")
    assert len(pos) == 1
    po = pos[0]
    assert po["PO_No"] == "PO-00001"
    assert po["PO_Status"] == "Draft"
    assert po["Customer"] == "Sample Customer"
    assert [(l["PR_No"], l["SKU"], int(float(l["QTY"])), int(float(l["Line_Total"]))) for l in po["PO_Line_Items"]] == [("PR-1", "L-1", 2, 200), ("PR-2", "S-1", 1, 100)]
    assert int(float(po["Total_PO_Value"])) == 300
    assert int(float(po["Total_Lines"])) == 2
    assert po["Is_Locked"] in (True, "true")
    prs = await raw.find("Purchase_Request1")
    assert [(p["PR_Status"], p["Link_PO_No"], p["PR_Approved"] in (True, "true")) for p in prs] == [("Converted to PO", "PO-00001", True), ("Converted to PO", "PO-00001", True)]
    assert len(await raw.find("Sales_Order")) == 1
    assert int(float((await raw.find("Suppliers"))[0]["Active_PO_Count"])) == 2
    # again: nothing eligible, nothing added
    again = await approve_po_main({"soNo": "SO-A"}, raw)
    assert again["status"] == "empty"
    assert len(await raw.find("Purchase_Order")) == 1
    assert len((await raw.find("Purchase_Order"))[0]["PO_Line_Items"]) == 2


# Node: 'Create PO: a PR on hold, or one that did not follow the recommendation without a reason, is skipped and said so'
@pytest.mark.asyncio
async def test_create_po_skips_held_or_unjustified_prs(raw):
    from app.procurement.po_create import approve_po_main
    seed = await _seed(raw)
    item = await raw.add_record("Items", {"item_name": "Base", "SKU": "B-1"})

    async def mk(no, **extra):
        return await raw.add_record("Purchase_Request1", {"PR_No": no, "Sales_Order": "SO-A", "PR_Approved": False, "PR_READY_FOR_PO": True, "Selected_Supplier": "Tony", "Customer": seed["customer"], "Items": item, "sku": "B-1", "quantity": 1, "Selcted_Final_Cost": 5, **extra})

    await mk("PR-3", Hold_Status="On Hold")
    await mk("PR-4", Followed_Recommendation="No", Override_Reason="")
    res = await approve_po_main({"soNo": "SO-A"}, raw)
    assert "Skipped" in res["message"]
    assert "PR-3 (On Hold)" in res["message"]
    assert "PR-4" in res["message"]
    assert len((await raw.find("Purchase_Order"))[0]["PO_Line_Items"]) == 2
    prs = await raw.find("Purchase_Request1")
    assert len([p for p in prs if p.get("PR_Approved") in (True, "true")]) == 2


# Node: 'Create PO for the supplier: its copy of the PO, one Pending shipment with the supplier copy, and one Receiving record, once'
@pytest.mark.asyncio
async def test_create_po_for_supplier_makes_copy_shipment_and_receiving_once(raw):
    from app.procurement.po_create import approve_po_main
    from app.procurement.po_approval import approve_supplier_po
    await _seed(raw)
    await approve_po_main({"soNo": "SO-A"}, raw)
    res = await approve_supplier_po("Tony", {"soNo": "SO-A"}, raw)
    assert res["status"] == "success", res
    assert res["processed"] == 2
    copy = (await raw.find("Tony_Fan_Purchase_Order"))[0]
    assert copy["PO_No_Supplier2"] == "PO-00001"
    assert copy["PO_Status_Supplier2"] == "Draft"
    assert int(float(copy["Total_PO_Value_Supplier2"])) == 300
    assert [(l["PR_No_Supplier2"], int(float(l["QTY_Supplier2"])), l["Item_Price_Supplier2"]) for l in copy["PO_Line_Items_Supplier2"]] == [("PR-1", 2, "100"), ("PR-2", 1, "100")], "the supplier sees its own price, not the catalog / selling price"
    ships = await raw.find("Shipments")
    assert len(ships) == 1
    ship = ships[0]
    assert ship["Shipment_No"] == "SHP-00001"
    assert ship["Shipment_Status"] == "Pending"
    assert ship["Supplier"] == "Tony Fan"
    assert ship["Sales_Order"] == "SO-A"
    assert len(ship["PO_Shipments"]) == 2
    tony_ship = (await raw.find("Tony_Shipment"))[0]
    assert tony_ship["Shipment_No"] == "SHP-00001"
    assert len(tony_ship["Supplier2_Shipment_Details"]) == 2
    rcv = (await raw.find("Receiving"))[0]
    assert rcv["Receive_No1"] == "RCV-00001"
    assert [(l["PR_No"], int(float(l["Expected_Qty"])), l["Line_Result"]) for l in rcv["Receiving_Line_Items"]] == [("PR-1", 2, "Incomplete"), ("PR-2", 1, "Incomplete")]
    assert rcv["Receive_Status"] == "Pending"
    # again: nothing is made a second time
    again = await approve_supplier_po("Tony", {"soNo": "SO-A"}, raw)
    assert again["processed"] == 0
    for form, n in [("Tony_Fan_Purchase_Order", 1), ("Shipments", 1), ("Tony_Shipment", 1), ("Receiving", 1)]:
        assert len(await raw.find(form)) == n, form
    assert len((await raw.find("Receiving"))[0]["Receiving_Line_Items"]) == 2


# Node: "the other supplier's PRs do not go to Tony; Fenteng has its own copy"
@pytest.mark.asyncio
async def test_other_suppliers_prs_do_not_go_to_tony(raw):
    from app.procurement.po_create import approve_po_main
    from app.procurement.po_approval import approve_supplier_po
    await _seed(raw, "Fenteng")
    await approve_po_main({"soNo": "SO-A"}, raw)
    assert (await approve_supplier_po("Tony", {"soNo": "SO-A"}, raw))["processed"] == 0
    assert len(await raw.find("Tony_Fan_Purchase_Order")) == 0
    assert (await approve_supplier_po("Fenteng", {"soNo": "SO-A"}, raw))["processed"] == 2
    copy = (await raw.find("Fenteng_Lighting_Purchase_Order"))[0]
    assert copy["PO_No_Supplier1"] == "PO-00001"
    assert len(copy["PO_Line_Items_Supplier1"]) == 2
    assert len(await raw.find("Fenteng_Shipment")) == 1


# Node: 'Create PO, local (HC System): the PO of the Local PRs gets one Pending shipment and one Receiving record with its lines, and is Confirmed; no supplier copy; once'
@pytest.mark.asyncio
async def test_create_po_hc_local_confirms_po_with_no_supplier_copy(raw):
    from app.procurement.po_create import approve_po_main
    from app.procurement.po_approval import approve_po_hc
    await _seed(raw, "HC System")
    for p in await raw.find("Purchase_Request1"):
        await raw.update_record("Purchase_Request1", p["ID"], {"Sourcing_Type": "Local"}, by_form=True)
    await approve_po_main({"soNo": "SO-A"}, raw)
    res = await approve_po_hc({"soNo": "SO-A"}, raw)
    assert [res["status"], res["processed"]] == ["success", 1], res
    po = (await raw.find("Purchase_Order"))[0]
    assert po["PO_Status"] == "Confirmed"
    ship = (await raw.find("Shipments"))[0]
    assert [ship["Supplier"], ship["Shipment_Status"], [l["PR_No"] for l in ship["PO_Shipments"]]] == ["HC System", "Pending", ["PR-1", "PR-2"]]
    rcv = (await raw.find("Receiving"))[0]
    assert [rcv["Supplier"], rcv["PO_No"], rcv["Receive_Status"], [(l["PR_No"], int(float(l["Expected_Qty"]))) for l in rcv["Receiving_Line_Items"]]] == ["HC System", "PO-00001", "Pending", [("PR-1", 2), ("PR-2", 1)]]
    await approve_po_hc({"soNo": "SO-A"}, raw)
    for form, n in [("Shipments", 1), ("Receiving", 1), ("Tony_Shipment", 0), ("Fenteng_Shipment", 0)]:
        assert len(await raw.find(form)) == n, form
    assert len((await raw.find("Shipments"))[0]["PO_Shipments"]) == 2, "no line twice"


# Node: 'Create PO, local: PRs that are not Local are left to the supplier functions'
@pytest.mark.asyncio
async def test_create_po_local_leaves_non_local_prs_to_supplier_functions(raw):
    from app.procurement.po_create import approve_po_main
    from app.procurement.po_approval import approve_po_hc
    await _seed(raw)
    await approve_po_main({"soNo": "SO-A"}, raw)
    assert (await approve_po_hc({"soNo": "SO-A"}, raw))["processed"] == 0
    assert len(await raw.find("Shipments")) == 0
