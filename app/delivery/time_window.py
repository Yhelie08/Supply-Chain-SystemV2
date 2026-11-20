# Time window, not exact time (spec v1.4, Delivery 03 "Time window (hindi exact time)"): the
# customer is promised a window, never the minute. The scheduling engine still books an exact
# start (Confirmed_Time_Slot) because that is what the team-day capacity math needs; this adds a
# computed, server-only Time_Window next to it, which the widgets show instead of the exact time.
#
# The window is a half day, cut at 12:00 NN: "Morning (<workday start>-12:00 NN)" for a slot that
# starts before noon, "Afternoon (12:00 NN-<workday end>)" from noon on.
# Ported from server/modules/delivery-management/time-window.mjs.
from app.deluge import blank
from app.delivery.scheduling import SA, clock, policy_reader
from app.workflows import register

_NOON = 12 * 60


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _pretty(v) -> str:
    c = clock(_text(v))
    if not c:
        return _text(v)
    h = c["hour"] % 12 or 12
    return f"{h}:{str(c['minute']).zfill(2)} {'PM' if c['hour'] >= 12 else 'AM'}"


def window_for(slot, start="8:00 AM", end="5:00 PM") -> str:
    c = clock(_text(slot))
    if not c:
        return ""
    if c["hour"] * 60 + c["minute"] < _NOON:
        return f"Morning ({_pretty(start)}–12:00 NN)"
    return f"Afternoon (12:00 NN–{_pretty(end)})"


async def _stamp(args: dict) -> None:
    id_, record, store = args["id"], args["record"], args["store"]
    policy = await policy_reader(store)
    want = window_for(record.get("Confirmed_Time_Slot"), policy("workday_start_time") or "8:00 AM", policy("workday_end_time") or "5:00 PM")
    if _text(record.get("Time_Window")) == want:
        return
    await store.update_record(SA, id_, {"Time_Window": want}, by_form=True)


async def _strip(args: dict) -> None:
    args["input"].pop("Time_Window", None)


register(SA, {
    "beforeAdd": _strip,
    "beforeUpdate": _strip,
    "afterAdd": _stamp,
    "afterUpdate": _stamp,
})
