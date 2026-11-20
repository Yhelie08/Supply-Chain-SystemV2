# events.py stays source-derived by necessity: no Node test file exercises events.mjs directly as a
# unit; every Node test only sees it indirectly through other modules' Stage_Events rows (e.g. a
# future Occurred_At raising, confirmed consistently across procurement-ship-track.test.js and
# procurement-receiving-spec.test.js -- that one case IS cross-confirmed, the rest are not).
import pytest
from datetime import datetime
from app.criteria import ZohoError
from app.procurement.events import parse_when, occurred_from, log_event, events_of, days_between, SHIPMENT_STAGE_OF


def test_parse_when_handles_a_plain_date_string():
    w = parse_when("2026-01-15")
    assert w is not None and w["date"].year == 2026 and w["date"].month == 1 and w["date"].day == 15
    assert w["date_only"] is True


def test_parse_when_handles_a_time_with_am_pm():
    w = parse_when("2026-01-15 02:30:05 PM")
    assert w is not None and w["date"].hour == 14 and w["date"].minute == 30 and w["date"].second == 5
    assert w["date_only"] is False


def test_parse_when_rejects_garbage():
    assert parse_when("not a date") is None


def test_occurred_from_rejects_a_future_date():
    now = datetime(2026, 1, 1)
    with pytest.raises(ZohoError):
        occurred_from("2027-01-01", now)


def test_occurred_from_defaults_to_now_when_blank():
    now = datetime(2026, 1, 1, 10, 0, 0)
    result = occurred_from(None, now)
    assert result["date"] == now
    assert result["bound"] == "exact"


def test_occurred_from_accepts_a_past_date():
    now = datetime(2026, 1, 10)
    result = occurred_from("2026-01-05", now)
    assert result["date"].day == 5


def test_days_between_computes_whole_days_from_a_to_b():
    # Node: const x = parseDate(a), y = parseDate(b); return round((y - x) / day) -- b minus a.
    a = "2026-01-01"
    b = "2026-01-10"
    assert days_between(a, b) == 9
    assert days_between(b, a) == -9


@pytest.mark.asyncio
async def test_log_event_writes_a_stage_events_row_and_returns_a_visit_number(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    n1 = await log_event(store, record_type="shipment", record_id="1", record_no="SHP-1", event="departed")
    n2 = await log_event(store, record_type="shipment", record_id="1", record_no="SHP-1", event="departed")
    assert n1 == 1
    assert n2 == 2
    rows = await events_of(store, "shipment", "1")
    assert len(rows) == 2
    assert all(r["Record_No"] == "SHP-1" for r in rows)
