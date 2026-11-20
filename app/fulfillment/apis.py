# Fulfillment custom APIs. Ported from server/modules/fulfillment/apis.mjs.
# The three APIs the Fulfillment widgets call that need Zoho Books are registered below as PLACEHOLDERS (Books is on hold, owner decision
# 2026-11-19): they answer in the same shape as any API that is not ported yet ({"status": "error", "message": ...}), so the widget shows a
# clear message instead of failing in the dark. The real versions are written when Books is connected.
#   check_payment_status  (Order Readiness)                      create_package_ff  (Pre-Order, Sales Order Report)
#   add_item_by_id        (Transfer Item; Procurement's books-apis in Node)
from app.custom_apis import CUSTOM_APIS
from app.fulfillment.sorter import capacity_summary, ranking_status, rescore_all
from app.fulfillment.pipeline import all_picked_for_package


# Manual "Recalculate" trigger for the sorting engine (spec §05/01 §6). Not a Deluge port -- new in
# this system -- so it has no "not ported yet" counterpart.
async def recalculate_fulfillment_queue(payload: dict, store, ctx: dict) -> dict:
    result = await rescore_all(store, trigger="manual")
    return {"status": "success", **result}


CUSTOM_APIS["recalculate_fulfillment_queue"] = recalculate_fulfillment_queue


# The "ranking is stale" banner on every queue screen (spec 05 / 01 section 6): stale when nothing was scored for 26 hours.
async def ranking_status_api(payload: dict, store, ctx: dict) -> dict:
    return {"status": "success", **await ranking_status(store)}


CUSTOM_APIS["ranking_status"] = ranking_status_api


# The capacity bar and the crew sizing line of the Order Readiness screen (read only).
async def capacity_summary_api(payload: dict, store, ctx: dict) -> dict:
    days = int(payload.get("days") or 3) if isinstance(payload, dict) else 3
    return {"status": "success", **await capacity_summary(store, days=max(1, days))}


CUSTOM_APIS["capacity_summary"] = capacity_summary_api


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


def _waiting_for_books(name: str):
    async def placeholder(payload: dict, store, ctx: dict) -> dict:
        return {"status": "error", "message": f'"{name}" is not ported yet (it needs Zoho Books, which is on hold).'}
    return placeholder


for _name in ("check_payment_status", "add_item_by_id"):
    CUSTOM_APIS[_name] = _waiting_for_books(_name)


# The Pre-Order and Sales Order Report widgets read `data.results`, one entry per record id they sent (recordIdsCsv), and show that entry's
# message; without it they only said "Create Package failed." (found in the browser 2026-11-20).
async def _create_package_waiting_for_books(payload: dict, store, ctx: dict) -> dict:
    message = '"create_package_ff" is not ported yet (it needs Zoho Books, which is on hold).'
    ids = [i.strip() for i in str((payload or {}).get("recordIdsCsv") or "").split(",") if i.strip()]
    return {"status": "error", "message": message, "results": [{"recordId": i, "status": "error", "message": message} for i in ids]}


CUSTOM_APIS["create_package_ff"] = _create_package_waiting_for_books
