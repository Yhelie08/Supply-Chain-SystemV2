---
title: Purchase Order
tags: [page, procurement]
module: Procurement
route: "#/procurement/po"
source: src/pages/screens.jsx (POScreen)
---

# Purchase Order

> Send each PO to its supplier. When the supplier acknowledges, the shipment and receiving are created.

**Module:** [[Procurement]] · **Route:** `#/procurement/po` · **Source:** `src/pages/screens.jsx` (`POScreen`)

**Shows:** [[pos]]

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[poSend]] | Sends a Draft PO to its supplier. An unrecognised supplier is refused. A Local PO is issued without any accounting push. | [[PO.SUPPLIER]], [[PO.LOCAL]] |
| [[poAcknowledge]] | Records the supplier's ETD and ETA, once only. Creates the Shipment and its Receiving if they are missing. | [[PO.ACK_ONCE]], [[PO.ACK_DATES]], [[PO.ACK_AUTO]], [[RCV.ONE]] |

## In the flow

Work arrives from: [[Purchase Request]]

Work goes on to: [[Shipments]]
