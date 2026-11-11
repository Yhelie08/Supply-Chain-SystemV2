---
title: Pick
tags: [page, fulfillment, built]
module: Fulfillment
route: "#/fulfillment/pick"
status: partial
source: src/pages/screens.jsx (PickScreen)
---

# Pick

> Pick report: mark an item picked and it goes straight to QC.

**Section:** [[Fulfillment]] · **Route:** `#/fulfillment/pick` · **Source:** `src/pages/screens.jsx` (`PickScreen`) · **Status:** built, not yet at parity

**Shows:** [[items]]

## What the live page has

- **Stat cards:** Unassigned · To Pick · Picked · Total
- **Buttons:** Mark as Picked

### Still missing from this page

- stat card: Unassigned
- stat card: To Pick

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[pickDone]] | Marks the item picked and sends it straight to Pack & QC. The picker is deliberately not carried forward. | [[PICK.NEXT]] |

## In the flow

Work arrives from: [[Order Readiness]]

Work goes on to: [[Pack & QC]]
