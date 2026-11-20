# Service Request, Site Checklist and Earliest Date

## Purpose
A **Service Request (SR)** asks for a field visit: delivery, installation, pull-out, service or site visit. It collects what the field team needs to know about the site **before** the day, and gives the sales agent an honest earliest date.

## Fields
`service_requests`, `site_checklists` (01 Database). Key: SR number, SO, package, type, requested by, requested date, reason / sub-reason (for complaints, RMA, pull-out), status, the three dates.

## Screens
| Screen | Who | What |
|---|---|---|
| New SR | Sales agent, dispatcher | SO (or customer for a site visit), type, preferred date, site checklist, notes. Shows **earliest available date** live. |
| SR queue | Dispatcher | Open SRs by delivery category (Broken / Late / About to be late / On time / Blocked), oldest Order Date first |
| SR detail | Dispatcher, sales agent (own) | Checklist, package readiness ("ready / in QC / waiting for items, forecast 20 Nov"), timeline, linked jobs |

## Earliest available date (for the sales agent)
`find_earliest_slot(job_type, est_minutes, from_date, city)` walks dates from `from_date` up to `max_days_scheduling_window` **[DEFAULT: 30 days]** and returns the first date where a team has free hours and a free job slot, **with the reason**:

> "Earliest is **19 Nov**: 15–18 Nov are full (3 of 3 jobs), 16 Nov Team 2 is on leave."

- Duration by type, **door to door including travel** **[DEFAULT]**: drop-off 1.5 h, installation 2.5 h, full-day installation 8 h. These match 3–4 sites in a team-day.
- `day_buffer_pct` **[DEFAULT: 10%]** of each team-day is held back for traffic and overruns, so a full day is never planned to the last minute.
- Also respects package readiness: the earliest date is never before the package's forecast ready date + 1 day.
- **Soft hold:** a quoted date holds the capacity for `soft_hold_minutes` **[DEFAULT: 20]** so two agents cannot promise the same last slot. The hold expires on its own if the SR is not submitted.

## Site Requirements Checklist (12 lines)
| # | Line | Answer |
|---|---|---|
| 1 | **Electrical wiring ready at the mounting points ("abang")** | Yes / No / N/A + notes, photo if available |
| 2 | Support to mount fixtures on | Yes / No / N/A + what it is |
| 3 | Work permit / gate pass | Required Yes/No; status Obtained / Pending; valid until; attachment |
| 4 | Noisy-work hours | Restricted Yes/No; allowed from–to |
| 5 | Mirror involved at site | Yes / No / N/A + notes |
| 6 | Ceiling height | metres |
| 7 | Ceiling / wall material where mounted | Concrete, gypsum, wood, metal, glass, other |
| 8 | Someone on site to assist | Yes/No + name and number |
| 9 | Plan / blueprint showing positions | Yes/No + attachment |
| 10 | Parking | Yes/No + where, restrictions, fee |
| 11 | Site working hours | start, end |
| 12 | Boxes to deliver and lift available | box count (from package) + lift Yes/No |

## Rules
| # | Rule |
|---|---|
| SR-R1 | An SR is created automatically when a package **passes QC [DEFAULT]**, so scheduling does not wait for crating and aggregation; or manually by a sales agent / dispatcher (complaints, pull-outs, service visits, site visits). |
| SR-R1b | **Wiring not ready = no installation.** If line 1 is **No** on an installation job, the SR is **Blocked** ("waiting for wiring"; owner: the sales agent, who follows up with the customer). It cannot be scheduled for installation until line 1 changes to Yes. A drop-off of the goods can still be scheduled if the customer wants them early. The day before the job, the confirmation message asks again whether the wiring is ready. |
| SR-R2 | Lines 1–11 must be answered (Yes / No / N/A) before the SR can be **handed off** for scheduling. The button stays visible but disabled, naming the unanswered lines. |
| SR-R3 | Answers are copied **read-only** to the job and the field app. |
| SR-R4 | A permit marked Required + Pending shows a warning on the SR, the schedule and the field app; the pre-delivery gate blocks dispatch (G7). |
| SR-R5 | Working hours and noisy hours are passed to scheduling: a site whose working window is shorter than the job duration cannot be given that job type on one day (warning) **[DEFAULT: warning only]**. |
| SR-R6 | Lines 8, 12 (helpers, boxes, lift) decide whether a job needs extra installers; the dispatcher sees a "2-person / 4-person" hint. |
| SR-R7 | A complaint SR (broken, wrong item) is category **Broken** and links to its exception / RR. |
| SR-R8 | **Agent-ready:** agent A3 (site confirmation) will fill and confirm the checklist with the customer by SMS/Viber. |

## Timestamps
`sr.raised`, `sr.checklist_completed`, `sr.handed_off`, `sr.confirmed`.

## Access
Sales agent: create, view own, see earliest date. Dispatcher: all. Field team: answers only, through their job.

## Acceptance checklist
- [ ] The earliest-date answer includes the reason, not just a date.
- [ ] Two agents quoting at the same time cannot both get the last slot of a day.
- [ ] Hand-off is refused until lines 1–11 are answered, naming the missing lines.
- [ ] A pending permit blocks dispatch.
