# Warehouse Request (spec v1.4, 03 Fulfillment / 05 Warehouse Request and Transfer, section 1). WR-R1 (ranked oldest
# first) is the widget's own sort (modules/Fulfillment/Transfer Item/app/index.html), nothing to do server-side.
#   WR-R2 Silence alert if not Done/Cannot do within `warehouse_request_hours` [DEFAULT: 24 working hours].
#   WR-R3 The requester is notified when done, with the files.
# MY READING (WR-R2): "24 working hours" is read as 24 calendar hours -- a real working-hours calendar (business
# days, lunch breaks, holidays) is a much bigger thing to build and nothing elsewhere in Fulfillment has one either
# (the slack/aging calculators already use plain calendar days). The spec does not name who WR-R2 tells; the
# Fulfillment supervisor is used, the same default every other Fulfillment silence alert in this app already uses.
# Both WR-R2 and WR-R3 go through App_Notifications, the same table the other alerts use.
from datetime import datetime

from app.criteria import zoho_now
from app.deluge import blank
from app.fulfillment.aging import INBOX, NOTES, parse_time
from app.policy import policy_reader
from app.workflows import register

WR = "Warehouse_Request"
HOURS_DEFAULT = 24
_TERMINAL = ("Done", "Cannot do")


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


async def tell_about_wr_done(args: dict) -> None:
    """WR-R3: told once, the moment Request_Status first becomes Done (not Cannot do -- there is nothing to hand back)."""
    record, previous = args.get("record") or {}, args.get("previous") or {}
    if _text(record.get("Request_Status")) != "Done" or _text(previous.get("Request_Status")) == "Done":
        return
    store = args["store"]
    who = _text(record.get("Request_By")) or "the requester"
    has_files = not blank(record.get("Actual_Photo_Upload")) or not blank(record.get("Actual_Video_Upload"))
    await store.add_record(NOTES, {
        "Recipient_Email": INBOX, "Notification_Type": "Warehouse Request Done", "Created_On": zoho_now(), "Read": False, "Target_URL": "",
        "Message": f"Your warehouse request ({_text(record.get('Type_of_Request')) or 'request'}) is done.{' Files are attached.' if has_files else ''} For: {who}.",
        "Source_Record_No": who, "Source_Record_ID": str(record.get("ID") or args.get("id")),
    })


register(WR, {"afterUpdate": tell_about_wr_done})


async def check_warehouse_request_silence(store, now: datetime = None) -> int:
    """WR-R2, called from the nightly schedule (app/fulfillment/__init__.py). Returns how many alerts it sent."""
    now = now or datetime.now()
    policy = await policy_reader(store)
    try:
        hours = float(policy("warehouse_request_hours") or HOURS_DEFAULT)
    except ValueError:
        hours = HOURS_DEFAULT
    told = 0
    for r in await store.find(WR):
        if _text(r.get("Request_Status")) in _TERMINAL:
            continue
        requested = parse_time(r.get("Date_Requested")) or parse_time(r.get("Added_Time"))
        if not requested or (now - requested).total_seconds() / 3600 < hours:
            continue
        elapsed = round((now - requested).total_seconds() / 3600)
        key = f"wr:{r['ID']}"
        if await store.find(NOTES, lambda n: n.get("Notification_Type") == "Warehouse Request Silence" and n.get("Source_Record_No") == key):
            continue
        who = _text(r.get("Request_By")) or "unknown"
        await store.add_record(NOTES, {
            "Recipient_Email": INBOX, "Notification_Type": "Warehouse Request Silence", "Created_On": zoho_now(), "Read": False, "Target_URL": "",
            "Message": f"Warehouse request ({_text(r.get('Type_of_Request')) or 'request'}, from {who}) is not done after {elapsed} hour(s). For: Fulfillment supervisor.",
            "Source_Record_No": key, "Source_Record_ID": str(r["ID"]),
        })
        told += 1
    return told
