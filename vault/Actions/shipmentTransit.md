---
title: shipmentTransit
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:612"
---

# shipmentTransit

Marks a Pending shipment In Transit and stamps the date shipped.

**Source:** `src/domain/actions.js:612`

## Offered on
- [[Shipments]] (Procurement)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[SHP.FLAGS]]: Delayed, Arriving in 1 Week, Needs Attention and Ship Mode Unmatched are worked out from the dates and modes each time, never stored. Delayed: not arrived and the ETA has passed. Needs Attention: delayed, still pending after its ETD, or due after the date the client wants it. Ship Mode Unmatched: the supplier shipped by a different mode than the PO.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
