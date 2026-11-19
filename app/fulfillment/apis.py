# Fulfillment custom APIs. Ported from server/modules/fulfillment/apis.mjs. check_payment_status
# and create_package_ff are still "not ported yet" in Node itself (confirmed: apis.mjs's withPlaceholders
# never implements them either) -- neither is registered here, so app.custom_apis.invoke_custom_api
# answers both with the standard "not ported yet" message, exactly matching Node's current state.
from app.custom_apis import CUSTOM_APIS
from app.fulfillment.sorter import rescore_all
from app.fulfillment.pipeline import all_picked_for_package


# Manual "Recalculate" trigger for the sorting engine (spec §05/01 §6). Not a Deluge port -- new in
# this system -- so it has no "not ported yet" counterpart.
async def recalculate_fulfillment_queue(payload: dict, store, ctx: dict) -> dict:
    result = await rescore_all(store)
    return {"status": "success", **result}


CUSTOM_APIS["recalculate_fulfillment_queue"] = recalculate_fulfillment_queue


# Tells the Pick widget, right after a Mark Picked save, whether the whole package is now picked
# and still needs a real box count (PKG-R3). Also new, not a Deluge port.
async def package_pick_status(payload: dict, store, ctx: dict) -> dict:
    so, pkg = payload["so"], payload["pkg"]
    all_picked = await all_picked_for_package(store, so, pkg)
    if not all_picked:
        return {"status": "success", "allPicked": False, "needsBoxCount": False}
    rows = await store.find("Sales_Order_Fulfillment", lambda r: r.get("SO_No") == so and r.get("Package") == pkg)
    sof = rows[0] if rows else None
    needs_box_count = not (sof and sof.get("Box_Count_Source") == "counted" and sof.get("Box_Count"))
    return {"status": "success", "allPicked": True, "needsBoxCount": needs_box_count}


CUSTOM_APIS["package_pick_status"] = package_pick_status
