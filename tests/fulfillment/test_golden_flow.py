# Golden flow (plan Phase 2.3): the same scripted Fulfillment flow the Node reference ran (tests/fixtures/golden_fulfillment_flow.script.json,
# run by tools/golden-flow-node.mjs) is replayed through the HOOKED Python store, and every snapshot must equal the one Node produced
# (tests/fixtures/golden_fulfillment_flow.expected.json). Ids, timestamps, today's date and the Forecast_* fields are masked the same way on
# both sides. The expectation records Node's CURRENT behavior, including one known defect (see "known_defects" in the file); a deliberate fix
# in Python means regenerating the expectation on purpose.
import datetime
import json
import os
import re
from pathlib import Path

import pytest

from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment  # noqa: F401  (the package registers every Fulfillment hook on import)

FIX = Path(__file__).resolve().parent.parent / "fixtures"
SCRIPT = json.loads((FIX / "golden_fulfillment_flow.script.json").read_text(encoding="utf-8"))
EXPECTED_FILE = FIX / "golden_fulfillment_flow.expected.json"
EXPECTED = json.loads(EXPECTED_FILE.read_text(encoding="utf-8"))

SYSTEM = {"ID", "Added_Time", "Modified_Time", "Added_User"}
TS = re.compile(r"^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?( ?[AP]M|Z)?$", re.IGNORECASE)
TODAY = datetime.date.today().isoformat()


def mask_value(key, v, label_of_id):
    """The same rules as maskValue in tools/golden-flow-node.mjs."""
    if re.match(r"^Forecast", key):
        return "<forecast>"
    if v is None:
        return None
    if isinstance(v, list):
        return [mask_value("", x, label_of_id) for x in v]
    if isinstance(v, dict):
        return {k: mask_value(k, x, label_of_id) for k, x in sorted(v.items()) if k not in SYSTEM}
    if isinstance(v, str):
        if TS.match(v):
            return "<timestamp>"
        if v == TODAY:
            return "<today>"
        if re.fullmatch(r"\d{15,}", v) and v in label_of_id:
            return label_of_id[v]
    return v


def _by_id(rows):
    return sorted(rows, key=lambda r: int(r["ID"]))


async def _snapshot(raw_store):
    label_of_id = {}
    for form in SCRIPT["tracked_forms"]:
        for i, r in enumerate(_by_id(await raw_store.find(form))):
            label_of_id[str(r["ID"])] = f"{form}#{i + 1}"
    tables = {}
    for form in SCRIPT["tracked_forms"]:
        out = []
        for r in _by_id(await raw_store.find(form)):
            row = {"_id": label_of_id[str(r["ID"])]}
            for k, v in sorted(r.items()):
                if k not in SYSTEM:
                    row[k] = mask_value(k, v, label_of_id)
            out.append(row)
        tables[form] = out
    return tables


def _resolve(v, ids):
    if isinstance(v, str) and v.startswith("$") and v[1:] in ids:
        return ids[v[1:]]
    if isinstance(v, list):
        return [_resolve(x, ids) for x in v]
    if isinstance(v, dict):
        return {k: _resolve(x, ids) for k, x in v.items()}
    return v


@pytest.fixture
async def stores(db_conn):
    await ensure_schema(db_conn)
    raw = create_store(db_conn)
    return raw, create_hooked_store(raw)


def _first_difference(want, got, path=""):
    if type(want) is not type(got):
        return f"{path}: Node {want!r} vs Python {got!r}"
    if isinstance(want, dict):
        for k in sorted(set(want) | set(got)):
            if k not in want:
                return f"{path}.{k}: only in Python ({got[k]!r})"
            if k not in got:
                return f"{path}.{k}: only in Node ({want[k]!r})"
            d = _first_difference(want[k], got[k], f"{path}.{k}")
            if d:
                return d
        return None
    if isinstance(want, list):
        if len(want) != len(got):
            return f"{path}: Node has {len(want)} item(s), Python has {len(got)}"
        for i, (a, b) in enumerate(zip(want, got)):
            d = _first_difference(a, b, f"{path}[{i}]")
            if d:
                return d
        return None
    return None if want == got else f"{path}: Node {want!r} vs Python {got!r}"


async def _replay(raw, hooked):
    ids, snapshots = {}, []
    for n, step in enumerate(SCRIPT["steps"], start=1):
        if step["op"] == "add":
            target = raw if step.get("store") == "raw" else hooked
            ids[step["as"]] = str(await target.add_record(step["form"], _resolve(step["data"], ids)))
        elif step["op"] == "update":
            def matches(r, where=step["where"]):
                return all(str("" if r.get(k) is None else r.get(k)) == str(v) for k, v in where.items())
            rows = _by_id(await raw.find(step["form"], matches))
            assert rows, f"step {n} ({step['form']} {step['where']}): no matching row"
            await hooked.update_record(step["form"], rows[step.get("nth", 0)]["ID"], _resolve(step["data"], ids), by_form=True)
        elif step["op"] == "snapshot":
            snapshots.append({"name": step["name"], "tables": await _snapshot(raw)})
        else:
            raise AssertionError(f"step {n}: unknown op {step['op']}")
    return json.loads(json.dumps(snapshots, default=str))  # the same JSON round trip the expectation file went through


async def test_the_golden_flow_gives_the_expected_snapshots(stores):
    raw, hooked = stores
    snapshots = await _replay(raw, hooked)
    if os.environ.get("REGENERATE_GOLDEN") == "1":   # deliberate, reviewed rewrite of the expectation (see the header)
        EXPECTED_FILE.write_text(json.dumps({**EXPECTED, "snapshots": snapshots}, indent=1, ensure_ascii=False) + chr(10), encoding="utf-8")
        return
    assert len(snapshots) == len(EXPECTED["snapshots"])
    for want, got in zip(EXPECTED["snapshots"], snapshots):
        diff = _first_difference(want, got, f"[{want['name']}]")
        assert diff is None, diff


async def test_the_golden_flow_logs_one_stage_event_per_stage_entered_in_order(stores):
    # step 7.0: the log used to hold ONE event for this whole flow
    raw, hooked = stores
    await _replay(raw, hooked)
    sofs = _by_id(await raw.find("Sales_Order_Fulfillment"))
    first = sofs[0]
    events = [r["Event"] for r in _by_id(await raw.find("Stage_Events")) if r["Record_Id"] == str(first["ID"])]
    # spec v1.4 names (2026-11-20). Stage entries: created, ready, released (Picking), picked (Pack & QC), aggregated, dispatched (For Delivery);
    # in between the things that happened: picker assigned (2 items), QC rejected / passed, blocked while the exception is open, unblocked,
    # rework done, crated. The order is the order of the scripted flow.
    assert events == ["package.created", "package.ready", "package.released", "package.picker_assigned", "package.picker_assigned", "package.picked",
                      "package.qc_rejected", "package.qc_passed", "package.aggregated", "package.blocked", "package.qc_passed", "package.unblocked",
                      "package.rework_done", "package.qc_passed", "package.crated", "package.dispatched"]
