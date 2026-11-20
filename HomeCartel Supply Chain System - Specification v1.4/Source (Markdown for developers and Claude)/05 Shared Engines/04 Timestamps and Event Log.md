# Timestamps and the Event Log

## Purpose

Timestamps show where time is lost and prove whether the system works. People are unreliable at recording times, so **the system records them as a side effect of work people already do.**

## The rules

| # | Rule |
|---|---|
| T-1 | One stamp **each time a record enters a stage**. The time in a stage = the gap between two consecutive stamps. |
| T-2 | Stamps are set by the **server**. No user can type or edit one: not in a form, a screen, an import or the API. |
| T-3 | Every event stores **two times**: `occurred_at` (when it happened) and `reported_at` (when the system was told). The gap is information: a supplier's reporting lag becomes their reliability score. |
| T-4 | **Never build a button whose only job is recording a time.** If an event cannot be captured as a side effect of real work, derive it from the next event, or accept that it is not known. |
| T-5 | When only the order of events is known, store a **bound**, not a made-up time: `occurred_bound = 'before'` with the time of the next known event ("unloaded: before Tue 09:00"). |
| T-6 | An event stamp is set the **first** time a record enters that stage and never overwritten. If a record goes back (QC rejected → rework → QC), the second visit is a new row with `visit_no = 2`. |
| T-7 | **Silence is an alert.** Every expected next event has a window (`expected_windows`). If it passes with no event, the system raises an alert the same day. |
| T-8 | Standard stamps on every record: Created At / By, Last Modified At / By (person or named automation). |
| T-9 | Old records imported from Creator show a dash for stamps that were never captured. The system never invents a date. |
| T-10 | All stamps appear in exports and can be used to sort and filter every list. Lists show "In this stage since". |

## What fires each stamp

| Module | Event | Fired by (the work people already do) |
|---|---|---|
| Inquiry | sent, first quote received, supplier selected | Send button; supplier saves a quote; buyer selects |
| Sales Order | synced, payment cleared, voided | Books sync |
| PR | ready_for_po, held, resumed, converted, cancelled | Pricing result; hold/resume actions; PO creation |
| PO | sent, acknowledged, closed | Send; supplier acknowledges in the portal; last line received |
| Shipment | production_started, production_finished, shipped_out, arrived_port, customs_cleared, arrived_warehouse | Supplier portal updates (declared, with reported time); booking request implies production finished; forwarder notice or gate log for arrival |
| Receiving | counted, binned, available | Saving counted quantities; writing a bin location; the package-readiness script |
| Exception / RR | raised, resolved, rr_created, rr_acknowledged, replacement_received | Those actions |
| Package | created, box_counted, released, picked, qc_passed, qc_rejected, rework_done, crated, aggregated, dispatched | Those actions; picker assignment; QC save; dispatch gate pass |
| Service Request | raised, checklist_completed, handed_off | Those saves |
| Job | scheduled, confirmed, dispatched, left_warehouse, arrived, done, archived | Scheduling save; customer confirmation; dispatch gate; **vehicle check-in** (left warehouse); **the first action at the site: first photo, or opening the item results or failed-visit screen** (arrived); **close-out submit** (done) |
| Sales Return | requested, picked_up, received_back, credit_note_issued | Those actions; Books sync for credit note |
| Vehicle | checked, serviced | Daily check-in; maintenance record |
| Transfer | sent, received | Send; receiver signature |

**Receiving arrival** is the only hard one. Sources, best first: forwarder arrival notice (email read by the shipment inbox agent later), gate log entered once a day, or derived as "before first count".

## Expected windows (silence alerts)

| After | Expected | Within | Silence means | Who is told |
|---|---|---|---|---|
| PO sent | acknowledged | 1 day **[DEFAULT]** | Supplier has not seen or accepted it | Buyer |
| PO acknowledged | production_started | PO + 1 day | Supplier has not started (ladder rung 1 next day) | Buyer |
| production planned end | production_finished | 0 days | Supplier late and silent | Buyer |
| shipped_out | arrived_port | transit days + 3 | Overdue arrival: ask forwarder | Shipment tracker |
| arrived_warehouse | counted | 1 day | Receiving backed up | Receiving lead |
| counted | binned | 1 day | Stock exists but cannot be picked | Receiving lead |
| binned | available | 2 hours | The readiness script or sync is broken | Admin |
| released | picked | 1 day | Pick stalled | Fulfillment supervisor |
| qc_rejected | rework_done | 3 days **[DEFAULT]** | Rework stuck | Fulfillment supervisor |
| dispatched | done | same day 22:00 | Job not closed: phone dead or app not synced | Dispatcher |
| done (partial/failed) | redelivery scheduled | 2 days | Customer waiting with no plan | Dispatcher |

All windows are rows in `expected_windows`, editable by Admin.

## Acceptance checklist

- [ ] Open any record: Created / Modified At and By are shown and cannot be edited.
- [ ] Move a record through its stages: each stamp appears once, in order, and does not change on re-save.
- [ ] A QC rejection followed by a second QC shows two visits, both kept.
- [ ] A supplier entering on 10 Oct that production finished on 1 Oct stores both times.
- [ ] A shipment arrived 2 days ago with nothing counted raises a "receiving backed up" alert.
- [ ] No screen in the system has a button whose only effect is setting a time.
