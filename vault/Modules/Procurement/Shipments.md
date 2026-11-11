---
title: Shipments
tags: [page, procurement, built]
module: Procurement
route: "#/procurement/shipments"
status: partial
source: src/pages/screens.jsx (ShipmentScreen)
---

# Shipments

> Execution queue: PO acknowledgment to warehouse arrival.

**Section:** [[Procurement]] · **Route:** `#/procurement/shipments` · **Source:** `src/pages/screens.jsx` (`ShipmentScreen`) · **Status:** built, not yet at parity

**Shows:** [[shipments]], [[receivings]]

## What the live page has

- **Inner tabs:** All · Pending · In Transit · Arriving in 1 Week · Delayed · Delivered · Needs Attention · Ship Mode Unmatched
- **Stat cards:** Total · Pending · In Transit · Arriving in 1 Week · Delayed · Delivered · Needs Attention · Ship Mode Unmatched
- **Buttons:** Shipment Grouping

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[shipmentTransit]] | Marks a Pending shipment In Transit and stamps the date shipped. | [[SHP.FLAGS]] |
| [[shipmentArrive]] | Marks an In Transit shipment Arrived, which opens its Receiving for counting. | [[SHP.TRANSIT]], [[SHP.FLAGS]], [[SHP.ARRIVE]], [[RCV.ONE]] |

## In the flow

Work arrives from: [[Purchase Order]], [[Replacement Request]]

Work goes on to: [[Receiving]]
