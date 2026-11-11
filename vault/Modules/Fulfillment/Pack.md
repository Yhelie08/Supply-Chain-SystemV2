---
title: Pack
tags: [page, fulfillment]
module: Fulfillment
route: "#/fulfillment/pack"
source: src/pages/screens.jsx (PackScreen)
---

# Pack

> Name the packer before sending to QC. The packer becomes the Quality Checker.

**Module:** [[Fulfillment]] · **Route:** `#/fulfillment/pack` · **Source:** `src/pages/screens.jsx` (`PackScreen`)

**Shows:** [[items]]

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[packSend]] | Names the packer and sends the item to QC. The packer becomes the Quality Checker. | [[PACK.PACKER]] |

## In the flow

Work arrives from: [[Pick]]

Work goes on to: [[QC Checklist]]
