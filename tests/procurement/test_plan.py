import pytest
from app.procurement.plan import DEFAULT_SETTINGS, SPEC_NUMBERS, feasibility, planned_chain, forecast_chain, parse_lead_days
from app.deluge import add_days, ymd, today_date

S = {**DEFAULT_SETTINGS, **SPEC_NUMBERS}  # the spec's worked example: LCL 30, Air 14, fulfillment 3, delivery 2
TODAY = today_date()


# Node: 'feasibility: the spec example (target 20 days away, lead 20, LCL) is impossible, 41 days short, and Air is still 25 short'
def test_feasibility_spec_example_is_impossible_41_days_short_air_still_25_short():
    f = feasibility(S, po_date=TODAY, production_days=20, mode="LCL", target=add_days(TODAY, 20))
    assert f["feasibility"] == "impossible"
    assert f["shortfall_days"] == 41  # 1 + 20 + 3 + 30 + 2 + 3 + 2 = 61 days needed
    assert f["air_saving_days"] == 16
    assert f["air_shortfall_days"] == 25
    assert "Even by air" in f["air_option"]


# Node: 'feasibility: feasible with room, at_risk with little slack, and Air can rescue a late LCL line'
def test_feasibility_feasible_at_risk_and_air_rescue_cases():
    assert feasibility(S, po_date=TODAY, production_days=20, mode="LCL", target=add_days(TODAY, 90))["feasibility"] == "feasible"
    assert feasibility(S, po_date=TODAY, production_days=20, mode="LCL", target=add_days(TODAY, 63))["feasibility"] == "at_risk"
    f = feasibility(S, po_date=TODAY, production_days=20, mode="LCL", target=add_days(TODAY, 50))
    assert f["feasibility"] == "impossible"
    assert "Air saves 16 days -> feasible" in f["air_option"]


# Node: 'planned chain: production starts PO + 1; planned arrival = PO + 1 + production + consolidation + transit + receiving'
def test_planned_chain_dates_for_an_air_shipment():
    p = planned_chain(S, po_date="2026-01-01", production_days=20, mode="Airfreight")
    assert ymd(p["production_start"]) == "2026-01-02"
    assert ymd(p["production_end"]) == "2026-01-22"
    assert ymd(p["shipout"]) == "2026-01-25"
    assert ymd(p["arrival"]) == "2026-02-08"  # air: 14 days
    assert ymd(p["receive"]) == "2026-02-10"


# Node: 'forecast uses actual dates where they exist and never plans a stage in the past'
def test_forecast_chain_never_plans_a_stage_in_the_past():
    f = forecast_chain(S, po_date=add_days(TODAY, -40), production_days=20, mode="LCL", today=TODAY,
                        actual={"production_started": add_days(TODAY, -39)})
    assert f["shipout"] >= TODAY and f["arrival"] >= TODAY and f["pickable"] >= TODAY
    g = forecast_chain(S, po_date=add_days(TODAY, -40), production_days=20, mode="LCL", today=TODAY,
                        actual={"production_started": add_days(TODAY, -39), "production_finished": add_days(TODAY, -20), "shipped_out": add_days(TODAY, -10)})
    assert ymd(g["arrival"]) == ymd(add_days(TODAY, 20))  # shipped 10 days ago + 30 transit


# Node: 'INQ-R3: a lead time typed as text is read as days (a range takes the larger number)'
@pytest.mark.parametrize("text,days", [
    ("20", 20), ("20 days", 20), ("3 weeks", 21), ("2-3 weeks", 21), ("1 month", 30),
    ("20天", 20), ("2周", 14), ("", 0), ("soon", 0), (None, 0), ("12.5 days", 13),
])
def test_parse_lead_days_matches_the_node_cases(text, days):
    assert parse_lead_days(text) == days


@pytest.mark.asyncio
async def test_load_settings_merges_stored_overrides_over_defaults(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.procurement.settings_defs import default_settings
    from app.procurement.plan import load_settings

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    settings = await load_settings(store)
    defaults = default_settings()
    assert set(defaults).issubset(set(settings))
