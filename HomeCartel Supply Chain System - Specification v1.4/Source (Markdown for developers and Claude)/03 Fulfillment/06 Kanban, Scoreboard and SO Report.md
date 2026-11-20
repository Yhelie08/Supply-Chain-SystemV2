# Kanban, Scoreboard and SO Report

## 1. Kanban board

**Purpose:** see the whole warehouse at a glance.

- Columns: Ready → Released → Pick → QC → Rework → Crate → Aggregated → Dispatched (today).
- Cards: package number, customer, boxes, Order Age, Target, **category colour** (Broken purple, Late red, About to be late amber, On time grey, Blocked black outline), urgent marker.
- Cards inside each column are in **rank order** (same engine).
- Read-only **[DEFAULT]**: moving work happens in the stage screens, so stamps stay tied to real work.
- Column header shows count, boxes and the oldest card's age.

## 2. Scoreboard

**Purpose:** show throughput and quality, per day and per person.

| Number | Definition |
|---|---|
| Boxes out per day | Boxes on packages dispatched that day |
| Boxes per person per hour | From pick stamps and shift hours (replaces the hand-counted default after 2 weeks of data) |
| Capacity used | Boxes released ÷ capacity |
| Backlog days | From the manpower calculator |
| Rework rate | 03 / 03 RW-R4 |
| Time in stage | Median hours Ready→Released, Released→Picked, Picked→QC passed, QC→Aggregated, Aggregated→Dispatched |
| Received → Pick gap | Median days from available to released (**one of the two gaps nobody owns**) |
| On-time dispatch | Packages dispatched in time for their target |

Per-person figures are visible to supervisors only **[DEFAULT]**.

## 3. SO Report (Sales Order Fulfillment view)

**Purpose:** one row per Sales Order, showing where every part of it is, for supervisors and sales agents.

- Columns: SO, customer, Order Date, Order Age, Target, Forecast, category, overall stage (furthest-behind part), Next Step, payment status (office roles only).
- Detail: every line with its path (PR / PO / shipment / package / job) and stage.
- Sales agents see their own customers' SOs, **without costs** (and this is their main screen).

## Acceptance checklist
- [ ] Kanban cards in each column follow the same order as the stage list.
- [ ] Scoreboard boxes-per-hour matches a manual count for one day.
- [ ] A sales agent sees only their customers in the SO Report.
