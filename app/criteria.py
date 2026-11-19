# Pure helpers shared by every store backend: Zoho-style errors, Zoho date strings, and the Zoho
# criteria -> predicate compiler. Ported from server/criteria.mjs.
#
# Node's compileCriteria does not build an AST: it transliterates the Zoho criteria string
# token-by-token into a JS expression string, then compiles that string directly with `new
# Function()`. Every token is individually recognized and re-emitted (never pasted through
# unchecked), which is what makes that safe -- an unrecognized token raises before anything is
# compiled. This port keeps that exact token-by-token transliteration, emitting a Python
# expression string and compiling it with `eval()` in a namespace exposing only `v` (the field
# accessor) -- the same safety property, translated to Python's equivalent of `new Function()`.
#
# JS's `.includes("x")`/`.startsWith("x")`/`.endsWith("x")` are real methods on the string `v(...)`
# returns, so Node's token rewrite can stay a simple one-token-to-one-fragment substitution. Python
# strings don't have `.contains`, so `v()` below returns a _Val wrapper (a str/number/None subclass
# wrapper) whose `.contains`/`.startswith`/`.endswith` ARE real bound methods -- keeping this port's
# token rewrite just as simple as Node's, with no operand-splicing or regex-based rewriting needed.
import re
from datetime import datetime


class ZohoError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _pad(n: int) -> str:
    return str(n).rjust(2, "0")


def zoho_now(d: datetime | None = None) -> str:
    d = d or datetime.now()
    h = d.hour % 12 or 12
    ampm = "AM" if d.hour < 12 else "PM"
    return f"{d.year}-{_pad(d.month)}-{_pad(d.day)} {_pad(h)}:{_pad(d.minute)}:{_pad(d.second)} {ampm}"


def today() -> str:
    d = datetime.now()
    return f"{d.year}-{_pad(d.month)}-{_pad(d.day)}"


# Same token grammar as server/criteria.mjs's TOKEN, translated from a JS sticky regex to Python's
# re with manual position tracking (Python's re has no /y sticky flag; re.match at an explicit
# position is the equivalent).
TOKEN = re.compile(
    r"""\s+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\d+(?:\.\d+)?|&&|\|\||==|!=|>=|<=|>|<|\(|\)|!|,|"""
    r"""\.(?:contains|startsWith|endsWith)\s*\(|[A-Za-z_]\w*(?:\.(?!contains\b|startsWith\b|endsWith\b)\w+)*"""
)

_WHITESPACE = re.compile(r"^\s+$")
_QUOTED = re.compile(r"""^["']""")
_METHOD_CALL = re.compile(r"^\.(contains|startsWith|endsWith)")
_IDENT = re.compile(r"^[A-Za-z_]")
_TRAILING_PAREN_WS = re.compile(r"\s*\($")
_NUMERIC_STRING = re.compile(r"^-?\d+(\.\d+)?$")

_METHOD_NAME = {"contains": "contains", "startsWith": "startswith", "endsWith": "endswith"}


def tokenize(src: str) -> list[str]:
    s = str(src)
    pos = 0
    out: list[str] = []
    while pos < len(s):
        m = TOKEN.match(s, pos)
        if not m:
            raise ZohoError(3330, f"Unsupported criteria near: {s[pos:pos + 30]}")
        out.append(m.group(0))
        pos = m.end()
    return out


def _unescape_quoted(t: str) -> str:
    # strip the surrounding quote characters, then undo backslash-escaping, matching
    # `t.slice(1, -1).replace(/\\(.)/g, '$1')`.
    return re.sub(r"\\(.)", r"\1", t[1:-1])


class _Val:
    """Wraps a field's value so `.contains`/`.startswith`/`.endswith` are real bound methods,
    letting the token rewrite below stay a simple one-token-to-one-fragment substitution (the
    same shape as Node's `.includes(` rewrite) instead of needing to splice operands around a
    method call that Python strings don't natively support (`.contains`)."""

    __slots__ = ("value",)

    def __init__(self, value):
        self.value = value

    def _as_str(self) -> str:
        return "" if self.value is None else str(self.value)

    def contains(self, needle: str) -> bool:
        return needle in self._as_str()

    def startswith(self, needle: str) -> bool:
        return self._as_str().startswith(needle)

    def endswith(self, needle: str) -> bool:
        return self._as_str().endswith(needle)

    def __eq__(self, other):
        return self.value == (other.value if isinstance(other, _Val) else other)

    def __ne__(self, other):
        return self.value != (other.value if isinstance(other, _Val) else other)

    def __lt__(self, other):
        return self.value < (other.value if isinstance(other, _Val) else other)

    def __le__(self, other):
        return self.value <= (other.value if isinstance(other, _Val) else other)

    def __gt__(self, other):
        return self.value > (other.value if isinstance(other, _Val) else other)

    def __ge__(self, other):
        return self.value >= (other.value if isinstance(other, _Val) else other)

    def __bool__(self):
        return bool(self.value)

    def __hash__(self):
        return hash(self.value)


def compile_criteria(src: str | None, ctx: dict | None = None):
    ctx = ctx or {}
    if not src or not str(src).strip():
        return lambda rec: True

    s = str(src)
    py = ""
    for t in tokenize(s):
        if _WHITESPACE.match(t):
            py += " "
        elif _QUOTED.match(t):
            py += repr(_unescape_quoted(t))
        elif t == "true":
            py += "True"
        elif t == "false":
            py += "False"
        elif t == "null":
            py += "None"
        elif t == "zoho.currentdate":
            py += repr(today())
        elif t in ("zoho.loginuser", "zoho.loginuserid"):
            py += repr(ctx.get("user") or "")
        elif _METHOD_CALL.match(t):
            method = _METHOD_CALL.match(t).group(1)
            py += f".{_METHOD_NAME[method]}("
        elif t == "&&":
            py += " and "
        elif t == "||":
            py += " or "
        elif t == "!":
            py += " not "
        elif _IDENT.match(t):
            py += f"v({t!r})"
        else:
            py += t

    code = compile(py, "<criteria>", "eval")

    def v(name: str, rec: dict) -> _Val:
        x = rec.get(name.split(".")[0])
        if isinstance(x, dict) and not isinstance(x, list) and "ID" in x:
            x = x["ID"]
        if x == "" or x is None:
            return _Val(None)
        if name == "ID" or (isinstance(x, str) and _NUMERIC_STRING.match(x) and len(x) < 16):
            try:
                x = float(x) if "." in str(x) else int(x)
            except (TypeError, ValueError):
                pass
        return _Val(x)

    def predicate(rec: dict) -> bool:
        try:
            return bool(eval(code, {}, {"v": lambda name: v(name, rec)}))
        except Exception:
            return False

    return predicate
