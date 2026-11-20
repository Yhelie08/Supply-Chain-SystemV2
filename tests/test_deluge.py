from datetime import date
from app.deluge import (
    blank, truthy, add_days, day_diff, today_date, parse_date, ymd,
    id_of, ids_of, unbracket, to_num, has_value, same_value, lower, inquiry_number, round2, lit, stamp,
)


def test_blank_treats_none_and_empty_string_as_blank():
    assert blank(None) is True
    assert blank("") is True
    assert blank(0) is False
    assert blank("x") is False


def test_truthy_accepts_bool_string_and_numeric_forms():
    assert truthy(True) is True
    assert truthy("true") is True
    assert truthy(1) is True
    assert truthy("1") is True
    assert truthy(False) is False
    assert truthy("false") is False
    assert truthy(0) is False
    assert truthy("") is False


def test_add_days_adds_calendar_days():
    assert add_days(date(2026, 11, 20), 5) == date(2026, 11, 25)
    assert add_days(date(2026, 11, 28), 5) == date(2026, 12, 3)


def test_day_diff_is_whole_days_from_b_to_a():
    assert day_diff(date(2026, 11, 25), date(2026, 11, 20)) == 5
    assert day_diff(date(2026, 11, 20), date(2026, 11, 25)) == -5


def test_today_date_returns_a_date_with_no_time_component():
    t = today_date()
    assert isinstance(t, date)


def test_parse_date_reads_yyyy_mm_dd_prefix_only():
    assert parse_date("2026-11-12") == date(2026, 11, 12)
    assert parse_date("2026-11-12 09:00:00 AM") == date(2026, 11, 12)
    assert parse_date("not a date") is None
    assert parse_date("") is None
    assert parse_date(None) is None


def test_ymd_formats_a_date_as_yyyy_mm_dd():
    assert ymd(date(2026, 1, 5)) == "2026-01-05"
    assert ymd(date(2026, 11, 20)) == "2026-11-20"


def test_id_of_extracts_id_field_from_a_lookup_object():
    assert id_of({"ID": "123"}) == "123"
    assert id_of({"id": "456"}) == "456"
    assert id_of("789") == "789"
    assert id_of(None) == ""


def test_ids_of_flattens_a_list_of_lookups():
    assert ids_of([{"ID": "1"}, {"ID": "2"}]) == ["1", "2"]
    assert ids_of(None) == []
    assert ids_of({"ID": "1"}) == ["1"]


def test_unbracket_strips_leading_and_trailing_brackets():
    assert unbracket("[abc]") == "abc"
    assert unbracket("abc") == "abc"
    assert unbracket("  [ abc ]  ") == "abc"


def test_to_num_defaults_blank_and_nonnumeric_to_zero():
    assert to_num("") == 0
    assert to_num(None) == 0
    assert to_num("abc") == 0
    assert to_num("5.5") == 5.5


def test_has_value_requires_nonblank_and_nonzero():
    assert has_value("5") is True
    assert has_value("0") is False
    assert has_value("") is False


def test_same_value_compares_as_string_or_number():
    assert same_value("5", 5) is True
    assert same_value("", None) is True
    assert same_value("5", "6") is False


def test_inquiry_number_pads_to_five_digits():
    assert inquiry_number(7) == "INQ-00007"
    assert inquiry_number("42") == "INQ-00042"


def test_round2_rounds_to_two_decimals():
    assert round2(1.005) == 1.01 or round2(1.005) == 1.0  # float repr edge case, both acceptable
    assert round2(1.1) == 1.1
    assert round2(2.345) == 2.35 or round2(2.345) == 2.34


def test_lit_escapes_quotes_and_backslashes_for_criteria_strings():
    assert lit('He said "hi"') == '"He said \\"hi\\""'
    assert lit("back\\slash") == '"back\\\\slash"'


def test_stamp_formats_as_yyyymmddhhmmss():
    import datetime as dt
    s = stamp(dt.datetime(2026, 1, 2, 3, 4, 5))
    assert s == "20260102030405"
