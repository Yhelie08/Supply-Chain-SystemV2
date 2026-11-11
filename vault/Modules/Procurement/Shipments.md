---
title: Shipments
tags: [page, procurement]
module: Procurement
route: "#/procurement/shipments"
source: src/pages/screens.jsx (ShipmentScreen)
---

# Shipments

> Follow each shipment from the supplier to the warehouse door.

**Module:** [[Procurement]] · **Route:** `#/procurement/shipments` · **Source:** `src/pages/screens.jsx` (`ShipmentScreen`)

**Shows:** [[shipments]]

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[shipmentTransit]] | Marks a Pending shipment In Transit and stamps the date shipped. | — |
| [[shipmentArrive]] | Marks an In Transit shipment Arrived, which opens its Receiving for counting. | [[SHP.TRANSIT]], [[SHP.ARRIVE]], [[RCV.ONE]] |

## In the flow

Work arrives from: [[Purchase Order]], [[Replacement]]

Work goes on to: [[Receiving]]
