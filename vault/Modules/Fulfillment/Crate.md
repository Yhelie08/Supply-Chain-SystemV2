---
title: Crate
tags: [page, fulfillment]
module: Fulfillment
route: "#/fulfillment/crate"
source: src/pages/screens.jsx (CrateScreen)
---

# Crate

> Nothing moves on until Crating Status is Done.

**Module:** [[Fulfillment]] · **Route:** `#/fulfillment/crate` · **Source:** `src/pages/screens.jsx` (`CrateScreen`)

**Shows:** [[items]]

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[crateSet]] | Updates Crating Status: Pending, In Progress or Done. | — |
| [[crateComplete]] | Moves a crated item on to Order Aggregation. Refused until Crating Status is Done. | [[CRATE.DONE]] |

## In the flow

Work arrives from: [[QC Checklist]]

Work goes on to: [[Order Aggregation]]
