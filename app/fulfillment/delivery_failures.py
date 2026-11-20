# The "Broken" sub-rule that comes from Delivery (spec v1.4, 05 / 01 Sorting Engine): a failed/partial delivery job whose reason is
# damaged_in_transit or refused makes the order's package Broken (it is redone first). Delivery keeps these in Service_Appointment_Form:
# Failure_Reason_Code (set once, when the job is marked failed/partial), Job_Status, Rescheduled_From_SA (on the redelivery: the failed job's id).
# Fulfillment only READS that form (owner permission 2026-11-20); nothing here writes to it. The same goes for Sales_Returns_Form (below). The two codes are the same as Delivery's
# BROKEN_FAILURE_CODES (server/modules/delivery-management/scheduling.mjs).
#
# A failure is OPEN until a redelivery of it is finished (Job_Status done or archived), or the failed job itself is archived.
# Assumptions the spec does not spell out (the owner is asked to confirm): the job is matched to the package by SALES ORDER only (a redo
# package has a new package number, so the number of the failed job cannot be used), and done / archived are the "resolved" statuses.
from app.deluge import blank
from app.workflows import register

SA = "Service_Appointment_Form"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v).strip()


BROKEN_FAILURE_CODES = {"damaged_in_transit", "refused"}
FAILURE_LABEL = {"damaged_in_transit": "damaged in transit", "refused": "refused by the customer"}
_FINISHED = {"done", "archived"}


def broken_failures(jobs: list[dict]) -> list[dict]:
    """The failed jobs (damaged_in_transit / refused) that are still open, in the order given."""
    finished_redelivery_of = {_text(j.get("Rescheduled_From_SA")) for j in jobs
                              if _text(j.get("Rescheduled_From_SA")) != "" and _text(j.get("Job_Status")) in _FINISHED}
    return [j for j in jobs
            if _text(j.get("Failure_Reason_Code")) in BROKEN_FAILURE_CODES
            and _text(j.get("Job_Status")) != "archived"
            and _text(j.get("ID")) not in finished_redelivery_of]


# Sales Return redelivery (05 / 01: Broken = "linked to an open RR, a Sales Return redelivery, or a failed/partial job with a fault reason").
# Delivery's Sales_Returns_Form has Sales_Order, RMA and Return_Status (requested, scheduled, picked_up, received_back, credit_note_issued,
# closed). A return is OPEN until the credit note is issued or it is closed; a blank status (made before the status was stamped) is open.
# Like an open Replacement Request, an open return makes the order's package Broken. Matched by sales order (assumption, to be confirmed).
RETURNS = "Sales_Returns_Form"
_RETURN_DONE = {"credit_note_issued", "closed"}


def open_sales_returns(returns: list[dict]) -> list[dict]:
    return [r for r in returns if _text(r.get("Return_Status")) not in _RETURN_DONE]


async def _on_return_save(args: dict) -> None:
    from app.fulfillment.sorter import rescore_one   # late import: the sorter imports this module
    await rescore_one(args["store"], _text(args["record"].get("Sales_Order")))


register(RETURNS, {"afterAdd": _on_return_save, "afterUpdate": _on_return_save})


async def _on_job_save(args: dict) -> None:
    from app.fulfillment.sorter import rescore_one   # late import: the sorter imports this module
    await rescore_one(args["store"], _text(args["record"].get("Sales_Order")))


register(SA, {"afterAdd": _on_job_save, "afterUpdate": _on_job_save})
