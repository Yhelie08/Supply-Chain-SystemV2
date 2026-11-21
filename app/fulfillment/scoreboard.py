# Fulfillment Scoreboard numbers (spec v1.4, 03 Fulfillment / 06 Kanban, Scoreboard and SO Report, section 2; rework rate: 03 / 03 RW-R4).
# Custom API scoreboard_numbers. Everything is worked out from the records each time (nothing is stored): the Stage_Events log (05 / 04),
# the package rows, the Pick rows, Exception_Control1 and Capacity_Days. Payload (all optional): {"days": 30, "today": "YYYY-MM-DD"}.
#
# Definitions (the spec's table, and where it leaves room, my reading; the readings are listed in the change log for the owner to confirm):
#   Time in stage            median hours Ready->Released, Released->Picked, Picked->QC passed, QC passed->Aggregated, Aggregated->Dispatched.
#                            A pair is the start event and the first end event after it; a start that comes again before its end replaces the
#                            earlier one (a package that goes back), so several QC passes of one package use the LAST one for QC->Aggregated and the
#                            FIRST one for Picked->QC passed. Only pairs that END inside the window (default 30 days) count.
#   Received -> Pick gap     median days Ready->Released ("available" to "released"), the same pairs as the first transition.
#   Boxes out per day        boxes of the packages dispatched that day, last 7 days (a package counts once per day).
#   Capacity used            boxes released today / the day's capacity (people x boxes per hour x hours per day, Capacity_Days or the defaults).
#   Boxes per person per hour  MY READING: boxes picked / (people who picked that day x that day's hours per day), over the last 7 days, only for
#                            days where the Pick rows name a picker. The spec says "from pick stamps and shift hours"; there is no shift record,
#                            so the hours come from Capacity_Days.
#   Rework rate              packages with at least one exception / packages through QC (a QC passed or QC rejected event), per week (Monday
#                            start), last 4 weeks, split by the exceptions' rework type AND by fault origin (RW-R4). MY READING: the exception
#                            is the rework job (there is no separate rework job yet). Both splits are optional fields filled in later from the
#                            Exception Control widget (not at QC rejection time), so "Not chosen yet" / "Select" counts as its own bucket.
#                            BUG FIX 2026-11-21: this used to read Rework_Type, a field nothing ever writes (only Node's sample seed did);
#                            the Exception Control widget actually edits `Rework` (RW-R1 types since 2026-11-21: Select/Paint/Repair/Replace
#                            Part/Other; was Select/OK/Repair/Rewire/Repaint before that). `Fault_Origin` is new
#                            (server/spec-forms/Exception_Control1.json; EX-2 options: supplier, transit, warehouse, site, unknown).
#   On-time dispatch         packages dispatched on or before their target delivery date, over the window; packages with no target are counted apart
#                            and left out of the percentage.
# A row with a time that cannot be read is skipped; the API never raises for bad data.
from datetime import date, datetime, timedelta

from app.criteria import zoho_now
from app.custom_apis import CUSTOM_APIS
from app.deluge import blank
from app.fulfillment.aging import parse_time
from app.fulfillment.events import EVENTS, event_aliases
from app.fulfillment.sorter import capacity_for, effective_boxes

SOF = "Sales_Order_Fulfillment"

# (key, label, start event, end event), in the spec's order
TRANSITIONS = [
    ("ready_to_released", "Ready → Released", "package.ready", "package.released"),
    ("released_to_picked", "Released → Picked", "package.released", "package.picked"),
    ("picked_to_qc_passed", "Picked → QC passed", "package.picked", "package.qc_passed"),
    ("qc_to_aggregated", "QC passed → Aggregated", "package.qc_passed", "package.aggregated"),
    ("aggregated_to_dispatched", "Aggregated → Dispatched", "package.aggregated", "package.dispatched"),
]
_NAMES = ["package.ready", "package.released", "package.picked", "package.qc_passed", "package.qc_rejected", "package.aggregated", "package.dispatched"]
_CANON = {alias: name for name in _NAMES for alias in event_aliases(name)}   # old names (package.picking ...) count as the new ones


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v).strip()


def _n(x):
    """6.0 -> 6; a real fraction stays, to 2 decimals."""
    return int(x) if float(x) == int(x) else round(float(x), 2)


def median(values):
    v = sorted(values)
    if not v:
        return None
    mid = len(v) // 2
    return float(v[mid]) if len(v) % 2 else (v[mid - 1] + v[mid]) / 2


def _pairs(events: list[tuple], start: str, end: str) -> list[tuple[datetime, datetime]]:
    """[(start time, end time)] of ONE package: each start with the first end at or after it and before the next start."""
    starts = [t for t, name in events if name == start]
    ends = [t for t, name in events if name == end]
    out = []
    for i, a in enumerate(starts):
        nxt = starts[i + 1] if i + 1 < len(starts) else None
        b = next((e for e in ends if e >= a and (nxt is None or e < nxt)), None)
        if b is not None:
            out.append((a, b))
    return out


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


async def scoreboard_numbers(payload: dict, store, ctx: dict) -> dict:
    payload = payload if isinstance(payload, dict) else {}
    try:
        days = max(1, int(float(_text(payload.get("days")) or 30)))
    except ValueError:
        days = 30
    now = parse_time(zoho_now())
    today_d = (parse_time(_text(payload.get("today"))) or now or datetime.now()).date()
    cutoff = datetime.combine(today_d, datetime.min.time()) - timedelta(days=days)

    sofs = {str(s["ID"]): s for s in await store.find(SOF)}
    picks = await store.find("Pick1")
    exceptions = await store.find("Exception_Control1")

    per_package: dict[str, list[tuple]] = {}
    for r in await store.find(EVENTS):
        name = _CANON.get(_text(r.get("Event")))
        at = parse_time(r.get("Occurred_At"))
        if name is None or at is None or _text(r.get("Record_Type")) != "package" or blank(r.get("Record_Id")):
            continue
        per_package.setdefault(str(r["Record_Id"]), []).append((at, _NAMES.index(name), name))
    events_of = {pid: [(t, name) for t, _, name in sorted(evs)] for pid, evs in per_package.items()}

    def boxes_of(pid) -> float:
        sof = sofs.get(pid)
        return effective_boxes(sof) if sof else 0.0

    def on_day(name: str, d: date) -> list[str]:
        """The package ids that have this event on day d (each once)."""
        return [pid for pid, evs in events_of.items() if any(n == name and t.date() == d for t, n in evs)]

    # ---- time in stage, and Received -> Pick gap ----
    hours: dict[str, list[float]] = {k: [] for k, _, _, _ in TRANSITIONS}
    for evs in events_of.values():
        for key, _, a, b in TRANSITIONS:
            hours[key] += [(tb - ta).total_seconds() / 3600 for ta, tb in _pairs(evs, a, b) if tb >= cutoff]
    time_in_stage = [{"key": k, "label": label, "medianHours": (round(median(hours[k]), 2) if hours[k] else None), "count": len(hours[k])} for k, label, _, _ in TRANSITIONS]
    gap = median(hours["ready_to_released"])

    # ---- boxes out per day (last 7 days) ----
    last7 = [today_d - timedelta(days=i) for i in range(6, -1, -1)]
    box_days = [{"date": d.isoformat(), "boxes": _n(sum(boxes_of(pid) for pid in on_day("package.dispatched", d)))} for d in last7]

    # ---- capacity used (today) ----
    cap_today = await capacity_for(store, today_d.isoformat())
    released = sum(boxes_of(pid) for pid in on_day("package.released", today_d))
    capacity = {"releasedBoxes": _n(released), "capacityBoxes": _n(cap_today["capacityBoxes"]),
                "pct": round(100 * released / cap_today["capacityBoxes"], 1) if cap_today["capacityBoxes"] > 0 else None}

    # ---- boxes per person per hour (last 7 days) ----
    pickers_of: dict[tuple, set] = {}
    for p in picks:
        if _text(p.get("Assign_Picker")) != "":
            pickers_of.setdefault((_text(p.get("SO")), _text(p.get("Package_Order"))), set()).add(_text(p.get("Assign_Picker")))
    boxes_picked = person_hours = 0.0
    counted_days = 0
    for d in last7:
        pids = on_day("package.picked", d)
        people = set().union(*[pickers_of.get((_text(sofs[p].get("SO_No")), _text(sofs[p].get("Package"))), set()) for p in pids if p in sofs]) if pids else set()
        if not people:
            continue
        hours_per_day = (await capacity_for(store, d.isoformat()))["hoursPerDay"]
        boxes_picked += sum(boxes_of(p) for p in pids)
        person_hours += len(people) * hours_per_day
        counted_days += 1
    per_person = {"value": round(boxes_picked / person_hours, 2) if person_hours > 0 else None, "days": counted_days, "boxes": _n(boxes_picked), "personHours": _n(person_hours)}

    # ---- rework rate (weekly, last 4 weeks) ----
    def exceptions_of(pid) -> list[dict]:
        sof = sofs.get(pid)
        if not sof:
            return []
        so, pkg = _text(sof.get("SO_No")), _text(sof.get("Package"))
        return [e for e in exceptions if _text(e.get("Sales_Order")) == so and (_text(e.get("PAC")) in ("", pkg))]

    def _bucket(e: dict, field: str) -> str:
        v = _text(e.get(field))
        return v if v not in ("", "Select") else "Not chosen yet"

    weeks, by_type, by_origin, seen_rework = [], {}, {}, set()
    this_monday = _monday(today_d)
    for w in range(3, -1, -1):
        start = this_monday - timedelta(days=7 * w)
        through = {pid for pid, evs in events_of.items() if any(n in ("package.qc_passed", "package.qc_rejected") and start <= t.date() < start + timedelta(days=7) for t, n in evs)}
        with_rework = {pid for pid in through if exceptions_of(pid)}
        for pid in with_rework - seen_rework:
            for e in exceptions_of(pid):
                by_type[_bucket(e, "Rework")] = by_type.get(_bucket(e, "Rework"), 0) + 1
                by_origin[_bucket(e, "Fault_Origin")] = by_origin.get(_bucket(e, "Fault_Origin"), 0) + 1
        seen_rework |= with_rework
        weeks.append({"weekStart": start.isoformat(), "throughQc": len(through), "withRework": len(with_rework),
                      "ratePct": round(100 * len(with_rework) / len(through), 1) if through else None})

    # ---- on-time dispatch (window) ----
    on_time = late = no_target = 0
    for pid, evs in events_of.items():
        sent = [t for t, n in evs if n == "package.dispatched" and t >= cutoff]
        if not sent:
            continue
        target = parse_time(sofs[pid].get("target_delivery_date")) if pid in sofs else None
        if target is None:
            no_target += 1
        elif max(sent).date() <= target.date():
            on_time += 1
        else:
            late += 1
    with_target = on_time + late

    return {
        "status": "success", "today": today_d.isoformat(), "windowDays": days,
        "timeInStage": time_in_stage,
        "receivedToPickGap": {"medianDays": round(gap / 24, 2) if gap is not None else None, "count": len(hours["ready_to_released"])},
        "boxesOut": {"today": box_days[-1]["boxes"], "days": box_days},
        "capacityUsed": capacity,
        "boxesPerPersonPerHour": per_person,
        "reworkRate": {"weeks": weeks, "byType": by_type, "byOrigin": by_origin},
        "onTimeDispatch": {"dispatched": with_target + no_target, "onTime": on_time, "late": late, "noTarget": no_target,
                           "pct": round(100 * on_time / with_target, 1) if with_target else None},
    }


CUSTOM_APIS["scoreboard_numbers"] = scoreboard_numbers
