# Translates the common Zoho criteria forms to a parameterized SQL condition, so Postgres does the
# filtering. Returns None for anything it is not sure about; the caller then falls back to the JS-
# style predicate in app.criteria, so behaviour never gets worse than filtering in Python.
#
# Supported: field == / != literal (string, number, true/false, null), field.contains/startsWith/
# endsWith("text"), combined with && || ! and parentheses. Every piece is two-valued (never NULL),
# so NOT is safe. Ported from server/pg/criteria-sql.mjs -- a real recursive-descent parser (unlike
# app.criteria's token-transliteration approach), so it is ported the same way: a tokenizer plus a
# grammar of operand/compare/method/primary/unary/and/or functions.
import re

from app.criteria import TOKEN, today
from app.schema import quote_ident as _q


_WHITESPACE_ONLY = re.compile(r"^\s+$")
_QUOTED = re.compile(r"""^["']""")
_DIGIT_START = re.compile(r"^\d")
_IDENT = re.compile(r"^[A-Za-z_]\w*$")
_METHOD_CALL = re.compile(r"^\.(contains|startsWith|endsWith)\s*\($")
_DIGITS_ONLY = re.compile(r"^\d+$")


class Unsupported(Exception):
    pass


def _no():
    raise Unsupported()


def _tokenize(src: str) -> list[str]:
    s = str(src)
    pos = 0
    out: list[str] = []
    while pos < len(s):
        m = TOKEN.match(s, pos)
        if not m:
            _no()
        if not _WHITESPACE_ONLY.match(m.group(0)):
            out.append(m.group(0))
        pos = m.end()
    return out


def _unescape(t: str) -> str:
    return re.sub(r"\\(.)", r"\1", t[1:-1])


def criteria_to_sql(src: str | None, form: str, ctx: dict | None = None, offset: int = 0) -> dict | None:
    from app.model import COLUMNS

    ctx = ctx or {}
    if not src or not str(src).strip():
        return {"sql": "TRUE", "params": []}

    cols = COLUMNS[form]
    params: list = []

    def param(v) -> str:
        params.append(v)
        return f"${offset + len(params)}"

    try:
        toks = _tokenize(str(src))
        i = 0

        def peek():
            return toks[i] if i < len(toks) else None

        def take():
            nonlocal i
            if i >= len(toks):
                return None
            t = toks[i]
            i += 1
            return t

        def operand() -> dict:
            t = take()
            if t is None:
                _no()
            if _QUOTED.match(t):
                return {"lit": "string", "value": _unescape(t)}
            if _DIGIT_START.match(t):
                return {"lit": "number", "value": t}
            if t == "true" or t == "false":
                return {"lit": "bool", "value": t == "true"}
            if t == "null":
                return {"lit": "null"}
            if t == "zoho.currentdate":
                return {"lit": "string", "value": today()}
            if t in ("zoho.loginuser", "zoho.loginuserid"):
                return {"lit": "string", "value": ctx.get("user") or ""}
            if _IDENT.match(t) and (t == "ID" or t in cols):
                return {"field": t}
            return _no()

        def compare(a: dict, op: str, b: dict) -> str:
            if "lit" in a and "field" in b:
                a, b = b, a
            if "field" not in a or "lit" not in b:
                _no()
            eq = op == "=="
            col = _q(a["field"])
            if a["field"] == "ID":
                if b["lit"] == "null":
                    return "FALSE" if eq else "TRUE"
                if b["lit"] in ("string", "number") and _DIGITS_ONLY.match(str(b["value"])):
                    return f"{col} {'=' if eq else '<>'} {param(str(b['value']))}::bigint"
                return _no()
            kind = cols[a["field"]]["kind"]
            if kind == "text":
                if b["lit"] == "null":
                    return f"{'' if eq else 'NOT '}({col} IS NULL OR {col} = '')"
                if b["lit"] == "string" and b["value"] != "":
                    return f"{col} IS {'NOT ' if not eq else ''}DISTINCT FROM {param(b['value'])}"
                return _no()
            if kind == "num":
                if b["lit"] == "null":
                    return f"{col} IS {'' if eq else 'NOT '}NULL"
                if b["lit"] == "number":
                    return f"{col} IS {'NOT ' if not eq else ''}DISTINCT FROM {param(b['value'])}::numeric"
                return _no()
            if kind == "bool" and b["lit"] == "bool":
                return f"COALESCE({col}, FALSE) {'=' if eq else '<>'} {param(b['value'])}::boolean"
            return _no()

        def method(a: dict, m: str) -> str:
            arg = take()
            if "field" not in a or a["field"] == "ID" or cols[a["field"]]["kind"] != "text" or not arg or not _QUOTED.match(arg) or take() != ")":
                _no()
            col = _q(a["field"])
            p = param(_unescape(arg))
            if m == "contains":
                return f"COALESCE(strpos({col}, {p}) > 0, FALSE)"
            if m == "startsWith":
                return f"COALESCE(left({col}, length({p})) = {p}, FALSE)"
            return f"COALESCE(right({col}, length({p})) = {p}, FALSE)"

        def primary() -> str:
            if peek() == "(":
                take()
                e = or_()
                if take() != ")":
                    _no()
                return f"({e})"
            a = operand()
            t = take()
            if t == "==" or t == "!=":
                return compare(a, t, operand())
            mm = _METHOD_CALL.match(t or "")
            if mm:
                return method(a, mm.group(1))
            return _no()

        def unary() -> str:
            if peek() == "!":
                take()
                return f"NOT ({unary()})"
            return primary()

        def and_() -> str:
            e = unary()
            while peek() == "&&":
                take()
                e = f"({e} AND {unary()})"
            return e

        def or_() -> str:
            e = and_()
            while peek() == "||":
                take()
                e = f"({e} OR {and_()})"
            return e

        sql = or_()
        if i != len(toks):
            _no()
        return {"sql": sql, "params": params}
    except Unsupported:
        return None
