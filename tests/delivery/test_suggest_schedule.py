import pytest


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def test_pick_up_needs_no_team(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Pick Up"})
    out = await suggest_schedule(raw, id_)
    assert out["status"] == "no_team_needed"


async def test_not_found_record(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    out = await suggest_schedule(raw, "999999999")
    assert out["status"] == "not_found"


async def test_suggests_earliest_team_when_room(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Max_Capacity_Hours": "9"})
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Drop Off", "Estimated_Duration": "2"})
    out = await suggest_schedule(raw, id_)
    assert out["status"] == "suggested"
    assert out["installer"] == "Team A"
    assert out["date"] == tomorrow


async def test_dropoff_past_target_suggests_third_party(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    from app.deluge import ymd, add_days, today_date
    far = ymd(add_days(today_date(), 10))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": far, "Installer": "Team A", "Max_Capacity_Hours": "9"})
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Drop Off", "Estimated_Duration": "2", "Requested_Delivery_Date": ymd(add_days(today_date(), 2))})
    out = await suggest_schedule(raw, id_)
    assert out["status"] == "third_party_suggested"
    assert out["approvalId"]
    rows = await raw.find("Approval_Queue")
    assert len(rows) == 1
    assert rows[0]["Kind"] == "third_party_booking"


async def test_dropoff_third_party_approval_deduped_on_second_call(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    from app.deluge import ymd, add_days, today_date
    far = ymd(add_days(today_date(), 10))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": far, "Installer": "Team A", "Max_Capacity_Hours": "9"})
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Drop Off", "Estimated_Duration": "2", "Requested_Delivery_Date": ymd(add_days(today_date(), 2))})
    first = await suggest_schedule(raw, id_)
    second = await suggest_schedule(raw, id_)
    assert second["approvalId"] == first["approvalId"]
    assert len(await raw.find("Approval_Queue")) == 1


async def test_installation_with_no_slot_escalates(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation", "Estimated_Duration": "2"})
    out = await suggest_schedule(raw, id_)
    assert out["status"] == "escalated"
    assert out["approvalId"]
    rows = await raw.find("Approval_Queue")
    assert rows[0]["Kind"] == "schedule_shortfall"


async def test_dropoff_with_no_slot_is_no_slot_not_escalated(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Drop Off", "Estimated_Duration": "2"})
    out = await suggest_schedule(raw, id_)
    assert out["status"] == "no_slot"
    assert len(await raw.find("Approval_Queue")) == 0


async def test_prefers_team_already_going_to_same_city(raw):
    from app.delivery.suggest_schedule import suggest_schedule
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Max_Capacity_Hours": "9"})
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team B", "Max_Capacity_Hours": "9"})
    await raw.add_record("Service_Appointment_Form", {"Installer": "Team B", "Confirmed_Schedule_Date": tomorrow, "City": "Quezon City", "Appointment_Status": "Scheduled"})
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Drop Off", "Estimated_Duration": "1", "City": "Quezon City"})
    out = await suggest_schedule(raw, id_)
    assert out["status"] == "suggested"
    assert out["installer"] == "Team B"
