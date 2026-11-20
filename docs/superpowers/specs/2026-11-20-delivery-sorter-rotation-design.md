# Delivery Management — Phase 3 (Sorter/Rotation) — Design

## Context

Phase 3 of 8 in the Delivery Management port, following the completed Phase 1 (Foundation) and
Phase 2 (Scheduling core), both committed, 668/668 tests passing. Same governing rule as every
prior sub-project: reproduce `jv-update`'s (Node) current behavior exactly for parity — port only
what real Node code implements, confirmed by re-reading the actual `.mjs` source in full this
session.

## Scope of this phase

3 Node files, re-verified via `wc -l` and read in full (299 lines total):

| Node file | Lines | Python file |
|---|---|---|
| `sorter.mjs` | 156 | `app/delivery/sorter.py` |
| `sorter-hooks.mjs` | 14 | `app/delivery/sorter_hooks.py` |
| `rotation.mjs` | 129 | `app/delivery/rotation.py` |

## Correction to a prior assumption

An earlier task description for this phase assumed `sorter.py`'s `isBroken()`-equivalent would
need to import `BROKEN_FAILURE_CODES` from `scheduling.py` (Phase 2). Re-reading `sorter.mjs` in
full this session shows this is **not the case**: `isBroken(sa)` checks
`Complaint`/`Complaint_ID`/`RMA`/`Original_SO`/`Rescheduled_Via_Exception`/`Broken_Redelivery`
directly — it never references `BROKEN_FAILURE_CODES`. That set exists in `scheduling.py` for
Phase 5's `failure-redelivery.py` to decide *when* to set `Broken_Redelivery = true`; `sorter.py`
only ever reads the resulting boolean. `sorter.py` needs no import from `scheduling.py` for this.
`BROKEN_FAILURE_CODES` stays unused until Phase 5.

## Resolving the 3 tracked duplicates/stubs

### 1. `suggest_schedule.py`'s `_effective_target` duplicate

Confirmed identical in behavior to Node's real `effectiveTarget` (both already ported from the
same source this session — the duplicate was written correctly the first time). `suggest_schedule.py`
is edited to delete `_effective_target` and import `effective_target` from `app.delivery.sorter`
instead. No behavior change expected; existing Phase 2 tests for `suggest_schedule.py` must still
pass unmodified.

### 2. `settings.py`'s `preview_setting` — `'ranking'` branch

Currently: `return {"status": "error", "message": "Ranking preview is not available yet (Phase 3 —
Sorter/Rotation — has not been ported)."}`. Replaced with Node's real logic: call
`preview_categories(store)` (before) and `preview_categories(store, trial)` (after, where
`trial = {key: str(value)}`), diff categories by `sa.ID`, report `moved` (capped at 15) plus
`before`/`after` tallies across the 5 categories (`broken`, `late`, `at_risk`, `on_time`,
`blocked`), with the message `"{n} open job(s) would change category."` or `"No open job would
change category."` plus the `shared` suffix when the setting has one.

### 3. `settings.py`'s `get_roster`/`seed_roster`

Currently both stubbed with the same "Phase 3... has not been ported" message. Replaced with
Node's real logic: `get_roster` returns `{**(await roster_from(store)), "editable": len(rows) > 0}`;
`seed_roster` copies `ROSTER`'s built-in list into `Delivery_Roster` rows (once, with a `seeding`
guard so 13 rows log one history entry, not 13 — this guard already exists in Phase 1's
`settings.py`, just currently dead code behind the stub; it becomes live once the stub is removed).

## Component 1: `sorter.py`

Direct port of `sorter.mjs`. Same four categories as Fulfillment's own sorter: `broken` > `late` >
`at_risk` > `on_time`, `blocked` kept separate with its own rank numbering starting back at 1 (same
pattern as Procurement's `sorting.py`'s `rank()`, confirmed existing convention).

Exports: `effective_target(sa, policy) -> str | None`, `categorize(sa, *, now=None, policy=lambda
_: None) -> dict` (`{"category", "blockedReason", "priorityReason"}`), `rank(entries: list[dict]) ->
list[dict]` (adds `queueRank` to each entry, blocked numbered separately), `async def
preview_categories(store, overrides=None) -> list[dict]` (read-only, writes nothing — used by
`settings.py`'s preview), `async def rescore_all(store) -> dict` (`{"scored", "changed"}` — writes
`Category`/`Blocked_Reason`/`Queue_Rank`/`Priority_Reason`/`Suggested_Action`/`Scored_At` only when
something actually changed, matching Node's diff-before-write), `async def rescore_one(store,
_appointment_id) -> dict` (always rescores everything — ranks are global, same as Node's own
comment explains).

Deliberately NOT done, matching Node's own documented scope limits (same comment preserved):
capacity cut line/"Suggested Release" (needs later phases), anti-burial aging alerts (Fulfillment's
own sorter doesn't have these either), "Broken" sub-rules the schema can't see (damaged-in-transit
reason detail — only `Rescheduled_Via_Exception`/`Broken_Redelivery` booleans are checked, same as
Node).

**Custom API**: `recalculate_delivery_queue` (manual "Recalculate" trigger, not a Deluge port, same
pattern as Procurement/Fulfillment's own recalculate triggers) → `rescore_all(store)`, registered
directly in `implemented`-equivalent fashion (self-registered at the bottom of `sorter.py`).

## Component 2: `sorter_hooks.py`

Direct port of `sorter-hooks.mjs` — a single hook, `after_add`/`after_update` on
`Service_Appointment_Form`, unconditionally calling `rescore_all(store)` on every save. Matches
Node's own documented gap: exception-queue.py's `EXC_Resolve_Sync` and `scheduling_engine.py` both
write `Exception_Status` through the raw store (hooks' own writes don't re-fire hooks), so a
resolved exception doesn't re-score immediately yet — only on the next appointment save or the
nightly run. This is Node's own acknowledged, deliberate scope limit, not a bug to fix here.

**Hook ordering**: Node's real `workflows.mjs` (re-read in full this session) places
`sorter-hooks.mjs` after `confirmation.mjs` and `delivery-scheduling.mjs` (both already wired in
`app/delivery/__init__.py` from Phase 2) and before `job-status.mjs` (not yet ported). Everything
between them in Node's own order (`day-plans`, `service-appointment`, `site-checklist`, `geocode`,
`field-work`, `exception-queue`, `service-request`, `forecast-stamp`) belongs to later phases and is
simply absent from the import list for now — `sorter_hooks` becomes the new last entry.

## Component 3: `rotation.py`

Direct port of `rotation.mjs`. `ROSTER` (the built-in installers/drivers/vehicles list, ported
verbatim — exact names, exact order), `AUTO_TAG = "Auto rotation"`, `async def roster_from(store)
-> dict` (reads `Delivery_Roster` rows per role, sorted by `Sort_Order` then `ID`; falls back to
`ROSTER`'s built-in list for any role with zero active rows — TM-R4, "the roster is editable, never
empty"), `day_index(date) -> int` (year\*366 + day-of-year, the exact non-epoch-based formula,
ported unchanged per Node's own comment that it must reproduce identically with the widget's JS),
`teams_for_date(date, teams_per_day, roster=ROSTER) -> list[dict]` (the `% 7`/`% 11` pairing
formula — **load-bearing, ported byte-for-byte, not simplified**, per Node's own explicit warning
comment), `planned_rows(from_date, days, teams_per_day, *, work_days=None, roster=ROSTER) ->
list[dict]` (pure, no store access), `async def generate_rotation(store, *, today=None, days=None,
teams_per_day=None, hours=None, max_so=None, roster=None) -> dict` (`{"planned", "added"}` — fills
`Daily_Team_Availability` ahead of time, never overwrites an existing `(date, installer)` row,
TM-R1/TM-R3).

**Custom API**: `generate_team_rotation` (manual "Generate Month"-equivalent trigger, not a Deluge
port) → `generate_rotation(store)`, registered in `rotation.py`.

## Testing

Every component gets tests written from reading Node's actual behavior (no Node test file exists
for any of these 3 files). Test file layout: `tests/delivery/test_sorter.py`,
`test_sorter_hooks.py`, `test_rotation.py`, plus edits to the existing
`tests/delivery/test_suggest_schedule.py` (re-pointing regression — existing tests must still pass
unmodified after the import swap) and `tests/delivery/test_settings.py` (replacing the 3 stub
assertions with real-behavior assertions for `preview_setting`'s ranking branch and
`get_roster`/`seed_roster`).

Coverage to include: `categorize`'s full decision tree (blocked reasons, broken reasons, late/
at-risk/on-time slack math, forecast-misses-target), `rank`'s category ordering and blocked's
separate numbering, `rescore_all`'s diff-before-write (no write when nothing changed),
`teams_for_date`'s pairing formula against known values (reusing the spec's own claim — "24 of 25
possible installer/driver pairings over 120 days" — as a sanity check, not re-deriving the exact
sequence by hand), `roster_from`'s fallback-to-built-in-list behavior per role independently,
`generate_rotation`'s never-overwrite-existing-row guarantee.

## Out of scope (confirmed, not forgotten)

- `day-plans.mjs`, `load-sheet.mjs`, `dispatch.mjs`, `field-work.mjs`, `site-visits.mjs`,
  `site-checklist.mjs`, `service-appointment.mjs` — Phase 4.
- `job-status.mjs`, `exception-queue.mjs`, `failure-redelivery.mjs`, `auto-handoff.mjs` — Phase 5
  (this is also where `BROKEN_FAILURE_CODES` finally gets consumed).
- `third-party.mjs`, `sales-returns.mjs`, `truck-maintenance.mjs` — Phase 6.
- `backlog-calculator.mjs`, `damage-by-category.mjs`, `ship-to-sr-gap.mjs`, `geocode.mjs`,
  `forecast-stamp.mjs` — Phase 7 (this is also where `settings.py`'s `'backlog'` preview stub gets
  resolved).
- `cms-sync.mjs`, `inventory-apis.mjs`, `service-request.mjs`, `approval-decisions.mjs` — Phase 8.
