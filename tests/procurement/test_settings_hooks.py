import pytest
from app.deluge import add_days, ymd, today_date

TODAY = today_date()
SPEC_ROWS = {"transit_lcl_min_days": 30, "transit_lcl_max_days": 30, "transit_fcl_min_days": 30, "transit_fcl_max_days": 30, "transit_air_min_days": 14, "transit_air_max_days": 14,
             "customs_lcl_min_days": 0, "customs_lcl_max_days": 0, "customs_fcl_min_days": 0, "customs_fcl_max_days": 0, "customs_air_min_days": 0, "customs_air_max_days": 0, "fulfillment_days": 3, "delivery_days": 2}
LINE = {"PR_No": "PR-1", "SKU": "L-1", "Item": "Lamp", "QTY": 2, "Supplier": "Tony Fan", "Line_Total": 10, "Shipping_Mode": "LCL"}


def day(n: int) -> str:
    return ymd(add_days(TODAY, n))


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    store = create_store(db_conn)
    for k, v in SPEC_ROWS.items():
        await store.add_record("Procurement_Settings", {"Setting_Key": k, "Value": str(v)})
    return store


@pytest.fixture
def store(raw):
    from app.workflows import create_hooked_store
    import app.procurement.receiving  # noqa: F401
    import app.procurement.ship_track  # noqa: F401
    import app.procurement.shipments  # noqa: F401
    import app.procurement.purchase_order  # noqa: F401
    import app.procurement.settings_hooks  # noqa: F401
    return create_hooked_store(raw)


async def _shipment(raw, store, *, po_days=-2, so="SO-1", target=70):
    po_id = await store.add_record("Purchase_Order", {"Customer": "C", "PO_Date": day(po_days), "PO_Line_Items": [LINE]})
    return await store.add_record("Shipments", {"PO_No": po_id, "Sales_Order": so, "Supplier": "Tony Fan", "Target_Date": day(target), "PO_Shipments": [{"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Ordered_QTY": 2, "Shipment_QTY": 2, "Shipping_Mode": "LCL"}]})


async def _row_of(raw, key):
    return (await raw.find("Procurement_Settings", lambda r: r.get("Setting_Key") == key))[0]


# Node: 'a setting row is validated: a typo outside the limits is refused with a plain message (CP-R6)'
@pytest.mark.asyncio
async def test_setting_row_validated_outside_limits_refused(raw, store, db_conn):
    from app.criteria import ZohoError
    await db_conn.execute('DELETE FROM "Procurement_Settings"')
    with pytest.raises(ZohoError, match=r"outside the allowed range \(1 to 200\)"):
        await store.add_record("Procurement_Settings", {"Setting_Key": "transit_lcl_max_days", "Value": "800"})
    with pytest.raises(ZohoError, match="enter a number"):
        await store.add_record("Procurement_Settings", {"Setting_Key": "transit_lcl_max_days", "Value": "abc"})
    with pytest.raises(ZohoError, match="not a Procurement setting"):
        await store.add_record("Procurement_Settings", {"Setting_Key": "nonsense", "Value": "3"})
    with pytest.raises(ZohoError, match="choose yes or no"):
        await store.add_record("Procurement_Settings", {"Setting_Key": "forecast_reanchor", "Value": "maybe"})
    assert len(await raw.find("Procurement_Settings")) == 0


# Node: 'the ladder days must keep going up (rung 1 < rung 2 < rung 3)'
@pytest.mark.asyncio
async def test_ladder_days_must_keep_going_up(raw, store):
    from app.criteria import ZohoError
    with pytest.raises(ZohoError, match="must go up"):
        await store.add_record("Procurement_Settings", {"Setting_Key": "ladder_rung1_days", "Value": "5"})


# Node: 'a change is written to the history with who, old, new, and what it did; a second row for the same key is refused'
@pytest.mark.asyncio
async def test_change_written_to_history_second_row_refused(raw, store):
    from app.criteria import ZohoError
    from app.procurement.plan import load_settings
    sh = await _shipment(raw, store, po_days=-1)
    before = (await raw.get_record_by_id("Shipments", sh, raw=True))["Arrival_Planned"]
    row = await _row_of(raw, "transit_lcl_max_days")  # the spec rows set it to 30
    with pytest.raises(ZohoError, match="already has a row"):
        await store.add_record("Procurement_Settings", {"Setting_Key": "transit_lcl_max_days", "Value": "40"})
    await store.update_record("Procurement_Settings", row["ID"], {"Value": "45", "Change_Reason": "new forwarder"}, user="admin@x")
    await store.update_record("Procurement_Settings", row["ID"], {"Value": "40"}, user="admin@x")
    h = sorted(await raw.find("Procurement_Settings_History"), key=lambda x: int(x["ID"]))
    assert [(x["Setting_Key"], x["Old_Value"], x["New_Value"]) for x in h] == [("transit_lcl_max_days", "30", "45"), ("transit_lcl_max_days", "45", "40")]
    assert h[0]["Changed_By"] == "admin@x"
    assert h[0]["Reason"] == "new forwarder"
    assert "re-scored" in h[0]["Effect"]
    # the new number is used by the plan the next time it is made: the middle of 30 and 40 days
    await store.update_record("Shipments", sh, {"Notes": "x"})
    assert (await raw.get_record_by_id("Shipments", sh, raw=True))["Arrival_Planned"] != before
    assert (await load_settings(raw))["transit_lcl_days"] == 35


# Node: 'the shortest transit cannot be more than the longest'
@pytest.mark.asyncio
async def test_shortest_transit_cannot_exceed_longest(raw, store):
    from app.criteria import ZohoError
    min_row = await _row_of(raw, "transit_lcl_min_days")
    with pytest.raises(ZohoError, match=r"shortest \(40\) cannot be more than the longest \(30\)"):
        await store.update_record("Procurement_Settings", min_row["ID"], {"Value": "40"})


# Node: 'deleting a row means the default again, and that is in the history too'
@pytest.mark.asyncio
async def test_deleting_row_reverts_to_default_and_logs_history(raw, store):
    from app.procurement.plan import load_settings
    id_ = await store.add_record("Procurement_Settings", {"Setting_Key": "receiving_days", "Value": "5"})
    await store.delete_record("Procurement_Settings", id_, user="admin@x")
    assert (await load_settings(raw))["receiving_days"] == 2
    h = await raw.find("Procurement_Settings_History", lambda x: x.get("Reason") == "Back to the default")
    assert len(h) == 1
    assert h[0]["New_Value"] == "2"


# Node: 'preview: shows how many open shipments would change category before anything is saved (CP-R4)'
@pytest.mark.asyncio
async def test_preview_setting_shows_effect_without_saving(raw, store):
    from app.procurement.settings_hooks import preview_procurement_setting
    from app.procurement.ship_track import rescore_shipments
    await _shipment(raw, store, po_days=-2, target=70)  # 11 days of slack at 30 days of LCL
    await rescore_shipments(raw)
    r = await preview_procurement_setting({"key": "transit_lcl_max_days", "value": 120}, raw)
    assert r["status"] == "success"
    assert r["moved_count"] == 1
    assert r["after"]["act_now"] == 1
    assert (await _row_of(raw, "transit_lcl_max_days"))["Value"] == "30", "nothing was saved"
    bad = await preview_procurement_setting({"key": "transit_lcl_max_days", "value": 900}, raw)
    assert bad["status"] == "error"
    assert "Fulfillment and Delivery too" in r["message"]


# Node: 'Recalculate now re-reads the dates and ranks everything'
@pytest.mark.asyncio
async def test_recalculate_shipments_rereads_and_ranks(raw, store):
    from app.procurement.settings_hooks import recalculate_shipments
    await _shipment(raw, store)
    r = await recalculate_shipments({}, raw)
    assert r["status"] == "success"
    assert r["scored"] == 1
