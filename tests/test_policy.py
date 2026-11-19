import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.policy import policy_reader


@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.mark.asyncio
async def test_reads_the_first_matching_rows_value(store):
    await store.add_record("Policy_Settings", {"Policy_Key": "fulfillment_default_people", "Value": "6"})
    read = await policy_reader(store)
    assert read("fulfillment_default_people") == "6"


@pytest.mark.asyncio
async def test_an_unknown_key_or_a_blank_value_reads_as_none(store):
    await store.add_record("Policy_Settings", {"Policy_Key": "blank_one", "Value": ""})
    read = await policy_reader(store)
    assert read("blank_one") is None
    assert read("never_set") is None
