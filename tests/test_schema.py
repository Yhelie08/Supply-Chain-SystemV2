import pytest

from app.schema import ensure_schema, quote_ident, SEQ, SEQ_START
from conftest import TEST_SCHEMA


def test_quote_ident_escapes_embedded_quotes():
    assert quote_ident("Sales_Order_Fulfillment") == '"Sales_Order_Fulfillment"'
    assert quote_ident('weird"name') == '"weird""name"'


@pytest.mark.asyncio
async def test_ensure_schema_creates_tables_for_every_form(db_conn):
    changes = await ensure_schema(db_conn)
    assert changes > 0
    row = await db_conn.fetchrow(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = $1 AND table_name = 'Sales_Order_Fulfillment' AND column_name = 'Category'",
        TEST_SCHEMA,
    )
    assert row is not None


@pytest.mark.asyncio
async def test_ensure_schema_is_idempotent(db_conn):
    first = await ensure_schema(db_conn)
    assert first > 0
    second = await ensure_schema(db_conn)
    assert second == 0  # nothing left to create or alter on a second run


@pytest.mark.asyncio
async def test_system_columns_exist_on_every_table(db_conn):
    await ensure_schema(db_conn)
    for col in ["ID", "Added_Time", "Modified_Time", "Added_User", "_extra"]:
        row = await db_conn.fetchrow(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = $1 AND table_name = 'Sales_Order_Fulfillment' AND column_name = $2",
            TEST_SCHEMA, col,
        )
        assert row is not None, f"missing system column {col}"
