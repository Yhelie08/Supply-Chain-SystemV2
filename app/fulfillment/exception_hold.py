# FS-3 (spec v1.4, 03 Fulfillment / 03 Pick, QC, Rework and Crate): "an open exception holds the package".
# Owner decision 2026-11-20: while a package has an open exception, the SERVER refuses these steps:
#   Pick     -> Mark as Picked              (Pick1.Marked turns on)
#   Crate    -> Crating Done                (Crate_Checklist.Crating_Status1 becomes Done)
#   To Ship  -> Dispatch Selected           (Order_Aggregation1.Dispatch_Selected turns on)
# QC is NOT refused, neither Approved nor Rejected (changed the same day, after the first version): a QC split saves the rejected units first
# (which makes the exception) and then the approved units of the same package, and the re-check of a repaired unit is approved while another
# unit may still be open. Refusing Approved broke that flow (11 existing tests failed), so the approved units could never move on.
# The single Release already refuses a Blocked package (release_guard.py), and the exception itself can always be worked on (Rework, Completed).
#
# Open = the sorting engine's rule (Pending, In Rework, or a blank status = Pending). Which package: the exception's sales order must match, and
# when both the exception and the record name a package (PAC), they must be the same one, so an exception on package A does not hold package B of
# the same order (the sorter's Blocked mark still goes by sales order only; that is its old rule and was not changed here).
# Only the save that TURNS the step on is checked: a row that was already Marked / Approved / Done / Dispatched is never refused for a later edit.
# The refusal is a ZohoError (code 3100) that names the package and the exception number, and says what to do.
from app.criteria import ZohoError
from app.custom_apis import CUSTOM_APIS
from app.deluge import blank, truthy
from app.fulfillment.mandatory import CODE, _changing_to
from app.fulfillment.where import eq
from app.workflows import register

EXC = "Exception_Control1"
PICK = "Pick1"
CRATE = "Crate_Checklist"
AGG = "Order_Aggregation1"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v).strip()


async def open_exception_of(store, so: str, pac: str) -> dict | None:
    """The first open exception that holds this package (see the rule above), or None."""
    from app.fulfillment.sorter import _is_open_exception   # late import: the sorter imports modules that import this package's hooks

    if so == "":
        return None
    for e in await store.find(EXC, criteria=eq("Sales_Order", so)):
        if _text(e.get("Sales_Order")) != so or not _is_open_exception(e):
            continue
        if pac == "" or _text(e.get("PAC")) == "" or _text(e.get("PAC")) == pac:
            return e
    return None


def _hold_message(step: str, so: str, pac: str, e: dict) -> str:
    number = _text(e.get("Exception_Number"))
    return (f"Cannot {step} {so}{f' ({pac})' if pac else ''}: the package has an open exception"
            f"{f' ({number})' if number else ''}. Fix the exception first (Exception Control), then try again.")


async def _refuse_if_held(store, step: str, so: str, pac: str) -> None:
    e = await open_exception_of(store, so, pac)
    if e is not None:
        raise ZohoError(CODE, _hold_message(step, so, pac, e))


def _turned_on(args: dict, field: str) -> bool:
    input_, previous = args.get("input") or {}, args.get("previous") or {}
    return truthy(input_.get(field)) and not truthy(previous.get(field))


def _merged(args: dict) -> dict:
    return {**(args.get("previous") or {}), **(args.get("input") or {})}


async def _hold_pick(args: dict) -> None:
    if _turned_on(args, "Marked"):
        m = _merged(args)
        await _refuse_if_held(args["store"], "mark as picked", _text(m.get("SO")), _text(m.get("Package_Order")))


async def _hold_crate(args: dict) -> None:
    if _changing_to(args, "Crating_Status1", "Done") is not None:
        m = _merged(args)
        await _refuse_if_held(args["store"], "finish crating for", _text(m.get("SO")), _text(m.get("Package_Order")))


def _row_key(r: dict) -> tuple:
    return (_text(r.get("SKU")), _text(r.get("PAC")), _text(r.get("Item_Name")))


async def _hold_dispatch(args: dict) -> None:
    """Dispatch Selected turning on, OR any item row becoming Dispatched (the To Ship widget dispatches item by item and only sets
    Dispatch_Selected when every item is done, so a partial dispatch must be held too)."""
    m = _merged(args)
    before = {_row_key(r) for r in ((args.get("previous") or {}).get("Item_Details") or []) if isinstance(r, dict) and truthy(r.get("Dispatched"))}
    rows = [r for r in (m.get("Item_Details") or []) if isinstance(r, dict)]
    newly = [r for r in rows if truthy(r.get("Dispatched")) and _row_key(r) not in before]
    selected = _turned_on(args, "Dispatch_Selected")
    if not selected and not newly:
        return
    so = _text(m.get("SO"))
    pacs = {_text(r.get("PAC")) or _text(m.get("PAC")) for r in (rows if selected else newly)} or {_text(m.get("PAC"))}
    for pac in sorted(pacs):
        await _refuse_if_held(args["store"], "dispatch", so, pac)


# A pre-check for the To Ship widget: it creates a record in Delivery's Initial Scheduling BEFORE it saves the dispatch on the aggregation
# row, so it asks here first and stops with the message, leaving nothing behind in Delivery. The save above stays the last word.
# Payload {"so", "pacs": [...]} (or "pac") -> {"status": "success", "held": bool, "message": str}.
async def exception_hold_check(payload: dict, store, ctx: dict) -> dict:
    payload = payload if isinstance(payload, dict) else {}
    so = _text(payload.get("so"))
    raw = payload.get("pacs")
    pacs = [_text(x) for x in raw] if isinstance(raw, list) else [_text(payload.get("pac"))]
    for pac in sorted(set(pacs)):
        e = await open_exception_of(store, so, pac)
        if e is not None:
            return {"status": "success", "held": True, "message": _hold_message("dispatch", so, pac, e)}
    return {"status": "success", "held": False, "message": ""}


CUSTOM_APIS["exception_hold_check"] = exception_hold_check


register(PICK, {"beforeAdd": _hold_pick, "beforeUpdate": _hold_pick})
register(CRATE, {"beforeAdd": _hold_crate, "beforeUpdate": _hold_crate})
register(AGG, {"beforeAdd": _hold_dispatch, "beforeUpdate": _hold_dispatch})
