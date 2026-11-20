from app.delivery.settings_defs import SETTING_DEFS, DEFS, GROUPS, is_delivery_key, TYPE_FIELD, typed, problem_with, workday_problem


def test_defs_is_keyed_by_setting_key_and_covers_every_entry():
    assert len(SETTING_DEFS) == 21
    for d in SETTING_DEFS:
        assert DEFS[d["key"]] is d
    assert len({d["key"] for d in SETTING_DEFS}) == 21, "no duplicate keys"


def test_groups_in_first_seen_order():
    assert GROUPS == ["Scheduling window and workday", "Ranking", "Capacity", "Team rotation", "Alerts and archive"]


def test_is_delivery_key():
    assert is_delivery_key("traffic_buffer_percent") is True
    assert is_delivery_key("nonsense") is False


def test_every_numeric_setting_has_a_label_group_affects_and_an_in_range_default():
    for d in SETTING_DEFS:
        assert d["label"] and d["group"] and d["affects"], d["key"]
        if d["type"] not in ("time",) and d["default"] != "":
            assert d["min"] <= d["default"] <= d["max"], d["key"]


def test_rotation_max_so_capacity_is_optional_with_a_blank_default():
    d = DEFS["rotation_max_so_capacity"]
    assert d["default"] == ""
    assert d.get("optional") is True


def test_two_ranking_settings_are_marked_shared_with_fulfillment():
    assert DEFS["default_promise_days"]["shared"] == "Fulfillment"
    assert DEFS["at_risk_slack_days"]["shared"] == "Fulfillment"


def test_type_field_maps_every_type_used_by_the_catalogue():
    used_types = {d["type"] for d in SETTING_DEFS}
    for t in used_types:
        assert t in TYPE_FIELD, t


def test_typed_time_is_stripped_text_others_are_numbers_blank_is_empty_string():
    assert typed(DEFS["workday_start_time"], " 8:00 AM ") == "8:00 AM"
    assert typed(DEFS["traffic_buffer_percent"], "15") == 15.0
    assert typed(DEFS["rotation_max_so_capacity"], "") == ""
    assert typed(DEFS["rotation_max_so_capacity"], None) == ""


def test_problem_with_rejects_a_value_outside_the_range():
    msg = problem_with("max_days_scheduling_window", "9000")
    assert msg is not None and "outside the allowed range (1 to 60)" in msg


def test_problem_with_rejects_a_non_numeric_value():
    msg = problem_with("max_days_scheduling_window", "abc")
    assert msg is not None and "enter a number" in msg


def test_problem_with_rejects_a_non_integer_value():
    msg = problem_with("max_days_scheduling_window", "3.5")
    assert msg is not None and "whole numbers" in msg


def test_problem_with_rejects_an_unknown_key():
    msg = problem_with("nonsense", "3")
    assert msg is not None and "not a Delivery setting" in msg


def test_problem_with_accepts_a_value_within_range():
    assert problem_with("max_days_scheduling_window", "30") is None


def test_problem_with_blank_optional_setting_is_fine():
    assert problem_with("rotation_max_so_capacity", "") is None


def test_problem_with_blank_required_setting_is_rejected():
    msg = problem_with("max_days_scheduling_window", "")
    assert msg is not None and "enter a number" in msg


def test_problem_with_time_type_accepts_valid_clock_strings():
    assert problem_with("workday_start_time", "8:00 AM") is None
    assert problem_with("workday_start_time", "5:30 PM") is None
    assert problem_with("workday_start_time", "12:00 AM") is None


def test_problem_with_time_type_rejects_bad_format():
    msg = problem_with("workday_start_time", "25:00")
    assert msg is not None and "enter a time like 8:00 AM or 5:30 PM" in msg
    msg2 = problem_with("workday_start_time", "not a time")
    assert msg2 is not None and "enter a time like 8:00 AM or 5:30 PM" in msg2


def test_workday_problem_requires_at_least_one_hour_between_start_and_end():
    values = {"workday_start_time": "8:00 AM", "workday_end_time": "5:00 PM"}
    assert workday_problem("workday_start_time", "8:00 AM", values) is None
    bad = workday_problem("workday_end_time", "8:30 AM", values)
    assert bad is not None and "at least one hour after it starts" in bad


def test_workday_problem_is_none_for_non_workday_keys():
    assert workday_problem("traffic_buffer_percent", "50", {}) is None


def test_problem_with_time_still_rejects_bad_format_after_repointing_at_shared_clock():
    # Regression for the Phase 2 fix: problem_with's OWN strict regex must still reject malformed
    # input even though the underlying parse now goes through scheduling.py's lenient clock().
    from app.delivery.settings_defs import problem_with
    assert problem_with("workday_start_time", "8:0 AM") is not None, "single-digit minute must still be rejected by the strict regex"
    assert problem_with("workday_start_time", "25:00 AM") is not None, "hour out of 1-12 range must still be rejected"
    assert problem_with("workday_start_time", "8:00") is not None, "missing AM/PM must still be rejected"


def test_settings_defs_clock_is_now_imported_from_scheduling_not_private():
    import app.delivery.settings_defs as sd
    assert not hasattr(sd, "_clock"), "_clock should be deleted after re-pointing at the shared clock()"
    from app.delivery.scheduling import clock
    assert sd.clock is clock, "settings_defs.py must use scheduling.py's clock(), not its own copy"
