import pytest


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


def test_clock_parses_lenient_hh_mm_am_pm():
    from app.delivery.scheduling import clock
    assert clock("8:00 AM") == {"hour": 8, "minute": 0}
    assert clock("12:00 AM") == {"hour": 0, "minute": 0}
    assert clock("12:00 PM") == {"hour": 12, "minute": 0}
    assert clock("08:00:00 AM") == {"hour": 8, "minute": 0}
    assert clock("5:30 pm") == {"hour": 17, "minute": 30}


def test_clock_is_lenient_not_strict_unlike_settings_defs_validation():
    from app.delivery.scheduling import clock
    # Node's real clock() has no format rejection -- it parses whatever integers are there.
    assert clock("8:0 AM") == {"hour": 8, "minute": 0}
    assert clock("25:99 AM") == {"hour": 25, "minute": 99}


def test_clock_returns_none_for_non_clock_text():
    from app.delivery.scheduling import clock
    assert clock("") is None
    assert clock(None) is None
    assert clock("not a time") is None
    assert clock("8:00") is None  # only one part, no AM/PM


def test_stored_clock_converts_to_zoho_storage_format():
    from app.delivery.scheduling import stored_clock
    assert stored_clock("8:00 AM") == "08:00:00 AM"
    assert stored_clock("12:30 pm") == "12:30:00 PM"
    assert stored_clock("not a time") == "not a time"


def test_slot_text_adds_used_hours_to_the_start_time():
    from app.delivery.scheduling import slot_text
    assert slot_text("8:00 AM", 2.5) == "10:30 AM"
    assert slot_text("", 0) == "8:00 AM"
    assert slot_text("11:00 AM", 2) == "1:00 PM"


def test_r6_rounds_away_binary_noise():
    from app.delivery.scheduling import r6
    assert r6(4 * 1.15 * 60) == 276


def test_hrs_formats_two_decimals():
    from app.delivery.scheduling import hrs
    assert hrs(2.3) == "2.30"


def test_null_text_blank_is_literal_null_string():
    from app.delivery.scheduling import null_text
    assert null_text(None) == "null"
    assert null_text("") == "null"
    assert null_text("Sam") == "Sam"


def test_customer_name_from_object_or_plain_string():
    from app.delivery.scheduling import customer_name
    assert customer_name({"Customer_Name": {"first_name": "Jo", "last_name": "Cruz"}}) == "Jo Cruz"
    assert customer_name({"Customer_Name": {"first_name": "Jo"}}) == "Jo"
    assert customer_name({"Customer_Name": "Plain Name"}) == "Plain Name"
    assert customer_name({"Customer_Name": None}) == ""


def test_default_duration_by_delivery_type():
    from app.delivery.scheduling import default_duration
    assert default_duration("With Installation") == 4
    assert default_duration("Full-Day Install") == 8
    assert default_duration("Site Visit") == 1
    assert default_duration("Pullout") == 2


def test_normalize_type_maps_the_two_spellings():
    from app.delivery.scheduling import normalize_type
    assert normalize_type("Delivery and Installation") == "With Installation"
    assert normalize_type("Pull Out") == "Pullout"
    assert normalize_type("Site Visit") == "Site Visit"
    assert normalize_type(None) == ""


async def test_policy_reader_reads_saved_value_or_none(raw):
    from app.delivery.scheduling import policy_reader
    await raw.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "20"})
    policy = await policy_reader(raw)
    assert policy("max_days_scheduling_window") == "20"
    assert policy("nonexistent_key") is None


async def test_policy_reader_overrides_win_for_preview(raw):
    from app.delivery.scheduling import policy_reader
    await raw.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "20"})
    policy = await policy_reader(raw, {"max_days_scheduling_window": "99"})
    assert policy("max_days_scheduling_window") == "99"


def test_to_long_truncates_and_falls_back():
    from app.delivery.scheduling import to_long
    assert to_long("14", 9) == 14
    assert to_long(None, 9) == 9
    assert to_long("abc", 9) == 9
    assert to_long("14.9", 9) == 14


async def test_workday_length_from_policy_or_default_9(raw):
    from app.delivery.scheduling import policy_reader, workday_length
    policy_default = await policy_reader(raw)
    assert workday_length(policy_default) == 9
    policy = await policy_reader(raw, {"workday_start_time": "8:00 AM", "workday_end_time": "5:00 PM"})
    assert workday_length(policy) == 9  # 17 - 8 = 9


async def test_raise_exception_adds_once_not_twice_for_same_open_reason(raw):
    from app.delivery.scheduling import raise_exception
    rec = {"ID": "1", "Customer_Name": "X"}
    first = await raise_exception(raw, rec, stage="Scheduling", reason="Calendar Full", severity="Medium")
    assert first is True
    second = await raise_exception(raw, rec, stage="Scheduling", reason="Calendar Full", severity="Medium")
    assert second is False
    rows = await raw.find("DMS_Exception_Queue")
    assert len(rows) == 1
    assert rows[0]["Status"] == "Open"


async def test_schedule_slot_record_not_found_is_error(raw):
    from app.delivery.scheduling import schedule_slot
    out = await schedule_slot(raw, "999999999", False)
    assert out["status"] == "error"
    assert out["message"] == "Record not found."


async def test_schedule_slot_blocked_when_completed_or_failed(raw):
    from app.delivery.scheduling import schedule_slot
    id_ = await raw.add_record("Service_Appointment_Form", {"Appointment_Status": "Completed"})
    out = await schedule_slot(raw, id_, False)
    assert out["status"] == "blocked"


async def test_schedule_slot_skipped_for_pick_up_real(raw):
    from app.delivery.scheduling import schedule_slot
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Pick Up"})
    out = await schedule_slot(raw, id_, False)
    assert out["status"] == "skipped"


async def test_schedule_slot_blocked_when_flagged_and_not_rerun(raw):
    from app.delivery.scheduling import schedule_slot
    id_ = await raw.add_record("Service_Appointment_Form", {"Exception_Status": "Flagged"})
    out = await schedule_slot(raw, id_, False)
    assert out["status"] == "blocked"


async def test_schedule_slot_resolves_flag_on_rerun_then_continues(raw):
    from app.delivery.scheduling import schedule_slot
    id_ = await raw.add_record("Service_Appointment_Form", {"Exception_Status": "Flagged", "Type_of_Delivery": "Pick Up"})
    out = await schedule_slot(raw, id_, True)
    # Pick Up is skipped regardless, but the flag resolution write still goes through via `finish`
    assert out["status"] == "skipped"


async def test_schedule_slot_flags_multi_day_install_as_manual(raw):
    from app.delivery.scheduling import schedule_slot
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Multi-Day Install"})
    out = await schedule_slot(raw, id_, False)
    assert out["status"] == "flagged"
    assert "Multi-Day Install" in out["message"]
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Exception_Status"] == "Flagged"
    assert row["Exception_Reason"] == "Requires Manual Planning"


async def test_schedule_slot_no_team_available_flags_calendar_full(raw):
    from app.delivery.scheduling import schedule_slot
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation"})
    out = await schedule_slot(raw, id_, False)
    assert out["status"] == "flagged"
    assert "Calendar Full" in out["message"]
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Exception_Reason"] == "Calendar Full"
    assert row["Suggested_Schedule_Date"] == ""


async def test_schedule_slot_finds_a_team_and_suggests(raw):
    from app.delivery.scheduling import schedule_slot
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Driver": "Sam", "Vehicle": "Van 1", "Max_Capacity_Hours": "9", "Start_Time1": "8:00 AM"})
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation", "Estimated_Duration": "2"})
    out = await schedule_slot(raw, id_, False)
    assert out["status"] == "success"
    assert out["installer"] == "Team A"
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Appointment_Status"] == "Queued"
    assert row["Installer"] == "Team A"
    assert row["Fleet_Assignment"] == "Van 1"
    assert row["Suggested_Time_Slot"] == "08:00:00 AM"  # 2hrs * 1.15 buffer = 2.3h, still starts at 8:00


async def test_schedule_slot_priority_auto_confirms_when_room(raw):
    from app.delivery.scheduling import schedule_slot
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Max_Capacity_Hours": "9", "Start_Time1": "8:00 AM"})
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "With Installation", "Estimated_Duration": "2", "Priority": True, "Sales_Order": "SO-1"})
    out = await schedule_slot(raw, id_, False)
    assert out["status"] == "success"
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Appointment_Status"] == "Scheduled"
    assert row["Calendar_Entry_Created"] is True
    assert row["Confirmed_Schedule_Date"] == tomorrow


async def test_dms_reschedule_custom_api_is_registered(raw):
    from app.custom_apis import invoke_custom_api
    import app.delivery.scheduling  # noqa: F401
    id_ = await raw.add_record("Service_Appointment_Form", {"Type_of_Delivery": "Pick Up"})
    out = await invoke_custom_api("dms_reschedule", {"recordId": id_}, raw, {"user": "dispatcher@x"})
    assert out["status"] == "skipped"
