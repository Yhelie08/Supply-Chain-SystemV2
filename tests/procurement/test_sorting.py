from app.procurement.sorting import categorise, rank, CATEGORY_ORDER
from app.procurement.plan import DEFAULT_SETTINGS, SPEC_NUMBERS
from app.deluge import add_days, today_date

TODAY = today_date()
S = {**DEFAULT_SETTINGS, **SPEC_NUMBERS}


def test_category_order_is_broken_first_on_track_last():
    assert CATEGORY_ORDER[0] == "broken"
    assert CATEGORY_ORDER[-1] == "on_track"


# Node: 'categorise: act_now when it will miss and can still change, tell_customer when nothing can change, watch, on_track, blocked first'
def test_categorise_boundaries_match_the_node_cases():
    base = {"stage": "production", "order_date": add_days(TODAY, -10), "target": add_days(TODAY, 30), "mode": "LCL",
            "held": "", "no_supplier": False, "ladder_rung": 0, "days_late": 0, "production_started": False, "production_finished": False}
    miss = add_days(TODAY, 40)  # date needed = target - 5 = today + 25
    assert categorise({**base, "forecast_pickable": miss}, S, TODAY)["category"] == "act_now"
    assert categorise({**base, "stage": "shipped_out", "forecast_pickable": miss}, S, TODAY)["category"] == "tell_customer"
    assert categorise({**base, "forecast_pickable": add_days(TODAY, 22)}, S, TODAY)["category"] == "watch"  # 3 days of slack <= 7
    assert categorise({**base, "forecast_pickable": add_days(TODAY, 5)}, S, TODAY)["category"] == "on_track"
    b = categorise({**base, "held": "PR-1 is On Hold", "forecast_pickable": miss}, S, TODAY)
    assert b["category"] == "blocked"
    assert "On Hold" in b["blocked_reason"]
    assert categorise({**base, "no_supplier": True, "forecast_pickable": miss}, S, TODAY)["category"] == "blocked"


# Node: 'a shipment already by air with production started and no ladder has nothing left to change: tell the customer'
def test_categorise_air_with_production_started_is_tell_customer():
    r = categorise({"stage": "production", "order_date": add_days(TODAY, -10), "target": add_days(TODAY, 30), "mode": "Airfreight",
                     "held": "", "no_supplier": False, "ladder_rung": 0, "days_late": 0, "production_started": True,
                     "forecast_pickable": add_days(TODAY, 40)}, S, TODAY)
    assert r["category"] == "tell_customer"


# Node: 'no target set: order date + 25 days is used, and the reason says so (never pushed to the bottom)'
def test_categorise_with_no_target_uses_order_date_plus_25():
    r = categorise({"stage": "production", "order_date": add_days(TODAY, -40), "target": None, "mode": "LCL", "held": "",
                     "no_supplier": False, "ladder_rung": 0, "days_late": 0, "forecast_pickable": add_days(TODAY, 10)}, S, TODAY)
    assert r["no_target"] is True
    assert "no target set" in r["priority_reason"]
    assert r["category"] == "act_now"  # order date + 25 = 15 days ago: long past


# Node RR-R4: 'a replacement (RR) is BROKEN: first in every queue, above Act now; a blocked one stays blocked'
def test_categorise_broken_wins_over_act_now_but_not_over_blocked():
    base = {"stage": "production", "order_date": add_days(TODAY, -10), "target": add_days(TODAY, 30), "mode": "LCL",
            "held": "", "no_supplier": False, "ladder_rung": 0, "days_late": 0, "production_started": False,
            "forecast_pickable": add_days(TODAY, 40), "broken": "RR-00001"}
    r = categorise(base, S, TODAY)
    assert r["category"] == "broken"
    assert "Replacement RR-00001" in r["priority_reason"]
    blocked = categorise({**base, "held": "On Hold"}, S, TODAY)
    assert blocked["category"] == "blocked"  # blocked wins over broken
    received = categorise({**base, "stage": "received"}, S, TODAY)
    assert received["category"] != "broken"  # a received shipment is never broken


# Node: 'rank: oldest Sales Order date first inside a category, then target, then number; the same input gives the same rank'
def test_rank_is_stable_and_orders_by_order_date_then_target_then_number():
    d = lambda n: add_days(TODAY, n)
    items = [
        {"id": "1", "no": "SHP-00010", "category": "act_now", "order_date": d(-5), "target": d(10)},
        {"id": "2", "no": "SHP-00002", "category": "act_now", "order_date": d(-30), "target": d(50)},
        {"id": "3", "no": "SHP-00003", "category": "act_now", "order_date": d(-30), "target": d(40)},
        {"id": "4", "no": "SHP-00004", "category": "watch", "order_date": d(-90), "target": d(1)},
        {"id": "5", "no": "SHP-00005", "category": "tell_customer", "order_date": d(-1), "target": d(1)},
    ]
    a = rank(items)
    assert [a[i] for i in ["3", "2", "1", "5", "4"]] == [1, 2, 3, 4, 5]
    again = rank(list(reversed(items)))
    assert [again[i["id"]] for i in items] == [a[i["id"]] for i in items]


def test_rank_ranks_blocked_items_separately_starting_from_1():
    items = [
        {"id": "1", "no": "SHP-1", "category": "act_now", "order_date": TODAY, "target": TODAY},
        {"id": "2", "no": "SHP-2", "category": "blocked", "order_date": TODAY, "target": TODAY},
        {"id": "3", "no": "SHP-3", "category": "blocked", "order_date": add_days(TODAY, -1), "target": TODAY},
    ]
    a = rank(items)
    assert a["1"] == 1
    assert a["3"] == 1  # oldest order_date first within the blocked group, restarting from 1
    assert a["2"] == 2
