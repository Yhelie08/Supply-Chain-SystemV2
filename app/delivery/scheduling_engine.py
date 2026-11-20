# SA_Scheduling_Engine, ported from zoho-export/parsed/workflows/form/Service_Appointment_Form/
# SA_Scheduling_Engine__1..4.dg (via Node's scheduling-engine.mjs). One Zoho workflow with four
# actions, all "on add or edit, on success". They run in order, and each one reads `input` as it
# was when the save finished (Action 2 does not see what Action 1 wrote in the same save), while
# the record it changes is read fresh from the database.
#   1. Site confirmed and no dates yet: run the scheduling engine (scheduling.py).
#   2. A confirmed date without a calendar entry: Pick Up and 3rd Party confirm at once;
#      otherwise flag an override, check the team's capacity for that day, write the calendar
#      summary and mark the appointment Scheduled.
#   3. Completed (or Failed with a calendar entry): tag the calendar summary once.
#   4. A Pick Up that still has an installer: release the team and confirm (or queue) the pickup.
# The four are four hooks, so an error in one is logged and does not skip the others.
#
# Quirks kept ("mirrors Zoho"): Action 3's `or` means Failed only counts when a calendar entry
# exists. Numbers in summaries print with two decimals, a blank team prints "null".
from app.criteria import zoho_now
from app.delivery.locks import with_lock
from app.delivery.scheduling import SA, customer_name, day, default_duration, hrs, normalize_type, null_text, policy_reader, r6, raise_exception, schedule_slot, to_long
from app.deluge import blank, same_value, to_num, truthy
from app.workflows import register


async def _fresh(store, id_):
    return await store.get_record_by_id(SA, id_, raw=True)


async def _save(store, id_, changes: dict):
    if changes:
        return await store.update_record(SA, id_, changes, by_form=True)
    return None


def _hours_text(n, full_day: bool) -> str:
    return str(n) if full_day else hrs(n)


# Action 1
async def run_engine(args: dict) -> None:
    record, store, user = args["record"], args["store"], args.get("user", "")
    if record.get("Site_Confirmation_Status") == "Confirmed" and blank(record.get("Suggested_Schedule_Date")) and blank(record.get("Confirmed_Schedule_Date")):
        await schedule_slot(store, args["id"], False, {"user": user})


# Action 2
def confirm_calendar(args: dict):
    return with_lock("scheduling", lambda: _confirm_calendar_now(args))


async def _confirm_calendar_now(args: dict) -> None:
    id_, input_, store, user = args["id"], args["record"], args["store"], args.get("user", "")
    if blank(input_.get("Confirmed_Schedule_Date")) or truthy(input_.get("Calendar_Entry_Created")):
        return
    rec = await _fresh(store, id_)
    type_raw = input_.get("Type_of_Delivery") or ""
    d_type = normalize_type(type_raw)
    time_slot = "" if blank(rec.get("Confirmed_Time_Slot")) else str(rec.get("Confirmed_Time_Slot"))
    changes: dict = {}
    head = f"Title: {null_text(rec.get('Sales_Order'))} - {customer_name(rec)} | Date: {day(rec.get('Confirmed_Schedule_Date'))} | Time: {time_slot}"

    if d_type == "Pick Up":
        changes["Fleet_Assignment"] = "Customer Pickup"
        changes["Calendar_Event_Summary"] = f"{head} | Type: Pick Up | Notes: Customer/dispatcher-scheduled pickup, no delivery team assigned"
        changes["Calendar_Entry_Created"] = True
        changes["Appointment_Status"] = "Scheduled"
        await _save(store, id_, changes)
        return
    if input_.get("Fleet_Decision") == "3rd Party":
        fleet = "3rd Party" if blank(rec.get("Fleet_Assignment")) else rec.get("Fleet_Assignment")
        changes["Calendar_Event_Summary"] = f"{head} | Fleet: {fleet} | Notes: 3rd-party courier, no internal team assigned"
        changes["Calendar_Entry_Created"] = True
        changes["Appointment_Status"] = "Scheduled"
        await _save(store, id_, changes)
        return

    is_override = blank(input_.get("Suggested_Schedule_Date")) or not same_value(input_.get("Confirmed_Schedule_Date"), input_.get("Suggested_Schedule_Date")) or not same_value(input_.get("Confirmed_Time_Slot"), input_.get("Suggested_Time_Slot"))
    if is_override:
        changes["Override_Applied"] = True
        changes["Override_Timestamp"] = zoho_now()

    team_cap = 8
    availability = await store.find("Daily_Team_Availability", lambda a: day(a.get("Availability_Date")) == day(input_.get("Confirmed_Schedule_Date")) and a.get("Installer") == input_.get("Installer"))
    for a in availability:
        if to_num(a.get("Max_Capacity_Hours")) > 0:
            team_cap = to_num(a.get("Max_Capacity_Hours"))
    policy = await policy_reader(store)
    factor = 1 + to_long(policy("traffic_buffer_percent"), 15) / 100
    my_duration = to_num(input_.get("Estimated_Duration"))
    if my_duration == 0:
        my_duration = default_duration(d_type)
    full_day = d_type == "Full-Day Install"
    my_buffered = 8 if full_day else r6(my_duration * factor)
    others = await store.find(SA, lambda r: r.get("Installer") == input_.get("Installer") and day(r.get("Confirmed_Schedule_Date")) == day(input_.get("Confirmed_Schedule_Date")) and truthy(r.get("Calendar_Entry_Created")) and str(r["ID"]) != str(id_))
    other_hours = 0.0
    for o in others:
        other_hours = r6(other_hours + (8 if o.get("Type_of_Delivery") == "Full-Day Install" else r6(to_num(o.get("Estimated_Duration")) * factor)))
    projected = r6(other_hours + my_buffered)
    capacity_exceeded = projected > team_cap

    if capacity_exceeded and not is_override:
        changes["Exception_Status"] = "Flagged"
        changes["Exception_Reason"] = "Calendar Conflict"
        await _save(store, id_, changes)
        await raise_exception(store, rec, stage="Calendar", reason="Calendar Conflict", severity="High", user=user)
        return

    city_suffix = "" if blank(rec.get("City")) else f", {rec.get('City')}"
    where = f"{rec.get('Customer_Address') or ''}{city_suffix}"
    notes = f"Override: {rec.get('Override_Reason') or ''}" if is_override else ""
    if capacity_exceeded:
        notes = f"{notes}{' | ' if notes != '' else ''}ASAP - Exceeds Daily Capacity ({hrs(projected)} / {team_cap} hrs)"
    changes["Calendar_Event_Summary"] = f"{head} ({_hours_text(my_buffered, full_day)} hrs) | Team: {null_text(rec.get('Installer'))} / {null_text(rec.get('Assigned_to_Driver'))} | Fleet: {null_text(rec.get('Fleet_Assignment'))} | Type: {'-' if blank(type_raw) else type_raw} | Location: {where} | Notes: {notes}"
    if (rec.get("Exception_Status") == "Flagged" and rec.get("Exception_Reason") == "Calendar Conflict") or rec.get("Exception_Reason") in ("Calendar Full", "Slot Pushed — Overtime Declined"):
        changes["Exception_Status"] = "Resolved"
    changes["Calendar_Entry_Created"] = True
    changes["Appointment_Status"] = "Scheduled"
    await _save(store, id_, changes)


# Action 3
async def tag_finished_status(args: dict) -> None:
    id_, input_, store = args["id"], args["record"], args["store"]
    status = input_.get("Appointment_Status")
    if not (status == "Completed" or (status == "Failed" and truthy(input_.get("Calendar_Entry_Created")))):
        return
    tag = f"[{status}]"
    if blank(input_.get("Calendar_Event_Summary")) or tag not in str(input_.get("Calendar_Event_Summary")):
        rec = await _fresh(store, id_)
        await _save(store, id_, {"Calendar_Event_Summary": f"{rec.get('Calendar_Event_Summary') or ''} {tag}"})


# Action 4
async def convert_to_pick_up(args: dict) -> None:
    id_, input_, store = args["id"], args["record"], args["store"]
    if input_.get("Type_of_Delivery") != "Pick Up" or blank(input_.get("Installer")):
        return
    rec = await _fresh(store, id_)
    changes = {"Installer": "", "Assigned_to_Driver": "", "Suggested_Schedule_Date": "", "Suggested_Time_Slot": "", "Fleet_Assignment": "Customer Pickup"}
    if not blank(input_.get("Confirmed_Schedule_Date")):
        time_slot = "" if blank(input_.get("Confirmed_Time_Slot")) else str(input_.get("Confirmed_Time_Slot"))
        changes["Calendar_Event_Summary"] = f"Title: {null_text(rec.get('Sales_Order'))} - {customer_name(rec)} | Date: {day(rec.get('Confirmed_Schedule_Date'))} | Time: {time_slot} | Type: Pick Up | Notes: Converted from delivery to Pick Up - original team released"
        changes["Calendar_Entry_Created"] = True
        changes["Appointment_Status"] = "Scheduled"
    else:
        changes["Calendar_Entry_Created"] = False
        changes["Appointment_Status"] = "Queued"
    await _save(store, id_, changes)


_actions = [run_engine, confirm_calendar, tag_finished_status, convert_to_pick_up]
register(SA, {"afterAdd": _actions, "afterUpdate": _actions})
