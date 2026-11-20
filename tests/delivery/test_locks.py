import asyncio
import pytest

from app.delivery.locks import with_lock


async def test_runs_immediately_with_no_contention():
    async def fn():
        return "done"
    assert await with_lock("k1", fn) == "done"


async def test_second_call_with_same_key_waits_for_the_first():
    order = []

    async def slow():
        order.append("slow-start")
        await asyncio.sleep(0.05)
        order.append("slow-end")
        return "slow"

    async def fast():
        order.append("fast-start")
        order.append("fast-end")
        return "fast"

    first = asyncio.ensure_future(with_lock("same-key", slow))
    await asyncio.sleep(0)  # let `first` actually start before queuing `second`
    second = asyncio.ensure_future(with_lock("same-key", fast))
    results = await asyncio.gather(first, second)

    assert results == ["slow", "fast"]
    assert order == ["slow-start", "slow-end", "fast-start", "fast-end"], \
        "fast must not start until slow has fully finished, even though fast itself is instant"


async def test_different_keys_run_independently_not_serialized():
    order = []

    async def slow():
        order.append("slow-start")
        await asyncio.sleep(0.05)
        order.append("slow-end")
        return "slow"

    async def fast():
        order.append("fast-start")
        order.append("fast-end")
        return "fast"

    first = asyncio.ensure_future(with_lock("key-a", slow))
    await asyncio.sleep(0)
    second = asyncio.ensure_future(with_lock("key-b", fast))
    await asyncio.gather(first, second)

    # fast (key-b) finishes before slow (key-a) because they are NOT serialized against each other
    assert order.index("fast-end") < order.index("slow-end")


async def test_a_failed_first_call_does_not_block_the_second():
    async def boom():
        raise ValueError("boom")

    async def ok_fn():
        return "ok"

    first = asyncio.ensure_future(with_lock("fail-key", boom))
    await asyncio.sleep(0)
    second = asyncio.ensure_future(with_lock("fail-key", ok_fn))

    with pytest.raises(ValueError, match="boom"):
        await first
    assert await second == "ok"
