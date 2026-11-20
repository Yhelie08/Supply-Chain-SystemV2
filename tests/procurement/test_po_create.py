import pytest
from app.deluge import add_days, ymd, today_date

TODAY = today_date()
SPEC_SETTINGS = {"transit_lcl_min_days": 30, "transit_lcl_max_days": 30, "transit_air_min_days": 14, "transit_air_max_days": 14, "customs_lcl_min_days": 0, "customs_lcl_max_days": 0, "customs_air_min_days": 0, "customs_air_max_days": 0, "fulfillment_days": 3, "delivery_days": 2}


def day(n: int) -> str:
    return ymd(add_days(TODAY, n))


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    store = create_store(db_conn)
    for k, v in SPEC_SETTINGS.items():
        await store.add_record("Procurement_Settings", {"Setting_Key": k, "Value": str(v)})
    return store


async def _base(raw, suppliers=("Tony Fan",)):
    customer = await raw.add_record("Customer", {"customer_name": "Sample Customer"})
    lamp = await raw.add_record("Items", {"item_name": "Lamp", "SKU": "L-1", "Rate": 150})
    for n in suppliers:
        await raw.add_record("Suppliers", {"Supplier_Name": {"first_name": n, "last_name": ""}, "Active_PO_Count": 0})
    return customer, lamp


async def _pr(raw, customer, lamp, no, so, **extra):
    return await raw.add_record("Purchase_Request1", {
        "PR_No": no, "Sales_Order": so, "PR_Approved": False, "PR_READY_FOR_PO": True, "Selected_Supplier": "Tony Fan", "Customer": customer, "Items": lamp, "sku": "L-1", "quantity": 2, "unit": "pcs",
        "Selcted_Final_Cost": 100, "Shipment_Mode": "LCL", "Followed_Recommendation": "Yes", "Sales_Owner": "HC Sales 1", "Customer_Type": "customer", "Target_Delivery": day(120), "Required_Days_Lead": 20, **extra,
    })


# Node: 'the gate: a line that cannot arrive in time needs an option first, and nothing is written until it has one (PO-R1)'
@pytest.mark.asyncio
async def test_po_r1_gate_blocks_until_late_line_has_a_choice(raw):
    from app.procurement.po_create import approve_po_main
    customer, lamp = await _base(raw)
    await _pr(raw, customer, lamp, "PR-1", "SO-A", Target_Delivery=day(20))  # 61 days needed by sea
    await _pr(raw, customer, lamp, "PR-2", "SO-A")
    r = await approve_po_main({"soNo": "SO-A"}, raw)
    assert r["status"] == "needs_choice"
    assert [(l["pr_no"], l["shortfall_days"], l["can_air"]) for l in r["lines"]] == [("PR-1", 41, True)]
    assert r["lines"][0]["earliest_feasible_date"] == day(61)
    assert len(await raw.find("Purchase_Order")) == 0, "no PO yet"
    pr2 = (await raw.find("Purchase_Request1", lambda p: p.get("PR_No") == "PR-2"))[0]
    assert pr2.get("PR_Approved") not in (True, "true"), "no PR touched"


# Node: 'option C, proceed as is: the PO is made, marked born late, with the shortfall and the choice in its note (PO-R3)'
@pytest.mark.asyncio
async def test_option_c_proceed_marks_po_born_late(raw):
    from app.procurement.po_create import approve_po_main
    customer, lamp = await _base(raw)
    await _pr(raw, customer, lamp, "PR-1", "SO-A", Target_Delivery=day(20))
    r = await approve_po_main({"soNo": "SO-A", "lateChoices": {"PR-1": "proceed"}}, raw)
    assert r["status"] == "success", r
    po = (await raw.find("Purchase_Order"))[0]
    assert po["Born_Late"] in (True, "true")
    assert int(float(po["Shortfall_Days"])) == 41
    assert "PR-1: 41 days late; chose proceed as is" in po["Feasibility_Note"]


# Node: 'option A, air: the line goes by air and the dates are worked out again; it is still counted born late ... the note says air made it on time'
@pytest.mark.asyncio
async def test_option_a_air_recomputes_and_notes_on_time(raw):
    from app.procurement.po_create import approve_po_main
    customer, lamp = await _base(raw)
    await _pr(raw, customer, lamp, "PR-1", "SO-A", Target_Delivery=day(50))  # 61 by sea (11 late); 45 by air (on time)
    r = await approve_po_main({"soNo": "SO-A", "lateChoices": {"PR-1": "air"}}, raw)
    assert r["status"] == "success"
    po = (await raw.find("Purchase_Order"))[0]
    assert po["Shipment_Mode"] == "Airfreight"
    assert po["PO_Line_Items"][0]["Shipping_Mode"] == "Airfreight"
    assert po["Born_Late"] in (True, "true"), "born late is measured at the gate, before the option"
    assert int(float(po["Shortfall_Days"])) == 11
    assert [int(float(po["Lines_Raised"])), int(float(po["Lines_Born_Late"]))] == [1, 1]
    assert "chose air (on time)" in po["Feasibility_Note"]


# Node: 'option B, propose a new target: the PO is made, a target change goes to Decisions, and the target moves only if it is accepted (PO-R2)'
@pytest.mark.asyncio
async def test_option_b_move_target_prepares_decision_without_moving_target(raw):
    from app.procurement.po_create import approve_po_main
    customer, lamp = await _base(raw)
    await _pr(raw, customer, lamp, "PR-1", "SO-A", Target_Delivery=day(20))
    await approve_po_main({"soNo": "SO-A", "lateChoices": {"PR-1": "move_target"}}, raw)
    pr1 = (await raw.find("Purchase_Request1", lambda p: p.get("PR_No") == "PR-1"))[0]
    assert pr1["Target_Delivery"] == day(20), "the target did not move by itself"
    items = await raw.find("Approval_Queue", lambda i: i.get("Kind") == "forecast_promise_change")
    assert items
    it = items[0]
    assert it["Record_Type"] == "pr"
    assert it["Status"] == "pending"
