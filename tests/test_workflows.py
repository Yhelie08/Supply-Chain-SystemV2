import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import register, create_hooked_store, WORKFLOWS


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture(autouse=True)
def clear_workflows():
    WORKFLOWS.clear()
    yield
    WORKFLOWS.clear()


@pytest.mark.asyncio
async def test_after_add_hook_fires_with_the_record_and_raw_store(raw_store):
    seen = {}

    async def on_add(args):
        seen["record"] = args["record"]
        seen["store_is_raw"] = args["store"] is raw_store

    register("Sales_Order_Fulfillment", {"afterAdd": on_add})
    hooked = create_hooked_store(raw_store)
    await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-HOOK"})
    assert seen["record"]["SO_No"] == "SO-HOOK"
    assert seen["store_is_raw"] is True  # the hook must receive the UNHOOKED store (re-entrancy safety)


@pytest.mark.asyncio
async def test_after_update_hook_receives_both_record_and_previous(raw_store):
    seen = {}

    async def on_update(args):
        seen["previous_stage"] = args["previous"]["Fulfillment_Stage"]
        seen["new_stage"] = args["record"]["Fulfillment_Stage"]

    register("Sales_Order_Fulfillment", {"afterUpdate": on_update})
    hooked = create_hooked_store(raw_store)
    record_id = await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-HOOK2", "Fulfillment_Stage": "Waiting For Package"})
    await hooked.update_record("Sales_Order_Fulfillment", record_id, {"Fulfillment_Stage": "Order Readiness"}, by_form=True)
    assert seen["previous_stage"] == "Waiting For Package"
    assert seen["new_stage"] == "Order Readiness"


@pytest.mark.asyncio
async def test_a_hooks_own_write_never_retriggers_the_same_hook(raw_store):
    call_count = {"n": 0}

    async def on_update(args):
        call_count["n"] += 1
        # writes through the RAW store it was given -- must not re-enter this same hook
        await args["store"].update_record("Sales_Order_Fulfillment", args["id"], {"Package": "SET-BY-HOOK"}, by_form=True)

    register("Sales_Order_Fulfillment", {"afterUpdate": on_update})
    hooked = create_hooked_store(raw_store)
    record_id = await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-HOOK3"})
    await hooked.update_record("Sales_Order_Fulfillment", record_id, {"Fulfillment_Stage": "Picking"}, by_form=True)
    assert call_count["n"] == 1  # not 2+ -- the hook's own write through raw_store did not re-fire itself


@pytest.mark.asyncio
async def test_registering_multiple_hooks_on_the_same_phase_runs_all_of_them(raw_store):
    order = []

    async def first(args):
        order.append("first")

    async def second(args):
        order.append("second")

    register("Sales_Order_Fulfillment", {"afterAdd": first})
    register("Sales_Order_Fulfillment", {"afterAdd": second})
    hooked = create_hooked_store(raw_store)
    await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-MULTI"})
    assert order == ["first", "second"]


@pytest.mark.asyncio
async def test_an_after_hook_exception_is_logged_and_swallowed_not_propagated(raw_store):
    # Confirmed from the Node source: afterAdd/afterUpdate/afterDelete run with { swallow: true } --
    # a throwing hook is caught and logged, the caller's own add_record call still succeeds.
    async def broken(args):
        raise ValueError("boom")

    register("Sales_Order_Fulfillment", {"afterAdd": broken})
    hooked = create_hooked_store(raw_store)
    record_id = await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-BROKEN"})
    assert record_id is not None  # the add itself succeeded despite the hook throwing


@pytest.mark.asyncio
async def test_a_before_add_hook_exception_prevents_the_write(raw_store):
    # beforeAdd/beforeUpdate/beforeDelete are NOT swallowed (confirmed from the Node source: no
    # { swallow: true } on those calls) -- a throwing before-hook must stop the write.
    async def refuse(args):
        raise ValueError("refused")

    register("Sales_Order_Fulfillment", {"beforeAdd": refuse})
    hooked = create_hooked_store(raw_store)
    with pytest.raises(ValueError):
        await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-REFUSED"})
    rows = await raw_store.find("Sales_Order_Fulfillment", lambda r: r["SO_No"] == "SO-REFUSED")
    assert rows == []


@pytest.mark.asyncio
async def test_a_before_add_hook_can_change_the_input_before_it_is_saved(raw_store):
    async def set_stage(args):
        args["input"]["Fulfillment_Stage"] = "Picking"

    register("Sales_Order_Fulfillment", {"beforeAdd": set_stage})
    hooked = create_hooked_store(raw_store)
    record_id = await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-CHANGED", "Fulfillment_Stage": "Waiting For Package"})
    rec = await raw_store.get_record_by_id("Sales_Order_Fulfillment", record_id, raw=True)
    assert rec["Fulfillment_Stage"] == "Picking"


@pytest.mark.asyncio
async def test_after_delete_hook_receives_the_previous_record(raw_store):
    seen = {}

    async def on_delete(args):
        seen["previous_so_no"] = args["previous"]["SO_No"]

    register("Sales_Order_Fulfillment", {"afterDelete": on_delete})
    hooked = create_hooked_store(raw_store)
    record_id = await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-TO-DELETE"})
    await hooked.delete_record("Sales_Order_Fulfillment", record_id)
    assert seen["previous_so_no"] == "SO-TO-DELETE"


@pytest.mark.asyncio
async def test_reads_pass_through_to_the_raw_store_untouched(raw_store):
    hooked = create_hooked_store(raw_store)
    record_id = await hooked.add_record("Sales_Order_Fulfillment", {"SO_No": "SO-READ"})
    rec = await hooked.get_record_by_id("Sales_Order_Fulfillment", record_id, raw=True)
    assert rec["SO_No"] == "SO-READ"
    rows = await hooked.find("Sales_Order_Fulfillment", lambda r: r["SO_No"] == "SO-READ")
    assert len(rows) == 1


def test_registering_an_unknown_phase_raises():
    with pytest.raises(ValueError):
        register("Sales_Order_Fulfillment", {"onLoad": lambda args: None})


def test_registering_a_form_that_does_not_exist_raises_zoho_error():
    from app.criteria import ZohoError
    with pytest.raises(ZohoError):
        register("Totally_Made_Up_Form", {"afterAdd": lambda args: None})
