# Appointment, Dispatch and Load Sheet

## Purpose
Confirm the appointment with the customer, load the truck in the right order, pass the pre-delivery gate, and send the team out.

## Job statuses
`requested` → `scheduled` → `confirmed` → `dispatched` → `on_site` → `done` (outcome: **complete / partial / failed**) → `archived`

A job left without the customer's signature is `awaiting_customer_confirmation` until the remote signature is done (Delivery 04, FA-R6).

## 1. Appointment and confirmation
| # | Rule |
|---|---|
| AP-R1 | A scheduled job gets a **time window** (e.g. 9am–12nn), not a point time. Windows by stop position and duration **[DEFAULT: morning / afternoon windows]**. |
| AP-R2 | Confirmation is requested **the day before** (SMS with window and tracking link, Delivery 06). The customer's reply, or a dispatcher call, sets `confirmed`. |
| AP-R3 | A confirmed appointment sets Forecast Delivery = the appointment date. |
| AP-R4 | Unconfirmed by `confirm_cutoff` **[DEFAULT: 5pm the day before]** → dispatcher alert: call, or reschedule. |
| AP-R5 | Reschedule: new date and reason; the job keeps its original Order Date and category; each reschedule is counted. |
| AP-R6 | **Agent-ready:** agent A3 will handle confirmation messages and replies. |

## 2. Load sheet
| # | Rule |
|---|---|
| LS-R1 | For each team-day, the system prints a **load sheet in reverse drop order**: the last stop's boxes are loaded first, so the first stop's boxes come off first. |
| LS-R2 | The load sheet lists per stop: job, customer first name and city (no prices, no payment), packages, **box count**, fragile / two-person flags, crate marks. |
| LS-R3 | Loading is confirmed per package by box count (pre-delivery gate G6). |

## 3. Dispatch
| # | Rule |
|---|---|
| DS-R1 | **Dispatch** runs the pre-delivery gate (Fulfillment 04) for every package on the team-day. All failures shown at once. |
| DS-R2 | Driver and dispatcher sign on the dispatch screen (G8). |
| DS-R3 | Passing the gate sets each job to `dispatched`, locks the day plan, stamps `job.dispatched` and pushes the day's jobs to the team's field app. |
| DS-R4 | A job that fails the gate is removed from the day plan with its reason and goes back to the scheduling queue at its original rank. |
| DS-R5 | Order of the morning: load from the load sheet → dispatch gate and signatures → the team's field app receives the day → vehicle check-in → leave. |

## Screens
| Screen | Who | What |
|---|---|---|
| Tomorrow | Dispatcher | Each team-day: jobs, confirmation status, gate preview (what would fail today), load sheet button |
| Dispatch | Dispatcher | Gate results per package, signatures, Dispatch button |

## Timestamps
`job.confirmed`, `job.dispatched`, `job.rescheduled`.

## Acceptance checklist
- [ ] The load sheet for stops 1–2–3 lists stop 3's packages first.
- [ ] No price or payment data appears on the load sheet.
- [ ] A job failing the gate goes back to the queue at its original rank.
- [ ] An unconfirmed appointment at 5pm the day before alerts the dispatcher.
