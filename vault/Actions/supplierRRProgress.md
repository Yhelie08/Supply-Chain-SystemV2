---
title: supplierRRProgress
tags: [action, tony-fan]
module: Tony Fan
source: "src/domain/actions.js:1039"
---

# supplierRRProgress

Supplier portal: the supplier moves an approved replacement forward to In Production, then Shipped, and may update the dates. Shipped puts the replacement shipment In Transit. It never goes backwards.

**Source:** `src/domain/actions.js:1039`

## Offered on
- [[Tony Fan - Replacement Request]] (Tony Fan)
- [[Fenteng Lighting - Replacement Request]] (Fenteng Lighting)

## Rules
- [[SUP.OWN]]: A supplier can only act on records assigned to it. Each portal shows only its own supplier's lines.
- [[RR.PROGRESS]]: After approving, the supplier moves a replacement forward: Acknowledged, In Production, Shipped. It cannot go back, and Received comes only from the physical receipt.
- [[GEN.FIELD]]: A required field is missing.
- [[RR.DATES]]: Approving a replacement needs both an Expected Ship Date and an ETA.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
