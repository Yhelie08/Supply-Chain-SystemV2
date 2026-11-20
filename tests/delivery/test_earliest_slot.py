import pytest
from datetime import datetime


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def test_find_earliest_slot_no_team_scheduled_any_day_reports_not_found(raw):
    from app.delivery.earliest_slot import find_earliest_slot
    out = await find_earliest_slot(raw, job_type="With Installation")
    assert out["found"] is False
    assert "no team available" in out["reason"].lower()


async def test_find_earliest_slot_finds_a_team_with_room(raw):
    from app.delivery.earliest_slot import find_earliest_slot
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Driver": "Sam", "Vehicle": "Van 1", "Max_Capacity_Hours": "9"})
    out = await find_earliest_slot(raw, job_type="With Installation", est_minutes=120)
    assert out["found"] is True
    assert out["date"] == tomorrow
    assert out["installer"] == "Team A"
    assert "Earliest is" in out["reason"]


async def test_find_earliest_slot_skips_on_leave_teams(raw):
    from app.delivery.earliest_slot import find_earliest_slot
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Availability_Status": "Not Available"})
    day_after = ymd(add_days(today_date(), 2))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": day_after, "Installer": "Team B", "Max_Capacity_Hours": "9"})
    out = await find_earliest_slot(raw, job_type="With Installation", est_minutes=120)
    assert out["found"] is True
    assert out["date"] == day_after
    assert out["installer"] == "Team B"
    assert "on leave" in out["reason"]


async def test_find_earliest_slot_accounts_for_active_holds(raw):
    from app.delivery.earliest_slot import find_earliest_slot
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Max_Capacity_Hours": "3"})
    now = datetime.now()
    await raw.add_record("Schedule_Holds", {"Installer": "Team A", "Hold_Date": tomorrow, "Hours": "2", "Expires_At": "2099-01-01 12:00:00 PM", "Released": False})
    out = await find_earliest_slot(raw, job_type="With Installation", est_minutes=120, now=now)
    # 3h cap, 2h held, buffered ~2.3h needed -- no room on tomorrow, should push further
    assert out["found"] is False or out["date"] != tomorrow


async def test_teams_with_room_on_sorts_by_most_remaining_capacity(raw):
    from app.delivery.earliest_slot import teams_with_room_on
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": "2026-12-01", "Installer": "Team A", "Max_Capacity_Hours": "9"})
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": "2026-12-01", "Installer": "Team B", "Max_Capacity_Hours": "5"})
    out = await teams_with_room_on(raw, "2026-12-01", job_type="With Installation", est_minutes=60)
    assert [t["installer"] for t in out] == ["Team A", "Team B"]


async def test_quote_and_hold_creates_a_hold_with_expiry(raw):
    from app.delivery.earliest_slot import quote_and_hold
    from app.deluge import ymd, add_days, today_date
    tomorrow = ymd(add_days(today_date(), 1))
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": tomorrow, "Installer": "Team A", "Max_Capacity_Hours": "9"})
    out = await quote_and_hold(raw, job_type="With Installation", est_minutes=120, quoted_by="agent@x", sr_no="SR-1")
    assert out["found"] is True
    assert out["holdId"]
    rows = await raw.find("Schedule_Holds")
    assert len(rows) == 1
    assert rows[0]["Installer"] == "Team A"
    assert rows[0]["Service_Request_No"] == "SR-1"
    assert rows[0]["Released"] in (False, "false")


async def test_quote_and_hold_no_slot_returns_not_found_no_hold_created(raw):
    from app.delivery.earliest_slot import quote_and_hold
    out = await quote_and_hold(raw, job_type="With Installation")
    assert out["found"] is False
    assert len(await raw.find("Schedule_Holds")) == 0


async def test_release_hold_marks_released(raw):
    from app.delivery.earliest_slot import release_hold
    id_ = await raw.add_record("Schedule_Holds", {"Installer": "Team A", "Released": False})
    await release_hold(raw, id_)
    row = await raw.get_record_by_id("Schedule_Holds", id_, raw=True)
    assert row["Released"] is True


async def test_release_hold_blank_id_is_a_no_op(raw):
    from app.delivery.earliest_slot import release_hold
    await release_hold(raw, "")  # must not raise
    await release_hold(raw, None)  # must not raise
