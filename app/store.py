# Postgres data layer: the same operations the widget SDK needs. Ported from server/pg/store.mjs.
#
# IDs are strings in Python and BIGINT in Postgres; never turned into ints, because a Zoho ID (19
# digits) is wider than many languages' safe integer range. Filtering is done by Postgres when
# app.criteria_sql can translate the Zoho criteria; otherwise rows are filtered in Python exactly
# like the JS-predicate fallback does.
import json
import re
import time
from contextlib import asynccontextmanager

from app.model import COLUMNS, GRID_LOOKUPS, LOOKUP_DISPLAY, RESOLVED_GRID_LOOKUP_FORMS, display_from_format, form_of_report, form_by_name
from app.criteria import ZohoError, zoho_now, compile_criteria
from app.schema import quote_ident as q, own_columns
from app.criteria_sql import criteria_to_sql

_ID_RE = re.compile(r"^\d{1,19}$")
_CAST = {"json": "::jsonb", "num": "::numeric", "bool": "::boolean", "text": ""}


def _is_id(id_val) -> bool:
    return bool(_ID_RE.match(str(id_val)))


def _id_of(v):
    if isinstance(v, dict):
        return v.get("ID", v.get("id", ""))
    return v


def _not_found() -> ZohoError:
    return ZohoError(9280, "No records found for the given criteria.")


def encode(form: str, data: dict | None, existing_extra=None) -> dict:
    """What the database gets for each field: ready to bind, with the cast from _CAST in the SQL."""
    cols = COLUMNS[form]
    out: dict = {}
    extra = dict(existing_extra or {})
    for k, v in (data or {}).items():
        c = cols.get(k)
        if not c:
            if k not in ("ID", "Added_Time", "Modified_Time", "Added_User"):
                extra[k] = v
            continue
        if c.get("lookup"):
            v = [_id_of(x) for x in v] if isinstance(v, list) else _id_of(v)
        if c["kind"] == "json":
            if c["type"] == "grid" and isinstance(v, list):
                v = [{**row, "ID": row.get("ID") or f"{int(time.time() * 1000)}{i}"} for i, row in enumerate(v)]
            out[k] = None if v == "" or v is None else json.dumps(v)
        elif c["kind"] == "bool":
            out[k] = v is True or v == "true" or v == 1 or v == "1"
        elif c["kind"] == "num":
            if v == "" or v is None:
                out[k] = None
            else:
                try:
                    n = float(v)
                    # Matches Node's String(Number(v)): JS has no int/float string distinction, so a
                    # whole number prints without a trailing ".0" (Python's str(float(...)) always
                    # keeps it).
                    out[k] = str(int(n)) if n == int(n) else str(n)
                except (TypeError, ValueError):
                    out[k] = None
        else:
            out[k] = None if v is None else (json.dumps(v) if isinstance(v, (dict, list)) else str(v))
    extra_json = json.dumps(extra) if extra else None
    return {"out": out, "extra": extra_json}


@asynccontextmanager
async def _with_tx(db):
    """Runs the block on one connection with a transaction open. `db` is an asyncpg Connection in
    tests (SET search_path already applied, used as-is) or a Pool in production -- a Pool call
    acquires a fresh connection per query, which would run each statement in its own transaction, so
    a real connection is checked out here instead, matching server/pg/store.mjs's withTx."""
    if hasattr(db, "acquire"):
        async with db.acquire() as conn:
            async with conn.transaction():
                yield conn
    else:
        async with db.transaction():
            yield db


def create_store(db):
    def select_list(form: str) -> str:
        parts = ['t."ID"::text AS "ID"', 't."Added_Time"', 't."Modified_Time"', 't."Added_User"', 't."_extra"']
        for name, col in own_columns(form):
            parts.append(f"t.{q(name)}::text AS {q(name)}" if col["kind"] == "num" else f"t.{q(name)}")
        return ", ".join(parts)

    def display_of(form: str, row: dict) -> str:
        fmt = LOOKUP_DISPLAY.get(form)
        if fmt:
            shown = display_from_format(fmt, row)
            if shown.strip() != "":
                return shown
        for name, col in own_columns(form):
            v = row.get(name)
            if col["kind"] == "text" and v not in (None, "") and not col.get("lookup"):
                return str(v)
            if col["type"] == "name" and v:
                return " ".join(filter(None, [v.get("first_name"), v.get("last_name")]))
        return str(row["ID"])

    async def load_displays(form: str, rows: list[dict]) -> dict:
        need: dict[str, set[str]] = {}
        for name, col in own_columns(form):
            lookup_form = col.get("lookup")
            if not lookup_form or lookup_form not in COLUMNS:
                continue
            for row in rows:
                ids = row.get(name)
                for id_val in (ids if isinstance(ids, list) else [ids] if ids else []):
                    if not _is_id(id_val):
                        continue
                    need.setdefault(lookup_form, set()).add(str(id_val))
        for grid, subs in (GRID_LOOKUPS.get(form, {}) if form in RESOLVED_GRID_LOOKUP_FORMS else {}).items():
            for row in rows:
                cell = row.get(grid)
                if isinstance(cell, str):   # the row comes straight from the database: a grid is still JSON text
                    try:
                        cell = json.loads(cell)
                    except ValueError:
                        cell = []
                for grid_row in cell or []:
                    for sub_name, lookup_form in subs.items():
                        v = grid_row.get(sub_name) if isinstance(grid_row, dict) else None
                        if lookup_form in COLUMNS and _is_id(v):
                            need.setdefault(lookup_form, set()).add(str(v))
        displays: dict[str, dict[str, str]] = {}
        for lookup_form, ids in need.items():
            found = await db.fetch(
                f'SELECT {select_list(lookup_form)} FROM {q(lookup_form)} t WHERE t."ID" = ANY($1::bigint[])',
                [int(i) for i in ids],
            )
            displays[lookup_form] = {r["ID"]: display_of(lookup_form, dict(r)) for r in found}
        return displays

    def to_record(form: str, row: dict, displays: dict, raw: bool = False) -> dict:
        rec = {"ID": row["ID"], "Added_Time": row.get("Added_Time") or "", "Modified_Time": row.get("Modified_Time") or "", "Added_User": row.get("Added_User") or ""}
        for name, col in own_columns(form):
            v = row.get(name)
            if col["kind"] == "json":
                if v is not None and isinstance(v, str):
                    v = json.loads(v)
                if v is None:
                    v = [] if col["type"] in ("grid", "list", "checkboxes") else ""
                if col["type"] == "name" and isinstance(v, dict):
                    v = {**v, "zc_display_value": " ".join(filter(None, [v.get("prefix"), v.get("first_name"), v.get("last_name"), v.get("suffix")]))}
            elif col["kind"] == "bool":
                v = v is True
            elif col["kind"] == "num":
                v = "" if v is None else str(v)
            else:
                v = "" if v is None else v
            if not raw and col.get("lookup") and v not in ("", None):
                def one(id_val):
                    dv = displays.get(col["lookup"], {}).get(str(id_val), str(id_val))
                    return {"ID": str(id_val), "display_value": dv, "zc_display_value": dv}
                v = [one(x) for x in v] if isinstance(v, list) else one(v)
            if not raw and col["type"] == "grid" and form in RESOLVED_GRID_LOOKUP_FORMS and isinstance(v, list):
                subs = GRID_LOOKUPS.get(form, {}).get(name, {})
                if subs:
                    def resolve(grid_row):
                        if not isinstance(grid_row, dict):
                            return grid_row
                        out = dict(grid_row)
                        for sub_name, lookup_form in subs.items():
                            val = out.get(sub_name)
                            if _is_id(val):
                                dv = displays.get(lookup_form, {}).get(str(val), str(val))
                                out[sub_name] = {"ID": str(val), "display_value": dv, "zc_display_value": dv}
                        return out
                    v = [resolve(r) for r in v]
            rec[name] = v
        extra = row.get("_extra")
        if extra:
            if isinstance(extra, str):
                extra = json.loads(extra)
            rec.update(extra)
        return rec

    async def records(form: str, rows: list, raw: bool = False) -> list[dict]:
        rows = [dict(r) for r in rows]
        displays = {} if raw else await load_displays(form, rows)
        return [to_record(form, r, displays, raw) for r in rows]

    class Store:
        async def get_records(self, report_name: str, *, criteria=None, page=1, page_size=None, max_records=None, user=None) -> list[dict]:
            form, report_criteria = form_of_report(report_name)
            size = min(int(page_size or max_records or 200) or 200, 1000)
            offset = max((int(page) if page else 1) - 1, 0) * size

            where: list[str] = []
            params: list = []
            translated = True
            for src in (report_criteria, criteria):
                if not src or not str(src).strip():
                    continue
                t = criteria_to_sql(src, form, {"user": user}, len(params))
                if t is None:
                    translated = False
                    break
                where.append(t["sql"])
                params.extend(t["params"])

            if translated:
                where_sql = f"WHERE {' AND '.join(where)}" if where else ""
                rows = await db.fetch(
                    f'SELECT {select_list(form)} FROM {q(form)} t {where_sql} '
                    f'ORDER BY t."ID" DESC LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}',
                    *params, size, offset,
                )
                return await records(form, rows)

            # Slow path: filter in Python.
            report_test = compile_criteria(report_criteria, {"user": user})
            test = compile_criteria(criteria, {"user": user})
            rows = await db.fetch(f'SELECT {select_list(form)} FROM {q(form)} t ORDER BY t."ID" DESC')
            all_recs = [r for r in await records(form, rows) if report_test(r) and test(r)]
            return all_recs[offset:offset + size]

        async def get_record_by_id(self, report_name: str, id, *, raw: bool = False) -> dict:
            form, _ = form_of_report(report_name)
            if not _is_id(id):
                raise _not_found()
            rows = await db.fetch(f'SELECT {select_list(form)} FROM {q(form)} t WHERE t."ID" = $1::bigint', int(id))
            if not rows:
                raise _not_found()
            return (await records(form, rows, raw))[0]

        async def add_record(self, form_name: str, data: dict, user: str = "") -> str:
            form = form_by_name(form_name)
            async with _with_tx(db) as tx:
                input_ = dict(data)
                auto = [(k, c) for k, c in own_columns(form) if c["type"] == "autonumber" and (input_.get(k) is None or input_.get(k) == "")]
                if auto:
                    await tx.execute("SELECT pg_advisory_xact_lock(hashtext($1))", form)
                for k, _ in auto:
                    r = await tx.fetchrow(f"SELECT COALESCE(MAX({q(k)}), 0) + 1 AS n FROM {q(form)}")
                    input_[k] = r["n"]
                enc = encode(form, input_)
                out, extra = enc["out"], enc["extra"]
                now = zoho_now()
                names = ["Added_Time", "Modified_Time", "Added_User", "_extra", *out.keys()]
                vals = [now, now, user, extra, *out.values()]
                casts = ["", "", "", "::jsonb", *[_CAST[COLUMNS[form][k]["kind"]] for k in out]]
                placeholders = ", ".join(f"${i + 1}{casts[i]}" for i in range(len(names)))
                row = await tx.fetchrow(
                    f'INSERT INTO {q(form)} ({", ".join(q(n) for n in names)}) VALUES ({placeholders}) RETURNING "ID"::text AS id',
                    *vals,
                )
                return row["id"]

        async def update_record(self, report_or_form: str, id, data: dict, *, by_form: bool = False) -> str:
            form = form_by_name(report_or_form) if by_form else form_of_report(report_or_form)[0]
            if not _is_id(id):
                raise _not_found()
            cur = await db.fetchrow(f'SELECT "_extra" FROM {q(form)} WHERE "ID" = $1::bigint', int(id))
            if not cur:
                raise _not_found()
            existing_extra = cur["_extra"]
            if isinstance(existing_extra, str):
                existing_extra = json.loads(existing_extra)
            enc = encode(form, data, existing_extra)
            out, extra = enc["out"], enc["extra"]
            sets = [("_extra", extra, "::jsonb"), ("Modified_Time", zoho_now(), "")]
            sets += [(k, v, _CAST[COLUMNS[form][k]["kind"]]) for k, v in out.items()]
            set_sql = ", ".join(f"{q(k)} = ${i + 1}{c}" for i, (k, _, c) in enumerate(sets))
            await db.execute(
                f'UPDATE {q(form)} SET {set_sql} WHERE "ID" = ${len(sets) + 1}::bigint',
                *[v for _, v, _ in sets], int(id),
            )
            return str(id)

        async def delete_record(self, report_name: str, id) -> str:
            form, _ = form_of_report(report_name)
            if not _is_id(id):
                raise _not_found()
            row = await db.fetchrow(f'DELETE FROM {q(form)} WHERE "ID" = $1::bigint RETURNING "ID"', int(id))
            if not row:
                raise _not_found()
            return str(id)

        async def find(self, form_name: str, test=lambda r: True, *, criteria=None) -> list[dict]:
            form = form_by_name(form_name)
            t = criteria_to_sql(criteria, form, {}, 0) if criteria else None
            if t:
                rows = await db.fetch(f'SELECT {select_list(form)} FROM {q(form)} t WHERE {t["sql"]} ORDER BY t."ID"', *t["params"])
            else:
                rows = await db.fetch(f'SELECT {select_list(form)} FROM {q(form)} t ORDER BY t."ID"')
            return [r for r in (await records(form, rows, raw=True)) if test(r)]

        async def next_number(self, form_name: str, field: str, prefix: str, digits: int = 5) -> str:
            form = form_by_name(form_name)
            col = q(field)
            tbl = q(form)
            async with _with_tx(db) as tx:
                await tx.execute(
                    "INSERT INTO _number_series AS s (form, field, last_num) VALUES ($1, $2, 0) "
                    "ON CONFLICT (form, field) DO UPDATE SET last_num = s.last_num",
                    form, field,
                )
                row = await tx.fetchrow(
                    f"UPDATE _number_series SET last_num = GREATEST(last_num, "
                    f"COALESCE((SELECT MAX(CAST(NULLIF(substring({col} FROM '([0-9]+)$'), '') AS bigint)) FROM {tbl}), 0)) + 1 "
                    f"WHERE form = $1 AND field = $2 RETURNING last_num",
                    form, field,
                )
                n = row["last_num"]
            return f"{prefix}{str(n).zfill(digits)}"

        async def table_counts(self) -> list[dict]:
            parts = [f"SELECT '{f.replace(chr(39), chr(39) * 2)}' AS form, COUNT(*)::int AS rows FROM {q(f)}" for f in COLUMNS]
            rows = await db.fetch(" UNION ALL ".join(parts))
            return [dict(r) for r in rows if r["rows"]]

    return Store()
