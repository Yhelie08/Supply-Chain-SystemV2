# The anti-burial guard (spec v1.4, 05 Shared Engines / 01 Sorting Engine section 5, and Order Readiness OR-R7).
# Sorting fixes the order of the pile; it does not make anyone look at the bottom. A package that waits too long in the same stage
# gets a level, written on the package by the sorter:
#   low  (aging_low_days,  default 7)   a flag on the row
#   mid  (aging_mid_days,  default 14)  the supervisor is told
#   high (aging_high_days, default 21)  escalated to the Admin
# Days count from the stamp of the stage the package is in NOW (the latest Stage_Events row for that stage); a package with no such
# stamp (imported from Creator) counts from the day it was imported (its Added_Time), so go-live does not raise hundreds of alerts.
# Telling people goes through App_Notifications (the same table Procurement's silence alerts use), once per package + stage + level.
# Note: the spec says "exception created" at 14 days. The generic Exceptions log belongs to Procurement / Delivery and its lists have no
# Fulfillment stage values, and an open Exception_Control1 record would BLOCK the package (burying it more), so for now the 14 / 21 day
# alert is a notification plus the level on the row. Open decision, written in the review file.
import re
from datetime import datetime

from app.criteria import zoho_now
from app.deluge import blank
from app.fulfillment.events import log_package_event, stage_event_names
from app.fulfillment.stage import stage_slug

NOTES = "App_Notifications"
INBOX = "homecartelff@gmail.com"   # the Fulfillment inbox the other Fulfillment notifications already use
DEFAULTS = {"aging_low_days": 7, "aging_mid_days": 14, "aging_high_days": 21}

_AMPM = re.compile(r"^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])$")


def parse_time(v) -> datetime | None:
    """A time the system wrote (Zoho style '2026-11-17 10:30:05 AM', 24 hour, or ISO) as a naive local datetime; None when it is not one."""
    if blank(v):
        return None
    s = str(v).strip()
    m = _AMPM.match(s)
    if m:
        h = int(m.group(2)) % 12 + (12 if m.group(5).lower() == "pm" else 0)
        try:
            return datetime.strptime(f"{m.group(1)} {h:02d}:{m.group(3)}:{m.group(4) or '00'}", "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return None
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d.replace(tzinfo=None) if d.tzinfo is None else d.astimezone().replace(tzinfo=None)


def _days(policy, key: str) -> int:
    try:
        n = int(float(policy(key) or 0))
    except ValueError:
        n = 0
    return n if n > 0 else DEFAULTS[key]


def aging_level(days: int, policy) -> str:
    if days >= _days(policy, "aging_high_days"):
        return "high"
    if days >= _days(policy, "aging_mid_days"):
        return "mid"
    if days >= _days(policy, "aging_low_days"):
        return "low"
    return ""


def days_in_stage(sof: dict, events: list, now: datetime) -> int:
    """Whole days since the package entered the stage it is in now."""
    names = stage_event_names(sof.get("Fulfillment_Stage"))   # the new spec name and the old package.<stage> name: old rows still count
    stamps = [parse_time(e.get("Occurred_At")) for e in events if str(e.get("Record_Id")) == str(sof.get("ID")) and e.get("Event") in names]
    entered = max((t for t in stamps if t), default=None) or parse_time(sof.get("Added_Time")) or now
    return max(0, (now - entered).days)


_KIND = {"mid": ("Aging 14 Days", "Fulfillment supervisor"), "high": ("Aging 21 Days", "Admin")}
EXC = "Exceptions"
EXC_KEY = "aging:"   # Exception_Line_Key = aging:<package id>:<stage slug>
_FOUND_STAGE = {"Picking": "pick", "Pack & QC": "qc", "Crate": "crate", "Order Aggregation": "aggregation"}   # the Found_Stage list has no value for the unreleased stages


async def _aging_exception(store, sof: dict, level: str, days: int) -> None:
    """The exception of sorting engine section 5 ("14 days: exception created"). One per package + stage in the general Exceptions log;
    at 21 days the same exception goes to High. It does NOT block the package (it is not an Exception_Control1 record), so the order
    keeps its rank instead of being buried. It is closed by close_left_behind_aging_exceptions when the package moves on."""
    stage = str(sof.get("Fulfillment_Stage") or "")
    key = f"{EXC_KEY}{sof['ID']}:{stage_slug(stage)}"
    found = await store.find(EXC, lambda e: e.get("Exception_Line_Key") == key)
    priority = "High" if level == "high" else "Medium"
    if found:
        if level == "high" and found[0].get("Priority") != "High":
            await store.update_record(EXC, found[0]["ID"], {"Priority": "High"}, by_form=True)
        return
    await store.add_record(EXC, {
        "Exception_No": await store.next_number(EXC, "Exception_No", "EXC"), "Source_Module": "Fulfillment EXC", "Assigned_Department": "Fulfillment",
        "Exception_Status": "Open", "Priority": priority, "Impact_Type": "Delay Only", "Fault_Origin": "warehouse", "Caused_Stage": "warehouse",
        "Found_Stage": _FOUND_STAGE.get(stage, ""), "Sales_Order": sof.get("SO_No") or "", "Opened_On": zoho_now(), "Exception_Line_Key": key,
        "Exception_Title": f"Waiting {days} days in {stage}",
        "Exception_Description": f"{sof.get('SO_No') or ''} ({sof.get('Package') or 'no package'}) has not moved out of {stage} for {days} days (aging guard, sorting engine section 5).",
    })


async def close_left_behind_aging_exceptions(store, scored: list) -> int:
    """Closes the open aging exceptions of packages that moved to another stage or left the open list. Returns how many it closed."""
    still = {f"{EXC_KEY}{e['sof']['ID']}:{stage_slug(e['sof'].get('Fulfillment_Stage'))}" for e in scored}
    closed = 0
    for x in await store.find(EXC, lambda r: str(r.get("Exception_Line_Key") or "").startswith(EXC_KEY) and r.get("Exception_Status") not in ("Resolved", "Closed")):
        if x["Exception_Line_Key"] not in still:
            await store.update_record(EXC, x["ID"], {"Exception_Status": "Resolved", "Resolved_At": zoho_now(), "Resolution_Action": "The package moved on (aging guard closed it)"}, by_form=True)
            closed += 1
    return closed


async def tell_about_aging(store, sof: dict, level: str, days: int) -> bool:
    """For a mid / high level: the exception (section 5) and the notification, once per package + stage. Returns True when it wrote a notification."""
    if level not in _KIND:
        return False
    await _aging_exception(store, sof, level, days)
    kind, who = _KIND[level]
    stage = str(sof.get("Fulfillment_Stage") or "")
    key = f"{sof.get('SO_No') or ''} / {stage}"
    told = await store.find(NOTES, lambda n: n.get("Notification_Type") == kind and str(n.get("Source_Record_ID")) == str(sof["ID"]) and n.get("Source_Record_No") == key)
    if told:
        return False
    await store.add_record(NOTES, {
        "Recipient_Email": INBOX, "Notification_Type": kind, "Created_On": zoho_now(), "Read": False, "Target_URL": "",
        "Message": f"{sof.get('SO_No') or ''} ({sof.get('Package') or 'no package'}) has waited {days} days in {stage}. For: {who}.",
        "Source_Record_No": key, "Source_Record_ID": str(sof["ID"]),
    })
    return True


# OR-R6 / 05 Exceptions, Alerts and Notifications: a notification fires on a CHANGE of state only. Becomes Already late: the supervisor AND
# the sales agent, the same day. Becomes Blocked: the owner of the block, by name. About to be late is a line in the supervisor's morning
# list, not an instant notification (the morning list is not built yet). A package scored for the first time (previous category blank,
# e.g. at go-live) sends nothing: it appears in the lists.
async def log_block_change(store, sof: dict, category: str, entry: dict) -> None:
    """package.blocked / package.unblocked (spec 03/02 Timestamps) when the package enters or leaves the Blocked category. Nothing on the
    first scoring (no category before): that is not a change."""
    before = str(sof.get("Category") or "")
    if before == "" or before == category or "blocked" not in (before, category):
        return
    if category == "blocked":
        await log_package_event(store, sof["ID"], "package.blocked", note=str(entry.get("blockedReason") or ""))
    else:
        await log_package_event(store, sof["ID"], "package.unblocked")


async def tell_about_category_change(store, sof: dict, category: str, entry: dict) -> bool:
    before = str(sof.get("Category") or "")
    if before == "" or before == category or category not in ("late", "blocked"):
        return False
    so, pkg = sof.get("SO_No") or "", sof.get("Package") or "no package"
    if category == "late":
        kind, message = "Order Late", f"{so} ({pkg}) is now Already late: {entry.get('priorityReason') or ''}. For: Fulfillment supervisor and the sales agent."
    else:
        kind, message = "Order Blocked", f"{so} ({pkg}) is now Blocked: {entry.get('blockedReason') or ''}. For: {entry.get('blockedOwner') or 'the owner of the block'}."
    await store.add_record(NOTES, {
        "Recipient_Email": INBOX, "Notification_Type": kind, "Created_On": zoho_now(), "Read": False, "Target_URL": "", "Message": message,
        "Source_Record_No": so, "Source_Record_ID": str(sof["ID"]),
    })
    return True
