# Delivery Management — Phase 2 (Scheduling core) — Design

## Context

Phase 2 of 8 in the Delivery Management port, following the completed Phase 1 (Foundation:
`settings_defs.py`, `settings.py`, `locks.py`, `scoping.py`, all committed, 597/597 tests passing).
Same governing rule as every prior sub-project: reproduce `jv-update`'s (Node) current behavior
exactly for parity — port only what real Node code implements, confirmed by re-reading the actual
`.mjs` source in full this session (not trusted from any prior summary).

**Phase order** (unchanged): Foundation → **Scheduling core** → Sorter/Rotation → Day
Plans/Dispatch → Job lifecycle/Exceptions → Third-party/Returns/Maintenance → Analytics → CMS
Integration/Inventory APIs.

## Scope of this phase

7 Node files, re-verified via `wc -l` and read in full (749 lines total):

| Node file | Lines | Python file |
|---|---|---|
| `scheduling.mjs` | 252 | `app/delivery/scheduling.py` |
| `scheduling-engine.mjs` | 137 | `app/delivery/scheduling_engine.py` |
| `earliest-slot.mjs` | 156 | `app/delivery/earliest_slot.py` |
| `suggest-schedule.mjs` | 91 | `app/delivery/suggest_schedule.py` |
| `time-window.mjs` | 45 | `app/delivery/time_window.py` |
| `delivery-scheduling.mjs` | 28 | `app/delivery/delivery_scheduling_hooks.py` |
| `confirmation.mjs` | 40 | `app/delivery/confirmation.py` |

`delivery-scheduling.mjs` is renamed `delivery_scheduling_hooks.py` (not `delivery_scheduling.py`)
to avoid colliding with the module name `delivery-scheduling` as a Python identifier once this
package grows; its only export (`teams_without_availability`) and its hook register on the
`Delivery_Scheduling` form.

## Cross-cutting fixes bundled into this phase

### 1. `settings_defs.py`'s `_clock` was wrong — two Node functions got collapsed into one

Phase 1's `_clock(value)` was written as a private stand-in using a **strict** regex
(`^(1[0-2]|0?[1-9]):([0-5]\d)\s(AM|PM)$`), because `scheduling.mjs`'s real `clock()` didn't exist
in Python yet. Re-reading `scheduling.mjs` this session shows its real `clock(text)` is actually
**lenient**: it splits on a single space, parses whatever integers appear before/after the colon in
the first part, and the AM/PM suffix, with no strict-format rejection (`clock("8:0 AM")`,
`clock("25:99 AM")` all parse to *something* in Node — garbage in, garbage out, no validation).

The strict regex Phase 1 ported actually belongs to a **different** function —
`problemWith`'s own inline check in `settings-defs.mjs`, which validates the raw string *before*
ever calling `clock()`. These are two separate concerns in Node: `clock()` parses, `problemWith`'s
own regex validates. Phase 1 merged them into one `_clock` that did both (strict parse that returns
`None` on bad input), which is behaviorally different from Node's `clock()` wherever Phase 2's code
needs the *lenient* parser (e.g. `slotText`/`slot_text`, which calls `clock()` on an already-trusted
stored value, not user input).

**Fix**: `scheduling.py`'s `clock(text)` is ported as Node's real lenient parser. `settings_defs.py`
is updated to import `clock` from `scheduling.py` and keep its own strict regex check inline in
`problem_with`/`workday_problem` (unchanged — that part was always correct, since it mirrors
`problemWith`'s own separate regex), but delegates the actual hour/minute extraction to the shared
`clock()` once the strict regex has already passed. The private `_clock` is deleted.

### 2. `suggest_schedule.py`'s `effective_target` duplicates `sorter.mjs` (Phase 3)

`suggest-schedule.mjs` imports `effectiveTarget` from `sorter.mjs` (Phase 3, not yet ported) — a
small (9-line), self-contained function with no further dependency on the rest of `sorter.mjs`.
Same resolution as Phase 1's `_clock` duplication: `suggest_schedule.py` gets its own private
`_effective_target(sa, policy)`, a byte-for-byte port of Node's function, with a comment noting it
is a tracked duplicate to be re-pointed at Phase 3's real `sorter.py` once that phase ships.

### 3. `Service_Appointment_Form`'s spec-forms extension is missing `Time_Window`

A diff of Python's and Node's `server/spec-forms/Service_Appointment_Form.json` found Python is
missing 3 fields Node has: `Time_Window`, `Books_Payment_Status`, `Books_Payment_Checked_At`. Only
`Time_Window` belongs to Phase 2 (`time-window.mjs` stamps it directly); the other two belong to
Phase 4's pre-delivery gate (`dispatch.mjs`'s `runPreDeliveryGate`, confirmed by their own
`helpText`: "G3 (pre-delivery gate)"). Per the owner's decision, only `Time_Window` is added now;
Phase 4 adds the other two when it needs them.

The three forms Phase 2's hooks also touch (`Daily_Team_Availability`, `DMS_Exception_Queue`,
`Delivery_Scheduling`) already exist in `zoho-export/parsed/forms/` in the Python repo — confirmed
via direct file check, no copying needed (unlike Phase 1's `Policy_Settings`/etc., which were
missing from `spec-forms` entirely; these three were never spec-forms additions in Node either,
they're in the raw parsed export both repos already share).

## Component 1: `scheduling.py`

Direct port of `scheduling.mjs`. Exports: `SA = "Service_Appointment_Form"`,
`BROKEN_FAILURE_CODES = {"damaged_in_transit", "refused"}`, `r6(x)` (round to 6 decimals, avoids
binary-float noise), `hrs(x)` (2-decimal string), `null_text(v)` (blank → `"null"`, matching
Deluge's null-to-text join), `day(v)` (first 10 chars), `customer_name(rec)`, `clock(text)` (the
fix from above — lenient parser), `stored_clock(text)` (`"8:00 AM"` → `"08:00:00 AM"`),
`slot_text(start_text, used_hours)`, `policy_reader(store, overrides=None)` (returns a callable
`key -> str | None`, reading `Policy_Settings` with `overrides` for previews), `to_long(v,
fallback)`, `workday_length(policy)` (default 9), `default_duration(d_type)`, `normalize_type(raw)`,
`raise_exception(store, rec, *, stage, reason, severity, user="")`, `schedule_slot(store,
record_id, is_rerun, options=None)` — the public entry point, wrapped in `with_lock("scheduling",
...)` (Phase 1's `locks.py`), and the real `_schedule_slot_now` implementation: guards (finished,
Pick Up, flagged exception), duration/buffer calculation from settings, day-by-day slot search
across `Daily_Team_Availability`, the winner-selection tie-break exactly as documented in Node's own
header comment (quirks 1–5 preserved verbatim, including the deliberate whole-minutes-not-decimal
bug-fix difference already called out in Node's own comments), the Priority auto-confirm path.

Every quirk Node's header comment documents is preserved as-is: this is a parity port, not a
"fixed" version — Node's own comments already explain why each quirk exists and which one (#3, the
decimal-minutes bug) was deliberately NOT reproduced (Node itself fixed it when porting from Zoho;
Python inherits Node's fixed behavior, not Zoho's original bug).

## Component 2: `scheduling_engine.py`

Direct port of `scheduling-engine.mjs`'s 4 `Service_Appointment_Form` hook actions, registered via
`register(SA, {"afterAdd": actions, "afterUpdate": actions})` where `actions` is the ordered list
`[run_engine, confirm_calendar, tag_finished_status, convert_to_pick_up]` — same hook-runs-in-
registration-order semantics `app/workflows.py`'s `HookedStore` already provides (confirmed:
`PHASES` list + `entry.setdefault(phase, []).extend(fn_list)`, order preserved). `confirm_calendar`
is wrapped in `with_lock("scheduling", confirm_calendar_now)`, same lock key `schedule_slot` uses,
so the two serialize against each other correctly (Node's own comment: "queued with the engine's
other scheduling work").

## Component 3: `earliest_slot.py`

Direct port of `earliest-slot.mjs`. `find_earliest_slot(store, *, job_type=None, est_minutes=None,
from_date=None, now=None)` — read-only, reuses the same capacity math as `scheduling.py`'s
`schedule_slot` but does not write anything, returns a day-by-day reason trail.
`teams_with_room_on(store, date, *, job_type=None, est_minutes=None, now=None)` — every team with
room on one given date, sorted by remaining capacity. `quote_and_hold(store, *, job_type=None,
est_minutes=None, from_date=None, quoted_by="", sr_no="")` — finds the earliest slot and holds it
in `Schedule_Holds` for `soft_hold_minutes`. `release_hold(store, hold_id)`. Needs its own local
`_parse_zoho(v)` ("2026-11-18 10:55:59 AM" → datetime), a byte-for-byte duplicate of Node's own
local parser — Node's own comment already notes this is deliberately not shared with
`decisions-core.mjs`'s equivalent in Procurement, so Python keeps the same non-sharing.

## Component 4: `suggest_schedule.py`

Direct port of `suggest-schedule.mjs`. `suggest_schedule(store, sa_id, *, now=None,
from_date=None)` — the read-mostly "what should the dispatcher see" layer: finds the earliest slot,
picks a team preferring one already going to the same city, raises an `Approval_Queue` item for a
drop-off that needs third-party booking or an installation with no slot before its target. Uses
`prepare_approval` (one-pending-item-per-kind-and-job dedup) and the local `_effective_target`
duplicate described above.

## Component 5: `time_window.py`

Direct port of `time-window.mjs`. `window_for(slot, start="8:00 AM", end="5:00 PM")` — pure
function, half-day cut at noon. Hooks on `Service_Appointment_Form`: `before_add`/`before_update`
strip any widget-supplied `Time_Window` (server-only field), `after_add`/`after_update` stamp the
computed value, only writing when it actually changed (loop-safety, matching Node's own comment).
Needs the `Time_Window` field added to `server/spec-forms/Service_Appointment_Form.json` (see fix
#3 above) before this component's tests can pass.

## Component 6: `delivery_scheduling_hooks.py`

Direct port of `delivery-scheduling.mjs`. `teams_without_availability(rec, store)` — for each
installer on a `Delivery_Scheduling` record, checks for a matching `Daily_Team_Availability` row
that isn't "Not Available"; returns the list of installers with no such row. The
`before_add`/`before_update` hook logs a warning (Python `logging`, matching the existing
`app/workflows.py` convention already established for swallowed-hook-errors) but never blocks the
write — ported as a warning-only quirk, exactly as Node's own comment documents ("Zoho only shows
an alert and never cancels the save... It is ported as a warning in the server log").

## Component 7: `confirmation.py`

Direct port of `confirmation.mjs`. `before_add`/`before_update` hooks on `Service_Appointment_Form`
stamp `Appointment_Confirmed_At` once when the transient `Confirm_Appointment` trigger is set true
(clearing the trigger back to false, same "stamp once, clear the flag" pattern already established
elsewhere in this port, e.g. `Report_Event` fields in Procurement). `run_confirm_cutoff_check(store,
*, now=None)` — the AP-R4 unconfirmed-by-cutoff alert, checked for every appointment
confirmed-scheduled for tomorrow; not registered as a scheduled job in this phase (Delivery's
scheduled-jobs wiring, `index.mjs`'s `schedules` list equivalent, is out of scope until the phase
that handles `index.mjs` itself — likely folded into whichever later phase finishes wiring
`app/delivery/__init__.py`'s full hook-registration chain).

## Custom API: `dms_reschedule`

Per the owner's decision, registered now (not deferred): `dms_reschedule(payload, store, ctx)` →
`schedule_slot(store, payload["recordId"], True, {"user": ctx.get("user", "")})`. This is the only
custom API Phase 2 introduces; the other `apis.mjs` entries that reference Phase 2's functions
(`get_earliest_slot`, `quote_and_hold_slot`, `release_schedule_hold`, `suggest_schedule`) are left
unregistered for now, since this phase scopes to the 7 files above, not a full `apis.mjs` wiring
pass — those come with whichever later task does that (the plan can decide whether to extend this
phase's own Task list to cover them, since they are thin wrappers with zero new logic, or defer
explicitly; flagged here for the plan-writing step to decide, not assumed).

## `app/delivery/__init__.py` — first real hook registrations

Phase 1 left this file empty (only importing `settings.py`, which registers no hooks of its own
beyond `Policy_Settings`/`Delivery_Roster`). Phase 2 is the first phase where `workflows.mjs`'s own
import *order* starts to matter: `scheduling-engine.mjs` must be registered on
`Service_Appointment_Form` before `time-window.mjs`'s own hooks on the same form (Node's own
`workflows.mjs` comment: "Day plans... after scheduling-engine.mjs on purpose" — though day-plans
itself is Phase 4, the general principle — register in Node's own `workflows.mjs` order — applies
here too for the overlapping forms this phase touches). `app/delivery/__init__.py` adds, in this
exact order: `scheduling_engine`, `time_window`, `confirmation`, `delivery_scheduling_hooks` (this
order matches `workflows.mjs`'s own: scheduling-engine, [day-plans — Phase 4, skipped],
[service-appointment — Phase 4, skipped], [site-checklist — Phase 4, skipped], confirmation,
[geocode — not yet phased, skipped], [field-work — Phase 4, skipped], delivery-scheduling). Files
not yet ported are simply absent from the import list for now, not stubbed.

## Testing

Every component gets tests written from reading Node's actual behavior (no Node test file exists
for any of these 7 files — confirmed, matching the module-wide pattern of only
`failure-redelivery.test.js` existing). Test file layout mirrors Phase 1:
`tests/delivery/test_scheduling.py`, `test_scheduling_engine.py`, `test_earliest_slot.py`,
`test_suggest_schedule.py`, `test_time_window.py`, `test_delivery_scheduling_hooks.py`,
`test_confirmation.py`.

Coverage to include: `clock()`'s lenient parsing (and that `settings_defs.py`'s strict validation
still correctly rejects bad input before ever reaching the shared parser — a regression test
specifically for the fix in this phase), `schedule_slot`'s guards/duration/buffer math/winner
selection/Priority auto-confirm, the scheduling-engine's 4 actions each independently and their
registered order, `find_earliest_slot`/`teams_with_room_on`/hold lifecycle, `suggest_schedule`'s
city tie-break and third-party/escalation paths, `window_for`'s noon cut and the stamp-only-on-
change hook, the capacity warning's non-blocking behavior, confirmation stamping and the cutoff
check.

## Out of scope (confirmed, not forgotten)

- `sorter.mjs`, `rotation.mjs` — Phase 3 (duplicated functions tracked for re-pointing then).
- `day-plans.mjs`, `load-sheet.mjs`, `dispatch.mjs`, `field-work.mjs`, `site-visits.mjs`,
  `site-checklist.mjs`, `service-appointment.mjs` — Phase 4.
- `job-status.mjs`, `exception-queue.mjs`, `failure-redelivery.mjs`, `auto-handoff.mjs` — Phase 5.
- `third-party.mjs`, `sales-returns.mjs`, `truck-maintenance.mjs` — Phase 6.
- `backlog-calculator.mjs`, `damage-by-category.mjs`, `ship-to-sr-gap.mjs`, `geocode.mjs`,
  `forecast-stamp.mjs` — Phase 7.
- `cms-sync.mjs`, `inventory-apis.mjs`, `service-request.mjs`, `approval-decisions.mjs`, the rest of
  `apis.mjs`'s wiring — Phase 8.
- Scheduled-jobs wiring (`index.mjs`'s `schedules` list equivalent) — not yet assigned a phase;
  flagged for the plan-writing step or a later phase to pick up.
