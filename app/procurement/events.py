# The event log (spec 05 Shared Engines / 04 Timestamps and Event Log): Stage_Events.
#   T-2  stamps are set by the server; nothing a user types becomes a stamp
#   T-3  every event stores when it happened (Occurred_At) and when the system was told (Reported_At)
#   T-5  when only the order of events is known, a bound ("before") is stored, never a made-up time
#   T-6  the first time a record enters a stage is kept; a second visit is a new row with Visit_No + 1
# Ported from server/modules/procurement/events.mjs. Independent of other Procurement files.
import re
from datetime import datetime

from app.criteria import ZohoError, zoho_now
from app.deluge import blank, parse_date, today_date

SHIPMENT_EVENTS = ["production_started", "production_finished", "shipped_out", "arrived_port", "customs_cleared", "arrived_warehouse", "received"]
# event -> the stage the shipment is in after it, and the column on the shipment that keeps the first stamp
SHIPMENT_STAGE_OF = {
    "production_started": "production", "production_finished": "production", "shipped_out": "shipped_out", "arrived_port": "arrived_port",
    "customs_cleared": "customs_cleared", "arrived_warehouse": "arrived_warehouse", "received": "received",
}
SHIPMENT_STAMP_OF = {
    "production_started": "Production_Started_At", "production_finished": "Production_Finished_At", "shipped_out": "Shipped_Out_At", "arrived_port": "Arrived_Port_At",
    "customs_cleared": "Customs_Cleared_At", "arrived_warehouse": "Arrived_Warehouse_At", "received": "Received_At",
}
SHIPMENT_STAGES = ["production", "shipped_out", "arrived_port", "customs_cleared", "arrived_warehouse", "received"]

_WHEN_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$", re.IGNORECASE)


# "2026-11-10", "2026-11-10 14:30[:05]" or Zoho's "2026-11-10 02:30:05 PM" -> {"date": datetime, "date_only": bool}.
def parse_when(v) -> dict | None:
    s = str(v if v is not None else "").strip()
    m = _WHEN_RE.match(s)
    if not m:
        return None
    h = 0 if m.group(4) is None else int(m.group(4))
    if m.group(7):
        h = (h % 12) + (12 if m.group(7).upper() == "PM" else 0)
    try:
        date = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), h, int(m.group(5) or 0), int(m.group(6) or 0))
    except ValueError:
        return None
    return {"date": date, "date_only": m.group(4) is None}


def _day_text(d: datetime) -> str:
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}"


# What the person says happened -> the text to store, and the datetime. Blank = now. A future moment
# is refused. Returns {"text": str, "date": datetime, "bound": "exact"}.
def occurred_from(input_, now: datetime | None = None) -> dict:
    now = now or datetime.now()
    if blank(input_):
        return {"text": zoho_now(now), "date": now, "bound": "exact"}
    w = parse_when(input_)
    if not w:
        raise ZohoError(2001, f'"{input_}" is not a date. Use yyyy-MM-dd or yyyy-MM-dd HH:mm:ss.')
    too_late = w["date"].date() > today_date() if w["date_only"] else w["date"] > now
    if too_late:
        raise ZohoError(2001, "The event cannot have happened in the future. Leave the date blank if it happened just now.")
    return {"text": _day_text(w["date"]) if w["date_only"] else zoho_now(w["date"]), "date": w["date"], "bound": "exact"}


async def events_of(store, record_type: str, record_id: str) -> list:
    return await store.find("Stage_Events", lambda r: r.get("Record_Type") == record_type and str(r.get("Record_Id")) == str(record_id))


# Writes one event row. Returns the row's visit number. `event` is the full name, e.g. "shipment.shipped_out".
async def log_event(store, *, record_type, record_id, record_no=None, event, occurred_at=None, bound="exact", source="user", actor="", note="") -> int:
    before = [r for r in await events_of(store, record_type, record_id) if r.get("Event") == event]
    visit = len(before) + 1
    await store.add_record("Stage_Events", {
        "Record_Type": record_type, "Record_Id": str(record_id), "Record_No": record_no if record_no is not None else "", "Event": event,
        "Occurred_At": occurred_at, "Reported_At": zoho_now(), "Occurred_Bound": bound, "Source": source, "Actor": actor, "Visit_No": visit, "Note": note,
    })
    return visit


# "Days waiting" helper used by the sorting engine's aging guard and by the board: whole days between
# two stamps (b minus a).
def days_between(a, b) -> int | None:
    x, y = parse_date(a), parse_date(b)
    return round((y - x).days) if x and y else None
