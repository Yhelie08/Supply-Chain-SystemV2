from datetime import date
from app.forecast.engine import compute_forecast, settings_from, DEFAULT_SETTINGS


def d(y, m, day):
    return date(y, m, day)


TODAY = d(2026, 11, 12)
BASE = {
    "today": TODAY, "settings": DEFAULT_SETTINGS, "stage": "", "stockOnHand": False, "modeVal": "",
    "sourcing": "", "supLead": 0, "prAdded": None, "prepStart": None, "prepFound": False,
    "dateShipped": None, "shipStatus": "", "clientTarget": None,
}


def run(**extra):
    return compute_forecast({**BASE, **extra})


def test_settings_no_record_means_the_defaults():
    assert settings_from(None) == DEFAULT_SETTINGS


def test_settings_an_empty_field_keeps_its_default_local_and_prep_days_set_both_ends():
    s = settings_from({
        "Air_Transit_Min": "4", "Air_Transit_Max": "", "Local_Transit_Days": "3",
        "Prep_Days_Thru_QC": "5", "Delivery_Days": "2",
        "Re_anchor_on_Latest_Real_Event": "true", "Include_Supplier_Lead_Time": "false",
    })
    assert (s["airTMin"], s["airTMax"]) == (4, 7)
    assert (s["locTMin"], s["locTMax"], s["prepMin"], s["prepMax"], s["delMin"], s["delMax"]) == (3, 3, 5, 5, 2, 2)
    assert (s["reAnchor"], s["addSupLead"]) == (True, False)


def test_mirrors_zoho_with_a_settings_record_the_two_switches_are_read_as_written():
    s = settings_from({})
    assert (s["reAnchor"], s["addSupLead"]) == (False, False)
    assert settings_from({"Re_anchor_on_Latest_Real_Event": True})["reAnchor"] is True
    assert settings_from({"Include_Supplier_Lead_Time": "TRUE"})["addSupLead"] is True


def test_for_delivery_ready_now_with_no_days_to_add():
    r = run(stage="For Delivery")
    assert (r["skip"], r["delivery"], r["position"], r["bucket"]) == (False, "2026-11-12", "Ready", "LCL?")
    assert r["window"] == "Nov 12 - Nov 12, 2026 | LCL? | Ready"
    assert r["status"] == "No Client Date"


def test_a_prep_stage_counts_days_not_yet_used_from_when_prep_started():
    r = run(stage="Picking", prepFound=True, prepStart=d(2026, 11, 9))  # 3 of 7 days used
    assert (r["earliest"], r["latest"], r["delivery"], r["position"]) == ("2026-11-16", "2026-11-16", "2026-11-16", "Picking")
    over = run(stage="Pack", prepFound=True, prepStart=d(2026, 10, 1))  # 42 days used: never negative
    assert (over["earliest"], over["latest"]) == ("2026-11-12", "2026-11-12")
    none = run(stage="Crate")  # prep start unknown: nothing used
    assert none["earliest"] == "2026-11-19"


def test_mirrors_zoho_picking_pack_qc_crate_are_prep_stages_even_with_reanchor_off():
    off = {**DEFAULT_SETTINGS, "reAnchor": False}
    for stage in ["Picking", "Pack", "Quality Checking", "Crate"]:
        assert run(stage=stage, settings=off, stockOnHand=True)["position"] == stage
    assert run(stage="Order Readiness", settings=off, stockOnHand=True)["position"] == "Stock on hand"
    assert run(stage="For Delivery", settings=off, stockOnHand=True)["position"] == "Stock on hand"


def test_stock_on_hand_prep_and_delivery_days_only():
    r = run(stockOnHand=True)
    assert (r["earliest"], r["latest"], r["delivery"], r["position"]) == ("2026-11-19", "2026-11-19", "2026-11-19", "Stock on hand")


def test_a_delivered_shipment_is_at_the_warehouse_prep_and_delivery_from_today():
    r = run(shipStatus="Delivered", prAdded=d(2026, 9, 1))
    assert (r["position"], r["delivery"]) == ("At WH", "2026-11-19")
    off = run(shipStatus="Delivered", prAdded=d(2026, 9, 1), settings={**DEFAULT_SETTINGS, "reAnchor": False})
    assert off["position"] == "Procurement"


def test_in_transit_from_the_day_it_shipped_middle_date_rounds_half_up():
    r = run(dateShipped=d(2026, 11, 1), modeVal="LCL")
    assert (r["earliest"], r["latest"], r["delivery"], r["bucket"], r["position"]) == ("2026-12-20", "2027-01-17", "2027-01-03", "LCL", "In transit")
    assert r["window"] == "Dec 20 - Jan 17, 2027 | LCL | In transit"
    odd = run(dateShipped=d(2026, 11, 1), modeVal="Air Freight")  # 14 to 17 days: span 3, half 1.5 rounds up to 2
    assert (odd["earliest"], odd["latest"], odd["delivery"]) == ("2026-11-15", "2026-11-18", "2026-11-17")


def test_procurement_from_the_day_the_pr_was_added_bucket_follows_sourcing_and_mode():
    assert run(prAdded=d(2026, 11, 1), modeVal="Air")["bucket"] == "Air"
    assert run(prAdded=d(2026, 11, 1), modeVal="fcl")["bucket"] == "FCL"
    assert run(prAdded=d(2026, 11, 1), modeVal="LCL")["bucket"] == "LCL"
    assert run(prAdded=d(2026, 11, 1), modeVal="Truck")["bucket"] == "LCL?"
    local = run(prAdded=d(2026, 11, 1), sourcing="Local", modeVal="Air")  # sourcing wins over mode
    assert (local["bucket"], local["earliest"], local["latest"]) == ("Local", "2026-11-12", "2026-11-12")
    air = run(prAdded=d(2026, 11, 1), modeVal="Air")
    assert (air["earliest"], air["latest"], air["position"]) == ("2026-11-15", "2026-11-18", "Procurement")


def test_supplier_lead_time_added_only_when_the_switch_is_on():
    on = {**DEFAULT_SETTINGS, "addSupLead": True}
    assert run(prAdded=d(2026, 11, 1), modeVal="Air", supLead=10, settings=on)["earliest"] == "2026-11-25"
    assert run(prAdded=d(2026, 11, 1), modeVal="Air", supLead=10)["earliest"] == "2026-11-15"


def test_an_estimate_in_the_past_is_clamped_to_today_and_says_so():
    r = run(prAdded=d(2026, 1, 1), modeVal="Air")
    assert (r["earliest"], r["latest"], r["delivery"]) == ("2026-11-12", "2026-11-12", "2026-11-12")
    assert r["window"] == "Nov 12 - Nov 12, 2026 | Air | Procurement | lampas na sa tantiya"
    partly = run(prAdded=d(2026, 10, 28), modeVal="Air")  # 14 to 17 days: Nov 11 (past) to Nov 14
    assert (partly["earliest"], partly["latest"]) == ("2026-11-12", "2026-11-14")
    assert "lampas" not in partly["window"]


def test_status_against_the_client_date_on_track_at_risk_will_miss_overdue():
    air = {"prAdded": d(2026, 11, 1), "modeVal": "Air"}  # window Nov 15 to Nov 18, forecast Nov 17
    assert run(**air, clientTarget=d(2026, 11, 20))["status"] == "On Track"
    assert run(**air, clientTarget=d(2026, 11, 18))["status"] == "On Track"
    assert run(**air, clientTarget=d(2026, 11, 20))["window"] == "Nov 15 - Nov 18, 2026 | Air | Procurement | 3d early"
    assert run(**air, clientTarget=d(2026, 11, 16))["status"] == "At Risk"
    assert run(**air, clientTarget=d(2026, 11, 16))["window"].endswith("| +1d vs client")
    assert run(**air, clientTarget=d(2026, 11, 14))["status"] == "Will Miss"
    assert run(**air, clientTarget=d(2026, 11, 14))["window"].endswith("| +3d vs client")
    assert run(**air, clientTarget=d(2026, 11, 10))["status"] == "Overdue"
    assert run(**air, clientTarget=d(2026, 11, 17))["window"].endswith("| sakto sa client")
    assert run(**air)["status"] == "No Client Date"
    assert "client" not in run(**air)["window"]


def test_mirrors_zoho_overdue_wins_over_on_track_when_target_already_behind_today():
    r = run(stage="For Delivery", clientTarget=d(2026, 11, 11))
    assert r["status"] == "Overdue"
    assert r["window"].endswith("| +1d vs client")


def test_no_anchor_at_all_nothing_is_stamped():
    assert run(stockOnHand=False, prAdded=None) == {"skip": True}


def test_property_the_middle_date_is_never_outside_the_window_and_never_before_today_over_many_random_orders():
    # the Node test of the same name (tests/forecast/engine.test.js): 500 random orders, the same ranges
    import random
    rnd = random.Random(12345)
    stages = ["", "For Delivery", "Order Readiness", "Picking", "Pack", "Quality Checking", "Crate"]
    modes = ["", "Air", "LCL", "FCL", "Truck"]
    day = lambda: d(2026, rnd.randint(1, 11), rnd.randint(1, 28))  # noqa: E731
    checked = 0
    for _ in range(500):
        settings = DEFAULT_SETTINGS if rnd.randrange(2) == 0 else settings_from({
            "Re_anchor_on_Latest_Real_Event": "true" if rnd.randrange(2) else "false",
            "Include_Supplier_Lead_Time": "true" if rnd.randrange(2) else "false"})
        r = run(
            stage=rnd.choice(stages), stockOnHand=rnd.randrange(2) == 0, modeVal=rnd.choice(modes),
            sourcing="Local" if rnd.randrange(4) == 0 else "", prAdded=None if rnd.randrange(5) == 0 else day(),
            prepFound=rnd.randrange(2) == 0, prepStart=day(), dateShipped=day() if rnd.randrange(3) == 0 else None,
            shipStatus="Delivered" if rnd.randrange(6) == 0 else "", clientTarget=None if rnd.randrange(3) == 0 else d(2026, rnd.randint(1, 12), rnd.randint(1, 28)),
            settings=settings, supLead=rnd.randrange(20))
        if r.get("skip"):
            continue
        checked += 1
        assert r["earliest"] >= "2026-11-12", r
        assert r["earliest"] <= r["delivery"] <= r["latest"], r
        assert r["status"] in ("On Track", "At Risk", "Will Miss", "Overdue", "No Client Date"), r
    assert checked > 100   # the check is not empty: most random orders do get a forecast
