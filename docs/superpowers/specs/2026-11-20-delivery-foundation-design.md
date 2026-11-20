# Delivery Management — Phase 1 (Foundation) — Design

## Context

This is Phase 1 of an 8-phase decomposition of the Delivery Management module port (Node:
`server/modules/delivery-management/`, 38 files, ~4,162 lines, ~30 custom APIs — confirmed by
`wc -l` and reading `index.mjs`/`apis.mjs` in full this session). It is the last large unported
Node module; Procurement (22 tasks) and Books/Akeneo/Shopify Integrations (7 tasks) are both
complete and committed (551/551 tests passing at the start of this sub-project).

Same governing rule as every prior sub-project: reproduce `jv-update`'s (Node) current behavior
exactly for parity — port only what real Node code implements.

**Phase order** (agreed with the owner): Foundation → Scheduling core → Sorter/Rotation → Day
Plans/Dispatch → Job lifecycle/Exceptions → Third-party/Returns/Maintenance → Analytics → CMS
Integration/Inventory APIs. Each phase is its own brainstorm → spec → plan → implementation cycle,
not one upfront design for all 38 files.

**Test coverage note**: Node has only one test file for the whole module
(`tests/delivery-management/failure-redelivery.test.js`) — far thinner than Procurement's
coverage. Owner's decision: every ported file still gets real Python tests, written from reading
Node's actual behavior (same approach already used for the untested Akeneo/Shopify clients).

## Scope of this phase

Four Node files, ported in full:

| Node file | Lines | Python file |
|---|---|---|
| `settings-defs.mjs` | 73 | `app/delivery/settings_defs.py` |
| `settings.mjs` | 203 | `app/delivery/settings.py` |
| `locks.mjs` | 21 | `app/delivery/locks.py` |
| `scoping.mjs` | 13 | `app/delivery/scoping.py` |

**`workflows.mjs` (29 lines) is explicitly OUT of scope for this phase.** It is purely an
import-order manifest for 15 other hook-registering files, almost all of which belong to later
phases (sorter, rotation, scheduling-engine, day-plans, service-appointment, etc. — confirmed by
reading it in full). Python's equivalent (an import list inside `app/delivery/__init__.py`, same
pattern as `app/procurement/apis.py`'s growing list of self-registering imports) will be built
incrementally as each later phase lands its own module. This phase creates `app/delivery/__init__.py`
as an empty-but-present package marker only.

## Why Foundation first

- `settings.py`'s catalogue (days/thresholds/percentages) is read by nearly every later phase's
  math (scheduling window, ranking, capacity, rotation, alerts).
- `locks.py`'s `with_lock` is used by `confirm_dms_schedule_request` (Phase 8) and will likely be
  reused by other once-only custom APIs in later phases.
- `scoping.py` defines the team-based row visibility (`Installer`/`Assigned_to_Installer`) that
  almost every later-phase query needs to respect.

## Component 1: `settings_defs.py`

Direct, mechanical port of the `SETTING_DEFS` list, `DEFS`/`GROUPS`/`is_delivery_key` derived
dicts/sets, `TYPE_FIELD` map, `typed()`, `problem_with()`, `workday_problem()`. Confirmed against
`app/procurement/settings_defs.py` — the Procurement module already established this exact
pattern (catalogue list → defs-by-key dict → group list → key-membership predicate →
validation function), so this is a straight structural copy with Delivery's own 19 setting keys
and values (traffic_buffer_percent, max_days_scheduling_window, workday_start_time/end_time,
soft_hold_minutes, default_promise_days, at_risk_slack_days, delivery_sites_per_team_per_day,
delivery_max_teams, delivery_heavy_box_threshold, dropoff_max_wait_days, rotation_days_ahead,
rotation_teams_per_day, rotation_max_hours, rotation_max_so_capacity, approval_sla_hours,
redelivery_silence_days, archive_after_days, permit_warn_days, maintenance_warn_days,
maintenance_warn_km — 19 keys total, confirmed by reading the source list in full).

One dependency: `problem_with()`'s time-type branch calls `clock()` from `scheduling.mjs` (Phase 2,
not yet ported). This phase provides its own `_clock(value)` helper — the same `/^(1[0-2]|0?[1-9]):([0-5]\d)\s(AM|PM)$/i` parse into `{hour, minute}`, confirmed from the regex Node already
uses inline in `settings-defs.mjs` itself (`clock(String(raw).trim())` where the format is
validated by the same regex right before the call) — so this phase does not block on Phase 2.
When Phase 2 lands `scheduling.py`'s own `clock()`, Phase 2's task list should re-point
`settings_defs.py` at the shared one and delete the duplicate (a one-line follow-up, noted here so
it isn't forgotten, not a TODO left in code).

## Component 2: `locks.py`

Direct port of `with_lock(key, fn)`: a `dict[str, asyncio.Task]`-based per-key serial queue (Node's
`Map` of promise tails → Python `dict` of `asyncio.Future`/`Task` tails). Same semantics: a second
call with the same key waits for the first to finish (success or failure) before it starts, so two
near-simultaneous calls never interleave their read-then-write. Same documented limitation as
Node's own comment: in-process only, not safe across multiple server instances (a future
Postgres-advisory-lock-based version is explicitly out of scope, matching Node, which also doesn't
have one yet).

## Component 3: `scoping.py`

Just the data: `TEAM_SCOPING = {"rules": [...], "allowedTabs": [...], "allowedWidgets": [...]}`,
byte-identical to Node's `teamScoping` export (confirmed by reading `scoping.mjs` in full: 2 rules —
`Service_Appointment_Form`/`Service_Appointment` → `Installer`, `Field_Work`/`Field_Work_Report` →
`Assigned_to_Installer` — plus the 3 allowed tabs/widgets already hardcoded as `app/access.py`'s
own fallback default, confirmed identical).

`app/main.py`'s `create_access(SECTIONS, str(WIDGETS))` call (line 57, confirmed via grep) gets a
third argument: `create_access(SECTIONS, str(WIDGETS), TEAM_SCOPING)`. This makes the dependency
explicit instead of relying on `app/access.py`'s baked-in default — no behavior change (the default
and the real value are identical), but it's the correct, intentional wiring rather than an
accidental match, and it's what every later phase's own scoping additions (if any) will build on.

## Component 4: `settings.py`

Ports `settings.mjs` almost in full:

- `settings_in_use(store)` — the value-in-use of every catalogue key (`Policy_Settings` table,
  existing — not a new table, confirmed: "Storage is the existing Policy_Settings table").
- Hooks on `Policy_Settings`: `before_add`/`before_update` (`_check`: validates key membership, key
  immutability, no duplicate row, range/time validation via `settings_defs.py`, normalizes
  `Value`/`Description`/`Type_field`), `after_add`/`after_update` (`_history`: writes
  `Delivery_Settings_History` only when the value actually changed, including the `'ranking'`
  re-score side effect), `before_delete`/`after_delete` (same history-on-delete pattern).
- `preview_setting(store, key, value)` — validates, then branches on `DEFS[key]["preview"]`:
  - `'ranking'`: **stubbed** — returns `fail("Ranking preview is not available yet (Phase 3 —
    Sorter/Rotation — has not been ported).")`. Real behavior (call `previewCategories` before/after,
    diff categories, report moved jobs) deferred to Phase 3, which will replace this stub.
  - `'backlog'`: **stubbed** — returns `fail("Backlog preview is not available yet (Phase 7 —
    Analytics — has not been ported).")`. Deferred to Phase 7.
  - anything else (`'none'`): fully ported now — `ok(f"No open job changes right now: this number
    is read when it is needed. {d['affects']}{shared}", {})`, no engine dependency.
- `get_settings(store)` — the full catalogue with value-in-use, source, last-changed, and a
  `problem` field for an out-of-range value saved before this page existed (`'saved'` source only).
  Fully portable now — only `preview_setting`'s two branches are stubbed, not this read path.
- The team roster (`get_roster`, `seed_roster`, `Delivery_Roster` hooks: `check_roster`,
  `log_roster`) — ported in full. `seed_roster`'s `ROSTER` built-in list and `roster_from(store)`
  come from `rotation.mjs` (confirmed: `import { ROSTER, rosterFrom } from './rotation.mjs'`) —
  Phase 3. **Stubbed for this phase**: `get_roster`/`seed_roster` return `fail("The roster is not
  available yet (Phase 3 — Sorter/Rotation — has not been ported).")` rather than a partial
  implementation, since the whole feature (not just one branch) depends on Phase 3's data.

**Custom APIs registered this phase** (from `apis.mjs`'s `implemented` dict, these four only —
confirmed none of them touch sorter/rotation/backlog outside what's described above):
`get_delivery_settings`, `preview_delivery_setting`, `get_delivery_roster`, `seed_delivery_roster`.

## Testing

Every component gets tests, written from reading the Node source (no Node test file exists for any
of these four files — confirmed via the earlier search that found only
`failure-redelivery.test.js`). Test file layout mirrors Procurement's: `tests/delivery/test_settings_defs.py`,
`tests/delivery/test_settings.py`, `tests/delivery/test_locks.py`, `tests/delivery/test_scoping.py`
(or folded into `test_settings.py` if scoping's data-only nature makes a dedicated file too thin —
decided at plan-writing time by what's actually testable).

Coverage to include: every setting's range/type validation (including the workday-pair rule),
catalogue read with `source`/`is_default`/`problem` correctly populated, history written only on
real change (not a no-op save), the `'ranking'`/`'backlog'` stub messages, roster stub messages,
`with_lock` serializing two overlapping calls (one starts only after the other's promise settles,
including after a rejection), `TEAM_SCOPING`'s shape matching Node's exactly and `create_access`
correctly receiving it.

## Out of scope (confirmed, not forgotten)

- `workflows.mjs` (the hook-registration manifest) — built incrementally as later phases land.
- The `'ranking'`/`'backlog'` preview branches and the team roster's real data — Phase 3.
- `clock()`'s canonical home in `scheduling.py` — Phase 2; this phase's duplicate gets deleted then.
- All 34 other Delivery Management files (scheduling, sorter, rotation, day plans, dispatch, job
  status, exceptions, failure/redelivery, backlog, settings UI widget changes, CMS sync, inventory
  APIs, etc.) — later phases, per the agreed 8-phase order.
