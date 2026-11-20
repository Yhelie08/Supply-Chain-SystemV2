# Small helpers standing in for Deluge idioms, ported from server/workflows/deluge.mjs. Only the
# subset Fulfillment/forecast/Procurement actually use -- not a full port of that file.
import math
import re
from datetime import date, datetime, timedelta


def blank(v) -> bool:
    return v is None or v == ""


def truthy(v) -> bool:
    return v is True or v == "true" or v == 1 or v == "1"


def add_days(d: date, n: int) -> date:
    return d + timedelta(days=n)


def day_diff(a: date, b: date) -> int:
    return (a - b).days


def today_date() -> date:
    return date.today()


_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")


def parse_date(v) -> date | None:
    if v is None:
        return None
    m = _DATE_RE.match(str(v).strip())
    if not m:
        return None
    return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))


def ymd(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}"


def id_of(v) -> str:
    if isinstance(v, dict):
        v = v.get("ID") or v.get("id") or ""
    return str(v if v is not None else "").strip()


def ids_of(v) -> list[str]:
    if v is None or v == "":
        return []
    items = v if isinstance(v, list) else [v]
    return [x for x in (id_of(item) for item in items) if x]


def unbracket(v) -> str:
    s = str(v if v is not None else "").strip()
    s = re.sub(r"^\s*\[", "", s)
    s = re.sub(r"\]\s*$", "", s)
    return s.strip()


def to_num(v) -> float:
    if blank(v):
        return 0.0
    try:
        n = float(v)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if n != n else n  # NaN guard


def has_value(v) -> bool:
    return not blank(v) and to_num(v) != 0


def same_value(a, b) -> bool:
    if blank(a) and blank(b):
        return True
    if blank(a) or blank(b):
        return False
    if str(a) == str(b):
        return True
    try:
        return float(a) == float(b)
    except (TypeError, ValueError):
        return False


def lower(v) -> str:
    return str(v if v is not None else "").strip().lower()


def inquiry_number(seq) -> str:
    return f"INQ-{int(to_num(seq)):05d}"


# Matches JS Math.round((n + Number.EPSILON) * 100) / 100: rounds half away from zero, not
# Python's round()'s round-half-to-even, which differs at exact .xx5 boundaries.
def round2(n: float) -> float:
    return math.floor(n * 100 + 0.5 + 1e-9) / 100 if n >= 0 else -math.floor(-n * 100 + 0.5 + 1e-9) / 100


def lit(s) -> str:
    escaped = str(s).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


# Matches JS's String(Number(v)): a whole number prints with no trailing ".0".
def num_text(v) -> str:
    n = to_num(v)
    return str(int(n)) if n == int(n) else str(n)


def stamp(d: datetime | None = None) -> str:
    d = d or datetime.now()
    return f"{d.year:04d}{d.month:02d}{d.day:02d}{d.hour:02d}{d.minute:02d}{d.second:02d}"
