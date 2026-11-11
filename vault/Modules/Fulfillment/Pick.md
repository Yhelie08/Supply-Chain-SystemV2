---
title: Pick
tags: [page, fulfillment]
module: Fulfillment
route: "#/fulfillment/pick"
source: src/pages/screens.jsx (PickScreen)
---

# Pick

> Pickers collect the item from its bin. The picker is not carried on to Pack.

**Module:** [[Fulfillment]] · **Route:** `#/fulfillment/pick` · **Source:** `src/pages/screens.jsx` (`PickScreen`)

**Shows:** [[items]]

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[pickDone]] | Marks the item picked and opens its Pack record. The picker is deliberately not carried forward. | [[PICK.NEXT]] |

## In the flow

Work arrives from: [[Readiness Gate]]

Work goes on to: [[Pack]]
