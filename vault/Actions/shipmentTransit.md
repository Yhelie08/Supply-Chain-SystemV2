---
title: shipmentTransit
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:547"
---

# shipmentTransit

Marks a Pending shipment In Transit and stamps the date shipped.

**Source:** `src/domain/actions.js:547`

## Offered on
- [[Shipments]] (Procurement)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
