import os
from urllib.parse import urlsplit

import asyncpg
import pytest

# The Python tests run against a LOCAL Postgres only (host localhost, 127.0.0.1 or ::1), fully isolated
# inside a dedicated "python_test" schema -- never "public". search_path is set on connect so every
# ensure_schema/store query (which never names a schema itself) naturally operates inside python_test;
# cleanup DROPs objects only within that schema, never touching anything else in the database.
# The shared Railway Postgres is refused unless ALLOW_REMOTE_TEST_DB=1 is set on purpose.
TEST_SCHEMA = "python_test"
LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")


def host_of(url: str) -> str:
    """The host part of a Postgres URL (lower case, no port, no brackets). '' when there is none."""
    try:
        return (urlsplit(url).hostname or "").lower()
    except ValueError:
        return ""


def check_test_database_url(url, allow_remote=None):
    """Returns None when it is fine to run the tests on `url`, otherwise the message to refuse with.
    `allow_remote` defaults to the ALLOW_REMOTE_TEST_DB environment variable (the value "1" allows it)."""
    if not url:
        return "Set TEST_DATABASE_URL to a LOCAL Postgres connection string for tests (e.g. postgresql://postgres@127.0.0.1:5432/supply_chain_test)"
    if allow_remote is None:
        allow_remote = os.environ.get("ALLOW_REMOTE_TEST_DB") == "1"
    host = host_of(url)
    if host in LOCAL_HOSTS or allow_remote:
        return None
    return (
        f"Refusing to run the tests: TEST_DATABASE_URL points at host '{host or '(none)'}', which is not local "
        "(localhost, 127.0.0.1 or ::1). The tests must never run on the shared Railway Postgres. "
        "Use a local Postgres, or set ALLOW_REMOTE_TEST_DB=1 if you really mean it."
    )


@pytest.fixture
async def db_conn():
    url = os.environ.get("TEST_DATABASE_URL")
    problem = check_test_database_url(url)
    if problem:
        pytest.fail(problem)
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
