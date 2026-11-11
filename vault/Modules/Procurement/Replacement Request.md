---
title: Replacement Request
tags: [page, procurement, built]
module: Procurement
route: "#/procurement/replacement"
status: partial
source: src/pages/screens.jsx (ReplacementScreen)
---

# Replacement Request

> Damaged, missing, QC or complaint replacement pipeline: exception to closed RR.

**Section:** [[Procurement]] · **Route:** `#/procurement/replacement` · **Source:** `src/pages/screens.jsx` (`ReplacementScreen`) · **Status:** built, not yet at parity

**Shows:** [[rrs]]

## What the live page has

- **Inner tabs:** Procurement · Fulfillment · Local (HC System) · All · Open · Acknowledged · In Production · Shipped · Received · Closed · Cancelled
- **Stat cards:** Open · Acknowledged · In Production · Shipped · Received · Closed · Cancelled
- **Buttons:** Acknowledge

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[rrApprove]] | Approves a replacement with an expected ship date and ETA, once only. Creates the replacement shipment and its receiving. | [[RR.ONCE]], [[RR.DATES]], [[RR.CLONE]] |
| [[rrClose]] | Closes a replacement that has been received. | [[RR.CLOSE]] |
| [[rrCancel]] | Cancels a replacement before it ships, with a reason. The replacement shipment is removed and the exception opens again. | [[RR.CANCEL]] |

## In the flow

Work arrives from: [[Exceptions]]

Work goes on to: [[Shipments]]
