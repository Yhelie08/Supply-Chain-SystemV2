# The single Release refuses a Blocked package (spec v1.4, 03 Fulfillment / 02 Order Readiness: OR-R1 "a package is Blocked (not in the work
# list) when payment is not cleared, items are not available, the delivery address or contact is missing, or there is an open exception"; the
# block shows its owner). Owner decision 2026-11-20: follow the document, so the Release checkbox on a Gate row is as strict as the bulk
# "Release selected" / "Release all suggested" (app/fulfillment/release_bulk.py).
#
# Only the save that CHANGES Release to checked is checked: editing a row that is already released is never refused. Releasing beyond the
# capacity line is NOT a block (OR-R4: the supervisor may release over capacity; the screen shows "over capacity by N boxes").
# The Blocked mark on the package is the sorting engine's, which can be a little old (for example a customer's phone number was added and
# nothing re-scored yet), so when the mark says Blocked the queue is re-scored first and the NEW answer decides.
# A Gate row with no package record behind it, or a package never scored, has no mark to go by and is not refused (the old behaviour).
from app.criteria import ZohoError
from app.deluge import blank, truthy
from app.fulfillment.mandatory import CODE
from app.workflows import register

GATE = "Sales_Order_Readiness_Gate"
SOF = "Sales_Order_Fulfillment"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v).strip()


async def blocked_why(store, so: str, pkg: str) -> dict | None:
    """The block of this package ({"reason", "owner"}) after a fresh re-score, or None when it is not blocked (or not scored)."""
    from app.fulfillment.sorter import rescore_all   # late import: the sorter imports modules that import this package's hooks
    from app.fulfillment.where import eq

    def pick(rows):
        return next((r for r in rows if _text(r.get("SO_No")) == so and (pkg == "" or _text(r.get("Package")) == pkg)), None)

    sof = pick(await store.find(SOF, criteria=eq("SO_No", so)))
    if sof is None or _text(sof.get("Category")) != "blocked":
        return None
    await rescore_all(store)
    sof = pick(await store.find(SOF, criteria=eq("SO_No", so)))
    if sof is None or _text(sof.get("Category")) != "blocked":
        return None
    return {"reason": _text(sof.get("Blocked_Reason")), "owner": _text(sof.get("Blocked_Owner"))}


async def _refuse_blocked(args: dict) -> None:
    input_, previous, store = args.get("input") or {}, args.get("previous") or {}, args["store"]
    if not truthy(input_.get("Release")) or truthy(previous.get("Release")):
        return
    merged = {**previous, **input_}
    so, pkg = _text(merged.get("sales_order_number")), _text(merged.get("Package_Order"))
    if so == "":
        return
    block = await blocked_why(store, so, pkg)
    if block:
        who = f" Owner: {block['owner']}." if block["owner"] else ""
        raise ZohoError(CODE, f"Cannot release {so}{f' ({pkg})' if pkg else ''}: the package is Blocked: {block['reason'] or 'see the Blocked tab'}.{who} Fix that first, then release.")


register(GATE, {"beforeAdd": _refuse_blocked, "beforeUpdate": _refuse_blocked})
