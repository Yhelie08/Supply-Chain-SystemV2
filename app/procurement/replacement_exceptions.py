# Replacement_Request and Exceptions workflows (all "on validate", before the save), ported from
#   zoho-export/parsed/workflows/form/Replacement_Request/*.dg and .../Exceptions/*.dg
# The Tony Fan and Fenteng Lighting copies of Replacement_Request (same field names) have the same
# four scripts, with two differences that are kept: they write Last_Updated for real
# (input.Last_Updated, the main form's script does not), and their number script reads the MAIN
# Replacement_Request table, so their numbers continue the main sequence.
#
#   Replacement_Request
#     RR_Generate_Number   (add)          the next RR-nnnnn
#     RR_Set_Defaults      (add)          RR_Status "Open", RR_Date today
#     RR_Status_Timestamps (add or edit)  Supplier_Acknowledge_Date when the status BECOMES
#                                          Acknowledged, Closed_At when it BECOMES Closed
#     RR_Validate_Status   (add or edit)  cannot be Closed without Closure_Notes and RR_Reason
#   Exceptions
#     EXC_Generate_Number   (add)         the next EXC-nnnnn
#     EXC_Set_Defaults      (add)         Exception_Status "Open", Opened_On now
#     EXC_Validate_Status   (add or edit) cannot be Resolved without Resolution_Action; cannot be
#                                          Closed unless it was Resolved first
#     EXC_Status_Timestamps (Zoho's script sets Resolved_At / Closed_At in plain variables, which
#                            never stored anything, and the form has no such fields: nothing to port)
# Quirks kept: RR_Status_Timestamps also "fills" Last_Updated and Supplier_Acknowledged in plain
# variables, so those are never stored. An alert + "cancel submit" in Zoho is an error here (the save
# is refused with the same message). Ported from server/modules/procurement/replacement-exceptions.mjs.
from app.criteria import ZohoError, zoho_now
from app.deluge import blank, today_date, ymd
from app.workflows import register

_RR_FORMS = ["Replacement_Request", "Tony_Fan_Replacement_Request", "Fenteng_Lighting_Replacement_Request"]


def _text(v) -> str:
    return "" if blank(v) else str(v)


def _today() -> str:
    return ymd(today_date())


# ---------- Replacement_Request (and the two supplier copies) ----------
async def _rr_before_save(form: str, args: dict) -> None:
    input_, previous, store = args["input"], args.get("previous"), args["store"]
    rec = {**(previous or {}), **input_}
    is_copy = form != "Replacement_Request"
    if is_copy:
        input_["Last_Updated"] = _today()
    if not previous:
        input_["RR_No"] = await store.next_number("Replacement_Request", "RR_No", "RR-")
        input_["RR_Status"] = "Open"
        input_["RR_Date"] = _today()
        rec["RR_Status"] = "Open"
    status = _text(rec.get("RR_Status"))
    before = _text((previous or {}).get("RR_Status"))
    if status == "Acknowledged" and before != "Acknowledged":
        input_["Supplier_Acknowledge_Date"] = _today()
    if status == "Closed" and before != "Closed":
        input_["Closed_At"] = _today()
    if status == "Closed":
        if _text(rec.get("Closure_Notes")) == "":
            raise ZohoError(2001, "Cannot close this RR — Closure Notes are required before closing a Replacement Request. Please fill in the Closure Notes field.")
        if _text(rec.get("RR_Reason")) == "":
            raise ZohoError(2001, "Cannot close this RR — RR Reason is required before closing a Replacement Request. Please fill in the RR Reason field.")


def _rr_hook(form: str):
    async def hook(args: dict) -> None:
        await _rr_before_save(form, args)
    return hook


for _form in _RR_FORMS:
    register(_form, {"beforeAdd": _rr_hook(_form), "beforeUpdate": _rr_hook(_form)})


# ---------- Exceptions ----------
async def _exc_before_save(args: dict) -> None:
    input_, previous, store = args["input"], args.get("previous"), args["store"]
    rec = {**(previous or {}), **input_}
    if not previous:
        input_["Exception_No"] = await store.next_number("Exceptions", "Exception_No", "EXC-")
        input_["Exception_Status"] = "Open"
        input_["Opened_On"] = zoho_now()
        rec["Exception_Status"] = "Open"
    status = _text(rec.get("Exception_Status"))
    if status == "Resolved" and _text(rec.get("Resolution_Action")) == "":
        raise ZohoError(2001, "Cannot set status to Resolved — Resolution Action is required before resolving an exception. Please fill in the Resolution Action field.")
    if status == "Closed" and _text((previous or {}).get("Exception_Status")) != "Resolved":
        raise ZohoError(2001, "Cannot set status to Closed — the exception must be Resolved first before it can be Closed.")


register("Exceptions", {"beforeAdd": _exc_before_save, "beforeUpdate": _exc_before_save})
