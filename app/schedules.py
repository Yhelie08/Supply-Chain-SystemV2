# The runner for Zoho's scheduled workflows. Ported from server/schedules.mjs. A module lists its schedules in its
# package (app/fulfillment/__init__.py):
#   SCHEDULES = [{"name": ..., "at": "HH:MM", "time_zone": "Asia/Manila", "run": async (store, log) -> result}]
# (the name is the Zoho schedule's name, so Port Status can tell which are ported).
#
# How it works: every minute it looks at each schedule in the order listed; a schedule is DUE when the local time in its zone has
# reached `at` and it has not been tried on that local date. The day is recorded in the table `_schedule_runs` when the run
# STARTS, so a run that fails is logged and is not retried until tomorrow (a job that fails every minute would be worse than
# one that waits a day). A server that was down at 01:00 runs the job when it comes back that day: the jobs are safe to repeat.
# Two server instances (a deploy overlap, or two replicas) never run the same job at once: a Postgres advisory lock is taken per
# schedule, and an instance that cannot get it skips that schedule this minute.
#
# It is OFF unless SCHEDULES=on, so a PC running the server locally, and the tests, never run a job by surprise.
# The jobs get the plain store: like a Deluge schedule, their writes do not fire the form workflows.
import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

DEFAULT_ZONE = "Asia/Manila"


def local_parts(now: datetime, time_zone: str) -> dict:
    """'2026-11-12' and the minutes since local midnight, for a moment in a time zone."""
    local = now.astimezone(ZoneInfo(time_zone))
    return {"date": local.strftime("%Y-%m-%d"), "minutes": local.hour * 60 + local.minute}


def _at_minutes(at) -> int:
    parts = str(at).split(":")
    return int(parts[0]) * 60 + (int(parts[1]) if len(parts) > 1 and parts[1] else 0)


async def ensure_run_table(db) -> None:
    await db.execute('CREATE TABLE IF NOT EXISTS "_schedule_runs" (name text PRIMARY KEY, last_date text, started_at text, finished_at text, result text)')


async def _no_lock(_name):
    async def release():
        return None
    return release


def pg_advisory_lock(db):
    """A lock that is held on one connection of the pool until released; returns None when somebody else has it.
    A single connection (the tests) has no one else to exclude, so its lock always succeeds."""
    if not hasattr(db, "acquire"):
        return _no_lock

    async def acquire(name: str):
        conn = await db.acquire()
        try:
            ok = await conn.fetchval("SELECT pg_try_advisory_lock(hashtext($1))", f"schedule:{name}")
        except BaseException:
            await db.release(conn)
            raise
        if not ok:
            await db.release(conn)
            return None

        async def release():
            try:
                await conn.execute("SELECT pg_advisory_unlock(hashtext($1))", f"schedule:{name}")
            finally:
                await db.release(conn)
        return release
    return acquire


async def run_due_schedules(*, db, store, schedules, now: datetime | None = None, acquire=_no_lock, log=print) -> list:
    """One look at the clock: runs what is due. Returns the names it ran."""
    now = now or datetime.now(timezone.utc)
    await ensure_run_table(db)
    ran = []
    for s in schedules:
        name = s["name"]
        local = local_parts(now, s.get("time_zone") or DEFAULT_ZONE)
        if local["minutes"] < _at_minutes(s["at"]):
            continue
        row = await db.fetchrow('SELECT last_date FROM "_schedule_runs" WHERE name = $1', name)
        if row and row["last_date"] == local["date"]:
            continue
        release = await acquire(name)
        if not release:
            log(f"[schedule {name}] another instance is running it")
            continue
        try:
            # check again under the lock: the other instance may have finished while we waited
            again = await db.fetchrow('SELECT last_date FROM "_schedule_runs" WHERE name = $1', name)
            if again and again["last_date"] == local["date"]:
                continue
            await db.execute(
                'INSERT INTO "_schedule_runs" (name, last_date, started_at) VALUES ($1, $2, $3) '
                "ON CONFLICT (name) DO UPDATE SET last_date = $2, started_at = $3, finished_at = NULL, result = NULL",
                name, local["date"], datetime.now(timezone.utc).isoformat(),
            )
            log(f"[schedule {name}] start {local['date']}")
            try:
                result = json.dumps(await s["run"](store, lambda m, n=name: log(f"[schedule {n}] {m}")), separators=(",", ":"), default=str)
            except Exception as e:
                result = f"FAILED: {e}"
                logger.error(f"[schedule {name}] {e}", exc_info=True)
            await db.execute('UPDATE "_schedule_runs" SET finished_at = $2, result = $3 WHERE name = $1', name, datetime.now(timezone.utc).isoformat(), result)
            log(f"[schedule {name}] done: {result}")
            ran.append(name)
        finally:
            await release()
    return ran


class ScheduleHandle:
    def __init__(self, task=None):
        self._task = task

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None


def start_schedules(*, pool, store, schedules, env=None, log=print, interval_s: float = 60, first_delay_s: float = 15, now=None) -> ScheduleHandle:
    """Starts the once-a-minute check. Does nothing unless SCHEDULES=on. `now` (a callable returning a datetime) is for tests."""
    env = os.environ if env is None else env
    if env.get("SCHEDULES") != "on":
        names = ", ".join(s["name"] for s in schedules) or "none"
        log(f"[schedules] off (set SCHEDULES=on to run {names})")
        return ScheduleHandle()
    acquire = pg_advisory_lock(pool)

    async def loop():
        await asyncio.sleep(first_delay_s)
        while True:
            try:
                await run_due_schedules(db=pool, store=store, schedules=schedules, now=now() if now else None, acquire=acquire, log=log)
            except Exception as e:
                logger.error(f"[schedules] {e}", exc_info=True)
            await asyncio.sleep(interval_s)

    listed = ", ".join(s["name"] + " at " + s["at"] + " " + (s.get("time_zone") or DEFAULT_ZONE) for s in schedules)
    log(f"[schedules] on: {listed}")
    return ScheduleHandle(asyncio.get_running_loop().create_task(loop()))
