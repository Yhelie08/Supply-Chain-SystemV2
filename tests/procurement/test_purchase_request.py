import pytest
from app.deluge import add_days, ymd, today_date

TODAY = today_date()


def in_days(n: int) -> str:
    return ymd(add_days(TODAY, n))


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def store(raw):
    from app.workflows import create_hooked_store
    import app.procurement.purchase_request  # noqa: F401
    import app.procurement.pr_spec  # noqa: F401
    return create_hooked_store(raw)


@pytest.fixture
async def seed(raw):
    from app.procurement.suppliers import SUPPLIERS
    tony_s, fenteng_s = SUPPLIERS[0], SUPPLIERS[1]
    tony = await raw.add_record("Suppliers", {"Supplier_ID": tony_s["books_id"], "Supplier_Name": {"first_name": "Tony", "last_name": "Fan"}, "Handles_All": True, "Max_Capacity": 10})
    fenteng = await raw.add_record("Suppliers", {"Supplier_ID": fenteng_s["books_id"], "Supplier_Name": {"first_name": "Fenteng"}, "Handles_All": False, "Supported_Categories": ["Pendant Light", "Wall Light"], "Max_Capacity": 4})
    item = await raw.add_record("Items", {"ID1": "B1", "item_name": "Lamp", "SKU": "S-1", "Image": "/img/lamp.png", "Rate": "0"})
    return {"tony": tony, "fenteng": fenteng, "item": item}


def pr_payload(item, **extra):
    return {"sku": "S-1", "quantity": 2, "category": "Pendant Light", "Items": item, "Target_Delivery": in_days(60), "PR_Date": in_days(0), "Description1": "d1", "description": "d", "unit": "pcs", **extra}


async def _read(raw, id_):
    return await raw.get_record_by_id("Purchase_Request1", id_, raw=True)


async def _tony_copies(raw, no):
    return await raw.find("Tony_Fan_Purchase_Request", lambda r: r.get("PR_No_Supplier2") == no)


async def _fenteng_copies(raw, no):
    return await raw.find("Fenteng_Lighting_Purchase_Request", lambda r: r.get("PR_No_Supplier1") == no)


# Node: 'numbering: the next PR number follows the highest one that exists'
@pytest.mark.asyncio
async def test_numbering_follows_highest_existing_number(raw, store, seed):
    item = seed["item"]
    a = await store.add_record("Purchase_Request1", pr_payload(item))
    b = await store.add_record("Purchase_Request1", pr_payload(item))
    assert [(await _read(raw, a))["PR_No"], (await _read(raw, b))["PR_No"]] == ["PR-00001", "PR-00002"]
    await raw.add_record("Purchase_Request1", {"PR_No": "PR-00009"})
    c = await store.add_record("Purchase_Request1", pr_payload(item))
    assert (await _read(raw, c))["PR_No"] == "PR-00010"


# Node: 'status: Open until a PO is linked, then Converted to PO'
@pytest.mark.asyncio
async def test_status_open_until_po_linked(raw, store, seed):
    item = seed["item"]
    a = await store.add_record("Purchase_Request1", pr_payload(item))
    assert (await _read(raw, a))["PR_Status"] == "Open"
    b = await store.add_record("Purchase_Request1", pr_payload(item, Link_PO_No="PO-1"))
    assert (await _read(raw, b))["PR_Status"] == "Converted to PO"


# Node: 'load balancing: only suppliers that can do the category get a row, with their live load'
@pytest.mark.asyncio
async def test_load_balancing_matches_category_and_live_load(raw, store, seed):
    item, tony, fenteng = seed["item"], seed["tony"], seed["fenteng"]
    floor_id = await store.add_record("Purchase_Request1", pr_payload(item, category="Floor Lamp"))
    floor = await _read(raw, floor_id)
    assert [r["Suppliers"]["ID"] for r in floor["Supplier_Load_Balancing"]] == [str(tony)], "Handles_All Tony only; Fenteng does not do Floor Lamp"

    await raw.add_record("Purchase_Order", {"PO_Status": "Open", "PO_Line_Items": [{"Supplier": "Tony"}, {"Supplier": "Tony"}]})
    await raw.add_record("Purchase_Order", {"PO_Status": "Completed", "PO_Line_Items": [{"Supplier": "Tony"}]})
    await raw.add_record("Purchase_Order", {"PO_Status": "Open", "PO_Line_Items": [{"Supplier": "Fenteng"}, {"Supplier": "Fenteng"}, {"Supplier": "Fenteng"}, {"Supplier": "Fenteng"}]})
    both_id = await store.add_record("Purchase_Request1", pr_payload(item))
    both = await _read(raw, both_id)

    def row(sid):
        return next(r for r in both["Supplier_Load_Balancing"] if r["Suppliers"]["ID"] == str(sid))

    assert [row(tony)["Active_POs"], row(tony)["Percent"], row(tony)["Load_Status"]] == ["2", "20.00", "Normal"], "a completed PO does not count"
    assert [row(fenteng)["Active_POs"], row(fenteng)["Percent"], row(fenteng)["Load_Status"]] == ["4", "100.00", "Overloaded"]


# Node: 'recommended supplier: the lowest price, then the shortest lead time'
@pytest.mark.asyncio
async def test_recommended_supplier_lowest_price_then_shortest_lead(raw, store, seed):
    item, tony, fenteng = seed["item"], seed["tony"], seed["fenteng"]
    pr_id = await store.add_record("Purchase_Request1", pr_payload(item))

    def quotes(a, b):
        def apply(rows):
            return [{**r, **(a if r.get("Suppliers") == "Tony" else b)} for r in rows]
        return apply

    async def set_(a, b):
        rec = await _read(raw, pr_id)
        await store.update_record("Purchase_Request1", pr_id, {"Supplier_Selected": quotes(a, b)(rec["Supplier_Selected"])}, by_form=True)
        rec2 = await _read(raw, pr_id)
        row = next((r for r in rec2["Supplier_Load_Balancing"] if r.get("Eligible_Supplier") == "Recommended"), None)
        return row["Suppliers"]["ID"] if row else None

    assert await set_({"Initial_Price": 120}, {"Initial_Price": 100}) == str(fenteng), "cheaper wins"
    assert await set_({"Initial_Price": 120, "Negotiated": 80}, {"Initial_Price": 100}) == str(tony), "a negotiated price replaces the initial one"
    assert await set_({"Initial_Price": 100, "Negotiated": 0, "Lead_Time": 5}, {"Initial_Price": 100, "Lead_Time": 9}) == str(tony), "equal price: shorter lead time"


# Node: 'supplier selection: one row per matched supplier, one winner, copied up to the PR'
@pytest.mark.asyncio
async def test_supplier_selection_one_winner_copied_to_pr(raw, store, seed):
    item = seed["item"]
    pr_id = await store.add_record("Purchase_Request1", pr_payload(item))
    rec = await _read(raw, pr_id)
    assert sorted([r["Suppliers"], r["Status"], r["Selected"]] for r in rec["Supplier_Selected"]) == sorted([["Fenteng", "Active", False], ["Tony", "Active", False]])
    assert rec["Selected_Supplier"] == ""
    tony_row = next(r for r in rec["Supplier_Selected"] if r["Suppliers"] == "Tony")
    new_sel = [({**r, "Selected": True, "Final_Price": "500", "Lead_Time": "12"} if r is tony_row else r) for r in rec["Supplier_Selected"]]
    await store.update_record("Purchase_Request1", pr_id, {"Supplier_Selected": new_sel}, by_form=True)
    rec = await _read(raw, pr_id)
    assert [rec["Selected_Supplier"], rec["Selcted_Final_Cost"], rec["Required_Days_Lead"]] == ["Tony", "500", "12"]
    cleared = [{**r, "Selected": False} for r in rec["Supplier_Selected"]]
    await store.update_record("Purchase_Request1", pr_id, {"Supplier_Selected": cleared}, by_form=True)
    rec = await _read(raw, pr_id)
    assert [rec["Selected_Supplier"], rec["Selcted_Final_Cost"], rec["Required_Days_Lead"]] == ["", "0", "0"]


# Node: 'a Local PR uses HC System, with no lead time and no freight'
@pytest.mark.asyncio
async def test_local_pr_uses_hc_system(raw, store, seed):
    item = seed["item"]
    pr_id = await store.add_record("Purchase_Request1", pr_payload(item, Sourcing_Type="Local"))
    rec = await _read(raw, pr_id)
    assert [rec["Selected_Supplier"], rec["Required_Days_Lead"], rec["Shipping_mode_selected"]] == ["HC System", "0", True]


# Node: 'spec v1.4 PR-R5: an auto-priced PR reaches Ready for PO on its first save, no second touch needed'
@pytest.mark.asyncio
async def test_auto_priced_pr_reaches_ready_for_po_on_first_save(raw, store, seed):
    item, tony = seed["item"], seed["tony"]
    pr_id = await store.add_record("Purchase_Request1", pr_payload(item, SRP_Approved_PR=100, Supplier_Selected=[{"Supplier_ID": str(tony), "Suppliers": "Tony", "Selected": True, "Final_Price": 90, "Lead_Time": 5}]))
    rec = await _read(raw, pr_id)
    assert [rec["Selected_Supplier1"], rec["Final_price_confirmed"], rec["Target_date_exists"]] == [True, True, True]
    assert rec["Shipment_Mode"] == "LCL", "the mode was defaulted in this save"
    assert rec["Shipping_mode_selected"] is True, "readiness now sees the mode this save set, not a stale blank one"
    assert rec["PR_READY_FOR_PO"] is True, "no person, and no extra save, needed to reach Ready for PO"


# Node: 'price confirmed: approved SRP, SRP rate, an inquiry, the catalog rate, or a supplier cost'
@pytest.mark.asyncio
async def test_price_confirmed_from_srp_inquiry_or_catalog_rate(raw, store, seed):
    item = seed["item"]

    async def confirmed(extra):
        payload = {"sku": "NOPE", **extra}
        pr_id = await store.add_record("Purchase_Request1", pr_payload(item, **payload))
        return (await _read(raw, pr_id))["Final_price_confirmed"]

    assert await confirmed({}) is False
    assert await confirmed({"SRP_Approved_PR": 5}) is True
    assert await confirmed({"SRP_Rate_PR": 5}) is True
    assert await confirmed({"inquiry_reference": "INQ-1"}) is True
    await raw.add_record("Items", {"SKU": "PRICED", "Rate": "250"})
    assert await confirmed({"sku": "PRICED"}) is True


# Node: 'shipment mode and dates: the supplier date is the target - 4 days; the mode is only defaulted (to sea) and never switched to air by itself'
@pytest.mark.asyncio
async def test_shipment_mode_defaults_to_sea_and_is_never_auto_switched(raw, store, seed):
    item = seed["item"]
    far_id = await store.add_record("Purchase_Request1", pr_payload(item, Target_Delivery=in_days(60)))
    far = await _read(raw, far_id)
    assert [far["supplier_target_date"], far["Shipment_Mode"], far["Shipment_Days"]] == [in_days(56), "LCL", "30"]
    near_id = await store.add_record("Purchase_Request1", pr_payload(item, Target_Delivery=in_days(10)))
    near = await _read(raw, near_id)
    assert [near["supplier_target_date"], near["Shipment_Mode"], near["Shipment_Days"]] == [in_days(6), "LCL", "30"], "close to the target it is still sea: the PR shows impossible and the buyer decides about air"
    air_id = await store.add_record("Purchase_Request1", pr_payload(item, Target_Delivery=in_days(10), Shipment_Mode="Airfreight"))
    await store.update_record("Purchase_Request1", air_id, {"Description1": "saved again"})
    kept = await _read(raw, air_id)
    assert [kept["Shipment_Mode"], kept["Shipment_Days"]] == ["Airfreight", "14"], "the buyer's choice of air is kept on every save"


# Node: 'timeline: remaining days to the end of production, and the delay status'
@pytest.mark.asyncio
async def test_timeline_remaining_days_and_delay_status(raw, store, seed):
    item = seed["item"]
    pr_id = await store.add_record("Purchase_Request1", pr_payload(item))
    rec = await _read(raw, pr_id)
    assert rec["Production_Date"] == in_days(0), "not converted yet: production starts today"

    def sel(lead):
        return [({**r, "Selected": True, "Final_Price": "10", "Lead_Time": str(lead)} if r["Suppliers"] == "Tony" else r) for r in rec["Supplier_Selected"]]

    await store.update_record("Purchase_Request1", pr_id, {"Supplier_Selected": sel(20)}, by_form=True)
    rec = await _read(raw, pr_id)
    assert [rec["Remaining_Days"], rec["Delay_Status"]] == ["20", "On Track"]
    await store.update_record("Purchase_Request1", pr_id, {"Supplier_Selected": sel(2)}, by_form=True)
    rec = await _read(raw, pr_id)
    assert [rec["Remaining_Days"], rec["Delay_Status"]] == ["2", "At Risk"]


# Node: 'priority: delivery urgency, big orders and idle time add up to High, Medium or Low'
@pytest.mark.asyncio
async def test_priority_score_from_urgency_and_order_value(raw, store, seed):
    item = seed["item"]
    high_id = await store.add_record("Purchase_Request1", pr_payload(item, Target_Delivery=in_days(2), Order_Value=600000))
    high = await _read(raw, high_id)
    assert [high["Priority"], high["Priority_Score"]] == ["High", "70"]
    low_id = await store.add_record("Purchase_Request1", pr_payload(item, Target_Delivery=in_days(30)))
    low = await _read(raw, low_id)
    assert [low["Priority"], low["Priority_Score"]] == ["Low", "0"]
    medium_id = await store.add_record("Purchase_Request1", pr_payload(item, Target_Delivery=in_days(5), Order_Value=500000))
    medium = await _read(raw, medium_id)
    assert [medium["Priority"], medium["Priority_Score"]] == ["Medium", "50"]


# Node: 'a PR converted to a PO is locked: its terms cannot change, other fields can'
@pytest.mark.asyncio
async def test_converted_pr_is_locked_for_commercial_terms(raw, store, seed):
    from app.criteria import ZohoError
    item, tony = seed["item"], seed["tony"]
    pr_id = await store.add_record("Purchase_Request1", pr_payload(item, Link_PO_No="PO-1", category="Floor Lamp", Supplier_Selected=[{"Supplier_ID": str(tony), "Suppliers": "Tony", "Selected": True, "Final_Price": 500, "Lead_Time": 10}]))
    await store.update_record("Purchase_Request1", pr_id, {"description": "a note"}, by_form=True)
    assert (await _read(raw, pr_id))["description"] == "a note"
    with pytest.raises(ZohoError, match="already locked"):
        await store.update_record("Purchase_Request1", pr_id, {"quantity": 99}, by_form=True)
    assert (await _read(raw, pr_id))["quantity"] != "99"


# Node: 'a new PR is copied to each supplier portal that should quote it'
@pytest.mark.asyncio
async def test_new_pr_copied_to_each_supplier_portal(raw, store, seed):
    item = seed["item"]
    pr_id = await store.add_record("Purchase_Request1", pr_payload(item), "staff@example.test")
    rec = await _read(raw, pr_id)
    t = (await _tony_copies(raw, rec["PR_No"]))[0]
    f = (await _fenteng_copies(raw, rec["PR_No"]))[0]
    assert [t["Response_Status"], t["edit_counter"], t["sku_Supplier2"], t["quantity_Supplier2"], t["Product_Image_Supplier2_PR"]] == ["Waiting", "1", "S-1", "2", "/img/lamp.png"]
    assert [f["Response_Status"], f["sku_Supplier1"], f["Priority_PR_Supplier1"]] == ["Waiting", "S-1", rec["Priority"]]
    assert [r["Suppliers_Supplier2"] for r in t["Supplier_Selected_Supplier2"]] == ["Tony Fan"]
    assert [r["Suppliers_Supplier1"] for r in f["Supplier_Selected_Supplier1"]] == ["Fenteng Lighting"]
    assert rec["Product_Image_PR"] == "/img/lamp.png", "and the PR takes its item's photo"


# Node: 'no copies for Local PRs or PRs that came from a sales order'
@pytest.mark.asyncio
async def test_no_copies_for_local_or_so_sourced_prs(raw, store, seed):
    item = seed["item"]
    for extra in ({"Sourcing_Type": "Local"}, {"Source": "SO"}):
        pr_id = await store.add_record("Purchase_Request1", pr_payload(item, **extra))
        rec = await _read(raw, pr_id)
        assert len(await _tony_copies(raw, rec["PR_No"])) + len(await _fenteng_copies(raw, rec["PR_No"])) == 0, str(extra)


# Node: 'a PR from an inquiry goes only to the supplier whose quote was selected there'
@pytest.mark.asyncio
async def test_pr_from_inquiry_goes_only_to_selected_supplier(raw, store, seed):
    item, tony, fenteng = seed["item"], seed["tony"], seed["fenteng"]
    await raw.add_record("Inquiry_Form", {"INQ_No": "INQ-1", "Supplier_Quotes": [
        {"Suppliers": "Tony", "Supplier_ID": f"[{tony}]", "Selected": True, "Availability": "Confirmed", "Initial_Price": "95", "Final_Price": "90", "Lead_Time": "7"},
        {"Suppliers": "Fenteng", "Supplier_ID": f"[{fenteng}]", "Selected": False},
    ]})
    pr_id = await store.add_record("Purchase_Request1", pr_payload(item, inquiry_reference="INQ-1"))
    rec = await _read(raw, pr_id)
    assert len(await _fenteng_copies(raw, rec["PR_No"])) == 0
    t = (await _tony_copies(raw, rec["PR_No"]))[0]
    assert t["Response_Status"] == "Selected"
    assert [t["Supplier_Selected_Supplier2"][0]["Final_Price_Supplier2"], t["Supplier_Selected_Supplier2"][0]["Lead_Time_Supplier2"], t["Supplier_Selected_Supplier2"][0]["Selected_Supplier2"]] == ["90", "7", True]

    await raw.add_record("Inquiry_Form", {"INQ_No": "INQ-2", "Supplier_Quotes": [{"Suppliers": "Tony", "Supplier_ID": f"[{tony}]", "Selected": False}]})
    open_id = await store.add_record("Purchase_Request1", pr_payload(item, inquiry_reference="INQ-2"))
    open_rec = await _read(raw, open_id)
    assert len(await _tony_copies(raw, open_rec["PR_No"])) + len(await _fenteng_copies(raw, open_rec["PR_No"])) == 2, "nothing selected in the inquiry: both get it"


# Node: 'editing a PR updates the copies: changes reopen them, a selection decides who is Selected'
@pytest.mark.asyncio
async def test_editing_pr_updates_copies_and_selection_decides_status(raw, store, seed):
    import re
    item = seed["item"]
    pr_id = await store.add_record("Purchase_Request1", pr_payload(item))
    no = (await _read(raw, pr_id))["PR_No"]
    await store.update_record("Purchase_Request1", pr_id, {"quantity": 7}, by_form=True)
    t1 = (await _tony_copies(raw, no))[0]
    f1 = (await _fenteng_copies(raw, no))[0]
    assert [t1["Response_Status"], t1["quantity_Supplier2"], f1["Response_Status"], f1["quantity_Supplier1"]] == ["Submit Response", "7", "Submit Response", "7"]
    assert re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} (AM|PM)$", (await _read(raw, pr_id))["Last_Update"]), "Last_Update is stamped"

    rec = await _read(raw, pr_id)
    new_sel = [({**r, "Selected": True, "Final_Price": "50", "Lead_Time": "3"} if r["Suppliers"] == "Tony" else r) for r in rec["Supplier_Selected"]]
    await store.update_record("Purchase_Request1", pr_id, {"Supplier_Selected": new_sel}, by_form=True)
    t2 = (await _tony_copies(raw, no))[0]
    f2 = (await _fenteng_copies(raw, no))[0]
    assert [t2["Response_Status"], t2["edit_counter"], f2["Response_Status"], f2["edit_counter"]] == ["Selected", "1", "Not Selected", "0"]


# Node: 'a PR is never deleted (spec: cancel it); its suppliers' copies stay'
@pytest.mark.asyncio
async def test_pr_never_deleted_copies_stay(raw, store, seed):
    from app.criteria import ZohoError
    item = seed["item"]
    pr_id = await store.add_record("Purchase_Request1", pr_payload(item))
    no = (await _read(raw, pr_id))["PR_No"]
    assert len(await _tony_copies(raw, no)) + len(await _fenteng_copies(raw, no)) == 2
    with pytest.raises(ZohoError, match="never deleted"):
        await store.delete_record("Purchase_Request1", pr_id)
    assert len(await _tony_copies(raw, no)) + len(await _fenteng_copies(raw, no)) == 2
