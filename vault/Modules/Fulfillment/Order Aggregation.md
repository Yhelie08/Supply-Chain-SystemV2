---
title: Order Aggregation
tags: [page, fulfillment]
module: Fulfillment
route: "#/fulfillment/aggregation"
source: src/pages/screens.jsx (AggregationScreen)
---

# Order Aggregation

> Items that passed QC wait here. Dispatch creates the Service Request in Delivery Management.

**Module:** [[Fulfillment]] · **Route:** `#/fulfillment/aggregation` · **Source:** `src/pages/screens.jsx` (`AggregationScreen`)

**Shows:** [[items]], [[teams]]

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[dispatch]] | Dispatches an item from Order Aggregation. Blocked on payment, once only, and creates the Service Request in Delivery Management. | [[OA.DEDUP]], [[OA.PAYMENT]], [[OA.DMS]] |
| [[setPayment]] | Sets the item's payment to Paid, Unpaid or Credit. | — |

## In the flow

Work arrives from: [[QC Checklist]], [[Crate]]

Work goes on to: [[Initial Scheduling]]
