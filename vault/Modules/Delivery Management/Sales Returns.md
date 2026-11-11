---
title: Sales Returns
tags: [page, delivery-management, built]
module: Delivery Management
route: "#/delivery/returns"
status: partial
source: src/pages/extras.jsx (SalesReturns)
---

# Sales Returns

> Returns and reverse logistics, sent to Books.

**Section:** [[Delivery Management]] · **Route:** `#/delivery/returns` · **Source:** `src/pages/extras.jsx` (`SalesReturns`) · **Status:** built, not yet at parity

## What the live page has

- **Inner tabs:** All · Created · Pending
- **Stat cards:** Total Returns · Created · Pending · Warehouses Involved
- **Buttons:** Send to Books

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[salesReturnSendToBooks]] | Sales Returns: sends a return to Books with an RMA number, reason, quantity and signature. | [[RET.BOOKS]] |

