# Failure, Redelivery and the Delivery Exception Queue

## Purpose
When a visit fails or is partial, the customer is still waiting. Record **why** (with a code), keep the failed visit as history, and create the next visit at once, at the top of the queue.

## Failure reason codes [DEFAULT list, Admin-editable]
| Code | Reason | Next step |
|---|---|---|
| `not_home` | Customer / receiver not on site | Call customer, reschedule |
| `refused` | Customer refused (wrong item, finish, changed mind) | Exception + CS call; RR or return |
| `wrong_address` | Address wrong or not found | Sales agent fixes address, reschedule |
| `gate_refused` | Gate / subdivision / building refused entry | Get permit / gate pass, reschedule |
| `unreachable` | Cannot reach customer by phone | Sales agent contacts, reschedule |
| `site_not_ready` | Site not ready (no support, ceiling not done, other trades working) | Reschedule after customer confirms; check site checklist |
| `weather_road` | Flooding, road closure | Reschedule, same priority |
| `damaged_in_transit` | Item damaged on the way | Exception (fault origin transit) + RR |
| `vehicle_problem` | Vehicle breakdown | Reschedule; truck maintenance record |
| `out_of_time` | Team ran out of time | Reschedule next available, top of queue |
| `other` | Other (notes required) | Dispatcher decides |

## Rules
| # | Rule |
|---|---|
| FR-R1 | **Never edit and retry a failed job.** A new job is created with `source_job_id` pointing to the failed one; the failed job stays as it was. This keeps the **first-attempt full-delivery rate** honest. |
| FR-R2 | The redelivery job keeps the original Order Date, Target and category; jobs caused by damage or refusal are category **Broken**. |
| FR-R3 | Partial outcome: the redelivery job carries only the lines still owed. |
| FR-R4 | Silence alert: done (partial / failed) with no redelivery scheduled within 2 days. |
| FR-R5 | **Force-close:** the dispatcher can close a job when the phone died or the team cannot submit, choosing the outcome and reason; it is marked `force_closed` and goes to the supervisor's approval queue for review. Used for emergencies, reported weekly. |

## Delivery Exception Queue (replaces DMS Exception Queue)
One list for the dispatcher of everything that needs a delivery decision: failed and partial jobs without a next job, unconfirmed appointments, unsigned remote deliveries, permits pending close to the date, jobs that failed the pre-delivery gate, installation jobs with no slot before target ("Urgent – no slot"). Sorted by category and Order Date like everything else. Each item has an owner and the aging guard.

## Timestamps
`job.failed`, `job.partial`, `job.redelivery_created`, `job.force_closed`.

## Acceptance checklist
- [ ] Failing a job creates a new linked job; the failed one is unchanged.
- [ ] A refused mirror creates an exception (found at site) and a Broken-category redelivery or RR.
- [ ] First-attempt full-delivery rate counts the failed attempt.
- [ ] A force-closed job appears in the supervisor's review list.
