import pytest
import re
from app.deluge import id_of


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def _seed_shipment(raw, **extra):
    po = await raw.add_record("Purchase_Order", {"PO_No": "PO-00001", "Customer": "ACME"})
    ship = await raw.add_record("Shipments", {
        "Shipment_No": "SHP-00001", "PO_No": po, "Sales_Order": "SO-1", "Customer": "ACME", "Supplier": "Tony",
        "Shipment_Status": "In Transit", "Sales_Owner": "HC Sales 1",
        "PO_Shipments": [
            {"PR_No": "PR-1", "SKU": "L-1", "Item_Name": "Lamp", "Shipment_QTY": 3, "Shipping_Mode": "Sea"},
            {"PR_No": "PR-2", "SKU": "S-1", "Item_Name": "Switch", "Shipment_QTY": 2, "Shipping_Mode": "Sea"},
        ],
        **extra,
    })
    return po, ship


# Node: 'create_receiving_from_shipment builds RCV with lines from the shipment'
@pytest.mark.asyncio
async def test_create_receiving_from_shipment_builds_rcv_with_shipment_lines(raw):
    from app.custom_apis import invoke_custom_api
    import app.procurement.receiving_buttons  # noqa: F401
    _, ship = await _seed_shipment(raw)
    out = await invoke_custom_api("create_receiving_from_shipment", {"shipmentId": ship}, raw, {"user": "tester@homecartel.com"})
    assert out["status"] == "success"
    assert re.match(r"^RCV-\d{5}$", out["receiveNo"])
    r = await raw.get_record_by_id("Receiving", out["receivingId"], raw=True)
    assert r["Receive_No1"] == out["receiveNo"]
    assert id_of(r["Shipments"]) == str(ship)
    assert len(r["Receiving_Line_Items"]) == 2
    assert [int(float(l["Expected_Qty"])) for l in r["Receiving_Line_Items"]] == [3, 2]
    assert all(l["Bin_location"] == "Receiving Area" for l in r["Receiving_Line_Items"])
    assert (await raw.get_record_by_id("Shipments", ship, raw=True))["Receiving_Record_Created"] is True


# Node: 'second call for the same shipment returns already, no duplicate'
@pytest.mark.asyncio
async def test_second_call_for_same_shipment_returns_already_no_duplicate(raw):
    from app.custom_apis import invoke_custom_api
    import app.procurement.receiving_buttons  # noqa: F401
    _, ship = await _seed_shipment(raw)
    first = await invoke_custom_api("create_receiving_from_shipment", {"shipmentId": ship}, raw, {"user": "tester@homecartel.com"})
    second = await invoke_custom_api("create_receiving_from_shipment", {"shipmentId": ship}, raw, {"user": "tester@homecartel.com"})
    assert second["status"] == "already"
    assert str(second["receivingId"]) == str(first["receivingId"])
    assert len(await raw.find("Receiving")) == 1


# Node: 'unknown shipment id returns error'
@pytest.mark.asyncio
async def test_unknown_shipment_id_returns_error(raw):
    from app.custom_apis import invoke_custom_api
    import app.procurement.receiving_buttons  # noqa: F401
    out = await invoke_custom_api("create_receiving_from_shipment", {"shipmentId": "4662244000099999999"}, raw, {"user": "tester@homecartel.com"})
    assert out["status"] == "error"
    assert "Shipment not found" in out["message"]
