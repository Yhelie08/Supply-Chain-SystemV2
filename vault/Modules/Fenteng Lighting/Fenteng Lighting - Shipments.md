---
title: Fenteng Lighting - Shipments
tags: [page, fenteng-lighting, built]
module: Fenteng Lighting
route: "#/fenteng/shipments"
status: partial
source: src/pages/supplier/ (SupplierShipments)
---

# Fenteng Lighting - Shipments

> Shipments: mark what you are shipping today, per item.

**Section:** [[Fenteng Lighting]] · **Route:** `#/fenteng/shipments` · **Source:** `src/pages/supplier/` (`SupplierShipments`) · **Status:** built, not yet at parity

**Shows:** [[shipments]]

## What the live page has

- **Inner tabs:** All Shipments · Shipment Groups · All · LCL · FCL · Air Freight
- **Stat cards:** Shipments · Total Items · Pending · Shipped
- **Buttons:** View · Review · Ship

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[supplierShip]] | Supplier portal: the supplier ships a pending shipment with a date shipped (not in the future) and a mode. The shipment goes In Transit. | [[SUP.OWN]], [[SUP.SHIP]], [[SUP.PO_HELD]], [[SUP.VISIBLE]] |

