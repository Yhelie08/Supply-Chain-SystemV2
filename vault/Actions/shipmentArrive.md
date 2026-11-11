---
title: shipmentArrive
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:620"
---

# shipmentArrive

Marks an In Transit shipment Arrived, which opens its Receiving for counting.

**Source:** `src/domain/actions.js:620`

## Offered on
- [[Shipments]] (Procurement)

## Rules
- [[SHP.TRANSIT]]: A shipment must be In Transit before it can be marked arrived.
- [[SHP.FLAGS]]: Delayed, Arriving in 1 Week, Needs Attention and Ship Mode Unmatched are worked out from the dates and modes each time, never stored. Delayed: not arrived and the ETA has passed. Needs Attention: delayed, still pending after its ETD, or due after the date the client wants it. Ship Mode Unmatched: the supplier shipped by a different mode than the PO.
- [[SHP.ARRIVE]]: Marking a shipment arrived opens its Receiving.
- [[RCV.ONE]]: There is only one Receiving per Shipment.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
