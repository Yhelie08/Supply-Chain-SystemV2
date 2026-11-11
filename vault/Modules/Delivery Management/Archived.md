---
title: Archived
tags: [page, delivery-management, built]
module: Delivery Management
route: "#/delivery/archived"
status: partial
source: src/pages/extras.jsx (Archived)
---

# Archived

> Completed and failed deliveries with their installation outcome.

**Section:** [[Delivery Management]] · **Route:** `#/delivery/archived` · **Source:** `src/pages/extras.jsx` (`Archived`) · **Status:** built, not yet at parity

**Shows:** [[serviceRequests]], [[teams]]

## What the live page has

- **Inner tabs:** Archived · Create Shipment · All · Completed · Failed
- **Stat cards:** Total Archived · Completed · Failed · Installation Complete
- **Buttons:** Create Sales Return

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[salesReturnCreate]] | Archived: opens a sales return for a completed or failed delivery. Once per delivery. | [[RET.NEW]] |

