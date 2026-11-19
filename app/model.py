# Loads zoho-export/parsed/forms/*.json plus server/spec-forms/*.json (fields added to an existing
# form without being wiped by a future npm run parse-ds re-export) into FORMS/COLUMNS. Ported from
# server/model.mjs — same two-pass structure: base forms, then spec-forms merge.
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARSED = ROOT / "zoho-export" / "parsed"
SPEC_FORMS = ROOT / "server" / "spec-forms"

SYSTEM_COLUMNS = ["ID", "Added_Time", "Modified_Time", "Added_User", "_extra"]

NO_VALUE = {"section", "help_text", "plaintext", "submit", "cancel", "tooltip"}
NUMBER = {"number", "decimal", "percentage", "CNY", "PHP", "currency", "autonumber"}
JSONISH = {"grid", "name", "address", "checkboxes", "list"}


def _load_forms() -> dict:
    forms = {}
    for f in (PARSED / "forms").glob("*.json"):
        form = json.loads(f.read_text(encoding="utf-8"))
        forms[form["name"]] = form
    if SPEC_FORMS.exists():
        for f in sorted(SPEC_FORMS.glob("*.json")):
            add = json.loads(f.read_text(encoding="utf-8"))
            own = forms.get(add["name"])
            if add.get("extends"):
                if not own:
                    raise RuntimeError(f'spec-forms/{f.name} extends "{add["name"]}", which is not in the parsed export')
                have = {x["name"] for x in own["fields"]}
                own["fields"].extend(x for x in add["fields"] if x["name"] not in have)
            elif not own:
                forms[add["name"]] = {"name": add["name"], "label": add.get("label", add["name"]), "fields": add["fields"]}
    return forms


def _load_reports() -> dict:
    reports_file = PARSED / "reports.json"
    if not reports_file.exists():
        return {}
    return {r["name"]: r for r in json.loads(reports_file.read_text(encoding="utf-8"))}


def _build_columns(forms: dict) -> dict:
    columns = {}
    for form in forms.values():
        cols = {}
        for f in form.get("fields", []):
            ftype = f.get("type")
            if ftype in NO_VALUE or not ftype:
                continue
            if ftype == "checkbox":
                kind = "bool"
            elif ftype in NUMBER:
                kind = "num"
            elif ftype in JSONISH:
                kind = "json"
            else:
                kind = "text"
            lookup = f.get("lookup", {}).get("form") if isinstance(f.get("lookup"), dict) else None
            cols[f["name"]] = {"type": ftype, "kind": kind, "lookup": lookup}
        columns[form["name"]] = cols
    return columns


def _build_lookup_display(forms: dict) -> dict:
    # How Zoho shows a record of each form when another form looks it up, e.g. Items -> "[item_name]",
    # Suppliers -> `[" " + Supplier_Name.first_name]` (the form's lookup fields all agree on one format).
    lookup_display: dict[str, str] = {}
    for form in forms.values():
        for f in form.get("fields", []):
            lookup = f.get("lookup")
            if isinstance(lookup, dict) and f.get("displayformat"):
                lookup_display.setdefault(lookup["form"], f["displayformat"])
    return lookup_display


FORMS = _load_forms()
REPORTS = _load_reports()
COLUMNS = _build_columns(FORMS)
LOOKUP_DISPLAY = _build_lookup_display(FORMS)

_DISPLAY_TOKEN = re.compile(r"""\s*(?:"((?:[^"\\]|\\.)*)"|([A-Za-z_]\w*(?:\.\w+)*)|(\+))""")


def display_from_format(fmt: str | None, row: dict) -> str:
    """Evaluates a display format such as `[customer_name]` or `[" " + Supplier_Name.first_name]`
    on a stored row. Only field names (with a dotted part for name/address fields), string literals
    and + are understood; anything else gives '' so the caller can fall back."""
    inner = str(fmt or "").strip()
    inner = re.sub(r"^\[", "", inner)
    inner = re.sub(r"\]$", "", inner)
    out = ""
    expect_value = True
    pos = 0
    while pos < len(inner):
        m = _DISPLAY_TOKEN.match(inner, pos)
        if not m:
            return ""
        pos = m.end()
        if m.group(3):  # '+'
            if expect_value:
                return ""
            expect_value = True
            continue
        if not expect_value:
            return ""
        expect_value = False
        if m.group(1) is not None:
            out += re.sub(r"\\(.)", r"\1", m.group(1))
        else:
            parts = m.group(2).split(".")
            field, path = parts[0], parts[1:]
            v = row.get(field)
            for p in path:
                v = v.get(p) if isinstance(v, dict) else None
            out += "" if v is None or isinstance(v, (dict, list)) else str(v)
    return "" if expect_value else out


def form_of_report(report_name: str) -> tuple[str, str | None]:
    from app.criteria import ZohoError
    r = REPORTS.get(report_name)
    if r and r.get("form") in COLUMNS:
        return r["form"], r.get("criteria")
    if report_name in COLUMNS:
        return report_name, None
    raise ZohoError(9230, f"Report '{report_name}' not found in the parsed .ds")


def form_by_name(form_name: str) -> str:
    from app.criteria import ZohoError
    if form_name not in COLUMNS:
        raise ZohoError(9220, f"Form '{form_name}' not found in the parsed .ds")
    return form_name
