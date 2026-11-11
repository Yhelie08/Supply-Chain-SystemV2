---
title: SUP.PO_HELD
tags: [rule, blocks]
rule: SUP.PO_HELD
kind: BLOCKS
module: Supplier Portal
---

# SUP.PO_HELD

> A PO or shipment cannot be acknowledged or shipped while every line on it is on hold or cancelled.

**Kind:** BLOCKS · **Module:** Supplier Portal

## Enforced by
- [[supplierAckPO]] (`src/domain/actions.js:1010`)
- [[supplierShip]] (`src/domain/actions.js:1018`)

## Seen on
- [[Tony Fan - Purchase Order]]
- [[Fenteng Lighting - Purchase Order]]
- [[Tony Fan - Shipments]]
- [[Fenteng Lighting - Shipments]]

Back to [[Rules Index]].
