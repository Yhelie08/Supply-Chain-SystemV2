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
    import app.delivery.time_window  # noqa: F401
    return create_hooked_store(raw)


def test_window_for_morning_before_noon():
    from app.delivery.time_window import window_for
    assert window_for("8:00 AM") == "Morning (8:00 AM–12:00 NN)"
    assert window_for("11:59 AM") == "Morning (8:00 AM–12:00 NN)"


def test_window_for_afternoon_from_noon():
    from app.delivery.time_window import window_for
    assert window_for("12:00 PM") == "Afternoon (12:00 NN–5:00 PM)"
    assert window_for("3:30 PM") == "Afternoon (12:00 NN–5:00 PM)"


def test_window_for_custom_workday_times():
    from app.delivery.time_window import window_for
    assert window_for("9:00 AM", "9:00 AM", "6:00 PM") == "Morning (9:00 AM–12:00 NN)"


def test_window_for_blank_or_unparseable_slot_is_empty():
    from app.delivery.time_window import window_for
    assert window_for("") == ""
    assert window_for(None) == ""
    assert window_for("not a time") == ""


async def test_widget_cannot_write_time_window_directly(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Time_Window": "Hacked"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Time_Window"] != "Hacked"


async def test_time_window_stamped_from_confirmed_time_slot(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Confirmed_Time_Slot": "9:00:00 AM"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Time_Window"] == "Morning (8:00 AM–12:00 NN)"


async def test_time_window_only_rewritten_when_it_actually_changes(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Confirmed_Time_Slot": "9:00:00 AM"})
    await store.update_record("Service_Appointment_Form", id_, {"Notes": "touch"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Time_Window"] == "Morning (8:00 AM–12:00 NN)"
    await store.update_record("Service_Appointment_Form", id_, {"Confirmed_Time_Slot": "2:00:00 PM"})
    row2 = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row2["Time_Window"] == "Afternoon (12:00 NN–5:00 PM)"


async def test_time_window_uses_policy_workday_times_when_set(raw, store):
    await raw.add_record("Policy_Settings", {"Policy_Key": "workday_start_time", "Value": "7:00 AM"})
    id_ = await store.add_record("Service_Appointment_Form", {"Confirmed_Time_Slot": "7:30:00 AM"})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert "7:00 AM" in row["Time_Window"]
