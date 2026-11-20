# Parity with the Node reference (plan Phase 2.2): the tables Python's ensure_schema creates must match what Node's
# ensureSchema really created (tests/fixtures/node_schema.json: tables, columns in order, types, nullability, defaults, indexes,
# the id sequence). Runs inside the python_test schema (see conftest.py); the Node fixture was taken from the public schema, so the
# schema name is normalised.
import json
from pathlib import Path

import pytest

from app.schema import ensure_schema

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "node_schema.json").read_text(encoding="utf-8"))


@pytest.fixture
async def created(db_conn):
    await ensure_schema(db_conn)
    return db_conn


async def test_the_same_tables_with_the_same_columns_types_nullability_and_defaults_as_node(created):
    rows = await created.fetch(
        "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns "
        "WHERE table_schema = current_schema() ORDER BY table_name, ordinal_position"
    )
    mine: dict[str, list] = {}
    for r in rows:
        mine.setdefault(r["table_name"], []).append([r["column_name"], r["data_type"], r["is_nullable"], r["column_default"]])
    assert sorted(mine) == sorted(FIXTURE["tables"]), "different set of tables"
    problems = []
    for table, cols in FIXTURE["tables"].items():
        if mine[table] != cols:
            names_n, names_p = [c[0] for c in cols], [c[0] for c in mine[table]]
            if names_n != names_p:
                problems.append(f"{table}: columns Node {names_n[:8]}... vs Python {names_p[:8]}...")
            else:
                diff = [(a, b) for a, b in zip(cols, mine[table]) if a != b]
                problems.append(f"{table}: {diff[:2]}")
    assert problems == [], "\n".join(problems[:15])


async def test_the_same_indexes_as_node(created):
    rows = await created.fetch("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() ORDER BY tablename, indexname")
    schema = await created.fetchval("SELECT current_schema()")
    mine: dict[str, list] = {}
    for r in rows:
        mine.setdefault(r["tablename"], []).append([r["indexname"], r["indexdef"].replace(f"{schema}.", "public.")])
    assert mine == FIXTURE["indexes"]


async def test_the_id_sequence_starts_where_node_starts_it(created):
    start = await created.fetchval("SELECT start_value::text FROM pg_sequences WHERE schemaname = current_schema() AND sequencename = $1", FIXTURE["sequence"]["name"])
    assert start == FIXTURE["sequence"]["start"]
