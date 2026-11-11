---
title: Tony Fan - Purchase Order
tags: [page, tony-fan, built]
module: Tony Fan
route: "#/tonfan/po"
status: partial
source: src/pages/supplier/ (SupplierPO)
---

# Tony Fan - Purchase Order

> Purchase orders: review line items and acknowledge to confirm.

**Section:** [[Tony Fan]] · **Route:** `#/tonfan/po` · **Source:** `src/pages/supplier/` (`SupplierPO`) · **Status:** built, not yet at parity

**Shows:** [[pos]], [[prs]]

## What the live page has

- **Inner tabs:** All POs · PO Groups · All · Awaiting Acknowledge · Confirmed
- **Stat cards:** Total POs · Awaiting Acknowledge · Confirmed · Total Value
- **Buttons:** View · Acknowledge PO

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[supplierAckPO]] | Supplier portal: the supplier acknowledges a sent PO with an ETD and ETA, which confirms it and creates the shipment. Blocked if every line is held or cancelled. | [[SUP.OWN]], [[SUP.PO_HELD]], [[PO.ACK_ONCE]], [[PO.ACK_DATES]], [[SUP.VISIBLE]] |

