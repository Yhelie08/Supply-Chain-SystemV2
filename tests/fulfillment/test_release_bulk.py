# "Release selected" and "Release all suggested" on the Order Readiness screen (custom API release_gate_records, app/fulfillment/apis.py).
# The release itself is the one the single Release button does (Gate row: Assign_Picker + Release), so the Pick rows, the notification, the
# stage and the re-score all come from the same hooks; these tests prove the bulk rules around it.
# Spec v1.4 (03/02 OR-R4): "Releasing moves the PACKAGE to Pick", so BOTH modes work per package: choosing one item of a package releases all
# its items or none; and "Releasing over capacity shows the warning but is allowed" (preview + overCapacityBy).
import pytest

from app.custom_apis import CUSTOM_APIS
from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment  # noqa: F401  (wires every Fulfillment hook and API)
from app.fulfillment.sorter import rescore_all

SOF, GATE, PICK = "Sales_Order_Fulfillment", "Sales_Order_Readiness_Gate", "Pick1"
LAMP = {"Item": "Lamp", "SKU": "L-1", "Quantity": "2", "Bin_Location": "A-01"}
SHADE = {"Item": "Shade", "SKU": "S-1", "Quantity": "4", "Bin_Location": "B-02"}


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _package(hooked_store, raw_store, so="SO-1", items=(LAMP, SHADE), **extra):
    customer = await raw_store.add_record("Customer", {"customer_name": "Sample Customer"})
    return await hooked_store.add_record(SOF, {
        "SO_No": so, "Fulfillment_Stage": "Waiting For Package", "Package": f"PAC-{so}", "Status": "Yes", "Customer": customer,
        "Customer_Type": "Corporate", "Delivery_Type": "Delivery Only", "order_type": "Normal", "Shipping_Address": "1 Main St",
        "Contact_No": "0917 000 0000", "Item_Details1": list(items), **extra,
    })


async def _gates(raw_store, so="SO-1"):
    return sorted([g for g in await raw_store.find(GATE) if g["sales_order_number"] == so], key=lambda g: g["SKU"])


async def _release(raw_store, payload):
    return await CUSTOM_APIS["release_gate_records"](payload, raw_store, {"user": "tester"})


def _by_id(result):
    return {str(r["id"]): r for r in result["results"]}


async def _sof(raw_store, id_):
    return await raw_store.get_record_by_id(SOF, id_, raw=True)


# ---------- Release selected ----------
@pytest.mark.asyncio
async def test_selected_rows_are_released_with_the_default_picker(hooked_store, raw_store):
    sof = await _package(hooked_store, raw_store)
    gates = await _gates(raw_store)
    res = await _release(raw_store, {"mode": "selected", "ids": [g["ID"] for g in gates], "picker": "Hendel"})
    assert (res["status"], res["released"], res["skipped"]) == ("success", 2, 0)
    after = await _gates(raw_store)
    assert all(g["Release"] in (True, "true") and g["Assign_Picker"] == "Hendel" for g in after)
    picks = await raw_store.find(PICK)
    assert sorted(p["SKU"] for p in picks) == ["L-1", "S-1"] and {p["Picker"] for p in picks} == {"Hendel"}
    assert len(await raw_store.find("Pick_Notifications")) == 2
    assert (await _sof(raw_store, sof))["Fulfillment_Stage"] == "Picking"


@pytest.mark.asyncio
async def test_a_row_that_already_has_a_picker_keeps_it_the_default_only_fills_the_blanks(hooked_store, raw_store):
    await _package(hooked_store, raw_store)
    lamp, shade = await _gates(raw_store)
    await hooked_store.update_record(GATE, lamp["ID"], {"Assign_Picker": "Jazz"}, by_form=True)
    await _release(raw_store, {"mode": "selected", "ids": [lamp["ID"], shade["ID"]], "picker": "Hendel"})
    pickers = {g["SKU"]: g["Assign_Picker"] for g in await _gates(raw_store)}
    assert pickers == {"L-1": "Jazz", "S-1": "Hendel"}


@pytest.mark.asyncio
async def test_a_package_where_one_item_has_no_picker_and_no_default_is_left_alone_as_a_whole(hooked_store, raw_store):
    await _package(hooked_store, raw_store)
    lamp, shade = await _gates(raw_store)
    await hooked_store.update_record(GATE, lamp["ID"], {"Assign_Picker": "Jazz"}, by_form=True)
    res = await _release(raw_store, {"mode": "selected", "ids": [lamp["ID"], shade["ID"]]})
    by = _by_id(res)
    assert (res["released"], res["skipped"]) == (0, 2)
    assert "picker" in by[str(shade["ID"])]["reason"].lower()
    assert "picker" in by[str(lamp["ID"])]["reason"].lower()   # the item that has its picker is also not released: the package is not split
    assert all(g["Release"] not in (True, "true") for g in await _gates(raw_store))
    assert await raw_store.find(PICK) == []


@pytest.mark.asyncio
async def test_choosing_one_item_releases_the_whole_package(hooked_store, raw_store):
    sof = await _package(hooked_store, raw_store)
    lamp, shade = await _gates(raw_store)
    res = await _release(raw_store, {"mode": "selected", "ids": [lamp["ID"]], "picker": "Hendel"})
    assert (res["released"], res["skipped"]) == (2, 0)
    assert {r["sku"] for r in res["results"] if r["status"] == "released"} == {"L-1", "S-1"}
    assert sorted(p["SKU"] for p in await raw_store.find(PICK)) == ["L-1", "S-1"]
    assert (await _sof(raw_store, sof))["Fulfillment_Stage"] == "Picking"


@pytest.mark.asyncio
async def test_an_already_released_row_is_skipped_and_no_second_pick_is_made(hooked_store, raw_store):
    await _package(hooked_store, raw_store)
    lamp, shade = await _gates(raw_store)
    await hooked_store.update_record(GATE, lamp["ID"], {"Assign_Picker": "Jazz", "Release": True}, by_form=True)
    res = await _release(raw_store, {"mode": "selected", "ids": [lamp["ID"], shade["ID"]], "picker": "Hendel"})
    by = _by_id(res)
    assert by[str(lamp["ID"])]["status"] == "skipped" and "already" in by[str(lamp["ID"])]["reason"].lower()
    assert by[str(shade["ID"])]["status"] == "released"
    picks = await raw_store.find(PICK)
    assert sorted(p["SKU"] for p in picks) == ["L-1", "S-1"]
    assert {p["SKU"]: p["Picker"] for p in picks}["L-1"] == "Jazz"   # the already released row was not touched


@pytest.mark.asyncio
async def test_a_row_that_still_needs_payment_approval_is_not_released(hooked_store, raw_store):
    await _package(hooked_store, raw_store, Status="Partial")
    gates = await _gates(raw_store)
    res = await _release(raw_store, {"mode": "selected", "ids": [g["ID"] for g in gates], "picker": "Hendel"})
    assert (res["released"], res["skipped"]) == (0, 2)
    assert all("approval" in r["reason"].lower() for r in res["results"])
    assert all(g["Release"] not in (True, "true") for g in await _gates(raw_store))
    assert await raw_store.find(PICK) == []


@pytest.mark.asyncio
async def test_a_blocked_package_is_not_released_and_the_reason_is_given(hooked_store, raw_store):
    await _package(hooked_store, raw_store)
    await raw_store.add_record("Exception_Control1", {"Sales_Order": "SO-1", "SKU": "L-1", "PAC": "PAC-SO-1", "Item_Name": "Lamp", "Status": "Pending"})
    await rescore_all(raw_store)
    gates = await _gates(raw_store)
    res = await _release(raw_store, {"mode": "selected", "ids": [g["ID"] for g in gates], "picker": "Hendel"})
    assert (res["released"], res["skipped"]) == (0, 2)
    assert all("blocked" in r["reason"].lower() and "exception" in r["reason"].lower() for r in res["results"])
    assert await raw_store.find(PICK) == []


@pytest.mark.asyncio
async def test_an_unknown_id_is_reported_not_raised(hooked_store, raw_store):
    res = await _release(raw_store, {"mode": "selected", "ids": ["999999"], "picker": "Hendel"})
    assert (res["status"], res["released"], res["skipped"]) == ("success", 0, 1)
    assert res["results"][0]["status"] == "skipped" and "not found" in res["results"][0]["reason"].lower()


@pytest.mark.asyncio
async def test_ids_can_come_as_a_comma_separated_text_too(hooked_store, raw_store):
    await _package(hooked_store, raw_store)
    gates = await _gates(raw_store)
    res = await _release(raw_store, {"mode": "selected", "idsCsv": ",".join(str(g["ID"]) for g in gates), "picker": "Hendel"})
    assert res["released"] == 2


@pytest.mark.asyncio
async def test_a_bad_mode_or_no_ids_is_an_error_message_not_a_crash(hooked_store, raw_store):
    assert (await _release(raw_store, {"mode": "everything"}))["status"] == "error"
    assert (await _release(raw_store, {"mode": "selected", "ids": []}))["status"] == "error"
    assert (await _release(raw_store, {}))["status"] == "error"


# ---------- Release all suggested ----------
async def _suggested(raw_store, so):
    sof = next(s for s in await raw_store.find(SOF) if s["SO_No"] == so)
    return sof.get("Suggested_Release") in (True, "true")


@pytest.mark.asyncio
async def test_all_suggested_releases_every_item_of_each_suggested_package_and_nothing_else(hooked_store, raw_store):
    a = await _package(hooked_store, raw_store, so="SO-1")
    b = await _package(hooked_store, raw_store, so="SO-2")
    # SO-3 is not workable (no address): the sorter marks it blocked, so it is never suggested
    c = await _package(hooked_store, raw_store, so="SO-3", Shipping_Address="")
    assert await _suggested(raw_store, "SO-1") and await _suggested(raw_store, "SO-2") and not await _suggested(raw_store, "SO-3")
    res = await _release(raw_store, {"mode": "suggested", "picker": "Edwin"})
    assert (res["status"], res["released"], res["skipped"]) == ("success", 4, 0)
    assert {r["so"] for r in res["results"]} == {"SO-1", "SO-2"}
    assert (await _sof(raw_store, a))["Fulfillment_Stage"] == "Picking" and (await _sof(raw_store, b))["Fulfillment_Stage"] == "Picking"
    assert (await _sof(raw_store, c))["Fulfillment_Stage"] == "Order Readiness"
    assert all(g["Release"] not in (True, "true") for g in await _gates(raw_store, "SO-3"))
    assert len(await raw_store.find(PICK)) == 4


@pytest.mark.asyncio
async def test_all_suggested_never_releases_half_a_package(hooked_store, raw_store):
    await _package(hooked_store, raw_store, so="SO-1")
    await _package(hooked_store, raw_store, so="SO-2")
    # SO-1: one of its two items already has its own picker, the other has none; there is no default picker
    lamp, shade = await _gates(raw_store, "SO-1")
    await hooked_store.update_record(GATE, lamp["ID"], {"Assign_Picker": "Jazz"}, by_form=True)
    for g in await _gates(raw_store, "SO-2"):
        await hooked_store.update_record(GATE, g["ID"], {"Assign_Picker": "Hendel"}, by_form=True)
    res = await _release(raw_store, {"mode": "suggested"})
    assert (res["released"], res["skipped"]) == (2, 2)
    assert {r["so"] for r in res["results"] if r["status"] == "released"} == {"SO-2"}
    skipped = [r for r in res["results"] if r["status"] == "skipped"]
    assert {r["so"] for r in skipped} == {"SO-1"} and all("picker" in r["reason"].lower() for r in skipped)
    assert all(g["Release"] not in (True, "true") for g in await _gates(raw_store, "SO-1"))   # not even the item that had a picker
    assert {p["SO"] for p in await raw_store.find(PICK)} == {"SO-2"}


@pytest.mark.asyncio
async def test_all_suggested_with_nothing_suggested_is_a_clean_zero(hooked_store, raw_store):
    res = await _release(raw_store, {"mode": "suggested", "picker": "Edwin"})
    assert (res["status"], res["released"], res["skipped"], res["results"]) == ("success", 0, 0, [])


@pytest.mark.asyncio
async def test_all_suggested_does_not_touch_a_package_that_is_already_released(hooked_store, raw_store):
    await _package(hooked_store, raw_store, so="SO-1")
    for g in await _gates(raw_store, "SO-1"):
        await hooked_store.update_record(GATE, g["ID"], {"Assign_Picker": "Jazz", "Release": True}, by_form=True)
    before = await raw_store.find(PICK)
    res = await _release(raw_store, {"mode": "suggested", "picker": "Edwin"})
    assert (res["released"], res["skipped"]) == (0, 0)
    assert [p["ID"] for p in await raw_store.find(PICK)] == [p["ID"] for p in before]


# ---------- the warning (OR-R4): over capacity is allowed, and said ----------
async def _tiny_capacity(raw_store):
    from datetime import date
    await raw_store.add_record("Capacity_Days", {"Date": date.today().strftime("%Y-%m-%d"), "People": "1", "Boxes_Per_Hour": "1", "Hours_Per_Day": "1"})   # 1 box today


@pytest.mark.asyncio
async def test_a_preview_writes_nothing_and_says_what_would_happen_and_how_far_over_capacity(hooked_store, raw_store):
    await _tiny_capacity(raw_store)
    await _package(hooked_store, raw_store)   # 2 + 4 = 6 boxes (estimated)
    res = await _release(raw_store, {"mode": "suggested", "picker": "Hendel", "preview": True})
    assert (res["status"], res["preview"], res["wouldRelease"], res["released"]) == ("success", True, 2, 0)
    assert {r["status"] for r in res["results"]} == {"would_release"}
    assert (res["boxes"], res["capacityBoxes"], res["overCapacityBy"]) == (6, 1, 5)
    assert "over capacity by 5" in res["warning"].lower() and "allowed" in res["warning"].lower()
    assert all(g["Release"] not in (True, "true") for g in await _gates(raw_store))   # nothing was written
    assert await raw_store.find(PICK) == []


@pytest.mark.asyncio
async def test_releasing_over_capacity_is_allowed_and_the_answer_carries_the_warning(hooked_store, raw_store):
    await _tiny_capacity(raw_store)
    await _package(hooked_store, raw_store)
    res = await _release(raw_store, {"mode": "suggested", "picker": "Hendel"})
    assert (res["released"], res["skipped"]) == (2, 0)
    assert (res["boxes"], res["overCapacityBy"]) == (6, 5)
    assert "over capacity by 5" in res["warning"].lower()
    assert len(await raw_store.find(PICK)) == 2


@pytest.mark.asyncio
async def test_inside_capacity_there_is_no_warning(hooked_store, raw_store):
    await _package(hooked_store, raw_store)   # the default capacity is far above 6 boxes
    res = await _release(raw_store, {"mode": "suggested", "picker": "Hendel", "preview": True})
    assert (res["overCapacityBy"], res["warning"]) == (0, "")


@pytest.mark.asyncio
async def test_no_warning_when_nothing_would_be_released_and_numbers_are_whole(hooked_store, raw_store):
    # found in the browser 2026-11-20: "over capacity by 6.0 boxes" was shown even when this release adds nothing
    await _tiny_capacity(raw_store)
    await _package(hooked_store, raw_store)
    res = await _release(raw_store, {"mode": "suggested", "preview": True})   # no picker: nothing would be released
    assert res["wouldRelease"] == 0 and res["warning"] == ""
    ok = await _release(raw_store, {"mode": "suggested", "picker": "Hendel", "preview": True})
    for key in ("boxes", "capacityBoxes", "overCapacityBy"):
        assert isinstance(ok[key], int), (key, ok[key])   # 6, not 6.0
    assert "over capacity by 5 boxes" in ok["warning"]


@pytest.mark.asyncio
async def test_a_preview_reports_the_skips_before_anything_is_confirmed(hooked_store, raw_store):
    await _package(hooked_store, raw_store)
    res = await _release(raw_store, {"mode": "suggested", "preview": True})   # no picker given and none assigned
    assert (res["wouldRelease"], res["skipped"]) == (0, 2)
    assert all("picker" in r["reason"].lower() for r in res["results"])


@pytest.mark.asyncio
async def test_the_blocked_mark_is_refreshed_first_so_an_old_mark_does_not_refuse(hooked_store, raw_store):
    await _package(hooked_store, raw_store)
    exc = await raw_store.add_record("Exception_Control1", {"Sales_Order": "SO-1", "SKU": "L-1", "PAC": "PAC-SO-1", "Item_Name": "Lamp", "Status": "Pending"})
    await rescore_all(raw_store)
    await raw_store.update_record("Exception_Control1", exc, {"Status": "Completed"}, by_form=True)   # raw write: the mark on the package is old now
    gates = await _gates(raw_store)
    res = await _release(raw_store, {"mode": "selected", "ids": [g["ID"] for g in gates], "picker": "Hendel"})
    assert (res["released"], res["skipped"]) == (2, 0)
