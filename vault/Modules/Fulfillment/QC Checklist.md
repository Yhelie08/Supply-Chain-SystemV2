---
title: QC Checklist
tags: [page, fulfillment]
module: Fulfillment
route: "#/fulfillment/qc"
source: src/pages/screens.jsx (QCScreen)
---

# QC Checklist

> Approve routes the item on. Reject needs a reason and raises a Fulfillment exception.

**Module:** [[Fulfillment]] · **Route:** `#/fulfillment/qc` · **Source:** `src/pages/screens.jsx` (`QCScreen`)

**Shows:** [[items]]

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[qcApprove]] | Approves at QC. Goes to Crate if the item needs crating, otherwise straight to Order Aggregation. | [[QC.ROUTE]] |
| [[qcReject]] | Rejects at QC with a reason and raises a Fulfillment exception. | [[QC.REJECT]] |
| [[qcRecheck]] | Sends a rejected item (or one whose replacement arrived) back to Pack for a fresh QC. | — |

## In the flow

Work arrives from: [[Pack]]

Work goes on to: [[Crate]], [[Order Aggregation]], [[Exceptions]]
