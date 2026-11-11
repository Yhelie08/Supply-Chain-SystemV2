---
title: Purchase Order
tags: [page, procurement, built]
module: Procurement
route: "#/procurement/po"
status: partial
source: src/pages/screens.jsx (POScreen)
---

# Purchase Order

> Track all created POs, sourced from the PR Grouping Workspace.

**Section:** [[Procurement]] · **Route:** `#/procurement/po` · **Source:** `src/pages/screens.jsx` (`POScreen`) · **Status:** built, not yet at parity

**Shows:** [[pos]], [[prs]], [[items]], [[shipments]]

## What the live page has

- **Inner tabs:** All · Draft · Sent · Confirmed · Completed · Cancelled
- **Stat cards:** Active POs · Total Value · Awaiting Confirm · Followed Rec. · Overrides
- **Buttons:** Grouping Workspace · Cancel

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[poSend]] | Sends a Draft PO to its supplier. An unrecognised supplier is refused. A Local PO is issued without any accounting push. | [[PO.SUPPLIER]], [[PO.LOCAL]] |
| [[poAcknowledge]] | Records the supplier's ETD and ETA, once only. Creates the Shipment and its Receiving if they are missing. | [[PO.ACK_ONCE]], [[PO.ACK_DATES]], [[PO.ACK_AUTO]], [[RCV.ONE]] |
| [[poCancel]] | Cancels a Draft, Sent or Confirmed PO that has not shipped, with a reason. Its pending shipment and receiving are removed and its PRs return to the Ready queue. | [[PO.CANCEL]] |

## In the flow

Work arrives from: [[Purchase Request]]

Work goes on to: [[Shipments]]
