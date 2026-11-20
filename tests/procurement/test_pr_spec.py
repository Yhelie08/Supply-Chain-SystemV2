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


@pytest.fixture
def store(raw):
    from app.workflows import create_hooked_store
    import app.procurement.purchase_request  # noqa: F401
    import app.procurement.pr_spec  # noqa: F401
    return create_hooked_store(raw)


async def _supplier(raw, name, **extra):
    return await raw.add_record("Suppliers", {"Supplier_Name": {"first_name": name, "last_name": ""}, "Handles_All": True, "Max_Capacity": 50, **extra})


def quote(id_, name, price, lead) -> dict:
    return {"Supplier_ID": str(id_), "Suppliers": name, "Availability": "Confirmed", "Initial_Price": price, "Lead_Time": lead}


async def _pr(raw, store, *, so="SO-1", so_days=-30, target=70, quotes=None, extra=None):
    quotes = quotes or []
    extra = extra or {}
    if so:
        await raw.add_record("Sales_Order_Fulfillment", {"SO_No": so, "SO_Created_Date": day(so_days)})
    return await store.add_record("Purchase_Request1", {"Sales_Order": so, "Target_Delivery": "" if target is None else day(target), "Shipment_Mode": "LCL", "category": "Chandeliers", "Supplier_Selected": quotes, **extra})


async def _get(raw, id_):
    return await raw.get_record_by_id("Purchase_Request1", id_, raw=True)


async def _events(raw, id_):
    rows = sorted(await raw.find("Stage_Events", lambda e: e.get("Record_Type") == "pr" and str(e.get("Record_Id")) == str(id_)), key=lambda e: int(e["ID"]))
    return [r["Event"] for r in rows]


# Node: 'the recommendation weighs price AND lead time against the target, and says why in words (PR-R4)'
@pytest.mark.asyncio
async def test_recommendation_weighs_price_and_lead_time(raw, store):
    a = await _supplier(raw, "Cheapo")
    b = await _supplier(raw, "Steady")
    pr_id = await _pr(raw, store, target=70, quotes=[quote(a, "Cheapo", 50, 60), quote(b, "Steady", 80, 20)])
    p = await _get(raw, pr_id)
    assert p["Recommended_Supplier_Id"] == str(b), "the cheaper supplier would be late, so the one that arrives in time wins"
    assert "Steady: CNY 80, lead 20 days, arrives in time" in p["Recommendation_Reason"]
    assert "Cheapo is cheaper (CNY 50) but would be" in p["Recommendation_Reason"]
    row = next(r for r in p["Supplier_Load_Balancing"] if r["Suppliers"].get("ID") == str(b) or r["Suppliers"].get("display_value") == "Steady")
    assert row["Eligible_Supplier"] == "Recommended"


# Node: 'when both can make it, the cheaper wins; when none can, the closest does and the reason says so'
@pytest.mark.asyncio
async def test_cheaper_wins_when_both_feasible_closest_wins_when_none_are(raw, store):
    a = await _supplier(raw, "Cheapo")
    b = await _supplier(raw, "Steady")
    ok_id = await _pr(raw, store, target=120, quotes=[quote(a, "Cheapo", 50, 25), quote(b, "Steady", 80, 20)])
    assert (await _get(raw, ok_id))["Recommended_Supplier_Id"] == str(a)
    none_id = await _pr(raw, store, so="SO-2", target=20, quotes=[quote(a, "Cheapo", 50, 60), quote(b, "Steady", 80, 20)])
    p = await _get(raw, none_id)
    assert p["Recommended_Supplier_Id"] == str(b)
    assert "No supplier can make the date. Steady is the closest" in p["Recommendation_Reason"]


# Node: 'every PR carries its feasibility: feasible, at risk, or impossible with the shortfall, the earliest date and the air option (PR-R6)'
@pytest.mark.asyncio
async def test_every_pr_carries_its_feasibility(raw, store):
    a = await _supplier(raw, "Steady")
    q = [quote(a, "Steady", 80, 20)]
    feasible = await _get(raw, await _pr(raw, store, so="SO-A", target=90, quotes=q))
    assert feasible["Feasibility"] == "feasible"
    risk = await _get(raw, await _pr(raw, store, so="SO-B", target=63, quotes=q))
    assert risk["Feasibility"] == "at_risk"
    late = await _get(raw, await _pr(raw, store, so="SO-C", target=20, quotes=q))
    assert late["Feasibility"] == "impossible"
    assert int(float(late["Shortfall_Days"])) == 41  # 61 days needed, the spec's worked example
    assert late["Earliest_Feasible_Date"] == day(61)
    assert "Even by air" in late["Air_Option"]


# Node: 'the server fields cannot be typed by a widget'
@pytest.mark.asyncio
async def test_server_fields_cannot_be_typed_by_a_widget(raw, store):
    a = await _supplier(raw, "Steady")
    pr_id = await _pr(raw, store, quotes=[quote(a, "Steady", 80, 20)])
    before = await _get(raw, pr_id)
    await store.update_record("Purchase_Request1", pr_id, {"Feasibility": "feasible", "Pr_Category": "on_track", "Queue_Rank": 1, "Order_Date": "2001-01-01", "Pr_State": "converted", "Description1": "ok"})
    p = await _get(raw, pr_id)
    assert p["Description1"] == "ok"
    assert p["Order_Date"] == before["Order_Date"]
    assert p["Pr_State"] == before["Pr_State"]
    assert p["Feasibility"] == before["Feasibility"]


# Node: 'the selected supplier is kept by ID, not only by name'
@pytest.mark.asyncio
async def test_selected_supplier_kept_by_id(raw, store):
    a = await _supplier(raw, "Steady")
    pr_id = await _pr(raw, store, quotes=[{**quote(a, "Steady", 80, 20), "Selected": True}])
    p = await _get(raw, pr_id)
    assert p["Selected_Supplier_Id"] == str(a)


# Node: 'Order Date comes from the Sales Order; a manual PR (no customer order) uses the day it was created (DT-1)'
@pytest.mark.asyncio
async def test_order_date_from_so_or_creation_day(raw, store):
    with_so = await _get(raw, await _pr(raw, store, so="SO-9", so_days=-12))
    assert with_so["Order_Date"] == day(-12)
    manual = await _get(raw, await _pr(raw, store, so=""))
    assert manual["Order_Date"] == day(0)


# Node: 'pricing status: needs a manual quote when nobody has priced it (the buyer is told once), priced when a final price exists (PR-R5)'
@pytest.mark.asyncio
async def test_pricing_status_manual_quote_alert_once_then_priced(raw, store):
    pr_id = await _pr(raw, store, so="SO-Q")
    assert (await _get(raw, pr_id))["Pricing_Status"] == "needs_manual_quote"
    assert len(await raw.find("App_Notifications", lambda n: n.get("Notification_Type") == "PR Needs Manual Quote")) == 1
    await store.update_record("Purchase_Request1", pr_id, {"Description1": "again"})
    assert len(await raw.find("App_Notifications", lambda n: n.get("Notification_Type") == "PR Needs Manual Quote")) == 1, "told once"
    a = await _supplier(raw, "Steady")
    quoted = await _get(raw, await _pr(raw, store, so="SO-R", quotes=[quote(a, "Steady", 80, 20)]))
    assert quoted["Pricing_Status"] == "needs_pricing"
    priced = await _get(raw, await _pr(raw, store, so="SO-S", quotes=[quote(a, "Steady", 80, 20)], extra={"SRP_Approved_PR": 900}))
    assert priced["Pricing_Status"] == "auto_priced"


# Node: 'hold, resume and cancel need a reason and are stamped; a cancelled PR stays cancelled; a PR is never deleted (PR-R7)'
@pytest.mark.asyncio
async def test_hold_resume_cancel_need_reason_and_are_stamped(raw, store):
    from app.criteria import ZohoError
    pr_id = await _pr(raw, store)
    with pytest.raises(ZohoError, match="reason is required"):
        await store.update_record("Purchase_Request1", pr_id, {"Hold_Status": "On Hold"})
    await store.update_record("Purchase_Request1", pr_id, {"Hold_Status": "On Hold", "Hold_Reason": "Client stopped order"}, user="buyer@x")
    p = await _get(raw, pr_id)
    assert p["Pr_State"] == "on_hold"
    assert p["Held_By"] == "buyer@x"
    await store.update_record("Purchase_Request1", pr_id, {"Hold_Status": "Active"})
    assert (await _get(raw, pr_id))["Pr_State"] == "open"
    await store.update_record("Purchase_Request1", pr_id, {"Hold_Status": "Cancelled", "Hold_Reason": "Client confirmed cancel"})
    with pytest.raises(ZohoError, match="stays cancelled"):
        await store.update_record("Purchase_Request1", pr_id, {"Hold_Status": "Active"})
    with pytest.raises(ZohoError, match="never deleted"):
        await store.delete_record("Purchase_Request1", pr_id)
    assert await _events(raw, pr_id) == ["pr.created", "pr.held", "pr.resumed", "pr.cancelled"]


# Node: 'Books voids the Sales Order: its open PRs go on hold at once, with the reason (PR-R2)'
@pytest.mark.asyncio
async def test_books_voids_so_puts_open_prs_on_hold(raw, store):
    so = await raw.add_record("Sales_Order", {"Sales_Order_Number": "SO-V", "Order_Status": "open"})
    a = await _pr(raw, store, so="SO-V")
    b = await _pr(raw, store, so="SO-V")
    other = await _pr(raw, store, so="SO-OTHER")
    await store.update_record("Sales_Order", so, {"Order_Status": "void"})
    for id_ in (a, b):
        p = await _get(raw, id_)
        assert p["Pr_State"] == "on_hold"
        assert p["Hold_Reason"] == "SO voided in Books"
        assert p["Pr_Category"] == "blocked"
    assert (await _get(raw, other))["Pr_State"] != "on_hold"
    assert "pr.held" in await _events(raw, a)


# Node: 'the queue: oldest Sales Order first inside a category, impossible = Act now, blocked has its reason (SE-1..5)'
@pytest.mark.asyncio
async def test_queue_orders_oldest_first_impossible_is_act_now_blocked_has_reason(raw, store):
    s = await _supplier(raw, "Steady")
    q = [quote(s, "Steady", 80, 20)]
    young = await _pr(raw, store, so="SO-NEW", so_days=-3, target=20, quotes=q)
    old = await _pr(raw, store, so="SO-OLD", so_days=-50, target=20, quotes=q)
    calm = await _pr(raw, store, so="SO-CALM", so_days=-90, target=200, quotes=[{**quote(s, "Steady", 80, 20), "Selected": True, "Final_Price": 80}])
    open_id = await _pr(raw, store, so="SO-OPEN", so_days=-10, target=80)  # no quote at all
    y, o, c, n = await _get(raw, young), await _get(raw, old), await _get(raw, calm), await _get(raw, open_id)
    assert y["Pr_Category"] == "act_now"
    assert o["Pr_Category"] == "act_now"
    assert int(o["Queue_Rank"]) < int(y["Queue_Rank"]), "the older order is first"
    assert c["Pr_Category"] == "on_track"
    assert n["Pr_Category"] == "blocked"
    assert "no supplier selected" in n["Blocked_Reason"] or "no price" in n["Blocked_Reason"]
    assert "SO dated" in o["Priority_Reason"]
    assert o["Suggested_Action"]
