import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.forecast.forecast_settings import forecast_settings, forecast_values, plan_numbers, ENGINE_DEFAULTS


@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.mark.asyncio
async def test_no_rows_at_all_gives_exactly_the_engine_defaults(store):
    s = await forecast_settings(store)
    assert s == ENGINE_DEFAULTS


@pytest.mark.asyncio
async def test_a_legacy_forecast_settings_record_is_read_when_no_procurement_settings_rows_exist(store):
    await store.add_record("Forecast_Settings", {"Air_Transit_Min": "4", "Prep_Days_Thru_QC": "5"})
    s = await forecast_settings(store)
    assert s["airTMin"] == 4
    assert s["prepMin"] == 5


@pytest.mark.asyncio
async def test_a_procurement_settings_row_overrides_its_one_field_and_keeps_the_rest(store):
    await store.add_record("Forecast_Settings", {"Air_Transit_Min": "4", "Prep_Days_Thru_QC": "5"})
    await store.add_record("Procurement_Settings", {"Setting_Key": "transit_air_min_days", "Value": "9"})
    s = await forecast_settings(store)
    assert s["airTMin"] == 9
    assert s["prepMin"] == 5  # untouched: no Procurement_Settings row for this key


@pytest.mark.asyncio
async def test_an_override_passed_directly_wins_over_a_saved_row(store):
    await store.add_record("Procurement_Settings", {"Setting_Key": "transit_air_min_days", "Value": "9"})
    s = await forecast_settings(store, overrides={"transit_air_min_days": "20"})
    assert s["airTMin"] == 20


@pytest.mark.asyncio
async def test_forecast_values_reports_the_source_of_each_key(store):
    await store.add_record("Forecast_Settings", {"Air_Transit_Min": "4"})
    await store.add_record("Procurement_Settings", {"Setting_Key": "transit_lcl_min_days", "Value": "40"})
    values = await forecast_values(store)
    assert values["transit_air_min_days"]["source"] == "legacy"
    assert values["transit_lcl_min_days"]["source"] == "saved"
    assert values["delivery_days"]["source"] == "default"


def test_plan_numbers_takes_the_middle_of_each_range():
    f = {**ENGINE_DEFAULTS, "airTMin": 5, "airTMax": 7, "lclTMin": 35, "lclTMax": 60, "fclTMin": 35, "fclTMax": 60,
         "airCMin": 2, "airCMax": 3, "lclCMin": 7, "lclCMax": 10, "fclCMin": 7, "fclCMax": 10, "prepMin": 7, "delMin": 0}
    p = plan_numbers(f)
    assert p["transit_air_days"] == 6
    assert p["fulfillment_days"] == 7
    assert p["delivery_days"] == 0
