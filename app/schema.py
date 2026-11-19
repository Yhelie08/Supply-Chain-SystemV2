# Postgres schema generated from the parsed Zoho export + spec-forms. Ported from server/pg/schema.mjs.
# Record IDs are BIGINT; always handled as Python str, never int/float (a Zoho ID is 19 digits).
from app.model import COLUMNS, SYSTEM_COLUMNS

SEQ = "record_id_seq"
SEQ_START = "4900000000000000000"
PG_TYPE = {"num": "NUMERIC", "bool": "BOOLEAN", "json": "JSONB", "text": "TEXT"}


def quote_ident(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def own_columns(form: str) -> list[tuple[str, dict]]:
    return [(name, col) for name, col in COLUMNS[form].items() if name not in SYSTEM_COLUMNS]


async def ensure_schema(conn) -> int:
    await conn.execute(f"CREATE SEQUENCE IF NOT EXISTS {SEQ} START {SEQ_START}")
    await conn.execute(
        "CREATE TABLE IF NOT EXISTS _number_series "
        "(form TEXT NOT NULL, field TEXT NOT NULL, last_num BIGINT NOT NULL DEFAULT 0, PRIMARY KEY (form, field))"
    )
    rows = await conn.fetch(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()"
    )
    have: dict[str, set[str]] = {}
    for r in rows:
        have.setdefault(r["table_name"], set()).add(r["column_name"])

    statements: list[str] = []
    for form in COLUMNS:
        own = own_columns(form)
        if form not in have:
            col_defs = [
                f"\"ID\" BIGINT PRIMARY KEY DEFAULT nextval('{SEQ}')",
                '"Added_Time" TEXT', '"Modified_Time" TEXT', '"Added_User" TEXT', '"_extra" JSONB',
                *[f"{quote_ident(name)} {PG_TYPE[col['kind']]}" for name, col in own],
            ]
            statements.append(f"CREATE TABLE {quote_ident(form)} ({', '.join(col_defs)})")
        else:
            for name, col in own:
                if name not in have[form]:
                    statements.append(f"ALTER TABLE {quote_ident(form)} ADD COLUMN {quote_ident(name)} {PG_TYPE[col['kind']]}")

    for stmt in statements:
        await conn.execute(stmt)
    return len(statements)
