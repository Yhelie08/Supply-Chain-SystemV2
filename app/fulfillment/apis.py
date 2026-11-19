# Fulfillment custom APIs. Ported from server/modules/fulfillment/apis.mjs. check_payment_status
# and create_package_ff are still "not ported yet" in Node itself (confirmed: apis.mjs's withPlaceholders
# never implements them either) -- neither is registered here, so app.custom_apis.invoke_custom_api
# answers both with the standard "not ported yet" message, exactly matching Node's current state.
from app.custom_apis import CUSTOM_APIS
from app.fulfillment.sorter import rescore_all


# Manual "Recalculate" trigger for the sorting engine (spec §05/01 §6). Not a Deluge port -- new in
# this system -- so it has no "not ported yet" counterpart.
async def recalculate_fulfillment_queue(payload: dict, store, ctx: dict) -> dict:
    result = await rescore_all(store)
    return {"status": "success", **result}


CUSTOM_APIS["recalculate_fulfillment_queue"] = recalculate_fulfillment_queue
