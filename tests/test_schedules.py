# The scheduler runner (app/schedules.py), the Python version of the 7 runner tests in Node's tests/forecast/schedule.test.js,
# plus the Fulfillment manifest and the app wiring (SCHEDULES=on / off).
import asyncio
import os
from datetime import datetime, timezone

import asyncpg
import pytest

from app.fulfillment import SCHEDULES as FULFILLMENT_SCHEDULES
from app.schedules import local_parts, pg_advisory_lock, run_due_schedules, start_schedules


def utc(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def tick(name, log):
    async def run(_store, _log):
        log.append(name)
        return {"ok": True}
    return {"name": name, "at": "01:00", "time_zone": "Asia/Manila", "run": run}


def test_local_time_in_a_zone_01_00_in_manila_is_17_00_utc_the_day_before():
    assert local_parts(utc("2026-11-11T17:00:00Z"), "Asia/Manila") == {"date": "2026-11-12", "minutes": 60}
    assert local_parts(utc("2026-11-11T16:59:00Z"), "Asia/Manila") == {"date": "2026-11-12", "minutes": 59}


async def test_the_runner_runs_a_schedule_once_a_day_only_after_its_time_and_records_the_day(db_conn):
    log = []
    common = {"db": db_conn, "store": None, "schedules": [tick("A", log)], "log": lambda m: None}
    assert await run_due_schedules(**common, now=utc("2026-11-11T16:30:00Z")) == []   # 00:30 in Manila: not yet
    assert await run_due_schedules(**common, now=utc("2026-11-11T17:05:00Z")) == ["A"]   # 01:05
    assert await run_due_schedules(**common, now=utc("2026-11-11T18:00:00Z")) == []   # the same day: not again
    assert await run_due_schedules(**common, now=utc("2026-11-12T17:05:00Z")) == ["A"]   # the next day
    assert log == ["A", "A"]
    rows = await db_conn.fetch('SELECT name, last_date, result FROM "_schedule_runs"')
    assert [dict(r) for r in rows] == [{"name": "A", "last_date": "2026-11-13", "result": '{"ok":true}'}]


async def test_a_server_that_was_down_at_01_00_runs_the_job_when_it_comes_back_that_day(db_conn):
    log = []
    out = await run_due_schedules(db=db_conn, store=None, schedules=[tick("A", log)], now=utc("2026-11-12T03:00:00Z"), log=lambda m: None)   # 11:00 in Manila
    assert out == ["A"]


async def test_a_failing_job_is_logged_is_not_retried_the_same_day_and_does_not_stop_the_next_schedule(db_conn, caplog):
    log = []

    async def boom_run(_store, _log):
        raise RuntimeError("boom")
    boom = {"name": "Boom", "at": "01:00", "time_zone": "Asia/Manila", "run": boom_run}
    quiet = lambda m: None  # noqa: E731
    assert await run_due_schedules(db=db_conn, store=None, schedules=[boom, tick("Next", log)], now=utc("2026-11-11T17:05:00Z"), log=quiet) == ["Boom", "Next"]
    assert await run_due_schedules(db=db_conn, store=None, schedules=[boom, tick("Next", log)], now=utc("2026-11-11T18:00:00Z"), log=quiet) == []
    assert log == ["Next"]
    row = await db_conn.fetchrow('SELECT result FROM "_schedule_runs" WHERE name = $1', "Boom")
    assert row["result"] == "FAILED: boom"
    assert any("boom" in r.getMessage() for r in caplog.records)   # logged as an error, not swallowed silently


async def test_an_instance_that_cannot_get_the_lock_skips_the_schedule_the_other_one_runs_it(db_conn):
    log, held = [], {"A"}   # another instance has A

    async def acquire(name):
        if name in held:
            return None
        held.add(name)

        async def release():
            held.discard(name)
        return release
    out = await run_due_schedules(db=db_conn, store=None, schedules=[tick("A", log), tick("B", log)], now=utc("2026-11-11T17:05:00Z"), acquire=acquire, log=lambda m: None)
    assert out == ["B"]
    assert log == ["B"]
    assert "B" not in held   # released


async def test_the_real_postgres_advisory_lock_is_held_until_released_and_refused_to_a_second_taker():
    url = os.environ["TEST_DATABASE_URL"]
    pool = await asyncpg.create_pool(url, min_size=2, max_size=3)
    try:
        acquire = pg_advisory_lock(pool)
        first = await acquire("lock-test-A")
        assert first is not None
        assert await acquire("lock-test-A") is None   # same schedule, another connection: refused
        other = await acquire("lock-test-B")           # a different schedule is independent
        assert other is not None
        await other()
        await first()
        again = await acquire("lock-test-A")           # free again after the release
        assert again is not None
        await again()
    finally:
        await pool.close()


async def test_a_single_connection_has_no_one_to_exclude_so_its_lock_always_succeeds(db_conn):
    acquire = pg_advisory_lock(db_conn)
    a, b = await acquire("x"), await acquire("x")
    assert a is not None and b is not None


async def test_it_is_off_unless_schedules_is_on(db_conn):
    lines = []
    handle = start_schedules(pool=db_conn, store=None, schedules=[tick("A", [])], env={}, log=lines.append)
    assert "off" in lines[0]
    await handle.stop()
    lines = []
    handle = start_schedules(pool=db_conn, store=None, schedules=[tick("A", [])], env={"SCHEDULES": "yes"}, log=lines.append)   # only the exact word "on" starts it
    assert "off" in lines[0]
    await handle.stop()


async def test_with_schedules_on_the_loop_runs_what_is_due_and_stop_ends_it(db_conn):
    log, lines = [], []
    handle = start_schedules(pool=db_conn, store=None, schedules=[tick("A", log)], env={"SCHEDULES": "on"}, log=lines.append,
                             interval_s=0.05, first_delay_s=0.01, now=lambda: utc("2026-11-11T17:05:00Z"))
    assert "on: A at 01:00 Asia/Manila" in lines[0]
    await asyncio.sleep(0.5)
    await handle.stop()
    assert log == ["A"]   # once, although the loop looked many times
    await asyncio.sleep(0.2)
    assert log == ["A"]


def test_the_fulfillment_module_lists_its_three_schedules_with_the_zoho_names_and_times():
    assert [(s["name"], s["at"], s["time_zone"]) for s in FULFILLMENT_SCHEDULES] == [
        ("Forecast_Stamp_Daily", "01:00", "Asia/Manila"),
        ("Backfill_PreOrder_Forecas", "01:00", "Asia/Manila"),
        ("Recalculate_Fulfillment_Queue", "05:00", "Asia/Manila"),
    ]


async def test_the_fulfillment_jobs_run_on_an_empty_database_and_report_a_result(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    store = create_store(db_conn)
    out = await run_due_schedules(db=db_conn, store=store, schedules=FULFILLMENT_SCHEDULES, now=utc("2026-11-11T21:30:00Z"), log=lambda m: None)   # 05:30 Manila: all three due
    assert out == ["Forecast_Stamp_Daily", "Backfill_PreOrder_Forecas", "Recalculate_Fulfillment_Queue"]
    rows = {r["name"]: r["result"] for r in await db_conn.fetch('SELECT name, result FROM "_schedule_runs"')}
    assert all(not v.startswith("FAILED") for v in rows.values()), rows
