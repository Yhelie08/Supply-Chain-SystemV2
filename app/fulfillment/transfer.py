# Transfer, WH1 Banawe <-> WH3 Baesa (spec v1.4, 03 Fulfillment / 05 Warehouse Request and Transfer, section 2).
#   TR-R1  A transfer lists items, quantities, from and to bins. (Already true at the warehouse level -- From_Warehouse
#          / To_Warehouse; the Item_to_transfer grid has no per-line bin, not changed here.)
#   TR-R2  Sent stamps when the sender confirms loading; Received stamps when the receiver confirms quantities and
#          signs. Differences create an exception.
#   TR-R3  Books-dependent (on hold).
#   TR-R4  Depends on PKG-R2 (partial package split), not built yet -- out of scope here.
#
# MY READING (TR-R2): the Item_to_transfer grid cannot be given a new per-line "received quantity" field through the
# spec-forms mechanism (it only adds top-level fields to a form; the grid's own nested fields are untouched -- see
# server/spec-forms/Transfer_Warehouse.json), so the quantity confirmation is whole-transfer: the receiver checks
# Quantities_Match, or leaves it unchecked and writes Discrepancy_Notes, which becomes the exception. Owner decision
# 2026-11-21: mandatory, enforced the same way QC-R2/CR-R2/QC-R3 already are (the server refuses the save, not just
# the widget).
from app.criteria import ZohoError, zoho_now
from app.deluge import blank, truthy
from app.fulfillment.mandatory import CODE
from app.workflows import register

TRANSFER = "Transfer_Warehouse"
EXC = "Exceptions"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _present(v) -> bool:
    return not blank(v) and str(v).strip() not in ("", "null")


def _turning_true(args: dict, field: str) -> bool:
    input_, previous = args.get("input") or {}, args.get("previous") or {}
    return field in input_ and truthy(input_.get(field)) and not truthy(previous.get(field))


async def _transfer_mandatory(args: dict) -> None:
    """TR-R2, the server's last word (the widget is expected to check the same thing first)."""
    if not _turning_true(args, "Received"):
        return
    merged = {**(args.get("previous") or {}), **(args.get("input") or {})}
    missing = []
    if not _present(merged.get("Receiver_Signature")):
        missing.append("the receiver's signature")
    if not truthy(merged.get("Quantities_Match")) and not _present(merged.get("Discrepancy_Notes")):
        missing.append("discrepancy notes (Quantities Match is unchecked)")
    if missing:
        raise ZohoError(CODE, f"Received needs: {', '.join(missing)}.")


register(TRANSFER, {"beforeUpdate": _transfer_mandatory})


async def _transfer_stamps_and_exception(args: dict) -> None:
    record, previous, store = args["record"], args.get("previous") or {}, args["store"]
    patch = {}
    if truthy(record.get("Dispatch")) and not truthy(previous.get("Dispatch")) and blank(record.get("Sent_At")):
        patch["Sent_At"] = zoho_now()
    if truthy(record.get("Received")) and not truthy(previous.get("Received")):
        if blank(record.get("Received_At")):
            patch["Received_At"] = zoho_now()
        if not truthy(record.get("Quantities_Match")):
            await _open_transfer_exception(store, record)
    if patch:
        await store.update_record(TRANSFER, record["ID"], patch, by_form=True)


async def _open_transfer_exception(store, record: dict) -> None:
    """TR-R2: 'differences create an exception.' One exception per transfer (not per item line -- see the module
    header), in the general Exceptions log (05 / 05), the same place aging.py's non-package exceptions go."""
    from_wh, to_wh = _text(record.get("From_Warehouse")), _text(record.get("To_Warehouse"))
    await store.add_record(EXC, {
        "Exception_No": await store.next_number(EXC, "Exception_No", "EXC"), "Source_Module": "Transfer", "Assigned_Department": "Fulfillment",
        "Exception_Status": "Open", "Priority": "Medium", "Impact_Type": "Delay Only", "Sales_Order": _text(record.get("SO_Optional")),
        "Opened_On": zoho_now(), "Exception_Title": f"Transfer discrepancy: {from_wh} → {to_wh}",
        "Exception_Description": _text(record.get("Discrepancy_Notes")) or "Quantities did not match on receipt (no notes given).",
    })


register(TRANSFER, {"afterUpdate": _transfer_stamps_and_exception})
