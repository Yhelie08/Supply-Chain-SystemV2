# Ship & Track

## Purpose
Follow every PO line from the factory to our warehouse, compare **planned vs actual** at every stage, catch suppliers late from day 1, and tell the right people early. This is where most late deliveries are created, so it is built first.

## Stages
| # | Stage | Planned date comes from | Actual date comes from |
|---|---|---|---|
| 1 | **Production** | Starts PO + 1; ends + production days | Supplier portal (declared), production photos |
| 2 | **Shipout** | Production end + consolidation days | Supplier booking / ship date, shipment photos |
| 3 | **Transit** | Shipout + transit days by mode (LCL/FCL 30, Air 14) | Forwarder: arrived at port, customs cleared |
| 4 | **Receive** | Arrival + receiving days | Receiving module: arrived, counted, binned, available |

Field names are unambiguous: `production_*`, `shipout_*`, `arrival_*`, `receive_*`. Never "ship" and "shipment" for two different things.

## Fields
`shipments`, `shipment_lines`, attachments in sections `production_photo` and `shipment_photo`. Per shipment: supplier, mode, forwarder, tracking reference, stage, planned and actual dates per stage, last supplier update, last chase, the three customer dates (earliest of the SOs on it), queue columns.

## Screens
| Screen | Who | What |
|---|---|---|
| Ship & Track board | Buyer, shipment tracker | Tabs: **Act now · Tell the customer · Watch · On track · Blocked**, oldest Order Date first. Each row: shipment/PO lines, supplier, mode, stage, planned vs actual, days late, next step |
| Shipment detail | Buyer, tracker | Stage timeline (planned vs actual), lines with their SOs and customer dates, photos, forwarder info, supplier messages, ladder history |
| Shipment grouping | Tracker | Lines grouped by trip; **each row saves on its own** (saving one row never saves another row's unsaved edits) |

The tracker's screens contain **no cost, price, markup, SRP or deposit amount**, not even hidden in the page.

## Rules
| # | Rule |
|---|---|
| ST-R1 | Planned dates are computed by the system from the PO and settings, never typed. Actual dates arrive from the portal, the forwarder or receiving. |
| ST-R2 | Every actual date stores both *when it happened* and *when we were told*. The gap per supplier is reported monthly as **reporting lag**. |
| ST-R3 | **Production photos are required to leave the Production stage** (decided) (the supplier must show what they made). Shipment photos are optional **[DEFAULT]**. Max 10 MB per file; JPG, PNG, HEIC, WebP, PDF. |
| ST-R4 | Photos show on the shipment, on the Receiving record and in any exception raised against it, so damage can be traced to its origin. |
| ST-R5 | A booking request or ship date from the supplier implies production finished; if production end was never reported, it is stored as `before <ship date>`. |
| ST-R6 | Partial shipments: a line can be split across shipments by quantity. |
| ST-R7 | When an actual date lands, the forecast of every SO on the shipment is recomputed immediately and the shipment is re-categorised. |
| ST-R8 | **Suggested actions** (05 / 01): production not started at PO+2 → "Call supplier"; production done, no shipout → "Request booking"; in transit past planned arrival → "Ask forwarder for tracking"; received less than ordered → "Raise shortage RR"; no supplier response for 7 days → "Escalate". |

## The supplier ladder
"Late" means **production has not started by PO + 1 day**. Counting starts the day after.

| Days late | Action | Who |
|---|---|---|
| 1 | Notify buyer; buyer **calls** the supplier; portal + digest message | Buyer (agent A1 drafts later) |
| 2 | Notify; **request a discount** in writing | Buyer |
| 3 | **Prepared decision** in the approval queue: cancel and re-source (Taobao) or hold | Buyer; supervisor too if the supplier is a main supplier (Fenteng, Tony Fan) |

The day-3 decision shows: deposit paid (amount, buyer only), standard vs custom item, Taobao alternative if known (price, lead time), new forecast if re-sourced vs if held.

| # | Rule |
|---|---|
| LD-R1 | The same ladder applies to **production finishing late** (planned end passed, not finished), but day 3 there prepares "hold or upgrade mode", not cancel, because the goods may be nearly done. |
| LD-R2 | **Automatic cancellation is OFF [DEFAULT].** A setting allows auto-cancel later only for items that are standard, low value (under `auto_cancel_max_value`), with no deposit and Taobao stock confirmed. |
| LD-R3 | Each rung fires once per line per episode and is logged in `ladder_events`. |
| LD-R4 | Rungs, days and actions are rows in settings, not code. |

## Timestamps
`shipment.production_started`, `production_finished`, `shipped_out`, `arrived_port`, `customs_cleared`, `arrived_warehouse`, plus `last_supplier_update`, `last_chase`.

## Notifications
Buyer: ladder rungs, Act now items. Tracker: overdue arrival, missing forwarder update. Sales agent: Tell-the-customer items for their orders. Supplier: one daily digest of overdue lines.

## Access
Buyer, supervisor, admin: full. **Shipment tracker: Ship & Track only, edit stages, dates, forwarder info and photos; no costs or prices.** Supplier: own shipments in the portal (production dates, photos, ship date).

## Acceptance checklist
- [ ] A PO acknowledged with no production start by PO+2 fires rung 1 and appears in Act now.
- [ ] Day 3 creates a decision in the approval queue, never an automatic cancel.
- [ ] A shipment cannot leave Production without at least one production photo.
- [ ] A shipment tracker opening any Ship & Track page receives no cost or price data in the response.
- [ ] Updating the arrival date updates the forecast on every SO on the shipment.
- [ ] Saving one row in grouping does not save another row's edits.
