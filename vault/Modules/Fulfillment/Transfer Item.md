---
title: Transfer Item
tags: [page, fulfillment, built]
module: Fulfillment
route: "#/fulfillment/transfer"
status: partial
source: src/pages/extras.jsx (TransferItem)
---

# Transfer Item

> Warehouse requests and warehouse-to-warehouse transfers.

**Section:** [[Fulfillment]] · **Route:** `#/fulfillment/transfer` · **Source:** `src/pages/extras.jsx` (`TransferItem`) · **Status:** built, not yet at parity

## What the live page has

- **Inner tabs:** Warehouse Request · Transfer Warehouse
- **Stat cards:** Pending · Done
- **Buttons:** + New Request

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[transferAdvance]] | Transfer Item: moves a request to Done, or a transfer through Dispatched to Received. | [[XFER.DONE]] |
| [[transferCreate]] | Transfer Item: creates a warehouse request or a warehouse-to-warehouse transfer. | [[XFER.NEW]] |

