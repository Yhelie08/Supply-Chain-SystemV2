# Exceptions and Replacement Requests (RR)

## Purpose
When an item is damaged, wrong or missing, record it once (the shared exception log, 05 / 05), decide the fix, and if a replacement is needed, create a **Replacement Request** that gets the customer a working item as fast as possible. Replacements are the **Broken** category: first in every queue.

## Fields
`exceptions` (shared) and `replacement_requests`: RR number, exception, original SO, supplier (original and chosen), reason for supplier change, Target Delivery, status.

## Screens
| Screen | Who | What |
|---|---|---|
| Exception Control | Buyer, fulfillment supervisor, supervisor | All open exceptions by age, filter by stage found, fault origin, owner; detail with photos (incl. supplier photos), history, resolution buttons |
| Create RR (from an exception) | Buyer | Supplier choice dialog, then create |
| RR list | Buyer | Open RRs, oldest original Order Date first, with target and forecast |

## Rules
| # | Rule |
|---|---|
| RR-R1 | **Supplier choice before Create RR:** a dialog offers *Same supplier* (pre-selected), *Fenteng*, *Tony Fan*, *HC System (local)*, *Other*. A reason is required only when the supplier is changed; the original supplier is recorded. Nothing is written until **Create RR** is pressed. The evidence and repair checks run first, unchanged. |
| RR-R2 | Choosing a supplier **without a portal** (e.g. HC System) must still produce a working replacement shipment. **Do not release RR-R1 until this works** (the old clone-shipment step refused to run). |
| RR-R3 | The RR gets a **Target Delivery** at creation: original target if still in the future, else today + `rr_default_days` **[DEFAULT: 21]**. It carries the **original SO's Order Date**. |
| RR-R4 | RR lines are category **Broken** in procurement (shown at the top of Act now), fulfillment and delivery. |
| RR-R5 | The RR goes to the supplier portal like a PO (acknowledge, production, shipout) and follows Ship & Track and the ladder. |
| RR-R6 | Monthly report: replacements by cause (damage, wrong spec, missing part), by fault origin and by supplier. Rework rate = RR + rework jobs ÷ packages. |
| RR-R7 | Stock replacement: if the item is in stock, the RR skips purchasing and goes straight to a package. |

## Timestamps
`exception.raised`, `exception.resolved`, `rr.created`, `rr.acknowledged`, `rr.replacement_received`.

## Notifications
Buyer: new exception with fault origin = supplier; RR not acknowledged in 1 day. Sales agent: RR created for their customer, with target date.

## Access
Buyer, supervisor, admin: full. Fulfillment supervisor: exceptions from fulfillment stages, can resolve rework. Supplier: RRs addressed to them in the portal.

## Acceptance checklist
- [ ] Create RR opens the supplier dialog; changing the supplier requires a reason.
- [ ] An RR for HC System creates a replacement that can progress to receiving.
- [ ] A new RR appears at the top of the Broken category everywhere, with a target date.
- [ ] The monthly report shows damage split by fault origin.
