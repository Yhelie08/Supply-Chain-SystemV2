from datetime import date
from app.deluge import blank, truthy, add_days, day_diff, today_date, parse_date, ymd


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
