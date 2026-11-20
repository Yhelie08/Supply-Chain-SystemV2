# Daily shipment schedules, ported from zoho-export/parsed/workflows/schedule/_ (both daily at 08:00
# Asia/Manila in Zoho). Run by the plain store (their writes do not fire the form workflows, like a
# Deluge schedule). No cron wiring in this port (functions stay plain callables, per the design
# doc's scope).
#
#   run_shipment_10_day_check   every shipment not yet notified (Notified_10d false) with
#                               Remaining_Days <= 10 gets an App_Notifications record, and
#                               Notified_10d = true so it is told once.
#   run_shipment_delay_status   every shipment that is not Delivered and has an
#                               Estimated_Warehouse_Arrival: past it -> "Delayed", within 7 days ->
#                               "Arriving in 1 Week". Today can be overridden by
#                               Schedule_Test_Settings.Test_Current_Date.
#
# Mirrors Zoho: Remaining_Days is the number stored on the shipment when it was made (copied from
# the PO line), not recounted here. A shipment with a blank Remaining_Days is skipped (Deluge:
# None <= 10 is not true). The status is never moved back (a Delayed shipment whose date is moved
# later stays Delayed), and "Arriving in 1 Week" is written with Zoho's spelling (the picklist
# option is "Arriving In 1 Week"; the widgets look for the script's spelling). Differences on
# purpose: Target_URL points at this app (APP_BASE_URL) instead of the Zoho Development URL;
# Added_User is blank. Ported from server/modules/procurement/shipment-schedules.mjs.
import os

from app.criteria import zoho_now
from app.deluge import blank, parse_date, day_diff, to_num, today_date, truthy


def _text(v) -> str:
    return "" if blank(v) else str(v)


async def run_shipment_10_day_check(store, *, log=lambda *_a, **_k: None) -> dict:
    notified = 0
    # no criteria: a blank checkbox (an imported row) must count as false, which a SQL "== false" would miss
    for s in await store.find("Shipments", lambda r: not truthy(r.get("Notified_10d"))):
        if blank(s.get("Remaining_Days")) or to_num(s.get("Remaining_Days")) > 10:
            continue
        await store.add_record("App_Notifications", {
            "Recipient_Email": "homecartelpacker@gmail.com", "Notification_Type": "Shipment",
            "Message": f"Shipment {_text(s.get('Shipment_No'))} has {int(to_num(s.get('Remaining_Days')))} day(s) left on its timeline.", "Created_On": zoho_now(), "Read": False,
            "Target_URL": f"{os.environ.get('APP_BASE_URL', '')}/#Page:Shipments1", "Source_Record_No": s.get("Shipment_No"), "Source_Record_ID": s["ID"],
        })
        await store.update_record("Shipments", s["ID"], {"Notified_10d": True}, by_form=True)
        notified += 1
    log(f"{notified} shipment(s) notified")
    return {"notified": notified}


async def run_shipment_delay_status(store, *, log=lambda *_a, **_k: None, today=None) -> dict:
    day = today or today_date()
    for s in await store.find("Schedule_Test_Settings"):
        d = parse_date(s.get("Test_Current_Date"))
        if d:
            day = d
    counts = {"delayed": 0, "arriving": 0, "skippedDelivered": 0, "checked": 0, "changed": 0}
    for sh in await store.find("Shipments"):
        if _text(sh.get("Shipment_Status")) == "Delivered":
            counts["skippedDelivered"] += 1
            continue
        eta = parse_date(sh.get("Estimated_Warehouse_Arrival"))
        if not eta:
            continue
        counts["checked"] += 1
        diff = day_diff(eta, day)
        want = None
        if diff < 0:
            want = "Delayed"
            counts["delayed"] += 1
        elif diff <= 7:
            want = "Arriving in 1 Week"
            counts["arriving"] += 1
        if want and _text(sh.get("Shipment_Status")) != want:
            await store.update_record("Shipments", sh["ID"], {"Shipment_Status": want}, by_form=True)
            counts["changed"] += 1
    log(str(counts))
    return counts
