---
title: shipmentArrive
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:555"
---

# shipmentArrive

Marks an In Transit shipment Arrived, which opens its Receiving for counting.

**Source:** `src/domain/actions.js:555`

## Offered on
- [[Shipments]] (Procurement)

## Rules
- [[SHP.TRANSIT]]: A shipment must be In Transit before it can be marked arrived.
- [[SHP.ARRIVE]]: Marking a shipment arrived opens its Receiving.
- [[RCV.ONE]]: There is only one Receiving per Shipment.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
