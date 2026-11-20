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
    import app.delivery.delivery_scheduling_hooks  # noqa: F401
    return create_hooked_store(raw)


async def test_teams_without_availability_blank_when_date_or_installer_missing(raw):
    from app.delivery.delivery_scheduling_hooks import teams_without_availability
    assert await teams_without_availability({"Date_field": "", "Installer": "Team A"}, raw) == []
    assert await teams_without_availability({"Date_field": "2026-12-01", "Installer": ""}, raw) == []


async def test_teams_without_availability_lists_missing_installers(raw):
    from app.delivery.delivery_scheduling_hooks import teams_without_availability
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": "2026-12-01", "Installer": "Team A", "Availability_Status": "Available"})
    out = await teams_without_availability({"Date_field": "2026-12-01", "Installer": ["Team A", "Team B"]}, raw)
    assert out == ["Team B"]


async def test_teams_without_availability_excludes_not_available_rows(raw):
    from app.delivery.delivery_scheduling_hooks import teams_without_availability
    await raw.add_record("Daily_Team_Availability", {"Availability_Date": "2026-12-01", "Installer": "Team A", "Availability_Status": "Not Available"})
    out = await teams_without_availability({"Date_field": "2026-12-01", "Installer": "Team A"}, raw)
    assert out == ["Team A"]


async def test_the_save_goes_ahead_even_when_team_has_no_availability_record(raw, store):
    # Zoho only shows an alert and never cancels the save -- this ports it as a non-blocking log.
    id_ = await store.add_record("Delivery_Scheduling", {"Date_field": "2026-12-01", "Installer": "Team Z"})
    assert id_  # the write went through, nothing raised
