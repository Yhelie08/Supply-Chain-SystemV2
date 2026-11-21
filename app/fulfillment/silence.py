# T-7 (05 Shared Engines / 04 Timestamps and Event Log): "silence is an alert." The spec's `expected_windows` table has 11 rows across
# every module; three belong to Fulfillment (the rest are Procurement's or Delivery's, not built here):
#   released    -> picked       within 1 day   "Pick stalled" -> Fulfillment supervisor
#   qc_rejected -> rework_done  within 3 days  "Rework stuck" -> Fulfillment supervisor (RW-R5's silence alert)
#   aggregated  -> dispatched   within aggregation_wait_days (default 2) -> Fulfillment supervisor (OA-R4, the "Ship -> Service
#       Request" gap -- one of the spec's own "two gaps nobody owns", the other being the Scoreboard's Received -> Pick gap)
# All three go through App_Notifications, the same table aging.py's 14/21-day alerts use, with the same once-per-package+stage
# dedup (a package that clears the condition and then falls silent again later gets a fresh alert; it is never re-told for the
# same spell).
#
# MY READING for the rework alert (the spec counts from one event to the next; Exception_Control1 is per rejected unit, and
# Added_Time cannot be backdated by the usual write path): a package counts as silent when it currently holds an open exception
# (Exception_Control1, Pending / In Rework -- the same "open" the sorter and FS-3 already use) AND the OLDEST `package.qc_rejected`
# stamp on that package is 3+ days old. A package can have more than one rejected unit; using the oldest stamp means the alert fires
# as soon as ANY of them has been open that long, not only when all of them have.
#
# MY READING for OA-R4: the spec's "scheduled job" does not exist in this codebase's current Fulfillment/Delivery boundary --
# dispatch is what CREATES the first Delivery record (Delivery_Scheduling), not the other way around (see the To Ship widget's
# own notes), so "without a scheduled job" is read as "still waiting in Order Aggregation, not yet dispatched".
from datetime import datetime

from app.deluge import blank
from app.fulfillment.aging import INBOX, NOTES, parse_time
from app.fulfillment.events import EVENTS
from app.policy import policy_reader

QC_REJECTED = "package.qc_rejected"
AGGREGATION_WAIT_DAYS_DEFAULT = 2


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


async def _tell(store, kind: str, record_id, key: str, message: str) -> bool:
    told = await store.find(NOTES, lambda n: n.get("Notification_Type") == kind and str(n.get("Source_Record_ID")) == str(record_id) and n.get("Source_Record_No") == key)
    if told:
        return False
    from app.criteria import zoho_now   # late import: avoids a module cycle at import time (silence <- aging <- events, all leaves already)

    await store.add_record(NOTES, {
        "Recipient_Email": INBOX, "Notification_Type": kind, "Created_On": zoho_now(), "Read": False, "Target_URL": "",
        "Message": message, "Source_Record_No": key, "Source_Record_ID": str(record_id),
    })
    return True


async def tell_about_release_silence(store, sof: dict, days_in_current_stage: int) -> bool:
    """released -> picked within 1 day. `days_in_current_stage` is the caller's own days_in_stage(sof, events, now): when the package
    is still in Picking, that number already IS the days since it was released (STAGE_EVENT["Picking"] = "package.released")."""
    if _text(sof.get("Fulfillment_Stage")) != "Picking" or days_in_current_stage < 1:
        return False
    so, pkg = sof.get("SO_No") or "", sof.get("Package") or "no package"
    return await _tell(store, "Pick Stalled", sof["ID"], f"{so} / Picking",
                        f"{so} ({pkg}) has waited {days_in_current_stage} day(s) in Picking with nothing picked. For: Fulfillment supervisor.")


async def tell_about_rework_silence(store, sof: dict, events: list, now: datetime) -> bool:
    """qc_rejected -> rework_done within 3 days (RW-R5's silence alert), for a package that still holds an open exception."""
    from app.fulfillment.exception_hold import open_exception_of   # late import: exception_hold already lazy-imports sorter, which imports this module

    so, pac = _text(sof.get("SO_No")), _text(sof.get("Package"))
    if not await open_exception_of(store, so, pac):
        return False
    pid = str(sof["ID"])
    stamps = sorted(t for t in (parse_time(e.get("Occurred_At")) for e in events if str(e.get("Record_Id")) == pid and _text(e.get("Event")) == QC_REJECTED) if t)
    if not stamps:
        return False
    days = max(0, (now - stamps[0]).days)
    if days < 3:
        return False
    return await _tell(store, "Rework Stuck", sof["ID"], f"{so} / Rework",
                        f"{so} ({sof.get('Package') or 'no package'}) has had an open exception for {days} day(s) with no rework done. For: Fulfillment supervisor.")


async def tell_about_aggregation_wait_silence(store, sof: dict, days_in_current_stage: int, wait_days: int) -> bool:
    """OA-R4: a package still in Order Aggregation (not yet dispatched) past `aggregation_wait_days`."""
    if _text(sof.get("Fulfillment_Stage")) != "Order Aggregation" or days_in_current_stage < wait_days:
        return False
    so, pkg = sof.get("SO_No") or "", sof.get("Package") or "no package"
    return await _tell(store, "Aggregation Wait", sof["ID"], f"{so} / Order Aggregation",
                        f"{so} ({pkg}) has waited {days_in_current_stage} day(s) in Order Aggregation with no job yet (the Ship → Service Request gap). For: Fulfillment supervisor.")


async def check_silence(store, scored: list, now: datetime) -> int:
    """Called once per rescore (sorter.rescore_all), after every open package has its Aging_Days. Returns how many alerts it sent."""
    events = await store.find(EVENTS, lambda r: _text(r.get("Record_Type")) == "package")
    policy = await policy_reader(store)
    try:
        wait_days = int(float(policy("aggregation_wait_days") or AGGREGATION_WAIT_DAYS_DEFAULT))
    except ValueError:
        wait_days = AGGREGATION_WAIT_DAYS_DEFAULT
    told = 0
    for e in scored:
        if await tell_about_release_silence(store, e["sof"], e["agingDays"]):
            told += 1
        if await tell_about_rework_silence(store, e["sof"], events, now):
            told += 1
        if await tell_about_aggregation_wait_silence(store, e["sof"], e["agingDays"], wait_days):
            told += 1
    return told
