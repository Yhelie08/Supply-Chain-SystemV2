import os

import asyncpg
import pytest

# Tests run against the Node app's real shared Railway Postgres (no separate test DB exists yet),
# but fully isolated inside a dedicated "python_test" schema -- never "public", where the Node app's
# real tables live. search_path is set on connect so every ensure_schema/store query (which never
# names a schema itself) naturally operates inside python_test; cleanup DROPs objects only within
# that schema, never touching anything else in the database.
TEST_SCHEMA = "python_test"


@pytest.fixture
async def db_conn():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.fail("Set TEST_DATABASE_URL to a Postgres connection string for tests (e.g. the Railway tunnel URL)")
    conn = await asyncpg.connect(url)
    await conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{TEST_SCHEMA}"')
    await conn.execute(f'SET search_path TO "{TEST_SCHEMA}"')
    yield conn
    # Clean slate between test modules: drop every object inside python_test only.
    tables = await conn.fetch(
        "SELECT tablename FROM pg_tables WHERE schemaname = $1", TEST_SCHEMA
    )
    for t in tables:
        await conn.execute(f'DROP TABLE IF EXISTS "{TEST_SCHEMA}"."{t["tablename"]}" CASCADE')
    sequences = await conn.fetch(
        "SELECT sequencename FROM pg_sequences WHERE schemaname = $1", TEST_SCHEMA
    )
    for s in sequences:
        await conn.execute(f'DROP SEQUENCE IF EXISTS "{TEST_SCHEMA}"."{s["sequencename"]}" CASCADE')
    await conn.close()
