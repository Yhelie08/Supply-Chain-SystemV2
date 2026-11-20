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
    import app.delivery.confirmation  # noqa: F401
    return create_hooked_store(raw)


async def test_confirm_appointment_trigger_stamps_once_and_clears(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Confirm_Appointment": True})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert row["Appointment_Confirmed_At"]
    assert row.get("Confirm_Appointment") in (False, "false", None)


async def test_second_confirm_trigger_is_a_no_op_keeps_first_timestamp(raw, store):
    id_ = await store.add_record("Service_Appointment_Form", {"Confirm_Appointment": True})
    first = (await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True))["Appointment_Confirmed_At"]
    await store.update_record("Service_Appointment_Form", id_, {"Confirm_Appointment": True})
    second = (await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True))["Appointment_Confirmed_At"]
    assert first == second


async def test_false_trigger_is_dropped_not_stamped(raw, store):
    from app.deluge import blank
    id_ = await store.add_record("Service_Appointment_Form", {"Confirm_Appointment": False})
    row = await raw.get_record_by_id("Service_Appointment_Form", id_, raw=True)
    assert blank(row.get("Appointment_Confirmed_At"))


async def test_run_confirm_cutoff_check_alerts_unconfirmed_for_tomorrow(raw):
    from app.delivery.confirmation import run_confirm_cutoff_check
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Service_Appointment_Form", {"Confirmed_Schedule_Date": tomorrow, "Appointment_Status": "Scheduled"})
    out = await run_confirm_cutoff_check(raw)
    assert out["checked"] == 1
    assert out["alerted"] == 1
    rows = await raw.find("DMS_Exception_Queue")
    assert len(rows) == 1
    assert rows[0]["Exception_Reason"] == "Unconfirmed by cutoff"


async def test_run_confirm_cutoff_check_skips_already_confirmed(raw):
    from app.delivery.confirmation import run_confirm_cutoff_check
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Service_Appointment_Form", {"Confirmed_Schedule_Date": tomorrow, "Appointment_Status": "Scheduled", "Appointment_Confirmed_At": "2026-11-20 10:00:00 AM"})
    out = await run_confirm_cutoff_check(raw)
    assert out["alerted"] == 0


async def test_run_confirm_cutoff_check_skips_done_statuses(raw):
    from app.delivery.confirmation import run_confirm_cutoff_check
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Service_Appointment_Form", {"Confirmed_Schedule_Date": tomorrow, "Appointment_Status": "Completed"})
    out = await run_confirm_cutoff_check(raw)
    assert out["alerted"] == 0
