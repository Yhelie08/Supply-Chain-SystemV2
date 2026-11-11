---
title: Receiving
tags: [page, procurement, built]
module: Procurement
route: "#/procurement/receiving"
status: partial
source: src/pages/screens.jsx (ReceivingScreen)
---

# Receiving

> Warehouse receiving: inspect shipments, log damage or missing items, send to Books.

**Section:** [[Procurement]] · **Route:** `#/procurement/receiving` · **Source:** `src/pages/screens.jsx` (`ReceivingScreen`) · **Status:** built, not yet at parity

**Shows:** [[receivings]], [[rrs]]

## What the live page has

- **Inner tabs:** All · Pending Inspection · Incomplete Receive · Complete Receive · With Exceptions · Sent to Books · Awaiting Replacement
- **Stat cards:** Pending Inspection · Incomplete Receive · Complete Receive · With Exceptions · Sent to Books
- **Buttons:** + New Receiving · Partial Receive Timeline · Print Stickers

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[receive]] | Counts goods off the truck: accepted, damaged, missing. Totals may not exceed expected. Damage or shortage raises an exception; a full accept frees the waiting Sales Order items. | [[RCV.ARRIVED]], [[RCV.NUMBERS]], [[RCV.TOTAL]], [[PO.COMPLETE]], [[RCV.EXCEPTION]], [[RCV.STOCK]] |
| [[receivingSendToBooks]] | Sends a receiving that was counted in full to Books. Once only. | [[RCV.BOOKS]] |
| [[receivingCreate]] | New Receiving, Create From Scratch: a receiving with no PO, for goods that arrived without one. Needs a supplier, an item and a quantity. | [[RCV.SCRATCH]] |

## In the flow

Work arrives from: [[Shipments]]

Work goes on to: [[Order Readiness]], [[Exceptions]]
