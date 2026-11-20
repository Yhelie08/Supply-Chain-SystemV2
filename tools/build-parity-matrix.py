"""Parity matrix: every Node Fulfillment / forecast test next to its Python test.

Run from the repo root:  python tools/build-parity-matrix.py
Writes docs/superpowers/plans/parity-fulfillment.md.

How it matches: a Python test's name is made from the Node test's title (snake_case), so both are cut into plain lower-case words
(small filler words dropped) and every Node test is paired with the Python test that shares the most words (Jaccard score). A pair under
MIN_SCORE is NOT trusted: it is listed as "unmapped" so a person looks at it. A Node test that was left out on purpose goes in
DEFERRED below with its reason (kept by hand). The script exits with 1 if a Node test is unmapped and not deferred.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "superpowers" / "plans" / "parity-fulfillment.md"
MIN_SCORE = 0.4

NODE_GLOBS = ["tests/fulfillment*.test.js", "tests/forecast.test.js", "tests/forecast/*.test.js"]
PY_GLOBS = ["tests/fulfillment/test_*.py", "tests/forecast/test_*.py", "tests/test_parity_*.py", "tests/test_schedules.py"]

# Hand-kept (checked by reading both tests): a piece of the Node title -> the Python test that covers it. Used when the wording differs too
# much for the automatic match. The script fails if the Python test named here does not exist.
HAND_MAP: dict[str, str] = {
    "older exceptions with no QC_ID": "test_older_exceptions_with_no_qc_id_are_reopened_too",
    "nothing changes on the way from Sales Order to Readiness to Pick": "test_values_copy_unchanged_so_to_readiness_to_pick",
    "saving a Sales_Order_Fulfillment record scores it automatically": "test_saving_a_sof_record_scores_it_automatically",
    "rankAndCutLine: SO_No ascending is the final tiebreak": "test_rank_and_cut_line_so_no_ascending_is_the_final_tiebreak",
    "rankAndCutLine: a WIP-stage entry": "test_rank_and_cut_line_a_wip_stage_entry_never_gets_suggested_release_or_consumes_capacity_twice",
    "rankAndCutLine: WIP exceeding capacity": "test_rank_and_cut_line_wip_exceeding_capacity_floors_free_capacity_at_0",
    'Box_Count_Source is "estimated"': "test_effective_boxes_estimated_source_also_falls_back",
    "backlogDays: open_boxes /": "test_backlog_days_open_boxes_over_capacity",
    "backlogDays: zero capacity": "test_backlog_days_zero_capacity_edge_cases",
    "peopleNeeded:": "test_people_needed_open_boxes_due_over_daily_capacity_times_days",
    "stageSlug: lowercases": "test_stage_slug_lowercases_and_replaces_spaces_and_ampersands",
    "stageSlug: blank stage": "test_stage_slug_blank_stage_produces_a_blank_slug",
    "property: the middle date is never outside the window": "test_property_the_middle_date_is_never_outside_the_window_and_never_before_today_over_many_random_orders",
    'a PR with a mode and no order: from the day it was added': "test_a_pr_with_a_mode_and_no_order",
    "per item: each Fulfillment row is one item": "test_per_item_each_fulfillment_row_is_one_item_with_its_own_forecast_an_item_with_no_pr_is_stock_on_hand",
    "the SKU of the item picks its Gate row": "test_items_are_matched_by_sku_when_a_stage_row_carries_one",
    'a PR with no SOF is stamped "No Client Date"': "test_a_pr_with_no_sof_yet_is_stamped_in_the_second_pass_always_no_client_date",
    "local time in a zone": "test_local_time_in_a_zone_01_00_in_manila_is_17_00_utc_the_day_before",
    "the runner runs a schedule once a day": "test_the_runner_runs_a_schedule_once_a_day_only_after_its_time_and_records_the_day",
    "a server that was down at 01:00": "test_a_server_that_was_down_at_01_00_runs_the_job_when_it_comes_back_that_day",
    "a failing job is logged": "test_a_failing_job_is_logged_is_not_retried_the_same_day_and_does_not_stop_the_next_schedule",
    "an instance that cannot get the lock": "test_an_instance_that_cannot_get_the_lock_skips_the_schedule_the_other_one_runs_it",
    "it is off unless SCHEDULES=on": "test_it_is_off_unless_schedules_is_on",
    "every form of the order is stamped": "test_every_form_of_the_order_is_stamped",
    "a second run writes nothing (this is what stops": "test_a_second_run_writes_nothing",
}

# Node test title (a piece of it) -> reason it has no Python twin. Kept by hand.
IN_BROWSER_DEMO = ("tests the in-browser demo in src/domain (the React prototype's own rules), not the server module; it stays JavaScript and is "
                   "not part of the Python backend port")
DEFERRED: dict[str, str] = {
    "the Delivery stamps now work out a forecast": "Delivery module (Service_Request1 / Service_Appointment_Form stamps live in server/modules/delivery-management); not ported to Python yet",
    "the modules list their schedules": "Python lists the Fulfillment schedules only (covered by test_the_fulfillment_module_lists_its_three_schedules_with_the_zoho_names_and_times); the Delivery, Team Rotation and Procurement schedules come with those modules",
}
DEFERRED_FILES: dict[str, str] = {
    "tests/fulfillment.test.js": IN_BROWSER_DEMO,
    "tests/forecast.test.js": IN_BROWSER_DEMO,
}

STOP = {"a", "an", "the", "is", "are", "of", "to", "and", "in", "on", "it", "its", "s", "as", "for", "by", "with", "this", "that", "or"}
NODE_TITLE = re.compile(r"""^\s*(?:test|it)\(\s*(['"`])(.*?)\1\s*,""", re.M)
PY_NAME = re.compile(r"^(?:async\s+)?def\s+(test_\w+)", re.M)


def words(text: str) -> set[str]:
    text = re.sub(r"([a-z0-9])([A-Z])", r" ", text)   # camelCase -> camel Case (effectiveBoxes -> effective boxes)
    found = {w for w in re.findall(r"[a-z0-9]+", text.lower().replace("_", " ")) if w not in STOP}
    return {w[:-1] if len(w) > 3 and w.endswith("s") else w for w in found}   # crude plural fix: units -> unit


def node_tests():
    for pattern in NODE_GLOBS:
        for path in sorted(ROOT.glob(pattern)):
            src = path.read_text(encoding="utf-8")
            for m in NODE_TITLE.finditer(src):
                yield path.relative_to(ROOT).as_posix(), m.group(2).replace("\\'", "'")


def py_tests():
    for pattern in PY_GLOBS:
        for path in sorted(ROOT.glob(pattern)):
            src = path.read_text(encoding="utf-8")
            for m in PY_NAME.finditer(src):
                yield path.relative_to(ROOT).as_posix(), m.group(1)


def score(a: set[str], b: set[str]) -> float:
    """Jaccard, but a Python name that holds nearly all of the (shorter) Node words also counts (names are often shortened)."""
    if not a or not b:
        return 0.0
    jaccard = len(a & b) / len(a | b)
    contained = len(a & b) / len(a)   # share of the Node words found in the Python name
    return max(jaccard, contained * 0.85 if contained >= 0.8 else 0.0)


def main() -> int:
    nodes = list(node_tests())
    pys = list(py_tests())
    py_words = [words(name) for _, name in pys]
    rows, unmapped = [], []
    for file, title in nodes:
        tw = words(title)
        best, best_score = None, 0.0
        for i, w in enumerate(py_words):
            s = score(tw, w)
            if s > best_score:
                best, best_score = i, s
        by_hand = next((py for key, py in HAND_MAP.items() if key in title), None)
        reason = DEFERRED_FILES.get(file) or next((why for key, why in DEFERRED.items() if key in title), None)
        if by_hand:
            hit = next((x for x in pys if x[1] == by_hand), None)
            if hit is None:
                raise SystemExit(f"HAND_MAP names a Python test that does not exist: {by_hand}")
            rows.append((file, title, "mapped", f"`{hit[0]}::{hit[1]}` (by hand)", 1.0))
        elif reason:
            rows.append((file, title, "deferred", reason, 0.0))
        elif best is not None and best_score >= MIN_SCORE:
            pf, pn = pys[best]
            rows.append((file, title, "mapped", f"`{pf}::{pn}`", best_score))
        else:
            hint = f" (closest: `{pys[best][1]}`, {best_score:.2f})" if best is not None else ""
            rows.append((file, title, "UNMAPPED", "none" + hint, best_score))
            unmapped.append((file, title))

    lines = [
        "# Parity matrix: Node Fulfillment / forecast tests vs the Python tests",
        "",
        "Made by `python tools/build-parity-matrix.py` (do not edit by hand; add a reason to `DEFERRED` in the script instead).",
        f"A Node test counts as mapped when a Python test shares at least {MIN_SCORE:.0%} of its words (a Python test name is its Node title in snake_case); a few are mapped by hand in `HAND_MAP` after reading both tests.",
        "",
        f"- Node tests: **{len(nodes)}**; Python tests looked at: **{len(pys)}**",
        f"- mapped: **{sum(1 for r in rows if r[2] == 'mapped')}**, deferred: **{sum(1 for r in rows if r[2] == 'deferred')}**, "
        f"unmapped: **{len(unmapped)}**",
        "",
        "| Node file | Node test | Status | Python test | Match |",
        "|---|---|---|---|---|",
    ]
    for file, title, status, target, s in rows:
        lines.append(f"| {file} | {title.replace('|', '/')} | {status} | {target} | {s:.2f} |" if status == "mapped" else
                     f"| {file} | {title.replace('|', '/')} | {status} | {target} | |")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(nodes)} Node tests, {len(rows) - len(unmapped)} mapped or deferred, {len(unmapped)} unmapped -> {OUT.relative_to(ROOT)}")
    for file, title in unmapped:
        print(f"  UNMAPPED {file}: {title}")
    return 1 if unmapped else 0


if __name__ == "__main__":
    sys.exit(main())
