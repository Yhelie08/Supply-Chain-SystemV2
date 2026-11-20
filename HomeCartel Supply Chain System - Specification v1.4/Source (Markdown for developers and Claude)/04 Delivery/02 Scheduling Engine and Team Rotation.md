# Scheduling Engine and Team Rotation

## Purpose
Turn handed-off Service Requests into a planned delivery calendar. The system **sorts and suggests** a date, team and stop order; the dispatcher **approves**. Installers are the real limit; drop-offs can go to a third party.

## 1. Teams and daily rotation

A **team-day** = one driver + one vehicle + installer(s) on one date. Three field vehicles = **at most three own teams per day**.

| # | Rule |
|---|---|
| TM-R1 | A nightly system task creates `team_availability` rows **ahead of time** (`rotation_days_ahead` **[DEFAULT: 14]**) with a deterministic rotating pairing of drivers and installers, reading names from settings. Offsets (mod 7, mod 11) keep pairs from repeating in lock-step. |
| TM-R2 | No person is driver and installer on the same day. One driver and one vehicle per team per day. If nobody is free, the slot is left blank, never doubled. |
| TM-R3 | The dispatcher can edit any team-day (leave, sickness, vehicle down from Truck Maintenance). Edits are logged. |
| TM-R4 | Drivers and installers are **edited any time** in the Control Panel (People and teams), because staff change often. Rotation reads only active people. Before go-live, the dispatcher enters the current names there. |
| TM-R5 | Each team-day has `max_hours` **[DEFAULT: 8]**, `day_buffer_pct` **[DEFAULT: 10%]** and `max_jobs` **[DEFAULT: 4]**. With the default durations this is 3 installations, or 4 drop-offs, or a mix: the normal 3–4 sites a day. A full-day installation fills the day alone. All four numbers are edited in the Control Panel. |

## 2. The delivery sorter

Same engine as everywhere (05 / 01): **Broken · Already late · About to be late · On time**, Blocked apart, oldest Order Date first. Delivery-specific gates (Blocked when): site checklist incomplete, permit pending, payment not cleared, no contact, open exception. A job is never scheduled earlier than its package's forecast ready date + 1 day.

## 3. Suggesting a schedule

For each ranked job, in order:

1. **Drop-off or installation?** `job_type` from the SO delivery type.
2. **Find the slot** with `find_earliest_slot` (Delivery 01): first date ≥ ready date with team hours and job slots free.
3. **City tie-break:** among teams with room that day, prefer the team already going to the same city / zone.
4. **Third party for drop-offs:** if a drop-off's own-team slot is later than its target (or later than `dropoff_max_wait_days` **[DEFAULT: 2]**), suggest **"Book third party"** (Lalamove or similar). **Installation jobs are never sent to a third party.**
5. **Cannot meet the target:** installation with no slot before target → approval item to the supervisor: add a team-day (overtime, extra installer) or tell the customer (proposed new date).

The result is shown as **suggestions** on the scheduling board. The dispatcher accepts them one by one or all at once, or drags a job to another team-day.

## 4. Day plans and stop order

| # | Rule |
|---|---|
| DP-R1 | Each team-day has a **day plan**: the ordered list of its jobs (`stop_job_ids`). A job's stop number is its position in that list. |
| DP-R2 | Suggested stop order **[DEFAULT]**: by window start, then nearest-next from the warehouse by city/zone. The dispatcher can reorder. |
| DP-R3 | **Safe editing:** every day plan has a `version`. A save sends the version it started from; if someone else saved first, the save is rejected with "This day changed, please refresh". Whole-list saves only (never half a list). Every change is logged (who, what moved, from where). |
| DP-R4 | The driver may reorder stops on the day (traffic, customer request) but cannot add or remove jobs; removing is a dispatcher action. |
| DP-R5 | Once a job is on site (arrived), it cannot be moved to another day plan; it must first be closed (done, failed, or force-closed). |
| DP-R6 | Day plans lock at dispatch; changes after lock need the dispatcher. |

## 5. Third-party bookings
| # | Rule |
|---|---|
| TP-R1 | A third-party job records provider, booking reference, delivery fee (visible to dispatcher, supervisor and admin), pickup time, and the driver's name and plate if given. |
| TP-R2 | The pre-delivery gate still applies. Proof of delivery is the provider's photo plus the customer's confirmation (link) **[DEFAULT]**. |
| TP-R3 | Delivery analytics report own-team vs third-party separately. |
| TP-R4 | Third-party jobs have no field app. The **dispatcher** records the result (per-line quantities, the provider's photo) when the provider reports delivery. Left and done times come from the provider's status or the dispatcher's entry, stored with the time we were told. The customer's confirmation link completes the proof. |

## Screens
| Screen | Who | What |
|---|---|---|
| Scheduling board | Dispatcher | Days down, team-days across; each team-day shows jobs, hours used / max, jobs used / max; unscheduled queue on the side in rank order with suggestions |
| Team rotation | Dispatcher | The next 14 days of teams, editable |
| Capacity view | Supervisor | Delivery backlog calculator: installation vs drop-off backlog days, teams needed |

## Timestamps
`job.scheduled`, `job.rescheduled` (each time, with reason), `day_plan.changed`.

## Acceptance checklist
- [ ] Rotation creates 14 days of team-days with no person double-booked.
- [ ] A drop-off whose own-team slot is after its target gets a "Book third party" suggestion; an installation never does.
- [ ] Two dispatchers editing the same team-day: the second save is rejected, nothing is lost.
- [ ] A broken/complaint job is suggested before older on-time jobs.
- [ ] Every suggestion shows its reason.
