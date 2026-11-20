# Purchase Order and the Feasibility Gate

## Purpose
Group Ready-for-PO PRs into a PO for one supplier, check **before committing** whether the goods can arrive in time for the customers' promises, and send it to the supplier.

## Fields
`purchase_orders`, `po_lines`, `po_costing` (restricted). Key: PO number, supplier, **PO Date** (the date the PO was placed; never called "Order Date"), mode, acknowledged at, status, born-late flag, shortfall days, deposit paid, Books PO ID.

## Screens
| Screen | Who | What |
|---|---|---|
| PO grouping workspace | Buyer | Ready-for-PO PRs grouped by supplier, oldest SO first, with feasibility per line; select lines → Create PO |
| Feasibility panel (inside Create PO) | Buyer | Per line: planned arrival vs date needed, shortfall, options |
| PO list | Buyer | All POs by category (Act now / Tell customer / Watch / On track), with PO Date, earliest Order Date, target, forecast, status |
| PO detail | Buyer | Lines with planned and actual dates, ladder history, supplier messages, documents, timeline |

## The feasibility gate
At **Create PO**, for every line:

```
planned_arrival = PO_date + 1 + production + consolidation + transit(mode) + receiving
if planned_arrival + fulfillment + delivery > target_delivery:
    born_late = true
    shortfall = (planned_arrival + fulfillment + delivery) − target
    option A: upgrade to Air      → saves 16 days (shows new date; extra freight cost to buyer only)
    option B: propose a new target → <earliest feasible date>  (goes to the sales agent for approval)
    option C: proceed as is        → order shows in "Tell the customer"
```

| # | Rule |
|---|---|
| PO-R1 | **Warn and suggest, do not block.** The buyer may proceed, but must pick an option for every born-late line. The choice and shortfall are recorded. |
| PO-R2 | Option B creates a `forecast_promise_change` item in the approval queue for the sales agent; the target changes only if they accept. |
| PO-R3 | Born-late rate (lines born late ÷ lines raised) is shown on the Procurement Dashboard, weekly. |
| PO-R4 | One PO = one supplier = one mode. Lines with different modes need separate POs. |
| PO-R5 | Sending the PO puts it in the supplier portal and the digest. Acknowledgement in the portal stamps `po.acknowledged`. **Production planned start is always PO Date + 1** (PO Date = the day the PO is sent). A late acknowledgement does not move that clock; it raises its own alert. |
| PO-R6 | The PO is created in Zoho Books (Purchase Order) when sent, and its Books ID stored **[DEFAULT: as today]**. |
| PO-R7 | `deposit_paid` and `deposit_amount` (restricted) are recorded; the supplier ladder reads them. |
| PO-R8 | The PO closes when every line is fully received or cancelled. |

## Timestamps
`po.created`, `po.sent`, `po.acknowledged`, `po.closed`, `po.cancelled`.

## Notifications
Supplier: new PO (portal + digest). Buyer: PO not acknowledged within 1 day. Sales agent: their line was born late and option B was proposed.

## Access
Buyer, supervisor, admin: full. Shipment tracker: no access to PO screens (sees shipments only). Supplier: own POs in the portal, no customer names, no customer prices.

## Acceptance checklist
- [ ] Creating a PO for a line that cannot arrive in time shows the shortfall and three options before saving.
- [ ] Choosing Air recalculates the planned dates with 14-day transit.
- [ ] Choosing "propose new target" sends an approval to the sales agent and does not change the target by itself.
- [ ] No field anywhere on the PO is called "Order Date" except the customer's Order Date.
- [ ] Born-late rate appears on the dashboard.
