---
title: Receiving
tags: [page, procurement]
module: Procurement
route: "#/procurement/receiving"
source: src/pages/screens.jsx (ReceivingScreen)
---

# Receiving

> Count what came off the truck. Damaged or missing goods raise an exception on their own.

**Module:** [[Procurement]] · **Route:** `#/procurement/receiving` · **Source:** `src/pages/screens.jsx` (`ReceivingScreen`)

**Shows:** [[receivings]]

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[receive]] | Counts goods off the truck: accepted, damaged, missing. Totals may not exceed expected. Damage or shortage raises an exception; a full accept frees the waiting Sales Order items. | [[RCV.ARRIVED]], [[RCV.NUMBERS]], [[RCV.TOTAL]], [[RCV.EXCEPTION]], [[RCV.STOCK]] |

## In the flow

Work arrives from: [[Shipments]]

Work goes on to: [[Readiness Gate]], [[Exceptions]]
