# Order Readiness (scan, categorise, sort, suggest)

## Purpose
This is the module that fixes *natatabunan* in the warehouse. Every morning (and on every change) it scans every package, puts it in a category, sorts oldest Sales Order first, draws the **cut line** for today's capacity, and suggests what to release. The supervisor confirms a short list instead of reading hundreds of rows.

## Screens
| Screen | Who | What |
|---|---|---|
| **Today's release** (default view) | Fulfillment supervisor | Every package flagged **Suggested Release**, across all categories, in rank order, with box counts adding up to today's capacity. Buttons: Release selected, Release all suggested, Recalculate. |
| Category tabs | Supervisor | **Broken · Already late · About to be late · On time**, each sorted oldest Order Date first; **Blocked** as a separate list with reason and owner |
| Capacity bar | Supervisor | Today: people, boxes/hour, hours → capacity in boxes; boxes suggested; boxes released so far. Edit today's people count. |
| Crew sizing | Supervisor | "To clear Late + About to be late in N days you need X people" (05 / 02) |

Each row shows: rank (#3), category, plain-words reason on hover, SO, customer, Order Date, Order Age, Target, Forecast, boxes, delivery type, next step.

## Rules
| # | Rule |
|---|---|
| OR-R1 | **Gates before ranking.** A package is Blocked (not in the work list) when: payment not cleared (unpaid, or partial when partial is not enough) unless the customer has credit terms or an approved override; items not physically available; delivery address or contact missing; open exception. The block shows its owner (e.g. payment → sales agent). |
| OR-R2 | Ranking follows the sorting engine exactly (05 / 01). No local sort. |
| OR-R3 | **Cut line:** walk the ranked work list, adding box counts until today's capacity is used; those packages are Suggested Release. |
| OR-R4 | **Release** is a human action (supervisor). Releasing moves the package to Pick and stamps `package.released`. The supervisor may release beyond the line; the screen shows "over capacity by N boxes". |
| OR-R5 | **Payment override** follows the existing pattern: a named approver and reason, recorded, never a switch that turns the gate off. |
| OR-R6 | Notifications per state: On time → nobody. About to be late → supervisor's morning list. Already late → supervisor **and** the sales agent, same day. Blocked → the owner, by name. |
| OR-R7 | **Aging guard** (05 / 01 §5) applies to every unreleased package. |
| OR-R8 | **Credit check at release [DEFAULT: credit terms only today]**; credit limit check can be added later as a setting. |

## Timestamps
`package.entered_queue` (became Ready), `package.blocked` / `package.unblocked`, `package.released`.

## Access
Fulfillment supervisor, supervisor, admin: release. Fulfillment staff: read. Sales agents: see their orders' category and next step from the Sales Order view, not this screen.

## Acceptance checklist
- [ ] With 4 people × 8 boxes/hour × 7 hours = 224 boxes, the suggested list stops at the package that would exceed 224.
- [ ] A late package that is also above the line appears in Today's release and in the Already late tab.
- [ ] An unpaid package without credit terms appears only in Blocked, with the sales agent as owner.
- [ ] Releasing over capacity shows the warning but is allowed.
- [ ] A package waiting 14 days unreleased creates an exception and notifies the supervisor.
