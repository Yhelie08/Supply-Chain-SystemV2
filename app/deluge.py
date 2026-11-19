# Small helpers standing in for Deluge idioms, ported from server/workflows/deluge.mjs. Only the
# subset Fulfillment and its forecast dependency actually use -- not a full port of that file.
import re
from datetime import date, timedelta


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
