---
title: To Ship
tags: [page, fulfillment, built]
module: Fulfillment
route: "#/fulfillment/to-ship"
status: partial
source: src/pages/screens.jsx (AggregationScreen)
---

# To Ship

> Order aggregation: group orders by dispatch status, then dispatch to Delivery.

**Section:** [[Fulfillment]] · **Route:** `#/fulfillment/to-ship` · **Source:** `src/pages/screens.jsx` (`AggregationScreen`) · **Status:** built, not yet at parity

**Shows:** [[items]], [[teams]]

## What the live page has

- **Inner tabs:** Board · List · All · Pending · Partial · Done
- **Stat cards:** Pending · Partial · Done
- **Buttons:** Dispatch · Archive

### Still missing from this page

- tab: Board
- tab: List
- tab: All
- tab: Pending
- tab: Partial
- tab: Done
- stat card: Pending
- stat card: Partial
- stat card: Done
- button: Archive

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[dispatch]] | Dispatches an item from Order Aggregation. Blocked on payment, once only, and creates the Service Request in Delivery Management. | [[OA.DEDUP]], [[OA.PAYMENT]], [[OA.DMS]] |
| [[setPayment]] | Sets the item's payment to Paid, Unpaid or Credit. | — |

## In the flow

Work arrives from: [[Pack & QC]], [[Crate]]

Work goes on to: [[Initial Scheduling]]
