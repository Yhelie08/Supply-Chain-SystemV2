---
title: Replacement
tags: [page, procurement]
module: Procurement
route: "#/procurement/replacement"
source: src/pages/screens.jsx (ReplacementScreen)
---

# Replacement

> Approving one creates the replacement shipment. It only completes when the goods are physically received.

**Module:** [[Procurement]] · **Route:** `#/procurement/replacement` · **Source:** `src/pages/screens.jsx` (`ReplacementScreen`)

**Shows:** [[rrs]]

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[rrApprove]] | Approves a replacement with an expected ship date and ETA, once only. Creates the replacement shipment and its receiving. | [[RR.ONCE]], [[RR.DATES]], [[RR.CLONE]] |

## In the flow

Work arrives from: [[Exceptions]]

Work goes on to: [[Shipments]]
