# A queue per key: work with the same key runs one after the other, never at the same time.
#
# Why: two people can press the same button at the same moment (two dispatchers confirming the
# same slot, one person double-clicking Confirm). Each request reads the database, decides, and
# then writes; with two at once, both can read the old picture and both write, so the second one
# overwrites or doubles the first. With a queue the second one starts only after the first has
# written, so it reads the new picture.
#
# Limit, on purpose: this is inside ONE server process. It is enough while the app runs as one
# instance (as on Railway today). If the app is ever run as several instances, the same idea needs
# a database lock (a Postgres advisory lock), as the schedule runner does in Node
# (server/schedules.mjs). A callback that waits on another callback of the same key would wait
# forever, so do not nest the same key. Ported from server/modules/delivery-management/locks.mjs.
import asyncio
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")

_tails: dict[str, asyncio.Task] = {}


async def with_lock(key: str, fn: Callable[[], Awaitable[T]]) -> T:
    previous = _tails.get(key)

    async def run() -> T:
        if previous is not None:
            try:
                await previous
            except Exception:
                pass
        return await fn()

    task = asyncio.ensure_future(run())
    _tails[key] = task

    def _cleanup(_task):
        if _tails.get(key) is task:
            del _tails[key]
    task.add_done_callback(_cleanup)

    return await task
