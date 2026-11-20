# Parity with the Node reference (docs/superpowers/plans/2026-11-19-python-fulfillment-completion.md, Phase 2.2):
# the Python model must give the same answers as Node's server/model.mjs, which were exported once to
# tests/fixtures/node_model.json by tools/export-parity-fixtures.mjs. No database needed.
import json
from pathlib import Path

import app.model as model

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "node_model.json").read_text(encoding="utf-8"))


def test_the_same_forms_as_node():
    assert sorted(model.COLUMNS) == sorted(FIXTURE["columns"])


def test_every_column_has_the_same_type_kind_and_lookup_as_node():
    problems = []
    for form, cols in FIXTURE["columns"].items():
        mine = model.COLUMNS[form]
        for name in sorted(set(cols) | set(mine)):
            if name not in mine:
                problems.append(f"{form}.{name}: missing in Python")
            elif name not in cols:
                problems.append(f"{form}.{name}: extra in Python")
            else:
                got = {k: mine[name].get(k) for k in ("type", "kind", "lookup")}
                if got != cols[name]:
                    problems.append(f"{form}.{name}: Python {got} vs Node {cols[name]}")
    assert problems == [], "\n".join(problems[:20])


def test_the_lookup_display_formats_are_the_same_as_node():
    assert model.LOOKUP_DISPLAY == FIXTURE["lookupDisplay"]


def test_every_report_reads_the_same_form_with_the_same_criteria_as_node():
    problems = []
    for report, want in FIXTURE["reportForm"].items():
        got = model.form_of_report(report)
        if (want["form"], want.get("criteria")) != tuple(got):
            problems.append(f"{report}: Python {got} vs Node {(want['form'], want.get('criteria'))}")
    assert problems == [], "\n".join(problems[:20])
