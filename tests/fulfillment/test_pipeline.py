# Fulfillment pipeline, first part (app/fulfillment/pipeline.py), with the hooked store: paid +
# package -> Order Readiness (one Gate record per item). Release -> Pick -> Mark Picked -> Pack & QC.
import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment.workflows  # noqa: F401
import app.fulfillment.pipeline as pipeline

SOF, GATE, PICK, QC = "Sales_Order_Fulfillment", "Sales_Order_Readiness_Gate", "Pick1", "Checker_Checklist"
LAMP = {"Item": "Lamp", "SKU": "L-1", "Quantity": "2", "Bin_Location": "A-01"}
SHADE = {"Item": "Shade", "SKU": "S-1", "Quantity": "4", "Bin_Location": "B-02"}


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _add_package(hooked_store, raw_store, extra=None):
    extra = extra or {}
    customer = await raw_store.add_record("Customer", {"customer_name": "Sample Customer"})
    return await hooked_store.add_record(SOF, {
        "SO_No": "SO-1", "Fulfillment_Stage": "Waiting For Package", "Package": "PAC-1", "Status": "Yes", "Customer": customer,
        "Customer_Type": "Corporate", "Delivery_Type": "Delivery Only", "order_type": "Normal", "Shipping_Address": "1 Main St",
        "Item_Details1": [LAMP, SHADE], **extra,
    })


async def _sof(raw_store, id_):
    return await raw_store.get_record_by_id(SOF, id_, raw=True)


async def _rows(raw_store, form):
    return await raw_store.find(form)


@pytest.mark.asyncio
async def test_paid_plus_package_order_readiness_and_one_gate_record_per_item(hooked_store, raw_store):
    id_ = await _add_package(hooked_store, raw_store)
    assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == "Order Readiness"
    gate = await _rows(raw_store, GATE)
    assert sorted(g["SKU"] for g in gate) == ["L-1", "S-1"]
    g = next(r for r in gate if r["SKU"] == "L-1")
    assert (g["sales_order_number"], g["Package_Order"], g["payment_status"], g["customer_name"], g["customer_address"], g["Quantity"], g["Bin_Location"]) == (
        "SO-1", "PAC-1", "Yes", "Sample Customer", "1 Main St", "2", "A-01",
    )


@pytest.mark.asyncio
async def test_a_package_number_is_enough_for_the_gate_paid_or_not_no_package_waits(hooked_store, raw_store):
    for extra in [{"Status": "No"}, {"Status": "Partial"}, {"Package": ""}]:
        for form in (SOF, GATE):
            for r in await raw_store.find(form):
                await raw_store.delete_record(form, r["ID"])
        id_ = await _add_package(hooked_store, raw_store, extra)
        expect_stage = "Waiting For Package" if extra.get("Package") == "" else "Need Approval"
        assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == expect_stage, extra
        expect_gates = 0 if extra.get("Package") == "" else 2
        assert len(await _rows(raw_store, GATE)) == expect_gates, extra


@pytest.mark.asyncio
async def test_paying_later_updates_the_gate_records_saving_again_does_not_duplicate(hooked_store, raw_store):
    id_ = await _add_package(hooked_store, raw_store, {"Status": "No"})
    assert [g["payment_status"] for g in await _rows(raw_store, GATE)] == ["No", "No"]
    await hooked_store.update_record(SOF, id_, {"Status": "Yes"}, by_form=True)
    assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == "Order Readiness"
    assert [g["payment_status"] for g in await _rows(raw_store, GATE)] == ["Yes", "Yes"]
    await hooked_store.update_record(SOF, id_, {"Shipping_Address": "2 Side St"}, by_form=True)
    gate = await _rows(raw_store, GATE)
    assert len(gate) == 2
    assert all(g["customer_address"] == "2 Side St" for g in gate)


@pytest.mark.asyncio
async def test_release_creates_pick1_and_notification_package_is_in_picking(hooked_store, raw_store):
    id_ = await _add_package(hooked_store, raw_store)
    lamp_gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    await hooked_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    picks = await _rows(raw_store, PICK)
    assert len(picks) == 1
    assert (picks[0]["SKU"], picks[0]["SO"], picks[0]["Picker"], picks[0]["Quantity_to_Pick"], picks[0]["Package_Order"], picks[0]["Customer_Name"]) == (
        "L-1", "SO-1", "Hendel", "2", "PAC-1", "Sample Customer",
    )
    assert len(await _rows(raw_store, "Pick_Notifications")) == 1
    assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == "Picking"


@pytest.mark.asyncio
async def test_saving_a_released_gate_again_updates_pick1_never_duplicates(hooked_store, raw_store):
    await _add_package(hooked_store, raw_store)
    lamp_gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    await hooked_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    await hooked_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Jayvon"}, by_form=True)
    picks = await _rows(raw_store, PICK)
    assert len(picks) == 1
    assert picks[0]["Picker"] == "Jayvon"
    assert len(await _rows(raw_store, "Pick_Notifications")) == 1


@pytest.mark.asyncio
async def test_a_package_further_along_is_not_pulled_back_releasing_alone_creates_no_qc(hooked_store, raw_store):
    id_ = await _add_package(hooked_store, raw_store)
    lamp_gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    await hooked_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    await hooked_store.update_record(SOF, id_, {"Fulfillment_Stage": "Pack & QC"}, by_form=True)
    await hooked_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Kurt"}, by_form=True)
    assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == "Pack & QC"
    assert await _rows(raw_store, QC) == []


@pytest.mark.asyncio
async def test_values_copy_unchanged_so_to_readiness_to_pick(hooked_store, raw_store):
    id_ = await _add_package(hooked_store, raw_store, {
        "SO_No": "SO-16468", "PR_No": "PR-0042", "RR_No": "RR-0007", "order_type": "Pre Order", "Delivery_Type": "Delivery and Installation",
        "For_Crate": True, "target_delivery_date": "2026-12-05", "Billing_Address": "9 Bill St", "Shipping_Address": "",
        "Forecast_Delivery": "2026-11-30", "Forecast_Window": "Nov 28 - Dec 2", "Forecast_Status": "At Risk",
    })
    sof_row = await _sof(raw_store, id_)
    assert sof_row["Forecast_Delivery"]  # the Instant Forecast hooks recompute it; checked for presence, not the literal
    gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    assert (gate["sales_order_number"], gate["pr_number"], gate["rr_number"], gate["Package_Order"], gate["Order_Type"], gate["Delivery_Type"]) == (
        sof_row["SO_No"], sof_row["PR_No"], sof_row["RR_No"], sof_row["Package"], sof_row["order_type"], sof_row["Delivery_Type"],
    )
    assert (gate["customer_address"], gate["Item_Name"], gate["Quantity"], gate["Bin_Location"]) == ("9 Bill St", "Lamp", "2", "A-01")

    await hooked_store.update_record(GATE, gate["ID"], {"Demo": "DEMO-9", "Assign_Picker": "Hendel", "Release": True}, by_form=True)
    gate_now = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    pick = (await _rows(raw_store, PICK))[0]
    assert (pick["SO"], pick["PR_if_any"], pick["RR"], pick["Demo"], pick["Package_Order"], pick["Order_Type"], pick["Delivery_Type"]) == (
        "SO-16468", "PR-0042", "RR-0007", "DEMO-9", "PAC-1", "Pre Order", "Delivery and Installation",
    )
    assert (pick["Customer_Name"], pick["Customer_Type"], pick["Customer_Address"], pick["Item_Name"], pick["SKU"], pick["Quantity_to_Pick"], pick["Bin_Location"]) == (
        "Sample Customer", "Corporate", "9 Bill St", "Lamp", "L-1", "2", "A-01",
    )
    assert (pick["Forecast_Delivery"], pick["Forecast_Window"], pick["Forecast_Status"]) == (gate_now["Forecast_Delivery"], gate_now["Forecast_Window"], gate_now["Forecast_Status"])


@pytest.mark.asyncio
async def test_a_later_sof_save_never_blanks_customer_or_forecast_on_gate_and_pick(hooked_store, raw_store):
    id_ = await _add_package(hooked_store, raw_store, {"Forecast_Delivery": "2026-11-30", "Forecast_Window": "Nov 28 - Dec 2", "Forecast_Status": "On Track"})
    lamp_gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    await hooked_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    for c in await raw_store.find("Customer"):
        await raw_store.delete_record("Customer", c["ID"])
    await hooked_store.update_record(SOF, id_, {"Shipping_Address": "", "Billing_Address": "", "Forecast_Delivery": "", "Forecast_Window": "", "Forecast_Status": "", "Status": "Yes"}, by_form=True)
    after = await _sof(raw_store, id_)
    gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    assert (gate["customer_name"], gate["customer_address"]) == ("Sample Customer", "1 Main St")
    assert gate["Forecast_Delivery"]
    assert gate["Forecast_Delivery"] == after["Forecast_Delivery"]
    pick = (await _rows(raw_store, PICK))[0]
    assert (pick["Customer_Name"], pick["Customer_Address"]) == ("Sample Customer", "1 Main St")
    assert pick["Forecast_Status"] == after["Forecast_Status"]


async def _to_pick(hooked_store, raw_store, extra=None):
    id_ = await _add_package(hooked_store, raw_store, extra)
    lamp_gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    await hooked_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    pick = (await _rows(raw_store, PICK))[0]
    return id_, pick


@pytest.mark.asyncio
async def test_mark_picked_creates_one_pending_qc_record_package_in_pack_qc(hooked_store, raw_store):
    id_, pick = await _to_pick(hooked_store, raw_store, {"PR_No": "PR-0042", "RR_No": "RR-0007", "target_delivery_date": "2026-12-05", "Forecast_Delivery": "2026-11-30", "Forecast_Window": "Nov 28 - Dec 2", "Forecast_Status": "At Risk"})
    assert await _rows(raw_store, QC) == []
    await hooked_store.update_record(PICK, pick["ID"], {"Marked": True}, by_form=True)
    qc = await _rows(raw_store, QC)
    assert len(qc) == 1
    assert (qc[0]["SO"], qc[0]["PAC"], qc[0]["PR"], qc[0]["RR"], qc[0]["SKU"], qc[0]["Item_Name"], qc[0]["Quantity"], qc[0]["Bin_Location"], qc[0]["Target_Delivery_Date"], qc[0]["Customer_Name"], qc[0]["Customer_Address"]) == (
        "SO-1", "PAC-1", "PR-0042", "RR-0007", "L-1", "Lamp", "2", "A-01", "2026-12-05", "Sample Customer", "1 Main St",
    )
    assert (qc[0]["QC_Status"], qc[0]["Quality_Checker"]) == ("", "")
    assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == "Pack & QC"
    assert len(await raw_store.get_records("All_Qc_Reports1")) == 1


@pytest.mark.asyncio
async def test_marking_again_updates_pending_qc_approved_is_history_new_pick_gets_its_own(hooked_store, raw_store):
    _, pick = await _to_pick(hooked_store, raw_store)
    await hooked_store.update_record(PICK, pick["ID"], {"Marked": True}, by_form=True)
    await hooked_store.update_record(PICK, pick["ID"], {"Bin_Location": "A-02"}, by_form=True)
    qc = await _rows(raw_store, QC)
    assert len(qc) == 1
    assert qc[0]["Bin_Location"] == "A-02"
    await hooked_store.update_record(QC, qc[0]["ID"], {"QC_Status": "Approved"}, by_form=True)
    await hooked_store.update_record(PICK, pick["ID"], {"Quantity_to_Pick": "3"}, by_form=True)
    qc = await _rows(raw_store, QC)
    assert len(qc) == 2


@pytest.mark.asyncio
async def test_an_unmarked_pick_save_adds_no_qc_further_along_is_not_pulled_back(hooked_store, raw_store):
    id_, pick = await _to_pick(hooked_store, raw_store)
    await hooked_store.update_record(PICK, pick["ID"], {"Picker": "Kurt"}, by_form=True)
    assert await _rows(raw_store, QC) == []
    assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == "Picking"
    await hooked_store.update_record(PICK, pick["ID"], {"Marked": True}, by_form=True)
    await hooked_store.update_record(PICK, pick["ID"], {"Marked": False}, by_form=True)
    assert (await _sof(raw_store, id_))["Fulfillment_Stage"] == "Pack & QC"


@pytest.mark.asyncio
async def test_reconcile_data_written_with_no_hook_is_carried_all_the_way(raw_store):
    customer = await raw_store.add_record("Customer", {"customer_name": "Sample Customer", "Email": "c@example.test", "Phone_Number": "+63 900 000 0000", "Billing_Address": {"district_city": "Makati"}})
    paid = await raw_store.add_record(SOF, {"SO_No": "SO-7", "Fulfillment_Stage": "Waiting For Package", "Package": "PAC-7", "Status": "Yes", "Customer": customer, "Customer_Type": "Corporate", "order_type": "Normal", "Delivery_Type": "Delivery Only", "Item_Details1": [LAMP, SHADE], "PR_No": "PR-7"})
    unpaid = await raw_store.add_record(SOF, {"SO_No": "SO-8", "Fulfillment_Stage": "Waiting For Package", "Package": "PAC-8", "Status": "Partial", "Customer": customer, "Item_Details1": [LAMP]})
    no_package = await raw_store.add_record(SOF, {"SO_No": "SO-9", "Fulfillment_Stage": "Waiting For Package", "Package": "", "Status": "Yes", "Customer": customer, "Item_Details1": [LAMP]})

    done = await pipeline.reconcile_fulfillment(raw_store)
    assert done["gate"] == 2
    assert len(await _rows(raw_store, GATE)) == 3
    assert (await _sof(raw_store, paid))["Fulfillment_Stage"] == "Order Readiness"
    assert (await _sof(raw_store, unpaid))["Fulfillment_Stage"] == "Need Approval"
    assert (await _sof(raw_store, no_package))["Fulfillment_Stage"] == "Waiting For Package"

    lamp_gate = next(g for g in await _rows(raw_store, GATE) if g["SKU"] == "L-1")
    await raw_store.update_record(GATE, lamp_gate["ID"], {"Assign_Picker": "Hendel", "Release": True}, by_form=True)
    done = await pipeline.reconcile_fulfillment(raw_store)
    assert done["pick"] == 1
    assert len(await _rows(raw_store, PICK)) == 1
    assert (await _sof(raw_store, paid))["Fulfillment_Stage"] == "Picking"

    pick = (await _rows(raw_store, PICK))[0]
    await raw_store.update_record(PICK, pick["ID"], {"Marked": True}, by_form=True)
    done = await pipeline.reconcile_fulfillment(raw_store)
    assert done["qc"] == 1
    qc = (await _rows(raw_store, QC))[0]
    assert (qc["SO"], qc["PAC"], qc["PR"], qc["SKU"], qc["Quantity"], qc["Customer_Name"], qc["City"], qc["Email"], qc["Contact"]) == (
        "SO-7", "PAC-7", "PR-7", "L-1", "2", "Sample Customer", "Makati", "c@example.test", "+63 900 000 0000",
    )
    assert (await _sof(raw_store, paid))["Fulfillment_Stage"] == "Pack & QC"

    assert await pipeline.reconcile_fulfillment(raw_store) == {"gate": 0, "pick": 0, "qc": 0, "stage": 0}


@pytest.mark.asyncio
async def test_all_picked_for_package_false_until_every_row_marked(hooked_store, raw_store):
    await _add_package(hooked_store, raw_store)
    gates = await _rows(raw_store, GATE)
    for g in gates:
        await hooked_store.update_record(GATE, g["ID"], {"Release": True, "Assign_Picker": "Ana"}, by_form=True)
    picks = await _rows(raw_store, PICK)
    assert len(picks) == 2
    assert await pipeline.all_picked_for_package(raw_store, "SO-1", "PAC-1") is False
    await hooked_store.update_record(PICK, picks[0]["ID"], {"Marked": True}, by_form=True)
    assert await pipeline.all_picked_for_package(raw_store, "SO-1", "PAC-1") is False
    await hooked_store.update_record(PICK, picks[1]["ID"], {"Marked": True}, by_form=True)
    assert await pipeline.all_picked_for_package(raw_store, "SO-1", "PAC-1") is True
