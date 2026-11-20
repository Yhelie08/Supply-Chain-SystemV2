import pytest


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def store(raw):
    from app.workflows import create_hooked_store
    import app.delivery.scheduling_engine  # noqa: F401
    return create_hooked_store(raw)


async def test_action1_runs_engine_when_site_confirmed_and_no_dates(raw, store):
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Max_Capacity_Hours": "9", "Start_Time1": "8:00 AM"})
    id_ = await store.add_record("Service_Appointment_Form", {"Site_Confirmation_Status": "Confirmed", "Type_of_Delivery": "With Installation", "Estimated_Duration": "2"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Appointment_Status"] == "Queued"
    assert row["Installer"] == "Team A"


async def test_action1_does_not_run_when_already_has_a_suggested_date(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Site_Confirmation_Status": "Confirmed", "Suggested_Schedule_Date": "2026-12-01"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Appointment_Status"] != "Queued"


async def test_action2_pick_up_confirms_at_once_no_team(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Pick Up", "Confirmed_Schedule_Date": "2026-12-01", "Confirmed_Time_Slot": "9:00:00 AM"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Fleet_Assignment"] == "Customer Pickup"
    assert row["Calendar_Entry_Created"] is True
    assert row["Appointment_Status"] == "Scheduled"


async def test_action2_third_party_confirms_at_once(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation", "Confirmed_Schedule_Date": "2026-12-01", "Fleet_Decision": "3rd Party"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Calendar_Entry_Created"] is True
    assert row["Appointment_Status"] == "Scheduled"
    assert "3rd Party" in row["Calendar_Event_Summary"] or "3rd-party" in row["Calendar_Event_Summary"]


async def test_action2_capacity_exceeded_without_override_is_blocked(raw, store):
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": "2026-12-01", "Installer": "Team A", "Max_Capacity_Hours": "2"})
    id_ = await store.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation", "Estimated_Duration": "3", "Confirmed_Schedule_Date": "2026-12-01", "Installer": "Team A", "Suggested_Schedule_Date": "2026-12-01"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Exception_Status"] == "Flagged"
    assert row["Exception_Reason"] == "Calendar Conflict"
    assert row.get("Calendar_Entry_Created") in (None, False, "false")


async def test_action2_override_bypasses_capacity_check(raw, store):
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": "2026-12-01", "Installer": "Team A", "Max_Capacity_Hours": "2"})
    id_ = await store.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation", "Estimated_Duration": "3", "Confirmed_Schedule_Date": "2026-12-01", "Confirmed_Time_Slot": "9:00:00 AM", "Installer": "Team A", "Override_Reason": "ASAP customer request"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Override_Applied"] is True
    assert row["Calendar_Entry_Created"] is True
    assert "ASAP" in row["Calendar_Event_Summary"] or "Exceeds Daily Capacity" in row["Calendar_Event_Summary"]


async def test_action3_tags_completed_once(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Calendar_Event_Summary": "Title: X"})
    await store.update_record("Service_Appointment_Form", id_, {"Appointment_Status": "Completed"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Calendar_Event_Summary"].count("[Completed]") == 1
    await store.update_record("Service_Appointment_Form", id_, {"Notes": "touch"})
    row2 = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row2["Calendar_Event_Summary"].count("[Completed]") == 1


async def test_action4_converts_to_pickup_releases_team(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation", "Installer": "Team A"})
    await store.update_record("Service_Appointment_Form", id_, {"Type_of_Delivery": "Pick Up"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Installer"] == ""
    assert row["Fleet_Assignment"] == "Customer Pickup"
    assert row["Appointment_Status"] == "Queued"
