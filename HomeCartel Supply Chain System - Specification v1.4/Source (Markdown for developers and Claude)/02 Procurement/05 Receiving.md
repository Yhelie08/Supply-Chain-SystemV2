# Receiving

## Purpose
Turn an arrived shipment into **stock that can be picked**. "Received" means **binned, counted and pickable**, not just arrived at the gate.

## The four receiving events
| # | Event | What fires it | New work for staff? |
|---|---|---|---|
| 1 | **Arrived** | Forwarder arrival notice, or the gate log entered once a day, or derived as "before first count" | Gate log entry only |
| 2 | **Counted and inspected** | Saving accepted / missing / damaged quantities | No |
| 3 | **Binned** | Writing a bin location against the line | No |
| 4 | **Available** | The system creates or completes the package for the SO | No |

Unloading is not recorded (no natural trigger; it is inside the arrived → counted gap).

## Fields
`receivings`, `receiving_lines`: expected, accepted, missing, damaged quantities; bin; counted / binned / available stamps.

## Screens
| Screen | Who | What |
|---|---|---|
| Arrivals | Receiver, receiving lead | Shipments expected this week and arrived but not counted, oldest Order Date first |
| Receive | Receiver | Per line: expected qty, enter accepted / missing / damaged, photos for damage (with the supplier's production and shipment photos beside them), bin location |
| Receiving list | Receiving lead, buyer | All receipts with status and stamps |

## Rules
| # | Rule |
|---|---|
| RCV-R1 | Partial receives are allowed. Each save posts only the **new** quantity (the delta) to Zoho Books as a Purchase Receive. |
| RCV-R2 | **No duplicate receive:** the server rejects a receive that would post a quantity already posted (checked server-side, not only by disabling a button). |
| RCV-R3 | Damaged or missing quantity requires the Exception step: an exception is created with `found_stage = receiving` and fault origin (supplier / transit / unknown). |
| RCV-R4 | Writing a bin makes the quantity available to the SO's package. When all lines of the package are available, the package becomes Ready (Fulfillment 01). |
| RCV-R5 | Stock items (no PO) can be received the same way. |
| RCV-R6 | Silence alerts: arrived → counted within 1 day; counted → binned within 1 day; binned → available within 2 hours. |
| RCV-R7 | Received less than ordered → suggested action "Raise shortage RR" for the buyer. |

## Timestamps
`receiving.arrived`, `receiving.counted`, `receiving.binned`, `receiving.available`; `receiving.exception_raised`.

## Notifications
Receiving lead: arrivals not counted (silence). Buyer: shortages and damage with fault origin = supplier. Fulfillment supervisor: packages became Ready.

## Access
Receivers and fulfillment supervisor: receive screens. Buyer: read. **No costs on any receiving screen.**

## Acceptance checklist
- [ ] Receiving 3 of 5, then 2 more, posts two Purchase Receives to Books (3, then 2), never 5 twice.
- [ ] Binning the last line of a package makes the package Ready within one minute.
- [ ] A shipment arrived 2 days ago with no counts raises an alert.
- [ ] Damage recorded at receiving shows the supplier's production photos beside the damage photos.
