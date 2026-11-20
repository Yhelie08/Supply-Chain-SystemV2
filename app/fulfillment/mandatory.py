# Mandatory checks on the QC and Crate saves (spec v1.4, 03 Fulfillment / 03 Pick, QC, Rework and Crate). Owner decision 2026-11-20:
# these are not optional, so the SERVER refuses the save (the widgets show the same checks first, but the server has the last word).
#
#   QC-R2  Quality check -> Approved needs: each of the 3 checklist groups (Fixture body, LED, Uniformity) has at least one line ticked
#          (owner's choice: "bawat grupo ay may kahit isang naka-tick"), at least one photo, and the signature.
#   QC-R3  Quality check -> Rejected needs: a reason (Remarks) and at least one photo.
#   CR-R2  Crate -> Crating Done needs: the crating checklist (at least one line ticked), at least one photo, the crate weight (kg, a
#          number above 0) and the dimensions (cm).
#
# The photo and the signature are FILES. They are uploaded to the record in separate calls, so they must be on the record before the
# status is saved (the widgets upload first, then save the status).
# Only the save that CHANGES the status is checked (Pending -> Approved, Approved -> Approved is not): a record that was already
# Approved or Done before this rule is never blocked for an unrelated edit, and uploading a file to a Pending record is never blocked.
# All the missing things are listed at once. The refusal is a ZohoError, which the API turns into code 3100 and this message.
import json

from app.criteria import ZohoError
from app.deluge import blank
from app.workflows import register

QC = "Checker_Checklist"
CRATE = "Crate_Checklist"
PHOTO = "Image_Upload_max_10_JPG_JPEG_PNG"
CODE = 3100

# field -> the name shown to the user
QC_CHECKLIST_GROUPS = {"Fixture_Body_Checklist": "Fixture Body", "LED_Checklist": "LED", "Uniformity": "Uniformity"}


def _present(v) -> bool:
    """A value is there: not blank, not 'null', not an empty list / object / JSON text, not only spaces."""
    if blank(v):
        return False
    if isinstance(v, (list, tuple, dict)):
        return len(v) > 0
    s = str(v).strip()
    if s in ("", "null", "[]", "{}"):
        return False
    if s[0] in "[{":
        try:
            return bool(json.loads(s))
        except ValueError:
            return True
    return True


def _positive_number(v) -> bool:
    try:
        return float(str(v).strip()) > 0
    except ValueError:
        return False


def _status(v) -> str:
    return "" if blank(v) else str(v)


def _changing_to(args: dict, field: str, *wanted: str) -> str | None:
    """The new status when this save sets `field` to one of `wanted` and it was not already that, otherwise None."""
    input_, previous = args.get("input") or {}, args.get("previous") or {}
    if field not in input_:
        return None
    new = _status(input_.get(field))
    return new if new in wanted and new != _status(previous.get(field)) else None


def _refuse(what: str, missing: list[str]) -> None:
    raise ZohoError(CODE, f"{what} needs: {', '.join(missing)}.")


async def _qc_mandatory(args: dict) -> None:
    status = _changing_to(args, "QC_Status", "Approved", "Rejected")
    if status is None:
        return
    merged = {**(args.get("previous") or {}), **(args.get("input") or {})}
    missing = []
    if status == "Approved":
        empty = [label for field, label in QC_CHECKLIST_GROUPS.items() if not _present(merged.get(field))]
        if empty:
            missing.append("checklist lines ticked in " + ", ".join(empty))
        if not _present(merged.get(PHOTO)):
            missing.append("at least one photo")
        if not _present(merged.get("Signature")):
            missing.append("the checker's signature")
    else:
        if not _present(merged.get("Remarks")):
            missing.append("a reason (Remarks)")
        if not _present(merged.get(PHOTO)):
            missing.append("at least one photo")
    if missing:
        _refuse(f"QC {status}", missing)


async def _crate_mandatory(args: dict) -> None:
    if _changing_to(args, "Crating_Status1", "Done") is None:
        return
    merged = {**(args.get("previous") or {}), **(args.get("input") or {})}
    missing = []
    if not _present(merged.get("Crating_Checklist")):
        missing.append("the crating checklist")
    if not _present(merged.get("Photo_Documentation")):
        missing.append("at least one photo")
    if not _positive_number(merged.get("Crate_Weight_Kg")):
        missing.append("the crate weight in kg (a number above 0)")
    if not _present(merged.get("Crate_Dimensions_Cm")):
        missing.append("the crate dimensions in cm")
    if missing:
        _refuse("Crating Done", missing)


register(QC, {"beforeAdd": _qc_mandatory, "beforeUpdate": _qc_mandatory})
register(CRATE, {"beforeAdd": _crate_mandatory, "beforeUpdate": _crate_mandatory})
