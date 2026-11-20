from app.procurement.settings_defs import SETTING_DEFS, DEFS, GROUPS, default_settings, problem_with, range_problem, ladder_problem


def test_default_settings_has_a_value_for_every_defined_key():
    defaults = default_settings()
    assert set(defaults) == {d["key"] for d in SETTING_DEFS}


def test_defs_is_keyed_by_setting_key():
    for d in SETTING_DEFS:
        assert DEFS[d["key"]] is d


# Node: 'every setting in the catalogue has a label, a default inside its limits and a sentence on what it affects'
def test_every_setting_has_a_label_group_affects_and_an_in_range_default():
    for d in SETTING_DEFS:
        assert d["label"] and d["group"] and d["affects"], d["key"]
        if d["type"] in ("days", "hours"):
            assert d["min"] <= d["default"] <= d["max"], d["key"]
    assert len({d["key"] for d in SETTING_DEFS}) == len(SETTING_DEFS)


# Node: 'a setting row is validated: a typo outside the limits is refused with a plain message (CP-R6)'
def test_problem_with_rejects_a_value_outside_the_range_1_to_200():
    assert problem_with("transit_lcl_max_days", "800") is not None
    assert "outside the allowed range (1 to 200)" in problem_with("transit_lcl_max_days", "800")


def test_problem_with_rejects_a_non_numeric_value():
    msg = problem_with("transit_lcl_max_days", "abc")
    assert msg is not None and "enter a number" in msg


def test_problem_with_rejects_an_unknown_key():
    msg = problem_with("nonsense", "3")
    assert msg is not None and "not a Procurement setting" in msg


def test_problem_with_rejects_a_bad_yes_no_value():
    msg = problem_with("forecast_reanchor", "maybe")
    assert msg is not None and "choose yes or no" in msg


def test_problem_with_accepts_a_value_within_range():
    assert problem_with("transit_lcl_max_days", "30") is None


# Node: 'the ladder days must keep going up (rung 1 < rung 2 < rung 3)'
def test_ladder_problem_rejects_rungs_that_do_not_increase():
    settings = {**default_settings(), "ladder_rung1_days": 5}
    msg = ladder_problem(settings)
    assert msg is not None and "must go up" in msg


# Node: 'the shortest transit cannot be more than the longest'
def test_range_problem_rejects_min_greater_than_max():
    values = {**default_settings(), "transit_lcl_max_days": 30}
    msg = range_problem("transit_lcl_min_days", "40", values)
    assert msg is not None
    assert "shortest (40) cannot be more than the longest (30)" in msg
