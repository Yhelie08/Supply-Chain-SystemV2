# Appointment confirmation and the unconfirmed-by-cutoff alert (spec v1.4, Delivery 03 §1,
# AP-R2/AP-R4).
#
# AP-R2's own trigger ("SMS with window and tracking link") is not built -- no SMS integration
# exists in this app yet. This still ports the part that does not need SMS: "the customer's reply,
# OR A DISPATCHER CALL, sets confirmed" -- a dispatcher can mark an appointment confirmed by hand.
# Ported from server/modules/delivery-management/confirmation.mjs.
from app.criteria import zoho_now
from app.deluge import add_days, blank, parse_date, today_date, truthy, ymd
from app.delivery.scheduling import SA, raise_exception
from app.workflows import register

_DONE_STATUSES = {"Completed", "Failed", "Archived"}


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


async def _stamp_confirmation(args: dict) -> None:
    input_, previous = args["input"], args.get("previous")
    if not truthy(input_.get("Confirm_Appointment")):
        input_.pop("Confirm_Appointment", None)
        return
    input_["Confirm_Appointment"] = False
    if blank((previous or {}).get("Appointment_Confirmed_At")):
        input_["Appointment_Confirmed_At"] = zoho_now()


register(SA, {"beforeAdd": _stamp_confirmation, "beforeUpdate": _stamp_confirmation})


async def run_confirm_cutoff_check(store, *, now=None) -> dict:
    tomorrow = ymd(add_days(today_date(), 1))

    def _is_tomorrow(r):
        d = parse_date(r.get("Confirmed_Schedule_Date"))
        return d is not None and ymd(d) == tomorrow

    all_ = await store.find(SA, _is_tomorrow)
    alerted = 0
    for rec in all_:
        if _text(rec.get("Appointment_Status")) in _DONE_STATUSES:
            continue
        if not blank(rec.get("Appointment_Confirmed_At")):
            continue
        raised = await raise_exception(store, rec, stage="Confirmation", reason="Unconfirmed by cutoff", severity="Medium")
        if raised:
            alerted += 1
    return {"checked": len(all_), "alerted": alerted}
