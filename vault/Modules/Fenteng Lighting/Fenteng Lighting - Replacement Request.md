---
title: Fenteng Lighting - Replacement Request
tags: [page, fenteng-lighting, built]
module: Fenteng Lighting
route: "#/fenteng/replacement"
status: partial
source: src/pages/supplier/ (SupplierRR)
---

# Fenteng Lighting - Replacement Request

> Replacement requests: review and approve replacements for damaged or missing items.

**Section:** [[Fenteng Lighting]] · **Route:** `#/fenteng/replacement` · **Source:** `src/pages/supplier/` (`SupplierRR`) · **Status:** built, not yet at parity

**Shows:** [[rrs]], [[exceptions]]

## What the live page has

- **Inner tabs:** All RRs · RR Groups · All · Awaiting Approval · Acknowledged · In Production · Shipped
- **Stat cards:** Total RRs · Awaiting Approval · In Progress · Received
- **Buttons:** View · Review · Approve RR

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[supplierApproveRR]] | Supplier portal: the supplier approves a replacement request with a mode, expected ship date and ETA. It becomes Acknowledged and the replacement shipment is created. | [[SUP.OWN]], [[RR.DATES]], [[RR.ONCE]] |
| [[supplierRRProgress]] | Supplier portal: the supplier moves an approved replacement forward to In Production, then Shipped, and may update the dates. Shipped puts the replacement shipment In Transit. It never goes backwards. | [[SUP.OWN]], [[RR.PROGRESS]], [[RR.DATES]] |

